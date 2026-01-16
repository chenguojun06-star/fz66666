package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleBom;
import java.util.List;

public interface StyleBomService extends IService<StyleBom> {
    List<StyleBom> listByStyleId(Long styleId);
}
