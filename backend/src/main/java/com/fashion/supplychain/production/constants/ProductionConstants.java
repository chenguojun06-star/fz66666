package com.fashion.supplychain.production.constants;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class ProductionConstants {

    private ProductionConstants() {}

    public static final List<String> FIXED_PRODUCTION_NODES = Collections.unmodifiableList(
            Arrays.asList("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"));

    public static final String[] FIXED_PRODUCTION_NODES_ARRAY = {
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"
    };

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
