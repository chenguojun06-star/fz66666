package com.fashion.supplychain.stock.dto;

import lombok.Data;

import java.util.List;

@Data
public class SampleStockInboundBatchRequest {
    private String styleId;
    private String styleNo;
    private String styleName;
    private String sampleType;
    private String location;
    private String remark;
    private String imageUrl;
    private List<Row> rows;

    @Data
    public static class Row {
        private String color;
        private String size;
        private Integer quantity;
    }
}
