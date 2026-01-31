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
 * @property {number} currentIndex - 当前节点索引（可选）
 */

/**
 * @typedef {Object} PaginatedList
 * @template T - 数据类型
 * @property {number} page - 当前页码
 * @property {number} pageSize - 每页数量
 * @property {number} total - 总数（可选）
 * @property {T[]} records - 数据列表
 */

/**
 * @typedef {Object} ApiResponse
 * @template T - 数据类型
 * @property {number} code - 状态码（200 为成功）
 * @property {T} data - 返回数据
 * @property {string} message - 返回消息
 */

/**
 * @typedef {Object} ScanExecuteResponse
 * @property {boolean} success - 是否成功
 * @property {string} message - 返回消息
 * @property {ScanRecord} scanRecord - 扫码记录
 * @property {Object} orderInfo - 订单信息
 * @property {string} orderInfo.orderNo - 订单号
 * @property {string} orderInfo.styleNo - 款号
 * @property {number} unitPrice - 单价（可能为0）
 * @property {string} [unitPriceHint] - 单价提示信息（当单价为0时返回，提示用户去模板中心配置）
 */

/**
 * @typedef {Object} ScanResultDisplay
 * @property {boolean} success - 是否成功
 * @property {string} message - 显示消息
 * @property {string} scanCode - 扫码值
 * @property {string} orderNo - 订单号
 * @property {string} styleNo - 款号
 * @property {string} processName - 工序名称
 * @property {string} [color] - 颜色
 * @property {string} [size] - 尺寸
 * @property {number} [unitPrice] - 单价
 * @property {string} [unitPriceHint] - 单价提示信息（当单价为0时显示警告）
 */

/**
 * @typedef {Object} UserInfo
 * @property {string} id - 用户ID
 * @property {string} username - 用户名
 * @property {string} realName - 真实姓名
 * @property {string} [avatar] - 头像URL
 * @property {string} [phone] - 手机号
 * @property {string} role - 角色
 * @property {string} [factoryId] - 工厂ID
 * @property {string} [factoryName] - 工厂名称
 */

/**
 * @typedef {Object} FactoryInfo
 * @property {string} id - 工厂ID
 * @property {string} name - 工厂名称
 * @property {string} [address] - 地址
 * @property {string} [contact] - 联系人
 * @property {string} [phone] - 联系电话
 */

/**
 * @typedef {Object} StyleInfo
 * @property {string} id - 款式ID
 * @property {string} styleNo - 款号
 * @property {string} styleName - 款式名称
 * @property {string} [category] - 品类
 * @property {string} [season] - 季节
 * @property {string} [cover] - 封面图URL
 * @property {string} [createTime] - 创建时间
 */

/**
 * @typedef {Object} DashboardStats
 * @property {number} styleCount - 款式数量
 * @property {number} productionCount - 生产订单数量
 * @property {number} pendingReconciliationCount - 待对账数量
 * @property {number} paymentApprovalCount - 付款审批数量
 * @property {number} todayScanCount - 今日扫码数量
 * @property {number} warehousingOrderCount - 入库订单数量
 * @property {number} unqualifiedQuantity - 不合格品数量
 * @property {number} materialPurchase - 物料采购数量
 * @property {number} urgentEventCount - 紧急事件数量
 */

/**
 * @typedef {Object} ActivityItem
 * @property {string} id - 活动ID
 * @property {string} type - 活动类型
 * @property {string} content - 活动内容
 * @property {string} time - 活动时间
 */

/**
 * @typedef {Object} ReminderItem
 * @property {string} id - 提醒ID
 * @property {string} title - 提醒标题
 * @property {string} content - 提醒内容
 * @property {string} type - 提醒类型（'urgent' | 'normal' | 'info'）
 * @property {string} createTime - 创建时间
 * @property {string} [expireTime] - 过期时间
 * @property {boolean} read - 是否已读
 */

/**
 * @typedef {Object} WorkItem
 * @property {string} id - 工作项ID
 * @property {string} title - 标题
 * @property {string} description - 描述
 * @property {string} status - 状态
 * @property {string} [deadline] - 截止时间
 * @property {number} [progress] - 进度（0-100）
 */

export {};
