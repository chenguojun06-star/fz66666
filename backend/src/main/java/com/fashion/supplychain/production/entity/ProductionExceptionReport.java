package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_production_exception_report")
public class ProductionExceptionReport {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String orderNo;
    private String processName;
    private String workerId;
    private String workerName;
    private String exceptionType;
    private String description;
    /** 状态：PENDING=待处理, RESOLVED=已解决 */
    private String status;
    /** D-417 处理人 ID */
    private String handlerId;
    /** D-417 处理人姓名 */
    private String handlerName;
    /** D-417 处理说明 */
    private String handleNote;
    /** D-417 处理时间 */
    private LocalDateTime handleTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    @TableLogic
    private Integer deleteFlag;
}
