package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.crm.service.ReceivableService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MaterialPickupReceivableOrchestrator {

    private final MaterialPickupRecordMapper pickupMapper;
    private final ProductionOrderService productionOrderService;
    private final ReceivableOrchestrator receivableOrchestrator;
    private final ReceivableService receivableService;

    public void syncAfterApproval(MaterialPickupRecord record, String auditRemark) {
        Receivable receivable = syncReceivableForRecord(record, true);
        if (receivable != null && !StringUtils.hasText(record.getFinanceRemark())) {
            record.setFinanceRemark(StringUtils.hasText(auditRemark)
                    ? "审核通过并生成应收账单：" + auditRemark.trim()
                    : "审核通过后自动生成应收账单");
            record.setFinanceStatus("SETTLED");
        }
    }

    public void syncForFinance(MaterialPickupRecord record, String financeRemark) {
        Receivable receivable = syncReceivableForRecord(record, true);
        if (receivable != null) {
            record.setFinanceStatus("SETTLED");
            record.setFinanceRemark(StringUtils.hasText(financeRemark) ? financeRemark : "财务已确认并同步应收账单");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void markPaymentReceived(List<String> ids, String remark) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("请选择要登记收款的记录");
        }
        for (String id : ids) {
            MaterialPickupRecord record = getByIdAndTenant(id);
            if (!"APPROVED".equals(record.getAuditStatus())) {
                throw new IllegalStateException("仅已审核通过的记录可登记收款");
            }
            Receivable receivable = syncReceivableForRecord(record, true);
            if (receivable == null) {
                continue;
            }
            BigDecimal remaining = remainingReceivableAmount(record);
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            Receivable updated = receivableOrchestrator.markReceived(receivable.getId(), remaining);
            applyReceivableSnapshot(record, updated);
            record.setFinanceStatus("SETTLED");
            if (StringUtils.hasText(remark)) {
                record.setFinanceRemark(remark.trim());
            }
            record.setUpdateTime(LocalDateTime.now());
            pickupMapper.updateById(record);
        }
    }

    public List<Map<String, Object>> paymentCenterList(Map<String, Object> params) {
        Long tenantId = currentTenantId();
        String factoryNameFilter = strOf(params != null ? params.get("factoryName") : null);

        LambdaQueryWrapper<MaterialPickupRecord> wrapper = new LambdaQueryWrapper<MaterialPickupRecord>()
                .eq(MaterialPickupRecord::getDeleteFlag, 0)
                .eq(tenantId != null, MaterialPickupRecord::getTenantId, tenantId != null ? String.valueOf(tenantId) : null)
                .and(w -> w.isNull(MaterialPickupRecord::getMovementType)
                        .or()
                        .eq(MaterialPickupRecord::getMovementType, "OUTBOUND"))
                .eq(MaterialPickupRecord::getAuditStatus, "APPROVED")
                .orderByDesc(MaterialPickupRecord::getCreateTime);

        List<MaterialPickupRecord> records = pickupMapper.selectList(wrapper);
        enrichFactoryInfo(records);

        Map<String, List<MaterialPickupRecord>> grouped = records.stream()
                .collect(Collectors.groupingBy(r -> StringUtils.hasText(r.getFactoryName()) ? r.getFactoryName() : "散单（无关联订单）",
                        LinkedHashMap::new, Collectors.toList()));

        return grouped.entrySet().stream()
                .filter(e -> !StringUtils.hasText(factoryNameFilter) || e.getKey().contains(factoryNameFilter))
                .map(e -> {
                    List<MaterialPickupRecord> group = e.getValue();
                    BigDecimal pendingAmount = group.stream()
                            .map(this::remainingReceivableAmount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal receivedAmount = group.stream()
                            .map(this::receivedReceivableAmount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    long pendingCount = group.stream().filter(r -> remainingReceivableAmount(r).compareTo(BigDecimal.ZERO) > 0).count();
                    long settledCount = group.stream().filter(r -> "PAID".equalsIgnoreCase(r.getReceivableStatus())).count();

                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("factoryName", e.getKey());
                    item.put("factoryType", group.get(0).getFactoryType());
                    item.put("orderBizType", group.get(0).getOrderBizType());
                    item.put("totalAmount", pendingAmount.add(receivedAmount));
                    item.put("pendingAmount", pendingAmount);
                    item.put("settledAmount", receivedAmount);
                    item.put("totalCount", group.size());
                    item.put("pendingCount", (int) pendingCount);
                    item.put("settledCount", (int) settledCount);
                    item.put("records", group);
                    return item;
                })
                .collect(Collectors.toList());
    }

    public void enrichFactoryInfo(List<MaterialPickupRecord> records) {
        Set<String> orderNos = records.stream()
                .map(MaterialPickupRecord::getOrderNo)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (orderNos.isEmpty()) {
            return;
        }
        List<ProductionOrder> orders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .in(ProductionOrder::getOrderNo, orderNos)
                        .select(ProductionOrder::getOrderNo,
                                ProductionOrder::getFactoryName,
                                ProductionOrder::getFactoryType,
                                ProductionOrder::getOrderBizType));
        Map<String, String> nameMap = new HashMap<>();
        Map<String, String> typeMap = new HashMap<>();
        Map<String, String> bizTypeMap = new HashMap<>();
        for (ProductionOrder order : orders) {
            nameMap.put(order.getOrderNo(), order.getFactoryName());
            typeMap.put(order.getOrderNo(), order.getFactoryType());
            bizTypeMap.put(order.getOrderNo(), order.getOrderBizType());
        }
        for (MaterialPickupRecord record : records) {
            if (!StringUtils.hasText(record.getOrderNo())) {
                continue;
            }
            if (!StringUtils.hasText(record.getFactoryName())) {
                record.setFactoryName(nameMap.get(record.getOrderNo()));
            }
            if (!StringUtils.hasText(record.getFactoryType())) {
                record.setFactoryType(typeMap.get(record.getOrderNo()));
            }
            record.setOrderBizType(bizTypeMap.get(record.getOrderNo()));
        }
    }

    private Receivable syncReceivableForRecord(MaterialPickupRecord record, boolean createWhenMissing) {
        if (record == null || !"APPROVED".equals(record.getAuditStatus())) {
            return null;
        }
        if ("INBOUND".equalsIgnoreCase(strOfDefault(record.getMovementType(), "OUTBOUND"))) {
            return null;
        }
        BigDecimal amount = record.getAmount() != null ? record.getAmount() : BigDecimal.ZERO;
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        Receivable receivable = findReceivableByPickup(record);
        if (receivable == null && !createWhenMissing) {
            return null;
        }
        if (receivable == null) {
            Receivable toCreate = new Receivable();
            toCreate.setCustomerId(resolveCustomerId(record));
            toCreate.setCustomerName(strOfDefault(record.getFactoryName(), record.getReceiverName()));
            toCreate.setOrderNo(record.getOrderNo());
            toCreate.setAmount(amount);
            toCreate.setDueDate(LocalDateTime.now().toLocalDate());
            toCreate.setDescription(buildReceivableDescription(record));
            toCreate.setSourceBizType("MATERIAL_PICKUP");
            toCreate.setSourceBizId(record.getId());
            toCreate.setSourceBizNo(record.getPickupNo());
            receivable = receivableOrchestrator.create(toCreate);
        } else {
            receivable.setCustomerId(resolveCustomerId(record));
            receivable.setCustomerName(strOfDefault(record.getFactoryName(), record.getReceiverName()));
            receivable.setOrderNo(record.getOrderNo());
            receivable.setAmount(amount);
            receivable.setDescription(buildReceivableDescription(record));
            receivable.setSourceBizType("MATERIAL_PICKUP");
            receivable.setSourceBizId(record.getId());
            receivable.setSourceBizNo(record.getPickupNo());
            receivable.setUpdateTime(LocalDateTime.now());
            receivableService.updateById(receivable);
        }
        applyReceivableSnapshot(record, receivable);
        return receivable;
    }

    private Receivable findReceivableByPickup(MaterialPickupRecord record) {
        if (StringUtils.hasText(record.getReceivableId())) {
            Receivable direct = receivableService.getById(record.getReceivableId());
            if (direct != null) {
                return direct;
            }
        }
        return receivableService.lambdaQuery()
                .eq(Receivable::getDeleteFlag, 0)
                .eq(Receivable::getSourceBizType, "MATERIAL_PICKUP")
                .eq(Receivable::getSourceBizId, record.getId())
                .last("LIMIT 1")
                .one();
    }

    private String resolveCustomerId(MaterialPickupRecord record) {
        if (StringUtils.hasText(record.getFactoryId())) {
            return record.getFactoryId().trim();
        }
        return "FACTORY:" + strOfDefault(record.getFactoryName(), record.getReceiverName());
    }

    private void applyReceivableSnapshot(MaterialPickupRecord record, Receivable receivable) {
        record.setReceivableId(receivable.getId());
        record.setReceivableNo(receivable.getReceivableNo());
        record.setReceivableStatus(receivable.getStatus());
        record.setReceivedAmount(receivable.getReceivedAmount());
        if ("PAID".equalsIgnoreCase(receivable.getStatus())) {
            record.setReceivedTime(LocalDateTime.now());
        }
    }

    private BigDecimal remainingReceivableAmount(MaterialPickupRecord record) {
        BigDecimal amount = record != null && record.getAmount() != null ? record.getAmount() : BigDecimal.ZERO;
        BigDecimal received = receivedReceivableAmount(record);
        BigDecimal remaining = amount.subtract(received);
        return remaining.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : remaining;
    }

    private BigDecimal receivedReceivableAmount(MaterialPickupRecord record) {
        return record != null && record.getReceivedAmount() != null ? record.getReceivedAmount() : BigDecimal.ZERO;
    }

    private String buildReceivableDescription(MaterialPickupRecord record) {
        return String.format("面辅料领取应收|单号=%s|订单=%s|款号=%s|领取人=%s|工厂=%s",
                strOfDefault(record.getPickupNo(), "-"),
                strOfDefault(record.getOrderNo(), "-"),
                strOfDefault(record.getStyleNo(), "-"),
                strOfDefault(record.getReceiverName(), strOf(record.getPickerName())),
                strOfDefault(record.getFactoryName(), "-"));
    }

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
}
