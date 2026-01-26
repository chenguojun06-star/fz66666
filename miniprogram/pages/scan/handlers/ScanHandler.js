/**
 * 扫码业务编排器
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
 * 使用示例：
 * const handler = new ScanHandler(api, qrParser, stageDetector);
 * const result = await handler.handleScan(rawCode);
 * if (result.success) {
 *   // 更新UI
 * } else {
 *   wx.showToast({ title: result.message, icon: 'none' });
 * }
 *
 * @author GitHub Copilot
 * @date 2026-01-23
 */

const QRCodeParser = require('../services/QRCodeParser');
const StageDetector = require('../services/StageDetector');

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
    // 注意：QRCodeParser 导出的是实例，StageDetector 导出的是类
    this.qrParser = QRCodeParser; // 直接使用导出的实例
    this.stageDetector = new StageDetector(api); // 需要实例化

    // 扫码模式
    this.SCAN_MODE = {
      BUNDLE: 'bundle', // 菲号扫码（推荐）
      ORDER: 'order', // 订单扫码
      SKU: 'sku', // SKU扫码
    };
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
   * 解析手动输入参数
   */
  _parseManualInput(input) {
    let manualQuantity = null;
    let manualScanType = null;
    let manualWarehouse = null;

    if (input && typeof input === 'object') {
      manualScanType = typeof input.scanType === 'string' ? input.scanType.trim() : null;
      manualWarehouse = typeof input.warehouse === 'string' ? input.warehouse.trim() : null;
      const q = Number(input.quantity);
      manualQuantity = Number.isFinite(q) && q > 0 ? q : null;
    } else {
      const q = Number(input);
      manualQuantity = Number.isFinite(q) && q > 0 ? q : null;
    }

    return { manualQuantity, manualScanType, manualWarehouse };
  }

  /**
   * 确定扫码模式
   */
  _determineScanMode(parsedData) {
    if (parsedData.isOrderQR) {
      return this.SCAN_MODE.ORDER;
    }
    if (parsedData.isSkuQR) {
      return this.SCAN_MODE.SKU;
    }
    return this.SCAN_MODE.BUNDLE;
  }

  /**
   * 处理 SKU 数量获取
   */
  _handleSKUQuantity(parsedData, orderDetail) {
    if (parsedData.quantity) {
      return null; // 已有数量
    }

    // 尝试在订单明细中找到该SKU的数量
    if (orderDetail.items?.length > 0) {
      const matchedItem = orderDetail.items.find(
        item => item.color === parsedData.color && item.size === parsedData.size
      );

      if (matchedItem) {
        const skuQty = matchedItem.quantity || matchedItem.num;
        if (skuQty > 0) {
          parsedData.quantity = Number(skuQty);
          console.log('[ScanHandler] 自动使用SKU数量:', parsedData.quantity);
          return null;
        }
      }
    }

    // 需要用户输入
    return {
      success: false,
      message: `请输入 ${parsedData.color}/${parsedData.size} 的数量`,
      needInput: true,
      data: parsedData,
    };
  }

  /**
   * 处理采购模式扫码
   */
  async _handleProcurementMode(parsedData, orderDetail) {
    console.log('[ScanHandler] 检测到采购模式，查询面料采购单');

    try {
      const materialPurchases = await this.api.production.getMaterialPurchases({
        orderNo: parsedData.orderNo,
      });

      console.log('[ScanHandler] 发现面料采购单:', materialPurchases?.length || 0);

      return {
        success: true,
        needConfirm: true,
        scanMode: this.SCAN_MODE.ORDER,
        data: {
          ...parsedData,
          materialPurchases: materialPurchases || [],
          progressStage: '采购',
          orderDetail: orderDetail,
        },
        message: '请确认面料采购明细',
      };
    } catch (e) {
      console.error('[ScanHandler] 查询面料采购单失败:', e);
      return this._errorResult('查询采购单失败: ' + (e.message || ''));
    }
  }

  /**
   * 处理订单扫码（有SKU明细）
   */
  async _handleOrderWithItems(parsedData, orderDetail) {
    console.log('[ScanHandler] 发现订单明细:', orderDetail.items.length);

    // 预判工序
    let nextStage = '未知';
    try {
      const stageRes = await this._detectStage(this.SCAN_MODE.ORDER, parsedData, orderDetail);
      if (stageRes) {
        nextStage = stageRes.progressStage;
      }
    } catch (e) {
      console.warn('[ScanHandler] 预判工序失败:', e);
    }

    // 补救措施：如果预判是采购工序，补查采购单
    let materialPurchases = [];
    if (nextStage === '采购') {
      try {
        console.log('[ScanHandler] 预判为采购工序，补查面料采购单');
        materialPurchases = await this.api.production.getMaterialPurchases({
          orderNo: parsedData.orderNo,
        });
        console.log('[ScanHandler] 补获面料采购单:', materialPurchases?.length || 0);
      } catch (e) {
        console.error('[ScanHandler] 补获采购单失败:', e);
      }
    }

    return {
      success: true,
      needConfirm: true,
      scanMode: this.SCAN_MODE.ORDER,
      data: {
        ...parsedData,
        skuItems: orderDetail.items,
        progressStage: nextStage,
        materialPurchases: materialPurchases,
        orderDetail: orderDetail,
      },
      message: '请确认扫码明细',
    };
  }
  /**
   * 处理SKU模式的数量获取
   * @private
   */
  async _handleSKUQuantity(parsedData, orderDetail) {
    if (parsedData.quantity) {
      return;
    } // 已有数量，无需处理

    // 尝试从订单明细中找到该SKU的数量
    if (orderDetail.items && orderDetail.items.length > 0) {
      const matchedItem = orderDetail.items.find(
        item => item.color === parsedData.color && item.size === parsedData.size
      );

      if (matchedItem) {
        const skuQty = matchedItem.quantity || matchedItem.num;
        if (skuQty > 0) {
          parsedData.quantity = Number(skuQty);
          console.log('[ScanHandler] 自动使用SKU数量:', parsedData.quantity);
        }
      }
    }

    // 如果还是没有数量，需要用户输入
    if (!parsedData.quantity) {
      throw {
        needInput: true,
        message: `请输入 ${parsedData.color}/${parsedData.size} 的数量`,
      };
    }
  }

  /**
   * 处理订单模式的数量获取
   * @private
   */
  _handleOrderQuantity(parsedData, orderDetail) {
    if (parsedData.quantity) {
      return;
    } // 已有数量
    if (parsedData.skuItems) {
      return;
    } // 有明细，无需总数

    const orderQuantity = orderDetail.quantity || orderDetail.totalQuantity || orderDetail.totalNum;

    if (orderQuantity && orderQuantity > 0) {
      parsedData.quantity = Number(orderQuantity);
      console.log('[ScanHandler] 自动使用订单数量:', parsedData.quantity);
    } else {
      throw {
        needInput: true,
        message: '请输入数量',
      };
    }
  }

  /**
   * 处理订单扫码逻辑（包含采购和SKU明细判断）
   * @private
   */
  async _processOrderScan(scanMode, parsedData, orderDetail, manualScanType) {
    if (scanMode !== this.SCAN_MODE.ORDER) {
      return null;
    }

    console.log('[ScanHandler] 订单扫码, manualScanType:', manualScanType);

    // 采购模式特殊处理
    const isProcurementMode =
      manualScanType === 'procurement' ||
      orderDetail.currentProcessName === '采购' ||
      orderDetail.current_process_name === '采购';

    if (isProcurementMode) {
      return await this._handleProcurementMode(parsedData, orderDetail);
    }

    // 有SKU明细的订单
    if (orderDetail.items?.length > 0) {
      return await this._handleOrderWithItems(parsedData, orderDetail);
    }

    // 处理数量
    this._handleOrderQuantity(parsedData, orderDetail);
    return null; // 继续后续流程
  }

  /**
   * 处理工序检测（包含手动工序覆盖）
   * @private
   */
  async _processStageDetection(scanMode, parsedData, orderDetail, manualScanType) {
    let stageResult = await this._detectStage(scanMode, parsedData, orderDetail);

    const manualStage = this._resolveManualStage(manualScanType);
    if (manualStage) {
      stageResult = stageResult
        ? { ...stageResult, ...manualStage }
        : { ...manualStage, quantity: parsedData.quantity || 0, isDuplicate: false };
    }

    if (!stageResult) {
      throw new Error('无法识别当前工序,请联系管理员');
    }

    // ⚠️ 质检工序必须扫描菲号二维码
    // 因为质检是按菲号（每扎）进行的，不是按整个订单
    if (stageResult.scanType === 'quality' && scanMode === this.SCAN_MODE.ORDER) {
      throw new Error('⚠️ 质检请扫描裁剪单上的菲号二维码');
    }

    // ⚠️ 入库工序需要走质检入库流程（需要选择仓库）
    // 入库必须扫描菲号二维码，并打开入库弹窗
    if (stageResult.scanType === 'warehouse') {
      if (scanMode === this.SCAN_MODE.ORDER) {
        throw new Error('⚠️ 入库请扫描裁剪单上的菲号二维码');
      }
      // 如果已经入库完成，抛出特殊提示（不是错误）
      if (stageResult.isCompleted) {
        const err = new Error(stageResult.hint || '该菲号已入库完成');
        err.isCompleted = true; // 标记为已完成状态，页面会显示成功提示
        throw err;
      }
      // 抛出特殊错误，让页面打开入库弹窗
      const err = new Error('需要入库确认');
      err.needWarehousing = true;
      err.warehousingData = {
        orderNo: parsedData.orderNo,
        orderId: orderDetail?.id,
        bundleNo: parsedData.bundleNo,
        bundleId: parsedData.bundleId,
        color: parsedData.color,
        size: parsedData.size,
        quantity: stageResult.quantity || parsedData.quantity || 1,
        styleName: orderDetail?.styleName,
        styleNo: orderDetail?.styleNo,
      };
      throw err;
    }

    if (stageResult.isDuplicate) {
      throw new Error(stageResult.hint || '扫码过于频繁,请稍后再试');
    }

    return stageResult;
  }

  /**
   * 提交扫码并构建结果
   * @private
   */
  async _submitAndBuildResult(scanMode, parsedData, stageResult, scanData) {
    const submitResult = await this._submitScan(scanData);
    if (!submitResult.success) {
      throw new Error(submitResult.message || '提交失败');
    }

    return {
      success: true,
      message: this._buildSuccessMessage(scanMode, scanData, stageResult),
      data: {
        scanMode,
        orderNo: parsedData.orderNo,
        bundleNo: parsedData.bundleNo,
        quantity: stageResult.quantity || parsedData.quantity,
        processName: stageResult.processName,
        progressStage: stageResult.progressStage,
        scanType: stageResult.scanType,
        scanId: submitResult.data?.scanId,
      },
    };
  }

  /**
   * 主扫码处理函数
   */
  async handleScan(rawScanCode, input = null) {
    const { manualQuantity, manualScanType, manualWarehouse } = this._parseManualInput(input);

    console.log(
      '[ScanHandler] 处理扫码:',
      rawScanCode,
      manualQuantity ? `数量:${manualQuantity}` : '',
      'scanType:',
      manualScanType
    );

    try {
      // === 步骤1：解析二维码 ===
      const parseResult = this.qrParser.parse(rawScanCode);

      if (!parseResult.success) {
        console.warn('[ScanHandler] 解析失败:', parseResult.message);
        return this._errorResult(parseResult.message || '无法识别的二维码格式');
      }

      const parsedData = parseResult.data;

      // 如果手动输入了数量,覆盖解析结果
      if (manualQuantity && manualQuantity > 0) {
        parsedData.quantity = manualQuantity;
      }

      const scanMode = this._determineScanMode(parsedData);

      console.log('[ScanHandler] 解析成功:', {
        scanMode,
        orderNo: parsedData.orderNo,
        bundleNo: parsedData.bundleNo,
        quantity: parsedData.quantity,
        isSku: parsedData.isSkuQR,
      });

      // === 步骤2：获取订单详情 ===
      const orderDetail = await this._getOrderDetail(parsedData.orderNo);
      if (!orderDetail) {
        return this._errorResult('订单不存在或已删除');
      }

      // 🔍 调试：打印订单详情中的关键工序字段
      console.log('[ScanHandler] 订单详情工序信息:', {
        currentProcessName: orderDetail.currentProcessName,
        currentProgress: orderDetail.currentProgress,
        progressStage: orderDetail.progressStage,
        productionProgress: orderDetail.productionProgress,
        isOrderQR: parsedData.isOrderQR,
      });

      // === 步骤3：处理SKU/订单模式的特殊逻辑 ===
      try {
        // SKU 模式：获取数量
        if (scanMode === this.SCAN_MODE.SKU) {
          await this._handleSKUQuantity(parsedData, orderDetail);
        }

        // 订单模式：处理采购/明细/数量
        const orderResult = await this._processOrderScan(
          scanMode,
          parsedData,
          orderDetail,
          manualScanType
        );
        if (orderResult) {
          return orderResult;
        }
      } catch (e) {
        if (e.needInput) {
          return {
            success: false,
            message: e.message,
            needInput: true,
            data: parsedData,
          };
        }
        throw e;
      }

      // === 步骤4：检测工序并验证 ===
      const stageResult = await this._processStageDetection(
        scanMode,
        parsedData,
        orderDetail,
        manualScanType
      );

      // === 步骤5：准备扫码数据 ===
      const scanData = this._prepareScanData(parsedData, stageResult, orderDetail, manualWarehouse);

      // === 步骤6：提交并构建结果 ===
      const finalResult = await this._submitAndBuildResult(
        scanMode,
        parsedData,
        stageResult,
        scanData
      );

      // === 步骤7：触发成功回调 ===
      if (this.options.onSuccess) {
        this.options.onSuccess(finalResult);
      }

      return finalResult;
    } catch (e) {
      // 入库工序特殊处理：重新抛出让页面捕获
      if (e.needWarehousing) {
        throw e;
      }

      // 已入库完成：重新抛出让页面显示成功提示
      if (e.isCompleted) {
        throw e;
      }

      console.error('[ScanHandler] 扫码处理异常:', e);
      const errorMsg = e.message || '扫码失败，请重试';

      if (this.options.onError) {
        this.options.onError(errorMsg);
      }

      return this._errorResult(errorMsg);
    }
  }

  /**
   * 获取订单详情（带缓存）
   * @private
   * @param {string} orderNo - 订单号
   * @returns {Promise<Object|null>} 订单详情
   */
  async _getOrderDetail(orderNo) {
    try {
      const res = await this.api.production.orderDetailByOrderNo(orderNo);
      return res || null;
    } catch (e) {
      console.error('[ScanHandler] 获取订单失败:', e);
      return null;
    }
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
    if (scanMode === this.SCAN_MODE.BUNDLE) {
      // 菲号模式：使用精确的扫码次数匹配
      return await this.stageDetector.detectByBundle(
        parsedData.orderNo,
        parsedData.bundleNo,
        parsedData.quantity,
        orderDetail
      );
    } else {
      // 订单模式：使用订单当前进度判断
      return this.stageDetector.detectNextStage(orderDetail);
    }
  }

  /**
   * 获取工厂信息（优先从当前工厂，否则从订单详情）
   * @private
   * @param {Object} orderDetail - 订单详情
   * @returns {Object} 工厂信息 { factoryId, factoryName }
   */
  _getFactoryInfo(orderDetail) {
    const factory = this.options.getCurrentFactory ? this.options.getCurrentFactory() : null;
    return {
      factoryId: factory?.id || orderDetail.factoryId || '',
      factoryName: factory?.name || orderDetail.factoryName || '',
    };
  }

  /**
   * 获取工人信息
   * @private
   * @returns {Object} 工人信息 { workerId, workerName }
   */
  _getWorkerInfo() {
    const worker = this.options.getCurrentWorker ? this.options.getCurrentWorker() : null;
    return {
      workerId: worker?.id || '',
      workerName: worker?.name || '',
    };
  }

  /**
   * 准备提交的扫码数据
   * @private
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} stageResult - 工序检测结果
   * @param {Object} orderDetail - 订单详情
   * @returns {Object} 扫码数据对象
   */
  _prepareScanData(parsedData, stageResult, orderDetail, warehouse) {
    const factoryInfo = this._getFactoryInfo(orderDetail);
    const workerInfo = this._getWorkerInfo();

    return {
      // 基础信息
      orderNo: parsedData.orderNo,
      bundleNo: parsedData.bundleNo || '',
      quantity: stageResult.quantity || parsedData.quantity || 0,

      // 🔧 修复：添加 scanCode 字段，质检等工序需要此字段
      scanCode: parsedData.scanCode || '',

      // 扩展信息：SKU明细
      skuItems: parsedData.skuItems || [],

      // 工序信息
      processName: stageResult.processName,
      progressStage: stageResult.progressStage,
      scanType: stageResult.scanType,

      // 🔧 新增：质检子步骤（领取/验收/确认）
      qualityStage: stageResult.qualityStage || '',

      // 订单信息
      styleNo: parsedData.styleNo || orderDetail.styleNo || '',
      color: parsedData.color || '',
      size: parsedData.size || '',

      // 工厂和工人信息
      ...factoryInfo,
      ...workerInfo,

      // 扫码时间
      scanTime: new Date().toISOString(),

      warehouse: warehouse || '',

      // 客户端标识
      source: 'miniprogram',
    };
  }

  _resolveManualStage(scanType) {
    const st = String(scanType || '').trim();
    if (!st || st === 'auto') {
      return null;
    }
    const map = {
      procurement: { processName: '采购', progressStage: '采购', scanType: 'procurement' },
      cutting: { processName: '裁剪', progressStage: '裁剪', scanType: 'cutting' },
      production: { processName: '车缝', progressStage: '车缝', scanType: 'production' },
      sewing: { processName: '车缝', progressStage: '车缝', scanType: 'production' },
      ironing: { processName: '整烫', progressStage: '整烫', scanType: 'production' },
      packaging: { processName: '包装', progressStage: '包装', scanType: 'production' },
      quality: { processName: '质检', progressStage: '质检', scanType: 'quality' },
      warehouse: { processName: '入库', progressStage: '入库', scanType: 'warehouse' },
    };
    return map[st] || null;
  }

  /**
   * 提交扫码记录到服务器
   * @private
   * @param {Object} scanData - 扫码数据
   * @returns {Promise<Object>} 提交结果
   */
  async _submitScan(scanData) {
    try {
      const res = await this.api.production.executeScan(scanData);

      if (res && res.success !== false) {
        return {
          success: true,
          data: res,
        };
      } else {
        return {
          success: false,
          message: res?.message || '提交失败',
        };
      }
    } catch (e) {
      console.error('[ScanHandler] 提交扫码失败:', e);

      // 判断是否为网络错误
      if (e.errMsg && e.errMsg.includes('timeout')) {
        return {
          success: false,
          message: '网络超时，请检查网络后重试',
        };
      }

      return {
        success: false,
        message: e.message || '提交失败',
      };
    }
  }

  /**
   * 构建成功提示消息
   * @private
   * @param {string} scanMode - 扫码模式
   * @param {Object} scanData - 扫码数据
   * @param {Object} stageResult - 工序结果
   * @returns {string} 提示消息
   */
  _buildSuccessMessage(scanMode, scanData, stageResult) {
    const quantity = scanData.quantity;
    const processName = scanData.processName;
    const bundleNo = scanData.bundleNo;
    const skuItems = scanData.skuItems;

    if (scanMode === this.SCAN_MODE.BUNDLE && bundleNo) {
      // 菲号模式：显示工序和数量
      const hint = stageResult.hint ? ` ${stageResult.hint}` : '';
      return `✅ ${processName} ${quantity}件${hint}`;
    } else if (scanMode === this.SCAN_MODE.SKU) {
      // SKU模式：显示工序、SKU信息和数量
      return `✅ ${processName} 成功 - ${scanData.color}/${scanData.size} ${quantity}件`;
    } else {
      // 订单模式：显示工序
      if (skuItems && skuItems.length > 0) {
        // 如果有SKU明细，提示已处理明细
        return `✅ ${processName} 成功 - 已处理 ${skuItems.length} 个规格`;
      }
      return `✅ 订单扫码成功 - ${processName}`;
    }
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
   * 批量扫码处理（支持连续扫码场景）
   *
   * 使用场景：
   * - 一次性扫描多个菲号
   * - 批量导入扫码记录
   *
   * @param {Array<string>} scanCodes - 扫码结果数组
   * @returns {Promise<Object>} 批量处理结果
   * @returns {number} result.total - 总数
   * @returns {number} result.success - 成功数
   * @returns {number} result.failed - 失败数
   * @returns {Array} result.details - 详细结果
   */
  async handleBatchScan(scanCodes) {
    const results = {
      total: scanCodes.length,
      success: 0,
      failed: 0,
      details: [],
    };

    for (let i = 0; i < scanCodes.length; i++) {
      const code = scanCodes[i];
      const result = await this.handleScan(code);

      if (result.success) {
        results.success++;
      } else {
        results.failed++;
      }

      results.details.push({
        index: i + 1,
        code: code,
        success: result.success,
        message: result.message,
      });
    }

    return results;
  }

  /**
   * 验证扫码权限
   *
   * 检查项：
   * - 是否选择工厂
   * - 是否登录
   * - 是否有扫码权限
   *
   * @returns {Object} 验证结果
   * @returns {boolean} result.valid - 是否有效
   * @returns {string} result.message - 错误消息（无效时）
   */
  validateScanPermission() {
    const factory = this.options.getCurrentFactory ? this.options.getCurrentFactory() : null;

    const worker = this.options.getCurrentWorker ? this.options.getCurrentWorker() : null;

    if (!factory) {
      return {
        valid: false,
        message: '请先选择工厂',
      };
    }

    if (!worker) {
      return {
        valid: false,
        message: '请先登录',
      };
    }

    return {
      valid: true,
    };
  }

  /**
   * 获取扫码统计信息
   *
   * 统计项：
   * - 今日扫码次数
   * - 今日扫码数量
   * - 最近扫码记录
   *
   * @param {string} workerName - 工人姓名
   * @returns {Promise<Object>} 统计信息
   */
  async getScanStatistics(_workerName) {
    try {
      const today = new Date();
      const startTime = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endTime = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      const res = await this.api.production.myScanHistory({
        page: 1,
        pageSize: 100,
        startTime: startTime,
        endTime: endTime,
      });

      const records = res && res.records ? res.records : [];
      const totalQuantity = records.reduce((sum, r) => sum + (r.quantity || 0), 0);

      return {
        todayScans: records.length,
        todayQuantity: totalQuantity,
        recentRecords: records.slice(0, 5), // 最近5条
      };
    } catch (e) {
      console.error('[ScanHandler] 获取统计失败:', e);
      return {
        todayScans: 0,
        todayQuantity: 0,
        recentRecords: [],
      };
    }
  }
}

// 导出类
module.exports = ScanHandler;
