package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.service.DictService;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DictOrchestrator {

    @Autowired
    private DictService dictService;

    public IPage<Dict> list(Map<String, Object> params) {
        return dictService.queryPage(params);
    }
}
