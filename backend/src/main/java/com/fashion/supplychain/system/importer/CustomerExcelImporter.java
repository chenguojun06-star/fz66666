package com.fashion.supplychain.system.importer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.service.CustomerService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 客户档案 Excel 导入器（D-751 租户入驻批量导入第一期）
 * 语义与 CRM 新建客户一致：customerNo 自动生成（CRM+时间戳）、状态 ACTIVE、类型 NORMAL。
 */
@Component
@Slf4j
public class CustomerExcelImporter {

    private static final String[] CUSTOMER_HEADERS = {
            "客户名称*", "联系人", "联系电话", "邮箱", "地址", "客户等级", "行业/品类", "备注"
    };
    private static final String[] CUSTOMER_EXAMPLES = {
            "广州XX服饰有限公司", "陈总", "13900139000", "chen@xx.com", "广州市海珠区XX大厦", "3", "女装", "老客户迁移"
    };
    private static final Set<String> VALID_LEVELS = Set.of("1", "2", "3", "4", "5");

    @Autowired
    private CustomerService customerService;

    @Autowired
    private ExcelImportHelper importHelper;

    public ExcelImportHelper.TemplateConfig getTemplateConfig() {
        ExcelImportHelper.TemplateConfig config = new ExcelImportHelper.TemplateConfig();
        config.headers = CUSTOMER_HEADERS;
        config.examples = CUSTOMER_EXAMPLES;
        config.sheetName = "客户";
        config.notes = new String[]{
                "客户名称*: 必填，同一租户内不能重复（公司/品牌名称）",
                "客户等级: 选填，1~5 级（1级最高），不填默认 3 级；也可填 VIP（=1）或 普通（=3）",
                "客户编号由系统自动生成（CRM+时间戳），无需填写",
                "单次最多导入 500 条"
        };
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importCustomers(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = importHelper.parseExcel(file, CUSTOMER_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();
        Set<String> seenInFile = new HashSet<>();
        LocalDateTime now = LocalDateTime.now();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String companyName = importHelper.safe(item.get("客户名称*"));
                if (!StringUtils.hasText(companyName)) {
                    throw new IllegalArgumentException("客户名称不能为空");
                }
                String dedupeKey = companyName.toLowerCase();
                if (!seenInFile.add(dedupeKey)) {
                    throw new IllegalArgumentException("文件内重复：客户名称「" + companyName + "」出现多次");
                }

                Customer existing = customerService.getOne(
                        new LambdaQueryWrapper<Customer>()
                                .eq(Customer::getCompanyName, companyName)
                                .eq(Customer::getTenantId, tenantId)
                                .eq(Customer::getDeleteFlag, 0)
                                .last("LIMIT 1")
                );
                if (existing != null) {
                    throw new IllegalArgumentException("客户名称已存在: " + companyName);
                }

                Customer customer = new Customer();
                customer.setCompanyName(companyName);
                customer.setCustomerNo("CRM" + DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(now)
                        + String.format("%03d", index));
                customer.setContactPerson(importHelper.safe(item.get("联系人")));
                customer.setContactPhone(importHelper.safe(item.get("联系电话")));
                customer.setContactEmail(importHelper.safe(item.get("邮箱")));
                customer.setAddress(importHelper.safe(item.get("地址")));
                customer.setCustomerLevel(normalizeLevel(importHelper.safe(item.get("客户等级"))));
                customer.setIndustry(importHelper.safe(item.get("行业/品类")));
                customer.setRemark(importHelper.safe(item.get("备注")));
                customer.setCustomerType("NORMAL");
                customer.setStatus("ACTIVE");
                customer.setDeleteFlag(0);
                customer.setTenantId(tenantId);
                customer.setCreateTime(now);
                customer.setUpdateTime(now);

                boolean saved = customerService.save(customer);
                if (!saved) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("companyName", companyName);
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("companyName", item.get("客户名称*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return importHelper.buildResult(rows.size(), successRecords, failedRecords, "客户");
    }

    /** 等级归一：VIP→1、普通/正常→3，其余必须是 1~5 数字 */
    private String normalizeLevel(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "3";
        }
        String v = raw.trim();
        if ("VIP".equalsIgnoreCase(v)) return "1";
        if ("普通".equals(v) || "正常".equals(v)) return "3";
        if (!VALID_LEVELS.contains(v)) {
            throw new IllegalArgumentException("客户等级必须是 1~5（或 VIP/普通），当前: " + v);
        }
        return v;
    }
}
