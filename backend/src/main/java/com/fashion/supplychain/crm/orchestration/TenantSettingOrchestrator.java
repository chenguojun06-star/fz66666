package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.TenantSetting;
import com.fashion.supplychain.crm.service.TenantSettingService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 租户级设置编排层（D-741）。
 *
 * <p>目前唯一的设置项：{@link #KEY_PAYMENT_TERM_DAYS}（应收账期天数——出货后 N 天到期）。
 * 用户拍板：默认 30 天，允许租户自行调整；逾期标记（ReceivableOverdueJob）与
 * 前端「已逾期 N 天」高亮都基于 due_date，账期改了它们自然跟着变，无需额外提醒配置。
 *
 * <p>读取口径：<b>读不到/非法值一律回退默认 30</b>——设置缺失绝不能让出货生成应收的
 * 主流程失败或产生离谱的到期日。
 */
@Slf4j
@Service
public class TenantSettingOrchestrator {

    /** 应收账期天数（出货后 N 天到期） */
    public static final String KEY_PAYMENT_TERM_DAYS = "crm.receivable.paymentTermDays";

    public static final int DEFAULT_PAYMENT_TERM_DAYS = 30;

    @Autowired
    private TenantSettingService tenantSettingService;

    /** 读取账期天数（租户隔离；读不到/非法值回退默认 30）。 */
    public int getPaymentTermDays(Long tenantId) {
        if (tenantId == null) {
            return DEFAULT_PAYMENT_TERM_DAYS;
        }
        try {
            TenantSetting row = tenantSettingService.getOne(new LambdaQueryWrapper<TenantSetting>()
                    .eq(TenantSetting::getTenantId, tenantId)
                    .eq(TenantSetting::getSettingKey, KEY_PAYMENT_TERM_DAYS)
                    .eq(TenantSetting::getDeleteFlag, 0)
                    .last("LIMIT 1"));
            if (row == null) {
                return DEFAULT_PAYMENT_TERM_DAYS;
            }
            int days = Integer.parseInt(row.getSettingValue().trim());
            // 合理区间护栏：0 天没有意义（出货当天就逾期），上限 365 防手滑
            if (days < 1 || days > 365) {
                log.warn("[租户设置] 账期天数超出合理区间(1~365)，回退默认: tenantId={}, value={}", tenantId, days);
                return DEFAULT_PAYMENT_TERM_DAYS;
            }
            return days;
        } catch (Exception e) {
            log.warn("[租户设置] 读取账期天数失败，回退默认: tenantId={}, {}", tenantId, e.getMessage());
            return DEFAULT_PAYMENT_TERM_DAYS;
        }
    }

    /** 当前设置（含未设置项的默认值，供前端展示）。 */
    public Result<Map<String, Object>> getSettings() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }
        Map<String, Object> result = new HashMap<>();
        result.put("paymentTermDays", getPaymentTermDays(tenantId));
        return Result.success(result);
    }

    /** 保存账期天数（upsert）。 */
    @Transactional(rollbackFor = Exception.class)
    public Result<Map<String, Object>> savePaymentTermDays(Integer days) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }
        if (days == null || days < 1 || days > 365) {
            return Result.fail("账期天数需在 1~365 之间");
        }

        TenantSetting existing = tenantSettingService.getOne(new LambdaQueryWrapper<TenantSetting>()
                .eq(TenantSetting::getTenantId, tenantId)
                .eq(TenantSetting::getSettingKey, KEY_PAYMENT_TERM_DAYS)
                .eq(TenantSetting::getDeleteFlag, 0)
                .last("LIMIT 1"));
        if (existing == null) {
            existing = new TenantSetting();
            existing.setTenantId(tenantId);
            existing.setSettingKey(KEY_PAYMENT_TERM_DAYS);
            existing.setCreateTime(LocalDateTime.now());
            existing.setDeleteFlag(0);
        }
        existing.setSettingValue(String.valueOf(days));
        existing.setUpdateTime(LocalDateTime.now());
        tenantSettingService.saveOrUpdate(existing);

        log.info("[租户设置] 账期天数更新: tenantId={}, days={}, operator={}",
                tenantId, days, UserContext.username());
        Map<String, Object> result = new HashMap<>();
        result.put("paymentTermDays", days);
        return Result.success(result);
    }
}
