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
      BUNDLE: 'bundle',   // 菲号扫码（推荐）
      ORDER: 'order'      // 订单扫码
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
   * @returns {Promise<Object>} 处理结果
   * @returns {boolean} result.success - 是否成功
   * @returns {string} result.message - 提示消息
   * @returns {Object} result.data - 扫码数据（成功时）
   * @returns {string} result.scanMode - 扫码模式（bundle/order）
   */
  async handleScan(rawScanCode) {
    console.log('[ScanHandler] 开始处理扫码:', rawScanCode);
    console.log('[ScanHandler] qrParser 状态:', this.qrParser ? '已初始化' : '未初始化');

    try {
      // === 步骤1：解析二维码 ===
      console.log('[ScanHandler] 准备调用 qrParser.parse()');
      const parseResult = this.qrParser.parse(rawScanCode);
      console.log('[ScanHandler] 解析完成:', parseResult);
      
      if (!parseResult.success) {
        console.warn('[ScanHandler] 解析失败:', parseResult.message);
        return this._errorResult(parseResult.message || '无法识别的二维码格式');
      }

      const parsedData = parseResult.data;
      const scanMode = parsedData.isOrderQR 
        ? this.SCAN_MODE.ORDER 
        : this.SCAN_MODE.BUNDLE;

      console.log('[ScanHandler] 解析结果:', {
        success: true,
        scanMode,
        orderNo: parsedData.orderNo,
        bundleNo: parsedData.bundleNo,
        quantity: parsedData.quantity
      });

      // === 步骤2：获取订单详情 ===
      const orderDetail = await this._getOrderDetail(parsedData.orderNo);
      if (!orderDetail) {
        return this._errorResult('订单不存在或已删除');
      }

      // === 步骤3：检测下一个工序 ===
      const stageResult = await this._detectStage(
        scanMode, 
        parsedData, 
        orderDetail
      );
      
      if (!stageResult) {
        return this._errorResult('无法识别当前工序，请联系管理员');
      }

      // === 步骤4：检查是否重复扫码 ===
      if (stageResult.isDuplicate) {
        return this._errorResult(stageResult.hint || '扫码过于频繁，请稍后再试');
      }

      // === 步骤5：准备扫码数据 ===
      const scanData = this._prepareScanData(
        parsedData, 
        stageResult, 
        orderDetail
      );

      // === 步骤6：提交扫码记录 ===
      const submitResult = await this._submitScan(scanData);
      if (!submitResult.success) {
        return this._errorResult(submitResult.message || '提交失败');
      }

      // === 步骤7：触发成功回调 ===
      const finalResult = {
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
          scanId: submitResult.data?.scanId
        }
      };

      if (this.options.onSuccess) {
        this.options.onSuccess(finalResult);
      }

      return finalResult;

    } catch (e) {
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
   * 准备提交的扫码数据
   * @private
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} stageResult - 工序检测结果
   * @param {Object} orderDetail - 订单详情
   * @returns {Object} 扫码数据对象
   */
  _prepareScanData(parsedData, stageResult, orderDetail) {
    const factory = this.options.getCurrentFactory 
      ? this.options.getCurrentFactory() 
      : null;
    
    const worker = this.options.getCurrentWorker 
      ? this.options.getCurrentWorker() 
      : null;

    return {
      // 基础信息
      orderNo: parsedData.orderNo,
      bundleNo: parsedData.bundleNo || '',
      quantity: stageResult.quantity || parsedData.quantity || 0,
      
      // 工序信息
      processName: stageResult.processName,
      progressStage: stageResult.progressStage,
      scanType: stageResult.scanType,
      
      // 订单信息
      styleNo: parsedData.styleNo || orderDetail.styleNo || '',
      color: parsedData.color || '',
      size: parsedData.size || '',
      
      // 工厂和工人信息
      factoryId: factory?.id || orderDetail.factoryId || '',
      factoryName: factory?.name || orderDetail.factoryName || '',
      workerId: worker?.id || '',
      workerName: worker?.name || '',
      
      // 扫码时间
      scanTime: new Date().toISOString(),
      
      // 客户端标识
      source: 'miniprogram'
    };
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
          data: res
        };
      } else {
        return {
          success: false,
          message: res?.message || '提交失败'
        };
      }
    } catch (e) {
      console.error('[ScanHandler] 提交扫码失败:', e);
      
      // 判断是否为网络错误
      if (e.errMsg && e.errMsg.includes('timeout')) {
        return {
          success: false,
          message: '网络超时，请检查网络后重试'
        };
      }
      
      return {
        success: false,
        message: e.message || '提交失败'
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

    if (scanMode === this.SCAN_MODE.BUNDLE && bundleNo) {
      // 菲号模式：显示工序和数量
      const hint = stageResult.hint ? ` ${stageResult.hint}` : '';
      return `✅ ${processName} ${quantity}件${hint}`;
    } else {
      // 订单模式：显示工序
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
      message: message
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
      details: []
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
        message: result.message
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
    const factory = this.options.getCurrentFactory 
      ? this.options.getCurrentFactory() 
      : null;
    
    const worker = this.options.getCurrentWorker 
      ? this.options.getCurrentWorker() 
      : null;

    if (!factory) {
      return {
        valid: false,
        message: '请先选择工厂'
      };
    }

    if (!worker) {
      return {
        valid: false,
        message: '请先登录'
      };
    }

    return {
      valid: true
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
  async getScanStatistics(workerName) {
    try {
      const today = new Date();
      const startTime = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endTime = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      const res = await this.api.production.myScanHistory({
        pageNum: 1,
        pageSize: 100,
        workerName: workerName,
        startTime: startTime,
        endTime: endTime
      });

      const records = (res && res.records) ? res.records : [];
      const totalQuantity = records.reduce((sum, r) => sum + (r.quantity || 0), 0);

      return {
        todayScans: records.length,
        todayQuantity: totalQuantity,
        recentRecords: records.slice(0, 5)  // 最近5条
      };
    } catch (e) {
      console.error('[ScanHandler] 获取统计失败:', e);
      return {
        todayScans: 0,
        todayQuantity: 0,
        recentRecords: []
      };
    }
  }
}

// 导出类
module.exports = ScanHandler;
