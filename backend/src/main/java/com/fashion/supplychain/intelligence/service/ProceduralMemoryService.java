package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ProceduralMemoryCreateDTO;
import com.fashion.supplychain.intelligence.dto.ProceduralMemoryUpdateDTO;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import com.fashion.supplychain.intelligence.mapper.ProceduralMemoryMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.List;

/**
 * L4程序性记忆服务
 *
 * <p>用途：SOP结构化存储与检索，流程类问题直接调用而非推理</p>
 *
 * @author xiaoyun
 * @since 2026-06-24
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProceduralMemoryService {

    private final ProceduralMemoryMapper proceduralMemoryMapper;

    /**
     * 根据用户消息检索匹配的SOP
     *
     * @param userMessage 用户消息
     * @return 匹配的SOP列表（最多3个）
     */
    public List<ProceduralMemory> searchSops(String userMessage) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            log.warn("[ProceduralMemory] tenantId为空，无法检索SOP");
            return List.of();
        }

        // 提取关键词
        String keyword = extractKeyword(userMessage);
        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }

        log.debug("[ProceduralMemory] 检索SOP，tenantId={}, keyword={}", tenantId, keyword);
        List<ProceduralMemory> sops = proceduralMemoryMapper.searchByKeyword(tenantId, keyword);
        log.debug("[ProceduralMemory] 找到{}个匹配SOP", sops.size());
        return sops;
    }

    /**
     * 根据SOP类型获取SOP
     *
     * @param sopType SOP类型
     * @return SOP（置信度最高的）
     */
    public ProceduralMemory findBySopType(String sopType) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return null;
        }
        return proceduralMemoryMapper.findBySopType(tenantId, sopType);
    }

    /**
     * 更新SOP调用统计
     *
     * @param sopId SOP ID
     * @param success 是否成功
     */
    public void recordUsage(Long sopId, boolean success) {
        if (sopId == null) return;
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) return;
            proceduralMemoryMapper.updateUsageStats(sopId, tenantId, success ? 1 : 0);
            log.debug("[ProceduralMemory] 更新SOP统计，id={}, success={}", sopId, success);
        } catch (Exception e) {
            log.warn("[ProceduralMemory] 更新统计失败，id={}: {}", sopId, e.getMessage());
        }
    }

    /**
     * 构建SOP上下文文本（用于注入Prompt）
     *
     * @param sops SOP列表
     * @return 格式化的SOP上下文
     */
    public String buildSopContext(List<ProceduralMemory> sops) {
        if (sops == null || sops.isEmpty()) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("\n\n[程序性记忆 - 标准操作流程]\n");
        sb.append("以下是相关的标准操作流程，请严格按照流程执行：\n\n");

        for (int i = 0; i < sops.size(); i++) {
            ProceduralMemory sop = sops.get(i);
            sb.append(String.format("%d. 【%s】%s\n", i + 1, sop.getSopType(), sop.getSopName()));
            sb.append(String.format("   置信度：%.0f%% | 调用次数：%d\n", 
                    sop.getConfidence().doubleValue() * 100, sop.getUsageCount()));

            // 解析步骤JSON
            if (sop.getStepsJson() != null && !sop.getStepsJson().isBlank()) {
                sb.append("   操作步骤：\n");
                try {
                    // 简单的步骤解析（实际应该用JSON库）
                    String steps = sop.getStepsJson()
                            .replaceAll("[\\[\\]\"]", "")  // 移除JSON括号和引号
                            .replaceAll("\\{", "\n     ")
                            .replaceAll("\\},", "\n")
                            .replaceAll("step:", "\n       - 步骤")
                            .replaceAll("action:", "：")
                            .replaceAll(",", " |");
                    sb.append(steps).append("\n");
                } catch (Exception e) {
                    sb.append("   [步骤详情]").append(sop.getStepsJson()).append("\n");
                }
            }

            // 触发关键词
            if (sop.getTriggerKeywords() != null && !sop.getTriggerKeywords().isBlank()) {
                sb.append("   适用场景：").append(sop.getTriggerKeywords()).append("\n");
            }
        }

        sb.append("\n请按照上述流程指导用户操作，确保步骤完整、数据准确。\n");
        return sb.toString();
    }

    /**
     * 从用户消息中提取关键词
     */
    private String extractKeyword(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            return null;
        }

        String msg = userMessage.toLowerCase();

        // 流程类关键词
        String[] workflowKeywords = {"扫码", "扫描", "计件", "报工", "质检", "检验", "入库", "工资", "结算", "交期", "预测", "供应商", "评估"};
        for (String kw : workflowKeywords) {
            if (msg.contains(kw)) {
                return kw;
            }
        }

        // 通用关键词：取前10个字符
        if (msg.length() >= 5) {
            return msg.substring(0, Math.min(10, msg.length()));
        }
        return msg;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 对外接口：匹配SOP（供 AiAgentPromptHelper 调用）
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 根据用户消息匹配SOP
     *
     * @param tenantId 租户ID
     * @param userMessage 用户消息
     * @return 匹配的SOP（置信度最高的）
     */
    public MatchedSOP matchSOP(Long tenantId, String userMessage) {
        if (tenantId == null || userMessage == null || userMessage.isBlank()) {
            return null;
        }

        String keyword = extractKeyword(userMessage);
        if (keyword == null || keyword.isBlank()) {
            return null;
        }

        log.debug("[ProceduralMemory.matchSOP] tenantId={}, keyword={}", tenantId, keyword);
        List<ProceduralMemory> sops = proceduralMemoryMapper.searchByKeyword(tenantId, keyword);

        if (sops == null || sops.isEmpty()) {
            log.debug("[ProceduralMemory.matchSOP] 未找到匹配的SOP，keyword={}", keyword);
            return null;
        }

        ProceduralMemory bestSOP = sops.get(0);
        log.debug("[ProceduralMemory.matchSOP] 匹配到SOP: {}", bestSOP.getSopName());

        return new MatchedSOP(bestSOP);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CRUD 方法（P0-3 L4 自编辑工具集升级，2026-07-22）
    // 不加 @Transactional（D-001：Service 层禁止事务）
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 创建 SOP
     *
     * @param tenantId 租户ID（从 UserContext 获取，不信任外部传入）
     * @param dto 创建参数
     * @return 创建后的 SOP
     */
    public ProceduralMemory createSop(Long tenantId, ProceduralMemoryCreateDTO dto) {
        if (tenantId == null) {
            throw new IllegalArgumentException("租户ID不能为空");
        }
        if (dto == null || dto.getSopName() == null || dto.getSopName().isBlank()) {
            throw new IllegalArgumentException("SOP名称不能为空");
        }

        ProceduralMemory sop = new ProceduralMemory();
        sop.setTenantId(tenantId);
        sop.setSopName(dto.getSopName());
        sop.setSopType(dto.getSopType());
        sop.setStepsJson(dto.getStepsJson());
        sop.setPreconditions(dto.getPreconditions());
        sop.setPostcheck(dto.getPostcheck());
        sop.setTriggerKeywords(dto.getTriggerKeywords());
        sop.setConfidence(dto.getConfidence() != null ? dto.getConfidence() : BigDecimal.valueOf(0.80));
        sop.setSource(dto.getSource() != null ? dto.getSource() : ProceduralMemory.SOURCE_MANUAL);
        sop.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : 1);
        sop.setVersion(1);
        sop.setUsageCount(0);
        sop.setSuccessCount(0);
        sop.setDeleteFlag(0);

        proceduralMemoryMapper.insert(sop);
        log.info("[ProceduralMemory.createSop] 创建SOP成功，tenantId={}, id={}, name={}",
                tenantId, sop.getId(), sop.getSopName());
        return sop;
    }

    /**
     * 更新 SOP（selective update，仅更新非 null 字段）
     *
     * @param tenantId 租户ID
     * @param id SOP ID
     * @param dto 更新参数
     * @return 更新后的 SOP
     */
    public ProceduralMemory updateSop(Long tenantId, Long id, ProceduralMemoryUpdateDTO dto) {
        if (tenantId == null || id == null) {
            throw new IllegalArgumentException("租户ID和SOP ID不能为空");
        }
        if (dto == null) {
            throw new IllegalArgumentException("更新参数不能为空");
        }

        // 校验存在 + 租户归属
        requireSopBelongsToTenant(tenantId, id);

        // selective update（MyBatis-Plus 默认 NOT_NULL 策略，仅更新非 null 字段）
        ProceduralMemory update = new ProceduralMemory();
        update.setId(id);
        if (dto.getSopName() != null) update.setSopName(dto.getSopName());
        if (dto.getSopType() != null) update.setSopType(dto.getSopType());
        if (dto.getStepsJson() != null) update.setStepsJson(dto.getStepsJson());
        if (dto.getPreconditions() != null) update.setPreconditions(dto.getPreconditions());
        if (dto.getPostcheck() != null) update.setPostcheck(dto.getPostcheck());
        if (dto.getTriggerKeywords() != null) update.setTriggerKeywords(dto.getTriggerKeywords());
        if (dto.getConfidence() != null) update.setConfidence(dto.getConfidence());
        if (dto.getSource() != null) update.setSource(dto.getSource());
        if (dto.getEnabled() != null) update.setEnabled(dto.getEnabled());

        proceduralMemoryMapper.updateById(update);
        log.info("[ProceduralMemory.updateSop] 更新SOP成功，tenantId={}, id={}", tenantId, id);
        return proceduralMemoryMapper.selectById(id);
    }

    /**
     * 软删除 SOP（delete_flag=1）
     *
     * @param tenantId 租户ID
     * @param id SOP ID
     */
    public void deleteSop(Long tenantId, Long id) {
        if (tenantId == null || id == null) {
            throw new IllegalArgumentException("租户ID和SOP ID不能为空");
        }
        requireSopBelongsToTenant(tenantId, id);

        ProceduralMemory update = new ProceduralMemory();
        update.setId(id);
        update.setDeleteFlag(1);
        proceduralMemoryMapper.updateById(update);
        log.info("[ProceduralMemory.deleteSop] 软删除SOP成功，tenantId={}, id={}", tenantId, id);
    }

    /**
     * 启用 SOP（enabled=1）
     *
     * @param tenantId 租户ID
     * @param id SOP ID
     */
    public void enableSop(Long tenantId, Long id) {
        setEnabled(tenantId, id, 1);
    }

    /**
     * 禁用 SOP（enabled=0）
     *
     * @param tenantId 租户ID
     * @param id SOP ID
     */
    public void disableSop(Long tenantId, Long id) {
        setEnabled(tenantId, id, 0);
    }

    /**
     * 列表查询 SOP
     *
     * @param tenantId 租户ID
     * @param sopType SOP类型（可选）
     * @param enabled 是否启用（可选）
     * @param limit 最多返回条数（上限200）
     * @return SOP 列表
     */
    public List<ProceduralMemory> listSops(Long tenantId, String sopType, Boolean enabled, int limit) {
        if (tenantId == null) {
            throw new IllegalArgumentException("租户ID不能为空");
        }
        int safeLimit = Math.min(Math.max(limit, 1), 200);

        LambdaQueryWrapper<ProceduralMemory> wrapper = new LambdaQueryWrapper<ProceduralMemory>()
                .eq(ProceduralMemory::getTenantId, tenantId)
                .eq(ProceduralMemory::getDeleteFlag, 0);
        if (sopType != null && !sopType.isBlank()) {
            wrapper.eq(ProceduralMemory::getSopType, sopType);
        }
        if (enabled != null) {
            wrapper.eq(ProceduralMemory::getEnabled, enabled ? 1 : 0);
        }
        wrapper.orderByDesc(ProceduralMemory::getConfidence)
                .orderByDesc(ProceduralMemory::getUsageCount)
                .last("LIMIT " + safeLimit);

        return proceduralMemoryMapper.selectList(wrapper);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 内部辅助方法
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * 设置 SOP 启用状态
     */
    private void setEnabled(Long tenantId, Long id, int enabled) {
        if (tenantId == null || id == null) {
            throw new IllegalArgumentException("租户ID和SOP ID不能为空");
        }
        requireSopBelongsToTenant(tenantId, id);

        ProceduralMemory update = new ProceduralMemory();
        update.setId(id);
        update.setEnabled(enabled);
        proceduralMemoryMapper.updateById(update);
        log.info("[ProceduralMemory.setEnabled] SOP={} enabled={}", id, enabled);
    }

    /**
     * 校验 SOP 存在且属于指定租户（P0铁律4：多租户隔离）
     *
     * @param tenantId 租户ID
     * @param id SOP ID
     * @return 存在的 SOP
     * @throws IllegalArgumentException 不存在或不属于该租户
     */
    private ProceduralMemory requireSopBelongsToTenant(Long tenantId, Long id) {
        ProceduralMemory sop = proceduralMemoryMapper.selectOne(
                new LambdaQueryWrapper<ProceduralMemory>()
                        .eq(ProceduralMemory::getId, id)
                        .eq(ProceduralMemory::getTenantId, tenantId)
                        .eq(ProceduralMemory::getDeleteFlag, 0));
        if (sop == null) {
            throw new IllegalArgumentException("SOP不存在或无权访问，id=" + id);
        }
        return sop;
    }

    /**
     * 匹配的SOP封装类（供Prompt注入）
     */
    public static class MatchedSOP {
        private final ProceduralMemory sop;
        private final List<Step> steps;

        public MatchedSOP(ProceduralMemory sop) {
            this.sop = sop;
            this.steps = parseSteps(sop.getStepsJson());
        }

        public ProceduralMemory getSOP() { return sop; }
        public List<Step> getSteps() { return steps; }
        public Long getSopId() { return sop.getId(); }

        /** 格式化SOP步骤为Prompt文本 */
        public String formatSteps() {
            if (steps == null || steps.isEmpty()) {
                return "";
            }

            StringBuilder sb = new StringBuilder();
            sb.append("\n\n[程序性记忆 - 标准操作流程]\n");
            sb.append("检测到你正在询问「").append(sop.getSopName()).append("」，请按以下标准流程指导：\n\n");

            for (Step step : steps) {
                sb.append(String.format("%d. 【%s】%s\n",
                        step.step, step.action, step.tool != null ? "使用工具：" + step.tool : ""));
                sb.append(String.format("   预期结果：%s\n", step.expected));
            }

            sb.append("\n请严格按照上述步骤执行，确保流程完整、数据准确。\n");
            return sb.toString();
        }

        private static List<Step> parseSteps(String stepsJson) {
            if (stepsJson == null || stepsJson.isBlank()) {
                return List.of();
            }
            try {
                // 简单JSON解析
                List<Step> steps = new java.util.ArrayList<>();
                // 移除数组括号
                String json = stepsJson.replaceAll("[\\[\\]\"]", "");
                String[] items = json.split("\\},");
                for (String item : items) {
                    item = item.replace("{", "").replace("}", "").trim();
                    if (item.isEmpty()) continue;

                    Step step = new Step();
                    for (String pair : item.split(",")) {
                        String[] kv = pair.split(":");
                        if (kv.length < 2) continue;
                        String key = kv[0].trim().toLowerCase();
                        String val = kv[1].trim();

                        if ("step".equals(key)) {
                            step.step = Integer.parseInt(val);
                        } else if ("action".equals(key)) {
                            step.action = val;
                        } else if ("tool".equals(key)) {
                            step.tool = val;
                        } else if ("expected".equals(key)) {
                            step.expected = val;
                        }
                    }
                    if (step.step > 0) {
                        steps.add(step);
                    }
                }
                return steps;
            } catch (Exception e) {
                log.warn("[ProceduralMemory.parseSteps] 解析失败: {}", e.getMessage());
                return List.of();
            }
        }

        public static class Step {
            public int step;
            public String action;
            public String tool;
            public String expected;
        }
    }
}
