package com.fashion.supplychain.system.importer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

@Component
@Slf4j
public class ProcessExcelImporter {

    private static final String[] PROCESS_HEADERS = {
            "款号*", "工序名称*", "工序编码", "进度节点", "工价", "排序号"
    };
    private static final String[] PROCESS_EXAMPLES = {
            "FZ2024001", "裁剪", "P1", "裁剪", "2.50", "1"
    };

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private ExcelImportHelper importHelper;

    public ExcelImportHelper.TemplateConfig getTemplateConfig() {
        ExcelImportHelper.TemplateConfig config = new ExcelImportHelper.TemplateConfig();
        config.headers = PROCESS_HEADERS;
        config.examples = PROCESS_EXAMPLES;
        config.sheetName = "工序";
        config.notes = new String[]{
                "款号*: 必填，必须是系统中已存在的款号（请先导入款式）",
                "工序名称*: 必填，如裁剪、车缝、整烫等",
                "工序编码: 选填，为空时自动生成P1,P2...",
                "进度节点: 选填，可选值: 采购/裁剪/车缝/尾部/入库",
                "工价: 选填，单位元，如2.50",
                "排序号: 选填，数字，决定工序顺序"
        };
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importProcesses(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = importHelper.parseExcel(file, PROCESS_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 1000) {
            throw new IllegalArgumentException("单次最多导入 1000 条工序，当前 " + rows.size() + " 条");
        }

        Map<String, StyleInfo> styleMap = preloadStyleMap(rows);
        Map<String, Integer> styleProcessCounter = new HashMap<>();

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            processSingleRow(index, rows.get(index), styleMap, styleProcessCounter, successRecords, failedRecords);
        }

        saveBatchProcesses(successRecords);

        return importHelper.buildResult(rows.size(), successRecords, failedRecords, "工序");
    }

    private Map<String, StyleInfo> preloadStyleMap(List<Map<String, String>> rows) {
        Set<String> styleNos = new HashSet<>();
        for (Map<String, String> row : rows) {
            String sn = importHelper.safe(row.get("款号*"));
            if (StringUtils.hasText(sn)) styleNos.add(sn);
        }
        Map<String, StyleInfo> styleMap = new HashMap<>();
        for (String sn : styleNos) {
            StyleInfo si = styleInfoService.getOne(
                    new LambdaQueryWrapper<StyleInfo>()
                            .eq(StyleInfo::getStyleNo, sn)
                            .last("LIMIT 1")
            );
            if (si != null) styleMap.put(sn, si);
        }
        return styleMap;
    }

    private void processSingleRow(int index, Map<String, String> item,
            Map<String, StyleInfo> styleMap, Map<String, Integer> styleProcessCounter,
            List<Map<String, Object>> successRecords, List<Map<String, Object>> failedRecords) {
        try {
            String styleNo = importHelper.safe(item.get("款号*"));
            if (!StringUtils.hasText(styleNo)) {
                throw new IllegalArgumentException("款号不能为空");
            }

            StyleInfo style = styleMap.get(styleNo);
            if (style == null) {
                throw new IllegalArgumentException("款号不存在: " + styleNo + "（请先导入款式资料）");
            }

            String processName = importHelper.safe(item.get("工序名称*"));
            if (!StringUtils.hasText(processName)) {
                throw new IllegalArgumentException("工序名称不能为空");
            }

            int counter = styleProcessCounter.getOrDefault(styleNo, 0) + 1;
            styleProcessCounter.put(styleNo, counter);

            StyleProcess sp = new StyleProcess();
            sp.setStyleId(style.getId());
            sp.setProcessCode(StringUtils.hasText(importHelper.safe(item.get("工序编码"))) ? importHelper.safe(item.get("工序编码")) : "P" + counter);
            sp.setProcessName(processName);
            sp.setProgressStage(importHelper.safe(item.get("进度节点")));

            BigDecimal processPrice = importHelper.parseDecimal(item.get("工价"));
            if (processPrice != null) sp.setPrice(processPrice);

            Integer sortOrder = importHelper.parseInteger(item.get("排序号"));
            sp.setSortOrder(sortOrder != null ? sortOrder : counter);

            sp.setCreateTime(LocalDateTime.now());
            sp.setUpdateTime(LocalDateTime.now());

            Map<String, Object> success = new LinkedHashMap<>();
            success.put("row", index + 2);
            success.put("styleNo", styleNo);
            success.put("processName", processName);
            success.put("processCode", sp.getProcessCode());
            success.put("entity", sp);
            successRecords.add(success);
        } catch (Exception e) {
            Map<String, Object> fail = new LinkedHashMap<>();
            fail.put("row", index + 2);
            fail.put("styleNo", item.get("款号*"));
            fail.put("processName", item.get("工序名称*"));
            fail.put("error", e.getMessage());
            failedRecords.add(fail);
        }
    }

    private void saveBatchProcesses(List<Map<String, Object>> successRecords) {
        if (!successRecords.isEmpty()) {
            List<StyleProcess> insertBatch = new ArrayList<>();
            for (Map<String, Object> rec : successRecords) {
                insertBatch.add((StyleProcess) rec.get("entity"));
            }
            if (!insertBatch.isEmpty()) {
                styleProcessService.saveBatch(insertBatch, 500);
            }
        }
    }
}
