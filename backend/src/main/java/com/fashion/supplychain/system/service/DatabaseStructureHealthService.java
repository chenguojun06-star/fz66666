package com.fashion.supplychain.system.service;

import java.util.Map;

/**
 * 数据库结构健康检查服务。
 * 用于在发布前/发布后快速核对关键表结构是否与当前代码保持一致。
 */
public interface DatabaseStructureHealthService {

    Map<String, Object> inspect();
}
