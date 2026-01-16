package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.mapper.LoginLogMapper;
import com.fashion.supplychain.system.service.LoginLogService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

@Service
public class LoginLogServiceImpl extends ServiceImpl<LoginLogMapper, LoginLog> implements LoginLogService {

    @Override
    public Page<LoginLog> getLoginLogPage(Long page, Long pageSize, String username, String loginStatus, String startDate, String endDate) {
        Page<LoginLog> pageParam = new Page<>(page, pageSize);
        LambdaQueryWrapper<LoginLog> wrapper = new LambdaQueryWrapper<>();
        
        wrapper.like(StringUtils.hasText(username), LoginLog::getUsername, username);
        wrapper.eq(StringUtils.hasText(loginStatus), LoginLog::getLoginStatus, loginStatus);
        
        if (StringUtils.hasText(startDate)) {
            LocalDate start = LocalDate.parse(startDate, DateTimeFormatter.ISO_DATE);
            wrapper.ge(LoginLog::getLoginTime, LocalDateTime.of(start, LocalTime.MIN));
        }
        
        if (StringUtils.hasText(endDate)) {
            LocalDate end = LocalDate.parse(endDate, DateTimeFormatter.ISO_DATE);
            wrapper.le(LoginLog::getLoginTime, LocalDateTime.of(end, LocalTime.MAX));
        }
        
        wrapper.orderByDesc(LoginLog::getLoginTime);
        
        return baseMapper.selectPage(pageParam, wrapper);
    }
}
