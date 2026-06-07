package com.fashion.supplychain.dashboard.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 延期环节分组DTO
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DelayedStageGroup {

    /**
     * 环节名称（如：采购、裁剪、纸样开发等）
     */
    private String stageName;

    /**
     * 该环节延期数量
     */
    private Integer count;

    /**
     * 该环节延期项列表
     */
    private List<DelayedItemDto> items;

    public DelayedStageGroup(String stageName) {
        this.stageName = stageName;
        this.count = 0;
        this.items = new java.util.ArrayList<>();
    }

    public void addItem(DelayedItemDto item) {
        this.items.add(item);
        this.count = this.items.size();
    }
}
