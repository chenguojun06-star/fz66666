package com.fashion.supplychain.common.datascope;

import lombok.Data;

/**
 * 数据权限上下文
 * 存储当前请求的数据过滤条件
 */
@Data
public class DataScopeContext {

    /** 数据范围: all / team / own */
    private String scope;

    /** 当前用户ID */
    private String userId;

    /** 当前用户所属团队/班组ID */
    private String teamId;

    /** 创建人列名 */
    private String creatorColumn;

    /** 工厂列名 */
    private String factoryColumn;

    /** 表别名 */
    private String tableAlias;
}
