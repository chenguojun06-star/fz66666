package com.fashion.supplychain.integration.logistics;

import java.util.List;

/**
 * 统一物流服务接口
 * 定义与第三方物流平台交互的标准行为
 *
 * 使用方式：
 * 1. 后期获取物流API后，在对应的Adapter中实现具体逻辑
 * 2. 通过LogisticsType选择不同的物流公司
 * 3. 系统会自动同步物流轨迹信息
 */
public interface LogisticsService {

    /**
     * 获取物流公司名称
     * @return 如 "顺丰速运", "申通快递"
     */
    String getCompanyName();

    /**
     * 获取物流公司代码
     * @return 如 "SF", "STO", "YTO"
     */
    String getCompanyCode();

    /**
     * 获取物流类型
     */
    LogisticsType getLogisticsType();

    /**
     * 创建运单（下单寄件）
     *
     * @param request 寄件请求参数
     * @return 运单响应（包含运单号）
     * @throws LogisticsException 下单失败时抛出
     */
    ShippingResponse createShipment(ShippingRequest request) throws LogisticsException;

    /**
     * 取消运单
     *
     * @param trackingNumber 运单号
     * @param reason 取消原因
     * @return 是否取消成功
     * @throws LogisticsException 取消失败时抛出
     */
    boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException;

    /**
     * 查询物流轨迹
     *
     * @param trackingNumber 运单号
     * @return 物流轨迹信息列表
     * @throws LogisticsException 查询失败时抛出
     */
    List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException;

    /**
     * 获取运费估算
     *
     * @param request 寄件信息
     * @return 预估运费（单位：分）
     * @throws LogisticsException 查询失败时抛出
     */
    Long estimateShippingFee(ShippingRequest request) throws LogisticsException;

    /**
     * 验证地址是否在服务范围
     *
     * @param province 省份
     * @param city 城市
     * @param district 区县
     * @return 是否可达
     */
    boolean validateAddress(String province, String city, String district);

    /**
     * 该渠道是否已接入真实第三方 API。
     *
     * <p><b>为什么需要它</b>：目前 8 家快递适配器均为 Mock 实现——运单号是
     * {@code "SF" + 时间戳} 拼的、轨迹是编造的、运费是写死的常量。
     * 若把这些假运单号回传给真实电商平台，会污染平台侧的真实订单。
     * 因此需要一个显式标识来区分"真接入"与"Mock"。
     *
     * <p><b>默认返回 false</b>：未接入的适配器无需改动；将来某家真正接入 API 后，
     * 在其适配器内 override 本方法返回 {@code true} 即可，阻断逻辑会自动放行该渠道。
     *
     * @return true=已接入真实API；false=Mock/降级实现（其运单号不可信、不得外传）
     */
    default boolean isRealImplementation() {
        return false;
    }

    /**
     * 物流公司类型枚举
     */
    enum LogisticsType {
        SF("顺丰速运", "SF"),
        STO("申通快递", "STO"),
        YTO("圆通速递", "YTO"),
        ZTO("中通快递", "ZTO"),
        EMS("中国邮政", "EMS"),
        JD("京东物流", "JD"),
        YD("韵达快递", "YD"),
        JT("极兔速递", "JT");

        private final String displayName;
        private final String code;

        LogisticsType(String displayName, String code) {
            this.displayName = displayName;
            this.code = code;
        }

        public String getDisplayName() {
            return displayName;
        }

        public String getCode() {
            return code;
        }
    }

    /**
     * 物流异常类
     */
    class LogisticsException extends Exception {
        private final String errorCode;

        public LogisticsException(String message) {
            super(message);
            this.errorCode = "UNKNOWN";
        }

        public LogisticsException(String errorCode, String message) {
            super(message);
            this.errorCode = errorCode;
        }

        public LogisticsException(String errorCode, String message, Throwable cause) {
            super(message, cause);
            this.errorCode = errorCode;
        }

        public String getErrorCode() {
            return errorCode;
        }
    }
}
