package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

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
        if (!hasText(scanCode)) {
            return false;
        }

        try {
            // 计算最小间隔（秒）- 优化算法
            int minIntervalSeconds = 30; // 默认30秒底线

            if (bundleQuantity != null && bundleQuantity > 0
                    && processMinutes != null && processMinutes > 0) {
                // 预期完成时间（秒）
                int expectedTime = bundleQuantity * processMinutes * 60;
                // 计算间隔（改为 10% 而非 50%）
                int calculatedInterval = expectedTime / 10;
                // 应用范围限制：30秒～300秒（5分钟）
                minIntervalSeconds = Math.min(300, Math.max(30, calculatedInterval));
            }

            LocalDateTime cutoffTime = LocalDateTime.now().minus(minIntervalSeconds, ChronoUnit.SECONDS);

            LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getScanCode, scanCode)
                    .eq(ScanRecord::getScanResult, "success")
                    .ge(ScanRecord::getScanTime, cutoffTime)
                    .last("limit 1");

            if (hasText(scanType)) {
                wrapper.eq(ScanRecord::getScanType, scanType);
            }

            ScanRecord recent = scanRecordService.getOne(wrapper);

            if (recent != null) {
                log.warn("防重复拦截: scanCode={}, scanType={}, 最近扫码时间={}, 最小间隔={}秒",
                        scanCode, scanType, recent.getScanTime(), minIntervalSeconds);
                return true;
            }

            return false;
        } catch (Exception e) {
            log.error("检查重复扫码失败: scanCode={}", scanCode, e);
            return false; // 检查失败时不拦截
        }
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
