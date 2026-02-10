package com.fashion.supplychain.common.audit;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 操作日志实体
 * 对应数据表 t_operation_log
 */
@Data
@TableName("t_operation_log")
public class OperationLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 操作用户ID */
    private String userId;

    /** 操作用户名 */
    private String username;

    /** 业务模块 */
    private String module;

    /** 操作类型 */
    private String action;

    /** 请求方法（GET/POST/PUT/DELETE） */
    private String method;

    /** 请求URL */
    private String requestUrl;

    /** 请求参数（JSON） */
    private String requestParams;

    /** 响应结果（JSON，可选） */
    private String responseResult;

    /** 客户端IP */
    private String clientIp;

    /** 操作状态: success/error */
    private String status;

    /** 错误信息 */
    private String errorMessage;

    /** 耗时（毫秒） */
    private Long duration;

    /** 操作时间 */
    private LocalDateTime operationTime;
}
