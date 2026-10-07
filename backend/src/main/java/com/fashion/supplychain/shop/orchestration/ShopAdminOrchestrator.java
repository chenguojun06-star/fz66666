package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.entity.ShopConfig;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.mapper.ShopConfigMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 店铺管理编排器（D-763）：配置 / 上架开关 / 订单列表，供管理端控制器薄壳调用。
 */
@Slf4j
@Service
public class ShopAdminOrchestrator {

    @Autowired
    private ShopConfigMapper shopConfigMapper;

    @Autowired
    private ShopOrderMapper shopOrderMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    /** 我的店铺配置（无则按默认建档，slug=t{tenantId}，默认打烊） */
    public ShopConfig config() {
        Long tenantId = UserContext.tenantId();
        ShopConfig config = shopConfigMapper.selectOne(new LambdaQueryWrapper<ShopConfig>()
                .eq(ShopConfig::getTenantId, tenantId)
                .last("LIMIT 1"));
        if (config == null) {
            config = new ShopConfig();
            config.setTenantId(tenantId);
            config.setSlug("t" + tenantId);
            config.setShopName("我的店铺");
            config.setEnabled(0);
            config.setCreateTime(LocalDateTime.now());
            config.setUpdateTime(LocalDateTime.now());
            shopConfigMapper.insert(config);
        }
        return config;
    }

    /** 更新店铺配置（名称/公告/打烊开关） */
    public void saveConfig(Map<String, Object> body) {
        ShopConfig existing = config();
        ShopConfig patch = new ShopConfig();
        patch.setId(existing.getId());
        if (body.get("shopName") != null) {
            patch.setShopName(String.valueOf(body.get("shopName")).trim());
        }
        if (body.get("notice") != null) {
            patch.setNotice(String.valueOf(body.get("notice")).trim());
        }
        if (body.get("enabled") != null) {
            boolean on = "1".equals(String.valueOf(body.get("enabled")))
                    || Boolean.parseBoolean(String.valueOf(body.get("enabled")));
            patch.setEnabled(on ? 1 : 0);
        }
        patch.setUpdateTime(LocalDateTime.now());
        shopConfigMapper.updateById(patch);
        log.info("[ShopAdmin] 店铺配置已更新 tenant={}", existing.getTenantId());
    }

    /** 上架/下架款式 */
    public void setListing(Long styleId, boolean listed) {
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null || !tenantId.equals(style.getTenantId())) {
            throw new IllegalArgumentException("款式不存在或无权操作");
        }
        StyleInfo patch = new StyleInfo();
        patch.setId(styleId);
        patch.setShopListed(listed ? 1 : 0);
        patch.setShopListingTime(listed ? LocalDateTime.now() : null);
        styleInfoService.updateById(patch);
        log.info("[ShopAdmin] 款式{} {}店铺", styleId, listed ? "上架" : "下架");
    }

    /** 店铺订单分页（含买家联系方式与挂账状态） */
    public Page<ShopOrder> orders(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        int page = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        String status = (String) params.get("status");
        String keyword = (String) params.get("keyword");
        return shopOrderMapper.selectPage(new Page<>(page, pageSize),
                new LambdaQueryWrapper<ShopOrder>()
                        .eq(ShopOrder::getTenantId, tenantId)
                        .eq(ShopOrder::getDeleteFlag, 0)
                        .eq(StringUtils.hasText(status), ShopOrder::getStatus, status)
                        .and(StringUtils.hasText(keyword), w -> w
                                .like(ShopOrder::getOrderNo, keyword)
                                .or().like(ShopOrder::getPhone, keyword)
                                .or().like(ShopOrder::getCustomerName, keyword))
                        .orderByDesc(ShopOrder::getCreateTime));
    }

    private int parseInt(Object v, int def) {
        if (v == null) return def;
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return def;
        }
    }
}
