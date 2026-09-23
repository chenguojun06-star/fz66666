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
 *
 * ⚠️ 当前实况（务必知悉）：
 * 8 家快递适配器（SF/STO/YTO/ZTO/EMS/JD/YD/JT）**尚未接入真实第三方 API**，
 * 均为 Mock 实现（运单号 {@code "SF"+时间戳}、运费写死、轨迹编造）。
 * 因此本管理器对下单/取消/查轨迹/运费报价统一执行 {@link #requireRealChannel} 守卫，
 * 直接报"不可用"而非返回编造数据——避免假运单号回传电商平台污染真实订单。
 * 某家真正接入 API 后，在其适配器 override {@code isRealImplementation()} 返回 true 即可放行。
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
     * @throws LogisticsException 渠道尚未接入真实第三方API时抛出（不返回 Mock 运单号）
     */
    public ShippingResponse createShipment(ShippingRequest request) {
        LogisticsService service = getService(request.getLogisticsType());
        requireRealChannel(service, "自动下单寄件");
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
        requireRealChannel(service, "自动取消运单");
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
        requireRealChannel(service, "自动查询物流轨迹");
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
        LogisticsService service = getService(type);
        requireRealChannel(service, "自动获取运费报价");
        request.setLogisticsType(type);
        try {
            return service.estimateShippingFee(request);
        } catch (LogisticsService.LogisticsException e) {
            throw new LogisticsException("估算运费失败: " + e.getMessage(), e);
        }
    }

    /**
     * 批量估算所有物流公司运费（比价用）。
     *
     * <p>未接入真实API的渠道不返回写死的假报价，统一返回 -1（不可用），
     * 前端据此展示"暂不可比价"，而不是把假运费当真报价。
     */
    public Map<String, Long> compareShippingFees(ShippingRequest request) {
        return services.stream().collect(Collectors.toMap(
                LogisticsService::getCompanyName,
                s -> {
                    if (!s.isRealImplementation()) {
                        return -1L; // Mock 渠道：报价不可信
                    }
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

    /**
     * 指定渠道是否已接入真实第三方 API。
     *
     * <p>用于发货链路警示：Mock 渠道返回的运单号不可信，不得外传真实电商平台。
     *
     * @param type 物流渠道类型
     * @return true=已接入真实API；false=Mock实现 或 渠道未注册
     */
    public boolean isRealImplementation(LogisticsService.LogisticsType type) {
        if (type == null) {
            return false;
        }
        LogisticsService service = lookup(type);
        return service != null && service.isRealImplementation();
    }

    /**
     * 判断给定的快递公司标识是否为「已知的 Mock 渠道」。
     *
     * <p><b>为什么需要它</b>：电商订单里的 {@code expressCompany} 可能是平台带过来的
     * 真实快递公司名（这类不该被拦），也可能是本系统 Mock 渠道产生的代码
     * （如 "SF"/"顺丰速运"）。只有当它能匹配到本系统已注册、且尚未接入真实 API 的
     * 适配器时，才判定为「不可信运单号」，需要阻断回传。
     *
     * <p>识别不出（未注册）的渠道返回 false——即不阻断，避免误伤平台侧真实快递。
     *
     * @param company 渠道代码(SF/STO...)、英文名、中文名(顺丰速运...) 之一，忽略大小写与首尾空白
     * @return true=已知 Mock 渠道（其运单号不可信）
     */
    public boolean isKnownMockChannel(String company) {
        if (company == null || company.isBlank()) {
            return false;
        }
        String key = company.trim();
        for (LogisticsService service : services) {
            LogisticsService.LogisticsType type = service.getLogisticsType();
            if (matches(key, service.getCompanyCode())
                    || matches(key, service.getCompanyName())
                    || matches(key, type != null ? type.name() : null)
                    || matches(key, type != null ? type.getCode() : null)
                    || matches(key, type != null ? type.getDisplayName() : null)) {
                return !service.isRealImplementation();
            }
        }
        return false;
    }

    private static boolean matches(String key, String candidate) {
        return candidate != null && candidate.equalsIgnoreCase(key);
    }

    /**
     * 止血守卫（P0）：Mock 渠道不得对外部系统产生任何"假成功"。
     *
     * <p><b>背景</b>：8 家快递适配器长期是 Mock 实现——运单号 {@code "SF"+时间戳}、
     * 运费写死常量、轨迹编造、取消永远返回 true。这些假数据一旦进入业务链路，
     * 会被当成真实结果使用（假运单号回传电商平台、假取消成功、假运费报价）。
     *
     * <p><b>策略</b>：与其返回编造的数据，不如显式报"不可用"，让业务层走人工流程。
     * 将来某家真正接入 API 后，只需在其适配器 override {@code isRealImplementation()}
     * 返回 true，本守卫自动放行，无需改动此处代码。
     *
     * @param service 目标渠道实现
     * @param action  动作描述（用于拼接错误信息）
     * @throws LogisticsException 渠道尚未接入真实API
     */
    private void requireRealChannel(LogisticsService service, String action) {
        if (service.isRealImplementation()) {
            return;
        }
        String message = "快递渠道「" + service.getCompanyName() + "」尚未接入真实第三方API，无法" + action
                + "；请在快递公司后台人工操作后，将真实结果录入系统";
        log.warn("[物流] 已拦截Mock渠道操作 | company={} action={}",
                service.getCompanyName(), action);
        throw new LogisticsException(message);
    }

    /** 静默查找渠道实现（不抛异常，找不到返回 null） */
    private LogisticsService lookup(LogisticsService.LogisticsType type) {
        if (serviceMap == null) {
            serviceMap = services.stream()
                    .collect(Collectors.toMap(LogisticsService::getLogisticsType, Function.identity()));
        }
        return serviceMap.get(type);
    }

    // =====================================================
    // 内部工具
    // =====================================================

    private LogisticsService getService(LogisticsService.LogisticsType type) {
        LogisticsService service = lookup(type);
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
