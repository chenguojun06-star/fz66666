package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 下单管理编排器
 * 负责款式推送到下单管理的跨域业务逻辑
 */
@Slf4j
@Service
public class OrderManagementOrchestrator {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleAttachmentOrchestrator styleAttachmentOrchestrator;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    /**
     * 从样衣开发推送到下单管理
     * 只更新款式状态为"可下单"，不会直接创建大货订单
     *
     * @param styleId     款式ID
     * @param targetTypes 推送目标类型列表
     * @return 推送结果
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createFromStyle(Long styleId, List<String> targetTypes) {
        if (styleId == null) {
            throw new IllegalArgumentException("缺少styleId");
        }

        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new IllegalArgumentException("款号不存在");
        }

        // 已推送过则禁止重复推送
        if (StringUtils.hasText(style.getOrderType())) {
            throw new IllegalStateException("该款已推送到下单管理，无需重复推送");
        }

        // 检查是否有工序单价配置
        List<StyleProcess> processList = styleProcessService.listByStyleId(styleId);
        if (processList == null || processList.isEmpty()) {
            log.warn("样衣无工序单价数据，但仍允许推送: styleId={}", styleId);
        }

        // 更新款式状态为"可下单"（样衣完成）
        String currentProgressNode = style.getProgressNode();
        if (!"样衣完成".equals(currentProgressNode)) {
            style.setProgressNode("样衣完成");
            styleInfoService.updateById(style);
            log.info("更新款式状态为可下单: styleId={}, styleNo={}, 原状态={}",
                    styleId, style.getStyleNo(), currentProgressNode);
        }

        // 绑定跟单员为当前推送人（复用orderType字段）
        String currentUser = UserContext.username();
        if (StringUtils.hasText(currentUser)) {
            style.setOrderType(currentUser.trim());
            styleInfoService.updateById(style);
        }

        // 根据勾选的目标进行同步
        if (targetTypes != null && !targetTypes.isEmpty()) {
            syncToTemplateLibrary(style, targetTypes);
            syncToDataCenter(style, styleId, targetTypes);
        }

        // 返回成功数据
        Map<String, Object> data = new HashMap<>();
        data.put("styleId", styleId);
        data.put("styleNo", style.getStyleNo());
        data.put("status", "ready_for_order");
        data.put("message", "已推送到下单管理，请在下单管理页面创建订单");
        return data;
    }

    private void syncToTemplateLibrary(StyleInfo style, List<String> targetTypes) {
        try {
            if (StringUtils.hasText(style.getStyleNo())) {
                List<String> templateTypes = new ArrayList<>();
                if (targetTypes.contains("size")) {
                    templateTypes.add("size");
                }
                if (targetTypes.contains("process") || targetTypes.contains("sizePrice")) {
                    templateTypes.add("process");
                }
                if (targetTypes.contains("process_price")) {
                    templateTypes.add("process_price");
                }
                if (targetTypes.contains("progress")) {
                    templateTypes.add("progress");
                }

                if (!templateTypes.isEmpty()) {
                    Map<String, Object> body = new HashMap<>();
                    body.put("sourceStyleNo", style.getStyleNo());
                    body.put("templateTypes", templateTypes);
                    templateLibraryOrchestrator.createFromStyle(body);
                    log.info("推送到下单管理时同步单价维护成功: styleId={}, styleNo={}, types={}",
                            style.getId(), style.getStyleNo(), templateTypes);
                }
            }
        } catch (Exception e) {
            log.warn("推送到下单管理时同步单价维护失败，但不影响推送操作: styleId={}, error={}",
                    style.getId(), e.getMessage());
        }
    }

    private void syncToDataCenter(StyleInfo style, Long styleId, List<String> targetTypes) {
        try {
            if (targetTypes.contains("pattern")) {
                styleAttachmentOrchestrator.flowPatternToDataCenter(String.valueOf(styleId));
            }
        } catch (Exception e) {
            log.warn("推送到下单管理时同步资料中心失败，但不影响推送操作: styleId={}, error={}",
                    styleId, e.getMessage());
        }
    }
}
