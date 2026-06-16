package com.fashion.supplychain.style.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.style.entity.StyleInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 客户信息同步辅助类
 * 当款式选择客户时，自动填充客户详细信息到款号的冗余字段
 * 避免打印/展示时频繁 JOIN
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class StyleCustomerSyncHelper {

    private final CustomerService customerService;

    /**
     * 同步客户信息到款号
     * 当用户选择了客户ID后，自动填充客户名称/联系人/电话/地址
     *
     * @param styleInfo 款式信息
     */
    public void syncCustomerInfo(StyleInfo styleInfo) {
        if (styleInfo == null) {
            return;
        }

        // 如果没有客户ID，直接返回
        if (styleInfo.getCustomerId() == null) {
            // 清空冗余的客户字段
            styleInfo.setCustomerName(null);
            styleInfo.setCustomerContact(null);
            styleInfo.setCustomerPhone(null);
            styleInfo.setCustomerAddress(null);
            return;
        }

        // 如果客户名称已填充（用户手动输入的），不再覆盖
        if (StringUtils.hasText(styleInfo.getCustomerName())
                && StringUtils.hasText(styleInfo.getCustomerContact())
                && StringUtils.hasText(styleInfo.getCustomerPhone())) {
            // 用户已手动填写完整客户信息，跳过自动填充
            return;
        }

        // 查询客户信息并填充
        try {
            Customer customer = customerService.getById(styleInfo.getCustomerId());
            if (customer != null) {
                syncFromCustomer(styleInfo, customer);
                log.info("客户信息同步成功: styleId={}, customerId={}, customerName={}",
                        styleInfo.getId(), customer.getId(), customer.getCompanyName());
            } else {
                log.warn("客户不存在: customerId={}", styleInfo.getCustomerId());
            }
        } catch (Exception e) {
            log.warn("客户信息同步失败: customerId={}, error={}", styleInfo.getCustomerId(), e.getMessage());
        }
    }

    /**
     * 批量同步客户信息
     *
     * @param styleList 款式列表
     */
    public void syncCustomerInfoBatch(java.util.List<StyleInfo> styleList) {
        if (styleList == null || styleList.isEmpty()) {
            return;
        }

        // 找出所有有客户ID的款式
        java.util.List<Long> customerIds = styleList.stream()
                .filter(s -> s.getCustomerId() != null)
                .map(StyleInfo::getCustomerId)
                .distinct()
                .toList();

        if (customerIds.isEmpty()) {
            return;
        }

        // 批量查询客户信息
        java.util.Map<String, Customer> customerMap = new java.util.HashMap<>();
        try {
            LambdaQueryWrapper<Customer> wrapper = new LambdaQueryWrapper<Customer>()
                    .in(Customer::getId, customerIds);
            customerService.list(wrapper).forEach(c -> customerMap.put(c.getId(), c));
        } catch (Exception e) {
            log.warn("批量客户信息查询失败: error={}", e.getMessage());
            return;
        }

        // 填充客户信息
        for (StyleInfo style : styleList) {
            if (style.getCustomerId() != null && customerMap.containsKey(String.valueOf(style.getCustomerId()))) {
                syncFromCustomer(style, customerMap.get(String.valueOf(style.getCustomerId())));
            }
        }
    }

    /**
     * 从客户实体复制信息到款式
     */
    private void syncFromCustomer(StyleInfo style, Customer customer) {
        if (!StringUtils.hasText(style.getCustomerName())) {
            style.setCustomerName(customer.getCompanyName());
        }
        if (!StringUtils.hasText(style.getCustomerContact())) {
            style.setCustomerContact(customer.getContactPerson());
        }
        if (!StringUtils.hasText(style.getCustomerPhone())) {
            style.setCustomerPhone(customer.getContactPhone());
        }
        if (!StringUtils.hasText(style.getCustomerAddress())) {
            style.setCustomerAddress(customer.getAddress());
        }
    }

    /**
     * 从款式提取客户信息 Map（用于返回给前端）
     */
    public java.util.Map<String, Object> extractCustomerInfo(StyleInfo style) {
        java.util.Map<String, Object> info = new java.util.LinkedHashMap<>();
        if (style == null) {
            return info;
        }
        info.put("salesChannel", style.getSalesChannel());
        info.put("customerId", style.getCustomerId());
        info.put("customerName", style.getCustomerName());
        info.put("customerContact", style.getCustomerContact());
        info.put("customerPhone", style.getCustomerPhone());
        info.put("customerAddress", style.getCustomerAddress());
        return info;
    }
}
