package com.fashion.supplychain.system.importer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.*;

@Component
@Slf4j
public class EmployeeExcelImporter {

    private static final String[] EMPLOYEE_HEADERS = {
            "姓名*", "手机号", "角色名"
    };
    private static final String[] EMPLOYEE_EXAMPLES = {
            "王师傅", "13900139000", "普通用户"
    };

    @Autowired
    private UserService userService;

    @Autowired
    private ExcelImportHelper importHelper;

    public ExcelImportHelper.TemplateConfig getTemplateConfig() {
        ExcelImportHelper.TemplateConfig config = new ExcelImportHelper.TemplateConfig();
        config.headers = EMPLOYEE_HEADERS;
        config.examples = EMPLOYEE_EXAMPLES;
        config.sheetName = "员工";
        config.notes = new String[]{
                "姓名*: 必填",
                "手机号: 选填，11位手机号",
                "角色名: 选填，默认为'普通用户'",
                "",
                "注意: 系统会自动生成用户名，默认密码为 123456"
        };
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importEmployees(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = importHelper.parseExcel(file, EMPLOYEE_HEADERS);
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
                String name = importHelper.safe(item.get("姓名*"));
                if (!StringUtils.hasText(name)) {
                    throw new IllegalArgumentException("姓名不能为空");
                }

                String username = "emp_" + System.currentTimeMillis() % 100000 + "_" + (index + 1);

                User existingUser = userService.getOne(
                        new LambdaQueryWrapper<User>()
                                .eq(User::getUsername, username)
                                .last("LIMIT 1")
                );
                if (existingUser != null) {
                    username = username + "_" + new Random().nextInt(1000);
                }

                User user = new User();
                user.setUsername(username);
                user.setName(name);
                user.setPassword("123456");
                user.setPhone(importHelper.safe(item.get("手机号")));
                user.setRoleName(StringUtils.hasText(importHelper.safe(item.get("角色名"))) ? importHelper.safe(item.get("角色名")) : "普通用户");
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

        return importHelper.buildResult(rows.size(), successRecords, failedRecords, "员工");
    }
}
