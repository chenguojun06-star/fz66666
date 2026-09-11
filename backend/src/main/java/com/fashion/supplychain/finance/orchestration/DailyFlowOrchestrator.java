package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.dto.DailyFlowItem;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * D-245：每日经营流水编排器。
 * <p>
 * 把六类业务流水拉平成统一的 {@link DailyFlowItem}，按流水时间倒序返回，
 * 供前端「每日流水」大表展示与导出。
 * <p>
 * 数据源（全部带租户隔离，租户过滤由全局 TenantInterceptor 注入）：
 * <ul>
 *   <li>生产扫码 → t_scan_record（scanTime，仅 scanResult=success）</li>
 *   <li>物料采购 → t_material_purchase（createTime）</li>
 *   <li>物料入库 → t_material_inbound（inboundTime）</li>
 *   <li>物料出库 → t_material_outbound_log（outboundTime，<b>无金额字段</b>）</li>
 *   <li>成品入库 → t_product_warehousing（warehousingEndTime）</li>
 *   <li>成品出库 → t_product_outstock（createTime）</li>
 * </ul>
 * <p>
 * ⚠️ 各类独立 LIMIT {@value #PER_TYPE_LIMIT} 条：单类超量时只取最近的，
 * 避免全表扫描拖垮数据库（与 FinanceDashboardHelper 同策略）。
 */
@Slf4j
@Service
public class DailyFlowOrchestrator {

    /** 生产扫码 */
    public static final String T_SCAN = "SCAN";
    /** 物料采购 */
    public static final String T_PURCHASE = "PURCHASE";
    /** 物料入库 */
    public static final String T_MATERIAL_INBOUND = "MATERIAL_INBOUND";
    /** 物料出库 */
    public static final String T_MATERIAL_OUTBOUND = "MATERIAL_OUTBOUND";
    /** 成品入库 */
    public static final String T_PRODUCT_INBOUND = "PRODUCT_INBOUND";
    /** 成品出库 */
    public static final String T_PRODUCT_OUTSTOCK = "PRODUCT_OUTSTOCK";

    private static final int PER_TYPE_LIMIT = 2000;

    @Autowired private ScanRecordService scanRecordService;
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private MaterialInboundService materialInboundService;
    @Autowired private MaterialOutboundLogMapper materialOutboundLogMapper;
    @Autowired private ProductWarehousingService productWarehousingService;
    @Autowired private ProductOutstockService productOutstockService;

    /**
     * 查询每日经营流水。
     *
     * @param start 开始日期（含）
     * @param end   结束日期（含）
     * @param types 需要包含的业务类型；为空 / null 表示全部
     */
    public List<DailyFlowItem> query(LocalDate start, LocalDate end, Set<String> types) {
        Long tenantId = TenantAssert.requireTenantIdOrSuperAdmin();
        if (tenantId == null) {
            return Collections.emptyList();
        }
        LocalDateTime startDt = start.atStartOfDay();
        LocalDateTime endDt = end.atTime(LocalTime.MAX);

        List<DailyFlowItem> items = new ArrayList<>();
        if (isIncluded(types, T_SCAN)) items.addAll(queryScan(tenantId, startDt, endDt));
        if (isIncluded(types, T_PURCHASE)) items.addAll(queryPurchase(startDt, endDt));
        if (isIncluded(types, T_MATERIAL_INBOUND)) items.addAll(queryMaterialInbound(tenantId, startDt, endDt));
        if (isIncluded(types, T_MATERIAL_OUTBOUND)) items.addAll(queryMaterialOutbound(tenantId, startDt, endDt));
        if (isIncluded(types, T_PRODUCT_INBOUND)) items.addAll(queryProductInbound(startDt, endDt));
        if (isIncluded(types, T_PRODUCT_OUTSTOCK)) items.addAll(queryProductOutstock(tenantId, startDt, endDt));

        // 按流水时间倒序；无时间的排在最后
        items.sort(Comparator.comparing(
                DailyFlowItem::getFlowTime,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return items;
    }

    private boolean isIncluded(Set<String> types, String type) {
        return types == null || types.isEmpty() || types.contains(type);
    }

    // ==================== 生产扫码 ====================

    /**
     * D-363：系统编排阶段名（与 ProductionOrderScanRecordDomainService.SYSTEM_STAGE_NAMES 同口径）。
     * 这些「扫码记录」由系统在订单创建/进入采购阶段时自动写入（scanType=orchestration），
     * 并非真实生产扫码，也不产生金额。此前混入每日流水会同时污染笔数与数量合计。
     */
    private static final java.util.Set<String> SYSTEM_ORCHESTRATION_STAGES =
            new java.util.LinkedHashSet<>(java.util.Arrays.asList(
                    "下单", "采购", "物料采购", "面辅料采购", "备料", "到料",
                    "订单创建", "创建订单", "开单", "制单"));

    private List<DailyFlowItem> queryScan(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<>();
            qw.eq(ScanRecord::getTenantId, tenantId)
              .eq(ScanRecord::getScanResult, "success")
              // D-363：排除系统编排记录（新数据 scanType=orchestration；存量脏数据 scanType 可能
              // 仍是 production，故再按阶段名兜底过滤）。NULL 阶段/工序名视为真实记录保留。
              .ne(ScanRecord::getScanType, "orchestration")
              .and(w -> w.isNull(ScanRecord::getProgressStage)
                      .or().notIn(ScanRecord::getProgressStage, SYSTEM_ORCHESTRATION_STAGES))
              .and(w -> w.isNull(ScanRecord::getProcessName)
                      .or().notIn(ScanRecord::getProcessName, SYSTEM_ORCHESTRATION_STAGES))
              .ge(ScanRecord::getScanTime, start)
              .le(ScanRecord::getScanTime, end)
              .last("LIMIT " + PER_TYPE_LIMIT);
            return scanRecordService.list(qw).stream().map(r -> {
                DailyFlowItem item = new DailyFlowItem();
                item.setBizType(T_SCAN);
                item.setBizTypeLabel("生产扫码");
                item.setFlowNo(r.getOrderNo());
                item.setFlowTime(r.getScanTime());
                item.setStyleNo(r.getStyleNo());
                item.setOrderNo(r.getOrderNo());
                item.setProcessName(r.getProcessName());
                item.setQuantity(toBigDecimal(r.getQuantity()));
                item.setAmount(resolveScanAmount(r));
                item.setOperatorName(r.getOperatorName());
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[每日流水] 查询生产扫码失败", e);
            return Collections.emptyList();
        }
    }

    /** 扫码金额：优先结算金额，其次扫码成本，最后 单价×数量（与财务总览「工序产值」同口径） */
    private BigDecimal resolveScanAmount(ScanRecord r) {
        if (r.getTotalAmount() != null && r.getTotalAmount().compareTo(BigDecimal.ZERO) > 0) {
            return r.getTotalAmount();
        }
        if (r.getScanCost() != null && r.getScanCost().compareTo(BigDecimal.ZERO) > 0) {
            return r.getScanCost();
        }
        if (r.getUnitPrice() != null && r.getQuantity() != null) {
            return r.getUnitPrice().multiply(BigDecimal.valueOf(r.getQuantity()));
        }
        return null;
    }

    // ==================== 物料采购 ====================

    private List<DailyFlowItem> queryPurchase(LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<MaterialPurchase> qw = new LambdaQueryWrapper<>();
            qw.ge(MaterialPurchase::getCreateTime, start)
              .le(MaterialPurchase::getCreateTime, end)
              .last("LIMIT " + PER_TYPE_LIMIT);
            return materialPurchaseService.list(qw).stream().map(p -> {
                DailyFlowItem item = new DailyFlowItem();
                item.setBizType(T_PURCHASE);
                item.setBizTypeLabel("物料采购");
                item.setFlowNo(p.getPurchaseNo());
                item.setFlowTime(p.getCreateTime());
                item.setRelatedName(p.getSupplierName());
                item.setStyleNo(p.getStyleNo());
                item.setOrderNo(p.getOrderNo());
                item.setMaterialName(p.getMaterialName());
                item.setQuantity(p.getPurchaseQuantity());
                item.setAmount(p.getTotalAmount());
                item.setOperatorName(p.getCreatorName());
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[每日流水] 查询物料采购失败", e);
            return Collections.emptyList();
        }
    }

    // ==================== 物料入库 ====================

    private List<DailyFlowItem> queryMaterialInbound(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<MaterialInbound> qw = new LambdaQueryWrapper<>();
            qw.eq(MaterialInbound::getTenantId, tenantId)
              .ge(MaterialInbound::getInboundTime, start)
              .le(MaterialInbound::getInboundTime, end)
              .last("LIMIT " + PER_TYPE_LIMIT);
            return materialInboundService.list(qw).stream().map(m -> {
                DailyFlowItem item = new DailyFlowItem();
                item.setBizType(T_MATERIAL_INBOUND);
                item.setBizTypeLabel("物料入库");
                item.setFlowNo(m.getInboundNo());
                item.setFlowTime(m.getInboundTime());
                item.setRelatedName(m.getSupplierName());
                item.setMaterialName(m.getMaterialName());
                item.setQuantity(m.getInboundQuantity() != null
                        ? toBigDecimal(m.getInboundQuantity())
                        : toBigDecimal(m.getQuantity()));
                item.setAmount(m.getTotalAmount());
                item.setOperatorName(m.getOperatorName());
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[每日流水] 查询物料入库失败", e);
            return Collections.emptyList();
        }
    }

    // ==================== 物料出库 ====================

    /**
     * 物料出库：t_material_outbound_log 表上没有金额字段，amount 恒为 null。
     * 前端需显示「—」而不是 0，否则对账时会误以为该笔金额为 0。
     */
    private List<DailyFlowItem> queryMaterialOutbound(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<MaterialOutboundLog> qw = new LambdaQueryWrapper<>();
            qw.eq(MaterialOutboundLog::getTenantId, tenantId)
              .ge(MaterialOutboundLog::getOutboundTime, start)
              .le(MaterialOutboundLog::getOutboundTime, end)
              .last("LIMIT " + PER_TYPE_LIMIT);
            return materialOutboundLogMapper.selectList(qw).stream().map(m -> {
                DailyFlowItem item = new DailyFlowItem();
                item.setBizType(T_MATERIAL_OUTBOUND);
                item.setBizTypeLabel("物料出库");
                item.setFlowNo(m.getOutboundNo());
                item.setFlowTime(m.getOutboundTime());
                item.setRelatedName(m.getFactoryName());
                item.setStyleNo(m.getStyleNo());
                item.setOrderNo(m.getOrderNo());
                item.setMaterialName(m.getMaterialName());
                item.setQuantity(toBigDecimal(m.getQuantity()));
                item.setAmount(null);
                item.setOperatorName(m.getOperatorName());
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[每日流水] 查询物料出库失败", e);
            return Collections.emptyList();
        }
    }

    // ==================== 成品入库 ====================

    private List<DailyFlowItem> queryProductInbound(LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<ProductWarehousing> qw = new LambdaQueryWrapper<>();
            qw.ge(ProductWarehousing::getWarehousingEndTime, start)
              .le(ProductWarehousing::getWarehousingEndTime, end)
              .last("LIMIT " + PER_TYPE_LIMIT);
            return productWarehousingService.list(qw).stream().map(w -> {
                DailyFlowItem item = new DailyFlowItem();
                item.setBizType(T_PRODUCT_INBOUND);
                item.setBizTypeLabel("成品入库");
                item.setFlowNo(w.getWarehousingNo());
                item.setFlowTime(w.getWarehousingEndTime());
                item.setStyleNo(w.getStyleNo());
                item.setOrderNo(w.getOrderNo());
                item.setQuantity(toBigDecimal(w.getWarehousingQuantity()));
                item.setAmount(w.getTotalAmount());
                item.setOperatorName(w.getWarehousingOperatorName() != null
                        ? w.getWarehousingOperatorName()
                        : w.getCreatorName());
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[每日流水] 查询成品入库失败", e);
            return Collections.emptyList();
        }
    }

    // ==================== 成品出库 ====================

    private List<DailyFlowItem> queryProductOutstock(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<ProductOutstock> qw = new LambdaQueryWrapper<>();
            qw.eq(ProductOutstock::getTenantId, tenantId)
              .ge(ProductOutstock::getCreateTime, start)
              .le(ProductOutstock::getCreateTime, end)
              .last("LIMIT " + PER_TYPE_LIMIT);
            return productOutstockService.list(qw).stream().map(o -> {
                DailyFlowItem item = new DailyFlowItem();
                item.setBizType(T_PRODUCT_OUTSTOCK);
                item.setBizTypeLabel("成品出库");
                item.setFlowNo(o.getOutstockNo());
                item.setFlowTime(o.getCreateTime());
                item.setRelatedName(o.getCustomerName());
                item.setStyleNo(o.getStyleNo());
                item.setOrderNo(o.getOrderNo());
                item.setQuantity(toBigDecimal(o.getOutstockQuantity()));
                item.setAmount(o.getTotalAmount());
                item.setOperatorName(o.getOperatorName());
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[每日流水] 查询成品出库失败", e);
            return Collections.emptyList();
        }
    }

    // ==================== 工具 ====================

    private BigDecimal toBigDecimal(Integer value) {
        return value != null ? BigDecimal.valueOf(value) : null;
    }
}
