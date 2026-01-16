package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.FactoryReconciliation;
import com.fashion.supplychain.finance.service.FactoryReconciliationService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class FactoryReconciliationOrchestrator {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private FactoryReconciliationService factoryReconciliationService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ObjectMapper objectMapper;

    public IPage<FactoryReconciliation> list(Map<String, Object> params) {
        IPage<FactoryReconciliation> page = factoryReconciliationService.queryPage(params);
        if (page != null) {
            fillProductionCompletedQuantity(page.getRecords());
        }
        return page;
    }

    public FactoryReconciliation detail(String id) {
        String rid = normalize(id);
        if (!StringUtils.hasText(rid)) {
            throw new IllegalArgumentException("参数错误");
        }
        FactoryReconciliation reconciliation = factoryReconciliationService.getDetailById(rid);
        if (reconciliation == null) {
            throw new NoSuchElementException("加工厂对账不存在");
        }
        fillProductionCompletedQuantity(List.of(reconciliation));
        return reconciliation;
    }

    private void fillProductionCompletedQuantity(List<FactoryReconciliation> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .map(FactoryReconciliation::getOrderId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) {
            return;
        }

        List<ProductionOrder> orders;
        try {
            orders = productionOrderService.listByIds(orderIds);
        } catch (Exception e) {
            orders = List.of();
        }

        Map<String, Integer> completedByOrderId = new HashMap<>();
        if (orders != null) {
            for (ProductionOrder o : orders) {
                if (o == null || !StringUtils.hasText(o.getId())) {
                    continue;
                }
                completedByOrderId.put(o.getId().trim(), o.getCompletedQuantity());
            }
        }

        for (FactoryReconciliation r : records) {
            if (r == null || !StringUtils.hasText(r.getOrderId())) {
                continue;
            }
            Integer v = completedByOrderId.get(r.getOrderId().trim());
            r.setProductionCompletedQuantity(v);
        }
    }

    public boolean add(Map<String, Object> params) {
        FactoryReconciliation reconciliation = buildFromParams(params, false);
        List<DeductionItem> deductionItems = parseDeductionItems(params);

        boolean ok = factoryReconciliationService.saveOrUpdateReconciliation(reconciliation, deductionItems);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    public boolean update(Map<String, Object> params) {
        FactoryReconciliation reconciliation = buildFromParams(params, true);
        List<DeductionItem> deductionItems = parseDeductionItems(params);

        boolean ok = factoryReconciliationService.saveOrUpdateReconciliation(reconciliation, deductionItems);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    public boolean saveCompat(Map<String, Object> params) {
        String id = params == null ? null
                : normalize(params.get("id") == null ? null : String.valueOf(params.get("id")));
        boolean isUpdate = StringUtils.hasText(id);
        return isUpdate ? update(params) : add(params);
    }

    public boolean delete(String id) {
        String rid = normalize(id);
        if (!StringUtils.hasText(rid)) {
            throw new IllegalArgumentException("参数错误");
        }
        boolean ok = factoryReconciliationService.deleteById(rid);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    public List<DeductionItem> getDeductionItems(String reconciliationId) {
        String rid = normalize(reconciliationId);
        if (!StringUtils.hasText(rid)) {
            throw new IllegalArgumentException("参数错误");
        }
        List<DeductionItem> items = factoryReconciliationService.getDeductionItemsById(rid);
        return items == null ? Collections.emptyList() : items;
    }

    private FactoryReconciliation buildFromParams(Map<String, Object> params, boolean requireId) {
        FactoryReconciliation r = params == null ? new FactoryReconciliation()
                : objectMapper.convertValue(params, FactoryReconciliation.class);

        String id = normalize(r.getId());
        if (requireId && !StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id不能为空");
        }
        if (!requireId) {
            r.setId(null);
        }

        String factoryId = normalize(r.getFactoryId());
        String styleId = normalize(r.getStyleId());
        String orderId = normalize(r.getOrderId());

        if (!StringUtils.hasText(factoryId)) {
            throw new IllegalArgumentException("factoryId不能为空");
        }
        if (!StringUtils.hasText(styleId) && !StringUtils.hasText(normalize(r.getStyleNo()))) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        if (!StringUtils.hasText(orderId) && !StringUtils.hasText(normalize(r.getOrderNo()))) {
            throw new IllegalArgumentException("orderId不能为空");
        }

        Integer qty = r.getQuantity();
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("quantity参数错误");
        }
        BigDecimal up = r.getUnitPrice();
        if (up == null || up.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("unitPrice参数错误");
        }

        LocalDateTime dt = normalizeReconciliationDate(params, r.getReconciliationDate());
        if (dt == null) {
            throw new IllegalArgumentException("reconciliationDate不能为空");
        }
        r.setReconciliationDate(dt);

        Factory factory = factoryService.getById(factoryId);
        if (factory == null || (factory.getDeleteFlag() != null && factory.getDeleteFlag() == 1)) {
            throw new NoSuchElementException("加工厂不存在");
        }
        r.setFactoryId(factoryId);
        r.setFactoryName(factory.getFactoryName());

        StyleInfo style = resolveStyle(styleId, r.getStyleNo());
        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }
        r.setStyleId(String.valueOf(style.getId()));
        r.setStyleNo(style.getStyleNo());
        r.setStyleName(style.getStyleName());

        ProductionOrder order = resolveOrder(orderId, r.getOrderNo());
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        r.setOrderId(order.getId());
        r.setOrderNo(order.getOrderNo());

        if (!StringUtils.hasText(normalize(r.getReconciliationNo()))) {
            r.setReconciliationNo(nextReconciliationNo());
        }

        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : normalize(ctx.getUserId());
        if (requireId) {
            if (StringUtils.hasText(uid)) {
                r.setUpdateBy(uid);
            }
        } else {
            if (StringUtils.hasText(uid)) {
                r.setCreateBy(uid);
                r.setUpdateBy(uid);
            }
        }

        return r;
    }

    private LocalDateTime normalizeReconciliationDate(Map<String, Object> params, LocalDateTime parsed) {
        if (parsed != null) {
            return parsed;
        }
        Object raw = params == null ? null : params.get("reconciliationDate");
        if (raw == null) {
            return null;
        }
        String v = normalize(String.valueOf(raw));
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            if (v.length() == 10) {
                LocalDate d = LocalDate.parse(v);
                return d.atTime(LocalTime.of(0, 0));
            }
        } catch (Exception e) {
            log.warn("Failed to parse reconciliationDate as LocalDate: value={}", v, e);
        }
        List<DateTimeFormatter> fmts = List.of(
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
                DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        for (DateTimeFormatter f : fmts) {
            try {
                return LocalDateTime.parse(v, f);
            } catch (Exception e) {
                log.warn("Failed to parse reconciliationDate with formatter: value={}, formatter={}", v, f, e);
            }
        }
        try {
            return LocalDateTime.parse(v);
        } catch (Exception e) {
            log.warn("Failed to parse reconciliationDate: value={}", v, e);
        }
        return null;
    }

    private List<DeductionItem> parseDeductionItems(Map<String, Object> params) {
        if (params == null) {
            return Collections.emptyList();
        }
        Object raw = params.get("deductionItems");
        if (raw == null) {
            raw = params.get("deductions");
        }
        if (raw == null) {
            return Collections.emptyList();
        }
        try {
            List<DeductionItem> items = objectMapper.convertValue(raw, new TypeReference<List<DeductionItem>>() {
            });
            return items == null ? Collections.emptyList() : items;
        } catch (Exception e) {
            throw new IllegalArgumentException("deductionItems参数错误");
        }
    }

    private StyleInfo resolveStyle(String styleId, String styleNo) {
        String id = normalize(styleId);
        if (StringUtils.hasText(id)) {
            try {
                return styleInfoService.getById(Long.parseLong(id));
            } catch (Exception e) {
                log.warn("Failed to resolve style by styleId: styleId={}", id, e);
            }
        }
        String sn = normalize(styleNo);
        if (!StringUtils.hasText(sn)) {
            return null;
        }
        return styleInfoService.lambdaQuery().eq(StyleInfo::getStyleNo, sn).one();
    }

    private ProductionOrder resolveOrder(String orderId, String orderNo) {
        String id = normalize(orderId);
        if (StringUtils.hasText(id)) {
            ProductionOrder order = productionOrderService.getById(id);
            if (order != null && (order.getDeleteFlag() == null || order.getDeleteFlag() == 0)) {
                return order;
            }
        }
        String on = normalize(orderNo);
        if (!StringUtils.hasText(on)) {
            return null;
        }
        ProductionOrder order = productionOrderService
                .getOne(new LambdaQueryWrapper<ProductionOrder>().eq(ProductionOrder::getOrderNo, on).last("limit 1"));
        if (order != null && (order.getDeleteFlag() == null || order.getDeleteFlag() == 0)) {
            return order;
        }
        return null;
    }

    private String nextReconciliationNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "FR" + day;
        FactoryReconciliation latest = factoryReconciliationService
                .getOne(new LambdaQueryWrapper<FactoryReconciliation>()
                        .likeRight(FactoryReconciliation::getReconciliationNo, prefix)
                        .orderByDesc(FactoryReconciliation::getReconciliationNo)
                        .last("limit 1"));
        int seq = resolveNextSeq(prefix, latest == null ? null : latest.getReconciliationNo());
        for (int i = 0; i < 200; i++) {
            String candidate = prefix + String.format("%03d", seq);
            Long cnt = factoryReconciliationService.count(new LambdaQueryWrapper<FactoryReconciliation>()
                    .eq(FactoryReconciliation::getReconciliationNo, candidate));
            if (cnt == null || cnt == 0) {
                return candidate;
            }
            seq += 1;
        }
        String fallback = String.valueOf(System.nanoTime());
        String suffix = fallback.length() > 6 ? fallback.substring(fallback.length() - 6) : fallback;
        return prefix + suffix;
    }

    private int resolveNextSeq(String prefix, String latestValue) {
        if (!StringUtils.hasText(prefix) || !StringUtils.hasText(latestValue)) {
            return 1;
        }
        String v = latestValue.trim();
        if (!v.startsWith(prefix) || v.length() < prefix.length() + 3) {
            return 1;
        }
        String tail = v.substring(v.length() - 3);
        try {
            int n = Integer.parseInt(tail);
            return Math.max(1, n + 1);
        } catch (Exception e) {
            log.warn("Failed to parse reconciliation sequence: prefix={}, latestValue={}", prefix, latestValue, e);
            return 1;
        }
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String v = value.trim();
        if (v.isEmpty() || "undefined".equalsIgnoreCase(v) || "null".equalsIgnoreCase(v)) {
            return null;
        }
        return v;
    }
}
