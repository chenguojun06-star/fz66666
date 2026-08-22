package com.fashion.supplychain.production.dto.smart;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 智能采购提示（可解释性信息）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SourcingHint {

    /** 提示类型：info / warn / success / risk */
    private String type;

    /** 提示文案，例如："BOM指定供应商3个"、"历史采购价高于BOM预估12%"、"面料缺口，无法开裁" */
    private String message;
}
