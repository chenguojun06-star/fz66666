package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_platform_announcement")
public class PlatformAnnouncement {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String title;

    private String content;

    /** 类型: info / warning / important */
    private String type;

    /** 状态: 0=下架, 1=生效 */
    private Integer active;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private String createdBy;

    /** 为null表示所有租户可见 */
    private Long tenantId;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
