package com.fashion.supplychain.template.event;

import lombok.Getter;
import org.springframework.context.ApplicationEvent;

/**
 * 模板价格变更事件
 * 当工序模板的单价更新时发布此事件
 */
@Getter
public class TemplatePriceChangedEvent extends ApplicationEvent {

    /**
     * 关联的款号（可能为空）
     */
    private final String styleNo;

    /**
     * 模板类型（process/bom/size等）
     */
    private final String templateType;

    /**
     * 操作人
     */
    private final String operator;

    /**
     * 构造函数
     *
     * @param source 事件源对象
     * @param styleNo 款号
     * @param templateType 模板类型
     * @param operator 操作人
     */
    public TemplatePriceChangedEvent(Object source, String styleNo, String templateType, String operator) {
        super(source);
        this.styleNo = styleNo;
        this.templateType = templateType;
        this.operator = operator;
    }
}
