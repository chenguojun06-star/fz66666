package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_agent_context_file")
public class AgentContextFile {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String fileName;
    private String filePath;
    private String content;
    private Integer isActive;
    private Integer priority;
    private String scope;
    private String createdBy;

    @TableField("created_at")
    private LocalDateTime createTime;

    @TableField("updated_at")
    private LocalDateTime updateTime;
}
