package com.fashion.supplychain.integration.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_logistics_track")
public class LogisticsTrack {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String expressOrderId;
    private String trackingNo;
    private LocalDateTime trackTime;
    private String trackDesc;
    private String trackLocation;
    private String actionCode;
    private String actionName;
    private String courierName;
    private String courierPhone;
    private Integer signed;
    private Integer dataSource;
    private LocalDateTime createTime;
}
