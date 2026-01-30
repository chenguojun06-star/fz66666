package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
  private ProductionOrderService productionOrderService;

  @Autowired
  private StyleInfoService styleInfoService;

  @Autowired
  private StyleProcessService styleProcessService;

  @Autowired
  private TemplateLibraryService templateLibraryService;

  @Autowired
  private ObjectMapper objectMapper;

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

    // ========== 同步工序单价到单价维护（模板库）==========
    // 这样用户可以在"单价维护"页面查看和修改工序单价
    try {
      if (StringUtils.hasText(style.getStyleNo())) {
        // 推送 BOM、工序、工序单价、进度节点 到模板库
        List<String> templateTypes = List.of("bom", "process", "process_price", "progress");
        templateLibraryService.createFromStyle(style.getStyleNo(), templateTypes);
        log.info("推送到下单管理时同步单价维护成功: styleId={}, styleNo={}", styleId, style.getStyleNo());
      }
    } catch (Exception e) {
      log.warn("推送到下单管理时同步单价维护失败，但不影响推送操作: styleId={}, error={}", styleId, e.getMessage());
    }

    // 返回成功，但不创建订单
    Map<String, Object> data = new HashMap<>();
    data.put("styleId", styleId);
    data.put("styleNo", style.getStyleNo());
    data.put("status", "ready_for_order"); // 标记为可下单状态
    data.put("message", "已推送到下单管理，请在下单管理页面创建订单");
    return Result.success(data);
  }

  /**
   * 将 StyleProcess 列表转换为 progressWorkflowJson 格式
   * 格式: {"nodes": [{"id": "xxx", "name": "裁剪", "unitPrice": 1.5}, ...]}
   */
  private String buildProgressWorkflowJson(List<StyleProcess> processList) {
    if (processList == null || processList.isEmpty()) {
      return null;
    }

    // 按 progressStage（进度节点）分组聚合工序
    Map<String, List<StyleProcess>> byStage = new LinkedHashMap<>();
    for (StyleProcess p : processList) {
      String stage = p.getProgressStage();
      if (!StringUtils.hasText(stage)) {
        stage = p.getProcessName(); // 如果没有进度节点，使用工序名称
      }
      if (!StringUtils.hasText(stage)) {
        continue;
      }
      stage = stage.trim();
      byStage.computeIfAbsent(stage, k -> new ArrayList<>()).add(p);
    }

    // 构建节点列表
    List<Map<String, Object>> nodes = new ArrayList<>();
    for (Map.Entry<String, List<StyleProcess>> entry : byStage.entrySet()) {
      String stageName = entry.getKey();
      List<StyleProcess> processes = entry.getValue();

      // 计算该进度节点下所有工序的单价总和
      BigDecimal totalPrice = BigDecimal.ZERO;
      List<Map<String, Object>> subProcesses = new ArrayList<>();

      for (StyleProcess p : processes) {
        BigDecimal price = p.getPrice();
        if (price != null && price.compareTo(BigDecimal.ZERO) > 0) {
          totalPrice = totalPrice.add(price);
        }

        Map<String, Object> subProcess = new LinkedHashMap<>();
        subProcess.put("id", StringUtils.hasText(p.getProcessCode()) ? p.getProcessCode() : p.getId());
        subProcess.put("processName", StringUtils.hasText(p.getProcessName()) ? p.getProcessName() : stageName);
        subProcess.put("unitPrice", price != null ? price.setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO);
        subProcesses.add(subProcess);
      }

      Map<String, Object> node = new LinkedHashMap<>();
      node.put("id", stageName.toLowerCase().replaceAll("[^a-z0-9]", "_"));
      node.put("name", stageName);
      node.put("unitPrice", totalPrice.setScale(2, RoundingMode.HALF_UP));
      node.put("processes", subProcesses);
      nodes.add(node);
    }

    if (nodes.isEmpty()) {
      return null;
    }

    try {
      Map<String, Object> root = new LinkedHashMap<>();
      root.put("nodes", nodes);
      return objectMapper.writeValueAsString(root);
    } catch (Exception e) {
      log.warn("序列化工序JSON失败", e);
      return null;
    }
  }
}
