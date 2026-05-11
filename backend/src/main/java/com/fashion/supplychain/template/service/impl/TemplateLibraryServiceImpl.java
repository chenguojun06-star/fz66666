package com.fashion.supplychain.template.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.mapper.TemplateLibraryMapper;
import com.fashion.supplychain.template.resolver.TemplateResolver;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import com.fashion.supplychain.template.helper.TemplateStageNameHelper;

@Service
@Slf4j
public class TemplateLibraryServiceImpl extends ServiceImpl<TemplateLibraryMapper, TemplateLibrary>
        implements TemplateLibraryService {

    @Autowired
    private TemplateResolver templateResolver;

    @Autowired
    private TemplateStageNameHelper stageNameHelper;

    @Override
    public boolean isProgressIroningStageName(String name) {
        return stageNameHelper.isProgressIroningStageName(name);
    }

    @Override
    public boolean isProgressQualityStageName(String name) {
        return stageNameHelper.isProgressQualityStageName(name);
    }

    @Override
    public boolean isProgressPackagingStageName(String name) {
        return stageNameHelper.isProgressPackagingStageName(name);
    }

    @Override
    public boolean progressStageNameMatches(String stageName, String recordProcessName) {
        return stageNameHelper.progressStageNameMatches(stageName, recordProcessName);
    }

    @Override
    public List<String> resolveProgressNodes(String styleNo) {
        return templateResolver.resolveProgressNodes(styleNo);
    }

    @Override
    public BigDecimal resolveTotalUnitPriceFromProgressTemplate(String styleNo) {
        return templateResolver.resolveTotalUnitPriceFromProgressTemplate(styleNo);
    }

    @Override
    public List<Map<String, Object>> resolveProgressNodeUnitPrices(String styleNo) {
        return templateResolver.resolveProgressNodeUnitPrices(styleNo);
    }

    @Override
    public int resolveProgressNodeIndexFromPercent(int nodeCount, int progressPercent) {
        return templateResolver.resolveProgressNodeIndexFromPercent(nodeCount, progressPercent);
    }

    @Override
    public String resolveProgressNodeNameFromPercent(String styleNo, int progressPercent) {
        return templateResolver.resolveProgressNodeNameFromPercent(styleNo, progressPercent);
    }

    @Override
    public void loadProgressWeights(String styleNo, Map<String, BigDecimal> weights, List<String> processOrder) {
        templateResolver.loadProgressWeights(styleNo, weights, processOrder);
    }

    @Override
    public Map<String, BigDecimal> parseProcessUnitPrices(String processJson) {
        return templateResolver.parseProcessUnitPrices(processJson);
    }

    @Override
    public Map<String, BigDecimal> resolveProcessUnitPrices(String styleNo) {
        return templateResolver.resolveProcessUnitPrices(styleNo);
    }

    @Override
    public IPage<TemplateLibrary> queryPage(Map<String, Object> params) {
        long page = ParamUtils.getPageLong(params);
        long pageSize = ParamUtils.getPageSizeLong(params);

        Page<TemplateLibrary> pageInfo = new Page<>(page, pageSize);

        String templateType = String.valueOf(params.getOrDefault("templateType", "")).trim();
        String keyword = String.valueOf(params.getOrDefault("keyword", "")).trim();
        String sourceStyleNo = String.valueOf(params.getOrDefault("sourceStyleNo", "")).trim();
        boolean isFactoryTemplate = "true".equalsIgnoreCase(String.valueOf(params.getOrDefault("isFactoryTemplate", "")));

        LambdaQueryWrapper<TemplateLibrary> wrapper = new LambdaQueryWrapper<TemplateLibrary>()
                .like(StringUtils.hasText(keyword), TemplateLibrary::getTemplateName, keyword)
                .eq(StringUtils.hasText(sourceStyleNo), TemplateLibrary::getSourceStyleNo, sourceStyleNo)
                .orderByDesc(TemplateLibrary::getUpdateTime)
                .orderByDesc(TemplateLibrary::getCreateTime);

        if (isFactoryTemplate) {
            wrapper.and(q -> q.isNull(TemplateLibrary::getSourceStyleNo)
                    .or().eq(TemplateLibrary::getSourceStyleNo, "")
                    .or().likeRight(TemplateLibrary::getTemplateKey, "factory_"));
        }

        @SuppressWarnings("unchecked")
        java.util.List<String> allowedStyleNos = (java.util.List<String>) params.get("allowedStyleNos");
        if (allowedStyleNos != null) {
            wrapper.in(TemplateLibrary::getSourceStyleNo, allowedStyleNos);
        }

        if (StringUtils.hasText(templateType)) {
            if ("process".equalsIgnoreCase(templateType)) {
                wrapper.and(q -> q.eq(TemplateLibrary::getTemplateType, "process")
                        .or()
                        .eq(TemplateLibrary::getTemplateType, "process_price"));
            } else {
                wrapper.eq(TemplateLibrary::getTemplateType, templateType);
            }
        }

        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId != null) {
            final Long tid = currentTenantId;
            wrapper.and(q -> q.eq(TemplateLibrary::getTenantId, tid).or().isNull(TemplateLibrary::getTenantId));
        } else {
            wrapper.isNull(TemplateLibrary::getTenantId);
        }

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    @Override
    public List<TemplateLibrary> listByType(String templateType) {
        String t = String.valueOf(templateType == null ? "" : templateType).trim();
        if (!StringUtils.hasText(t)) {
            return List.of();
        }
        LambdaQueryWrapper<TemplateLibrary> wrapper = new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, t)
                .orderByAsc(TemplateLibrary::getTemplateName)
                .orderByAsc(TemplateLibrary::getTemplateKey);
        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId != null) {
            final Long tid = currentTenantId;
            wrapper.and(q -> q.eq(TemplateLibrary::getTenantId, tid).or().isNull(TemplateLibrary::getTenantId));
        } else {
            wrapper.isNull(TemplateLibrary::getTenantId);
        }
        return list(wrapper);
    }

    @Override
    public boolean upsertTemplate(TemplateLibrary template) {
        if (template == null || !StringUtils.hasText(template.getTemplateType())
                || !StringUtils.hasText(template.getTemplateKey())) {
            throw new IllegalArgumentException("模板参数不完整");
        }

        templateResolver.invalidateTemplateCache(template.getTemplateType(), template.getSourceStyleNo());

        LocalDateTime now = LocalDateTime.now();

        TemplateLibrary existing = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, template.getTemplateType())
                .eq(TemplateLibrary::getTemplateKey, template.getTemplateKey())
                .last("LIMIT 1"));

        if (existing != null) {
            existing.setTemplateName(template.getTemplateName());
            existing.setSourceStyleNo(template.getSourceStyleNo());
            existing.setTemplateContent(template.getTemplateContent());
            existing.setLocked(template.getLocked() != null ? template.getLocked() : 1);
            existing.setUpdateTime(now);
            return updateById(existing);
        } else {
            if (!StringUtils.hasText(template.getId())) {
                template.setId(UUID.randomUUID().toString());
            }
            template.setLocked(template.getLocked() != null ? template.getLocked() : 1);
            template.setCreateTime(now);
            template.setUpdateTime(now);
            return save(template);
        }
    }
}
