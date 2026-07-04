/**
 * 字段配置 API（多租户字段定制系统）
 * 对应后端 /api/system/field-config
 */
const { ok, raw } = require('./helpers');

const fieldConfig = {
  /**
   * 查询字段配置列表
   * @param {string} bizType - 业务对象：style/order/production/scan/customer/supplier
   * @param {string} platform - 平台：pc/h5/mp
   * @param {boolean} includeDisabled - 是否包含禁用字段（管理页用）
   */
  list(bizType, platform = 'mp', includeDisabled = false) {
    const params = { bizType, platform, includeDisabled };
    return ok('/api/system/field-config', 'GET', params);
  },

  /**
   * 全量保存字段配置（租户管理员）
   * @param {object} request - { bizType, platform, fields: [...] }
   */
  save(request) {
    return ok('/api/system/field-config', 'PUT', request);
  },

  /**
   * 删除自定义字段
   * @param {string} bizType - 业务对象
   * @param {string} fieldKey - 字段键
   */
  delete(bizType, fieldKey) {
    return ok('/api/system/field-config', 'DELETE', null, {
      url: `/api/system/field-config?bizType=${encodeURIComponent(bizType)}&fieldKey=${encodeURIComponent(fieldKey)}`,
      method: 'DELETE',
    });
  },

  /**
   * 获取启用的字段配置（便捷方法，自动 platform=mp, includeDisabled=false）
   * @param {string} bizType - 业务对象
   */
  getEnabledFields(bizType) {
    return this.list(bizType, 'mp', false);
  },
};

module.exports = { fieldConfig };
