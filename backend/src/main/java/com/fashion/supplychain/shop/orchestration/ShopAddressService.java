package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.shop.entity.ShopAddress;
import com.fashion.supplychain.shop.mapper.ShopAddressMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * D-770：店铺 C 端收货地址簿。
 *
 * <p><b>安全前提</b>：C 端是<b>免登录</b>的公开页面，地址属于个人敏感信息。
 * 因此所有读写都按 {@code (tenantId, phone)} 双重归属隔离 ——
 * 任何人都读不到别人的地址。单手机号地址数也设上限，
 * 防止接口被当作批量抓取数据的通道。
 *
 * <p>身份标识用手机号，与既有「按手机号查单 / 归并客户」逻辑一致，
 * 不额外引入账号体系（那是另一个量级的改动）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopAddressService {

    /** 单个手机号最多保存的地址数：正常用户 1~5 条足够，超出即异常使用 */
    private static final int MAX_PER_PHONE = 10;

    private final ShopAddressMapper addressMapper;

    public List<ShopAddress> listByPhone(Long tenantId, String phone) {
        requirePhone(phone);
        return addressMapper.selectList(new LambdaQueryWrapper<ShopAddress>()
                .eq(ShopAddress::getTenantId, tenantId)
                .eq(ShopAddress::getPhone, phone)
                .orderByDesc(ShopAddress::getIsDefault)
                .orderByDesc(ShopAddress::getId));
    }

    /**
     * 新增或更新（按 租户+手机号+收货人+详细地址 判定同一条）。
     *
     * @return 保存后的地址 id
     */
    public Long save(Long tenantId, String phone, String consignee, String phoneExt,
                     String province, String city, String district,
                     String detailAddr, Boolean isDefault) {
        requirePhone(phone);
        String name = requireText(consignee, "收货人不能为空", 50);
        String detail = requireText(detailAddr, "详细地址不能为空", 255);

        ShopAddress existing = addressMapper.selectOne(new LambdaQueryWrapper<ShopAddress>()
                .eq(ShopAddress::getTenantId, tenantId)
                .eq(ShopAddress::getPhone, phone)
                .eq(ShopAddress::getConsignee, name)
                .eq(ShopAddress::getDetailAddr, detail)
                .last("LIMIT 1"));

        if (existing == null) {
            long count = addressMapper.selectCount(new LambdaQueryWrapper<ShopAddress>()
                    .eq(ShopAddress::getTenantId, tenantId)
                    .eq(ShopAddress::getPhone, phone));
            if (count >= MAX_PER_PHONE) {
                throw new IllegalArgumentException(
                        "最多保存 " + MAX_PER_PHONE + " 个收货地址，请先删除不用的");
            }
        }

        boolean makeDefault = Boolean.TRUE.equals(isDefault);
        // 第一条地址自动设为默认，避免顾客第一次保存后还要手动再点一次
        boolean firstEver = addressMapper.selectCount(new LambdaQueryWrapper<ShopAddress>()
                .eq(ShopAddress::getTenantId, tenantId)
                .eq(ShopAddress::getPhone, phone)) == 0;

        ShopAddress row = existing != null ? existing : new ShopAddress();
        row.setTenantId(tenantId);
        row.setPhone(phone);
        row.setConsignee(name);
        row.setDetailAddr(detail);
        row.setPhoneExt(trim(phoneExt, 64));
        row.setProvince(trim(province, 50));
        row.setCity(trim(city, 50));
        row.setDistrict(trim(district, 50));
        row.setIsDefault((makeDefault || firstEver) ? 1 : 0);

        if (makeDefault || firstEver) {
            clearDefault(tenantId, phone, row.getId());
        }

        if (existing == null) {
            addressMapper.insert(row);
        } else {
            addressMapper.updateById(row);
        }
        log.info("[ShopAddress] 已保存地址 phone={} consignee={} default={}",
                maskPhone(phone), name, row.getIsDefault());
        return row.getId();
    }

    /** 设为默认（同一手机号下只能有一个默认） */
    public void setDefault(Long tenantId, String phone, Long id) {
        requirePhone(phone);
        ShopAddress row = addressMapper.selectOne(new LambdaQueryWrapper<ShopAddress>()
                .eq(ShopAddress::getTenantId, tenantId)
                .eq(ShopAddress::getPhone, phone)
                .eq(ShopAddress::getId, id)
                .last("LIMIT 1"));
        if (row == null) {
            throw new IllegalArgumentException("地址不存在");
        }
        clearDefault(tenantId, phone, id);
        row.setIsDefault(1);
        addressMapper.updateById(row);
    }

    /** 删除；只能删自己的（同租户 + 同手机号） */
    public void delete(Long tenantId, String phone, Long id) {
        requirePhone(phone);
        int n = addressMapper.delete(new LambdaQueryWrapper<ShopAddress>()
                .eq(ShopAddress::getTenantId, tenantId)
                .eq(ShopAddress::getPhone, phone)
                .eq(ShopAddress::getId, id));
        if (n == 0) {
            throw new IllegalArgumentException("地址不存在");
        }
    }

    private void clearDefault(Long tenantId, String phone, Long keepId) {
        LambdaUpdateWrapper<ShopAddress> uw = new LambdaUpdateWrapper<>();
        uw.eq(ShopAddress::getTenantId, tenantId)
          .eq(ShopAddress::getPhone, phone)
          .eq(ShopAddress::getIsDefault, 1);
        if (keepId != null) {
            uw.ne(ShopAddress::getId, keepId);
        }
        addressMapper.update(null, uw);
    }

    private static void requirePhone(String phone) {
        String p = phone == null ? "" : phone.trim();
        if (!p.matches("^1[3-9]\\d{9}$")) {
            throw new IllegalArgumentException("手机号格式不正确");
        }
    }

    private static String requireText(String v, String errMsg, int maxLen) {
        String s = v == null ? "" : v.trim();
        if (s.isEmpty()) {
            throw new IllegalArgumentException(errMsg);
        }
        if (s.length() > maxLen) {
            throw new IllegalArgumentException(errMsg.replace("不能为空", "过长"));
        }
        return s;
    }

    private static String trim(String v, int maxLen) {
        if (v == null) return null;
        String s = v.trim();
        if (s.isEmpty()) return null;
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }

    /** 日志脱敏：地址相关日志不落完整手机号 */
    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) return "***";
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }
}