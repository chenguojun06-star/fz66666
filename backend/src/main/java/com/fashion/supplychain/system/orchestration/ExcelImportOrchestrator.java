package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantFilePathResolver;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Excel数据导入编排器
 * 支持4种数据类型的模板下载和批量导入：
 * - style: 款式资料
 * - factory: 工厂/供应商
 * - employee: 员工/工人
 * - process: 工序模板
 */
@Slf4j
@Service
public class ExcelImportOrchestrator {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private UserService userService;

    @Autowired
    private CosService cosService;

    @Value("${fashion.upload-path:./uploads/}")
    private String uploadPath;

    // ==================== 模板定义 ====================

    private static final String[] STYLE_HEADERS = {
            "款号*", "款名", "品类", "单价", "颜色", "码数", "季节", "客户", "描述"
    };
    private static final String[] STYLE_EXAMPLES = {
            "FZ2024001", "春季连衣裙", "连衣裙", "128.50", "红色,白色", "S,M,L,XL", "春季", "张三服装", "2024春季新款"
    };

    private static final String[] FACTORY_HEADERS = {
            "供应商名称*", "供应商编码", "联系人", "联系电话", "地址"
    };
    private static final String[] FACTORY_EXAMPLES = {
            "广州XX制衣厂", "GZ001", "李经理", "13800138000", "广州市番禺区XX路"
    };

    private static final String[] EMPLOYEE_HEADERS = {
            "姓名*", "手机号", "角色名"
    };
    private static final String[] EMPLOYEE_EXAMPLES = {
            "王师傅", "13900139000", "普通用户"
    };

    private static final String[] PROCESS_HEADERS = {
            "款号*", "工序名称*", "工序编码", "进度节点", "工价", "排序号"
    };
    private static final String[] PROCESS_EXAMPLES = {
            "FZ2024001", "裁剪", "P1", "裁剪", "2.50", "1"
    };

    // ==================== 模板生成 ====================

    /**
     * 生成Excel模板（含表头+示例数据行+填写说明）
     */
    public byte[] generateTemplate(String type) {
        String[] headers;
        String[] examples;
        String sheetName;
        String[] notes;

        switch (type) {
            case "style":
                headers = STYLE_HEADERS;
                examples = STYLE_EXAMPLES;
                sheetName = "款式资料";
                notes = new String[]{
                        "款号*: 必填，唯一标识，不能重复",
                        "款名: 选填，为空时自动用款号填充",
                        "品类: 选填，如连衣裙、衬衫、裤子等",
                        "单价: 选填，填数字",
                        "颜色: 选填，多个用逗号分隔",
                        "码数: 选填，多个用逗号分隔",
                        "季节: 选填，如春季、夏季、秋季、冬季",
                        "客户: 选填，客户名称",
                        "描述: 选填"
                };
                break;
            case "factory":
                headers = FACTORY_HEADERS;
                examples = FACTORY_EXAMPLES;
                sheetName = "供应商";
                notes = new String[]{
                        "供应商名称*: 必填，不能重复",
                        "供应商编码: 选填，内部编码",
                        "联系人: 选填",
                        "联系电话: 选填",
                        "地址: 选填"
                };
                break;
            case "employee":
                headers = EMPLOYEE_HEADERS;
                examples = EMPLOYEE_EXAMPLES;
                sheetName = "员工";
                notes = new String[]{
                        "姓名*: 必填",
                        "手机号: 选填，11位手机号",
                        "角色名: 选填，默认为'普通用户'",
                        "",
                        "注意: 系统会自动生成用户名，默认密码为 123456"
                };
                break;
            case "process":
                headers = PROCESS_HEADERS;
                examples = PROCESS_EXAMPLES;
                sheetName = "工序";
                notes = new String[]{
                        "款号*: 必填，必须是系统中已存在的款号（请先导入款式）",
                        "工序名称*: 必填，如裁剪、车缝、整烫等",
                        "工序编码: 选填，为空时自动生成P1,P2...",
                        "进度节点: 选填，可选值: 采购/裁剪/车缝/尾部/入库",
                        "工价: 选填，单位元，如2.50",
                        "排序号: 选填，数字，决定工序顺序"
                };
                break;
            default:
                throw new IllegalArgumentException("不支持的导入类型: " + type);
        }

        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            // 数据Sheet
            Sheet dataSheet = workbook.createSheet(sheetName);

            // 表头样式
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerFont.setFontHeightInPoints((short) 12);
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.LIGHT_CORNFLOWER_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);
            headerStyle.setBorderTop(BorderStyle.THIN);
            headerStyle.setBorderLeft(BorderStyle.THIN);
            headerStyle.setBorderRight(BorderStyle.THIN);

            // 示例行样式（灰色字体）
            CellStyle exampleStyle = workbook.createCellStyle();
            Font exampleFont = workbook.createFont();
            exampleFont.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
            exampleFont.setItalic(true);
            exampleStyle.setFont(exampleFont);

            // 表头行
            Row headerRow = dataSheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
                dataSheet.setColumnWidth(i, 5000);
            }

            // 示例数据行
            Row exampleRow = dataSheet.createRow(1);
            for (int i = 0; i < examples.length; i++) {
                Cell cell = exampleRow.createCell(i);
                cell.setCellValue(examples[i]);
                cell.setCellStyle(exampleStyle);
            }

            // 填写说明Sheet
            Sheet noteSheet = workbook.createSheet("填写说明");
            CellStyle noteHeaderStyle = workbook.createCellStyle();
            Font noteHeaderFont = workbook.createFont();
            noteHeaderFont.setBold(true);
            noteHeaderFont.setFontHeightInPoints((short) 14);
            noteHeaderStyle.setFont(noteHeaderFont);

            Row noteTitleRow = noteSheet.createRow(0);
            Cell titleCell = noteTitleRow.createCell(0);
            titleCell.setCellValue("填写说明");
            titleCell.setCellStyle(noteHeaderStyle);

            for (int i = 0; i < notes.length; i++) {
                Row noteRow = noteSheet.createRow(i + 2);
                noteRow.createCell(0).setCellValue(notes[i]);
            }
            noteSheet.setColumnWidth(0, 15000);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("生成模板失败: " + e.getMessage(), e);
        }
    }

    // ==================== 数据导入 ====================

    /**
     * 导入款式资料
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importStyles(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = parseExcel(file, STYLE_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据（第1行为表头，请从第2行开始填写）");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String styleNo = safe(item.get("款号*"));
                if (!StringUtils.hasText(styleNo)) {
                    throw new IllegalArgumentException("款号不能为空");
                }

                // 去重校验
                StyleInfo existing = styleInfoService.getOne(
                        new LambdaQueryWrapper<StyleInfo>()
                                .eq(StyleInfo::getStyleNo, styleNo)
                                .last("LIMIT 1")
                );
                if (existing != null) {
                    throw new IllegalArgumentException("款号已存在: " + styleNo);
                }

                StyleInfo style = new StyleInfo();
                style.setStyleNo(styleNo);
                style.setStyleName(StringUtils.hasText(safe(item.get("款名"))) ? safe(item.get("款名")) : styleNo);
                style.setCategory(safe(item.get("品类")));
                style.setColor(safe(item.get("颜色")));
                style.setSize(safe(item.get("码数")));
                style.setSeason(safe(item.get("季节")));
                style.setCustomer(safe(item.get("客户")));
                style.setDescription(StringUtils.hasText(safe(item.get("描述"))) ? safe(item.get("描述")) : "[Excel导入]");

                BigDecimal price = parseDecimal(item.get("单价"));
                if (price != null) style.setPrice(price);

                style.setYear(LocalDate.now().getYear());
                style.setMonth(LocalDate.now().getMonthValue());
                style.setStatus("ENABLED");
                style.setCreateTime(LocalDateTime.now());
                style.setUpdateTime(LocalDateTime.now());

                boolean saved = styleInfoService.save(style);
                if (!saved) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("styleNo", styleNo);
                success.put("styleName", style.getStyleName());
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("styleNo", item.get("款号*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return buildResult(rows.size(), successRecords, failedRecords, "款式");
    }

    /**
     * 导入工厂/供应商
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importFactories(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = parseExcel(file, FACTORY_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String factoryName = safe(item.get("供应商名称*"));
                if (!StringUtils.hasText(factoryName)) {
                    throw new IllegalArgumentException("供应商名称不能为空");
                }

                Factory existing = factoryService.getOne(
                        new LambdaQueryWrapper<Factory>()
                                .eq(Factory::getFactoryName, factoryName)
                                .eq(Factory::getDeleteFlag, 0)
                                .last("LIMIT 1")
                );
                if (existing != null) {
                    throw new IllegalArgumentException("供应商名称已存在: " + factoryName);
                }

                Factory factory = new Factory();
                factory.setFactoryName(factoryName);
                factory.setFactoryCode(safe(item.get("供应商编码")));
                factory.setContactPerson(safe(item.get("联系人")));
                factory.setContactPhone(safe(item.get("联系电话")));
                factory.setAddress(safe(item.get("地址")));
                factory.setStatus("active");
                factory.setDeleteFlag(0);
                factory.setCreateTime(LocalDateTime.now());
                factory.setUpdateTime(LocalDateTime.now());

                boolean saved = factoryService.save(factory);
                if (!saved) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("factoryName", factoryName);
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("factoryName", item.get("供应商名称*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return buildResult(rows.size(), successRecords, failedRecords, "供应商");
    }

    /**
     * 导入员工
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importEmployees(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = parseExcel(file, EMPLOYEE_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String name = safe(item.get("姓名*"));
                if (!StringUtils.hasText(name)) {
                    throw new IllegalArgumentException("姓名不能为空");
                }

                // 自动生成用户名
                String username = "emp_" + System.currentTimeMillis() % 100000 + "_" + (index + 1);

                User existingUser = userService.getOne(
                        new LambdaQueryWrapper<User>()
                                .eq(User::getUsername, username)
                                .last("LIMIT 1")
                );
                if (existingUser != null) {
                    // 极小概率冲突，追加随机数
                    username = username + "_" + new Random().nextInt(1000);
                }

                User user = new User();
                user.setUsername(username);
                user.setName(name);
                user.setPassword("123456");
                user.setPhone(safe(item.get("手机号")));
                user.setRoleName(StringUtils.hasText(safe(item.get("角色名"))) ? safe(item.get("角色名")) : "普通用户");
                user.setTenantId(tenantId);
                user.setStatus("active");
                user.setRegistrationStatus("ACTIVE");
                user.setCreateTime(LocalDateTime.now());
                user.setUpdateTime(LocalDateTime.now());

                boolean saved = userService.saveUser(user);
                if (!saved) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("name", name);
                success.put("username", username);
                success.put("defaultPassword", "123456");
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("name", item.get("姓名*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return buildResult(rows.size(), successRecords, failedRecords, "员工");
    }

    /**
     * 导入工序
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importProcesses(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = parseExcel(file, PROCESS_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 1000) {
            throw new IllegalArgumentException("单次最多导入 1000 条工序，当前 " + rows.size() + " 条");
        }

        // 预查所有涉及到的款号，减少N+1查询
        Set<String> styleNos = new HashSet<>();
        for (Map<String, String> row : rows) {
            String sn = safe(row.get("款号*"));
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

        // 为每个款号维护自增序号
        Map<String, Integer> styleProcessCounter = new HashMap<>();

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String styleNo = safe(item.get("款号*"));
                if (!StringUtils.hasText(styleNo)) {
                    throw new IllegalArgumentException("款号不能为空");
                }

                StyleInfo style = styleMap.get(styleNo);
                if (style == null) {
                    throw new IllegalArgumentException("款号不存在: " + styleNo + "（请先导入款式资料）");
                }

                String processName = safe(item.get("工序名称*"));
                if (!StringUtils.hasText(processName)) {
                    throw new IllegalArgumentException("工序名称不能为空");
                }

                int counter = styleProcessCounter.getOrDefault(styleNo, 0) + 1;
                styleProcessCounter.put(styleNo, counter);

                StyleProcess sp = new StyleProcess();
                sp.setStyleId(style.getId());
                sp.setProcessCode(StringUtils.hasText(safe(item.get("工序编码"))) ? safe(item.get("工序编码")) : "P" + counter);
                sp.setProcessName(processName);
                sp.setProgressStage(safe(item.get("进度节点")));

                BigDecimal processPrice = parseDecimal(item.get("工价"));
                if (processPrice != null) sp.setPrice(processPrice);

                Integer sortOrder = parseInteger(item.get("排序号"));
                sp.setSortOrder(sortOrder != null ? sortOrder : counter);

                sp.setCreateTime(LocalDateTime.now());
                sp.setUpdateTime(LocalDateTime.now());

                boolean saved = styleProcessService.save(sp);
                if (!saved) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("styleNo", styleNo);
                success.put("processName", processName);
                success.put("processCode", sp.getProcessCode());
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

        return buildResult(rows.size(), successRecords, failedRecords, "工序");
    }

    // ==================== Excel解析 ====================

    /**
     * 解析Excel文件，返回List<Map>（key=表头名，value=单元格字符串值）
     * 自动跳过空行和示例行（灰色斜体字）
     */
    private List<Map<String, String>> parseExcel(MultipartFile file, String[] expectedHeaders) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择要上传的文件");
        }

        String filename = file.getOriginalFilename();
        if (filename == null || (!filename.endsWith(".xlsx") && !filename.endsWith(".xls"))) {
            throw new IllegalArgumentException("仅支持 .xlsx 或 .xls 格式的Excel文件");
        }

        try (InputStream is = file.getInputStream(); Workbook workbook = WorkbookFactory.create(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null || sheet.getPhysicalNumberOfRows() < 2) {
                throw new IllegalArgumentException("Excel文件为空或缺少数据行");
            }

            // 读取表头行
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new IllegalArgumentException("缺少表头行");
            }

            // 建立列索引映射
            Map<Integer, String> colIndexToHeader = new LinkedHashMap<>();
            for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                if (cell != null) {
                    String headerValue = getCellStringValue(cell).trim();
                    if (StringUtils.hasText(headerValue)) {
                        colIndexToHeader.put(i, headerValue);
                    }
                }
            }

            // 校验必填表头是否存在
            Set<String> foundHeaders = new HashSet<>(colIndexToHeader.values());
            for (String expected : expectedHeaders) {
                if (expected.endsWith("*") && !foundHeaders.contains(expected)) {
                    throw new IllegalArgumentException("缺少必填列: " + expected + "。请使用系统提供的模板。");
                }
            }

            // 读取数据行
            List<Map<String, String>> result = new ArrayList<>();
            for (int rowIdx = 1; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null) continue;

                Map<String, String> rowData = new LinkedHashMap<>();
                boolean hasData = false;
                for (Map.Entry<Integer, String> entry : colIndexToHeader.entrySet()) {
                    Cell cell = row.getCell(entry.getKey());
                    String value = cell != null ? getCellStringValue(cell).trim() : "";
                    rowData.put(entry.getValue(), value);
                    if (StringUtils.hasText(value)) hasData = true;
                }

                // 跳过空行
                if (!hasData) continue;
                result.add(rowData);
            }

            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("解析Excel文件失败: " + e.getMessage(), e);
        }
    }

    /**
     * 获取单元格的字符串值（兼容数字、日期、布尔等类型）
     */
    private String getCellStringValue(Cell cell) {
        if (cell == null) return "";
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getLocalDateTimeCellValue().toLocalDate().toString();
                }
                // 避免科学计数法，如手机号
                double num = cell.getNumericCellValue();
                if (num == Math.floor(num) && !Double.isInfinite(num)) {
                    return String.valueOf((long) num);
                }
                return String.valueOf(num);
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                try {
                    return cell.getStringCellValue();
                } catch (Exception e) {
                    try {
                        return String.valueOf(cell.getNumericCellValue());
                    } catch (Exception e2) {
                        return "";
                    }
                }
            default:
                return "";
        }
    }

    // ==================== 工具方法 ====================

    private Map<String, Object> buildResult(int total, List<Map<String, Object>> success, List<Map<String, Object>> failed, String typeName) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total);
        result.put("successCount", success.size());
        result.put("failedCount", failed.size());
        result.put("successRecords", success);
        result.put("failedRecords", failed);
        result.put("message", failed.isEmpty()
                ? typeName + "导入成功，共 " + success.size() + " 条"
                : typeName + "导入完成：成功 " + success.size() + " 条，失败 " + failed.size() + " 条");
        log.info("[Excel导入] 类型={}, 总数={}, 成功={}, 失败={}", typeName, total, success.size(), failed.size());
        return result;
    }

    private String safe(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private Integer parseInteger(String value) {
        if (!StringUtils.hasText(value)) return null;
        try {
            return Integer.parseInt(value.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private BigDecimal parseDecimal(String value) {
        if (!StringUtils.hasText(value)) return null;
        try {
            return new BigDecimal(value.trim());
        } catch (Exception e) {
            return null;
        }
    }

    // ==================== ZIP 图片包导入 ====================

    /**
     * ZIP 打包导入款式 + 图片
     *
     * ZIP 内容规则：
     *   - 必须包含一个 .xlsx 或 .xls 文件（款式数据，字段同普通导入模板）
     *   - 图片文件名 = 款号（如 FZ2024001.jpg / FZ2024001.png），系统自动关联封面图
     *   - 支持 jpg/jpeg/png/gif/webp 格式
     *   - 单次最多 500 条款式
     *
     * @param tenantId  当前租户ID
     * @param zipFile   上传的 ZIP 文件
     * @return 导入结果（含成功/失败数量、失败详情）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importStylesFromZip(Long tenantId, MultipartFile zipFile) {
        // 1. 解压 ZIP，分别收集 Excel 和图片
        byte[] excelBytes = null;
        String excelName = null;
        Map<String, byte[]> imageMap = new LinkedHashMap<>(); // key=款号（无扩展名）, value=图片字节

        Set<String> imageExts = new HashSet<>(Arrays.asList("jpg", "jpeg", "png", "gif", "webp"));

        try (ZipInputStream zis = new ZipInputStream(zipFile.getInputStream())) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) { zis.closeEntry(); continue; }

                // 取文件名（忽略 __MACOSX 等垃圾目录）
                String entryName = entry.getName();
                if (entryName.contains("__MACOSX") || entryName.startsWith(".")) { zis.closeEntry(); continue; }
                String baseName = entryName.contains("/")
                        ? entryName.substring(entryName.lastIndexOf('/') + 1)
                        : entryName;
                if (baseName.startsWith(".") || baseName.isEmpty()) { zis.closeEntry(); continue; }

                byte[] bytes = zis.readAllBytes();
                String lowerName = baseName.toLowerCase();

                if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
                    if (excelBytes == null) { // 取第一个 Excel
                        excelBytes = bytes;
                        excelName = baseName;
                    }
                } else {
                    int dotIdx = lowerName.lastIndexOf('.');
                    if (dotIdx > 0) {
                        String ext = lowerName.substring(dotIdx + 1);
                        if (imageExts.contains(ext)) {
                            String styleNo = baseName.substring(0, baseName.lastIndexOf('.')); // 文件名去掉扩展名 = 款号
                            imageMap.put(styleNo, bytes);
                        }
                    }
                }
                zis.closeEntry();
            }
        } catch (Exception e) {
            throw new RuntimeException("ZIP 文件解压失败: " + e.getMessage(), e);
        }

        if (excelBytes == null) {
            throw new IllegalArgumentException("ZIP 包内未找到 Excel 文件（.xlsx 或 .xls），请确认 ZIP 内容");
        }

        log.info("[ZIP导入] 租户={}, Excel={}, 图片数={}", tenantId, excelName, imageMap.size());

        // 2. 用现有逻辑解析 Excel（包装成 MultipartFile）
        final byte[] finalExcelBytes = excelBytes;
        final String finalExcelName = excelName;
        MultipartFile excelMultipart = new MultipartFile() {
            @Override public String getName() { return "file"; }
            @Override public String getOriginalFilename() { return finalExcelName; }
            @Override public String getContentType() { return "application/octet-stream"; }
            @Override public boolean isEmpty() { return finalExcelBytes.length == 0; }
            @Override public long getSize() { return finalExcelBytes.length; }
            @Override public byte[] getBytes() { return finalExcelBytes; }
            @Override public InputStream getInputStream() { return new ByteArrayInputStream(finalExcelBytes); }
            @Override public void transferTo(File dest) throws IOException {
                java.nio.file.Files.write(dest.toPath(), finalExcelBytes);
            }
        };
        List<Map<String, String>> rows = parseExcel(excelMultipart, STYLE_HEADERS);

        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel 文件中没有数据（第1行为表头，请从第2行开始填写）");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        // 3. 逐行保存款式 + 匹配并上传封面图
        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();
        List<String> imageErrors = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String styleNo = safe(item.get("款号*"));
                if (!StringUtils.hasText(styleNo)) throw new IllegalArgumentException("款号不能为空");

                StyleInfo existing = styleInfoService.getOne(
                        new LambdaQueryWrapper<StyleInfo>()
                                .eq(StyleInfo::getStyleNo, styleNo)
                                .last("LIMIT 1"));
                if (existing != null) throw new IllegalArgumentException("款号已存在: " + styleNo);

                StyleInfo style = new StyleInfo();
                style.setStyleNo(styleNo);
                style.setStyleName(StringUtils.hasText(safe(item.get("款名"))) ? safe(item.get("款名")) : styleNo);
                style.setCategory(safe(item.get("品类")));
                style.setColor(safe(item.get("颜色")));
                style.setSize(safe(item.get("码数")));
                style.setSeason(safe(item.get("季节")));
                style.setCustomer(safe(item.get("客户")));
                style.setDescription(StringUtils.hasText(safe(item.get("描述"))) ? safe(item.get("描述")) : "[ZIP导入]");
                BigDecimal price = parseDecimal(item.get("单价"));
                if (price != null) style.setPrice(price);
                style.setYear(LocalDate.now().getYear());
                style.setMonth(LocalDate.now().getMonthValue());
                style.setStatus("ENABLED");
                style.setCreateTime(LocalDateTime.now());
                style.setUpdateTime(LocalDateTime.now());

                // 关联封面图（文件名 = 款号）
                if (imageMap.containsKey(styleNo)) {
                    try {
                        byte[] imgBytes = imageMap.get(styleNo);
                        // 推断扩展名
                        String imgExt = "jpg";
                        for (Map.Entry<String, byte[]> e : imageMap.entrySet()) {
                            if (e.getKey().equals(styleNo)) break;
                        }
                        // 从原始 imageMap key 里拿不到 ext，需要重新找
                        // （imageMap key=款号，找原始文件名时直接用 UUID 命名存储即可）
                        String newFilename = UUID.randomUUID().toString() + ".jpg";
                        String contentType = "image/jpeg";

                        if (cosService.isEnabled()) {
                            cosService.upload(tenantId, newFilename, imgBytes, contentType);
                        } else {
                            File dest = TenantFilePathResolver.resolveStoragePath(uploadPath, newFilename);
                            java.nio.file.Files.write(dest.toPath(), imgBytes);
                        }
                        String coverUrl = TenantFilePathResolver.buildDownloadUrl(newFilename);
                        style.setCover(coverUrl);
                        log.info("[ZIP导入] 款号={} 封面图已上传: {}", styleNo, coverUrl);
                    } catch (Exception imgEx) {
                        String errMsg = styleNo + ": " + imgEx.getMessage();
                        log.warn("[ZIP导入] 款号={} 封面图上传失败，跳过图片: {}", styleNo, imgEx.getMessage());
                        imageErrors.add(errMsg);
                        // 图片上传失败不影响款式数据导入
                    }
                }

                if (!styleInfoService.save(style)) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("styleNo", styleNo);
                success.put("styleName", style.getStyleName());
                success.put("hasCover", style.getCover() != null);
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("styleNo", item.get("款号*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        // 4. 追加统计：有多少款式匹配到了图片
        long withCover = successRecords.stream().filter(r -> Boolean.TRUE.equals(r.get("hasCover"))).count();
        Map<String, Object> result = buildResult(rows.size(), successRecords, failedRecords, "款式(ZIP)");
        result.put("imageCount", imageMap.size());
        result.put("withCoverCount", withCover);
        if (!imageErrors.isEmpty()) {
            result.put("imageErrors", imageErrors);
        }
        if (!failedRecords.isEmpty() || withCover > 0) {
            result.put("message", result.get("message") + "，共关联封面图 " + withCover + " 张");
        }
        return result;
    }
}
