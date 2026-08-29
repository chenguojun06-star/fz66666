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
