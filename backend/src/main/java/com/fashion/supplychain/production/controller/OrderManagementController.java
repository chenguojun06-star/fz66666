package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/order-management")
public class OrderManagementController {

  private static final Logger log = LoggerFactory.getLogger(OrderManagementController.class);


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
   * ⚠️ 重要修复：这个API只是更新款式状态为"可下单"，不会直接创建大货订单！
   * 用户需要在"下单管理"页面手动填写订单详情后才能创建订单。
   */
  @PostMapping("/create-from-style")
  public Result<?> createFromStyle(@RequestBody Map<String, Object> payload) {
    Object sidRaw = payload == null ? null : payload.get("styleId");
    Long styleId = null;
    try {
      if (sidRaw instanceof Number) {
        styleId = ((Number) sidRaw).longValue();
      } else if (sidRaw != null) {
        String s = String.valueOf(sidRaw).trim();
        if (s.length() > 0) {
          styleId = Long.parseLong(s);
        }
      }
    } catch (Exception ignored) {
    }

    if (styleId == null) {
      return Result.fail("缺少styleId");
    }

    StyleInfo style = styleInfoService.getById(styleId);
    if (style == null) {
      return Result.fail("款号不存在");
    }

    // 已推送过则禁止重复推送
    if (StringUtils.hasText(style.getOrderType())) {
      return Result.fail("该款已推送到下单管理，无需重复推送");
    }

    // ========== 核心修复：只更新款式状态，不创建订单 ==========
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

    // ========== 根据勾选的目标进行同步 ==========
    List<String> targetTypes = parseTargetTypes(payload == null ? null : payload.get("targetTypes"));
    if (targetTypes != null && !targetTypes.isEmpty()) {
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
            log.info("推送到下单管理时同步单价维护成功: styleId={}, styleNo={}, types={}", styleId, style.getStyleNo(), templateTypes);
          }
        }
      } catch (Exception e) {
        log.warn("推送到下单管理时同步单价维护失败，但不影响推送操作: styleId={}, error={}", styleId, e.getMessage());
      }

      try {
        if (targetTypes.contains("pattern")) {
          styleAttachmentOrchestrator.flowPatternToDataCenter(String.valueOf(styleId));
        }
      } catch (Exception e) {
        log.warn("推送到下单管理时同步资料中心失败，但不影响推送操作: styleId={}, error={}", styleId, e.getMessage());
      }
    }

    // 返回成功，但不创建订单
    Map<String, Object> data = new HashMap<>();
    data.put("styleId", styleId);
    data.put("styleNo", style.getStyleNo());
    data.put("status", "ready_for_order"); // 标记为可下单状态
    data.put("message", "已推送到下单管理，请在下单管理页面创建订单");
    return Result.success(data);
  }

  private List<String> parseTargetTypes(Object raw) {
    if (raw == null) {
      return null;
    }
    List<String> out = new ArrayList<>();
    if (raw instanceof List<?>) {
      for (Object it : (List<?>) raw) {
        if (it == null) continue;
        String v = String.valueOf(it).trim();
        if (v.length() > 0) out.add(v);
      }
      return out;
    }
    String s = String.valueOf(raw).trim();
    if (!s.isEmpty()) {
      out.add(s);
    }
    return out;
  }


}
