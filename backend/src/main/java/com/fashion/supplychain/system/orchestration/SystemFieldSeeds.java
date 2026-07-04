package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.system.entity.FieldConfig;
import java.util.ArrayList;
import java.util.List;

/**
 * 系统字段种子模板
 * 首次访问某 bizType 时自动种入，标记 is_system=1（不可删，可改显隐/标签）
 * 租户管理员可在种入基础上新增自定义字段（is_system=0）
 */
public class SystemFieldSeeds {

    public static List<FieldConfig> build(String bizType) {
        List<FieldConfig> list = new ArrayList<>();
        switch (bizType) {
            case "style":
                addStyleSeeds(list);
                break;
            case "order":
                addOrderSeeds(list);
                break;
            case "production":
                addProductionSeeds(list);
                break;
            case "scan":
                addScanSeeds(list);
                break;
            case "customer":
                addCustomerSeeds(list);
                break;
            case "supplier":
                addSupplierSeeds(list);
                break;
            default:
                break;
        }
        return list;
    }

    /** 款式管理核心系统字段种子 */
    private static void addStyleSeeds(List<FieldConfig> list) {
        String[][] seeds = {
                {"styleNo",         "款号",     "text",     "input",     "input",     "input"},
                {"styleName",       "款名",     "text",     "input",     "input",     "input"},
                {"category",        "品类",     "select",   "select",    "picker",    "picker"},
                {"price",           "单价",     "number",   "inputnumber","input",    "input"},
                {"tagPrice",        "吊牌价",   "number",   "inputnumber","input",    "input"},
                {"salesPrice",      "销售价",   "number",   "inputnumber","input",    "input"},
                {"cover",           "封面图片", "text",     "input",     "input",     "input"},
                {"sampleQuantity",  "样板数",   "number",   "inputnumber","input",    "input"},
                {"cycle",           "生产周期", "number",   "inputnumber","input",    "input"},
                {"year",            "年份",     "number",   "inputnumber","input",    "input"},
                {"month",           "月份",     "number",   "inputnumber","input",    "input"},
                {"season",          "季节",     "text",     "input",     "input",     "input"},
                {"customerName",    "客户名称", "text",     "input",     "input",     "input"},
                {"factoryName",     "加工厂",   "text",     "input",     "input",     "input"},
                {"merchandiser",    "跟单员",   "text",     "input",     "input",     "input"},
                {"sampleStatus",    "样衣状态", "select",   "select",    "picker",    "picker"},
                {"pushedToOrder",   "下单状态", "switch",   "switch",    "switch",    "switch"},
        };
        int order = 0;
        for (String[] s : seeds) {
            FieldConfig f = new FieldConfig();
            f.setFieldKey(s[0]);
            f.setLabel(s[1]);
            f.setFieldType(s[2]);
            f.setPcWidget(s[3]);
            f.setH5Widget(s[4]);
            f.setMpWidget(s[5]);
            f.setPcColSpan(24);
            f.setH5ColSpan(24);
            f.setSortOrder(order++);
            list.add(f);
        }
    }

    /** 订单管理核心系统字段种子（对应 ProductionOrder 实体） */
    private static void addOrderSeeds(List<FieldConfig> list) {
        String[][] seeds = {
                {"orderNo",            "订单号",     "text",     "input",      "input",  "input"},
                {"styleNo",            "款号",       "text",     "input",      "input",  "input"},
                {"styleName",          "款名",       "text",     "input",      "input",  "input"},
                {"customerName",       "客户",       "text",     "input",      "input",  "input"},
                {"factoryName",        "加工厂",     "text",     "input",      "input",  "input"},
                {"merchandiser",       "跟单员",     "text",     "input",      "input",  "input"},
                {"orderQuantity",      "订单数量",   "number",   "inputnumber","input",  "input"},
                {"completedQuantity",  "完成数量",   "number",   "inputnumber","input",  "input"},
                {"deliveryDate",       "交期",       "date",     "datepicker", "input",  "input"},
                {"status",             "状态",       "select",   "select",     "picker", "picker"},
        };
        addAll(list, seeds);
    }

    /** 生产单核心系统字段种子（对应 ProductionOrder 实体的生产视图） */
    private static void addProductionSeeds(List<FieldConfig> list) {
        String[][] seeds = {
                {"orderNo",            "生产单号",   "text",     "input",      "input",  "input"},
                {"styleNo",            "款号",       "text",     "input",      "input",  "input"},
                {"styleName",          "款名",       "text",     "input",      "input",  "input"},
                {"factoryName",        "加工厂",     "text",     "input",      "input",  "input"},
                {"merchandiser",       "跟单员",     "text",     "input",      "input",  "input"},
                {"orderQuantity",      "订单数量",   "number",   "inputnumber","input",  "input"},
                {"completedQuantity",  "完成数量",   "number",   "inputnumber","input",  "input"},
                {"progressStage",      "当前工序",   "text",     "input",      "input",  "input"},
                {"status",             "状态",       "select",   "select",     "picker", "picker"},
                {"deliveryDate",       "交期",       "date",     "datepicker", "input",  "input"},
        };
        addAll(list, seeds);
    }

    /** 扫码记录核心系统字段种子（对应 ScanRecord 实体） */
    private static void addScanSeeds(List<FieldConfig> list) {
        String[][] seeds = {
                {"scanCode",           "扫码码",     "text",     "input",      "input",  "input"},
                {"orderNo",            "订单号",     "text",     "input",      "input",  "input"},
                {"styleNo",            "款号",       "text",     "input",      "input",  "input"},
                {"color",              "颜色",       "text",     "input",      "input",  "input"},
                {"size",               "尺码",       "text",     "input",      "input",  "input"},
                {"quantity",           "数量",       "number",   "inputnumber","input",  "input"},
                {"processName",        "工序",       "text",     "input",      "input",  "input"},
                {"operatorName",       "操作员",     "text",     "input",      "input",  "input"},
                {"scanTime",           "扫码时间",   "date",     "datepicker", "input",  "input"},
                {"scanType",           "扫码类型",   "select",   "select",     "picker", "picker"},
        };
        addAll(list, seeds);
    }

    /** 客户核心系统字段种子（对应 Customer 实体） */
    private static void addCustomerSeeds(List<FieldConfig> list) {
        String[][] seeds = {
                {"customerNo",         "客户编号",   "text",     "input",      "input",  "input"},
                {"companyName",        "公司名称",   "text",     "input",      "input",  "input"},
                {"contactPerson",      "联系人",     "text",     "input",      "input",  "input"},
                {"contactPhone",       "联系电话",   "text",     "input",      "input",  "input"},
                {"contactEmail",       "联系邮箱",   "text",     "input",      "input",  "input"},
                {"customerLevel",      "客户等级",   "select",   "select",     "picker", "picker"},
                {"industry",           "行业",       "text",     "input",      "input",  "input"},
                {"source",             "客户来源",   "select",   "select",     "picker", "picker"},
                {"status",             "状态",       "select",   "select",     "picker", "picker"},
                {"address",            "地址",       "textarea", "textarea",   "input",  "input"},
        };
        addAll(list, seeds);
    }

    /** 供应商核心系统字段种子（对应 Factory 实体） */
    private static void addSupplierSeeds(List<FieldConfig> list) {
        String[][] seeds = {
                {"factoryCode",        "供应商编号", "text",     "input",      "input",  "input"},
                {"factoryName",        "供应商名称", "text",     "input",      "input",  "input"},
                {"contactPerson",      "联系人",     "text",     "input",      "input",  "input"},
                {"contactPhone",       "联系电话",   "text",     "input",      "input",  "input"},
                {"factoryType",        "工厂类型",   "select",   "select",     "picker", "picker"},
                {"supplierType",       "供应商类型", "select",   "select",     "picker", "picker"},
                {"supplierTier",       "供应商等级", "select",   "select",     "picker", "picker"},
                {"supplierCategory",   "供应品类",   "text",     "input",      "input",  "input"},
                {"supplierRegion",     "所在区域",   "text",     "input",      "input",  "input"},
                {"status",             "状态",       "select",   "select",     "picker", "picker"},
        };
        addAll(list, seeds);
    }

    /** 批量添加种子字段（共用方法） */
    private static void addAll(List<FieldConfig> list, String[][] seeds) {
        int order = 0;
        for (String[] s : seeds) {
            FieldConfig f = new FieldConfig();
            f.setFieldKey(s[0]);
            f.setLabel(s[1]);
            f.setFieldType(s[2]);
            f.setPcWidget(s[3]);
            f.setH5Widget(s[4]);
            f.setMpWidget(s[5]);
            f.setPcColSpan(24);
            f.setH5ColSpan(24);
            f.setSortOrder(order++);
            list.add(f);
        }
    }
}
