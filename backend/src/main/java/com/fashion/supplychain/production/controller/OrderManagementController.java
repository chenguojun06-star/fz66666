package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.OrderManagementOrchestrator;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/order-management")
@PreAuthorize("isAuthenticated()")
public class OrderManagementController {

  private static final Logger log = LoggerFactory.getLogger(OrderManagementController.class);

  @Autowired
  private OrderManagementOrchestrator orderManagementOrchestrator;

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

    try {
      List<String> targetTypes = parseTargetTypes(payload == null ? null : payload.get("targetTypes"));
      Map<String, Object> data = orderManagementOrchestrator.createFromStyle(styleId, targetTypes);
      return Result.success(data);
    } catch (IllegalArgumentException | IllegalStateException e) {
      return Result.fail(e.getMessage());
    } catch (Exception e) {
      log.error("推送到下单管理失败: styleId={}", styleId, e);
      return Result.fail("推送失败：" + e.getMessage());
    }
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
