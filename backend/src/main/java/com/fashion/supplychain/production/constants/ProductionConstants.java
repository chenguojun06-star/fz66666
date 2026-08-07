package com.fashion.supplychain.production.constants;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class ProductionConstants {

    private ProductionConstants() {}

    /**
     * 固定生产节点（含采购/入库，仅用于解析旧数据兼容）
     *
     * 行业标准：采购/入库不属于生产工序——
     *   采购是供应链模块（看采购单状态），入库是仓储模块（看仓库收货）。
     *   这两个阶段是"数据驱动"，不是"门禁驱动"（不靠生产扫码卡）。
     *
     * 保留6节点仅用于解析历史订单的 progressWorkflowJson，
     * 新数据不再生成采购/入库节点（见 CuttingWorkflowBuilderHelper.STAGE_ORDER）。
     */
    public static final List<String> FIXED_PRODUCTION_NODES = Collections.unmodifiableList(
            Arrays.asList("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"));

    public static final String[] FIXED_PRODUCTION_NODES_ARRAY = {
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"
    };

    /**
     * 核心生产工序：裁剪 → 二次工艺 → 车缝 → 尾部
     *
     * 行业做法：采购和入库不属于生产工序——
     *   采购是供应链模块（看采购单状态），入库是仓储模块（看仓库收货）。
     *   这两个阶段是"数据驱动"，不是"门禁驱动"（不靠生产扫码卡）。
     *
     * 工序配置、进度展示、门禁校验只使用这4个核心生产工序。
     */
    public static final List<String> PRODUCTION_CORE_NODES = Collections.unmodifiableList(
            Arrays.asList("裁剪", "二次工艺", "车缝", "尾部"));

    /**
     * 非门禁阶段：采购、入库
     *
     * 这些阶段不参与工序门禁校验：
     *   采购完成看采购单状态（procurement_manually_completed=1）
     *   入库完成看仓库收货（completedQuantity 累加）
     */
    public static final java.util.Set<String> NON_GATE_STAGES = java.util.Collections.unmodifiableSet(
            new java.util.LinkedHashSet<>(java.util.Arrays.asList("采购", "入库")));

    public static final int NODE_INDEX_PROCUREMENT = 0;
    public static final int NODE_INDEX_CUTTING = 1;
    public static final int NODE_INDEX_SECONDARY_PROCESS = 2;
    public static final int NODE_INDEX_SEWING = 3;
    public static final int NODE_INDEX_TAIL = 4;
    public static final int NODE_INDEX_WAREHOUSE = 5;

    public static int indexOfFixedNode(String name) {
        if (name == null) return -1;
        for (int i = 0; i < FIXED_PRODUCTION_NODES_ARRAY.length; i++) {
            if (FIXED_PRODUCTION_NODES_ARRAY[i].equals(name.trim())) return i;
        }
        return -1;
    }
}
