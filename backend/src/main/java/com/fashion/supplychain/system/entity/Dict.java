package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_dict")
public class Dict {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String dictCode;

    private String dictLabel;

    private String dictValue;

    private String dictType;

    private Integer sort;

    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
