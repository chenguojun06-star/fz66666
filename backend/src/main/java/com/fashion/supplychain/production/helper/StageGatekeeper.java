package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.production.service.StageConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 环节扫码门禁：按父环节配置的「可操作人」白名单拦截扫码。
 *
 * 规则（需求）：
 *  - 环节未配置可操作人（operators_json 为空）→ 所有人员可操作（放行）
 *  - 环节配置了可操作人 → 仅白名单内人员可扫码；不在名单 → 拒绝
 *  - 管理员（UserContext.isTopAdmin()，含租户主账号）一律放行
 *  - 所有扫码都拦截（生产/质检/入库共用本门禁）
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class StageGatekeeper {

    private final StageConfigService stageConfigService;
    private final ProcessParentMappingService processParentMappingService;

    /**
     * 解析扫码所属父环节。
     *
     * @param scanType      扫码类型（production/quality/warehouse）
     * @param progressStage 已解析父环节（生产路径直接使用）
     * @param processName   子工序名（质检等路径用于兜底解析父环节）
     */
    public String resolveStageForScan(String scanType, String progressStage, String processName) {
        String st = scanType == null ? "" : scanType.trim().toLowerCase();
        if ("warehouse".equals(st)) {
            return "入库";
        }
        if (hasText(progressStage)) {
            return progressStage.trim();
        }
        // 依 processName 兜底解析父环节
        String parent = ProcessParentNodeResolverStatic.resolve(processName, processParentMappingService);
        return parent != null ? parent : ("quality".equals(st) ? "尾部" : null);
    }

    /**
     * 校验当前操作员是否可执行指定父环节。不可操作时抛 {@link AccessDeniedException}。
     *
     * @param parentStage   父环节名（采购/裁剪/二次工艺/车缝/尾部/入库）
     * @param operatorId    操作员ID
     * @param operatorName  操作员名
     */
    public void validateStagePermission(String parentStage, String operatorId, String operatorName) {
        if (UserContext.isTopAdmin()) {
            return; // 管理员不受限
        }
        if (!hasText(parentStage)) {
            return; // 无法确定环节则不拦截（避免误伤）
        }
        Boolean allowed = stageConfigService.isOperatorAllowed(parentStage, operatorId, operatorName);
        if (Boolean.FALSE.equals(allowed)) {
            List<Map<String, String>> operators = stageConfigService.parseOperators(
                    stageConfigService.getEffectiveConfig(parentStage) == null ? null
                            : stageConfigService.getEffectiveConfig(parentStage).getOperatorsJson());
            StringBuilder names = new StringBuilder();
            if (operators != null) {
                for (Map<String, String> op : operators) {
                    if (op != null && StringUtils.hasText(op.get("name"))) {
                        if (names.length() > 0) names.append("、");
                        names.append(op.get("name"));
                    }
                }
            }
            String who = names.length() > 0 ? names.toString() : "指定人员";
            throw new AccessDeniedException("当前环节[" + parentStage + "]仅限 " + who + " 操作，请联系管理员");
        }
        // null 或 true → 放行
    }

    private boolean hasText(String s) {
        return s != null && !s.trim().isEmpty();
    }

    /** 静态代理，避免本类与 ProcessParentNodeResolver 重复循环依赖 */
    private static final class ProcessParentNodeResolverStatic {
        static String resolve(String processName, ProcessParentMappingService svc) {
            if (processName == null || processName.trim().isEmpty()) return null;
            String mapped = svc.resolveParentNode(processName.trim());
            if (StringUtils.hasText(mapped)) return mapped;
            return null;
        }
    }
}