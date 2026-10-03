package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.CustomerClientUser;
import com.fashion.supplychain.crm.service.CustomerClientUserService;
import com.fashion.supplychain.crm.service.CustomerService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 客户门户账号编排层（D-732）
 *
 * <p>背景：客户门户（crm-client）的「读」侧早就做完（登录/订单/采购/应收/发货/工序），
 * 但**「管」侧一个都没有**——`t_customer_client_user` 表结构完整却 0 行，
 * 因为全后端没有任何"开户"入口。对照供应商侧（{@code SupplierUserOrchestrator}）
 * 账号管理齐全（15 个账号在用），客户侧因此完全不可达。
 *
 * <p>本类照 {@code SupplierUserOrchestrator} 的既有模式实现，保持行为一致：
 * 租户隔离（所有查询/写入都以 {@code UserContext.tenantId()} 为界，
 * 绝不接受请求参数指定租户）、用户名全局唯一校验、密码 BCrypt 加密。
 *
 * <p><b>为什么返回 {@link Result}：</b>与本包 {@code CrmClientOrchestrator} 一致，
 * 保留"HTTP 200 + code=500"的历史响应语义，避免调用方从"resolve 后判断"变成 reject。
 */
@Slf4j
@Service
public class CustomerUserOrchestrator {

    @Autowired
    private CustomerClientUserService customerClientUserService;

    @Autowired
    private CustomerService customerService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ------------------------------------------------------------------
    // 查询
    // ------------------------------------------------------------------

    /** 某客户下的门户账号列表（先校验客户归属当前租户）。 */
    public Result<List<Map<String, Object>>> listByCustomer(String customerId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }
        if (!isCustomerOfTenant(customerId, tenantId)) {
            return Result.fail("客户不存在");
        }

        LambdaQueryWrapper<CustomerClientUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CustomerClientUser::getCustomerId, customerId)
                .eq(CustomerClientUser::getTenantId, tenantId)
                .eq(CustomerClientUser::getDeleteFlag, 0)
                .orderByDesc(CustomerClientUser::getCreateTime);
        List<CustomerClientUser> users = customerClientUserService.list(wrapper);

        return Result.success(users.stream().map(this::buildUserView).collect(Collectors.toList()));
    }

    /**
     * 全租户客户账号分页列表（带客户名称富化）。
     *
     * <p>手写 {@code LIMIT offset, size} 而非 MyBatis-Plus {@code Page}，
     * 与 {@code SupplierUserOrchestrator.listAll} 保持同一实现风格与 total 口径。
     */
    public Result<Map<String, Object>> listAll(String keyword, String status, String customerId,
                                               int page, int pageSize) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }

        LambdaQueryWrapper<CustomerClientUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CustomerClientUser::getTenantId, tenantId)
                .eq(CustomerClientUser::getDeleteFlag, 0);
        applyFilters(wrapper, keyword, status, customerId);

        int offset = (page - 1) * pageSize;
        wrapper.orderByDesc(CustomerClientUser::getCreateTime)
                .last("LIMIT " + offset + ", " + pageSize);
        List<CustomerClientUser> users = customerClientUserService.list(wrapper);

        LambdaQueryWrapper<CustomerClientUser> countWrapper = new LambdaQueryWrapper<>();
        countWrapper.eq(CustomerClientUser::getTenantId, tenantId)
                .eq(CustomerClientUser::getDeleteFlag, 0);
        applyFilters(countWrapper, keyword, status, customerId);
        long total = customerClientUserService.count(countWrapper);

        // 批量取客户名（避免 N+1）
        List<String> customerIds = users.stream()
                .map(CustomerClientUser::getCustomerId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<String, String> customerNameMap = new HashMap<>();
        if (!customerIds.isEmpty()) {
            for (Customer c : customerService.listByIds(customerIds)) {
                customerNameMap.put(c.getId(), c.getCompanyName());
            }
        }

        List<Map<String, Object>> dataList = users.stream()
                .map(u -> {
                    Map<String, Object> m = buildUserView(u);
                    m.put("customerName", customerNameMap.getOrDefault(u.getCustomerId(), ""));
                    return m;
                })
                .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("list", dataList);
        result.put("total", total);
        return Result.success(result);
    }

    /** 列表 / 计数共用的过滤条件（keyword / status / customerId）。 */
    private void applyFilters(LambdaQueryWrapper<CustomerClientUser> wrapper, String keyword,
                              String status, String customerId) {
        if (status != null && !status.isEmpty()) {
            wrapper.eq(CustomerClientUser::getStatus, status);
        }
        if (customerId != null && !customerId.isEmpty()) {
            wrapper.eq(CustomerClientUser::getCustomerId, customerId);
        }
        if (keyword != null && !keyword.isEmpty()) {
            String likeKeyword = "%" + keyword.trim() + "%";
            wrapper.and(w -> w
                    .like(CustomerClientUser::getUsername, likeKeyword)
                    .or()
                    .like(CustomerClientUser::getContactPerson, likeKeyword)
                    .or()
                    .like(CustomerClientUser::getContactPhone, likeKeyword)
            );
        }
    }

    /** 客户账号对外视图（列表 / 新建 / 重置密码接口共用）。 */
    public Map<String, Object> buildUserView(CustomerClientUser u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId());
        m.put("customerId", u.getCustomerId());
        m.put("tenantId", u.getTenantId());
        m.put("username", u.getUsername());
        m.put("contactPerson", u.getContactPerson());
        m.put("contactPhone", u.getContactPhone());
        m.put("contactEmail", u.getContactEmail());
        m.put("status", u.getStatus());
        m.put("lastLoginTime", u.getLastLoginTime());
        m.put("createTime", u.getCreateTime());
        return m;
    }

    // ------------------------------------------------------------------
    // 写操作
    // ------------------------------------------------------------------

    @Transactional(rollbackFor = Exception.class)
    public CustomerClientUser createUser(String customerId, String username, String password,
                                         String contactPerson, String contactPhone, String contactEmail) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("请先登录");
        }
        if (!isCustomerOfTenant(customerId, tenantId)) {
            throw new IllegalArgumentException("客户不存在");
        }

        // 用户名是全局唯一约束（表上 UNIQUE），先查再插，避免抛 SQL 异常
        LambdaQueryWrapper<CustomerClientUser> existWrapper = new LambdaQueryWrapper<>();
        existWrapper.eq(CustomerClientUser::getUsername, username.trim())
                .eq(CustomerClientUser::getDeleteFlag, 0);
        if (customerClientUserService.count(existWrapper) > 0) {
            throw new IllegalArgumentException("用户名已存在");
        }

        CustomerClientUser user = new CustomerClientUser();
        user.setCustomerId(customerId);
        user.setTenantId(tenantId);
        user.setUsername(username.trim());
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setContactPerson(contactPerson);
        user.setContactPhone(contactPhone);
        user.setContactEmail(contactEmail);
        user.setStatus("ACTIVE");
        user.setDeleteFlag(0);
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        customerClientUserService.save(user);

        log.info("[客户门户账号] 创建成功: username={}, customerId={}, tenantId={}, operator={}",
                username, customerId, tenantId, UserContext.username());
        return user;
    }

    @Transactional(rollbackFor = Exception.class)
    public CustomerClientUser resetPassword(String userId, String newPassword) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("请先登录");
        }
        CustomerClientUser user = requireOwnedUser(userId, tenantId);

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdateTime(LocalDateTime.now());
        customerClientUserService.updateById(user);

        log.info("[客户门户账号] 密码重置: userId={}, operator={}", userId, UserContext.username());
        return user;
    }

    @Transactional(rollbackFor = Exception.class)
    public void toggleStatus(String userId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("请先登录");
        }
        CustomerClientUser user = requireOwnedUser(userId, tenantId);

        String oldStatus = user.getStatus();
        String newStatus = "ACTIVE".equals(oldStatus) ? "INACTIVE" : "ACTIVE";
        user.setStatus(newStatus);
        user.setUpdateTime(LocalDateTime.now());
        customerClientUserService.updateById(user);

        log.info("[客户门户账号] 状态变更: userId={}, {} -> {}, operator={}",
                userId, oldStatus, newStatus, UserContext.username());
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteUser(String userId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("请先登录");
        }
        CustomerClientUser user = requireOwnedUser(userId, tenantId);

        user.setUpdateTime(LocalDateTime.now());
        customerClientUserService.updateById(user);
        // D-363d：逻辑删除空操作修复——先 updateById 再 removeById，与供应商侧逐字一致
        customerClientUserService.removeById(user.getId());

        log.info("[客户门户账号] 删除: userId={}, operator={}", userId, UserContext.username());
    }

    // ------------------------------------------------------------------
    // 私有
    // ------------------------------------------------------------------

    /** 客户必须存在、属于当前租户、未删除。 */
    private boolean isCustomerOfTenant(String customerId, Long tenantId) {
        if (customerId == null || customerId.isEmpty()) {
            return false;
        }
        Customer c = customerService.getById(customerId);
        return c != null
                && tenantId.equals(c.getTenantId())
                && (c.getDeleteFlag() == null || c.getDeleteFlag() == 0);
    }

    /** 取账号并校验归属当前租户（越权读取其他租户账号直接拒绝，P0 铁律4）。 */
    private CustomerClientUser requireOwnedUser(String userId, Long tenantId) {
        CustomerClientUser user = customerClientUserService.getById(userId);
        if (user == null || !tenantId.equals(user.getTenantId())
                || (user.getDeleteFlag() != null && user.getDeleteFlag() == 1)) {
            throw new IllegalArgumentException("账号不存在");
        }
        return user;
    }
}
