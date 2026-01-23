/**
 * 工序检测服务
 * 
 * 功能：
 * 1. 根据订单当前进度自动识别下一个工序节点
 * 2. 基于菲号扫码次数智能判断当前应该执行的车缝工序
 * 3. 防重复扫码保护（动态计算最小间隔时间）
 * 4. 支持从订单工艺模板动态读取工序列表和时间配置
 * 
 * 核心逻辑：
 * - 订单级别：按照 采购→裁剪→车缝→大烫→质检→包装→入库 流程判断
 * - 菲号级别：根据扫码次数匹配工序列表中的第N个工序
 * - 防重复：最小间隔 = max(30秒, 菲号数量 × 工序分钟 × 60 × 50%)
 * 
 * 使用示例：
 * const detector = new StageDetector(api);
 * const result = await detector.detectByBundle('PO001', 'bundle01', 50, orderDetail);
 * // result: { processName, progressStage, scanType, hint, isDuplicate }
 * 
 * @author GitHub Copilot
 * @date 2026-01-23
 */

class StageDetector {
  /**
   * 构造函数
   * @param {Object} api - API 服务对象（用于查询扫码记录和菲号信息）
   */
  constructor(api) {
    this.api = api;
    
    // 生产流程标准顺序（订单级别）
    this.stageSequence = [
      '采购',      // 0 - 物料采购
      '裁剪',      // 1 - 裁剪布料、生成菲号
      '车缝',      // 2 - 车缝（原缝制已合并）
      '大烫',      // 3 - 熨烫定型
      '质检',      // 4 - 质量检验
      '包装',      // 5 - 包装
      '入库'       // 6 - 入库
    ];

    // 车缝子工序列表（当订单未配置工艺模板时使用）
    this.defaultSewingProcesses = ['车缝'];  // 默认整件车缝

    // 车缝相关子工序关键词（用于识别）
    this.sewingSubProcessKeywords = [
      '钉扣', '锁边', '压线', '上拉链', '钉标', 
      '打枣', '车线', '绷缝', '缝骨', '包边'
    ];

    // 工序类型映射
    this.stageMapping = {
      '采购': { processName: '采购', progressStage: '采购', scanType: 'procurement' },
      '裁剪': { processName: '裁剪', progressStage: '裁剪', scanType: 'cutting' },
      '缝制': { processName: '缝制', progressStage: '缝制', scanType: 'sewing' },
      '车缝': { processName: '车缝', progressStage: '车缝', scanType: 'production' },
      '大烫': { processName: '大烫', progressStage: '大烫', scanType: 'production' },
      '质检': { processName: '质检', progressStage: '质检', scanType: 'quality' },
      '包装': { processName: '包装', progressStage: '包装', scanType: 'production' },
      '入库': { processName: '入库', progressStage: '入库', scanType: 'warehouse' },
    };
  }

  /**
   * 根据订单当前进度自动识别下一个工序节点
   * 
   * 特别处理：
   * - 新订单且物料未到齐：返回"采购"
   * - 新订单且物料已到齐：返回"裁剪"
   * - 裁剪完成（有菲号）：返回"车缝"
   * - 车缝子工序：继续车缝直到全部完成
   * - 已入库：提示已完成
   * 
   * @param {Object} orderDetail - 订单详情对象
   * @param {string} orderDetail.currentProcessName - 当前工序名称
   * @param {number} orderDetail.productionProgress - 生产进度百分比
   * @param {number} orderDetail.materialArrivalRate - 物料到货率
   * @param {number} orderDetail.cuttingBundleCount - 裁剪菲号数量
   * @param {Array} orderDetail.progressNodeUnitPrices - 工艺模板（可选）
   * @returns {Object|null} 下一工序信息或null
   * @returns {string} result.processName - 工序名称
   * @returns {string} result.progressStage - 工序阶段
   * @returns {string} result.scanType - 扫码类型
   * @returns {string} result.hint - 提示信息（可选）
   */
  detectNextStage(orderDetail) {
    if (!orderDetail) return null;

    // 获取订单当前进度
    const currentProgress = orderDetail.currentProcessName || 
                           orderDetail.currentProgress || 
                           orderDetail.progressStage || '';

    // 检查是否有裁剪菲号（标志裁剪已完成）
    const hasCuttingBundles = (orderDetail.cuttingBundleCount || 0) > 0 || 
                             (orderDetail.bundleCount || 0) > 0;

    // === 特殊情况1：新订单（未开始或待开始）===
    if (!currentProgress || currentProgress === '待开始' || currentProgress === '未开始') {
      return this._handleNewOrder(orderDetail, hasCuttingBundles);
    }

    // === 特殊情况2：裁剪阶段但已有菲号 ===
    if (currentProgress === '裁剪' && hasCuttingBundles) {
      return {
        processName: '车缝',
        progressStage: '车缝',
        scanType: 'production',
        hint: '裁剪已完成，开始车缝'
      };
    }

    // === 特殊情况3：采购阶段 ===
    if (currentProgress === '采购') {
      return {
        processName: '采购',
        progressStage: '采购',
        scanType: 'procurement',
        hint: '采购阶段进行中'
      };
    }

    // === 特殊情况4：车缝阶段（包含子工序）===
    const isSewingSubProcess = this.sewingSubProcessKeywords.some(
      keyword => currentProgress.includes(keyword)
    );
    
    if (isSewingSubProcess || currentProgress === '车缝') {
      // 继续车缝，使用当前子工序名称
      return {
        processName: currentProgress,
        progressStage: '车缝',
        scanType: 'production',
        hint: '车缝阶段进行中，完成当前工序'
      };
    }

    // === 标准流程：根据当前进度查找下一节点 ===
    const currentIndex = this.stageSequence.indexOf(currentProgress);
    
    // 无法识别当前进度（可能是车缝子工序）
    if (currentIndex < 0) {
      return {
        processName: currentProgress,
        progressStage: '车缝',
        scanType: 'production'
      };
    }

    // 已经是最后一个节点（入库）
    if (currentIndex >= this.stageSequence.length - 1) {
      // 注意：这里不能直接调用 wx.showToast，应该在调用方处理
      return {
        processName: '入库',
        progressStage: '入库',
        scanType: 'warehouse',
        hint: '该订单已入库',
        isCompleted: true  // 标记为已完成
      };
    }

    // 返回下一个节点
    const nextStage = this.stageSequence[currentIndex + 1];
    return this.stageMapping[nextStage] || null;
  }

  /**
   * 处理新订单的工序判断
   * @private
   * @param {Object} orderDetail - 订单详情
   * @param {boolean} hasCuttingBundles - 是否有裁剪菲号
   * @returns {Object} 工序信息
   */
  _handleNewOrder(orderDetail, hasCuttingBundles) {
    const productionProgress = orderDetail.productionProgress || 0;
    const materialArrivalRate = orderDetail.materialArrivalRate || 0;

    // 情况1：已生成裁剪菲号 → 进入车缝
    if (hasCuttingBundles) {
      return {
        processName: '车缝',
        progressStage: '车缝',
        scanType: 'production',
        hint: '裁剪已完成，开始车缝'
      };
    }

    // 情况2：物料到货率100% → 进入裁剪
    if (materialArrivalRate >= 100) {
      return {
        processName: '裁剪',
        progressStage: '裁剪',
        scanType: 'cutting',
        hint: '物料已到齐，开始裁剪'
      };
    }

    // 情况3：有生产进度但物料未到齐 → 裁剪（可能是回流任务）
    if (productionProgress > 0) {
      return {
        processName: '裁剪',
        progressStage: '裁剪',
        scanType: 'cutting',
        hint: '继续裁剪任务'
      };
    }

    // 情况4：真正的新订单 → 从采购开始
    return {
      processName: '采购',
      progressStage: '采购',
      scanType: 'procurement',
      hint: '订单开始，进行采购'
    };
  }

  /**
   * 基于菲号识别下一个工序（核心方法）
   * 
   * 核心逻辑：
   * 1. 统计该菲号的扫码次数
   * 2. 根据次数匹配工序列表中的第N个工序
   * 3. 防重复检查：动态计算最小间隔时间
   * 
   * 防重复公式：
   * 最小间隔 = max(30秒, 菲号数量 × 工序预计分钟 × 60 × 50%)
   * 
   * @param {string} orderNo - 订单号
   * @param {string} bundleNo - 菲号
   * @param {number} bundleQuantity - 菲号数量（来自二维码）
   * @param {Object} orderDetail - 订单详情
   * @returns {Promise<Object|null>} 工序信息或null
   * @returns {string} result.processName - 工序名称
   * @returns {string} result.progressStage - 工序阶段
   * @returns {string} result.scanType - 扫码类型
   * @returns {string} result.hint - 提示信息
   * @returns {boolean} result.isDuplicate - 是否为重复扫码
   * @returns {number} result.quantity - 准确数量
   */
  async detectByBundle(orderNo, bundleNo, bundleQuantity, orderDetail) {
    try {
      // === 步骤1：获取菲号准确数量 ===
      const accurateQuantity = await this._getAccurateBundleQuantity(
        orderNo, 
        bundleNo, 
        bundleQuantity
      );

      // === 步骤2：查询该菲号的扫码历史 ===
      const scanHistory = await this._getScanHistory(orderNo, bundleNo);
      const scanCount = scanHistory.length;

      // === 步骤3：从订单获取车缝工序列表 ===
      const sewingProcessList = this._extractSewingProcesses(orderDetail);

      // === 步骤4：从订单获取工序时间配置 ===
      const processTimeConfig = this._extractProcessTimeConfig(orderDetail);

      // === 步骤5：防重复扫码检查 ===
      if (scanCount > 0) {
        const duplicateCheck = this._checkDuplicate(
          scanHistory[0],
          accurateQuantity,
          processTimeConfig
        );
        
        // duplicateCheck 为 null 表示不重复，为对象表示重复
        if (duplicateCheck && duplicateCheck.isDuplicate) {
          return duplicateCheck;
        }
      }

      // === 步骤6：根据扫码次数判断当前工序 ===
      return this._determineCurrentProcess(
        scanCount, 
        sewingProcessList, 
        accurateQuantity
      );

    } catch (e) {
      console.error('[StageDetector] 基于菲号识别进度失败:', e);
      return null;
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
    return fallbackQuantity || 10;  // 默认10件
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
        pageNum: 1,
        pageSize: 100,  // 获取所有记录
        orderNo: orderNo,
        bundleNo: bundleNo
      });

      return (historyRes && historyRes.records) ? historyRes.records : [];
    } catch (e) {
      console.error('[StageDetector] 查询扫码历史失败:', e);
      return [];
    }
  }

  /**
   * 从订单工艺模板中提取车缝工序列表
   * @private
   * @param {Object} orderDetail - 订单详情
   * @returns {Array<string>} 工序名称数组
   */
  _extractSewingProcesses(orderDetail) {
    if (!orderDetail || !orderDetail.progressNodeUnitPrices) {
      return [...this.defaultSewingProcesses];
    }

    const nodes = orderDetail.progressNodeUnitPrices;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return [...this.defaultSewingProcesses];
    }

    // 筛选车缝阶段的工序，按顺序排序
    const sewingProcesses = nodes
      .filter(node => node.progressStage === '车缝' || node.name === '车缝')
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(node => node.name)
      .filter(name => name && name.trim());

    // 如果没有配置，使用默认
    return sewingProcesses.length > 0 ? sewingProcesses : [...this.defaultSewingProcesses];
  }

  /**
   * 从订单工艺模板中提取工序时间配置
   * @private
   * @param {Object} orderDetail - 订单详情
   * @returns {Object} 时间配置对象 { '做领': 5, '上领': 3 } 单位：分钟
   */
  _extractProcessTimeConfig(orderDetail) {
    const config = {};

    if (!orderDetail || !orderDetail.progressNodeUnitPrices) {
      return config;
    }

    const nodes = orderDetail.progressNodeUnitPrices;
    if (!Array.isArray(nodes)) {
      return config;
    }

    // 提取每个工序的预计时间
    nodes.forEach(node => {
      const name = node.name || '';
      const minutes = node.estimatedMinutes || 0;
      if (name && minutes > 0) {
        config[name] = minutes;
      }
    });

    return config;
  }

  /**
   * 检查是否为重复扫码
   * 
   * 判断逻辑：
   * - 距离上次扫码时间 < 预期时间的50%，视为重复
   * - 预期时间 = 菲号数量 × 工序分钟 × 60秒
   * - 最小间隔30秒（保底）
   * 
   * @private
   * @param {Object} lastRecord - 最后一条扫码记录
   * @param {number} bundleQuantity - 菲号数量
   * @param {Object} processTimeConfig - 工序时间配置
   * @returns {Object|null} 重复检查结果，null表示不重复
   */
  _checkDuplicate(lastRecord, bundleQuantity, processTimeConfig) {
    const lastScanTime = lastRecord.scanTime || lastRecord.createTime;
    const lastProcessName = lastRecord.processName || '';
    const currentTime = Date.now();

    // 计算时间差（秒）
    let timeDiff = 999999;
    if (lastScanTime) {
      const lastTime = new Date(lastScanTime).getTime();
      timeDiff = (currentTime - lastTime) / 1000;
    }

    // 从配置获取该工序的预计时间，默认1分钟/件
    const configMinutesPerPiece = processTimeConfig[lastProcessName] || 1;
    const secondsPerPiece = configMinutesPerPiece * 60;
    const expectedTime = bundleQuantity * secondsPerPiece;

    // 最小间隔 = max(30秒, 预期时间的50%)
    const minIntervalTime = Math.max(30, expectedTime * 0.5);

    // 判断是否重复
    if (timeDiff < minIntervalTime) {
      const minutesAgo = Math.floor(timeDiff / 60);
      const secondsAgo = Math.floor(timeDiff % 60);
      const timeText = minutesAgo > 0
        ? `${minutesAgo}分${secondsAgo}秒前`
        : `${secondsAgo}秒前`;

      const expectedMinutes = Math.floor(expectedTime / 60);

      return {
        processName: lastProcessName,
        progressStage: '车缝',
        scanType: 'production',
        hint: `⚠️ ${bundleQuantity}件预计需${expectedMinutes}分钟，${timeText}已扫过`,
        isDuplicate: true,  // 标记为重复
        quantity: bundleQuantity
      };
    }

    // 不重复
    return null;
  }

  /**
   * 根据扫码次数判断当前应该执行的工序
   * @private
   * @param {number} scanCount - 扫码次数
   * @param {Array<string>} sewingProcessList - 车缝工序列表
   * @param {number} quantity - 菲号数量
   * @returns {Object} 工序信息
   */
  _determineCurrentProcess(scanCount, sewingProcessList, quantity) {
    // 还在车缝工序内
    if (scanCount < sewingProcessList.length) {
      const nextProcessName = sewingProcessList[scanCount];
      return {
        processName: nextProcessName,
        progressStage: '车缝',
        scanType: 'production',
        hint: `${nextProcessName} (第${scanCount + 1}/${sewingProcessList.length}次)`,
        isDuplicate: false,
        quantity: quantity
      };
    }

    // 车缝工序都完成了，进入下一阶段（大烫）
    return {
      processName: '大烫',
      progressStage: '大烫',
      scanType: 'production',
      hint: '车缝已完成',
      isDuplicate: false,
      quantity: quantity
    };
  }
}

// 导出类（非单例，因为需要传入 api）
module.exports = StageDetector;
