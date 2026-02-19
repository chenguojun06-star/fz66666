package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.service.DictService;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DictOrchestrator {

    @Autowired
    private DictService dictService;

    public IPage<Dict> list(Map<String, Object> params) {
        return dictService.queryPage(params);
    }

    @Transactional(rollbackFor = Exception.class)
    public Dict create(Dict dict) {
        if (dict.getStatus() == null) {
            dict.setStatus("ENABLED");
        }
        dictService.save(dict);
        return dict;
    }

    @Transactional(rollbackFor = Exception.class)
    public Dict update(Long id, Dict dict) {
        dict.setId(id);
        dictService.updateById(dict);
        return dict;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        dictService.removeById(id);
    }
}
