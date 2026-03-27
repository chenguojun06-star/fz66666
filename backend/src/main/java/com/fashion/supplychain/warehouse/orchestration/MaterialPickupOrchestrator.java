package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
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
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 面辅料领取记录编排层
 * 负责领取申请、审核流程、财务核算的业务编排
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MaterialPickupOrchestrator {

    private final MaterialPickupRecordMapper pickupMapper;
    private final MaterialPickupReceivableOrchestrator materialPickupReceivableOrchestrator;

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
        String movementType  = strOf(params.get("movementType"));
        String auditStatus   = strOf(params.get("auditStatus"));
        String financeStatus = strOf(params.get("financeStatus"));
        String orderNo       = strOf(params.get("orderNo"));
        String styleNo       = strOf(params.get("styleNo"));
        String factoryName   = strOf(params.get("factoryName"));
        String factoryType   = strOf(params.get("factoryType"));

        Long tenantId = currentTenantId();

        LambdaQueryWrapper<MaterialPickupRecord> wrapper = new LambdaQueryWrapper<MaterialPickupRecord>()
                .eq(MaterialPickupRecord::getDeleteFlag, 0)
                .eq(tenantId != null, MaterialPickupRecord::getTenantId, tenantId != null ? String.valueOf(tenantId) : null)
                .eq(StringUtils.hasText(pickupType),    MaterialPickupRecord::getPickupType,    pickupType)
                .eq(StringUtils.hasText(movementType),  MaterialPickupRecord::getMovementType,  movementType)
                .eq(StringUtils.hasText(auditStatus),   MaterialPickupRecord::getAuditStatus,   auditStatus)
                .eq(StringUtils.hasText(financeStatus), MaterialPickupRecord::getFinanceStatus, financeStatus)
                .like(StringUtils.hasText(orderNo),     MaterialPickupRecord::getOrderNo,       orderNo)
                .like(StringUtils.hasText(styleNo),     MaterialPickupRecord::getStyleNo,       styleNo)
                .like(StringUtils.hasText(factoryName), MaterialPickupRecord::getFactoryName,   factoryName)
                .eq(StringUtils.hasText(factoryType),   MaterialPickupRecord::getFactoryType,   factoryType)
                .and(StringUtils.hasText(keyword), wr -> wr
                        .like(MaterialPickupRecord::getPickupNo,    keyword)
                        .or().like(MaterialPickupRecord::getMaterialCode, keyword)
                        .or().like(MaterialPickupRecord::getMaterialName, keyword)
                        .or().like(MaterialPickupRecord::getPickerName,   keyword)
                        .or().like(MaterialPickupRecord::getFactoryName,  keyword))
                .orderByDesc(MaterialPickupRecord::getCreateTime);

        IPage<MaterialPickupRecord> result = pickupMapper.selectPage(new Page<>(page, pageSize), wrapper);

        // 富化生产方信息：按 orderNo 批量查生产订单
        materialPickupReceivableOrchestrator.enrichFactoryInfo(result.getRecords());
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
        String bodyFactoryType = strOf(body.get("factoryType"));
        String normalizedPickupType = StringUtils.hasText(strOf(body.get("pickupType")))
                ? strOf(body.get("pickupType"))
                : (StringUtils.hasText(bodyFactoryType) ? bodyFactoryType : "INTERNAL");
        record.setPickupType(normalizedPickupType);
        record.setMovementType(strOfDefault(body.get("movementType"), "OUTBOUND"));
        record.setSourceType(strOf(body.get("sourceType")));
        record.setUsageType(strOf(body.get("usageType")));
        record.setSourceRecordId(strOf(body.get("sourceRecordId")));
        record.setSourceDocumentNo(strOf(body.get("sourceDocumentNo")));
        record.setFactoryId(strOf(body.get("factoryId")));
        record.setFactoryName(strOf(body.get("factoryName")));
        record.setFactoryType(bodyFactoryType);
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
        record.setWarehouseLocation(strOf(body.get("warehouseLocation")));

        BigDecimal qty       = toBigDecimal(body.get("quantity"));
        BigDecimal unitPrice = toBigDecimal(body.get("unitPrice"));
        record.setQuantity(qty);
        record.setUnitPrice(unitPrice);
        if (qty != null && unitPrice != null) {
            record.setAmount(qty.multiply(unitPrice).setScale(2, java.math.RoundingMode.HALF_UP));
        }

        String receiverId = strOfDefault(body.get("receiverId"), UserContext.userId());
        String receiverName = strOfDefault(body.get("receiverName"), UserContext.username());
        String issuerId = strOfDefault(body.get("issuerId"), UserContext.userId());
        String issuerName = strOfDefault(body.get("issuerName"), UserContext.username());
        record.setReceiverId(receiverId);
        record.setReceiverName(receiverName);
        record.setIssuerId(issuerId);
        record.setIssuerName(issuerName);
        record.setPickerId(receiverId);
        record.setPickerName(receiverName);
        record.setPickupTime(LocalDateTime.now());

        record.setAuditStatus(strOfDefault(body.get("auditStatus"), "PENDING"));
        record.setFinanceStatus(strOfDefault(body.get("financeStatus"), "PENDING"));
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

        if ("APPROVED".equals(newStatus)) {
            materialPickupReceivableOrchestrator.syncAfterApproval(record, strOf(body.get("remark")));
        }

        pickupMapper.updateById(record);
        log.info("[MaterialPickup] 审核领取单: {} → {}, 审核人: {}", record.getPickupNo(), newStatus, record.getAuditorName());
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
        // 允许财务修正单价重新计算金额
        BigDecimal patchPrice = toBigDecimal(body.get("unitPrice"));
        if (patchPrice != null) {
            record.setUnitPrice(patchPrice);
            if (record.getQuantity() != null) {
                record.setAmount(record.getQuantity().multiply(patchPrice).setScale(2, java.math.RoundingMode.HALF_UP));
            }
        }
        String financeRemark = strOf(body.get("remark"));
        materialPickupReceivableOrchestrator.syncForFinance(record, financeRemark);
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
        return materialPickupReceivableOrchestrator.paymentCenterList(params);
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
        pickupMapper.deleteById(id);
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

    @Transactional(rollbackFor = Exception.class)
    public void markPaymentReceived(List<String> ids, String remark) {
        materialPickupReceivableOrchestrator.markPaymentReceived(ids, remark);
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
