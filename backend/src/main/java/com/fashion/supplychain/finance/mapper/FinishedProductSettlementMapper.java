package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import org.apache.ibatis.annotations.Mapper;

/**
 * 成品结算Mapper（映射视图 v_finished_product_settlement）。
 *
 * 【租户隔离机制】视图 v_finished_product_settlement 本身不含租户过滤。
 * 类级别 @InterceptorIgnore(tenantLine="true") 绕过 MyBatis-Plus 租户拦截器，
 * 租户隔离完全由 Controller 层的 IN(orderIds) 条件保证：
 *   - 普通租户：orderIds 已通过 WHERE tenant_id=X 预过滤（见 ProductionOrderQueryService）；
 *   - 超管：应查看所有租户数据，不能加 tenant_id 过滤。
 * 因此绕过拦截器是安全且正确的。
 *
 * ⚠️ 重要约束：任何通过本 Mapper 查询视图的代码，必须在调用方自行保证
 *    租户隔离（通常通过 Controller 层的 applyOrderScopeFilter 实现）。
 *    禁止在未做租户过滤的情况下直接 selectList/selectPage 此视图。
 *
 * ⚠️ 禁止在此接口中 @Override selectPage 等 BaseMapper 方法，
 *    否则 MyBatis-Plus 自动注入失效 → BindingException 500。
 */
@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface FinishedProductSettlementMapper extends BaseMapper<FinishedProductSettlement> {
}
