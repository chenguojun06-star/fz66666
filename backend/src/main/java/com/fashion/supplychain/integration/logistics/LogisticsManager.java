package com.fashion.supplychain.integration.logistics;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 物流统一管理器（业务层唯一入口）
 *
 * ============================================================
 * 业务层使用方式（一行代码换物流公司）：
 * ============================================================
 * <pre>
 *   // 下单寄件
 *   ShippingRequest req = ShippingRequest.builder()
 *       .orderId("PO2026001")
 *       .logisticsType(LogisticsService.LogisticsType.SF)
 *       .sender(sender)
 *       .recipient(recipient)
 *       .cargo(cargo)
 *       .build();
 *   ShippingResponse resp = logisticsManager.createShipment(req);
 *   String trackingNo = resp.getTrackingNumber();  // 运单号
 *
 *   // 查询物流轨迹
 *   List<TrackingInfo> tracks = logisticsManager.trackShipment(
 *       trackingNo, LogisticsService.LogisticsType.SF);
 *
 *   // 估算运费
 *   Long fee = logisticsManager.estimateShippingFee(
 *       req, LogisticsService.LogisticsType.SF);
 *
 *   // 切换物流公司（只改 LogisticsType，业务代码不动）
 *   // .logisticsType(LogisticsService.LogisticsType.STO)
 * </pre>
 *
 * 渠道启用控制：
 * - sf-express.enabled=false → 该渠道不可用
 * - sf-express.enabled=true + 密钥已填 → 使用真实API
 * ============================================================
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LogisticsManager {

    /** Spring 自动注入所有 LogisticsService 实现 */
    private final List<LogisticsService> services;

    /** 集成跟踪记录服务（自动记录每次调用） */
    private final IntegrationRecordService recordService;

    /** 按类型缓存 */
    private Map<LogisticsService.LogisticsType, LogisticsService> serviceMap;

    // =====================================================
    // 核心业务方法
    // =====================================================

    /**
     * 创建运单（下单寄件）
     * @param request 寄件请求（必须设置 logisticsType）
     */
    public ShippingResponse createShipment(ShippingRequest request) {
        LogisticsService service = getService(request.getLogisticsType());
        log.info("[物流] 下单寄件 | company={} orderId={}", service.getCompanyName(), request.getOrderId());
        Long tenantId = UserContext.tenantId();
        try {
            ShippingResponse resp = service.createShipment(request);
            log.info("[物流] 下单成功 | company={} trackingNo={}", service.getCompanyName(), resp.getTrackingNumber());
            // 自动记录物流运单
            ShippingRequest.ContactInfo sender = request.getSender();
            ShippingRequest.ContactInfo receiver = request.getRecipient();
            recordService.saveLogisticsRecord(tenantId, request.getOrderId(),
                    service.getCompanyCode(), service.getCompanyName(), resp.getTrackingNumber(),
                    sender != null ? sender.getName() : null,
                    sender != null ? sender.getMobile() : null,
                    sender != null ? sender.getFullAddress() : null,
                    receiver != null ? receiver.getName() : null,
                    receiver != null ? receiver.getMobile() : null,
                    receiver != null ? receiver.getFullAddress() : null);
            return resp;
        } catch (LogisticsService.LogisticsException e) {
            log.error("[物流] 下单失败 | company={} orderId={}", service.getCompanyName(), request.getOrderId(), e);
            // 记录下单失败
            recordService.saveLogisticsFailure(tenantId, request.getOrderId(),
                    service.getCompanyCode(), service.getCompanyName(), e.getMessage());
            throw new LogisticsException("物流下单失败: " + e.getMessage(), e);
        }
    }

    /**
     * 取消运单
     */
    public boolean cancelShipment(String trackingNumber, String reason,
                                   LogisticsService.LogisticsType type) {
        LogisticsService service = getService(type);
        log.info("[物流] 取消运单 | company={} trackingNo={}", service.getCompanyName(), trackingNumber);
        try {
            return service.cancelShipment(trackingNumber, reason);
        } catch (LogisticsService.LogisticsException e) {
            throw new LogisticsException("取消运单失败: " + e.getMessage(), e);
        }
    }

    /**
     * 查询物流轨迹
     */
    public List<TrackingInfo> trackShipment(String trackingNumber,
                                             LogisticsService.LogisticsType type) {
        LogisticsService service = getService(type);
        log.debug("[物流] 查询轨迹 | company={} trackingNo={}", service.getCompanyName(), trackingNumber);
        try {
            return service.trackShipment(trackingNumber);
        } catch (LogisticsService.LogisticsException e) {
            throw new LogisticsException("查询物流轨迹失败: " + e.getMessage(), e);
        }
    }

    /**
     * 估算运费
     */
    public Long estimateShippingFee(ShippingRequest request,
                                     LogisticsService.LogisticsType type) {
        request.setLogisticsType(type);
        try {
            return getService(type).estimateShippingFee(request);
        } catch (LogisticsService.LogisticsException e) {
            throw new LogisticsException("估算运费失败: " + e.getMessage(), e);
        }
    }

    /**
     * 批量估算所有可用物流公司运费（比价用）
     */
    public Map<String, Long> compareShippingFees(ShippingRequest request) {
        return services.stream().collect(Collectors.toMap(
                LogisticsService::getCompanyName,
                s -> {
                    try {
                        request.setLogisticsType(s.getLogisticsType());
                        return s.estimateShippingFee(request);
                    } catch (Exception e) {
                        return -1L; // 不可用返回-1
                    }
                }
        ));
    }

    /**
     * 验证收货地址是否可达
     */
    public boolean validateAddress(String province, String city, String district,
                                    LogisticsService.LogisticsType type) {
        return getService(type).validateAddress(province, city, district);
    }

    /**
     * 获取所有可用物流公司
     */
    public List<String> getAvailableCompanies() {
        return services.stream()
                .map(LogisticsService::getCompanyName)
                .collect(Collectors.toList());
    }

    // =====================================================
    // 内部工具
    // =====================================================

    private LogisticsService getService(LogisticsService.LogisticsType type) {
        if (serviceMap == null) {
            serviceMap = services.stream()
                    .collect(Collectors.toMap(LogisticsService::getLogisticsType, Function.identity()));
        }
        LogisticsService service = serviceMap.get(type);
        if (service == null) {
            throw new LogisticsException("不支持的物流渠道: " + type);
        }
        return service;
    }

    /** 物流管理器异常 */
    public static class LogisticsException extends RuntimeException {
        public LogisticsException(String message) { super(message); }
        public LogisticsException(String message, Throwable cause) { super(message, cause); }
    }
}
