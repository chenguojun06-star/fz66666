package com.fashion.supplychain.template.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public interface TemplateLibraryService extends IService<TemplateLibrary> {

    IPage<TemplateLibrary> queryPage(Map<String, Object> params);

    List<TemplateLibrary> listByType(String templateType);

    boolean upsertTemplate(TemplateLibrary template);

    Map<String, BigDecimal> parseProcessUnitPrices(String processJson);

    Map<String, BigDecimal> resolveProcessUnitPrices(String styleNo);

    BigDecimal resolveTotalUnitPriceFromProgressTemplate(String styleNo);

    List<Map<String, Object>> resolveProgressNodeUnitPrices(String styleNo);

    List<String> resolveProgressNodes(String styleNo);

    void loadProgressWeights(String styleNo, Map<String, java.math.BigDecimal> weights, List<String> processOrder);

    String resolveProgressNodeNameFromPercent(String styleNo, int progressPercent);

    int resolveProgressNodeIndexFromPercent(int nodeCount, int progressPercent);

    boolean progressStageNameMatches(String stageName, String recordProcessName);

    boolean isProgressQualityStageName(String name);

    boolean isProgressPackagingStageName(String name);
}
