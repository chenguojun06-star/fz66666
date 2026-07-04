package com.fashion.supplychain.system.dto;

import java.util.List;
import lombok.Data;

/**
 * 字段配置保存请求
 */
@Data
public class FieldConfigSaveRequest {

    /** 业务对象类型 */
    private String bizType;

    /** 字段配置列表（全量覆盖该 bizType 下的配置） */
    private List<FieldConfigItem> fields;

    @Data
    public static class FieldConfigItem {
        private Long id;
        private String fieldKey;
        private String label;
        private String fieldType;
        private String optionsJson;
        private String validationsJson;
        private String pcWidget;
        private String h5Widget;
        private String mpWidget;
        private Integer pcColSpan;
        private Integer h5ColSpan;
        private Integer sortOrder;
        private Integer isSystem;
        private Integer enabled;
        private String visibleRoles;
        private String editableRoles;
        private String remark;
    }
}
