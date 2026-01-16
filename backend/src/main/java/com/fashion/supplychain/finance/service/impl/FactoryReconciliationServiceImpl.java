package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.FactoryReconciliation;
import com.fashion.supplychain.finance.mapper.FactoryReconciliationMapper;
import com.fashion.supplychain.finance.service.FactoryReconciliationService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.util.Map;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * 加工厂对账Service实现类
 */
@Service
@Slf4j
public class FactoryReconciliationServiceImpl extends ServiceImpl<FactoryReconciliationMapper, FactoryReconciliation>
        implements FactoryReconciliationService {

    @Autowired
    private DeductionItemMapper deductionItemMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ObjectMapper objectMapper;

    private BigDecimal resolveTotalUnitPriceFromScanRecords(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return BigDecimal.ZERO;
        }

        try {
            List<ScanRecord> list = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, oid)
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success")
                    .isNotNull(ScanRecord::getUnitPrice)
                    .orderByDesc(ScanRecord::getScanTime)
                    .orderByDesc(ScanRecord::getCreateTime)
                    .last("limit 1000"));

            if (list == null || list.isEmpty()) {
                return BigDecimal.ZERO;
            }

            BigDecimal sum = BigDecimal.ZERO;
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            for (ScanRecord r : list) {
                if (r == null)
                    continue;
                String pn = r.getProcessName();
                pn = StringUtils.hasText(pn) ? pn.trim() : "";
                if (!StringUtils.hasText(pn))
                    continue;
                if (!seen.add(pn))
                    continue;
                BigDecimal up = r.getUnitPrice();
                if (up == null || up.compareTo(BigDecimal.ZERO) <= 0)
                    continue;
                sum = sum.add(up);
            }

            if (sum.compareTo(BigDecimal.ZERO) > 0) {
                return sum.setScale(2, RoundingMode.HALF_UP);
            }
        } catch (Exception e) {
            log.warn("Failed to resolve unit price from scan records: orderId={}", oid, e);
        }

        return BigDecimal.ZERO;
    }

    private BigDecimal resolveTotalUnitPriceFromProgressTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        TemplateLibrary tpl = null;
        try {
            if (StringUtils.hasText(sn)) {
                tpl = templateLibraryService.getOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "progress")
                        .eq(TemplateLibrary::getSourceStyleNo, sn)
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }

            if (tpl == null) {
                tpl = templateLibraryService.getOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "progress")
                        .eq(TemplateLibrary::getTemplateKey, "default")
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }
        } catch (Exception e) {
            log.warn("Failed to load progress template for unit price: styleNo={}", sn, e);
        }

        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return BigDecimal.ZERO;
        }

        try {
            JsonNode root = objectMapper.readTree(tpl.getTemplateContent());
            JsonNode nodes = root.get("nodes");
            if (nodes == null || !nodes.isArray()) {
                return BigDecimal.ZERO;
            }

            BigDecimal sum = BigDecimal.ZERO;
            for (JsonNode n : nodes) {
                if (n == null)
                    continue;
                BigDecimal up = BigDecimal.ZERO;
                if (n.hasNonNull("unitPrice")) {
                    JsonNode v = n.get("unitPrice");
                    if (v != null) {
                        if (v.isNumber()) {
                            up = v.decimalValue();
                        } else {
                            try {
                                up = new BigDecimal(v.asText("0").trim());
                            } catch (Exception e) {
                                log.warn("Failed to parse unitPrice from template node: styleNo={}, unitPrice={}",
                                        sn,
                                        v == null ? null : v.asText(null),
                                        e);
                                up = BigDecimal.ZERO;
                            }
                        }
                    }
                }
                if (up != null && up.compareTo(BigDecimal.ZERO) > 0) {
                    sum = sum.add(up);
                }
            }

            if (sum.compareTo(BigDecimal.ZERO) > 0) {
                return sum.setScale(2, RoundingMode.HALF_UP);
            }
        } catch (Exception e) {
            log.warn("Failed to parse progress template content for unit price: styleNo={}", sn, e);
        }

        return BigDecimal.ZERO;
    }

    private BigDecimal resolveTotalUnitPrice(String orderId, String styleNo) {
        BigDecimal fromRecords = resolveTotalUnitPriceFromScanRecords(orderId);
        if (fromRecords.compareTo(BigDecimal.ZERO) > 0) {
            return fromRecords;
        }
        BigDecimal fromTpl = resolveTotalUnitPriceFromProgressTemplate(styleNo);
        if (fromTpl.compareTo(BigDecimal.ZERO) > 0) {
            return fromTpl;
        }
        return BigDecimal.ZERO;
    }

    private boolean shouldAutoFixAmounts(FactoryReconciliation r, BigDecimal computedUnitPrice) {
        if (r == null)
            return false;
        if (!StringUtils.hasText(r.getId()))
            return false;
        if (!StringUtils.hasText(r.getOrderId()))
            return false;
        if (r.getQuantity() == null || r.getQuantity() <= 0)
            return false;

        String st = StringUtils.hasText(r.getStatus()) ? r.getStatus().trim() : "";
        if ("approved".equals(st) || "paid".equals(st))
            return false;

        BigDecimal curUp = r.getUnitPrice() == null ? BigDecimal.ZERO : r.getUnitPrice();
        BigDecimal total = r.getTotalAmount() == null ? BigDecimal.ZERO : r.getTotalAmount();
        BigDecimal ded = r.getDeductionAmount() == null ? BigDecimal.ZERO : r.getDeductionAmount();

        if (ded.compareTo(BigDecimal.ZERO) != 0)
            return false;
        if (StringUtils.hasText(r.getRemark()))
            return false;

        if (computedUnitPrice == null || computedUnitPrice.compareTo(BigDecimal.ZERO) <= 0)
            return false;
        if (curUp.setScale(2, RoundingMode.HALF_UP).compareTo(computedUnitPrice.setScale(2, RoundingMode.HALF_UP)) == 0)
            return false;

        BigDecimal expectedCur = curUp.multiply(BigDecimal.valueOf(r.getQuantity())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal expectedNew = computedUnitPrice.multiply(BigDecimal.valueOf(r.getQuantity())).setScale(2,
                RoundingMode.HALF_UP);

        if (total.compareTo(BigDecimal.ZERO) > 0 && total.compareTo(expectedCur) != 0
                && total.compareTo(expectedNew) != 0)
            return false;

        return true;
    }

    private void autoFixAmountsIfNeeded(FactoryReconciliation r) {
        if (r == null)
            return;
        BigDecimal computedUp = resolveTotalUnitPrice(r.getOrderId(), r.getStyleNo());
        if (!shouldAutoFixAmounts(r, computedUp))
            return;

        BigDecimal ded = r.getDeductionAmount() == null ? BigDecimal.ZERO : r.getDeductionAmount();
        BigDecimal total = computedUp.multiply(BigDecimal.valueOf(r.getQuantity())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal finalAmt = total.subtract(ded).setScale(2, RoundingMode.HALF_UP);

        LocalDateTime now = LocalDateTime.now();

        r.setUnitPrice(computedUp);
        r.setTotalAmount(total);
        r.setFinalAmount(finalAmt);
        r.setUpdateTime(now);

        FactoryReconciliation patch = new FactoryReconciliation();
        patch.setId(r.getId());
        patch.setUnitPrice(computedUp);
        patch.setTotalAmount(total);
        patch.setFinalAmount(finalAmt);
        patch.setUpdateTime(now);
        try {
            baseMapper.updateById(patch);
        } catch (Exception e) {
            log.warn("Failed to auto fix reconciliation amounts: reconciliationId={}", r.getId(), e);
        }
    }

    @Override
    public IPage<FactoryReconciliation> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        // 创建分页对象
        Page<FactoryReconciliation> pageInfo = new Page<>(page, pageSize);

        // 构建查询条件
        String reconciliationNo = (String) params.getOrDefault("reconciliationNo", "");
        String factoryName = (String) params.getOrDefault("factoryName", "");
        String styleNo = (String) params.getOrDefault("styleNo", "");
        String status = (String) params.getOrDefault("status", "");

        // 使用条件构造器进行查询
        IPage<FactoryReconciliation> pageResult = baseMapper.selectPage(pageInfo,
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<FactoryReconciliation>()
                        .eq(StringUtils.hasText(reconciliationNo), FactoryReconciliation::getReconciliationNo,
                                reconciliationNo)
                        .like(StringUtils.hasText(factoryName), FactoryReconciliation::getFactoryName, factoryName)
                        .like(StringUtils.hasText(styleNo), FactoryReconciliation::getStyleNo, styleNo)
                        .eq(StringUtils.hasText(status), FactoryReconciliation::getStatus, status)
                        .orderByDesc(FactoryReconciliation::getCreateTime));

        if (pageResult != null && pageResult.getRecords() != null) {
            for (FactoryReconciliation r : pageResult.getRecords()) {
                autoFixAmountsIfNeeded(r);
            }
        }

        return pageResult;
    }

    @Override
    public FactoryReconciliation getDetailById(String id) {
        FactoryReconciliation r = baseMapper.selectById(id);
        if (r != null) {
            autoFixAmountsIfNeeded(r);
        }
        return r;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean saveOrUpdateReconciliation(FactoryReconciliation reconciliation,
            List<DeductionItem> deductionItems) {
        LocalDateTime now = LocalDateTime.now();

        // 计算扣款项总金额
        BigDecimal deductionAmount = BigDecimal.ZERO;
        if (deductionItems != null && !deductionItems.isEmpty()) {
            for (DeductionItem item : deductionItems) {
                deductionAmount = deductionAmount.add(item.getDeductionAmount());
            }
        }

        // 计算总金额和最终金额
        BigDecimal totalAmount = reconciliation.getUnitPrice().multiply(new BigDecimal(reconciliation.getQuantity()));
        BigDecimal finalAmount = totalAmount.subtract(deductionAmount);

        reconciliation.setTotalAmount(totalAmount);
        reconciliation.setDeductionAmount(deductionAmount);
        reconciliation.setFinalAmount(finalAmount);

        if (StringUtils.hasText(reconciliation.getId())) {
            FactoryReconciliation current = null;
            try {
                current = baseMapper.selectById(reconciliation.getId());
            } catch (Exception e) {
                log.warn("Failed to load reconciliation for update: reconciliationId={}", reconciliation.getId(), e);
            }
            if (current == null) {
                throw new NoSuchElementException("对账单不存在");
            }
            String st = current.getStatus() == null ? "" : current.getStatus().trim();
            if (!st.isEmpty() && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
                throw new IllegalStateException("当前状态不允许修改，请先退回到上一个环节");
            }

            // 更新操作
            reconciliation.setUpdateTime(now);
            baseMapper.updateById(reconciliation);

            // 删除原有的扣款项
            deductionItemMapper.delete(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<DeductionItem>()
                            .eq(DeductionItem::getReconciliationId, reconciliation.getId()));
        } else {
            // 新增操作
            reconciliation.setCreateTime(now);
            reconciliation.setUpdateTime(now);
            reconciliation.setStatus("pending");
            baseMapper.insert(reconciliation);
        }

        // 保存新的扣款项
        if (deductionItems != null && !deductionItems.isEmpty()) {
            for (DeductionItem item : deductionItems) {
                item.setReconciliationId(reconciliation.getId());
                deductionItemMapper.insert(item);
            }
        }

        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteById(String id) {
        FactoryReconciliation current = null;
        try {
            current = baseMapper.selectById(id);
        } catch (Exception e) {
            log.warn("Failed to load reconciliation for delete: reconciliationId={}", id, e);
        }
        if (current == null) {
            return false;
        }
        String st = current.getStatus() == null ? "" : current.getStatus().trim();
        if (!st.isEmpty() && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
            throw new IllegalStateException("当前状态不允许删除，请先退回到上一个环节");
        }

        try {
            deductionItemMapper.delete(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<DeductionItem>()
                            .eq(DeductionItem::getReconciliationId, id));
        } catch (Exception e) {
            log.warn("Failed to delete deduction items for reconciliation: reconciliationId={}", id, e);
        }

        return baseMapper.deleteById(id) > 0;
    }

    @Override
    public boolean updateStatus(String id, String status) {
        LocalDateTime now = LocalDateTime.now();
        FactoryReconciliation reconciliation = new FactoryReconciliation();
        reconciliation.setId(id);
        reconciliation.setStatus(status);
        reconciliation.setUpdateTime(now);

        if (status != null && "paid".equalsIgnoreCase(status.trim())) {
            reconciliation.setPaidAt(now);
        }

        return baseMapper.updateById(reconciliation) > 0;
    }

    @Override
    public List<DeductionItem> getDeductionItemsById(String reconciliationId) {
        return deductionItemMapper.selectByReconciliationId(reconciliationId);
    }
}
