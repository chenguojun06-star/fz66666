package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
@RequiredArgsConstructor
public class ProcessParentNodeResolver {

    private final ProcessParentMappingService processParentMappingService;

    public Map<String, Integer> buildParentNodeQtyMap(Map<String, Integer> trackingByProcess) {
        Map<String, Integer> result = new HashMap<>();
        if (trackingByProcess == null || trackingByProcess.isEmpty()) {
            return result;
        }
        for (Map.Entry<String, Integer> entry : trackingByProcess.entrySet()) {
            String pname = entry.getKey() == null ? "" : entry.getKey().trim();
            if (pname.isEmpty() || entry.getValue() == null || entry.getValue() <= 0) {
                continue;
            }
            String parentNode = resolveParentForAggregation(pname);
            if (parentNode != null) {
                result.merge(parentNode, entry.getValue(), Math::max);
            }
        }
        return result;
    }

    public String resolveParentForAggregation(String processName) {
        if (!StringUtils.hasText(processName)) return null;
        String pn = processName.trim();
        if ("采购".equals(pn) || ProcessSynonymMapping.isEquivalent("采购", pn)) return "采购";
        if ("裁剪".equals(pn) || ProcessSynonymMapping.isEquivalent("裁剪", pn)) return "裁剪";
        if ("车缝".equals(pn) || ProcessSynonymMapping.isEquivalent("车缝", pn)) return "车缝";
        if ("二次工艺".equals(pn) || ProcessSynonymMapping.isEquivalent("二次工艺", pn)) return "二次工艺";
        if ("尾部".equals(pn) || ProcessSynonymMapping.isEquivalent("尾部", pn)) return "尾部";
        if ("入库".equals(pn) || ProcessSynonymMapping.isEquivalent("入库", pn)) return "入库";
        String mapped = processParentMappingService.resolveParentNode(pn);
        if (StringUtils.hasText(mapped)) return mapped;
        return null;
    }

    public boolean isParentNodeMatch(String processName, String targetParent) {
        if (!StringUtils.hasText(processName)) return false;
        String pn = processName.trim();
        if (targetParent.equals(pn)) return true;
        if (ProcessSynonymMapping.isEquivalent(targetParent, pn)) return true;
        String mapped = processParentMappingService.resolveParentNode(pn);
        return targetParent.equals(mapped);
    }

    public boolean isAnyRecognizedParentNode(String processName) {
        if (!StringUtils.hasText(processName)) return false;
        String pn = processName.trim();
        if (isParentNodeMatch(pn, "采购")) return true;
        if (isParentNodeMatch(pn, "裁剪")) return true;
        if (isParentNodeMatch(pn, "车缝")) return true;
        if (isParentNodeMatch(pn, "二次工艺")) return true;
        if (isParentNodeMatch(pn, "尾部")) return true;
        if (isParentNodeMatch(pn, "入库")) return true;
        return false;
    }

    /**
     * D-276：按父子映射计算父节点阶段进度——min(各归属子工序的扫码率)。
     *
     * <p>口径：把每个已扫子工序通过 {@link #isParentNodeMatch}（同义词 + 租户配置映射）
     * 归属到目标父节点，串行子工序链的完成度由最慢（最少）一道决定，故取最小值。
     * trackingByProcess 只含 qty&gt;0 的已扫工序（未扫的不在表内，忽略）。
     *
     * @return null = 没有任何已扫子工序归属到该父节点（调用方自行回退）
     */
    public Integer resolveParentStageRate(Map<String, Integer> trackingByProcess, int baseQty,
            String targetParent, java.util.function.BiFunction<Integer, Integer, Integer> rateComputer) {
        if (trackingByProcess == null || trackingByProcess.isEmpty() || baseQty <= 0) {
            return null;
        }
        int minRate = 100;
        boolean found = false;
        for (Map.Entry<String, Integer> entry : trackingByProcess.entrySet()) {
            String pname = entry.getKey() == null ? "" : entry.getKey().trim();
            Integer qty = entry.getValue();
            if (pname.isEmpty() || qty == null || qty <= 0) {
                continue;
            }
            if (!isParentNodeMatch(pname, targetParent)) {
                continue;
            }
            int rate = rateComputer.apply(qty, baseQty);
            if (!found || rate < minRate) {
                minRate = rate;
                found = true;
            }
        }
        return found ? minRate : null;
    }
}
