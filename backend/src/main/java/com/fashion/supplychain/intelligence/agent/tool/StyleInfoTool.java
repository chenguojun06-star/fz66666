package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 款式全景查询工具 — 根据款号查询基本信息、开发状态、工序/工价。
 */
@Slf4j
@Component
public class StyleInfoTool extends AbstractAgentTool {

    @Autowired private StyleInfoService styleInfoService;
    @Autowired private StyleProcessService styleProcessService;

    @Override
    public String getName() {
        return "tool_query_style_info";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("styleNo", stringProp("款号（Style No），例如：D2024001"));
        return buildToolDef(
                "根据款号获取款式全景数据：基本信息、开发状态、工序列表、IE标准工时、工价。",
                props, List.of("styleNo"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String styleNo = requireString(args, "styleNo");

        Long tenantId = UserContext.tenantId();

        QueryWrapper<StyleInfo> queryWrapper = new QueryWrapper<>();
        queryWrapper.eq("style_no", styleNo);
        if (tenantId != null) {
            queryWrapper.eq("tenant_id", tenantId);
        }
        queryWrapper.eq("delete_flag", 0);
        StyleInfo info = styleInfoService.getOne(queryWrapper);

        if (info == null) {
            return "未找到款号为 " + styleNo + " 的款式信息。";
        }

        QueryWrapper<StyleProcess> processQuery = new QueryWrapper<>();
        processQuery.eq("style_id", info.getId());
        processQuery.eq("delete_flag", 0);
        List<StyleProcess> processes = styleProcessService.list(processQuery);

        StringBuilder sb = new StringBuilder();
        sb.append("款式编号: ").append(info.getStyleNo()).append("\n");
        sb.append("款式名称: ").append(info.getStyleName() != null ? info.getStyleName() : "无").append("\n");
        sb.append("品类: ").append(info.getCategory() != null ? info.getCategory() : "无").append("\n");
        sb.append("款式单价: ").append(info.getPrice() != null ? info.getPrice().toString() : "未设置").append("\n");
        sb.append("开发周期: ").append(info.getCycle() != null ? info.getCycle() : "无").append("\n");
        sb.append("纸样状态: ").append(info.getPatternStatus() != null ? info.getPatternStatus() : "未开始").append("\n");
        sb.append("样衣状态: ").append(info.getSampleStatus() != null ? info.getSampleStatus() : "未开始").append("\n");
        sb.append("样衣进度: ").append(info.getSampleProgress() != null ? info.getSampleProgress() + "%" : "0%").append("\n");
        sb.append("开发整体进度节点: ").append(info.getProgressNode() != null ? info.getProgressNode() : "未知").append("\n");

        if (processes != null && !processes.isEmpty()) {
            sb.append("\n工序及标准工时/工价：\n");
            for (StyleProcess p : processes) {
                sb.append("- ").append(p.getProcessName())
                  .append(" | 难度: ").append(p.getDifficulty() != null ? p.getDifficulty() : "无")
                  .append(" | IE标准工时: ").append(p.getStandardTime() != null ? p.getStandardTime() + "秒" : "未知")
                  .append(" | 工价: ").append(p.getPrice() != null ? "¥" + p.getPrice() : "未知")
                  .append("\n");
            }
        } else {
            sb.append("\n尚未配置工序信息。\n");
        }

        return sb.toString();
    }
}
