package com.fashion.supplychain.template.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Component
@Slf4j
public class TemplateQueryHelper {

    @Autowired private TemplateLibraryService templateLibraryService;
    @Autowired private StyleInfoService styleInfoService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ObjectMapper objectMapper;

    /**
     * 工厂账号访问款号校验：外发工厂用户只能操作自己有生产订单的款号。
     * 非工厂账号直接放行。
     */
    void assertFactoryCanAccessStyle(String styleNo) {
        String currentFactoryId = UserContext.factoryId();
        if (!StringUtils.hasText(currentFactoryId)) {
            return; // 非工厂账号，不限制
        }
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        if (!StringUtils.hasText(sn)) {
            return; // 无款号，由业务方法自行校验
        }
        Long tenantId = TenantAssert.requireTenantId();
        long count = productionOrderService.count(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getFactoryId, currentFactoryId)
                .eq(ProductionOrder::getStyleNo, sn));
        if (count == 0) {
            throw new AccessDeniedException("无权访问该款号的模板");
        }
    }

    public IPage<TemplateLibrary> list(Map<String, Object> params) {
        boolean isFactoryTemplate = "true".equalsIgnoreCase(String.valueOf(params.getOrDefault("isFactoryTemplate", "")));
        String currentFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(currentFactoryId) && !isFactoryTemplate) {
            Long tenantId = TenantAssert.requireTenantId();
            List<String> allowedStyleNos = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .eq(ProductionOrder::getFactoryId, currentFactoryId)
                    .isNotNull(ProductionOrder::getStyleNo)
                    .ne(ProductionOrder::getStyleNo, "")
                    .select(ProductionOrder::getStyleNo)
                    .list()
                    .stream()
                    .map(o -> o.getStyleNo().trim())
                    .filter(StringUtils::hasText)
                    .distinct()
                    .collect(java.util.stream.Collectors.toList());
            if (allowedStyleNos.isEmpty()) {
                // 没有任何订单分配给该工厂，返回空页
                com.baomidou.mybatisplus.extension.plugins.pagination.Page<TemplateLibrary> emptyPage =
                        new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, 10, 0);
                emptyPage.setRecords(List.of());
                return emptyPage;
            }
            params.put("allowedStyleNos", allowedStyleNos);
        }
        IPage<TemplateLibrary> pageResult = templateLibraryService.queryPage(params);
        // 补充来源款式封面图
        List<String> styleNos = pageResult.getRecords().stream()
            .map(TemplateLibrary::getSourceStyleNo)
            .filter(sn -> sn != null && !sn.isBlank())
            .distinct()
            .collect(java.util.stream.Collectors.toList());
        if (!styleNos.isEmpty()) {
            List<StyleInfo> styles = styleInfoService.list(
                new LambdaQueryWrapper<StyleInfo>().in(StyleInfo::getStyleNo, styleNos)
            );
            Map<String, String> coverMap = styles.stream()
                .filter(s -> StringUtils.hasText(s.getStyleNo()))
                .collect(java.util.stream.Collectors.toMap(
                    StyleInfo::getStyleNo,
                    s -> s.getCover() != null ? s.getCover() : "",
                    (a, b) -> a));
            pageResult.getRecords().forEach(r -> {
                if (StringUtils.hasText(r.getSourceStyleNo())) {
                    String cover = coverMap.get(r.getSourceStyleNo());
                    if (StringUtils.hasText(cover)) {
                        r.setStyleCoverUrl(cover);
                    } else {
                        r.setStyleCoverUrl(extractFirstTemplateImage(r.getTemplateContent()));
                    }
                }
            });
        }
        return pageResult;
    }

    public List<TemplateLibrary> listByType(String templateType) {
        List<TemplateLibrary> all = templateLibraryService.listByType(templateType);
        // 外发工厂用户：只返回分配给本工厂的款式的模板
        String currentFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(currentFactoryId)) {
            Long tenantId = TenantAssert.requireTenantId();
            List<String> allowedStyleNos = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .eq(ProductionOrder::getFactoryId, currentFactoryId)
                    .isNotNull(ProductionOrder::getStyleNo)
                    .ne(ProductionOrder::getStyleNo, "")
                    .select(ProductionOrder::getStyleNo)
                    .list()
                    .stream()
                    .map(o -> o.getStyleNo().trim())
                    .filter(StringUtils::hasText)
                    .distinct()
                    .collect(java.util.stream.Collectors.toList());
            if (allowedStyleNos.isEmpty()) {
                return List.of();
            }
            return all.stream()
                    .filter(t -> {
                        String sn = t.getSourceStyleNo();
                        return StringUtils.hasText(sn) && allowedStyleNos.contains(sn.trim());
                    })
                    .collect(java.util.stream.Collectors.toList());
        }
        return all;
    }

    public TemplateLibrary detail(String id) {
        TemplateLibrary tpl = templateLibraryService.getById(id);
        if (tpl == null) {
            throw new NoSuchElementException("模板不存在");
        }
        assertFactoryCanAccessStyle(tpl.getSourceStyleNo());
        return tpl;
    }

    public Map<String, BigDecimal> resolveProcessUnitPrices(String styleNo) {
        String sn = String.valueOf(styleNo == null ? "" : styleNo).trim();
        if (!StringUtils.hasText(sn)) {
            throw new IllegalArgumentException("styleNo不能为空");
        }
        assertFactoryCanAccessStyle(sn);

        String currentFactoryId = UserContext.factoryId();
        boolean isFactoryWorker = StringUtils.hasText(currentFactoryId) && UserContext.isWorker();
        if (isFactoryWorker) {
            return new HashMap<>();
        }

        return templateLibraryService.resolveProcessUnitPrices(sn);
    }

    public List<Map<String, Object>> resolveProgressNodeUnitPrices(String styleNo) {
        String sn = String.valueOf(styleNo == null ? "" : styleNo).trim();
        if (!StringUtils.hasText(sn)) {
            throw new IllegalArgumentException("styleNo不能为空");
        }
        assertFactoryCanAccessStyle(sn);
        List<Map<String, Object>> result = templateLibraryService.resolveProgressNodeUnitPrices(sn);

        String currentFactoryId = UserContext.factoryId();
        boolean isFactoryWorker = StringUtils.hasText(currentFactoryId) && UserContext.isWorker();
        if (isFactoryWorker && result != null) {
            for (Map<String, Object> node : result) {
                node.remove("unitPrice");
                node.remove("price");
            }
        }
        return result;
    }

    public Map<String, Object> getProcessPriceTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        assertFactoryCanAccessStyle(sn);
        TemplateLibrary matched = StringUtils.hasText(sn) ? findStyleScopedProcessPriceTemplate(sn) : null;

        String matchedScope = "empty";
        String fallbackOrderNo = null;
        Map<String, Object> content;

        if (matched != null) {
            matchedScope = "style";
            content = parseProcessPriceTemplateContent(matched.getTemplateContent());
        } else if (StringUtils.hasText(sn)) {
            Map<String, Object> orderFallback = buildContentFromOrderWorkflow(sn);
            if (orderFallback != null) {
                matchedScope = "order";
                content = orderFallback;
                fallbackOrderNo = (String) orderFallback.remove("_fallbackOrderNo");
            } else {
                content = parseProcessPriceTemplateContent(null);
            }
        } else {
            content = parseProcessPriceTemplateContent(null);
        }

        String currentFactoryId = UserContext.factoryId();
        boolean isFactoryWorker = StringUtils.hasText(currentFactoryId) && UserContext.isWorker();
        if (isFactoryWorker) {
            content = hidePricesFromContent(content);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("exists", matched != null);
        result.put("requestedStyleNo", sn);
        result.put("matchedScope", matchedScope);
        result.put("templateId", matched == null ? null : matched.getId());
        result.put("templateKey", matched == null ? null : matched.getTemplateKey());
        result.put("templateName", matched == null ? null : matched.getTemplateName());
        result.put("sourceStyleNo", matched == null ? null : matched.getSourceStyleNo());
        result.put("fallbackOrderNo", fallbackOrderNo);
        result.put("content", content);
        return result;
    }

    private Map<String, Object> buildContentFromOrderWorkflow(String styleNo) {
        Long tenantId = TenantAssert.requireTenantId();
        ProductionOrder order = productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getStyleNo, styleNo)
                .isNotNull(ProductionOrder::getProgressWorkflowJson)
                .orderByDesc(ProductionOrder::getCreateTime)
                .last("limit 1"));
        if (order == null || !StringUtils.hasText(order.getProgressWorkflowJson())) {
            return null;
        }
        try {
            Map<String, Object> workflowRaw = objectMapper.readValue(order.getProgressWorkflowJson(), new TypeReference<Map<String, Object>>() {});
            List<Map<String, Object>> nodes = TemplateParseUtils.coerceListOfMap(workflowRaw.get("nodes"));
            if (nodes.isEmpty()) {
                return null;
            }
            Map<String, Object> content = parseProcessPriceTemplateContent(order.getProgressWorkflowJson());
            List<Map<String, Object>> steps = (List<Map<String, Object>>) content.get("steps");
            if (steps == null || steps.isEmpty()) {
                return null;
            }
            content.put("_fallbackOrderNo", order.getOrderNo());
            return content;
        } catch (Exception e) {
            log.warn("[TemplateQuery] 从订单workflow JSON提取工序数据失败, styleNo={}", styleNo, e);
            return null;
        }
    }

    private Map<String, Object> hidePricesFromContent(Map<String, Object> content) {
        if (content == null) return content;
        Map<String, Object> result = new LinkedHashMap<>(content);
        List<Map<String, Object>> steps = (List<Map<String, Object>>) result.get("steps");
        if (steps != null) {
            List<Map<String, Object>> cleanedSteps = new ArrayList<>();
            for (Map<String, Object> step : steps) {
                Map<String, Object> cleaned = new LinkedHashMap<>(step);
                cleaned.remove("unitPrice");
                cleaned.remove("price");
                cleaned.remove("sizePrices");
                cleanedSteps.add(cleaned);
            }
            result.put("steps", cleanedSteps);
        }
        return result;
    }

    public List<Map<String, Object>> listProcessPriceStyleOptions(String keyword) {
        String keywordText = StringUtils.hasText(keyword) ? keyword.trim() : null;
        // 外发工厂账号：只允许看本工厂有生产订单的款号
        String currentFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(currentFactoryId)) {
            return listProcessPriceStyleOptionsForFactory(currentFactoryId, keywordText);
        }
        Map<String, Map<String, Object>> merged = new LinkedHashMap<>();

        TenantAssert.assertTenantContext();
        Long tid = UserContext.tenantId();
        List<StyleInfo> styleInfos = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                .eq(StyleInfo::getTenantId, tid)
                .like(StringUtils.hasText(keywordText), StyleInfo::getStyleNo, keywordText)
                .orderByDesc(StyleInfo::getUpdateTime)
                .orderByDesc(StyleInfo::getCreateTime)
                .last("limit 30"));
        for (StyleInfo styleInfo : styleInfos) {
            String styleNo = styleInfo == null ? null : String.valueOf(styleInfo.getStyleNo() == null ? "" : styleInfo.getStyleNo()).trim();
            if (!StringUtils.hasText(styleNo) || merged.containsKey(styleNo)) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("styleNo", styleNo);
            item.put("styleName", StringUtils.hasText(styleInfo.getStyleName()) ? styleInfo.getStyleName().trim() : null);
            item.put("source", "style_info");
            merged.put(styleNo, item);
        }

        LambdaQueryWrapper<TemplateLibrary> tplWrapper = new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, "process_price")
                .isNotNull(TemplateLibrary::getSourceStyleNo)
                .ne(TemplateLibrary::getSourceStyleNo, "")
                .like(StringUtils.hasText(keywordText), TemplateLibrary::getSourceStyleNo, keywordText);
        if (tid != null) {
            tplWrapper.and(q -> q.eq(TemplateLibrary::getTenantId, tid).or().isNull(TemplateLibrary::getTenantId));
        } else {
            tplWrapper.isNull(TemplateLibrary::getTenantId);
        }
        tplWrapper.orderByDesc(TemplateLibrary::getUpdateTime)
                .orderByDesc(TemplateLibrary::getCreateTime)
                .last("limit 50");
        List<TemplateLibrary> templates = templateLibraryService.list(tplWrapper);
        for (TemplateLibrary template : templates) {
            String styleNo = template == null ? null : String.valueOf(template.getSourceStyleNo() == null ? "" : template.getSourceStyleNo()).trim();
            if (!StringUtils.hasText(styleNo) || merged.containsKey(styleNo)) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("styleNo", styleNo);
            item.put("styleName", null);
            item.put("source", "process_price_template");
            merged.put(styleNo, item);
        }

        return new ArrayList<>(merged.values());
    }

    private List<Map<String, Object>> listProcessPriceStyleOptionsForFactory(String factoryId, String keywordText) {
        Long tenantId = TenantAssert.requireTenantId();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getFactoryId, factoryId)
                .isNotNull(ProductionOrder::getStyleNo)
                .ne(ProductionOrder::getStyleNo, "")
                .like(StringUtils.hasText(keywordText), ProductionOrder::getStyleNo, keywordText)
                .last("limit 100")
                .list();
        Map<String, Map<String, Object>> merged = new LinkedHashMap<>();
        for (ProductionOrder order : orders) {
            String sn = order.getStyleNo() == null ? "" : order.getStyleNo().trim();
            if (!StringUtils.hasText(sn) || merged.containsKey(sn)) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("styleNo", sn);
            item.put("styleName", null);
            item.put("source", "production_order");
            merged.put(sn, item);
        }
        return new ArrayList<>(merged.values());
    }

    /**
     * 查询款号下当前工厂可选同步的订单列表（推送前订单选择弹窗用）
     */
    public List<Map<String, Object>> listSyncCandidateOrders(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        if (!StringUtils.hasText(sn)) return new ArrayList<>();
        String currentFactoryId = UserContext.factoryId();
        Long tenantId = TenantAssert.requireTenantId();
        LambdaQueryWrapper<ProductionOrder> q = new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getStyleNo, sn)
                .isNotNull(ProductionOrder::getStyleNo);
        if (StringUtils.hasText(currentFactoryId)) {
            q.eq(ProductionOrder::getFactoryId, currentFactoryId);
        }
        List<ProductionOrder> orders = productionOrderService.list(q);
        List<Map<String, Object>> result = new ArrayList<>();
        for (ProductionOrder o : orders) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", o.getId());
            m.put("orderNo", o.getOrderNo());
            m.put("styleNo", o.getStyleNo());
            m.put("status", o.getStatus());
            m.put("orderQuantity", o.getOrderQuantity());
            result.add(m);
        }
        return result;
    }

    private TemplateLibrary findStyleScopedProcessPriceTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        if (StringUtils.hasText(sn)) {
            return templateLibraryService.getOne(new LambdaQueryWrapper<TemplateLibrary>()
                    .eq(TemplateLibrary::getTemplateType, "process_price")
                    .eq(TemplateLibrary::getSourceStyleNo, sn)
                    .orderByDesc(TemplateLibrary::getUpdateTime)
                    .orderByDesc(TemplateLibrary::getCreateTime)
                    .last("limit 1"));
        }
        return null;
    }

    private Map<String, Object> parseProcessPriceTemplateContent(String rawJson) {
        Map<String, Object> content = new LinkedHashMap<>();
        List<Map<String, Object>> steps = new ArrayList<>();
        List<String> sizes = new ArrayList<>();
        List<String> images = new ArrayList<>();

        if (StringUtils.hasText(rawJson)) {
            try {
                Map<String, Object> raw = objectMapper.readValue(rawJson, new TypeReference<Map<String, Object>>() {});
                sizes.addAll(TemplateParseUtils.coerceListOfString(raw.get("sizes")));
                images.addAll(TemplateParseUtils.coerceListOfString(raw.get("images")));
                List<Map<String, Object>> items = TemplateParseUtils.coerceListOfMap(raw.get("steps"));
                if (items.isEmpty()) {
                    items = TemplateParseUtils.coerceListOfMap(raw.get("nodes"));
                }
                for (Map<String, Object> item : items) {
                    String processName = String.valueOf(item.getOrDefault("processName", item.getOrDefault("name", ""))).trim();
                    if (!StringUtils.hasText(processName)) {
                        continue;
                    }
                    Map<String, Object> step = new LinkedHashMap<>();
                    step.put("processCode", String.valueOf(item.getOrDefault("processCode", item.getOrDefault("id", ""))).trim());
                    step.put("processName", processName);
                    step.put("progressStage", String.valueOf(item.getOrDefault("progressStage", "")).trim());
                    step.put("machineType", String.valueOf(item.getOrDefault("machineType", "")).trim());
                    step.put("difficulty", String.valueOf(item.getOrDefault("difficulty", "")).trim());
                    step.put("standardTime", item.get("standardTime"));
                    step.put("unitPrice", item.containsKey("unitPrice") ? item.get("unitPrice") : item.get("price"));
                    Map<String, Object> sizePrices = TemplateParseUtils.coerceMap(item.get("sizePrices"));
                    if (!sizePrices.isEmpty()) {
                        step.put("sizePrices", sizePrices);
                    }
                    steps.add(step);
                }
            } catch (Exception e) {
                log.warn("解析工序单价模板内容失败");
            }
        }

        content.put("steps", steps);
        content.put("sizes", sizes);
        content.put("images", images);
        return content;
    }

    private String extractFirstTemplateImage(String rawJson) {
        if (!StringUtils.hasText(rawJson)) {
            return null;
        }
        try {
            Map<String, Object> raw = objectMapper.readValue(rawJson, new TypeReference<Map<String, Object>>() {});
            List<String> images = TemplateParseUtils.coerceListOfString(raw.get("images"));
            return images.isEmpty() ? null : images.get(0);
        } catch (Exception e) {
            log.debug("[TemplateQuery] extractFirstImage失败", e);
            return null;
        }
    }

}
