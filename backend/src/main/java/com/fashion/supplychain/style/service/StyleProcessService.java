package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleProcess;
import java.util.List;

public interface StyleProcessService extends IService<StyleProcess> {
    List<StyleProcess> listByStyleId(Long styleId);
}
