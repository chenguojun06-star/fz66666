package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.mapper.LoginLogMapper;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class LoginLogServiceImpl extends ServiceImpl<LoginLogMapper, LoginLog> implements LoginLogService {

    @javax.annotation.Resource
    private OperationLogService operationLogService;

    @Override
    public Page<LoginLog> getLoginLogPage(Long page, Long pageSize, String username, String loginStatus, String startDate, String endDate) {
        Page<LoginLog> pageParam = new Page<>(page, pageSize);
        LambdaQueryWrapper<LoginLog> wrapper = new LambdaQueryWrapper<>();

        // 只查询登录日志
        wrapper.eq(LoginLog::getLogType, "LOGIN");
        wrapper.like(StringUtils.hasText(username), LoginLog::getUsername, username);
        wrapper.eq(StringUtils.hasText(loginStatus), LoginLog::getLoginStatus, loginStatus);

        // 租户隔离：非超管只能看本租户的日志
        Long currentTenantId = UserContext.tenantId();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        if (!isSuperAdmin && currentTenantId != null) {
            wrapper.eq(LoginLog::getTenantId, currentTenantId);
        }

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

    @Override
    public void recordOperation(String bizType, String bizId, String action, String operator, String remark) {
        recordOperation(bizType, bizId, null, action, operator, remark);
    }

    @Override
    public void recordOperation(String bizType, String bizId, String targetName, String action, String operator, String remark) {
        LoginLog log = new LoginLog();
        log.setLogType("OPERATION");
        log.setBizType(bizType);
        log.setBizId(bizId);
        log.setAction(action);
        log.setUsername(operator);
        log.setRemark(remark);
        log.setLoginTime(LocalDateTime.now());
        log.setLoginStatus("SUCCESS"); // 操作日志默认成功
        // 多租户隔离：记录当前租户ID，防止跨租户数据泄漏
        log.setTenantId(UserContext.tenantId());
        save(log);

        // 同步记录到统一的 t_operation_log，供操作日志页面展示
        try {
            OperationLog opl = new OperationLog();
            opl.setModule(resolveModule(bizType));
            opl.setOperation(resolveOperationLabel(action));
            opl.setOperatorName(operator);
            opl.setTargetType(resolveTargetType(bizType));
            opl.setTargetId(bizId);
            opl.setTargetName(targetName);
            opl.setReason(remark);
            opl.setOperationTime(LocalDateTime.now());
            opl.setStatus("success");
            // 设置租户ID
            Long tid = UserContext.tenantId();
            if (tid != null) {
                opl.setTenantId(tid);
            }
            operationLogService.save(opl);
        } catch (Exception ignored) {
        }
    }

    @Override
    public List<LoginLog> listOperationLogs(String bizType, String bizId, String action) {
        LambdaQueryWrapper<LoginLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(LoginLog::getLogType, "OPERATION");

        // 多租户隔离：非超管只能查本租户操作日志
        Long currentTenantId = UserContext.tenantId();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        if (!isSuperAdmin && currentTenantId != null) {
            wrapper.eq(LoginLog::getTenantId, currentTenantId);
        }

        if (StringUtils.hasText(bizType)) {
            wrapper.eq(LoginLog::getBizType, bizType);
        }
        if (StringUtils.hasText(bizId)) {
            wrapper.eq(LoginLog::getBizId, bizId);
        }
        if (StringUtils.hasText(action)) {
            wrapper.eq(LoginLog::getAction, action);
        }

        wrapper.orderByDesc(LoginLog::getLoginTime);
        return list(wrapper);
    }

    private static String resolveModule(String bizType) {
        String t = safe(bizType);
        if (t.isEmpty()) return "系统设置";
        switch (t) {
            case "user":
            case "role":
            case "factory":
                return "系统设置";
            case "order":
            case "production":
                return "大货生产";
            case "purchase":
            case "material":
                return "物料采购";
            case "warehouse":
                return "仓库管理";
            case "finance":
                return "财务管理";
            case "style":
                return "样衣开发";
            default:
                return "系统设置";
        }
    }

    private static String resolveTargetType(String bizType) {
        String t = safe(bizType);
        switch (t) {
            case "user":
                return "用户";
            case "role":
                return "角色";
            case "factory":
                return "加工厂";
            case "order":
                return "订单";
            case "production":
                return "生产订单";
            case "material":
                return "物料";
            case "purchase":
                return "采购单";
            case "warehouse":
                return "仓库";
            case "finance":
                return "财务";
            case "style":
                return "款式";
            default:
                return t;
        }
    }

    private static String resolveOperationLabel(String action) {
        String a = safe(action);
        switch (a) {
            case "CREATE":
                return "新增";
            case "UPDATE":
                return "修改";
            case "DELETE":
                return "删除";
            case "PERMISSION_UPDATE":
                return "权限更新";
            case "APPROVE":
                return "审批";
            case "EXPORT":
                return "导出";
            default:
                return a;
        }
    }

    private static String safe(String v) {
        if (v == null) return "";
        String t = v.trim();
        return t;
    }
}
