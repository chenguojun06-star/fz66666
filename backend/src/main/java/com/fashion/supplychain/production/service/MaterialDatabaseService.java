package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import java.util.Map;

public interface MaterialDatabaseService extends IService<MaterialDatabase> {

    IPage<MaterialDatabase> queryPage(Map<String, Object> params);
}
