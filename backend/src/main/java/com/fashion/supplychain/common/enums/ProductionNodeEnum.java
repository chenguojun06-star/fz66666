package com.fashion.supplychain.common.enums;

import java.util.Arrays;
import java.util.List;

/**
 * 生产环节枚举
 * <p>
 * 定义服装生产过程中的父级环节节点，包括：
 * - 采购
 * - 裁剪
 * - 车缝
 * - 尾部
 * - 二次工艺
 * - 入库
 * <p>
 * 每个父级环节下可以包含多个子环节，子环节没有限制
 */
public enum ProductionNodeEnum {

    /**
     * 采购 - 原材料采购环节
     */
    PURCHASE("purchase", "采购", 1),

    /**
     * 裁剪 - 面料裁剪环节
     */
    CUTTING("cutting", "裁剪", 2),

    /**
     * 车缝 - 缝制加工环节
     */
    SEWING("sewing", "车缝", 3),

    /**
     * 尾部 - 尾部处理环节（质检、包装等）
     */
    FINISHING("finishing", "尾部", 4),

    /**
     * 二次工艺 - 特殊工艺处理环节（印花、绣花等）
     */
    SECONDARY_PROCESS("secondary_process", "二次工艺", 5),

    /**
     * 入库 - 成品入库环节
     */
    WAREHOUSING("warehousing", "入库", 6);

    /**
     * 环节编码
     */
    private final String code;

    /**
     * 环节名称
     */
    private final String name;

    /**
     * 环节顺序（用于流程排序）
     */
    private final int sortOrder;

    ProductionNodeEnum(String code, String name, int sortOrder) {
        this.code = code;
        this.name = name;
        this.sortOrder = sortOrder;
    }

    /**
     * 获取环节编码
     *
     * @return 环节编码
     */
    public String getCode() {
        return code;
    }

    /**
     * 获取环节名称
     *
     * @return 环节名称
     */
    public String getName() {
        return name;
    }

    /**
     * 获取环节顺序
     *
     * @return 环节顺序
     */
    public int getSortOrder() {
        return sortOrder;
    }

    /**
     * 根据编码获取枚举
     *
     * @param code 环节编码
     * @return 生产环节枚举，找不到返回null
     */
    public static ProductionNodeEnum getByCode(String code) {
        if (code == null || code.trim().isEmpty()) {
            return null;
        }
        for (ProductionNodeEnum node : values()) {
            if (node.code.equalsIgnoreCase(code.trim())) {
                return node;
            }
        }
        return null;
    }

    /**
     * 获取所有父级环节（按顺序排序）
     *
     * @return 父级环节列表
     */
    public static List<ProductionNodeEnum> getAllParentNodes() {
        return Arrays.asList(values());
    }

    /**
     * 获取下一个环节
     *
     * @return 下一个环节，如果是最后一个返回null
     */
    public ProductionNodeEnum getNextNode() {
        ProductionNodeEnum[] nodes = values();
        int nextIndex = this.ordinal() + 1;
        if (nextIndex < nodes.length) {
            return nodes[nextIndex];
        }
        return null;
    }

    /**
     * 获取上一个环节
     *
     * @return 上一个环节，如果是第一个返回null
     */
    public ProductionNodeEnum getPreviousNode() {
        int prevIndex = this.ordinal() - 1;
        if (prevIndex >= 0) {
            return values()[prevIndex];
        }
        return null;
    }

    /**
     * 判断是否为第一个环节
     *
     * @return true表示第一个环节
     */
    public boolean isFirstNode() {
        return this == PURCHASE;
    }

    /**
     * 判断是否为最后一个环节
     *
     * @return true表示最后一个环节
     */
    public boolean isLastNode() {
        return this == WAREHOUSING;
    }
}
