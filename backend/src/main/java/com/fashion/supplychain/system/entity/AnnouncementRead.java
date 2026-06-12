package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_announcement_read")
public class AnnouncementRead {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long announcementId;

    private String userId;

    private Long tenantId;

    private LocalDateTime readAt;
}
