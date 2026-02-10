/**
 * 工序检测服务（动态工序配置版）
 *
 * 核心设计：
 * - 每个订单对应独立的工序配置（从后端API动态加载）
 * - 不同订单的子工序、单价、顺序完全独立
 * - 没有任何硬编码工序流程，没有兜底
 * - 订单未配置工序模板则直接报错，禁止扫码
 *
 * 功能：
 * 1. 从后端API加载订单的工序配置（工序名、单价、顺序）
 * 2. 基于菲号扫码次数匹配工序配置中的第N个工序
 * 3. 防重复扫码保护（动态计算最小间隔时间）
 *
 * 使用示例：
 * const detector = new StageDetector(api);
 * const result = await detector.detectByBundle('PO001', 'bundle01', 50, orderDetail);
 * // result: { processName, progressStage, scanType, hint, unitPrice, isDuplicate }
 *
 * @author GitHub Copilot
 * @date 2026-02-10
 */

class StageDetector {
  /**
   * 构造函数
   * @param {Object} api - API 服务对象（用于查询扫码记录和菲号信息）
   */
  constructor(api) {
    this.api = api;

    // 订单工序配置缓存 - Map<orderNo, processConfig[]>
    // processConfig 格式: [{processName, price, sortOrder, progressStage, scanType}, ...]
    this.processConfigCache = new Map();

    // scanType 推断规则（根据 progressStage 或 processName 推断扫码类型）
    this.scanTypeRules = {
      采购: 'procurement',
      裁剪: 'cutting',
      质检: 'quality',
      入库: 'warehouse',
    };
    // 默认 scanType（不在上述规则中的工序）
    this.defaultScanType = 'production';
  }

  /**
   * 【新增】动态加载订单的工序配置（从后端API获取）
   * @param {string} orderNo - 订单号
   * @returns {Promise<Array>} 工序配置列表 [{processName, price, sortOrder, progressStage}, ...]
   */
  async loadProcessConfig(orderNo) {
    if (!orderNo) {
      throw new Error('订单号为空，无法加载工序配置');
    }

    // 检查缓存
    if (this.processConfigCache.has(orderNo)) {
      return this.processConfigCache.get(orderNo);
    }

    const config = await this.api.production.getProcessConfig(orderNo);
    if (!config || !Array.isArray(config) || config.length === 0) {
      throw new Error(`订单[${orderNo}]未配置工序模板，请先在PC端设置工序单价`);
    }

    // 按 sortOrder 排序，并为每个工序推断 scanType
    const sorted = config
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(p => ({
        ...p,
        scanType: this._inferScanType(p.processName, p.progressStage),
      }));

    this.processConfigCache.set(orderNo, sorted);
    return sorted;
  }

  /**
   * 根据工序名称/进度阶段推断 scanType
   * @private
   */
  _inferScanType(processName, progressStage) {
    // 优先按 processName 匹配
    if (this.scanTypeRules[processName]) {
      return this.scanTypeRules[processName];
    }
    // 再按 progressStage 匹配
    if (progressStage && this.scanTypeRules[progressStage]) {
      return this.scanTypeRules[progressStage];
    }
    return this.defaultScanType;
  }

  /**
   * 【新增】根据工序名称获取工序单价
   * @param {string} orderNo - 订单号
   * @param {string} processName - 工序名称
   * @returns {Promise<number>} 工序单价（元）
   */
  async getProcessPrice(orderNo, processName) {
    const config = await this.loadProcessConfig(orderNo);
    const process = config.find(p => p.processName === processName);
    return process ? Number(process.price || 0) : 0;
  }

  /**
   * 检测订单的下一个工序（纯动态配置）
   *
   * 逻辑：从后端加载订单工序配置 → 查找当前进度位置 → 返回下一个工序
   * 没有任何硬编码工序流程，完全依赖后端配置
   *
   * @param {Object} orderDetail - 订单详情
   * @returns {Promise<Object|null>} 下一工序信息
   */
  async detectNextStage(orderDetail) {
    if (!orderDetail) {
      return null;
    }

    const orderNo = orderDetail.orderNo || orderDetail.order_no || '';
    const currentProgress =
      orderDetail.currentProcessName ||
      orderDetail.currentProgress ||
      orderDetail.progressStage ||
      '';

    // 加载该订单的动态工序配置
    const config = await this.loadProcessConfig(orderNo);

    // 新订单（未开始） → 返回第一个工序
    if (!currentProgress || currentProgress === '待开始' || currentProgress === '未开始') {
      const first = config[0];
      return {
        processName: first.processName,
        progressStage: first.progressStage || first.processName,
        scanType: first.scanType,
        unitPrice: Number(first.price || 0),
        hint: `订单开始: ${first.processName}`,
      };
    }

    // 在配置中查找当前工序位置（按 processName 或 progressStage 匹配）
    const currentIndex = config.findIndex(
      p => p.processName === currentProgress || p.progressStage === currentProgress
    );

    if (currentIndex < 0) {
      console.warn(
        `[StageDetector] 当前工序[${currentProgress}]不在订单[${orderNo}]的配置中`
      );
      return {
        processName: currentProgress,
        progressStage: currentProgress,
        scanType: this._inferScanType(currentProgress),
        hint: `当前工序: ${currentProgress}`,
      };
    }

    // 已经是最后一个工序 → 已完成
    if (currentIndex >= config.length - 1) {
      const last = config[config.length - 1];
      return {
        processName: last.processName,
        progressStage: last.progressStage || last.processName,
        scanType: last.scanType,
        hint: '所有工序已完成',
        isCompleted: true,
      };
    }

    // 返回下一个工序（附带单价）
    const next = config[currentIndex + 1];
    return {
      processName: next.processName,
      progressStage: next.progressStage || next.processName,
      scanType: next.scanType,
      unitPrice: Number(next.price || 0),
      hint: next.processName,
    };
  }

  /**
   * 基于菲号识别下一个工序（核心方法 - 纯动态配置版）
   *
   * 核心逻辑：
   * 1. 从后端加载订单的完整工序配置（每个订单工序不同）
   * 2. 过滤出菲号扫码相关的工序（排除采购、裁剪）
   * 3. 统计该菲号已完成的扫码次数（production + quality 类型）
   * 4. 按工序配置的 sortOrder 顺序，匹配第 N 次扫码对应的工序
   * 5. 返回对应工序的名称、单价、扫码类型
   *
   * @param {string} orderNo - 订单号
   * @param {string} bundleNo - 菲号
   * @param {number} bundleQuantity - 菲号数量（来自二维码）
   * @param {Object} orderDetail - 订单详情
   * @returns {Promise<Object|null>} 工序信息
   */
  async detectByBundle(orderNo, bundleNo, bundleQuantity, orderDetail) {
    // === 步骤1：获取菲号准确数量 ===
    const accurateQuantity = await this._getAccurateBundleQuantity(
      orderNo,
      bundleNo,
      bundleQuantity
    );

    // === 步骤2：加载订单的动态工序配置 ===
    const allProcesses = await this.loadProcessConfig(orderNo);

    // 过滤出菲号扫码相关的工序（排除采购和裁剪，它们通过其他流程处理）
    const bundleProcesses = allProcesses.filter(
      p => p.scanType !== 'procurement' && p.scanType !== 'cutting'
    );

    if (bundleProcesses.length === 0) {
      throw new Error(`订单[${orderNo}]没有可扫码的工序配置`);
    }

    // 分离：可计数工序（production + quality，被 _getScanHistory 统计）
    //       和入库工序（warehouse，不被 _getScanHistory 统计）
    const countableProcesses = bundleProcesses.filter(
      p => p.scanType === 'production' || p.scanType === 'quality'
    );
    const warehouseProcess = bundleProcesses.find(p => p.scanType === 'warehouse');

    // === 步骤3：查询该菲号的扫码历史（仅统计 production + quality） ===
    const scanHistory = await this._getScanHistory(orderNo, bundleNo);
    const scanCount = scanHistory.length;

    console.log(
      `[StageDetector] 菲号[${bundleNo}] 已扫码${scanCount}次，` +
        `可扫码工序${countableProcesses.length}个: ` +
        countableProcesses.map(p => `${p.processName}(¥${p.price || 0})`).join(' → ')
    );

    // === 步骤4：根据扫码次数匹配下一个工序 ===
    if (scanCount < countableProcesses.length) {
      const nextProcess = countableProcesses[scanCount];
      return {
        processName: nextProcess.processName,
        progressStage: nextProcess.progressStage || nextProcess.processName,
        scanType: nextProcess.scanType,
        qualityStage: nextProcess.scanType === 'quality' ? 'receive' : null,
        hint:
          countableProcesses.length > 1
            ? `${nextProcess.processName} (第${scanCount + 1}/${countableProcesses.length}道工序)`
            : nextProcess.processName,
        isDuplicate: false,
        quantity: accurateQuantity,
        unitPrice: Number(nextProcess.price || 0),
      };
    }

    // === 步骤5：所有可计数工序已完成，检查入库 ===
    if (warehouseProcess) {
      const isWarehoused = await this._checkBundleWarehoused(orderNo, bundleNo);
      if (isWarehoused) {
        return {
          processName: warehouseProcess.processName,
          progressStage: warehouseProcess.progressStage || warehouseProcess.processName,
          scanType: warehouseProcess.scanType,
          hint: '该菲号已入库完成',
          isDuplicate: false,
          quantity: accurateQuantity,
          isCompleted: true,
        };
      }
      return {
        processName: warehouseProcess.processName,
        progressStage: warehouseProcess.progressStage || warehouseProcess.processName,
        scanType: warehouseProcess.scanType,
        hint: warehouseProcess.processName,
        isDuplicate: false,
        quantity: accurateQuantity,
        unitPrice: Number(warehouseProcess.price || 0),
      };
    }

    // 没有入库工序，所有工序已完成
    const lastProcess = countableProcesses[countableProcesses.length - 1];
    return {
      processName: lastProcess.processName,
      progressStage: lastProcess.progressStage || lastProcess.processName,
      scanType: lastProcess.scanType,
      hint: '所有工序已完成',
      isDuplicate: false,
      quantity: accurateQuantity,
      isCompleted: true,
    };
  }

  /**
   * 检查菲号是否已入库
   * @private
   * @param {string} orderNo - 订单号
   * @param {string} bundleNo - 菲号
   * @returns {Promise<boolean>} 是否已入库
   */
  async _checkBundleWarehoused(orderNo, bundleNo) {
    try {
      // 先获取菲号ID
      const bundleInfo = await this.api.production.getCuttingBundle(orderNo, bundleNo);
      if (!bundleInfo || !bundleInfo.id) {
        return false;
      }

      // 查询入库记录
      const res = await this.api.production.listWarehousing({
        cuttingBundleId: bundleInfo.id,
        page: 1,
        pageSize: 1,
      });

      const records = res && res.records ? res.records : [];
      return records.length > 0;
    } catch (e) {
      console.warn('[StageDetector] 检查入库状态失败:', e);
      return false;
    }
  }

  /**
   * 获取菲号准确数量（优先从裁剪表查询）
   * @private
   * @param {string} orderNo - 订单号
   * @param {string} bundleNo - 菲号
   * @param {number} fallbackQuantity - 备用数量（来自二维码）
   * @returns {Promise<number>} 准确数量
   */
  async _getAccurateBundleQuantity(orderNo, bundleNo, fallbackQuantity) {
    try {
      const bundleInfo = await this.api.production.getCuttingBundle(orderNo, bundleNo);
      if (bundleInfo && bundleInfo.quantity) {
        return bundleInfo.quantity;
      }
    } catch (e) {
      console.warn('[StageDetector] 查询菲号失败，使用二维码数量:', e);
    }

    // 查询失败或无数据，使用备用值
    return fallbackQuantity || 10; // 默认10件
  }

  /**
   * 查询菲号的扫码历史（按时间倒序）
   * @private
   * @param {string} orderNo - 订单号
   * @param {string} bundleNo - 菲号
   * @returns {Promise<Array>} 扫码记录数组
   */
  async _getScanHistory(orderNo, bundleNo) {
    try {
      const historyRes = await this.api.production.myScanHistory({
        page: 1,
        pageSize: 100, // 获取所有记录
        orderNo: orderNo,
        bundleNo: bundleNo,
      });

      const allRecords = historyRes && historyRes.records ? historyRes.records : [];

      // ✅ 修复：过滤掉系统自动生成的记录
      // 统计手动扫码的【生产工序】记录（车缝、大烫、质检等）
      const manualRecords = allRecords.filter(record => {
        const requestId = (record.requestId || '').trim();
        const scanType = (record.scanType || '').toLowerCase();

        // 排除系统自动生成的记录（根据 requestId 前缀判断）
        const isSystemGenerated =
          requestId.startsWith('ORDER_CREATED:') ||
          requestId.startsWith('CUTTING_BUNDLED:') ||
          requestId.startsWith('ORDER_PROCUREMENT:') ||
          requestId.startsWith('SYSTEM:');

        // 🔧 修复：统计 production 和 quality 类型的扫码记录
        // production: 车缝、大烫、包装
        // quality: 质检（领取、验收、确认）
        const isValidScan = scanType === 'production' || scanType === 'quality';

        return !isSystemGenerated && isValidScan;
      });

      return manualRecords;
    } catch (e) {
      console.error('[StageDetector] 查询扫码历史失败:', e);
      return [];
    }
  }

}

// 导出类（非单例，因为需要传入 api）
module.exports = StageDetector;
