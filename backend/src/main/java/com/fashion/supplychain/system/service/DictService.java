package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.Dict;
import java.util.Map;

public interface DictService extends IService<Dict> {

    IPage<Dict> queryPage(Map<String, Object> params);
}
