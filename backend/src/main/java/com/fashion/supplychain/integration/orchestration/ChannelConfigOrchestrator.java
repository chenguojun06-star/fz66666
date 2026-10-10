package com.fashion.supplychain.integration.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.integration.record.entity.IntegrationChannelConfig;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import com.fashion.supplychain.integration.record.mapper.IntegrationChannelConfigMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@Lazy
public class ChannelConfigOrchestrator {

    @Autowired
    private IntegrationChannelConfigMapper channelConfigMapper;

    /** 支付渠道状态取自「收款设置」（每租户自己的商户号），不是全局 yml */
    @Autowired
    private com.fashion.supplychain.integration.payment.config.PaymentConfigService paymentConfigService;

    /**
     * 支付渠道状态：是否启用 / 参数是否齐全。
     *
     * <p><b>为什么不读全局 application.yml</b>：商户号是企业资质、资金结算到该企业账户，
     * 平台用一个商户号代收所有商家的钱再转付属于二清（无牌照非法经营）。
     * 所以支付配置必须按租户存，这里查的是当前租户在「收款设置」里填的内容。
     * （物流渠道仍沿用全局配置：快递账号是平台级合作，与资金无关。）
     */
    public ChannelStatus paymentChannelStatus(String code) {
        PaymentGateway.PaymentType type = PaymentGateway.PaymentType.parse(code);
        if (type == null) {
            return new ChannelStatus(false, false);
        }
        Long tenantId = UserContext.tenantId();
        PaymentChannelConfig cfg = paymentConfigService.load(tenantId, type);
        boolean enabled = cfg != null;
        boolean configured = cfg != null && cfg.isUsable();
        return new ChannelStatus(enabled, configured);
    }

    /** 渠道状态（enabled=已启用，configured=参数齐全可真正收款） */
    public record ChannelStatus(boolean enabled, boolean configured) {
    }

    @Transactional
    public void insert(IntegrationChannelConfig config) {
        channelConfigMapper.insert(config);
    }

    @Transactional
    public void updateById(IntegrationChannelConfig config) {
        channelConfigMapper.updateById(config);
    }

    public IntegrationChannelConfig selectOne(LambdaQueryWrapper<IntegrationChannelConfig> wrapper) {
        return channelConfigMapper.selectOne(wrapper);
    }

    public List<IntegrationChannelConfig> selectList(LambdaQueryWrapper<IntegrationChannelConfig> wrapper) {
        return channelConfigMapper.selectList(wrapper);
    }
}
