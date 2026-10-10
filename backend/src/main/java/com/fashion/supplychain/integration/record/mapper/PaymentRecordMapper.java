package com.fashion.supplychain.integration.record.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.record.entity.PaymentRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface PaymentRecordMapper extends BaseMapper<PaymentRecord> {

    @Select("SELECT * FROM t_payment_record WHERE tenant_id = #{tenantId} AND order_id = #{orderId} ORDER BY created_time DESC")
    List<PaymentRecord> findByOrderId(Long tenantId, String orderId);

    @Select("SELECT * FROM t_payment_record WHERE third_party_order_id = #{thirdPartyOrderId} AND tenant_id = #{tenantId} LIMIT 1")
    PaymentRecord findByThirdPartyOrderId(@Param("thirdPartyOrderId") String thirdPartyOrderId, @Param("tenantId") Long tenantId);

    /** 取该业务单最近一条支付流水（判断"是否已有待支付单可复用"） */
    @Select("SELECT * FROM t_payment_record WHERE tenant_id = #{tenantId} AND order_id = #{orderId} "
            + "AND channel = #{channel} ORDER BY id DESC LIMIT 1")
    PaymentRecord findLatest(@Param("tenantId") Long tenantId,
                            @Param("orderId") String orderId,
                            @Param("channel") String channel);

    /**
     * 幂等置为已支付：**只有仍是 PENDING 才能改成 SUCCESS**。
     *
     * <p>返回影响行数 = 1 表示"本次调用完成了状态跃迁"，调用方据此决定要不要执行业务落账；
     * 返回 0 表示已被处理过（重复回调）或记录不存在 → 直接当成功返回，不再落账。
     *
     * <p>这是整个支付链路防重复的核心：微信/支付宝都会重复推送回调，
     * 而"发货 / 出库 / 记应收"重复执行等于凭空多发一次货。
     */
    @Update("UPDATE t_payment_record SET status = 'SUCCESS', third_party_order_id = #{thirdPartyOrderId}, "
            + "actual_amount = #{paidFen}, paid_time = NOW(), error_message = NULL "
            + "WHERE tenant_id = #{tenantId} AND order_id = #{orderId} AND channel = #{channel} "
            + "AND status = 'PENDING'")
    int casMarkPaid(@Param("tenantId") Long tenantId,
                    @Param("orderId") String orderId,
                    @Param("channel") String channel,
                    @Param("thirdPartyOrderId") String thirdPartyOrderId,
                    @Param("paidFen") Long paidFen);

    /** 幂等置为已关闭（超时未支付 / 用户取消） */
    @Update("UPDATE t_payment_record SET status = 'CANCELLED', error_message = #{reason} "
            + "WHERE tenant_id = #{tenantId} AND order_id = #{orderId} AND channel = #{channel} "
            + "AND status = 'PENDING'")
    int casMarkClosed(@Param("tenantId") Long tenantId,
                      @Param("orderId") String orderId,
                      @Param("channel") String channel,
                      @Param("reason") String reason);

    /** 幂等置为已退款 */
    @Update("UPDATE t_payment_record SET status = 'REFUNDED' "
            + "WHERE tenant_id = #{tenantId} AND order_id = #{orderId} AND channel = #{channel} "
            + "AND status = 'SUCCESS'")
    int casMarkRefunded(@Param("tenantId") Long tenantId,
                        @Param("orderId") String orderId,
                        @Param("channel") String channel);

    /** 回填二维码 / 三方单号（发起支付后） */
    @Update("UPDATE t_payment_record SET qr_code = #{qrCode}, pay_url = #{payUrl}, "
            + "third_party_order_id = #{thirdPartyOrderId} WHERE id = #{id}")
    int fillPrepayInfo(@Param("id") Long id,
                       @Param("qrCode") String qrCode,
                       @Param("payUrl") String payUrl,
                       @Param("thirdPartyOrderId") String thirdPartyOrderId);
}
