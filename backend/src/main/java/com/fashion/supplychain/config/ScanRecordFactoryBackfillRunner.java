package com.fashion.supplychain.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * D-300：外发扫码记录存量回填（幂等，随启动执行，无差异时 0 行更新空转）。
 * 背景：生产扫码落库时 factory_id 取自登录账号，外发工厂工人账号多未绑定工厂 → 写 NULL，
 * 财务「外部工厂扫码」明细永远为空；delegate_target_* 三字段此前全链路无写入。
 * 修复后新数据写入端已兜底回填订单承做工厂；本 Runner 把存量记录按订单承做工厂刷平
 * （仅外发厂 OUTSOURCE，避免把内部厂记录误标为外发）。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ScanRecordFactoryBackfillRunner implements ApplicationRunner {

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
                log.warn("[ScanRecordFactoryBackfill] 执行异常中断: {}", e.getMessage());
            }
        }, "scan-record-factory-backfill");
        worker.setDaemon(true);
        worker.start();
    }

    private void backfill() {
        // 存量扫码记录按订单承做工厂回填 factory_id + 委托工厂三件套（仅外发厂订单；factory_id 非 NULL 的天然跳过，幂等）
        exec("回填外发扫码记录承做工厂",
                "UPDATE t_scan_record sr "
                + "JOIN t_production_order o ON sr.order_id = o.id "
                + "SET sr.factory_id = o.factory_id, "
                + "    sr.delegate_target_type = 'FACTORY', "
                + "    sr.delegate_target_id = o.factory_id, "
                + "    sr.delegate_target_name = o.factory_name "
                + "WHERE sr.factory_id IS NULL "
                + "AND o.factory_id IS NOT NULL AND o.delete_flag = 0 "
                + "AND o.factory_id IN (SELECT id FROM t_factory WHERE factory_type = 'OUTSOURCE' AND delete_flag = 0)");
    }

    private void exec(String name, String sql) {
        try {
            int rows = jdbcTemplate.update(sql);
            log.info("[ScanRecordFactoryBackfill] {}: {} 行", name, rows);
        } catch (Exception e) {
            log.warn("[ScanRecordFactoryBackfill] {} 失败(不阻断启动): {}", name, e.getMessage());
        }
    }
}
