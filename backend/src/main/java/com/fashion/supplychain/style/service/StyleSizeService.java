package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleSize;
import java.util.List;

public interface StyleSizeService extends IService<StyleSize> {
    List<StyleSize> listByStyleId(Long styleId);
}
