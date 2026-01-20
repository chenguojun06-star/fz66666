/**
 * 小程序数据类型定义 (JSDoc)
 * 与网页端 TypeScript 类型保持一致
 * 
 * 使用方式:
 * @param {ProductionOrder} order
 */

/**
 * @typedef {Object} ProductionOrder
 * @property {string} id - 订单 ID
 * @property {string} orderNo - 订单号
 * @property {string} styleId - 款号 ID
 * @property {string} styleNo - 款号
 * @property {string} styleName - 款号名称
 * @property {string} color - 颜色 (可选)
 * @property {string} size - 尺寸 (可选)
 * @property {string} factoryId - 工厂 ID
 * @property {string} factoryName - 工厂名称
 * @property {number} orderQuantity - 订单数量
 * @property {number} completedQuantity - 已完成数量
 * @property {number} cuttingQuantity - 裁剪数量 (可选)
 * @property {number} cuttingBundleCount - 裁剪捆数 (可选)
 * @property {string} currentProcessName - 当前工序 (可选)
 * @property {number} materialArrivalRate - 物料到位率 (0-100)
 * @property {number} productionProgress - 生产进度 (0-100)
 * @property {'pending'|'production'|'completed'|'delayed'} status - 状态
 * @property {string} plannedStartDate - 计划开始日期
 * @property {string} plannedEndDate - 计划结束日期
 * @property {string} actualStartDate - 实际开始日期 (可选)
 * @property {string} actualEndDate - 实际结束日期 (可选)
 * @property {string} createTime - 创建时间 (可选)
 * @property {string} updateTime - 更新时间 (可选)
 * @property {string} qrCode - 二维码 (可选)
 * @property {string} styleCover - 款号封面 URL (可选)
 * @property {string} orderDetails - 订单详情 (可选)
 * @property {string} progressWorkflowJson - 进度工作流 JSON 字符串
 * @property {number} progressWorkflowLocked - 是否锁定工作流 (0/1)
 * @property {string} progressWorkflowLockedAt - 工作流锁定时间 (可选)
 * @property {string} progressWorkflowLockedBy - 工作流锁定人 (可选)
 * @property {string} progressWorkflowLockedByName - 工作流锁定人名称 (可选)
 */

/**
 * @typedef {Object} ScanRecord
 * @property {string} id - 扫码记录 ID
 * @property {string} orderId - 订单 ID
 * @property {string} orderNo - 订单号
 * @property {string} styleId - 款号 ID
 * @property {string} styleNo - 款号
 * @property {string} scanCode - 扫码值
 * @property {number} quantity - 扫码数量
 * @property {string} scanTime - 扫码时间
 * @property {string} scanOperator - 扫码操作人 (可选)
 * @property {'success'|'failure'} status - 扫码状态 (可选)
 * @property {string} remark - 备注 (可选)
 */

/**
 * @typedef {Object} ProgressNode
 * @property {string} id - 节点 ID
 * @property {string} name - 节点名称
 */

/**
 * @typedef {Object} ProgressWorkflow
 * @property {ProgressNode[]} nodes - 进度节点列表
 * @property {number} currentIndex - 当前节点索引 (可选)
 */

/**
 * @typedef {Object} PaginatedList
 * @template T
 * @property {number} page - 当前页码
 * @property {number} pageSize - 每页数量
 * @property {number} total - 总数 (可选)
 * @property {T[]} records - 数据列表
 */

/**
 * @typedef {Object} ApiResponse
 * @template T
 * @property {number} code - 状态码 (200 为成功)
 * @property {T} data - 返回数据
 * @property {string} message - 返回消息
 */

module.exports = {
  // 仅用于 JSDoc 类型定义
  // 实际使用时只需导入此文件即可获得类型提示
};
