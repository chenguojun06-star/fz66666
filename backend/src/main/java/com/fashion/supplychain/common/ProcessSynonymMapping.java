package com.fashion.supplychain.common;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 工序名称同义词映射表
 * 用于解决不同叫法的工序名称匹配问题，如"车缝"vs"缝制"vs"生产"
 */
public class ProcessSynonymMapping {

    /**
     * 标准工序名称
     */
    public static final String PROCESS_PROCUREMENT = "采购";
    public static final String PROCESS_CUTTING = "裁剪";
    public static final String PROCESS_SECONDARY = "二次工艺";
    public static final String PROCESS_SEWING = "车缝";
    public static final String PROCESS_TAIL = "尾部";
    public static final String PROCESS_WAREHOUSE = "入库";

    /**
     * 同义词映射表：key=标准名称, value=同义词列表
     */
    private static final Map<String, Set<String>> SYNONYM_MAP;

    static {
        Map<String, Set<String>> map = new LinkedHashMap<>();
        map.put(PROCESS_PROCUREMENT, Set.of(
                "采购", "物料采购", "面辅料采购", "备料", "到料", "进料", "物料"));
        map.put(PROCESS_CUTTING, Set.of(
                "裁剪", "裁床", "剪裁", "开裁", "裁片", "裁切"));
        map.put(PROCESS_SEWING, Set.of(
                "车缝", "缝制", "缝纫", "车工", "整件", "生产", "制作", "车位", "车间生产"));
        map.put(PROCESS_SECONDARY, Set.of(
                "二次工艺", "二次", "绣花", "印花", "水洗"));
        map.put(PROCESS_TAIL, Set.of(
                "尾部", "后整理", "后道", "大烫", "整烫", "剪线", "质检", "包装"));
        map.put(PROCESS_WAREHOUSE, Set.of(
                "入库", "仓储", "上架", "进仓", "入仓", "验收", "成品入库"));
        SYNONYM_MAP = Collections.unmodifiableMap(map);
    }

    /**
     * 获取标准工序名称
     *
     * @param processName 任意工序名称
     * @return 标准工序名称，如果无法匹配则返回原名称
     */
    public static String normalize(String processName) {
        if (processName == null || processName.trim().isEmpty()) {
            return processName;
        }
        String name = processName.trim();
        for (Map.Entry<String, Set<String>> entry : SYNONYM_MAP.entrySet()) {
            if (entry.getValue().contains(name)) {
                return entry.getKey();
            }
        }
        // 模糊匹配：检查是否包含某个同义词
        for (Map.Entry<String, Set<String>> entry : SYNONYM_MAP.entrySet()) {
            for (String synonym : entry.getValue()) {
                if (name.contains(synonym)) {
                    return entry.getKey();
                }
            }
        }
        return name;
    }

    /**
     * 判断两个工序名称是否等价
     *
     * @param name1 工序名称1
     * @param name2 工序名称2
     * @return 是否等价
     */
    public static boolean isEquivalent(String name1, String name2) {
        if (name1 == null || name2 == null) {
            return false;
        }
        String n1 = name1.trim();
        String n2 = name2.trim();
        if (n1.equals(n2)) {
            return true;
        }
        String standard1 = normalize(n1);
        String standard2 = normalize(n2);
        return standard1.equals(standard2);
    }

    /**
     * 获取某个标准工序的所有同义词
     *
     * @param standardName 标准工序名称
     * @return 同义词集合
     */
    public static Set<String> getSynonyms(String standardName) {
        return SYNONYM_MAP.getOrDefault(standardName, Collections.emptySet());
    }

    /**
     * 获取所有标准工序名称
     *
     * @return 标准工序名称列表
     */
    public static List<String> getStandardProcessNames() {
        return new ArrayList<>(SYNONYM_MAP.keySet());
    }
}
