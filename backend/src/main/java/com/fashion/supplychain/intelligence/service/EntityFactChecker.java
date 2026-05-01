package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class EntityFactChecker {

    @Autowired(required = false)
    private ProductionOrderService productionOrderService;
    @Autowired(required = false)
    private FactoryService factoryService;

    private static final Pattern ORDER_NO_PATTERN = Pattern.compile(
            "(?:PO[-_]?|ORD[-_]?|CUT[-_]?|订单[号#]?\\s*|order[-_]?no[.:]?\\s*)[A-Za-z0-9][-A-Za-z0-9]{4,30}",
            Pattern.CASE_INSENSITIVE);

    public record FactCheckResult(boolean allVerified, List<String> phantomEntities) {
        public String toWarningText() {
            if (phantomEntities.isEmpty()) return "";
            return "以下实体在系统中不存在：" + String.join("、", phantomEntities) + "，请勿引用。";
        }
    }

    public FactCheckResult verifyEntities(String aiContent) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<String> phantoms = new ArrayList<>();

        List<String> orderNos = extractOrderNos(aiContent);
        for (String orderNo : orderNos) {
            if (!orderExists(orderNo, tenantId)) {
                phantoms.add("订单号:" + orderNo);
            }
        }

        List<String> factoryNames = extractFactoryNames(aiContent);
        for (String name : factoryNames) {
            if (!factoryExists(name, tenantId)) {
                phantoms.add("工厂:" + name);
            }
        }

        if (!phantoms.isEmpty()) {
            log.warn("[EntityFactCheck] 发现{}个不存在的实体: {}", phantoms.size(), phantoms);
        }
        return new FactCheckResult(phantoms.isEmpty(), phantoms);
    }

    private List<String> extractOrderNos(String text) {
        List<String> results = new ArrayList<>();
        Matcher m = ORDER_NO_PATTERN.matcher(text);
        while (m.find()) {
            // 保留PO/ORD/CUT前缀（实际订单号格式），仅去掉中文标签
            var cleaned = m.group().replaceAll("^(?:订单[号#]?\\s*|order[-_]?no[.:]?\\s*)", "");
            if (!cleaned.isBlank()) results.add(cleaned);
        }
        return results.stream().distinct().limit(10).toList();
    }

    private List<String> extractFactoryNames(String text) {
        List<String> results = new ArrayList<>();
        Pattern p = Pattern.compile("(?:工厂|厂)[：: ]\\s*([^，。、！？\\s]{2,15})");
        Matcher m = p.matcher(text);
        while (m.find()) {
            results.add(m.group(1).trim());
        }
        return results.stream().distinct().limit(5).toList();
    }

    private boolean orderExists(String orderNo, Long tenantId) {
        if (productionOrderService == null || orderNo == null) return true;
        try {
            LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
            qw.eq(ProductionOrder::getOrderNo, orderNo);
            if (tenantId != null) qw.eq(ProductionOrder::getTenantId, tenantId);
            qw.select(ProductionOrder::getId).last("LIMIT 1");
            return productionOrderService.count(qw) > 0;
        } catch (Exception e) {
            log.debug("[EntityFactCheck] 订单查询失败，默认通过: {}", e.getMessage());
            return true;
        }
    }

    private boolean factoryExists(String name, Long tenantId) {
        if (factoryService == null || name == null) return true;
        try {
            LambdaQueryWrapper<Factory> qw = new LambdaQueryWrapper<>();
            qw.eq(Factory::getFactoryName, name);
            if (tenantId != null) qw.eq(Factory::getTenantId, tenantId);
            qw.select(Factory::getId).last("LIMIT 1");
            return factoryService.count(qw) > 0;
        } catch (Exception e) {
            log.debug("[EntityFactCheck] 工厂查询失败，默认通过: {}", e.getMessage());
            return true;
        }
    }
}
