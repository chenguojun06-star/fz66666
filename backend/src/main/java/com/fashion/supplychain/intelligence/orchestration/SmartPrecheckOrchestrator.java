package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.PrecheckIssue;
import com.fashion.supplychain.intelligence.dto.PrecheckScanRequest;
import com.fashion.supplychain.intelligence.dto.PrecheckScanResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 扫码预检编排器 — 数据驱动的预检规则
 *
 * <p><b>已实现的预检项目：</b>
 * <ol>
 *   <li><b>重复扫码检测</b>：同一操作员+订单+工序在 10 分钟内已有成功扫码 → MEDIUM 风险提示</li>
 *   <li><b>高频异常检测</b>：操作员 1 小时内成功扫码次数 > 25 次 → MEDIUM 预警</li>
 *   <li><b>数量异常检查</b>：quantity 必须大于 0</li>
 *   <li><b>必填字段检查</b>：订单标识必少传一个</li>
 * </ol>
 *
 * <p>所有预检选项均为“只提示不拦截”：副作用调用，旧扫码流程不受影响。
 */
@Service
@Slf4j
public class SmartPrecheckOrchestrator {

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    public PrecheckScanResponse precheckScan(PrecheckScanRequest request) {
        PrecheckScanResponse response = new PrecheckScanResponse();
        response.setRiskLevel("LOW");

        if (request == null) {
            response.setRiskLevel("HIGH");
            PrecheckIssue issue = new PrecheckIssue();
            issue.setCode("INTEL_PRECHECK_EMPTY_REQUEST");
            issue.setLevel("HIGH");
            issue.setTitle("预检参数为空");
            issue.setReason("请求体缺失，无法执行扫码预检");
            issue.setSuggestion("请补齐订单、工序、数量后重试");
            response.getIssues().add(issue);
            response.getSuggestions().add("请检查前端入参映射是否完整");
            return response;
        }

        if (!StringUtils.hasText(request.getOrderId()) && !StringUtils.hasText(request.getOrderNo())) {
            response.setRiskLevel("MEDIUM");
            PrecheckIssue issue = new PrecheckIssue();
            issue.setCode("INTEL_PRECHECK_ORDER_MISSING");
            issue.setLevel("MEDIUM");
            issue.setTitle("订单标识缺失");
            issue.setReason("未传入 orderId 或 orderNo");
            issue.setSuggestion("请至少传入一个订单标识");
            response.getIssues().add(issue);
            response.getSuggestions().add("建议统一传递 orderId，减少歧义");
        }

        if (request.getQuantity() != null && request.getQuantity() <= 0) {
            response.setRiskLevel("MEDIUM");
            PrecheckIssue issue = new PrecheckIssue();
            issue.setCode("INTEL_PRECHECK_INVALID_QUANTITY");
            issue.setLevel("MEDIUM");
            issue.setTitle("扫码数量异常");
            issue.setReason("quantity 必须大于 0");
            issue.setSuggestion("请修正扫码数量后再提交");
            response.getIssues().add(issue);
            response.getSuggestions().add("建议在前端输入框增加最小值限制");
        }

        // ── 订单状态预检 ─────────────────────────────────────────────────
        checkOrderStatus(request, response);

        // ── 数据驱动预检（需要 operatorId）──────────────────────────────
        if (StringUtils.hasText(request.getOperatorId())) {
            checkDuplicateScan(request, response);
            checkScanFrequency(request.getOperatorId(), response);
        }

        if (response.getIssues().isEmpty()) {
            response.getSuggestions().add("预检通过，可继续执行扫码");
        }

        return response;
    }

    // ── 私有方法 ────────────────────────────────────────────────────────────

    /**
     * 订单状态检测：订单已完成/未开始/不存在时发出预警
     */
    private void checkOrderStatus(PrecheckScanRequest request, PrecheckScanResponse response) {
        try {
            if (!StringUtils.hasText(request.getOrderId())) return;
            ProductionOrder order = productionOrderMapper.selectById(request.getOrderId());
            if (order == null) {
                addIssue(response, "INTEL_PRECHECK_ORDER_NOT_FOUND", "MEDIUM",
                        "订单不存在", "未找到对应的生产订单记录", "请确认订单号是否正确");
                return;
            }
            if ("completed".equals(order.getStatus())) {
                addIssue(response, "INTEL_PRECHECK_ORDER_COMPLETED", "MEDIUM",
                        "订单已完成", "该生产订单状态为[已完成]，继续扫码可能产生多余记录",
                        "请确认是否需要补扫，确认后可继续提交");
            } else if ("pending".equals(order.getStatus())) {
                addIssue(response, "INTEL_PRECHECK_ORDER_PENDING", "LOW",
                        "订单尚未开始生产", "该订单状态为[待生产]，首次扫码将自动切换为生产中",
                        "如确认开工，可继续提交扫码");
            }
        } catch (Exception e) {
            log.debug("[预检] 订单状态检查失败（降级跳过）: {}", e.getMessage());
        }
    }

    /** 快捷添加预检问题 */
    private void addIssue(PrecheckScanResponse resp, String code, String level,
                          String title, String reason, String suggestion) {
        PrecheckIssue issue = new PrecheckIssue();
        issue.setCode(code);
        issue.setLevel(level);
        issue.setTitle(title);
        issue.setReason(reason);
        issue.setSuggestion(suggestion);
        resp.getIssues().add(issue);
        upgradeRiskLevel(resp, level);
    }

    /**
     * 重复扫码检测：同一操作员+订单+工序，10 分钟内是否已有成功扫码
     */
    private void checkDuplicateScan(PrecheckScanRequest request, PrecheckScanResponse response) {
        try {
            if (!StringUtils.hasText(request.getOrderId()) || !StringUtils.hasText(request.getProcessName())) {
                return;
            }
            LocalDateTime since = LocalDateTime.now().minusMinutes(10);
            Long count = scanRecordMapper.selectCount(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getOperatorId, request.getOperatorId())
                            .eq(ScanRecord::getOrderId, request.getOrderId())
                            .eq(ScanRecord::getProcessName, request.getProcessName())
                            .eq(ScanRecord::getScanResult, "success")
                            .ge(ScanRecord::getScanTime, since));
            if (count != null && count > 0) {
                PrecheckIssue issue = new PrecheckIssue();
                issue.setCode("INTEL_PRECHECK_DUPLICATE_SCAN");
                issue.setLevel("MEDIUM");
                issue.setTitle("注意：10分钟内已有相同扫码记录");
                issue.setReason(String.format("您在 10 分钟内已屡该订单+工序扫码成功 %d 次", count));
                issue.setSuggestion("若确认是重复漏扫，可继续提交；若不确定，建议先查看扫码记录");
                response.getIssues().add(issue);
                upgradeRiskLevel(response, "MEDIUM");
            }
        } catch (Exception e) {
            log.debug("[预检] 重复扫码筛查失败（降级忘记）: {}", e.getMessage());
        }
    }

    /**
     * 扫码频率异常检测：操作员 1 小时内成功扫码次数 > 25 次
     */
    private void checkScanFrequency(String operatorId, PrecheckScanResponse response) {
        try {
            LocalDateTime since = LocalDateTime.now().minusHours(1);
            Long count = scanRecordMapper.selectCount(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getOperatorId, operatorId)
                            .eq(ScanRecord::getScanResult, "success")
                            .ge(ScanRecord::getScanTime, since));
            if (count != null && count > 25) {
                PrecheckIssue issue = new PrecheckIssue();
                issue.setCode("INTEL_PRECHECK_HIGH_FREQUENCY");
                issue.setLevel("MEDIUM");
                issue.setTitle("扫码频率异常");
                issue.setReason(String.format("该操作员近 1 小时内已扫码成功 %d 次，高于正常阀值(25次)", count));
                issue.setSuggestion("请确认是否存在批量刷码行为，或手机扫码器异常重复提交");
                response.getIssues().add(issue);
                upgradeRiskLevel(response, "MEDIUM");
            }
        } catch (Exception e) {
            log.debug("[预检] 扫码频率筛查失败（降级忘记）: {}", e.getMessage());
        }
    }

    /** 风险等级只升不降（LOW → MEDIUM → HIGH） */
    private void upgradeRiskLevel(PrecheckScanResponse response, String newLevel) {
        String current = response.getRiskLevel();
        if ("HIGH".equals(current)) return;
        if ("MEDIUM".equals(newLevel) && "LOW".equals(current)) {
            response.setRiskLevel("MEDIUM");
        } else if ("HIGH".equals(newLevel)) {
            response.setRiskLevel("HIGH");
        }
    }
}
