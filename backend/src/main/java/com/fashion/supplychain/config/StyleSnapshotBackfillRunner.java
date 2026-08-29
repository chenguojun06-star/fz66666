package com.fashion.supplychain.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * D-217：存量数据一次性回填（幂等，随启动执行，无差异时 0 行更新空转）。
 * 背景：D-216 把商品编码改为无分隔直拼、D-215/D-217 打通款号变更联动，但存量行仍是
 * 老款号快照/带"-"老编码——用户要求"全部一起同步一致"，此处按 style_id 关联款式档案统一刷平：
 *  1) t_product_sku.sku_code        → 款号+颜色+尺码直拼（useSkuPrefix=1 保留 SKU- 前缀；手动编辑的不动）
 *  2) t_pattern_production          → 样衣生产单 style_no
 *  3) t_pattern_scan_record         → 样衣扫码记录 style_no
 *  4) t_scan_record(pattern)        → 扫码镜像 style_no + order_no（冗余款号），顺带补 style_id
 *  5) t_production_order            → 生产订单 style_no
 *  6) t_cutting_bundle              → 裁剪菲号 style_no
 * 每条独立 try/catch：单条失败只记日志，不阻断启动、不影响其余修复。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StyleSnapshotBackfillRunner implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        Thread worker = new Thread(() -> {
            try {
                Thread.sleep(15_000); // 避开启动高峰，等 Flyway/缓存预热完成
                backfill();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                log.warn("[StyleSnapshotBackfill] 执行异常中断: {}", e.getMessage());
            }
        }, "style-snapshot-backfill");
        worker.setDaemon(true);
        worker.start();
    }

    private void backfill() {
        // 1) SKU 编码统一为直拼格式（新格式与 old 不同才会被更新，天然幂等）
        exec("回填SKU编码",
                "UPDATE t_product_sku sku "
                + "JOIN t_style_info s ON sku.style_id = s.id AND sku.tenant_id = s.tenant_id "
                + "SET sku.sku_code = CONCAT(IF(s.use_sku_prefix = 1, 'SKU-', ''), IFNULL(s.style_no, ''), IFNULL(sku.color, ''), IFNULL(sku.size, '')) "
                + "WHERE (sku.manually_edited IS NULL OR sku.manually_edited <> 1) "
                + "AND sku.sku_code <> CONCAT(IF(s.use_sku_prefix = 1, 'SKU-', ''), IFNULL(s.style_no, ''), IFNULL(sku.color, ''), IFNULL(sku.size, ''))");

        // 2) 样衣生产单
        exec("回填样衣生产单款号",
                "UPDATE t_pattern_production pp JOIN t_style_info s ON pp.style_id = s.id AND pp.tenant_id = s.tenant_id "
                + "SET pp.style_no = s.style_no WHERE pp.delete_flag = 0 AND pp.style_no <> s.style_no");

        // 3) 样衣扫码记录
        exec("回填样衣扫码记录款号",
                "UPDATE t_pattern_scan_record r JOIN t_style_info s ON r.style_id = s.id AND r.tenant_id = s.tenant_id "
                + "SET r.style_no = s.style_no WHERE r.delete_flag = 0 AND r.style_no <> s.style_no");

        // 4) 扫码镜像（style_id 关联为主，order_no=老款号的存量行顺带补 style_id）
        exec("回填扫码镜像款号(style_id)",
                "UPDATE t_scan_record r JOIN t_style_info s ON r.style_id = s.id AND r.tenant_id = s.tenant_id "
                + "SET r.style_no = s.style_no, r.order_no = s.style_no "
                + "WHERE r.scan_type = 'pattern' AND (r.style_no <> s.style_no OR r.order_no <> s.style_no)");
        exec("回填扫码镜像款号(order_no补style_id)",
                "UPDATE t_scan_record r JOIN t_style_info s ON r.order_no = s.style_no AND r.tenant_id = s.tenant_id "
                + "SET r.style_no = s.style_no, r.order_no = s.style_no, r.style_id = s.id "
                + "WHERE r.scan_type = 'pattern' AND (r.style_id IS NULL OR r.style_id = '' OR r.style_no <> s.style_no)");

        // 5) 生产订单
        exec("回填生产订单款号",
                "UPDATE t_production_order o JOIN t_style_info s ON o.style_id = s.id AND o.tenant_id = s.tenant_id "
                + "SET o.style_no = s.style_no WHERE o.delete_flag = 0 AND o.style_no <> s.style_no");

        // 6) 裁剪菲号
        exec("回填裁剪菲号款号",
                "UPDATE t_cutting_bundle cb JOIN t_style_info s ON cb.style_id = s.id AND cb.tenant_id = s.tenant_id "
                + "SET cb.style_no = s.style_no WHERE cb.style_no <> s.style_no");

        // 6.5) D-224b：重建被截断的入库明细编码——明细行存有颜色/尺码时，
        // 编码与 款号+颜色+尺码 不符（塌缩成同款同色一个码）的行自动重建，后续校准步骤按码数拆回
        exec("重建入库明细编码",
                "UPDATE t_product_warehousing pw "
                + "SET pw.sku_code = CONCAT(TRIM(IFNULL(pw.style_no,'')), TRIM(IFNULL(pw.color,'')), TRIM(IFNULL(pw.size,''))) "
                + "WHERE pw.delete_flag = 0 AND pw.style_no IS NOT NULL AND pw.style_no <> '' "
                + "AND pw.color IS NOT NULL AND pw.color <> '' AND pw.size IS NOT NULL AND pw.size <> '' "
                + "AND pw.sku_code <> CONCAT(TRIM(IFNULL(pw.style_no,'')), TRIM(IFNULL(pw.color,'')), TRIM(IFNULL(pw.size,''))))");

        // 6.6) D-224c：SKU 编码归一化——行内存有颜色/尺码、且编码与直拼格式仅差分隔符（含 SKU- 前缀）的，
        // 统一为直拼格式，保证后续对账 JOIN（入库编码已直拼）能命中。手动编辑过的行不动。
        exec("归一化SKU编码分隔符",
                "UPDATE t_product_sku sku "
                + "SET sku.sku_code = CONCAT(IF(sku.sku_code LIKE 'SKU-%', 'SKU-', ''), "
                + "TRIM(IFNULL(sku.style_no,'')), TRIM(IFNULL(sku.color,'')), TRIM(IFNULL(sku.size,''))) "
                + "WHERE (sku.manually_edited IS NULL OR sku.manually_edited <> 1) "
                + "AND IFNULL(sku.color,'') <> '' AND IFNULL(sku.size,'') <> '' AND IFNULL(sku.style_no,'') <> '' "
                + "AND REPLACE(sku.sku_code, '-', '') <> CONCAT(IF(sku.sku_code LIKE 'SKU-%', 'SKU-', ''), "
                + "TRIM(IFNULL(sku.style_no,'')), TRIM(IFNULL(sku.color,'')), TRIM(IFNULL(sku.size,''))) "
                + "AND sku.sku_code <> CONCAT(IF(sku.sku_code LIKE 'SKU-%', 'SKU-', ''), "
                + "TRIM(IFNULL(sku.style_no,'')), TRIM(IFNULL(sku.color,'')), TRIM(IFNULL(sku.size,'')))");

        // 7) D-224：成品库存对账自愈——SKU 库存以成品入库单合计校准（入库成功但 SKU 库存没同步的存量修复）
        exec("成品库存对账校准",
                "UPDATE t_product_sku sku "
                + "JOIN (SELECT sku_code, tenant_id, SUM(IFNULL(warehousing_quantity,0)) qty "
                + "      FROM t_product_warehousing WHERE delete_flag = 0 GROUP BY sku_code, tenant_id) w "
                + "ON w.sku_code = sku.sku_code AND w.tenant_id = sku.tenant_id "
                + "SET sku.stock_quantity = w.qty WHERE sku.stock_quantity <> w.qty");

        // 8) D-224c：入库记录有但 SKU 行缺失的自动补建——直接用入库明细行内的款号/颜色/尺码组装
        // （不再依赖编码里的"-"分隔符：D-224b 已把入库编码重建为直拼格式，旧版按横线数>=2 判断的条件永远不成立，
        //  导致 BR26X1K0651A 这类款入库明细存在但 SKU 行永远补不出来、成品仓库列表不显示）
        // 约束防护：style_id NOT NULL → INNER JOIN 款式档案（档案缺失的跳过不建）；
        // uk_sku_code 全局唯一 → 编码任意租户已存在则跳过；uk_style_color_size → 同款同色同码已有行则跳过
        exec("补建缺失成品SKU",
                "INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, stock_quantity, status, tenant_id, create_time, update_time) "
                + "SELECT w.sku_code, MAX(s.id), w.style_no, w.color, w.size, w.qty, 'ENABLED', w.tenant_id, NOW(), NOW() "
                + "FROM (SELECT sku_code, tenant_id, MAX(style_no) style_no, MAX(color) color, MAX(size) size, "
                + "             SUM(IFNULL(warehousing_quantity,0)) qty "
                + "      FROM t_product_warehousing WHERE delete_flag = 0 "
                + "        AND IFNULL(style_no,'') <> '' AND IFNULL(color,'') <> '' AND IFNULL(size,'') <> '' "
                + "        AND IFNULL(sku_code,'') <> '' "
                + "      GROUP BY sku_code, tenant_id) w "
                + "JOIN t_style_info s ON s.style_no = w.style_no AND s.tenant_id = w.tenant_id "
                + "WHERE NOT EXISTS (SELECT 1 FROM t_product_sku e WHERE e.sku_code = w.sku_code) "
                + "AND NOT EXISTS (SELECT 1 FROM t_product_sku e2 WHERE e2.style_id = s.id "
                + "AND e2.color = w.color AND e2.size = w.size AND e2.tenant_id = w.tenant_id) "
                + "GROUP BY w.sku_code, w.tenant_id, w.style_no, w.color, w.size, w.qty");

        log.info("[StyleSnapshotBackfill] 存量款号/编码一致性回填完成");
    }

    private void exec(String label, String sql) {
        try {
            int rows = jdbcTemplate.update(sql);
            log.info("[StyleSnapshotBackfill] {}: 更新 {} 行", label, rows);
        } catch (Exception e) {
            log.warn("[StyleSnapshotBackfill] {} 失败（不阻断）: {}", label, e.getMessage());
        }
    }
}
