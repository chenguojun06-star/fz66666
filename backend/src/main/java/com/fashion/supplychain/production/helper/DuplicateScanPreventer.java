package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.TimeUnit;

/**
 * 防重复扫码检测器
 * 职责：
 * 1. 检测重复requestId
 * 2. 基于时间间隔的防重复算法
 * 3. 数据库唯一键冲突处理
 *
 * 提取自 ScanRecordOrchestrator（减少约200行代码）
 */
@Component
@Slf4j
public class DuplicateScanPreventer {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private DistributedLockService distributedLockService;

    /**
     * 根据requestId查找扫码记录
     * 用于防止重复提交
     */
    public ScanRecord findByRequestId(String requestId) {
        if (!hasText(requestId)) {
            return null;
        }
        try {
            return scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getRequestId, requestId)
                    .last("limit 1"));
        } catch (Exception e) {
            log.warn("Failed to query scan record by requestId: {}", requestId, e);
            return null;
        }
    }

    /**
     * AI 财务风控拦截器 - 检查单次扫码数量与标准工时的合理性
     * 防止工人刷单：例如 1 小时内扫了 1000 件耗时 20 分钟的工序
     */
    public void validateReasonableOutput(String operatorId, Integer quantity, Integer standardMinutes) {
        if (quantity == null || standardMinutes == null || quantity <= 0 || standardMinutes <= 0) {
            return;
        }
        
        // 假设正常人最高效率是标准的 2 倍
        double expectedMaxPerHour = (60.0 / standardMinutes) * 2; 
        
        // 如果本次扫码的数量超过了 4 小时的极限产量，则拦截
        if (quantity > expectedMaxPerHour * 4) {
            log.warn("[AI 财务风控] 拦截异常扫码: 操作人={}, 数量={}, 标准工时={}", operatorId, quantity, standardMinutes);
            throw new IllegalStateException("AI 财务风控拦截：单次扫码数量超出了合理的人类极限产能，请拆分批次或联系厂长核实。");
        }
    }

    /**
     * 检查是否存在近期重复扫码
     *
     * 防重复算法（优化版 2026-02-15）：
     * minInterval = min(300, max(30, 菲号数量 × 工序分钟 × 60 × 0.1))
     *
     * 改进点：
     * 1. 系数从 0.5 降低到 0.1（降低等待时间）
     * 2. 添加上限 300秒（5分钟），避免过长等待
     * 3. 保留下限 30秒，防止误操作
     *
     * 示例：50件菲号 × 2分钟/件
     *   - 预期时间 = 50 × 2 × 60 = 6000秒（100分钟）
     *   - 计算间隔 = 6000 × 0.1 = 600秒（10分钟）
     *   - 最终间隔 = min(300, max(30, 600)) = 300秒（5分钟） ✅ 合理
     *
     * @param scanCode 扫码内容
     * @param scanType 扫码类型
     * @param bundleQuantity 菲号数量
     * @param processMinutes 工序标准用时（分钟）
     * @return 如果存在重复返回true
     */
    public boolean hasRecentDuplicateScan(String scanCode, String scanType,
                                          Integer bundleQuantity, Integer processMinutes) {
        return hasRecentDuplicateScan(scanCode, scanType, bundleQuantity, processMinutes, null, null);
    }

    /**
     * 检查是否存在近期重复扫码（支持按工序和操作人缩小范围）
     * 使用分布式锁防止TOCTOU竞态条件
     */
    public boolean hasRecentDuplicateScan(String scanCode, String scanType,
                                          Integer bundleQuantity, Integer processMinutes,
                                          String processCode, String operatorId) {
        if (!hasText(scanCode)) {
            return false;
        }

        String lockKey = "scan:dedup:" + scanCode + ":" + (hasText(scanType) ? scanType : "")
                + ":" + (hasText(processCode) ? processCode : "");
        return distributedLockService.executeWithLock(lockKey, 5, TimeUnit.SECONDS, () -> {
            try {
                int minIntervalSeconds = calculateMinIntervalSeconds(bundleQuantity, processMinutes);

                LocalDateTime cutoffTime = LocalDateTime.now().minus(minIntervalSeconds, ChronoUnit.SECONDS);

                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getScanCode, scanCode)
                        .eq(ScanRecord::getScanResult, "success")
                        .ge(ScanRecord::getScanTime, cutoffTime)
                        .last("limit 1");

                if (hasText(scanType)) {
                    wrapper.eq(ScanRecord::getScanType, scanType);
                }
                if (hasText(processCode)) {
                    wrapper.eq(ScanRecord::getProcessCode, processCode);
                }
                if (hasText(operatorId)) {
                    wrapper.eq(ScanRecord::getOperatorId, operatorId);
                }

                ScanRecord recent = scanRecordService.getOne(wrapper);

                if (recent != null) {
                    log.warn("防重复拦截: scanCode={}, scanType={}, processCode={}, operatorId={}, 最近扫码时间={}, 最小间隔={}秒",
                            scanCode, scanType, processCode, operatorId, recent.getScanTime(), minIntervalSeconds);
                    return true;
                }

                return false;
            } catch (Exception e) {
                log.error("检查重复扫码失败: scanCode={}", scanCode, e);
                return false;
            }
        });
    }

    public boolean isWithinDuplicateInterval(LocalDateTime scanTime,
                                             Integer bundleQuantity,
                                             Integer processMinutes) {
        if (scanTime == null) {
            return false;
        }
        int minIntervalSeconds = calculateMinIntervalSeconds(bundleQuantity, processMinutes);
        LocalDateTime cutoffTime = LocalDateTime.now().minus(minIntervalSeconds, ChronoUnit.SECONDS);
        return !scanTime.isBefore(cutoffTime);
    }

    public int calculateMinIntervalSeconds(Integer bundleQuantity, Integer processMinutes) {
        int minIntervalSeconds = 30;
        if (bundleQuantity != null && bundleQuantity > 0
                && processMinutes != null && processMinutes > 0) {
            int expectedTime = bundleQuantity * processMinutes * 60;
            int calculatedInterval = expectedTime / 10;
            minIntervalSeconds = Math.min(300, Math.max(30, calculatedInterval));
        }
        return minIntervalSeconds;
    }

    /**
     * 处理数据库唯一键冲突
     * 返回友好的错误信息
     */
    public String handleDuplicateKeyException(DuplicateKeyException e,
                                              String orderId, String requestId) {
        log.info("扫码记录重复忽略: orderId={}, requestId={}", orderId, requestId);
        return "该扫码记录已存在，已自动忽略重复提交";
    }

    /**
     * 验证requestId格式
     */
    public void validateRequestId(String requestId) {
        if (hasText(requestId) && requestId.length() > 64) {
            throw new IllegalArgumentException("requestId过长（最多64字符）");
        }
    }

    /**
     * 生成默认requestId
     */
    public String generateRequestId() {
        return java.util.UUID.randomUUID().toString().replace("-", "");
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
