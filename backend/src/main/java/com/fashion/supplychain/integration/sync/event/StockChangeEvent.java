package com.fashion.supplychain.integration.sync.event;

import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class StockChangeEvent extends ApplicationEvent {

    private final Long styleId;
    private final Long skuId;
    private final Long tenantId;
    private final String changeType;

    public StockChangeEvent(Object source, Long styleId, Long skuId, Long tenantId, String changeType) {
        super(source);
        this.styleId = styleId;
        this.skuId = skuId;
        this.tenantId = tenantId;
        this.changeType = changeType;
    }
}
