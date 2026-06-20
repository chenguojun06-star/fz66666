package com.fashion.supplychain.intelligence.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Memory Bank Markdown → 数据库迁移 Runner（ConPort 模式）。
 *
 * <p>启动时检查是否已迁移 memory-bank/*.md 到 t_memory_bank_entry，
 * 未迁移则自动导入（幂等）。
 *
 * <p>迁移策略：
 * <ul>
 *   <li>只迁移公共记忆（tenantId=0），租户私有记忆由运行时双写自动入库</li>
 *   <li>用 Redis key {@code memory_bank:migrated:0} 标记迁移完成</li>
 *   <li>Redis 不可用时降级到检查数据库条目数（>0 视为已迁移）</li>
 *   <li>迁移失败不阻断启动（try-catch 兜底）</li>
 * </ul>
 *
 * <p>文件 → category 映射：
 * <ul>
 *   <li>activeContext.md → active_context</li>
 *   <li>decisionLog.md → decision_log</li>
 *   <li>productContext.md → product_context</li>
 *   <li>progress.md → progress</li>
 * </ul>
 */
@Slf4j
@Component
@Order(50)
@Lazy(false)
public class MemoryBankMigrationRunner implements ApplicationRunner {

    private static final long PUBLIC_TENANT_ID = 0L;
    private static final String MIGRATED_REDIS_KEY = "memory_bank:migrated:0";

    /** 文件名 → category 映射（顺序保持稳定） */
    private static final Map<String, String> FILE_CATEGORY_MAP = new LinkedHashMap<>();
    static {
        FILE_CATEGORY_MAP.put("activeContext.md", "active_context");
        FILE_CATEGORY_MAP.put("decisionLog.md", "decision_log");
        FILE_CATEGORY_MAP.put("productContext.md", "product_context");
        FILE_CATEGORY_MAP.put("progress.md", "progress");
    }

    @Autowired(required = false)
    private MemoryBankDbService memoryBankDbService;

    @Autowired(required = false)
    private StringRedisTemplate redisTemplate;

    @Value("${fashion.memory-bank.dir:memory-bank}")
    private String memoryBankDir;

    @Override
    public void run(ApplicationArguments args) {
        if (memoryBankDbService == null) {
            log.debug("[MemoryBankMigration] MemoryBankDbService 未就绪，跳过迁移");
            return;
        }
        try {
            if (isMigrated()) {
                log.debug("[MemoryBankMigration] 已迁移，跳过");
                return;
            }
            Path dir = resolveMemoryBankDir();
            if (dir == null) {
                log.info("[MemoryBankMigration] memory-bank 目录不存在，跳过迁移（云端首次启动属正常）");
                markMigrated();
                return;
            }
            int total = 0;
            for (Map.Entry<String, String> entry : FILE_CATEGORY_MAP.entrySet()) {
                total += migrateFile(dir, entry.getKey(), entry.getValue());
            }
            markMigrated();
            log.info("[MemoryBankMigration] 迁移完成，共导入 {} 条目", total);
        } catch (Exception e) {
            log.warn("[MemoryBankMigration] 迁移失败（不阻断启动）: {}", e.getMessage());
        }
    }

    private boolean isMigrated() {
        if (redisTemplate != null) {
            try {
                Boolean exists = redisTemplate.hasKey(MIGRATED_REDIS_KEY);
                if (Boolean.TRUE.equals(exists)) return true;
            } catch (Exception ignored) {
            }
        }
        // Redis 不可用时降级检查数据库条目数
        try {
            return memoryBankDbService.getEntryCount(PUBLIC_TENANT_ID) > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private void markMigrated() {
        if (redisTemplate != null) {
            try {
                redisTemplate.opsForValue().set(MIGRATED_REDIS_KEY, "1");
            } catch (Exception ignored) {
            }
        }
    }

    private Path resolveMemoryBankDir() {
        String[] candidates = {memoryBankDir, "memory-bank", "../memory-bank", "/app/memory-bank"};
        for (String c : candidates) {
            if (c == null || c.isBlank()) continue;
            Path p = Paths.get(c);
            if (Files.isDirectory(p)) return p;
        }
        return null;
    }

    private int migrateFile(Path dir, String fileName, String category) {
        File file = dir.resolve(fileName).toFile();
        if (!file.exists() || !file.isFile()) {
            log.debug("[MemoryBankMigration] 文件不存在，跳过: {}", fileName);
            return 0;
        }
        try {
            String content = Files.readString(file.toPath(), StandardCharsets.UTF_8);
            if (content.isBlank()) return 0;
            String fallbackKey = fileName.replace(".md", "");
            int count = memoryBankDbService.importFromMarkdown(
                    PUBLIC_TENANT_ID, category, content, fallbackKey);
            log.info("[MemoryBankMigration] {} → {} 导入 {} 条目", fileName, category, count);
            return count;
        } catch (Exception e) {
            log.warn("[MemoryBankMigration] 读取 {} 失败: {}", fileName, e.getMessage());
            return 0;
        }
    }
}
