package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.mapper.UserMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 存量用户工号回填（D-721，幂等自愈）。
 *
 * <p>工号生成器只管「新建」，此 Runner 一次性把历史用户的空工号按注册顺序补齐：
 * 每租户内按 id 升序（= 注册先后）从现有水位之后继续编号。只补空值，天然幂等，
 * 重启不会重复编号也不会改写已有工号。与 StyleSnapshotBackfillRunner 同款
 * 「存量自愈走 Runner 不走 Flyway」的既有约定。
 */
@Slf4j
@Component
public class EmployeeNoBackfillRunner implements ApplicationRunner {

    private final UserMapper userMapper;
    private final EmployeeNoGenerator generator;

    public EmployeeNoBackfillRunner(UserMapper userMapper, EmployeeNoGenerator generator) {
        this.userMapper = userMapper;
        this.generator = generator;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            List<User> blanks = userMapper.selectList(new QueryWrapper<User>()
                    .isNull("employee_no").or().eq("employee_no", "")
                    .orderByAsc("tenant_id").orderByAsc("id"));
            if (blanks == null || blanks.isEmpty()) {
                return;
            }
            Map<Long, List<User>> byTenant = blanks.stream()
                    .filter(u -> u.getTenantId() != null)
                    .collect(Collectors.groupingBy(User::getTenantId,
                            Collectors.toList()));
            int total = 0;
            for (Map.Entry<Long, List<User>> e : byTenant.entrySet()) {
                // 组内已按 id 升序 = 注册先后顺序
                for (User u : e.getValue()) {
                    u.setEmployeeNo(generator.next(e.getKey()));
                    userMapper.updateById(u);
                    total++;
                }
                log.info("[EmployeeNo] 租户 {} 回填 {} 个存量工号", e.getKey(), e.getValue().size());
            }
            int noTenant = blanks.size() - total;
            if (noTenant > 0) {
                log.warn("[EmployeeNo] {} 个用户无租户归属，跳过编号", noTenant);
            }
        } catch (Exception ex) {
            // 回填失败不阻断启动：下次重启幂等重试
            log.error("[EmployeeNo] 存量工号回填失败（不阻断启动，重启自动重试）", ex);
        }
    }
}
