package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/order-management")
public class OrderManagementController {

  @Autowired
  private ProductionOrderService productionOrderService;

  @Autowired
  private StyleInfoService styleInfoService;

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

    ProductionOrder order = new ProductionOrder();
    order.setStyleId(String.valueOf(style.getId()));
    order.setStyleNo(style.getStyleNo());
    order.setStyleName(style.getStyleName());
    order.setStatus("pending");
    order.setDeleteFlag(0);

    Object remarkRaw = payload.get("remark");
    String remark = remarkRaw == null ? null : String.valueOf(remarkRaw).trim();
    if (StringUtils.hasText(remark)) {
      order.setOperationRemark(remark);
    }

    Object qtyRaw = payload.get("orderQuantity");
    Integer qty = null;
    try {
      if (qtyRaw instanceof Number) {
        qty = ((Number) qtyRaw).intValue();
      } else if (qtyRaw != null) {
        String s = String.valueOf(qtyRaw).trim();
        if (s.length() > 0) {
          qty = Integer.parseInt(s);
        }
      }
    } catch (Exception ignored) {
    }
    if (qty == null || qty <= 0) {
      qty = 100;
    }
    order.setOrderQuantity(qty);

    // 设置默认工厂信息，避免数据库约束错误
    order.setFactoryId("0");
    order.setFactoryName("待分配");

    productionOrderService.saveOrUpdateOrder(order);

    Map<String, Object> data = new HashMap<>();
    data.put("orderId", order.getId());
    data.put("orderNo", order.getOrderNo());
    return Result.success(data);
  }
}
