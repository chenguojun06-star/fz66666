/**
 * 扫码页面数据配置
 * 从 scan/index.js 提取 data 对象定义
 *
 * @version 2.3
 * @date 2026-02-15
 * @module scanDataConfig
 * @description 集中管理扫码页面的所有数据状态
 */

// 修复: 从 config.js 导入 DEBUG_MODE，避免模块级 getApp() 导致启动崩溃
const { DEBUG_MODE } = require('../../../config');

/**
 * 扫码页面 data 对象配置
 * @type {Object}
 */
const scanPageData = {
  // 基础状态
  scanEnabled: true,
  loading: false,
  currentFactory: null,
  currentUser: null,
  quantity: '',
  warehouse: '',
  lastUsedProcessName: '', // 上次拍码成功的工序名称，页面内显示提示
  offlinePendingCount: 0,  // 离线待同步条数（无网时扫码进队列）
  offlineSyncing: false,   // 联网后正在批量上传时为 true
  lastResult: null,
  scanHistory: [],

  // 扫码结果确认弹窗（混合模式）
  scanResultConfirm: {
    visible: false,
    loading: false,
    processName: '',
    processOptions: [],
    selectedProcessNames: [],
    processIndex: -1,
    scanCode: '',
    parsedData: null,
    quantity: 0,
    warehouseCode: '',
    imageInsight: '',
    hasWarehouseSelected: false,
  },

  // 撤销功能
  undo: {
    canUndo: false,
    loading: false,
  },
  undoCountdown: 0,
  undoRecord: null,

  // 退回重扫确认弹窗
  rescanConfirm: {
    visible: false,
    loading: false,
    recordId: '',
    orderNo: '',
    bundleNo: '',
    processName: '',
    quantity: 0,
  },

  // 我的面板数据
  my: {
    // 统计卡片
    loadingStats: false,
    stats: {
      scanCount: 0,
      orderCount: 0,
      totalQuantity: 0,
      totalAmount: 0,
    },

    // 扫码历史
    loadingHistory: false,
    groupedHistory: [],
    history: [],
    historyPage: 1,
    historyPageSize: 20,
    historyHasMore: true,


  },

  // 确认明细弹窗（订单扫码后）
  scanConfirm: {
    visible: false,
    loading: false,
    detail: {
      orderId: '',
      orderNo: '',
      styleNo: '',
      bundleNo: '',
      color: '',
      size: '',
      totalQuantity: 0,
      completedQuantity: 0,
      progressStage: '',
      isProcurement: false,
      isCutting: false,
    },
    skuList: [],
    summary: [],

  },

  // 🔧 质检结果弹窗数据（简化版）
  qualityModal: {
    show: false,
    detail: null,
    result: '', // qualified 或 unqualified，默认为空让用户选择
    unqualifiedQuantity: '', // 不合格数量
    defectCategory: 0, // 原因大类索引
    handleMethod: 0, // 处理方式索引（返修/报废）
    remark: '', // 备注
    images: [], // 照片（可选）
  },
  warehouseOptions: [],
  // 不合格原因大类（与PC端 DEFECT_CATEGORY_OPTIONS 完全一致）
  defectCategories: ['外观完整性问题', '尺寸精度问题', '工艺规范性问题', '功能有效性问题', '其他问题'],
  // 处理方式（与PC端 DEFECT_REMARK_OPTIONS 一致）
  handleMethods: ['返修', '报废'],

  // 🆕 样板生产确认弹窗数据
  patternConfirm: {
    visible: false,
    loading: false,
    patternId: '',
    styleNo: '',
    color: '',
    quantity: 0,
    warehouseCode: '',
    status: '',
    operationType: '',
    operationLabel: '',
    operationOptions: [],
    designer: '',
    patternDeveloper: '',
    deliveryTime: '',
    patternDetail: null,
    remark: '',
  },

  // 调试模式
  debug: DEBUG_MODE,

  // 本次会话按工序累计扫码件数（key: processName → qty）
  sessionStats: {},
};

module.exports = {
  scanPageData,
};
