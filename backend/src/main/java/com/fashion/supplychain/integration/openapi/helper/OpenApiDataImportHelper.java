package com.fashion.supplychain.integration.openapi.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

/**
 * OpenAPI 数据导入 Helper — 款式/工厂/员工/工序模板批量导入
 * 从 OpenApiOrchestrator 拆分
 */
@Slf4j
@Component
public class OpenApiDataImportHelper {

    @Autowired private StyleInfoService styleInfoService;
    @Autowired private StyleProcessService styleProcessService;
    @Autowired private FactoryService factoryService;
    @Autowired private UserService userService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // ========== 数据导入 - 款式资料 (DATA_IMPORT / ORDER_SYNC) ==========

    /**
     * 批量上传款式资料
     *
     * 请求体:
     * {
     *   "strict": false,
     *   "styles": [
     *     {
     *       "styleNo": "FZ2026001",
     *       "styleName": "春季连衣裙",
     *       "category": "连衣裙",
     *       "price": 88.5,
     *       "cycle": 15,
     *       "color": "红色,蓝色",
     *       "size": "S,M,L,XL",
     *       "season": "春",
     *       "year": 2026,
     *       "month": 3,
     *       "customer": "客户A",
     *       "description": "2026春季新款",
     *       "plateType": "首单",
     *       "processes": [
     *         { "processName": "裁剪", "processCode": "CUT", "progressStage": "裁剪", "price": 1.5, "standardTime": 120, "sortOrder": 1 },
     *         { "processName": "车缝", "processCode": "SEW", "progressStage": "车缝", "price": 3.0, "standardTime": 300, "sortOrder": 2 }
     *       ]
     *     }
     *   ]
     * }
     */
    public Map<String, Object> batchCreateStyles(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> styles = (List<Map<String, Object>>) request.get("styles");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (styles == null || styles.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: styles");
            }
            if (styles.size() > 200) {
                throw new IllegalArgumentException("单次最多上传 200 条款式");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < styles.size(); index++) {
                Map<String, Object> item = styles.get(index);
                try {
                    String styleNo = OpenApiParseUtils.valueAsString(item.get("styleNo"), "").trim();
                    String styleName = OpenApiParseUtils.valueAsString(item.get("styleName"), "").trim();

                    if (!StringUtils.hasText(styleNo)) {
                        throw new IllegalArgumentException("styleNo 不能为空");
                    }

                    // 检查款号是否已存在
                    StyleInfo existingStyle = styleInfoService.getOne(
                            new LambdaQueryWrapper<StyleInfo>()
                                    .eq(StyleInfo::getStyleNo, styleNo)
                                    .last("LIMIT 1")
                    );
                    if (existingStyle != null) {
                        throw new IllegalArgumentException("款号已存在: " + styleNo);
                    }

                    StyleInfo style = new StyleInfo();
                    style.setStyleNo(styleNo);
                    style.setStyleName(StringUtils.hasText(styleName) ? styleName : styleNo);
                    style.setCategory(OpenApiParseUtils.valueAsString(item.get("category"), null));
                    style.setColor(OpenApiParseUtils.valueAsString(item.get("color"), null));
                    style.setSize(OpenApiParseUtils.valueAsString(item.get("size"), null));
                    style.setSeason(OpenApiParseUtils.valueAsString(item.get("season"), null));
                    style.setCustomer(OpenApiParseUtils.valueAsString(item.get("customer"), null));
                    style.setDescription(OpenApiParseUtils.valueAsString(item.get("description"), "[OpenAPI批量导入]"));
                    style.setPlateType(OpenApiParseUtils.valueAsString(item.get("plateType"), null));
                    style.setPatternNo(OpenApiParseUtils.valueAsString(item.get("patternNo"), null));

                    BigDecimal price = OpenApiParseUtils.parseDecimal(item.get("price"));
                    if (price != null) {
                        style.setPrice(price);
                    }

                    Integer cycle = OpenApiParseUtils.parseInteger(item.get("cycle"));
                    if (cycle != null) {
                        style.setCycle(cycle);
                    }

                    Integer year = OpenApiParseUtils.parseInteger(item.get("year"));
                    style.setYear(year != null ? year : LocalDate.now().getYear());

                    Integer month = OpenApiParseUtils.parseInteger(item.get("month"));
                    style.setMonth(month != null ? month : LocalDate.now().getMonthValue());

                    style.setStatus("ENABLED");
                    style.setCreateTime(LocalDateTime.now());
                    style.setUpdateTime(LocalDateTime.now());

                    boolean saved = styleInfoService.save(style);
                    if (!saved) {
                        throw new RuntimeException("保存款式失败");
                    }

                    // 如果包含工序列表，一起保存
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> processes = (List<Map<String, Object>>) item.get("processes");
                    int processCount = 0;
                    if (processes != null && !processes.isEmpty()) {
                        for (int pi = 0; pi < processes.size(); pi++) {
                            Map<String, Object> proc = processes.get(pi);
                            StyleProcess sp = new StyleProcess();
                            sp.setStyleId(style.getId());
                            sp.setProcessCode(OpenApiParseUtils.valueAsString(proc.get("processCode"), "P" + (pi + 1)));
                            sp.setProcessName(OpenApiParseUtils.valueAsString(proc.get("processName"), "工序" + (pi + 1)));
                            sp.setProgressStage(OpenApiParseUtils.valueAsString(proc.get("progressStage"), null));
                            sp.setMachineType(OpenApiParseUtils.valueAsString(proc.get("machineType"), null));
                            sp.setSortOrder(OpenApiParseUtils.parseInteger(proc.get("sortOrder")) != null ? OpenApiParseUtils.parseInteger(proc.get("sortOrder")) : pi + 1);

                            BigDecimal processPrice = OpenApiParseUtils.parseDecimal(proc.get("price"));
                            if (processPrice != null) {
                                sp.setPrice(processPrice);
                            }
                            Integer standardTime = OpenApiParseUtils.parseInteger(proc.get("standardTime"));
                            if (standardTime != null) {
                                sp.setStandardTime(standardTime);
                            }
                            sp.setCreateTime(LocalDateTime.now());
                            sp.setUpdateTime(LocalDateTime.now());
                            styleProcessService.save(sp);
                            processCount++;
                        }
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("styleId", style.getId());
                    successItem.put("styleNo", style.getStyleNo());
                    successItem.put("styleName", style.getStyleName());
                    successItem.put("processCount", processCount);
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("styleNo", item.get("styleNo"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", styles.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "款式批量上传成功" : "款式批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建款式失败: " + e.getMessage(), e);
        }
    }

    // ========== 数据导入 - 工厂/供应商 (DATA_IMPORT) ==========

    /**
     * 批量上传工厂/供应商
     *
     * 请求体:
     * {
     *   "strict": false,
     *   "factories": [
     *     {
     *       "factoryCode": "GC001",
     *       "factoryName": "金华服装加工厂",
     *       "contactPerson": "张三",
     *       "contactPhone": "13800138000",
     *       "address": "浙江省金华市义乌工业区",
     *       "businessLicense": ""
     *     }
     *   ]
     * }
     */
    public Map<String, Object> batchCreateFactories(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> factories = (List<Map<String, Object>>) request.get("factories");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (factories == null || factories.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: factories");
            }
            if (factories.size() > 500) {
                throw new IllegalArgumentException("单次最多上传 500 条工厂记录");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < factories.size(); index++) {
                Map<String, Object> item = factories.get(index);
                try {
                    String factoryName = OpenApiParseUtils.valueAsString(item.get("factoryName"), "").trim();
                    if (!StringUtils.hasText(factoryName)) {
                        throw new IllegalArgumentException("factoryName 不能为空");
                    }

                    // 检查工厂名称是否已存在
                    Factory existing = factoryService.getOne(
                            new LambdaQueryWrapper<Factory>()
                                    .eq(Factory::getFactoryName, factoryName)
                                    .eq(Factory::getDeleteFlag, 0)
                                    .last("LIMIT 1")
                    );
                    if (existing != null) {
                        throw new IllegalArgumentException("工厂名称已存在: " + factoryName);
                    }

                    Factory factory = new Factory();
                    factory.setFactoryName(factoryName);
                    factory.setFactoryCode(OpenApiParseUtils.valueAsString(item.get("factoryCode"), null));
                    factory.setContactPerson(OpenApiParseUtils.valueAsString(item.get("contactPerson"), null));
                    factory.setContactPhone(OpenApiParseUtils.valueAsString(item.get("contactPhone"), null));
                    factory.setAddress(OpenApiParseUtils.valueAsString(item.get("address"), null));
                    factory.setBusinessLicense(OpenApiParseUtils.valueAsString(item.get("businessLicense"), null));
                    factory.setStatus("active");
                    factory.setDeleteFlag(0);
                    factory.setCreateTime(LocalDateTime.now());
                    factory.setUpdateTime(LocalDateTime.now());

                    boolean saved = factoryService.save(factory);
                    if (!saved) {
                        throw new RuntimeException("保存工厂记录失败");
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("factoryId", factory.getId());
                    successItem.put("factoryCode", factory.getFactoryCode());
                    successItem.put("factoryName", factory.getFactoryName());
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("factoryName", item.get("factoryName"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", factories.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "工厂批量上传成功" : "工厂批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建工厂失败: " + e.getMessage(), e);
        }
    }

    // ========== 数据导入 - 员工/工人 (DATA_IMPORT) ==========

    /**
     * 批量上传员工（工人/跟单员等）
     *
     * 注意：密码自动设置为 123456（客户可在系统内修改），角色默认为"普通用户"
     *
     * 请求体:
     * {
     *   "strict": false,
     *   "employees": [
     *     {
     *       "username": "zhangsan",
     *       "name": "张三",
     *       "phone": "13800138001",
     *       "email": "zhangsan@factory.com",
     *       "roleName": "工人"
     *     }
     *   ]
     * }
     */
    public Map<String, Object> batchCreateEmployees(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> employees = (List<Map<String, Object>>) request.get("employees");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (employees == null || employees.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: employees");
            }
            if (employees.size() > 500) {
                throw new IllegalArgumentException("单次最多上传 500 条员工记录");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < employees.size(); index++) {
                Map<String, Object> item = employees.get(index);
                try {
                    String name = OpenApiParseUtils.valueAsString(item.get("name"), "").trim();
                    if (!StringUtils.hasText(name)) {
                        throw new IllegalArgumentException("name (姓名) 不能为空");
                    }

                    // 自动生成用户名：如果未提供，使用 "emp_" + 时间戳 + 序号
                    String username = OpenApiParseUtils.valueAsString(item.get("username"), "").trim();
                    if (!StringUtils.hasText(username)) {
                        username = "emp_" + System.currentTimeMillis() % 100000 + "_" + (index + 1);
                    }

                    // 检查用户名是否已存在
                    User existing = userService.getOne(
                            new LambdaQueryWrapper<User>()
                                    .eq(User::getUsername, username)
                                    .last("LIMIT 1")
                    );
                    if (existing != null) {
                        throw new IllegalArgumentException("用户名已存在: " + username);
                    }

                    User user = new User();
                    user.setUsername(username);
                    user.setName(name);
                    user.setPassword("123456"); // 默认密码，UserService.saveUser 内部会加密
                    user.setPhone(OpenApiParseUtils.valueAsString(item.get("phone"), null));
                    user.setEmail(OpenApiParseUtils.valueAsString(item.get("email"), null));
                    user.setRoleName(OpenApiParseUtils.valueAsString(item.get("roleName"), "普通用户"));
                    user.setTenantId(app.getTenantId());
                    user.setStatus("active");
                    user.setRegistrationStatus("ACTIVE");
                    user.setCreateTime(LocalDateTime.now());
                    user.setUpdateTime(LocalDateTime.now());

                    boolean saved = userService.saveUser(user);
                    if (!saved) {
                        throw new RuntimeException("保存员工记录失败");
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("userId", user.getId());
                    successItem.put("username", user.getUsername());
                    successItem.put("name", user.getName());
                    successItem.put("defaultPassword", "123456");
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("name", item.get("name"));
                    fail.put("username", item.get("username"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", employees.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "员工批量上传成功" : "员工批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建员工失败: " + e.getMessage(), e);
        }
    }

    // ========== 数据导入 - 工序模板 (DATA_IMPORT) ==========

    /**
     * 批量上传工序（按款号关联）
     *
     * 请求体:
     * {
     *   "strict": false,
     *   "styleNo": "FZ2026001",
     *   "processes": [
     *     {
     *       "processCode": "CUT",
     *       "processName": "裁剪",
     *       "progressStage": "裁剪",
     *       "machineType": "裁剪机",
     *       "standardTime": 120,
     *       "price": 1.5,
     *       "sortOrder": 1
     *     }
     *   ]
     * }
     */
    public Map<String, Object> batchCreateStyleProcesses(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            String styleNo = OpenApiParseUtils.valueAsString(request.get("styleNo"), "").trim();
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> processes = (List<Map<String, Object>>) request.get("processes");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (!StringUtils.hasText(styleNo)) {
                throw new IllegalArgumentException("缺少必填参数: styleNo");
            }
            if (processes == null || processes.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: processes");
            }
            if (processes.size() > 100) {
                throw new IllegalArgumentException("单个款式最多上传 100 道工序");
            }

            // 查找款式
            StyleInfo style = styleInfoService.getOne(
                    new LambdaQueryWrapper<StyleInfo>()
                            .eq(StyleInfo::getStyleNo, styleNo)
                            .last("LIMIT 1")
            );
            if (style == null) {
                throw new IllegalArgumentException("款号不存在: " + styleNo + "（请先上传款式资料）");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < processes.size(); index++) {
                Map<String, Object> item = processes.get(index);
                try {
                    String processName = OpenApiParseUtils.valueAsString(item.get("processName"), "").trim();
                    if (!StringUtils.hasText(processName)) {
                        throw new IllegalArgumentException("processName 不能为空");
                    }

                    StyleProcess sp = new StyleProcess();
                    sp.setStyleId(style.getId());
                    sp.setProcessCode(OpenApiParseUtils.valueAsString(item.get("processCode"), "P" + (index + 1)));
                    sp.setProcessName(processName);
                    sp.setProgressStage(OpenApiParseUtils.valueAsString(item.get("progressStage"), null));
                    sp.setMachineType(OpenApiParseUtils.valueAsString(item.get("machineType"), null));
                    sp.setSortOrder(OpenApiParseUtils.parseInteger(item.get("sortOrder")) != null ? OpenApiParseUtils.parseInteger(item.get("sortOrder")) : index + 1);

                    BigDecimal processPrice = OpenApiParseUtils.parseDecimal(item.get("price"));
                    if (processPrice != null) {
                        sp.setPrice(processPrice);
                    }
                    Integer standardTime = OpenApiParseUtils.parseInteger(item.get("standardTime"));
                    if (standardTime != null) {
                        sp.setStandardTime(standardTime);
                    }
                    sp.setCreateTime(LocalDateTime.now());
                    sp.setUpdateTime(LocalDateTime.now());

                    boolean saved = styleProcessService.save(sp);
                    if (!saved) {
                        throw new RuntimeException("保存工序记录失败");
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("processId", sp.getId());
                    successItem.put("processCode", sp.getProcessCode());
                    successItem.put("processName", sp.getProcessName());
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("processName", item.get("processName"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("styleNo", styleNo);
            result.put("styleId", style.getId());
            result.put("total", processes.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "工序批量上传成功" : "工序批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建工序失败: " + e.getMessage(), e);
        }
    }

}
