package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 生产环节配置（可操作人 + 预计时长 + 监控开关，大货/样衣共用）
 * <p>
 * {@code tenant_id}=NULL → 系统默认（全公司统一一套）；{@code tenant_id}=X → 租户覆盖。
 * 规则：
 * <ul>
 *   <li>可操作人：operators_json 非空 → 只有列表内人员可扫码；空/未配置 → 所有人员可操作（拦截条件）</li>
 *   <li>预计时长：单位天，仅展示 + 超期预警，绝不参与交期/排产计算</li>
 *   <li>采购/入库为默认存在环节（default_stage=1），不展示工序列表但可配置</li>
 * </ul>
 * </p>
 */
@Data
@TableName("t_stage_config")
public class StageConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID，NULL 表示系统默认（全公司统一一套） */
    private Long tenantId;

    /** 父环节名：采购/裁剪/二次工艺/车缝/尾部/入库 */
    private String stageName;

    /** 预计时长（天），仅展示+超期预警，不参与交期计算 */
    private BigDecimal expectedDays;

    /** 可操作人 JSON 数组 [{id,name}]，空=所有人员可操作 */
    private String operatorsJson;

    /** 超期监控开关：1=开启预警，0=关闭 */
    private Integer monitorSwitch;

    /** 默认存在环节(采购/入库)=1，不展示工序列表但可配置 */
    private Integer defaultStage;

    private Integer enabled;

    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}