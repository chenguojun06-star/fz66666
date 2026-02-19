package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_material_picking")
public class MaterialPicking {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String pickingNo;
    private String orderId;
    private String orderNo;
    private String styleId;
    private String styleNo;
    private String pickerId;
    private String pickerName;
    private LocalDateTime pickTime;
    private String status;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
