package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * 面辅料领取记录编排层
 * 负责领取申请、审核流程、财务核算的业务编排
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MaterialPickupOrchestrator {

    private final MaterialPickupRecordMapper pickupMapper;
    private final ProductionOrderService productionOrderService;
    private final MaterialStockService materialStockService;

    /** 简易序号（进程级，重启归零，仅用于单号生成去重） */
    private final AtomicInteger seqCounter = new AtomicInteger(0);

    // =================== 查询 ===================

    /**
     * 分页查询领取记录
     *
     * @param params 查询参数：page, pageSize, keyword, pickupType,
     *               auditStatus, financeStatus, orderNo, styleNo
     */
    public IPage<MaterialPickupRecord> listPage(Map<String, Object> params) {
        int page     = Integer.parseInt(String.valueOf(params.getOrDefault("page",     "1")));
        int pageSize = Integer.parseInt(String.valueOf(params.getOrDefault("pageSize", "20")));

        String keyword       = strOf(params.get("keyword"));
        String pickupType    = strOf(params.get("pickupType"));
        String auditStatus   = strOf(params.get("auditStatus"));
        String financeStatus = strOf(params.get("financeStatus"));
        String orderNo       = strOf(params.get("orderNo"));
        String styleNo       = strOf(params.get("styleNo"));

        Long tenantId = currentTenantId();

        LambdaQueryWrapper<MaterialPickupRecord> wrapper = new LambdaQueryWrapper<MaterialPickupRecord>()
                .eq(MaterialPickupRecord::getDeleteFlag, 0)
                .eq(tenantId != null, MaterialPickupRecord::getTenantId, tenantId != null ? String.valueOf(tenantId) : null)
                .eq(StringUtils.hasText(pickupType),    MaterialPickupRecord::getPickupType,    pickupType)
                .eq(StringUtils.hasText(auditStatus),   MaterialPickupRecord::getAuditStatus,   auditStatus)
                .eq(StringUtils.hasText(financeStatus), MaterialPickupRecord::getFinanceStatus, financeStatus)
                .like(StringUtils.hasText(orderNo),     MaterialPickupRecord::getOrderNo,       orderNo)
                .like(StringUtils.hasText(styleNo),     MaterialPickupRecord::getStyleNo,       styleNo)
                .and(StringUtils.hasText(keyword), wr -> wr
                        .like(MaterialPickupRecord::getPickupNo,    keyword)
                        .or().like(MaterialPickupRecord::getMaterialCode, keyword)
                        .or().like(MaterialPickupRecord::getMaterialName, keyword)
                        .or().like(MaterialPickupRecord::getPickerName,   keyword))
                .orderByDesc(MaterialPickupRecord::getCreateTime);

        IPage<MaterialPickupRecord> result = pickupMapper.selectPage(new Page<>(page, pageSize), wrapper);

        // 富化生产方信息：按 orderNo 批量查生产订单
        List<MaterialPickupRecord> records = result.getRecords();
        Set<String> orderNos = records.stream()
                .map(MaterialPickupRecord::getOrderNo)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (!orderNos.isEmpty()) {
            List<ProductionOrder> orders = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .in(ProductionOrder::getOrderNo, orderNos)
                            .select(ProductionOrder::getOrderNo,
                                    ProductionOrder::getFactoryName,
                                    ProductionOrder::getFactoryType,
                                    ProductionOrder::getOrderBizType));
            Map<String, String> nameMap    = new HashMap<>();
            Map<String, String> typeMap    = new HashMap<>();
            Map<String, String> bizTypeMap = new HashMap<>();
            for (ProductionOrder o : orders) {
                nameMap.put(o.getOrderNo(), o.getFactoryName());
                typeMap.put(o.getOrderNo(), o.getFactoryType());
                bizTypeMap.put(o.getOrderNo(), o.getOrderBizType());
            }
            for (MaterialPickupRecord r : records) {
                if (StringUtils.hasText(r.getOrderNo())) {
                    r.setFactoryName(nameMap.get(r.getOrderNo()));
                    r.setFactoryType(typeMap.get(r.getOrderNo()));
                    r.setOrderBizType(bizTypeMap.get(r.getOrderNo()));
                }
            }
        }
        return result;
    }

    // =================== 创建 ===================

    /**
     * 新建领取记录
     */
    @Transactional(rollbackFor = Exception.class)
    public MaterialPickupRecord create(Map<String, Object> body) {
        MaterialPickupRecord record = new MaterialPickupRecord();

        Long tenantId = currentTenantId();
        record.setTenantId(tenantId != null ? String.valueOf(tenantId) : null);
        record.setPickupNo(generatePickupNo());
        record.setPickupType(strOfDefault(body.get("pickupType"), "INTERNAL"));
        record.setOrderNo(strOf(body.get("orderNo")));
        record.setStyleNo(strOf(body.get("styleNo")));
        record.setMaterialId(strOf(body.get("materialId")));
        record.setMaterialCode(strOf(body.get("materialCode")));
        record.setMaterialName(strOf(body.get("materialName")));
        record.setMaterialType(strOf(body.get("materialType")));
        record.setColor(strOf(body.get("color")));
        record.setSpecification(strOf(body.get("specification")));
        record.setFabricWidth(strOf(body.get("fabricWidth")));
        record.setFabricWeight(strOf(body.get("fabricWeight")));
        record.setFabricComposition(strOf(body.get("fabricComposition")));
        record.setUnit(strOf(body.get("unit")));
        record.setRemark(strOf(body.get("remark")));

        BigDecimal qty       = toBigDecimal(body.get("quantity"));
        BigDecimal unitPrice = toBigDecimal(body.get("unitPrice"));
        record.setQuantity(qty);
        record.setUnitPrice(unitPrice);
        if (qty != null && unitPrice != null) {
            record.setAmount(qty.multiply(unitPrice).setScale(2, java.math.RoundingMode.HALF_UP));
        }

        // 领取人默认当前登录用户
        record.setPickerId(UserContext.userId());
        record.setPickerName(UserContext.username());
        record.setPickupTime(LocalDateTime.now());

        record.setAuditStatus("PENDING");
        record.setFinanceStatus("PENDING");
        record.setCreateTime(LocalDateTime.now());
        record.setUpdateTime(LocalDateTime.now());
        record.setDeleteFlag(0);

        pickupMapper.insert(record);
        log.info("[MaterialPickup] 新建领取单: {}, 租户: {}", record.getPickupNo(), record.getTenantId());
        return record;
    }

    // =================== 审核 ===================

    /**
     * 审核领取记录（通过 / 拒绝）
     *
     * @param id   记录ID
     * @param body action(approve/reject), remark
     */
    @Transactional(rollbackFor = Exception.class)
    public void audit(String id, Map<String, Object> body) {
        MaterialPickupRecord record = getByIdAndTenant(id);
        if (!"PENDING".equals(record.getAuditStatus())) {
            throw new IllegalStateException("该记录已审核，无法重复操作");
        }
        String action = strOfDefault(body.get("action"), "approve");
        String newStatus = "approve".equalsIgnoreCase(action) ? "APPROVED" : "REJECTED";

        record.setAuditStatus(newStatus);
        record.setAuditorId(UserContext.userId());
        record.setAuditorName(UserContext.username());
        record.setAuditTime(LocalDateTime.now());
        record.setAuditRemark(strOf(body.get("remark")));
        record.setUpdateTime(LocalDateTime.now());

        pickupMapper.updateById(record);
        log.info("[MaterialPickup] 审核领取单: {} → {}, 审核人: {}", record.getPickupNo(), newStatus, record.getAuditorName());

        // 审核通过时自动扣减面辅料库存
        if ("APPROVED".equals(newStatus) && StringUtils.hasText(record.getMaterialId())
                && record.getQuantity() != null && record.getQuantity().compareTo(BigDecimal.ZERO) > 0) {
            int qty = record.getQuantity().intValue();
            try {
                materialStockService.decreaseStock(
                        record.getMaterialId(),
                        record.getColor(),
                        null,
                        qty);
                log.info("[MaterialPickup] 审核通过扣库存: materialId={}, color={}, qty={}, pickupNo={}",
                        record.getMaterialId(), record.getColor(), qty, record.getPickupNo());
            } catch (Exception e) {
                log.error("[MaterialPickup] 扣库存失败，审核仍通过: pickupNo={}, err={}",
                        record.getPickupNo(), e.getMessage());
                throw new IllegalStateException("库存扣减失败: " + e.getMessage());
            }
        }
    }

    // =================== 财务核算 ===================

    /**
     * 财务结算（仅已通过审核的记录可操作）
     *
     * @param id   记录ID
     * @param body remark, unitPrice（可覆盖修正单价）
     */
    @Transactional(rollbackFor = Exception.class)
    public void financeSettle(String id, Map<String, Object> body) {
        MaterialPickupRecord record = getByIdAndTenant(id);
        if (!"APPROVED".equals(record.getAuditStatus())) {
            throw new IllegalStateException("仅已通过审核的记录才能进行财务核算");
        }
        if ("SETTLED".equals(record.getFinanceStatus())) {
            throw new IllegalStateException("该记录已完成财务核算，无法重复操作");
        }

        // 允许财务修正单价重新计算金额
        BigDecimal patchPrice = toBigDecimal(body.get("unitPrice"));
        if (patchPrice != null) {
            record.setUnitPrice(patchPrice);
            if (record.getQuantity() != null) {
                record.setAmount(record.getQuantity().multiply(patchPrice).setScale(2, java.math.RoundingMode.HALF_UP));
            }
        }
        record.setFinanceStatus("SETTLED");
        record.setFinanceRemark(strOf(body.get("remark")));
        record.setUpdateTime(LocalDateTime.now());

        pickupMapper.updateById(record);
        log.info("[MaterialPickup] 财务核算完成: {}, 金额: {}", record.getPickupNo(), record.getAmount());
    }

    /**
     * 批量审核领取记录（通过 / 拒绝）
     *
     * @param ids  记录ID列表
     * @param body action(approve/reject), remark
     */
    @Transactional(rollbackFor = Exception.class)
    public void batchAudit(List<String> ids, Map<String, Object> body) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("请选择要审核的记录");
        }
        for (String id : ids) {
            audit(id, body);
        }
        log.info("[MaterialPickup] 批量审核完成，共 {} 条", ids.size());
    }

    // =================== 收款中心 ===================

    /**
     * 收款中心聚合查询：按工厂聚合已通过审核但未结算的记录
     * 业务含义：工厂从租户仓库领取物料，租户对工厂有应收账款
     *
     * @param params 查询参数（可选 factoryName 过滤）
     * @return 按工厂聚合的待收款数据
     */
    public List<Map<String, Object>> paymentCenterList(Map<String, Object> params) {
        Long tenantId = currentTenantId();
        String factoryNameFilter = strOf(params != null ? params.get("factoryName") : null);

        // 查询已通过审核的记录（不限财务状态，收款中心同时展示待收和已收）
        LambdaQueryWrapper<MaterialPickupRecord> wrapper = new LambdaQueryWrapper<MaterialPickupRecord>()
                .eq(MaterialPickupRecord::getDeleteFlag, 0)
                .eq(tenantId != null, MaterialPickupRecord::getTenantId, tenantId != null ? String.valueOf(tenantId) : null)
                .eq(MaterialPickupRecord::getAuditStatus, "APPROVED")
                .orderByDesc(MaterialPickupRecord::getCreateTime);

        List<MaterialPickupRecord> records = pickupMapper.selectList(wrapper);

        // 富化工厂信息
        Set<String> orderNos = records.stream()
                .map(MaterialPickupRecord::getOrderNo)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (!orderNos.isEmpty()) {
            List<ProductionOrder> orders = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .in(ProductionOrder::getOrderNo, orderNos)
                            .select(ProductionOrder::getOrderNo,
                                    ProductionOrder::getFactoryName,
                                    ProductionOrder::getFactoryType,
                                    ProductionOrder::getOrderBizType));
            Map<String, String> nameMap    = new HashMap<>();
            Map<String, String> typeMap    = new HashMap<>();
            Map<String, String> bizTypeMap = new HashMap<>();
            for (ProductionOrder o : orders) {
                nameMap.put(o.getOrderNo(), o.getFactoryName());
                typeMap.put(o.getOrderNo(), o.getFactoryType());
                bizTypeMap.put(o.getOrderNo(), o.getOrderBizType());
            }
            for (MaterialPickupRecord r : records) {
                if (StringUtils.hasText(r.getOrderNo())) {
                    r.setFactoryName(nameMap.get(r.getOrderNo()));
                    r.setFactoryType(typeMap.get(r.getOrderNo()));
                    r.setOrderBizType(bizTypeMap.get(r.getOrderNo()));
                }
            }
        }

        // 按工厂名称聚合（无工厂名的使用领取人或记录类型作为分组键）
        Map<String, List<MaterialPickupRecord>> grouped = records.stream()
                .collect(Collectors.groupingBy(r -> {
                    if (StringUtils.hasText(r.getFactoryName())) return r.getFactoryName();
                    // 无关联订单的领取记录归入「其他/散单」
                    return "散单（无关联订单）";
                }, LinkedHashMap::new, Collectors.toList()));

        return grouped.entrySet().stream()
                .filter(e -> !StringUtils.hasText(factoryNameFilter)
                        || e.getKey().contains(factoryNameFilter))
                .map(e -> {
                    List<MaterialPickupRecord> grp = e.getValue();
                    BigDecimal totalPending  = grp.stream()
                            .filter(r -> "PENDING".equals(r.getFinanceStatus()))
                            .map(r -> r.getAmount() != null ? r.getAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal totalSettled  = grp.stream()
                            .filter(r -> "SETTLED".equals(r.getFinanceStatus()))
                            .map(r -> r.getAmount() != null ? r.getAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    long pendingCount  = grp.stream().filter(r -> "PENDING".equals(r.getFinanceStatus())).count();
                    long settledCount  = grp.stream().filter(r -> "SETTLED".equals(r.getFinanceStatus())).count();

                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("factoryName",   e.getKey());
                    item.put("factoryType",   grp.get(0).getFactoryType());
                    item.put("orderBizType",  grp.get(0).getOrderBizType());
                    item.put("totalAmount",   totalPending.add(totalSettled));
                    item.put("pendingAmount", totalPending);
                    item.put("settledAmount", totalSettled);
                    item.put("totalCount",    (int) grp.size());
                    item.put("pendingCount",  (int) pendingCount);
                    item.put("settledCount",  (int) settledCount);
                    item.put("records",       grp);
                    return item;
                })
                .collect(Collectors.toList());
    }

    // =================== 删除 ===================

    /**
     * 作废（逻辑删除，仅 PENDING 状态可操作）
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancel(String id) {
        MaterialPickupRecord record = getByIdAndTenant(id);
        if (!"PENDING".equals(record.getAuditStatus())) {
            throw new IllegalStateException("仅待审核状态的记录可以作废");
        }
        record.setDeleteFlag(1);
        record.setUpdateTime(LocalDateTime.now());
        pickupMapper.updateById(record);
        log.info("[MaterialPickup] 作废领取单: {}", record.getPickupNo());
    }

    // =================== 私有工具 ===================

    private MaterialPickupRecord getByIdAndTenant(String id) {
        MaterialPickupRecord record = pickupMapper.selectById(id);
        if (record == null || record.getDeleteFlag() != null && record.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("记录不存在");
        }
        Long tenantId = currentTenantId();
        if (tenantId != null && !String.valueOf(tenantId).equals(record.getTenantId())) {
            throw new SecurityException("无权操作该记录");
        }
        return record;
    }

    private String generatePickupNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd").format(LocalDateTime.now());
        int seq = seqCounter.incrementAndGet() % 10000;
        return String.format("PK%s%04d", date, seq);
    }

    private Long currentTenantId() {
        try {
            return UserContext.tenantId();
        } catch (Exception e) {
            return null;
        }
    }

    private String strOf(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private String strOfDefault(Object o, String def) {
        String s = strOf(o);
        return s == null ? def : s;
    }

    private BigDecimal toBigDecimal(Object o) {
        if (o == null) return null;
        try {
            return new BigDecimal(o.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
