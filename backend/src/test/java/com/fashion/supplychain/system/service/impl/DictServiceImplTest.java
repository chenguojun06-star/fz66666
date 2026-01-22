package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.service.DictService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 字典服务测试
 * 测试缓存和CRUD操作
 */
@SpringBootTest
@ActiveProfiles("dev")
@Transactional
class DictServiceImplTest {

    @Autowired
    private DictService dictService;

    @Test
    @DisplayName("测试字典查询分页")
    void testQueryPage() {
        // Given: 准备查询参数
        Map<String, Object> params = new HashMap<>();
        params.put("page", 1);
        params.put("pageSize", 10);
        
        // When: 执行查询
        IPage<Dict> result = dictService.queryPage(params);
        
        // Then: 验证结果
        assertNotNull(result);
        assertTrue(result.getTotal() >= 0);
    }

    @Test
    @DisplayName("测试字典按类型查询")
    void testQueryPageByType() {
        // Given: 准备测试数据和查询参数
        Dict dict = new Dict();
        dict.setDictType("test_type");
        dict.setDictCode("test_code");
        dict.setDictLabel("测试标签");
        dict.setDictValue("test_value");
        dict.setSort(1);
        dict.setStatus("ENABLED");
        dictService.save(dict);
        
        Map<String, Object> params = new HashMap<>();
        params.put("page", 1);
        params.put("pageSize", 10);
        params.put("dictType", "test_type");
        
        // When: 执行查询
        IPage<Dict> result = dictService.queryPage(params);
        
        // Then: 验证结果
        assertNotNull(result);
        assertTrue(result.getRecords().size() > 0);
        assertEquals("test_type", result.getRecords().get(0).getDictType());
    }

    @Test
    @DisplayName("测试字典保存")
    void testSave() {
        // Given: 准备测试数据
        Dict dict = new Dict();
        dict.setDictType("save_test");
        dict.setDictCode("code001");
        dict.setDictLabel("保存测试");
        dict.setDictValue("value001");
        dict.setSort(1);
        dict.setStatus("ENABLED");
        
        // When: 执行保存
        boolean saved = dictService.save(dict);
        
        // Then: 验证结果
        assertTrue(saved);
        assertNotNull(dict.getId());
    }

    @Test
    @DisplayName("测试字典更新")
    void testUpdate() {
        // Given: 准备测试数据
        Dict dict = new Dict();
        dict.setDictType("update_test");
        dict.setDictCode("code002");
        dict.setDictLabel("更新前");
        dict.setDictValue("value002");
        dict.setSort(1);
        dict.setStatus("ENABLED");
        dictService.save(dict);
        
        // When: 执行更新
        dict.setDictLabel("更新后");
        boolean updated = dictService.updateById(dict);
        
        // Then: 验证结果
        assertTrue(updated);
        Dict found = dictService.getById(dict.getId());
        assertEquals("更新后", found.getDictLabel());
    }

    @Test
    @DisplayName("测试字典删除")
    void testDelete() {
        // Given: 准备测试数据
        Dict dict = new Dict();
        dict.setDictType("delete_test");
        dict.setDictCode("code003");
        dict.setDictLabel("删除测试");
        dict.setDictValue("value003");
        dict.setSort(1);
        dict.setStatus("ENABLED");
        dictService.save(dict);
        Long id = dict.getId();
        
        // When: 执行删除
        boolean deleted = dictService.removeById(id);
        
        // Then: 验证结果
        assertTrue(deleted);
        Dict found = dictService.getById(id);
        assertNull(found);
    }

    @Test
    @DisplayName("测试字典模糊查询")
    void testQueryPageWithLike() {
        // Given: 准备测试数据
        Dict dict = new Dict();
        dict.setDictType("like_test");
        dict.setDictCode("code_like_test");
        dict.setDictLabel("模糊查询测试");
        dict.setDictValue("value_like_test");
        dict.setSort(1);
        dict.setStatus("ENABLED");
        dictService.save(dict);
        
        Map<String, Object> params = new HashMap<>();
        params.put("page", 1);
        params.put("pageSize", 10);
        params.put("dictCode", "like");
        
        // When: 执行查询
        IPage<Dict> result = dictService.queryPage(params);
        
        // Then: 验证结果
        assertNotNull(result);
        assertTrue(result.getRecords().stream()
            .anyMatch(d -> d.getDictCode().contains("like")));
    }
}
