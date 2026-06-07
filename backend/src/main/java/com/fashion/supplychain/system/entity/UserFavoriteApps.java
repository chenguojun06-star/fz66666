package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_user_favorite_apps")
public class UserFavoriteApps {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;

    private String userId;

    /** 收藏数据JSON，格式: [{id,name,iconClass,circleClass,route,badge}] */
    private String favoriteData;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
