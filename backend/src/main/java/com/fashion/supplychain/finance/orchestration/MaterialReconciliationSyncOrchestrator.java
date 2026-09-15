package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 物料对账同步编排器
 *
 * 职责：协调production模块的入库、采购服务与finance模块的对账服务
 * 实现跨模块的数据同步和事务管理
 */
@Slf4j
@Service
public class MaterialReconciliationSyncOrchestrator {

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private MaterialInboundService materialInboundService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private DistributedLockService distributedLockService;

    /**
     * 从入库记录同步到物料对账
     *
     * @param inbound 入库记录
     * @param purchase 采购单
     * @return 对账记录ID
     */
    // D-361d：改 REQUIRES_NEW 独立事务——样衣采购（无订单号）等场景同步失败会把你这个
    // 方法所在的入库主事务标记 rollback-only，导致入库整体回滚报
    // "Transaction rolled back because it has been marked as rollback-only"。
    // 同步是对账回流（辅助），失败只回滚同步自身，入库主流程必须成功。
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public String syncFromInbound(MaterialInbound inbound, MaterialPurchase purchase) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (inbound == null) {
            throw new RuntimeException("入库记录不能为空");
        }

        if (purchase == null) {
            throw new RuntimeException("采购单不能为空");
        }

        // 用户口径（物料去向按用户选择分账）：
        //   「入库到仓库」→ 面料进仓库，账走「物料仓库/出入库流水」记账，不再回流生成物料对账；
        //   「直接使用(直拨)」→ 才走物料对账（由 confirmComplete 的 upsert 生成）。
        // 本方法是入库流程专用，凡走到这里 = 已是入库到仓库，因此一律不生成物料对账。
        // 保留历史已存在的存量对账不变，仅停止新入库的自动回流。
        log.info("物料入库由仓库流水记账，不再生成物料对账: inboundNo={}, purchaseNo={}",
                inbound.getInboundNo(), purchase.getPurchaseNo());
        return null;
    }

    /**
     * 根据采购单ID同步所有入库记录
     *
     * @param purchaseId 采购单ID
     * @return 同步记录数
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncFromPurchase(String purchaseId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (purchaseId == null || purchaseId.trim().isEmpty()) {
            throw new RuntimeException("采购单ID不能为空");
        }

        // 1. 查询采购单
        MaterialPurchase purchase = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .one();
        if (purchase == null) {
            throw new RuntimeException("采购单不存在: " + purchaseId);
        }

        // 2. 查询该采购单的所有入库记录
        List<MaterialInbound> inboundList = materialInboundService.listByPurchaseId(purchaseId);

        if (inboundList.isEmpty()) {
            log.warn("采购单 {} 没有入库记录，无法同步", purchaseId);
            return 0;
        }

        // 3. 逐条同步
        int syncCount = 0;
        for (MaterialInbound inbound : inboundList) {
            try {
                if (!isInboundSynced(inbound.getId())) {
                    syncFromInbound(inbound, purchase);
                    syncCount++;
                }
            } catch (Exception e) {
                log.error("同步入库记录失败: inboundId={}", inbound.getId(), e);
                // 继续处理下一条
            }
        }

        log.info("采购单 {} 同步完成，共同步 {} 条对账记录", purchaseId, syncCount);
        return syncCount;
    }

    /**
     * 根据时间范围同步入库记录
     *
     * @param startDate 开始日期（yyyy-MM-dd）
     * @param endDate 结束日期（yyyy-MM-dd）
     * @return 同步记录数
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncByDateRange(String startDate, String endDate) {
        TenantAssert.assertTenantContext();
        // 1. 查询指定时间范围的入库记录
        LambdaQueryWrapper<MaterialInbound> wrapper = new LambdaQueryWrapper<>();

        LocalDateTime startDateTime = LocalDate.parse(startDate, DateTimeFormatter.ofPattern("yyyy-MM-dd")).atStartOfDay();
        LocalDateTime endDateTime = LocalDate.parse(endDate, DateTimeFormatter.ofPattern("yyyy-MM-dd")).atTime(23, 59, 59);

        wrapper.between(MaterialInbound::getInboundTime, startDateTime, endDateTime);
        wrapper.isNotNull(MaterialInbound::getPurchaseId);

        List<MaterialInbound> inboundList = materialInboundService.list(wrapper);

        if (inboundList.isEmpty()) {
            log.info("时间范围 {} 至 {} 没有入库记录", startDate, endDate);
            return 0;
        }

        // 2. 批量预加载采购单（消除 N+1 查询）
        java.util.Set<String> purchaseIds = inboundList.stream()
                .map(MaterialInbound::getPurchaseId)
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        java.util.Map<String, MaterialPurchase> purchaseMap = purchaseIds.isEmpty()
                ? java.util.Collections.emptyMap()
                : materialPurchaseService.listByIds(purchaseIds).stream()
                        .collect(java.util.stream.Collectors.toMap(MaterialPurchase::getId, p -> p, (a, b) -> a));

        int syncCount = 0;
        for (MaterialInbound inbound : inboundList) {
            try {
                if (isInboundSynced(inbound.getId())) {
                    continue;
                }

                MaterialPurchase purchase = purchaseMap.get(inbound.getPurchaseId());
                if (purchase == null) {
                    log.warn("入库记录 {} 的采购单 {} 不存在", inbound.getInboundNo(), inbound.getPurchaseId());
                    continue;
                }

                syncFromInbound(inbound, purchase);
                syncCount++;
            } catch (Exception e) {
                log.error("同步入库记录失败: inboundId={}", inbound.getId(), e);
            }
        }

        log.info("时间范围同步完成: {} 至 {}，共同步 {} 条对账记录", startDate, endDate, syncCount);
        return syncCount;
    }

    /**
     * 检查入库记录是否已同步
     *
     * @param inboundId 入库记录ID
     * @return 是否已同步
     */
    public boolean isInboundSynced(String inboundId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (inboundId == null || inboundId.trim().isEmpty()) {
            return false;
        }

        // 通过remark字段判断（包含入库单号）
        MaterialInbound inbound = materialInboundService.lambdaQuery()
                .eq(MaterialInbound::getId, inboundId)
                .eq(MaterialInbound::getTenantId, tenantId)
                .one();
        if (inbound == null) {
            return false;
        }

        LambdaQueryWrapper<MaterialReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialReconciliation::getPurchaseId, inbound.getPurchaseId())
               .eq(MaterialReconciliation::getTenantId, tenantId)
               .eq(MaterialReconciliation::getMaterialCode, inbound.getMaterialCode())
               .like(MaterialReconciliation::getRemark, inbound.getInboundNo());

        return materialReconciliationService.count(wrapper) > 0;
    }

    /**
     * 生成对账单号
     * 格式：MR+YYYYMM+4位序号（如：MR2026010001）
     */
    private String generateReconciliationNo() {
        return distributedLockService.executeWithStrictLock(
                "materialReconciliation:generateNo", 5, TimeUnit.SECONDS,
                this::doGenerateReconciliationNo);
    }

    private String doGenerateReconciliationNo() {
        Long tenantId = UserContext.tenantId();
        String monthPrefix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMM"));
        String prefix = "MR" + monthPrefix;

        // 查询当月最大序号
        LambdaQueryWrapper<MaterialReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.likeRight(MaterialReconciliation::getReconciliationNo, prefix)
               .eq(MaterialReconciliation::getTenantId, tenantId)
               .orderByDesc(MaterialReconciliation::getReconciliationNo)
               .last("LIMIT 1");

        MaterialReconciliation last = materialReconciliationService.getOne(wrapper);

        int sequence = 1;
        if (last != null && last.getReconciliationNo() != null) {
            String lastNo = last.getReconciliationNo();
            String lastSequence = lastNo.substring(lastNo.length() - 4);
            try {
                sequence = Integer.parseInt(lastSequence) + 1;
            } catch (NumberFormatException e) {
                log.warn("解析对账单号序号失败: {}", lastNo, e);
            }
        }

        return String.format("%s%04d", prefix, sequence);
    }
}
