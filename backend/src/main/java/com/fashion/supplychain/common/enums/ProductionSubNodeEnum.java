package com.fashion.supplychain.common.enums;

import java.util.ArrayList;
import java.util.List;

/**
 * 生产子环节枚举
 * <p>
 * 定义每个父级环节下的子环节，子环节可以根据实际业务灵活配置
 * </p>
 */
public enum ProductionSubNodeEnum {

    // ==================== 采购环节子节点 ====================
    /**
     * 面料采购
     */
    FABRIC_PURCHASE("fabric_purchase", "面料采购", ProductionNodeEnum.PURCHASE),

    /**
     * 辅料采购
     */
    ACCESSORY_PURCHASE("accessory_purchase", "辅料采购", ProductionNodeEnum.PURCHASE),

    /**
     * 物料检验
     */
    MATERIAL_INSPECTION("material_inspection", "物料检验", ProductionNodeEnum.PURCHASE),

    // ==================== 裁剪环节子节点 ====================
    /**
     * 排料
     */
    LAYOUT("layout", "排料", ProductionNodeEnum.CUTTING),

    /**
     * 裁剪
     */
    CUTTING_OPERATION("cutting_operation", "裁剪", ProductionNodeEnum.CUTTING),

    /**
     * 分包
     */
    BUNDLING("bundling", "分包", ProductionNodeEnum.CUTTING),

    /**
     * 裁片检验
     */
    CUTTING_INSPECTION("cutting_inspection", "裁片检验", ProductionNodeEnum.CUTTING),

    // ==================== 车缝环节子节点 ====================
    /**
     * 前片缝制
     */
    FRONT_SEWING("front_sewing", "前片缝制", ProductionNodeEnum.SEWING),

    /**
     * 后片缝制
     */
    BACK_SEWING("back_sewing", "后片缝制", ProductionNodeEnum.SEWING),

    /**
     * 袖子缝制
     */
    SLEEVE_SEWING("sleeve_sewing", "袖子缝制", ProductionNodeEnum.SEWING),

    /**
     * 上领
     */
    COLLAR_SEWING("collar_sewing", "上领", ProductionNodeEnum.SEWING),

    /**
     * 上袖
     */
    SLEEVE_ATTACHING("sleeve_attaching", "上袖", ProductionNodeEnum.SEWING),

    /**
     * 合侧缝
     */
    SIDE_SEAM("side_seam", "合侧缝", ProductionNodeEnum.SEWING),

    /**
     * 锁边
     */
    OVERLOCK("overlock", "锁边", ProductionNodeEnum.SEWING),

    // ==================== 尾部环节子节点 ====================
    /**
     * 剪线头
     */
    THREAD_TRIMMING("thread_trimming", "剪线头", ProductionNodeEnum.FINISHING),

    /**
     * 整烫
     */
    PRESSING("pressing", "整烫", ProductionNodeEnum.FINISHING),

    /**
     * 质检
     */
    QUALITY_CHECK("quality_check", "质检", ProductionNodeEnum.FINISHING),

    /**
     * 包装
     */
    PACKING("packing", "包装", ProductionNodeEnum.FINISHING),

    /**
     * 挂吊牌
     */
    TAGGING("tagging", "挂吊牌", ProductionNodeEnum.FINISHING),

    // ==================== 二次工艺环节子节点 ====================
    /**
     * 印花
     */
    PRINTING("printing", "印花", ProductionNodeEnum.SECONDARY_PROCESS),

    /**
     * 绣花
     */
    EMBROIDERY("embroidery", "绣花", ProductionNodeEnum.SECONDARY_PROCESS),

    /**
     * 烫钻
     */
    RHINESTONE("rhinestone", "烫钻", ProductionNodeEnum.SECONDARY_PROCESS),

    /**
     * 水洗
     */
    WASHING("washing", "水洗", ProductionNodeEnum.SECONDARY_PROCESS),

    /**
     * 酵素洗
     */
    ENZYME_WASH("enzyme_wash", "酵素洗", ProductionNodeEnum.SECONDARY_PROCESS),

    // ==================== 入库环节子节点 ====================
    /**
     * 点数
     */
    COUNTING("counting", "点数", ProductionNodeEnum.WAREHOUSING),

    /**
     * 入库登记
     */
    WAREHOUSING_REGISTER("warehousing_register", "入库登记", ProductionNodeEnum.WAREHOUSING),

    /**
     * 上架
     */
    SHELVING("shelving", "上架", ProductionNodeEnum.WAREHOUSING);

    /**
     * 子环节编码
     */
    private final String code;

    /**
     * 子环节名称
     */
    private final String name;

    /**
     * 所属父环节
     */
    private final ProductionNodeEnum parentNode;

    ProductionSubNodeEnum(String code, String name, ProductionNodeEnum parentNode) {
        this.code = code;
        this.name = name;
        this.parentNode = parentNode;
    }

    /**
     * 获取子环节编码
     *
     * @return 子环节编码
     */
    public String getCode() {
        return code;
    }

    /**
     * 获取子环节名称
     *
     * @return 子环节名称
     */
    public String getName() {
        return name;
    }

    /**
     * 获取所属父环节
     *
     * @return 父环节枚举
     */
    public ProductionNodeEnum getParentNode() {
        return parentNode;
    }

    /**
     * 根据编码获取枚举
     *
     * @param code 子环节编码
     * @return 子环节枚举，找不到返回null
     */
    public static ProductionSubNodeEnum getByCode(String code) {
        if (code == null || code.trim().isEmpty()) {
            return null;
        }
        for (ProductionSubNodeEnum subNode : values()) {
            if (subNode.code.equalsIgnoreCase(code.trim())) {
                return subNode;
            }
        }
        return null;
    }

    /**
     * 根据父环节获取所有子环节
     *
     * @param parentNode 父环节
     * @return 子环节列表
     */
    public static List<ProductionSubNodeEnum> getByParentNode(ProductionNodeEnum parentNode) {
        List<ProductionSubNodeEnum> result = new ArrayList<>();
        if (parentNode == null) {
            return result;
        }
        for (ProductionSubNodeEnum subNode : values()) {
            if (subNode.parentNode == parentNode) {
                result.add(subNode);
            }
        }
        return result;
    }

    /**
     * 判断是否属于指定父环节
     *
     * @param parentNode 父环节
     * @return true表示属于该父环节
     */
    public boolean belongsTo(ProductionNodeEnum parentNode) {
        return this.parentNode == parentNode;
    }
}
