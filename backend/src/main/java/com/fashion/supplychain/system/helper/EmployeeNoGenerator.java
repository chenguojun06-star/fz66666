package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.mapper.UserMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 员工工号生成器（按租户分段、进程内原子自增，按注册先后顺序递增）。
 *
 * <p><b>背景（D-721）</b>：t_user.employee_no 列与实体字段早已存在、员工管理列表也已有
 * 「工号」列，但全仓 9 个建用户入口没有一个生成它，生产 25 个用户工号全空。用户拍板：
 * 工号由系统自带，按注册先后顺序自动排号走下去。
 *
 * <p><b>位数（用户问「设定几位数合适」）</b>：纯数字零填充 <b>4 位</b>（0001~9999）。
 * 依据：当前最大租户仅 9 人，服装工厂规模下 9999 的上限有 20 倍以上余量；4 位是工号的
 * 行业惯例长度，够短好念好记；超过 9999 自动退位为不补零的自然数（10000+），
 * 永不因位数耗尽而阻断注册。
 *
 * <p><b>并发与重启</b>：与 {@code SelectionNoGenerator}（D-628）/ {@code PaymentNoGenerator}
 * 同款思路——分段起点由数据库水位（该租户现有最大纯数字工号）推导，进程内 AtomicLong
 * 原子自增；单实例部署下无跨实例竞争，刻意不引入分布式锁（锁防并发写，防不了编号唯一性，
 * 此处也无随机碰撞问题）。
 */
@Slf4j
@Component
public class EmployeeNoGenerator {

    /** key = tenantId，value = 该租户已分配到的工号数值（初始为水位） */
    private final ConcurrentHashMap<Long, AtomicLong> counters = new ConcurrentHashMap<>();

    private final UserMapper userMapper;

    public EmployeeNoGenerator(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    /**
     * 分配该租户的下一个工号。
     *
     * @return 零填充 4 位数字串（0001 起）；tenantId 为空返回 null（无租户归属的账号不编工号）
     */
    public String next(Long tenantId) {
        if (tenantId == null) {
            return null;
        }
        long n = counters.computeIfAbsent(tenantId, k -> new AtomicLong(seed(k))).incrementAndGet();
        return n <= 9999 ? String.format("%04d", n) : String.valueOf(n);
    }

    /** 数据库水位：该租户现有最大「纯数字」工号；无则 0。仅该租户首次分配时查询一次 */
    private long seed(Long tenantId) {
        QueryWrapper<User> qw = new QueryWrapper<>();
        qw.select("MAX(CAST(employee_no AS UNSIGNED))")
                .eq("tenant_id", tenantId)
                .isNotNull("employee_no")
                .ne("employee_no", "")
                .apply("employee_no REGEXP '^[0-9]+$'");
        List<Object> objs = userMapper.selectObjs(qw);
        Object max = (objs == null || objs.isEmpty()) ? null : objs.get(0);
        if (max == null) {
            return 0L;
        }
        try {
            return Long.parseLong(String.valueOf(max));
        } catch (NumberFormatException e) {
            log.warn("[EmployeeNo] 租户 {} 工号水位解析失败（值={}），按 0 起", tenantId, max);
            return 0L;
        }
    }
}
