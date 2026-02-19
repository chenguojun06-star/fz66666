package com.fashion.supplychain.common;

import java.util.*;

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
    public static final String PROCESS_SEWING = "车缝";
    public static final String PROCESS_IRONING = "大烫";
    public static final String PROCESS_QUALITY = "质检";
    public static final String PROCESS_PACKAGING = "包装";
    public static final String PROCESS_WAREHOUSE = "入库";

    /**
     * 同义词映射表：key=标准名称, value=同义词列表
     */
    private static final Map<String, Set<String>> SYNONYM_MAP = new LinkedHashMap<>();

    static {
        // 采购环节同义词
        SYNONYM_MAP.put(PROCESS_PROCUREMENT, new HashSet<>(Arrays.asList(
                "采购", "物料采购", "面辅料采购", "备料", "到料", "进料", "物料")));

        // 裁剪环节同义词
        SYNONYM_MAP.put(PROCESS_CUTTING, new HashSet<>(Arrays.asList(
                "裁剪", "裁床", "剪裁", "开裁", "裁片", "裁切")));

        // 车缝/生产环节同义词（核心映射）
        SYNONYM_MAP.put(PROCESS_SEWING, new HashSet<>(Arrays.asList(
                "车缝", "缝制", "缝纫", "车工", "生产", "制作", "车位", "车间生产")));

        // 大烫环节同义词
        SYNONYM_MAP.put(PROCESS_IRONING, new HashSet<>(Arrays.asList(
                "大烫", "整烫", "熨烫", "烫整", "后整烫")));

        // 质检环节同义词
        SYNONYM_MAP.put(PROCESS_QUALITY, new HashSet<>(Arrays.asList(
                "质检", "检验", "品检", "验货", "QC", "品控", "检查")));

        // 包装环节同义词
        SYNONYM_MAP.put(PROCESS_PACKAGING, new HashSet<>(Arrays.asList(
                "包装", "后整", "打包", "装箱", "封箱", "贴标")));

        // 入库环节同义词
        SYNONYM_MAP.put(PROCESS_WAREHOUSE, new HashSet<>(Arrays.asList(
                "入库", "仓储", "上架", "进仓", "入仓")));
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
                if (name.contains(synonym) || synonym.contains(name)) {
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
