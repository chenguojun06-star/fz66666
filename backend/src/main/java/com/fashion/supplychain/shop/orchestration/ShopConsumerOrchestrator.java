package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.shop.entity.ShopConsumer;
import com.fashion.supplychain.shop.entity.ShopConsumerAddress;
import com.fashion.supplychain.shop.mapper.ShopConsumerAddressMapper;
import com.fashion.supplychain.shop.mapper.ShopConsumerMapper;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 平台级 C 端消费者账号编排（P0）。
 *
 * <p>「平台级电商」的第一块地基：C 端顾客注册一个**平台账号**，
 * 在所有租户的店铺通用；下单仍按店铺归属（钱各租户直收，平台不抽成）。
 *
 * <p><b>与免登录并存：</b>老的「按手机号下单/查单」链路一行未改。
 * 注册/登录只是让顾客多了一个「跨店看自己订单、复用收货地址」的便利，
 * 不注册也照样能下单（这正是当前线上行为）。
 *
 * <p><b>安全边界：</b>
 * <ul>
 *   <li>密码 BCrypt 存储，响应体永不回传（实体字段 {@code WRITE_ONLY}）；</li>
 *   <li>手机号是唯一登录名，注册时唯一性由 DB 唯一索引兜底（并发下先插入者胜）；</li>
 *   <li>地址簿/订单查询一律以**令牌解析出的 consumerId** 为准，绝不接受请求参数指定，
 *       避免越权读他人数据。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopConsumerOrchestrator {

    private static final int MAX_ADDRESS = 20;
    private static final String PHONE_PATTERN = "^1[3-9]\\d{9}$";

    private final ShopConsumerMapper consumerMapper;
    private final ShopConsumerAddressMapper addressMapper;
    private final ShopPlatformMapper platformMapper;
    private final PasswordEncoder passwordEncoder;
    private final ShopConsumerTokenSupport tokenSupport;

    // ── 注册 / 登录 ──────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> register(String phone, String password, String nickname) {
        String p = requirePhone(phone);
        requirePassword(password);
        if (consumerMapper.selectCount(new LambdaQueryWrapper<ShopConsumer>()
                .eq(ShopConsumer::getPhone, p)) > 0) {
            throw new IllegalArgumentException("该手机号已注册，请直接登录");
        }
        ShopConsumer c = new ShopConsumer();
        c.setPhone(p);
        c.setPasswordHash(passwordEncoder.encode(password));
        c.setNickname(StringUtils.hasText(nickname) ? trim(nickname, 32) : defaultNickname(p));
        c.setStatus(1);
        c.setLastLoginTime(LocalDateTime.now());
        c.setCreateTime(LocalDateTime.now());
        c.setUpdateTime(LocalDateTime.now());
        consumerMapper.insert(c);
        log.info("[ShopConsumer] 注册成功 consumerId={} phone={}", c.getId(), maskPhone(p));
        return authPayload(c);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> login(String phone, String password) {
        String p = requirePhone(phone);
        if (!StringUtils.hasText(password)) {
            throw new IllegalArgumentException("请输入密码");
        }
        ShopConsumer c = consumerMapper.selectOne(new LambdaQueryWrapper<ShopConsumer>()
                .eq(ShopConsumer::getPhone, p).last("LIMIT 1"));
        // 统一错误文案：不区分「手机号不存在」与「密码错误」，避免账号枚举
        if (c == null || !StringUtils.hasText(c.getPasswordHash())
                || !passwordEncoder.matches(password, c.getPasswordHash())) {
            throw new IllegalArgumentException("手机号或密码不正确");
        }
        if (c.getStatus() == null || c.getStatus() != 1) {
            throw new IllegalArgumentException("账号已被禁用，请联系平台客服");
        }
        ShopConsumer patch = new ShopConsumer();
        patch.setId(c.getId());
        patch.setLastLoginTime(LocalDateTime.now());
        consumerMapper.updateById(patch);
        log.info("[ShopConsumer] 登录成功 consumerId={} phone={}", c.getId(), maskPhone(p));
        return authPayload(c);
    }

    /** 个人资料（不含密码哈希） */
    public Map<String, Object> profile(String consumerId) {
        ShopConsumer c = requireConsumer(consumerId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("consumerId", c.getId());
        data.put("phone", c.getPhone());
        data.put("nickname", c.getNickname());
        data.put("avatar", c.getAvatar());
        data.put("createTime", c.getCreateTime());
        return data;
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateProfile(String consumerId, String nickname, String avatar) {
        requireConsumer(consumerId);
        ShopConsumer patch = new ShopConsumer();
        patch.setId(consumerId);
        if (StringUtils.hasText(nickname)) {
            patch.setNickname(trim(nickname, 32));
        }
        if (StringUtils.hasText(avatar)) {
            patch.setAvatar(trim(avatar, 512));
        }
        consumerMapper.updateById(patch);
    }

    // ── 收货地址簿（平台级，跨店复用） ────────────────────────────────────────

    public List<ShopConsumerAddress> addresses(String consumerId) {
        requireConsumer(consumerId);
        return addressMapper.selectList(new LambdaQueryWrapper<ShopConsumerAddress>()
                .eq(ShopConsumerAddress::getConsumerId, consumerId)
                .orderByDesc(ShopConsumerAddress::getIsDefault)
                .orderByDesc(ShopConsumerAddress::getCreateTime));
    }

    @Transactional(rollbackFor = Exception.class)
    public String saveAddress(String consumerId, Map<String, Object> body) {
        requireConsumer(consumerId);
        String consignee = requireText(str(body.get("consignee")), "收货人不能为空", 50);
        String phone = str(body.get("phone"));
        if (!StringUtils.hasText(phone) || !phone.matches(PHONE_PATTERN)) {
            throw new IllegalArgumentException("收货电话格式不正确");
        }
        String detail = requireText(str(body.get("detailAddr")), "详细地址不能为空", 255);

        ShopConsumerAddress existing = addressMapper.selectOne(new LambdaQueryWrapper<ShopConsumerAddress>()
                .eq(ShopConsumerAddress::getConsumerId, consumerId)
                .eq(ShopConsumerAddress::getConsignee, consignee)
                .eq(ShopConsumerAddress::getDetailAddr, detail)
                .last("LIMIT 1"));

        if (existing == null
                && addressMapper.selectCount(new LambdaQueryWrapper<ShopConsumerAddress>()
                        .eq(ShopConsumerAddress::getConsumerId, consumerId)) >= MAX_ADDRESS) {
            throw new IllegalArgumentException("最多保存 " + MAX_ADDRESS + " 个收货地址，请先删除不用的");
        }

        boolean wantDefault = truthy(body.get("isDefault"));
        boolean firstEver = addressMapper.selectCount(new LambdaQueryWrapper<ShopConsumerAddress>()
                .eq(ShopConsumerAddress::getConsumerId, consumerId)) == 0;

        ShopConsumerAddress row = existing != null ? existing : new ShopConsumerAddress();
        row.setConsumerId(consumerId);
        row.setConsignee(consignee);
        row.setPhone(phone);
        row.setProvince(trim(str(body.get("province")), 50));
        row.setCity(trim(str(body.get("city")), 50));
        row.setDistrict(trim(str(body.get("district")), 50));
        row.setDetailAddr(detail);
        row.setIsDefault((wantDefault || firstEver) ? 1 : 0);

        if (wantDefault || firstEver) {
            clearDefault(consumerId, row.getId());
        }
        if (existing == null) {
            addressMapper.insert(row);
        } else {
            addressMapper.updateById(row);
        }
        return row.getId();
    }

    @Transactional(rollbackFor = Exception.class)
    public void setDefaultAddress(String consumerId, String addressId) {
        requireConsumer(consumerId);
        ShopConsumerAddress row = addressMapper.selectOne(new LambdaQueryWrapper<ShopConsumerAddress>()
                .eq(ShopConsumerAddress::getConsumerId, consumerId)
                .eq(ShopConsumerAddress::getId, addressId).last("LIMIT 1"));
        if (row == null) {
            throw new IllegalArgumentException("地址不存在");
        }
        clearDefault(consumerId, addressId);
        row.setIsDefault(1);
        addressMapper.updateById(row);
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteAddress(String consumerId, String addressId) {
        requireConsumer(consumerId);
        int n = addressMapper.delete(new LambdaQueryWrapper<ShopConsumerAddress>()
                .eq(ShopConsumerAddress::getConsumerId, consumerId)
                .eq(ShopConsumerAddress::getId, addressId));
        if (n == 0) {
            throw new IllegalArgumentException("地址不存在");
        }
    }

    /** 默认地址（下单时预填用）；无则 null */
    public ShopConsumerAddress defaultAddress(String consumerId) {
        if (!StringUtils.hasText(consumerId)) {
            return null;
        }
        return addressMapper.selectOne(new LambdaQueryWrapper<ShopConsumerAddress>()
                .eq(ShopConsumerAddress::getConsumerId, consumerId)
                .eq(ShopConsumerAddress::getIsDefault, 1)
                .orderByDesc(ShopConsumerAddress::getCreateTime)
                .last("LIMIT 1"));
    }

    // ── 我的订单（跨店） ─────────────────────────────────────────────────────

    public List<Map<String, Object>> myOrders(String consumerId) {
        requireConsumer(consumerId);
        return platformMapper.listOrdersByConsumer(consumerId);
    }

    /**
     * 我的订单详情（P1）：订单头 + 商品明细。
     *
     * <p>订单号全局唯一，但**归属校验不能省** —— 查询条件里必须同时带 consumerId，
     * 否则改一个订单号就能看别人的订单。
     */
    public Map<String, Object> orderDetail(String consumerId, String orderNo) {
        requireConsumer(consumerId);
        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }
        Map<String, Object> order = platformMapper.findOrderForConsumer(orderNo, consumerId);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        Map<String, Object> data = new LinkedHashMap<>(order);
        data.put("items", platformMapper.listOrderItems(orderNo));
        return data;
    }

    // ── 内部 ────────────────────────────────────────────────────────────────

    private Map<String, Object> authPayload(ShopConsumer c) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", tokenSupport.issue(c.getId(), c.getPhone()));
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("consumerId", c.getId());
        u.put("phone", c.getPhone());
        u.put("nickname", c.getNickname());
        u.put("avatar", c.getAvatar());
        data.put("consumer", u);
        return data;
    }

    private ShopConsumer requireConsumer(String consumerId) {
        if (!StringUtils.hasText(consumerId)) {
            throw new IllegalArgumentException("请先登录");
        }
        ShopConsumer c = consumerMapper.selectById(consumerId);
        if (c == null) {
            throw new IllegalArgumentException("账号不存在，请重新登录");
        }
        if (c.getStatus() == null || c.getStatus() != 1) {
            throw new IllegalArgumentException("账号已被禁用");
        }
        return c;
    }

    private void clearDefault(String consumerId, String keepId) {
        LambdaUpdateWrapper<ShopConsumerAddress> uw = new LambdaUpdateWrapper<>();
        uw.eq(ShopConsumerAddress::getConsumerId, consumerId)
          .eq(ShopConsumerAddress::getIsDefault, 1);
        if (keepId != null) {
            uw.ne(ShopConsumerAddress::getId, keepId);
        }
        uw.set(ShopConsumerAddress::getIsDefault, 0);
        addressMapper.update(null, uw);
    }

    private static String requirePhone(String phone) {
        String p = str(phone);
        if (!StringUtils.hasText(p) || !p.matches(PHONE_PATTERN)) {
            throw new IllegalArgumentException("请输入正确的手机号");
        }
        return p;
    }

    private static void requirePassword(String password) {
        if (!StringUtils.hasText(password) || password.length() < 6 || password.length() > 32) {
            throw new IllegalArgumentException("密码需 6-32 位");
        }
    }

    private static String defaultNickname(String phone) {
        return "用户" + phone.substring(phone.length() - 4);
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

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    private static String trim(String v, int maxLen) {
        if (!StringUtils.hasText(v)) {
            return null;
        }
        String s = v.trim();
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }

    private static boolean truthy(Object v) {
        return Boolean.TRUE.equals(v) || "1".equals(String.valueOf(v)) || "true".equalsIgnoreCase(String.valueOf(v));
    }

    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) {
            return "***";
        }
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }
}
