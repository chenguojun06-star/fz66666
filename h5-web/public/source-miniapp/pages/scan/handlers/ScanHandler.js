/**
 * 扫码业务编排器（重构版）
 *
 * 功能：
 * 1. 编排整个扫码业务流程（解析 → 验证 → 检测工序 → 提交）
 * 2. 整合 QRCodeParser 和 StageDetector 服务
 * 3. 处理菲号扫码和订单扫码两种模式
 * 4. 统一错误处理和用户提示
 *
 * 业务流程：
 * rawScanCode → QRCodeParser.parse() → 订单验证 → StageDetector.detect()
 * → 重复检查 → submitScan() → 更新本地状态
 *
 * 重构说明（2026-02-15）：
 * - 拆分为 5 个模块：ScanHandler（主编排器）+ 4 个辅助器
 * - ScanModeResolver: 模式判断
 * - ScanDataProcessor: 数据处理
 * - ScanStageProcessor: 工序检测
 * - ScanSubmitter: 提交器
 * - 保持业务逻辑 100% 不变，仅重组代码结构
 *
 * @author GitHub Copilot
 * @date 2026-02-15
 */

const QRCodeParser = require('../services/QRCodeParser');
const PatternScanProcessor = require('./PatternScanProcessor');

// 导入辅助模块
const ScanModeResolver = require('./helpers/ScanModeResolver');
const ScanDataProcessor = require('./helpers/ScanDataProcessor');
const ScanStageProcessor = require('./helpers/ScanStageProcessor');
const ScanSubmitter = require('./helpers/ScanSubmitter');
const ScanPeripheralHelper = require('./helpers/ScanPeripheralHelper');
const { formatLocalDateTime } = ScanPeripheralHelper;

/**
 * 扫码业务编排器
 * 编排整个扫码业务流程（解析 → 验证 → 检测工序 → 提交）
 */
class ScanHandler {
  /**
   * 构造函数
   * @param {Object} api - API 服务对象
   * @param {Object} options - 配置选项
   * @param {Function} options.onSuccess - 扫码成功回调
   * @param {Function} options.onError - 扫码失败回调
   * @param {Function} options.getCurrentFactory - 获取当前工厂信息的方法
   * @param {Function} options.getCurrentWorker - 获取当前工人信息的方法
   */
  constructor(api, options = {}) {
    this.api = api;
    this.options = options;

    // 初始化服务
    // 注意：QRCodeParser 导出的是实例
    this.qrParser = QRCodeParser; // 直接使用导出的实例

    // 初始化辅助模块
    this.modeResolver = new ScanModeResolver();
    this.dataProcessor = new ScanDataProcessor(api);
    this.stageProcessor = new ScanStageProcessor(
      api,
      this.modeResolver,
      () => this.scanType // 传递 scanType getter
    );
    this.submitter = new ScanSubmitter(api);

    // 扫码模式（向后兼容）
    this.SCAN_MODE = this.modeResolver.SCAN_MODE;
  }

  /**
   * 处理扫码事件（主入口方法）
   *
   * 完整流程：
   * 1. 解析二维码
   * 2. 验证订单是否存在
   * 3. 检测下一个工序
   * 4. 检查是否重复扫码
   * 5. 提交扫码记录
   * 6. 触发成功回调
   *
   * @param {string} rawScanCode - 原始扫码结果
   * @param {number} manualQuantity - 手动输入的数量(可选)
   * @returns {Promise<Object>} 处理结果
   * @returns {boolean} result.success - 是否成功
   * @returns {string} result.message - 提示消息
   * @returns {Object} result.data - 扫码数据（成功时）
   * @returns {string} result.scanMode - 扫码模式（bundle/order）
   */

  /**
   * 处理订单扫码逻辑（包含采购和SKU明细判断）
   * @private
   * @param {string} scanMode - 扫码模式
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} orderDetail - 订单详情
   * @param {string} manualScanType - 手动指定的扫码类型
   * @returns {Promise<Object|null>} 处理结果，或 null 继续后续流程
   */
  async _processOrderScan(scanMode, parsedData, orderDetail, manualScanType) {
    if (scanMode !== this.SCAN_MODE.ORDER) {
      return null;
    }

    const isProcurementMode =
      manualScanType === 'procurement' ||
      orderDetail.currentProcessName === '采购' ||
      orderDetail.current_process_name === '采购';

    if (isProcurementMode) {
      return await this.dataProcessor.handleProcurementMode(parsedData, orderDetail, this.SCAN_MODE.ORDER);
    }

    const isCuttingMode =
      manualScanType === 'cutting' ||
      orderDetail.currentProcessName === '裁剪' ||
      orderDetail.current_process_name === '裁剪';

    if (isCuttingMode) {
      return await this.dataProcessor.handleCuttingMode(parsedData, orderDetail, this.SCAN_MODE.ORDER);
    }

    if (orderDetail.items?.length > 0) {
      return await this.dataProcessor.handleOrderWithItems(
        parsedData,
        orderDetail,
        this._detectStage.bind(this),
        this.SCAN_MODE.ORDER
      );
    }

    this.dataProcessor.handleOrderQuantity(parsedData, orderDetail);
    return null;
  }

  /**
   * 处理工序检测（包含手动工序覆盖）
   * @private
   * @param {string} scanMode - 扫码模式
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} orderDetail - 订单详情
   * @param {string} manualScanType - 手动指定的扫码类型
   * @returns {Promise<Object>} 工序检测结果
   */
  async _processStageDetection(scanMode, parsedData, orderDetail, manualScanType) {
    return await this.stageProcessor.processStageDetection(scanMode, parsedData, orderDetail, manualScanType);
  }

  /**
   * 主扫码处理函数
   * @param {string} rawScanCode - 原始扫码结果
   * @param {Object|number|null} input - 手动输入参数
   * @returns {Promise<Object>} 扫码处理结果
   */
  async handleScan(rawScanCode, input = null) {
    const { manualQuantity, manualScanType, manualWarehouse } = this.modeResolver.parseManualInput(input);

    try {
      // === 步骤1：解析二维码 ===
      const parsed = this._parseAndValidateQR(rawScanCode, manualQuantity);
      if (!parsed.success) {
        return parsed;
      }
      const { parsedData, scanMode } = parsed;

      // === 步骤1.5：样板特殊处理 ===
      if (scanMode === this.SCAN_MODE.PATTERN) {
        return await this._handlePatternScan(parsedData, manualScanType);
      }

      // === 步骤1.6：U编码入库快捷路径（跳过工序检测，直接走warehouse） ===
      if (scanMode === this.SCAN_MODE.UCODE) {
        return this._buildUCodeConfirmResult(parsedData, manualWarehouse);
      }

      // === 步骤2-3：获取订单 + 处理模式特殊逻辑 ===
      const modeResult = await this._resolveOrderAndMode(scanMode, parsedData, manualScanType);
      if (modeResult.earlyReturn) {
        return modeResult.earlyReturn;
      }
      const { orderDetail } = modeResult;

      // === 步骤4：检测工序 ===
      const stageResult = await this._processStageDetection(scanMode, parsedData, orderDetail, manualScanType);

      // === 步骤5：准备扫码数据（不提交，等待用户确认）===
      const scanData = this._prepareScanData(parsedData, stageResult, orderDetail, manualWarehouse);

      return this._buildConfirmResult({ scanMode, parsedData, stageResult, scanData, orderDetail });
    } catch (e) {
      return this._handleScanError(e);
    }
  }

  /**
   * 解析并验证二维码
   * @private
   * @param {string} rawScanCode - 原始扫码结果
   * @param {number|null} manualQuantity - 手动数量
   * @returns {Object} 解析结果 { success, parsedData, scanMode } 或错误结果
   */
  _parseAndValidateQR(rawScanCode, manualQuantity) {
    const parseResult = this.qrParser.parse(rawScanCode);

    if (!parseResult.success) {
      return this._errorResult(parseResult.message || '无法识别的二维码格式');
    }

    const parsedData = parseResult.data;

    if (manualQuantity && manualQuantity > 0) {
      parsedData.quantity = manualQuantity;
    }

    const scanMode = this.modeResolver.determineScanMode(parsedData);

    return { success: true, parsedData, scanMode };
  }

  /**
   * 获取订单详情并处理各扫码模式的特殊逻辑
   * @private
   * @param {string} scanMode - 扫码模式
   * @param {Object} parsedData - 解析后的数据
   * @param {string} manualScanType - 手动扫码类型
   * @returns {Promise<Object>} 结果 { orderDetail, earlyReturn? }
   */
  async _resolveOrderAndMode(scanMode, parsedData, manualScanType) {
    const parsedOrderNo = this.dataProcessor.normalizeOrderNo(parsedData.orderNo);
    if (parsedOrderNo) {
      parsedData.orderNo = parsedOrderNo;
    }

    const orderDetail = await this.dataProcessor.getOrderDetail(parsedData.orderNo, parsedData.orderId);
    if (!orderDetail) {
      return { earlyReturn: this._errorResult('订单不存在或已删除') };
    }

    // 保证 parsedData/orderDetail 的订单号字段一致且不为空
    const detailOrderNo = this.dataProcessor.extractOrderNoFromDetail(orderDetail);
    const finalOrderNo = this.dataProcessor.normalizeOrderNo(parsedData.orderNo || detailOrderNo);
    if (finalOrderNo) {
      parsedData.orderNo = finalOrderNo;
      if (!orderDetail.orderNo) {
        orderDetail.orderNo = finalOrderNo;
      }
    }

    try {
      if (scanMode === this.SCAN_MODE.SKU) {
        await this.dataProcessor.handleSKUQuantity(parsedData, orderDetail);
      }

      const orderResult = await this._processOrderScan(scanMode, parsedData, orderDetail, manualScanType);
      if (orderResult) {
        return { earlyReturn: orderResult, orderDetail };
      }
    } catch (e) {
      if (e.needInput) {
        return {
          earlyReturn: {
            success: false,
            message: e.message,
            needInput: true,
            data: parsedData,
          },
        };
      }
      throw e;
    }

    return { orderDetail };
  }

  /**
   * 构建需要用户确认的返回结果
   * @private
   * @param {Object} params - 参数对象
   * @param {string} params.scanMode - 扫码模式
   * @param {Object} params.parsedData - 解析后的数据
   * @param {Object} params.stageResult - 工序检测结果
   * @param {Object} params.scanData - 扫码数据
   * @param {Object} params.orderDetail - 订单详情
   * @returns {Object} 确认结果
   */
  _buildConfirmResult({ scanMode, parsedData, stageResult, scanData, orderDetail }) {
    // 订单扫码时 quantity 可能为空，从 orderDetail 中取订单总数量
    const quantity = stageResult.quantity
      || parsedData.quantity
      || (orderDetail && (orderDetail.cuttingQty || orderDetail.orderQuantity || orderDetail.totalQuantity || orderDetail.quantity))
      || 0;

    return {
      success: true,
      needConfirmProcess: true,
      message: '已识别工序，请确认后领取',
      data: {
        scanMode,
        orderNo: parsedData.orderNo,
        bundleNo: parsedData.bundleNo,
        color: parsedData.color || '',
        size: parsedData.size || '',
        quantity: quantity,
        processName: stageResult.processName,
        progressStage: stageResult.progressStage,
        scanType: stageResult.scanType,
        qualityStage: stageResult.qualityStage,
        scanData: scanData,
        orderDetail: orderDetail,
        stageResult: stageResult,
        parsedData: parsedData,
      },
    };
  }

  /**
   * 统一处理扫码异常
   * @private
   * @param {Error} e - 异常对象
   * @returns {Object} 错误结果
   */
  _handleScanError(e) {
    // 入库/已完成工序特殊处理：重新抛出让页面捕获
    if (e.needWarehousing || e.isCompleted) {
      throw e;
    }

    console.error('[ScanHandler] 扫码处理异常:', e);

    // 将底层网络错误码转换为用户友好的中文提示
    const raw = e && (e.errMsg || e.message || '');
    let errorMsg;
    if (raw.includes('ERR_CONNECTION_RESET') || raw.includes('errcode:-101')) {
      errorMsg = '网络连接中断，请稍后重试（服务器可能正在更新）';
    } else if (raw.includes('timeout')) {
      errorMsg = '网络超时，请检查网络后重试';
    } else if (raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('errcode:-102')) {
      errorMsg = '无法连接服务器，请检查网络设置';
    } else if (raw.includes('ERR_NAME_NOT_RESOLVED') || raw.includes('errcode:-105')) {
      errorMsg = '网络异常，请检查网络连接';
    } else {
      errorMsg = raw || '扫码失败，请重试';
    }

    if (this.options.onError) {
      this.options.onError(errorMsg);
    }

    return this._errorResult(errorMsg);
  }

  /**
   * 检测下一个工序（根据扫码模式选择策略）
   * @private
   * @param {string} scanMode - 扫码模式（bundle/order）
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} orderDetail - 订单详情
   * @returns {Promise<Object|null>} 工序检测结果
   */
  async _detectStage(scanMode, parsedData, orderDetail) {
    return await this.stageProcessor.detectStage(scanMode, parsedData, orderDetail);
  }

  /** @private 委托 ScanDataProcessor */
  _getFactoryInfo(orderDetail) {
    return this.dataProcessor.getFactoryInfo(orderDetail, this.options);
  }

  /** @private 委托 ScanDataProcessor */
  _getWorkerInfo() {
    return this.dataProcessor.getWorkerInfo(this.options);
  }

  /** @private 委托 ScanDataProcessor */
  _prepareScanData(parsedData, stageResult, orderDetail, warehouse) {
    return this.dataProcessor.prepareScanData(parsedData, stageResult, orderDetail, warehouse, this.options);
  }

  /**
   * 构建错误结果对象
   * @private
   * @param {string} message - 错误消息
   * @returns {Object} 错误结果
   */
  _errorResult(message) {
    return {
      success: false,
      message: message,
    };
  }

  /**
   * 构建U编码入库确认结果（跳过工序检测）
   * @private
   */
  _buildUCodeConfirmResult(parsedData, warehouse) {
    const workerInfo = this._getWorkerInfo();
    const factoryInfo = this._getFactoryInfo(null);
    const scanData = {
      orderNo: parsedData.orderNo || '',
      bundleNo: '',
      quantity: parsedData.quantity || 0,
      scanCode: parsedData.scanCode || '',
      processName: '入库',
      progressStage: '入库',
      scanType: 'warehouse',
      scanMode: 'ucode',
      styleNo: parsedData.styleNo || '',
      color: parsedData.color || '',
      size: parsedData.size || '',
      ...factoryInfo,
      ...workerInfo,
      scanTime: formatLocalDateTime(new Date()),
      warehouse: warehouse || '',
      source: 'h5',
    };
    return {
      success: true,
      needConfirmProcess: true,
      message: 'U编码入库，请确认数量和仓库',
      data: {
        scanMode: 'ucode',
        orderNo: parsedData.orderNo || '',
        bundleNo: '',
        quantity: parsedData.quantity || 0,
        processName: '入库',
        progressStage: '入库',
        scanType: 'warehouse',
        scanData,
        parsedData,
        stageResult: { processName: '入库', progressStage: '入库', scanType: 'warehouse', quantity: parsedData.quantity || 0 },
      },
    };
  }

  /** 批量扫码处理（委托 ScanPeripheralHelper） */
  async handleBatchScan(scanCodes) {
    return ScanPeripheralHelper.handleBatchScan(this, scanCodes);
  }

  /** 验证扫码权限（委托 ScanPeripheralHelper） */
  validateScanPermission() {
    return ScanPeripheralHelper.validateScanPermission(this.options);
  }

  /** 获取扫码统计信息（委托 ScanPeripheralHelper） */
  async getScanStatistics() {
    return ScanPeripheralHelper.getScanStatistics(this.api);
  }

  // ==================== 样板生产扫码处理（委托 PatternScanProcessor） ====================

  /**
   * 处理样板生产扫码
   * @private
   * @param {Object} parsedData - 解析后的数据
   * @param {string} manualScanType - 手动指定的操作类型
   * @returns {Promise<Object>} 处理结果
   */
  async _handlePatternScan(parsedData, manualScanType) {
    return PatternScanProcessor.handlePatternScan(this, parsedData, manualScanType);
  }

  /**
   * 提交样板生产扫码
   * @param {Object} data - 扫码数据
   * @returns {Promise<Object>} 提交结果
   */
  async submitPatternScan(data) {
    return PatternScanProcessor.submitPatternScan(this, data);
  }
}

// 导出类
module.exports = ScanHandler;
