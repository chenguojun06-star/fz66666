package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 模板库表迁移器
 * 负责: t_template_library 及种子数据
 */
@Component
@Slf4j
public class TemplateTableMigrator {

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    public void initialize() {
        ensureTemplateLibraryTable();
    }

    private void ensureTemplateLibraryTable() {
        String createTable = "CREATE TABLE IF NOT EXISTS t_template_library (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '模板ID'," +
                "template_type VARCHAR(20) NOT NULL COMMENT '模板类型：bom/size/process/progress'," +
                "template_key VARCHAR(50) NOT NULL COMMENT '模板标识'," +
                "template_name VARCHAR(100) NOT NULL COMMENT '模板名称'," +
                "source_style_no VARCHAR(50) COMMENT '来源款号'," +
                "template_content LONGTEXT NOT NULL COMMENT '模板内容JSON'," +
                "locked INT NOT NULL DEFAULT 1 COMMENT '是否锁定(0:可编辑,1:已锁定)'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "UNIQUE KEY uk_type_key (template_type, template_key)," +
                "INDEX idx_type (template_type)," +
                "INDEX idx_source_style_no (source_style_no)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板库'";

        dbHelper.execSilently(createTable);

        if (!dbHelper.columnExists("t_template_library", "locked")) {
            dbHelper.execSilently("ALTER TABLE t_template_library ADD COLUMN locked INT NOT NULL DEFAULT 1 COMMENT '是否锁定(0:可编辑,1:已锁定)'");
        }

        // 工序模板
        seedTemplateIfAbsent("process", "basic", "基础工序",
                "{\"steps\":[{\"processCode\":\"01\",\"processName\":\"裁剪\",\"machineType\":\"\"},{\"processCode\":\"02\",\"processName\":\"缝制\",\"machineType\":\"\"},{\"processCode\":\"03\",\"processName\":\"整烫\",\"machineType\":\"\"},{\"processCode\":\"04\",\"processName\":\"检验\",\"machineType\":\"\"},{\"processCode\":\"05\",\"processName\":\"包装\",\"machineType\":\"\"}]}");
        seedTemplateIfAbsent("process", "knit-top", "针织上衣(常用)",
                "{\"steps\":[{\"processCode\":\"10\",\"processName\":\"上领\",\"machineType\":\"平车\"},{\"processCode\":\"11\",\"processName\":\"上袖\",\"machineType\":\"平车\"},{\"processCode\":\"12\",\"processName\":\"侧缝\",\"machineType\":\"拷边\"},{\"processCode\":\"13\",\"processName\":\"下摆\",\"machineType\":\"绷缝\"},{\"processCode\":\"14\",\"processName\":\"袖口\",\"machineType\":\"绷缝\"}]}");
        seedTemplateIfAbsent("process", "woven-shirt", "梭织衬衫(常用)",
                "{\"steps\":[{\"processCode\":\"20\",\"processName\":\"做领\",\"machineType\":\"平车\"},{\"processCode\":\"21\",\"processName\":\"上领\",\"machineType\":\"平车\"},{\"processCode\":\"22\",\"processName\":\"做门襟\",\"machineType\":\"平车\"},{\"processCode\":\"23\",\"processName\":\"上袖\",\"machineType\":\"平车\"},{\"processCode\":\"24\",\"processName\":\"锁眼\",\"machineType\":\"锁眼机\"},{\"processCode\":\"25\",\"processName\":\"钉扣\",\"machineType\":\"钉扣机\"}]}");

        // 尺码模板
        seedTemplateIfAbsent("size", "top-basic", "上衣常规(国际参考)",
                "{\"sizes\":[\"S\",\"M\",\"L\",\"XL\",\"XXL\"],\"parts\":[{\"partName\":\"衣长\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":66,\"M\":68,\"L\":70,\"XL\":72,\"XXL\":74}},{\"partName\":\"胸围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":96,\"M\":100,\"L\":104,\"XL\":108,\"XXL\":112}},{\"partName\":\"肩宽\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":41,\"M\":42.5,\"L\":44,\"XL\":45.5,\"XXL\":47}},{\"partName\":\"袖长\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":60,\"M\":61,\"L\":62,\"XL\":63,\"XXL\":64}},{\"partName\":\"袖口\",\"measureMethod\":\"平量\",\"tolerance\":0.3,\"values\":{\"S\":20,\"M\":21,\"L\":22,\"XL\":23,\"XXL\":24}},{\"partName\":\"下摆围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":92,\"M\":96,\"L\":100,\"XL\":104,\"XXL\":108}}]}");
        seedTemplateIfAbsent("size", "pants-basic", "裤装常规(国际参考)",
                "{\"sizes\":[\"28\",\"29\",\"30\",\"31\",\"32\",\"33\",\"34\"],\"parts\":[{\"partName\":\"裤长\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"28\":98,\"29\":100,\"30\":102,\"31\":104,\"32\":106,\"33\":108,\"34\":110}},{\"partName\":\"腰围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"28\":72,\"29\":74.5,\"30\":77,\"31\":79.5,\"32\":82,\"33\":84.5,\"34\":87}},{\"partName\":\"臀围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"28\":94,\"29\":96.5,\"30\":99,\"31\":101.5,\"32\":104,\"33\":106.5,\"34\":109}},{\"partName\":\"大腿围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"28\":56,\"29\":57,\"30\":58,\"31\":59,\"32\":60,\"33\":61,\"34\":62}},{\"partName\":\"脚口\",\"measureMethod\":\"平量\",\"tolerance\":0.3,\"values\":{\"28\":34,\"29\":35,\"30\":36,\"31\":37,\"32\":38,\"33\":39,\"34\":40}},{\"partName\":\"前浪\",\"measureMethod\":\"平量\",\"tolerance\":0.3,\"values\":{\"28\":25,\"29\":25.5,\"30\":26,\"31\":26.5,\"32\":27,\"33\":27.5,\"34\":28}},{\"partName\":\"后浪\",\"measureMethod\":\"平量\",\"tolerance\":0.3,\"values\":{\"28\":35,\"29\":35.5,\"30\":36,\"31\":36.5,\"32\":37,\"33\":37.5,\"34\":38}}]}");
        seedTemplateIfAbsent("size", "kids-basic", "童装常规(国际参考)",
                "{\"sizes\":[\"90\",\"100\",\"110\",\"120\",\"130\",\"140\",\"150\"],\"parts\":[{\"partName\":\"衣长\",\"measureMethod\":\"平量\",\"tolerance\":0.7,\"values\":{\"90\":38,\"100\":42,\"110\":46,\"120\":50,\"130\":54,\"140\":58,\"150\":62}},{\"partName\":\"胸围\",\"measureMethod\":\"平量\",\"tolerance\":0.7,\"values\":{\"90\":62,\"100\":66,\"110\":70,\"120\":74,\"130\":78,\"140\":82,\"150\":86}},{\"partName\":\"肩宽\",\"measureMethod\":\"平量\",\"tolerance\":0.7,\"values\":{\"90\":26,\"100\":27.5,\"110\":29,\"120\":30.5,\"130\":32,\"140\":33.5,\"150\":35}},{\"partName\":\"袖长\",\"measureMethod\":\"平量\",\"tolerance\":0.7,\"values\":{\"90\":32,\"100\":35,\"110\":38,\"120\":41,\"130\":44,\"140\":47,\"150\":50}}]}");

        // BOM模板
        seedTemplateIfAbsent("bom", "market-basic", "通用面辅料模板(市面常用)",
                "{\"rows\":[{\"codePrefix\":\"FAB\",\"materialType\":\"fabricA\",\"materialName\":\"主面料\",\"color\":\"\",\"specification\":\"150\",\"unit\":\"米\",\"usageAmount\":1.25,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"LIN\",\"materialType\":\"liningA\",\"materialName\":\"里料\",\"color\":\"\",\"specification\":\"150\",\"unit\":\"米\",\"usageAmount\":0.85,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"POC\",\"materialType\":\"liningB\",\"materialName\":\"口袋布\",\"color\":\"\",\"specification\":\"90\",\"unit\":\"米\",\"usageAmount\":0.15,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"INT\",\"materialType\":\"liningC\",\"materialName\":\"衬布/粘合衬\",\"color\":\"\",\"specification\":\"112\",\"unit\":\"米\",\"usageAmount\":0.35,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"ZIP\",\"materialType\":\"accessoryA\",\"materialName\":\"拉链\",\"color\":\"\",\"specification\":\"18\",\"unit\":\"条\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"BTN\",\"materialType\":\"accessoryB\",\"materialName\":\"纽扣\",\"color\":\"\",\"specification\":\"1.5\",\"unit\":\"颗\",\"usageAmount\":6,\"lossRate\":2,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"THR\",\"materialType\":\"accessoryC\",\"materialName\":\"缝纫线\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"卷\",\"usageAmount\":0.02,\"lossRate\":5,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"LBL\",\"materialType\":\"accessoryD\",\"materialName\":\"主唛/洗唛/尺码标\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"套\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"PKG\",\"materialType\":\"accessoryE\",\"materialName\":\"包装袋\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"个\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"}]}");
        seedTemplateIfAbsent("bom", "market-knit", "通用面辅料模板(针织/卫衣)",
                "{\"rows\":[{\"codePrefix\":\"FAB\",\"materialType\":\"fabricA\",\"materialName\":\"主面料(针织)\",\"color\":\"\",\"specification\":\"180\",\"unit\":\"米\",\"usageAmount\":1.15,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"RIB\",\"materialType\":\"fabricB\",\"materialName\":\"罗纹(领口/袖口/下摆)\",\"color\":\"\",\"specification\":\"100\",\"unit\":\"米\",\"usageAmount\":0.25,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"THR\",\"materialType\":\"accessoryA\",\"materialName\":\"缝纫线\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"卷\",\"usageAmount\":0.02,\"lossRate\":5,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"LBL\",\"materialType\":\"accessoryB\",\"materialName\":\"主唛/洗唛/尺码标\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"套\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"PKG\",\"materialType\":\"accessoryC\",\"materialName\":\"包装袋\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"个\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"}]}");
        seedTemplateIfAbsent("bom", "market-jacket", "通用面辅料模板(外套/夹克)",
                "{\"rows\":[{\"codePrefix\":\"FAB\",\"materialType\":\"fabricA\",\"materialName\":\"主面料(外套)\",\"color\":\"\",\"specification\":\"260\",\"unit\":\"米\",\"usageAmount\":1.8,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"LIN\",\"materialType\":\"liningA\",\"materialName\":\"里料\",\"color\":\"\",\"specification\":\"150\",\"unit\":\"米\",\"usageAmount\":1.4,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"INT\",\"materialType\":\"liningB\",\"materialName\":\"衬布/粘合衬\",\"color\":\"\",\"specification\":\"112\",\"unit\":\"米\",\"usageAmount\":0.6,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"ZIP\",\"materialType\":\"accessoryA\",\"materialName\":\"拉链\",\"color\":\"\",\"specification\":\"55\",\"unit\":\"条\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"BTN\",\"materialType\":\"accessoryB\",\"materialName\":\"纽扣\",\"color\":\"\",\"specification\":\"2.0\",\"unit\":\"颗\",\"usageAmount\":4,\"lossRate\":2,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"ELT\",\"materialType\":\"accessoryC\",\"materialName\":\"松紧带\",\"color\":\"\",\"specification\":\"2.0\",\"unit\":\"米\",\"usageAmount\":0.6,\"lossRate\":2,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"THR\",\"materialType\":\"accessoryD\",\"materialName\":\"缝纫线\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"卷\",\"usageAmount\":0.03,\"lossRate\":5,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"PKG\",\"materialType\":\"accessoryE\",\"materialName\":\"包装袋\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"个\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"}]}");

        // 进度模板
        seedTemplateIfAbsent("progress", "default", "默认生产进度",
                "{\"nodes\":[{\"name\":\"裁剪\"},{\"name\":\"缝制\"},{\"name\":\"整烫\"},{\"name\":\"检验\"},{\"name\":\"包装\"}]}");
    }

    private void seedTemplateIfAbsent(String templateType, String templateKey, String templateName, String templateContent) {
        JdbcTemplate jdbc = dbHelper.getJdbcTemplate();
        try {
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM t_template_library WHERE template_type = ? AND template_key = ?",
                    Integer.class, templateType, templateKey);
            if (count != null && count > 0) return;
        } catch (Exception e) {
            log.warn("Failed to check template exists: templateType={}, templateKey={}, err={}", templateType, templateKey, e.getMessage());
            return;
        }

        try {
            String id = java.util.UUID.randomUUID().toString();
            jdbc.update(
                    "INSERT IGNORE INTO t_template_library (id, template_type, template_key, template_name, source_style_no, template_content) VALUES (?,?,?,?,?,?)",
                    id, templateType, templateKey, templateName, null, templateContent);
        } catch (Exception e) {
            log.warn("Failed to seed template: templateType={}, templateKey={}, err={}", templateType, templateKey, e.getMessage());
        }
    }
}
