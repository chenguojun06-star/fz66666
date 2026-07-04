package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.dto.FieldConfigSaveRequest;
import com.fashion.supplychain.system.entity.FieldConfig;
import com.fashion.supplychain.system.service.FieldConfigService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 字段配置编排器
 * - 查询租户字段配置（按业务+端裁剪）
 * - 全量保存字段配置（事务）
 * - 系统字段种子初始化
 * - 字段级权限过滤（按当前用户角色）
 */
@Slf4j
@Service
public class FieldConfigOrchestrator {

    /** 支持的业务对象类型 */
    public static final List<String> SUPPORTED_BIZ_TYPES = Arrays.asList(
            "style", "order", "production", "scan", "customer", "supplier"
    );

    /** 支持的端 */
    public static final List<String> SUPPORTED_PLATFORMS = Arrays.asList("pc", "h5", "mp");

    @Autowired
    private FieldConfigService fieldConfigService;

    /**
     * 查询当前租户某业务对象的字段配置
     * 返回按 sort_order 升序的字段列表
     * includeDisabled=false 时只返回 enabled=1 的字段（业务页面用）
     * includeDisabled=true 时返回全部字段（字段配置管理页面用）
     * 首次访问若该 bizType 无配置，自动种入系统字段模板
     */
    public List<FieldConfig> listByBizType(String bizType, String platform, boolean includeDisabled) {
        TenantAssert.assertTenantContext();
        if (!SUPPORTED_BIZ_TYPES.contains(bizType)) {
            throw new IllegalArgumentException("不支持的业务类型: " + bizType);
        }
        Long tenantId = TenantAssert.requireTenantId();

        LambdaQueryWrapper<FieldConfig> wrapper = new LambdaQueryWrapper<FieldConfig>()
                .eq(FieldConfig::getTenantId, tenantId)
                .eq(FieldConfig::getBizType, bizType)
                .orderByAsc(FieldConfig::getSortOrder);
        if (!includeDisabled) {
            wrapper.eq(FieldConfig::getEnabled, 1);
        }
        List<FieldConfig> rows = fieldConfigService.list(wrapper);

        if (rows.isEmpty()) {
            rows = seedSystemFields(tenantId, bizType);
        }

        // 字段级权限过滤：按当前用户角色裁剪可见字段
        return filterByCurrentUserRole(rows);
    }

    /** 兼容旧调用：默认只返回启用字段 */
    public List<FieldConfig> listByBizType(String bizType, String platform) {
        return listByBizType(bizType, platform, false);
    }

    /**
     * 全量保存某 bizType 的字段配置（事务）
     * 调用方传入全量字段列表，本方法用 upsert 模式覆盖
     */
    @Transactional(rollbackFor = Exception.class)
    public List<FieldConfig> saveBatch(FieldConfigSaveRequest request) {
        TenantAssert.assertTenantContext();
        assertWritable();
        if (request == null || !StringUtils.hasText(request.getBizType())) {
            throw new IllegalArgumentException("bizType 必填");
        }
        String bizType = request.getBizType();
        if (!SUPPORTED_BIZ_TYPES.contains(bizType)) {
            throw new IllegalArgumentException("不支持的业务类型: " + bizType);
        }
        Long tenantId = TenantAssert.requireTenantId();

        List<FieldConfig> existing = fieldConfigService.list(
                new LambdaQueryWrapper<FieldConfig>()
                        .eq(FieldConfig::getTenantId, tenantId)
                        .eq(FieldConfig::getBizType, bizType)
        );
        Map<String, FieldConfig> existingMap = existing.stream()
                .collect(Collectors.toMap(FieldConfig::getFieldKey, x -> x, (a, b) -> a, LinkedHashMap::new));

        List<FieldConfig> result = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        int sortOrder = 0;
        List<FieldConfigSaveRequest.FieldConfigItem> items = request.getFields() != null
                ? request.getFields() : new ArrayList<>();

        for (FieldConfigSaveRequest.FieldConfigItem item : items) {
            if (!StringUtils.hasText(item.getFieldKey())) continue;
            FieldConfig row = existingMap.get(item.getFieldKey());
            if (row == null) {
                row = new FieldConfig();
                row.setTenantId(tenantId);
                row.setBizType(bizType);
                row.setFieldKey(item.getFieldKey());
                row.setCreateTime(now);
            }
            applyItem(row, item, sortOrder, now);
            result.add(row);
            sortOrder++;
        }

        if (!result.isEmpty()) {
            fieldConfigService.saveOrUpdateBatch(result);
        }
        log.info("[FieldConfig] 保存字段配置 tenantId={} bizType={} count={}", tenantId, bizType, result.size());
        return result;
    }

    /** 删除自定义字段（系统字段 is_system=1 不允许删） */
    @Transactional(rollbackFor = Exception.class)
    public void deleteField(String bizType, String fieldKey) {
        TenantAssert.assertTenantContext();
        assertWritable();
        Long tenantId = TenantAssert.requireTenantId();
        List<FieldConfig> rows = fieldConfigService.list(
                new LambdaQueryWrapper<FieldConfig>()
                        .eq(FieldConfig::getTenantId, tenantId)
                        .eq(FieldConfig::getBizType, bizType)
                        .eq(FieldConfig::getFieldKey, fieldKey)
        );
        for (FieldConfig row : rows) {
            if (Integer.valueOf(1).equals(row.getIsSystem())) {
                throw new IllegalArgumentException("系统字段不允许删除: " + fieldKey);
            }
        }
        fieldConfigService.removeByIds(rows.stream().map(FieldConfig::getId).collect(Collectors.toList()));
        log.info("[FieldConfig] 删除自定义字段 tenantId={} bizType={} fieldKey={}", tenantId, bizType, fieldKey);
    }

    // ==================== 内部方法 ====================

    private void applyItem(FieldConfig row, FieldConfigSaveRequest.FieldConfigItem item, int sortOrder, LocalDateTime now) {
        if (StringUtils.hasText(item.getLabel())) row.setLabel(item.getLabel());
        if (StringUtils.hasText(item.getFieldType())) row.setFieldType(item.getFieldType());
        row.setOptionsJson(item.getOptionsJson());
        row.setValidationsJson(item.getValidationsJson());
        if (StringUtils.hasText(item.getPcWidget())) row.setPcWidget(item.getPcWidget());
        if (StringUtils.hasText(item.getH5Widget())) row.setH5Widget(item.getH5Widget());
        if (StringUtils.hasText(item.getMpWidget())) row.setMpWidget(item.getMpWidget());
        row.setPcColSpan(item.getPcColSpan() != null ? item.getPcColSpan() : 24);
        row.setH5ColSpan(item.getH5ColSpan() != null ? item.getH5ColSpan() : 24);
        row.setSortOrder(item.getSortOrder() != null ? item.getSortOrder() : sortOrder);
        row.setIsSystem(item.getIsSystem() != null ? item.getIsSystem() : 0);
        row.setEnabled(item.getEnabled() != null ? item.getEnabled() : 1);
        row.setVisibleRoles(item.getVisibleRoles());
        row.setEditableRoles(item.getEditableRoles());
        row.setRemark(item.getRemark());
        row.setUpdateTime(now);
    }

    /** 按当前用户角色过滤可见字段 */
    private List<FieldConfig> filterByCurrentUserRole(List<FieldConfig> rows) {
        if (UserContext.isSuperAdmin() || UserContext.isTopAdmin()) {
            return rows; // 超管/租户管理员可见全部
        }
        String currentRoleLevel = resolveCurrentUserRoleLevel();
        List<FieldConfig> filtered = new ArrayList<>();
        for (FieldConfig row : rows) {
            String visibleRoles = row.getVisibleRoles();
            if (!StringUtils.hasText(visibleRoles) || "null".equalsIgnoreCase(visibleRoles)) {
                filtered.add(row);
                continue;
            }
            if (visibleRoles.contains(currentRoleLevel)) {
                filtered.add(row);
            }
        }
        return filtered;
    }

    private String resolveCurrentUserRoleLevel() {
        if (UserContext.isTopAdmin()) return "admin";
        if (UserContext.isSupervisorOrAbove()) return "supervisor";
        return "worker";
    }

    /** 仅租户管理员/超管可改字段配置 */
    private void assertWritable() {
        if (UserContext.isSuperAdmin() || UserContext.isTopAdmin()) {
            return;
        }
        throw new IllegalArgumentException("仅租户管理员可修改字段配置");
    }

    /** 首次访问时种入系统字段模板 */
    private List<FieldConfig> seedSystemFields(Long tenantId, String bizType) {
        List<FieldConfig> seeds = SystemFieldSeeds.build(bizType);
        if (seeds.isEmpty()) return new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        for (FieldConfig seed : seeds) {
            seed.setTenantId(tenantId);
            seed.setBizType(bizType);
            seed.setIsSystem(1);
            seed.setEnabled(1);
            seed.setCreateTime(now);
            seed.setUpdateTime(now);
        }
        fieldConfigService.saveBatch(seeds);
        log.info("[FieldConfig] 种入系统字段 tenantId={} bizType={} count={}", tenantId, bizType, seeds.size());
        return seeds;
    }
}
