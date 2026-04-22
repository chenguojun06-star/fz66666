package com.fashion.supplychain.template.helper;

import com.fashion.supplychain.common.ProcessSynonymMapping;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 模板工序/阶段名称匹配辅助类。
 * 从 TemplateLibraryServiceImpl 提取，负责所有阶段名称的规范化与同义词匹配。
 */
@Component
@Slf4j
public class TemplateStageNameHelper {

    public static final String STAGE_ORDER_CREATED = "下单";
    public static final String STAGE_PROCUREMENT = "采购";

    public String normalizeStageName(String v) {
        if (!StringUtils.hasText(v)) {
            return "";
        }
        return v.trim().replaceAll("\\s+", "");
    }

    public boolean isProgressProductionStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("生产") || n.contains("车缝") || n.contains("缝制") || n.contains("缝纫") || n.contains("车工");
    }

    public boolean isProgressIroningStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("整烫") || n.contains("熨烫") || n.contains("大烫");
    }

    public boolean isProgressCuttingStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("裁剪") || n.contains("裁床") || n.contains("剪裁") || n.contains("开裁");
    }

    public boolean isProgressShipmentStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("出货") || n.contains("发货") || n.contains("发运");
    }

    public boolean isBaseStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return progressStageNameMatches(STAGE_ORDER_CREATED, n) || progressStageNameMatches(STAGE_PROCUREMENT, n);
    }

    public boolean isProgressOrderCreatedStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains(STAGE_ORDER_CREATED) || n.contains("订单创建") || n.contains("创建订单") || n.contains("开单")
                || n.contains("制单");
    }

    public boolean isProgressProcurementStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains(STAGE_PROCUREMENT) || n.contains("物料采购") || n.contains("面辅料采购") || n.contains("备料")
                || n.contains("到料");
    }

    public boolean isProgressQualityStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("质检") || n.contains("检验") || n.contains("品检") || n.contains("验货");
    }

    public boolean isProgressPackagingStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("包装") || n.contains("后整") || n.contains("打包") || n.contains("装箱");
    }

    public boolean progressStageNameMatches(String stageName, String recordProcessName) {
        String a = normalizeStageName(stageName);
        String b = normalizeStageName(recordProcessName);
        if (!StringUtils.hasText(a) || !StringUtils.hasText(b)) {
            return false;
        }
        if (a.equals(b)) {
            return true;
        }
        if (a.contains(b) || b.contains(a)) {
            return true;
        }
        // 优先使用同义词映射表进行匹配
        if (ProcessSynonymMapping.isEquivalent(a, b)) {
            return true;
        }
        if (isProgressOrderCreatedStageName(a) && isProgressOrderCreatedStageName(b)) {
            return true;
        }
        if (isProgressProcurementStageName(a) && isProgressProcurementStageName(b)) {
            return true;
        }
        if (isProgressCuttingStageName(a) && isProgressCuttingStageName(b)) {
            return true;
        }
        if (isProgressQualityStageName(a) && isProgressQualityStageName(b)) {
            return true;
        }
        if (isProgressPackagingStageName(a) && isProgressPackagingStageName(b)) {
            return true;
        }
        if (isProgressIroningStageName(a) && isProgressIroningStageName(b)) {
            return true;
        }
        if (isProgressProductionStageName(a) && isProgressProductionStageName(b)) {
            return true;
        }
        if (isProgressShipmentStageName(a) && isProgressShipmentStageName(b)) {
            return true;
        }
        return false;
    }
}
