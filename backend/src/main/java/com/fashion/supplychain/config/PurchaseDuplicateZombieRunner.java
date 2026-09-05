package com.fashion.supplychain.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * D-307：无款关联采购单"重复需求僵尸行"存量清理（幂等，随启动执行，无差异时 0 行更新空转）。
 *
 * 背景：D-295 修复 confirm 部分结算越界前，同物料需求被生成多张采购单；
 * 其中一张采购完成后，重复的 PENDING 未领取行永久挂在手机/PC「待采购」，
 * 三端不一致、还可能被再次领取造成重复采购。写入端已堵（D-295 结算越界+购物车跨节点同步），
 * 本 Runner 只清存量：无款关联（无订单/样衣锚点）+ 未领取 + 同租户同物料同色同规格
 * 存在"更晚更新的已完成/进行中"他单 → 判定为重复需求，自动取消并留痕。
 *
 * 条件刻意收窄：只处理无款关联的指令/购物车来源行；有订单/样衣锚点的行不碰。
 * 回料确认过(return_confirmed=1)的行不碰（D-161 语义：已收料只是状态未走）。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PurchaseDuplicateZombieRunner implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        Thread worker = new Thread(() -> {
            try {
                Thread.sleep(15_000); // 避开启动高峰，等 Flyway/缓存预热完成
                closeDuplicates();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                log.warn("[PurchaseDuplicateZombie] 执行异常中断: {}", e.getMessage());
            }
        }, "purchase-duplicate-zombie");
        worker.setDaemon(true);
        worker.start();
    }

    private void closeDuplicates() {
        // 同物料+同色+同规格、无订单/样衣锚点、未领取、待采购的行，
        // 若存在更新时间更晚且已进入领取/到货/完成任一环节的他单 → 重复需求，自动取消留痕
        String sql = "UPDATE t_material_purchase mp "
                + "JOIN t_material_purchase done ON "
                + "  done.tenant_id = mp.tenant_id "
                + "  AND done.material_code = mp.material_code "
                + "  AND done.delete_flag = 0 "
                + "  AND COALESCE(done.color,'') = COALESCE(mp.color,'') "
                + "  AND COALESCE(done.specifications,'') = COALESCE(mp.specifications,'') "
                + "  AND done.id <> mp.id "
                + "  AND done.status IN ('received','partial','partial_arrival','awaiting_confirm','completed','procurement_completed') "
                + "  AND done.update_time > mp.update_time "
                + "SET mp.status = 'cancelled', "
                + "    mp.update_time = NOW(), "
                + "    mp.remark = CONCAT(COALESCE(mp.remark,''), '[系统] 同物料重复需求已在他单完成，自动关闭') "
                + "WHERE mp.status = 'pending' "
                + "  AND mp.delete_flag = 0 "
                + "  AND COALESCE(mp.receiver_id,'') = '' "
                + "  AND COALESCE(mp.order_id,'') = '' "
                + "  AND COALESCE(mp.pattern_production_id,'') = '' "
                + "  AND COALESCE(mp.return_confirmed,0) = 0";
        try {
            int rows = jdbcTemplate.update(sql);
            log.info("[PurchaseDuplicateZombie] 重复需求僵尸采购单自动关闭: {} 行", rows);
        } catch (Exception e) {
            log.warn("[PurchaseDuplicateZombie] 清理失败(不阻断启动): {}", e.getMessage());
        }
    }
}
