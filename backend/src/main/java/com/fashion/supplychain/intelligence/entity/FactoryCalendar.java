package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 工厂工作日历（APS 高级排产约束求解引擎）
 *
 * <p>用途：记录每个工厂的工作日/休息日，排产甘特图跳过非工作日</p>
 *
 * <p>多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE</p>
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Data
@TableName("t_factory_calendar")
public class FactoryCalendar {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4：多租户隔离） */
    private Long tenantId;

    /** 工厂ID（关联 t_factory.id，UUID） */
    private String factoryId;

    /** 日历日期 */
    private LocalDate calendarDate;

    /** 1=工作日 0=休息日 */
    private Integer isWorkday;

    /** 班次小时数 */
    private Integer shiftHours;

    /** 备注（如：春节放假） */
    private String note;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /** 更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
