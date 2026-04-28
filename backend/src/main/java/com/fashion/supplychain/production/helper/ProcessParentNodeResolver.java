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
                result.merge(parentNode, entry.getValue(), Integer::sum);
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
        if ("质检".equals(pn) || ProcessSynonymMapping.isEquivalent("质检", pn)) return "质检";
        if ("包装".equals(pn) || ProcessSynonymMapping.isEquivalent("包装", pn)) return "包装";
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

    public Integer resolveTrackingMinRate(Map<String, Integer> trackingByProcess, int baseQty,
            String[] parentKeywords, String[] subProcessKeywords,
            java.util.function.BiFunction<Integer, Integer, Integer> rateComputer) {
        if (trackingByProcess.isEmpty() || baseQty <= 0) {
            return null;
        }
        Map<String, Integer> subProcessQtys = new HashMap<>();
        for (Map.Entry<String, Integer> entry : trackingByProcess.entrySet()) {
            String pname = entry.getKey() == null ? "" : entry.getKey().trim();
            if (pname.isEmpty() || entry.getValue() == null || entry.getValue() <= 0) {
                continue;
            }
            boolean isParent = false;
            for (String kw : parentKeywords) {
                if (pname.toLowerCase().contains(kw.toLowerCase())) {
                    isParent = true;
                    break;
                }
            }
            if (isParent) {
                continue;
            }
            boolean isSubProcess = false;
            for (String kw : subProcessKeywords) {
                if (pname.toLowerCase().contains(kw.toLowerCase())) {
                    isSubProcess = true;
                    break;
                }
            }
            if (!isSubProcess) {
                boolean matchesAnyParent = false;
                for (String kw : parentKeywords) {
                    if (pname.toLowerCase().contains(kw.toLowerCase())) {
                        matchesAnyParent = true;
                        break;
                    }
                }
                if (!matchesAnyParent) {
                    continue;
                }
            }
            subProcessQtys.merge(pname, entry.getValue(), Integer::sum);
        }
        if (subProcessQtys.isEmpty()) {
            return null;
        }
        int minRate = 100;
        for (Map.Entry<String, Integer> e : subProcessQtys.entrySet()) {
            int rate = rateComputer.apply(e.getValue(), baseQty);
            if (rate < minRate) {
                minRate = rate;
            }
        }
        return minRate;
    }
}
