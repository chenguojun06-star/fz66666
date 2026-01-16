package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import java.util.List;

public interface StyleAttachmentService extends IService<StyleAttachment> {
    List<StyleAttachment> listByStyleId(String styleId);

    List<StyleAttachment> listByStyleId(String styleId, String bizType);
}
