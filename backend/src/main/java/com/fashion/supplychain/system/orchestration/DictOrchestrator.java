package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.service.DictService;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class DictOrchestrator {

    @Autowired
    private DictService dictService;

    public IPage<Dict> list(Map<String, Object> params) {
        return dictService.queryPage(params);
    }

    /**
     * 按词典类型查询所有启用项，按 sort 升序排列。
     * 用于前端下拉/动态面板，如服装部位选择（garment_part）。
     */
    public List<Dict> getByType(String dictType) {
        if (!StringUtils.hasText(dictType)) {
            return List.of();
        }
        return dictService.list(
            new LambdaQueryWrapper<Dict>()
                .eq(Dict::getDictType, dictType.trim().toLowerCase())
                .eq(Dict::getStatus, "ENABLED")
                .orderByAsc(Dict::getSort)
                .orderByAsc(Dict::getId)
        );
    }

    @Transactional(rollbackFor = Exception.class)
    public Dict create(Dict dict) {
        normalizeDict(dict);
        validateRequiredFields(dict);
        validateDuplicate(dict, null);
        if (dict.getStatus() == null) {
            dict.setStatus("ENABLED");
        }
        dictService.save(dict);
        return dict;
    }

    @Transactional(rollbackFor = Exception.class)
    public Dict update(Long id, Dict dict) {
        dict.setId(id);
        normalizeDict(dict);
        validateRequiredFields(dict);
        validateDuplicate(dict, id);
        dictService.updateById(dict);
        return dict;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        dictService.removeById(id);
    }

    /**
     * 自动收录词典（如果不存在）
     * @param dictType 词典类型
     * @param label 标签（同时作为值）
     */
    @Transactional(rollbackFor = Exception.class)
    public void autoCollect(String dictType, String label) {
        if (!StringUtils.hasText(dictType) || !StringUtils.hasText(label)) {
            return;
        }
        String normalizedType = dictType.trim().toLowerCase();
        String normalizedLabel = label.trim();

        // 检查是否存在
        long count = dictService.count(new LambdaQueryWrapper<Dict>()
                .eq(Dict::getDictType, normalizedType)
                .eq(Dict::getDictLabel, normalizedLabel));

        if (count == 0) {
            Dict dict = new Dict();
            dict.setDictType(normalizedType);
            dict.setDictLabel(normalizedLabel);
            // 自动生成编码: TYPE_HASH_TIMESTAMP
            String code = normalizedType.toUpperCase() + "_" + Math.abs(normalizedLabel.hashCode()) + "_" + System.currentTimeMillis();
            if (code.length() > 50) {
                code = code.substring(0, 50);
            }
            dict.setDictCode(code);
            dict.setDictValue(code);
            dict.setStatus("ENABLED");
            dict.setSort(99); // 默认排在最后
            dictService.save(dict);
        }
    }

    private void normalizeDict(Dict dict) {
        if (dict == null) {
            throw new IllegalArgumentException("字典数据不能为空");
        }
        if (dict.getDictType() != null) {
            dict.setDictType(dict.getDictType().trim().toLowerCase());
        }
        if (dict.getDictCode() != null) {
            dict.setDictCode(dict.getDictCode().trim().toUpperCase());
        }
        if (dict.getDictLabel() != null) {
            dict.setDictLabel(dict.getDictLabel().trim());
        }
        if (!StringUtils.hasText(dict.getDictValue()) && StringUtils.hasText(dict.getDictCode())) {
            dict.setDictValue(dict.getDictCode());
        }
    }

    private void validateRequiredFields(Dict dict) {
        if (!StringUtils.hasText(dict.getDictType())) {
            throw new IllegalArgumentException("字典类型不能为空");
        }
        if (!StringUtils.hasText(dict.getDictCode())) {
            throw new IllegalArgumentException("字典编码不能为空");
        }
        if (!StringUtils.hasText(dict.getDictLabel())) {
            throw new IllegalArgumentException("字典标签不能为空");
        }
    }

    private void validateDuplicate(Dict dict, Long currentId) {
        LambdaQueryWrapper<Dict> codeQuery = new LambdaQueryWrapper<Dict>()
                .eq(Dict::getDictType, dict.getDictType())
                .eq(Dict::getDictCode, dict.getDictCode());
        if (currentId != null) {
            codeQuery.ne(Dict::getId, currentId);
        }
        if (dictService.count(codeQuery) > 0) {
            throw new IllegalArgumentException("同类型下字典编码已存在: " + dict.getDictCode());
        }

        LambdaQueryWrapper<Dict> labelQuery = new LambdaQueryWrapper<Dict>()
                .eq(Dict::getDictType, dict.getDictType())
                .eq(Dict::getDictLabel, dict.getDictLabel());
        if (currentId != null) {
            labelQuery.ne(Dict::getId, currentId);
        }
        if (dictService.count(labelQuery) > 0) {
            throw new IllegalArgumentException("同类型下字典标签已存在: " + dict.getDictLabel());
        }
    }
}
