package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.PatternRevision;

/**
 * 纸样修改记录服务接口
 */
public interface PatternRevisionService extends IService<PatternRevision> {

    /**
     * 提交审核
     *
     * @param id 记录ID
     * @return 是否成功
     */
    boolean submitForApproval(String id);

    /**
     * 审核通过
     *
     * @param id 记录ID
     * @param comment 审核意见
     * @return 是否成功
     */
    boolean approve(String id, String comment);

    /**
     * 审核拒绝
     *
     * @param id 记录ID
     * @param comment 拒绝原因
     * @return 是否成功
     */
    boolean reject(String id, String comment);

    /**
     * 完成修改
     *
     * @param id 记录ID
     * @return 是否成功
     */
    boolean complete(String id);

    /**
     * 生成下一个版本号
     *
     * @param styleNo 款号
     * @return 版本号（如：V1.1, V2.0）
     */
    String generateNextRevisionNo(String styleNo);
}
