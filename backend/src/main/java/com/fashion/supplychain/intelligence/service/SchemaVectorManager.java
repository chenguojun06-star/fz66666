package com.fashion.supplychain.intelligence.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import jakarta.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Lazy
@Slf4j
public class SchemaVectorManager {

    @Autowired(required = false)
    private QdrantService qdrantService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final Map<String, TableSchema> schemaCache = new ConcurrentHashMap<>();
    private volatile boolean schemaLoaded = false;

    private static final String SCHEMA_VECTOR_PREFIX = "schema_";

    @lombok.Data
    public static class TableSchema {
        private String tableName;
        private String tableComment;
        private List<ColumnInfo> columns;

        public String toSearchableText() {
            StringBuilder sb = new StringBuilder();
            sb.append("表名：").append(tableName).append(" ");
            if (tableComment != null) {
                sb.append("说明：").append(tableComment).append(" ");
            }
            sb.append("字段：");
            for (ColumnInfo col : columns) {
                sb.append(col.getColumnName()).append("(").append(col.getColumnComment() != null ? col.getColumnComment() : col.getDataType()).append(") ");
            }
            return sb.toString().trim();
        }
    }

    @lombok.Data
    public static class ColumnInfo {
        private String columnName;
        private String dataType;
        private String columnComment;
        private String columnType;
    }

    @PostConstruct
    public void init() {
        try {
            loadSchemaFromDb();
        } catch (Exception e) {
            log.warn("[SchemaVectorManager] 初始加载Schema失败: {}", e.getMessage());
        }
        // 异步预向量化 Schema（不阻塞启动）
        new Thread(() -> {
            try {
                Thread.sleep(5000);
                log.info("[SchemaVectorManager] 启动5秒后开始异步预向量化Schema");
                int count = vectorizeAllSchemas();
                log.info("[SchemaVectorManager] 启动时预向量化完成，共 {} 张表", count);
            } catch (Exception e) {
                log.debug("[SchemaVectorManager] 启动时预向量化失败（可后续手动触发）: {}", e.getMessage());
            }
        }, "schema-vector-preheat").start();
    }

    public void loadSchemaFromDb() {
        try {
            // 批量查询所有表和字段（1次查询替代 N+1）
            List<Map<String, Object>> allData = jdbcTemplate.queryForList(
                    "SELECT t.TABLE_NAME, t.TABLE_COMMENT, " +
                            "c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_COMMENT, c.COLUMN_TYPE " +
                            "FROM information_schema.TABLES t " +
                            "LEFT JOIN information_schema.COLUMNS c " +
                            "  ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME " +
                            "WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME LIKE 't_%' " +
                            "ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION"
            );

            String currentTableName = null;
            TableSchema currentTs = null;

            for (Map<String, Object> row : allData) {
                String tableName = (String) row.get("TABLE_NAME");
                if (tableName == null) continue;

                if (!tableName.equals(currentTableName)) {
                    currentTableName = tableName;
                    currentTs = new TableSchema();
                    currentTs.setTableName(tableName);
                    currentTs.setTableComment((String) row.get("TABLE_COMMENT"));
                    currentTs.setColumns(new ArrayList<>());
                    schemaCache.put(tableName, currentTs);
                }

                if (currentTs != null && row.get("COLUMN_NAME") != null) {
                    ColumnInfo ci = new ColumnInfo();
                    ci.setColumnName((String) row.get("COLUMN_NAME"));
                    ci.setDataType((String) row.get("DATA_TYPE"));
                    ci.setColumnComment((String) row.get("COLUMN_COMMENT"));
                    ci.setColumnType((String) row.get("COLUMN_TYPE"));
                    currentTs.getColumns().add(ci);
                }
            }

            schemaLoaded = true;
            log.info("[SchemaVectorManager] Schema批量加载完成，共 {} 张表", schemaCache.size());
        } catch (Exception e) {
            log.error("[SchemaVectorManager] 加载Schema失败: {}", e.getMessage());
        }
    }

    public List<TableSchema> searchRelevantTables(String query, int topK) {
        if (query == null || query.isBlank()) return Collections.emptyList();

        List<TableSchema> keywordResults = searchByKeyword(query, topK * 3);

        if (qdrantService != null && qdrantService.isAvailable()) {
            try {
                List<QdrantService.ScoredPoint> vectorResults = qdrantService.search(0L, query, topK * 2);

                Set<String> schemaTableNames = new HashSet<>();
                for (QdrantService.ScoredPoint sp : vectorResults) {
                    if (sp.getPointId() != null && sp.getPointId().startsWith(SCHEMA_VECTOR_PREFIX)) {
                        String tableName = sp.getPointId().substring(SCHEMA_VECTOR_PREFIX.length());
                        schemaTableNames.add(tableName);
                    }
                }

                Set<String> combined = new LinkedHashSet<>();
                for (TableSchema ts : keywordResults) {
                    combined.add(ts.getTableName());
                }
                combined.addAll(schemaTableNames);

                List<TableSchema> result = new ArrayList<>();
                for (String tn : combined) {
                    TableSchema ts = schemaCache.get(tn);
                    if (ts != null) {
                        result.add(ts);
                        if (result.size() >= topK) break;
                    }
                }
                return result;
            } catch (Exception e) {
                log.debug("[SchemaVectorManager] 向量检索Schema失败，降级到关键词: {}", e.getMessage());
            }
        }

        return keywordResults.subList(0, Math.min(topK, keywordResults.size()));
    }

    private List<TableSchema> searchByKeyword(String query, int topK) {
        if (!schemaLoaded) loadSchemaFromDb();

        String lowerQuery = query.toLowerCase();
        List<TableSchemaWithScore> scored = new ArrayList<>();

        for (TableSchema ts : schemaCache.values()) {
            int score = 0;

            if (ts.getTableName().toLowerCase().contains(lowerQuery)) score += 50;
            if (ts.getTableComment() != null && ts.getTableComment().toLowerCase().contains(lowerQuery)) score += 40;

            if (ts.getColumns() != null) {
                for (ColumnInfo col : ts.getColumns()) {
                    if (col.getColumnName().toLowerCase().contains(lowerQuery)) score += 15;
                    if (col.getColumnComment() != null && col.getColumnComment().toLowerCase().contains(lowerQuery)) score += 20;
                }
            }

            if (score > 0) {
                scored.add(new TableSchemaWithScore(ts, score));
            }
        }

        scored.sort((a, b) -> Integer.compare(b.score, a.score));

        List<TableSchema> result = new ArrayList<>();
        for (int i = 0; i < Math.min(topK, scored.size()); i++) {
            result.add(scored.get(i).schema);
        }
        return result;
    }

    private static class TableSchemaWithScore {
        TableSchema schema;
        int score;
        TableSchemaWithScore(TableSchema schema, int score) {
            this.schema = schema;
            this.score = score;
        }
    }

    public int vectorizeAllSchemas() {
        if (qdrantService == null || !qdrantService.isAvailable()) {
            log.warn("[SchemaVectorManager] Qdrant不可用，跳过向量化");
            return 0;
        }

        if (!schemaLoaded) loadSchemaFromDb();

        int count = 0;
        for (TableSchema ts : schemaCache.values()) {
            try {
                String content = ts.toSearchableText();
                String pointId = SCHEMA_VECTOR_PREFIX + ts.getTableName();

                Map<String, Object> payload = new HashMap<>();
                payload.put("type", "schema");
                payload.put("table_name", ts.getTableName());
                payload.put("table_comment", ts.getTableComment() != null ? ts.getTableComment() : "");

                qdrantService.upsertVector(pointId, 0L, content, payload);
                count++;
            } catch (Exception e) {
                log.warn("[SchemaVectorManager] 向量化表 {} 失败: {}", ts.getTableName(), e.getMessage());
            }
        }
        log.info("[SchemaVectorManager] Schema向量化完成，共 {} 张表", count);
        return count;
    }

    public TableSchema getTableSchema(String tableName) {
        if (!schemaLoaded) loadSchemaFromDb();
        return schemaCache.get(tableName);
    }

    public Collection<TableSchema> getAllSchemas() {
        if (!schemaLoaded) loadSchemaFromDb();
        return schemaCache.values();
    }

    public String buildSchemaContext(String query, int maxTables) {
        List<TableSchema> tables = searchRelevantTables(query, maxTables);
        if (tables.isEmpty()) return "";

        int MAX_COLUMNS_PER_TABLE = 25;
        int MAX_CONTEXT_CHARS = 3000;

        StringBuilder sb = new StringBuilder();
        sb.append("相关表结构（用于生成SQL参考）：\n");
        for (int i = 0; i < tables.size(); i++) {
            TableSchema ts = tables.get(i);
            sb.append(String.format("%d. %s %s\n", i + 1, ts.getTableName(),
                    ts.getTableComment() != null ? "(" + ts.getTableComment() + ")" : ""));
            sb.append("   字段：");
            if (ts.getColumns() != null) {
                List<String> colStrs = new ArrayList<>();
                int colCount = 0;
                for (ColumnInfo col : ts.getColumns()) {
                    if (colCount >= MAX_COLUMNS_PER_TABLE) {
                        colStrs.add("...(共" + ts.getColumns().size() + "个字段)");
                        break;
                    }
                    String comment = col.getColumnComment() != null ? col.getColumnComment() : col.getDataType();
                    colStrs.add(col.getColumnName() + "(" + comment + ")");
                    colCount++;
                }
                sb.append(String.join(", ", colStrs));
            }
            sb.append("\n\n");

            // 防止上下文过大（影响LLM token消耗和响应速度）
            if (sb.length() > MAX_CONTEXT_CHARS) {
                sb.append("...(更多表结构省略)\n");
                break;
            }
        }
        return sb.toString();
    }
}
