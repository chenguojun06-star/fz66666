package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrphanDataItemDTO {

    private String id;
    private String tableName;
    private String tableLabel;
    private String module;
    private String orderId;
    private String orderNo;
    private String styleNo;
    private String summary;
    private LocalDateTime createTime;
    private String orphanReason;
    private String orderStatus;
}
