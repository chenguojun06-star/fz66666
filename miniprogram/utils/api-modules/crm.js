/**
 * 客户（CRM）接口
 *
 * 后端：backend/src/main/java/com/fashion/supplychain/crm/controller/CrmController.java
 *       类级别 @RequestMapping("/api/crm")
 *
 * ★ 租户隔离：后端 CustomerOrchestrator.listActive() 已按 tenantId 过滤，
 *   且工厂账号只返回自己关联的活跃客户（P0 铁律 #7），前端无需再过滤。
 */
const { ok } = require('./helpers');

const crm = {
  /**
   * 活跃客户下拉列表——用于下单时选择客户
   * 后端注释即"活跃客户下拉列表（用于订单创建时选择客户）"，已按创建时间倒序
   * @returns {Promise<Array<{id, companyName, customerNo, contactPerson}>>}
   */
  listActiveCustomers() {
    return ok('/api/crm/customers/active-list', 'GET', {});
  },

  /**
   * 客户列表（分页 + 搜索）
   * @param {Object} params - { keyword, status, page, pageSize }
   */
  listCustomers(params) {
    return ok('/api/crm/customers/list', 'POST', params || {});
  },
};

module.exports = crm;
