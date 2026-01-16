package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.LoginLog;

public interface LoginLogService extends IService<LoginLog> {
    Page<LoginLog> getLoginLogPage(Long page, Long pageSize, String username, String loginStatus, String startDate, String endDate);
}
