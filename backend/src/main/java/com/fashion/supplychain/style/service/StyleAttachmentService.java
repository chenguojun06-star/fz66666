package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import java.util.List;

public interface StyleAttachmentService extends IService<StyleAttachment> {
    List<StyleAttachment> listByStyleId(String styleId);

    List<StyleAttachment> listByStyleId(String styleId, String bizType);

    /**
     * 获取款号最新版本的纸样文件
     */
    StyleAttachment getLatestPattern(String styleId, String bizType);

    /**
     * 获取纸样所有版本
     */
    List<StyleAttachment> listPatternVersions(String styleId, String bizType);

    /**
     * 检查纸样是否齐全
     */
    boolean checkPatternComplete(String styleId);
}
