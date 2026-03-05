package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 外发工厂工人（工厂账号自行维护的人员名册）
 */
@Data
@TableName("t_factory_worker")
public class FactoryWorker {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 所属外发工厂ID（关联 t_factory.id） */
    private String factoryId;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 工人编号（工厂内部自编） */
    private String workerNo;

    /** 工人姓名 */
    private String workerName;

    /** 联系电话 */
    private String phone;

    /** 状态：active-在职，inactive-离职 */
    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
