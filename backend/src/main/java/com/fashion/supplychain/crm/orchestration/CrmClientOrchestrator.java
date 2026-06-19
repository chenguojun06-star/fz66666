package com.fashion.supplychain.crm.orchestration;

import com.fashion.supplychain.crm.entity.CustomerClientUser;
import com.fashion.supplychain.crm.service.CustomerClientUserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * CRM 客户端用户编排层
 *
 * <p>负责客户登录记录等写操作。
 */
@Slf4j
@Service
public class CrmClientOrchestrator {

    @Autowired
    private CustomerClientUserService customerClientUserService;

    /**
     * 更新客户用户最后登录时间
     *
     * @param user 用户实体（已从数据库查询到，此时设置 lastLoginTime 后更新）
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateLastLoginTime(CustomerClientUser user) {
        if (user == null || user.getId() == null) {
            return;
        }
        user.setLastLoginTime(LocalDateTime.now());
        customerClientUserService.updateById(user);
        log.info("[CrmClientOrchestrator] 客户用户登录时间已更新: userId={}", user.getId());
    }
}
