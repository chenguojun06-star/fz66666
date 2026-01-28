package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import java.util.List;

/**
 * 二次工艺Service接口
 */
public interface SecondaryProcessService extends IService<SecondaryProcess> {

    /**
     * 根据款号ID查询二次工艺列表
     */
    List<SecondaryProcess> listByStyleId(Long styleId);
}
