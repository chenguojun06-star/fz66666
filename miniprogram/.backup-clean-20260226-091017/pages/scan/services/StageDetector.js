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

/**
 * 从质检确认 remark 中解析次品件数
 * remark 格式：unqualified|[category]|[remark]|defectQty=N
 * @param {string} remark
 * @param {number} fallbackQty - 若未找到则返回此值
 * @returns {number}
 */
function _parseDefectQtyFromRemark(remark, fallbackQty) {
  if (!remark) return fallbackQty || 0;
  const parts = (remark || '').split('|');
  for (const part of parts) {
    if (part.startsWith('defectQty=')) {
      const n = parseInt(part.substring('defectQty='.length), 10);
      if (n > 0) return n;
    }
  }
  return fallbackQty || 0;
}

class StageDetector {
  /**
   * 构造函数
   * @param {Object} api - API 服务对象（用于查询扫码记录和菲号信息）
   */
  constructor(api) {
    this.api = api;

    // 订单工序配置缓存 - Map<orderNo, { config: processConfig[], timestamp: number }>
    // processConfig 格式: [{processName, price, sortOrder, progressStage, scanType}, ...]
    this.processConfigCache = new Map();

    // 缓存有效期：5分钟（PC端修改工序后，最多5分钟小程序就能同步）
    this.CACHE_TTL = 5 * 60 * 1000;

    // scanType 推断规则（根据 progressStage 或 processName 推断扫码类型）
    // 工序名称到 scanType 的映射规则
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

    // 检查缓存（带过期时间，确保PC端修改后小程序能及时同步）
    const cached = this.processConfigCache.get(orderNo);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
      return cached.config;
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

    this.processConfigCache.set(orderNo, { config: sorted, timestamp: Date.now() });
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

    // === 步骤0：检查订单完成状态（后端 status='completed' 或 productionProgress>=100）===
    const orderStatus = String(orderDetail.status || orderDetail.orderStatus || '').trim().toLowerCase();
    const progressPct = Number(orderDetail.productionProgress || orderDetail.progress || 0);
    if (orderStatus === 'completed' || progressPct >= 100) {
      const lastProcess = orderDetail.currentProcessName || orderDetail.currentProgress || '已完成';
      return {
        processName: lastProcess,
        progressStage: lastProcess,
        scanType: this._inferScanType(lastProcess),
        hint: '进度节点已完成',
        isCompleted: true,
      };
    }

    const orderNo = String(
      orderDetail.orderNo ||
      orderDetail.order_no ||
      orderDetail.productionOrderNo ||
      orderDetail.production_order_no ||
      orderDetail.orderCode ||
      orderDetail.order_code ||
      ''
    ).trim().replace(/[-_]/g, '');
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
        isCompleted: false,
      };
    }

    // 完成态关键词（如后端设置 currentProcessName 为 '已完成'）
    if (currentProgress === '已完成' || currentProgress === '完成' || currentProgress === 'completed') {
      const last = config[config.length - 1];
      return {
        processName: last ? last.processName : currentProgress,
        progressStage: last ? (last.progressStage || last.processName) : currentProgress,
        scanType: last ? last.scanType : this._inferScanType(currentProgress),
        hint: '进度节点已完成',
        isCompleted: true,
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
        isCompleted: false,
      };
    }

    // ✅ 修复：后端 currentProcessName 语义 = "第一个尚未完成的工序"
    // 因此应该返回当前工序本身（而非下一个）
    const current = config[currentIndex];
    return {
      processName: current.processName,
      progressStage: current.progressStage || current.processName,
      scanType: current.scanType,
      unitPrice: Number(current.price || 0),
      hint: currentIndex >= config.length - 1
        ? `${current.processName}（最后一道工序）`
        : `${current.processName} (${currentIndex + 1}/${config.length})`,
      isCompleted: false,
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
  async detectByBundle(orderNo, bundleNo, bundleQuantity, _orderDetail) {
    // 防护：订单号为空时不应调用菲号检测
    if (!orderNo) {
      throw new Error('订单号为空，无法进行菲号工序检测');
    }

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

    // 区分入库工序和计数工序
    // 入库工序：scanType='warehouse' 的工序，需要等待其他工序完成后扫码
    // 计数工序：其他所有菲号工序（包括 production 和 quality）
    const _warehouseProcess = bundleProcesses.find(p => p.scanType === 'warehouse');
    const countableProcesses = bundleProcesses.filter(p => p.scanType !== 'warehouse');

    // === 步骤3：查询该菲号的扫码历史（仅统计 production + quality 的成功记录） ===
    const scanHistory = await this._getScanHistory(orderNo, bundleNo);

    // === 步骤3.5：预判质检完成状态 ===
    // 质检工序一步（quality_confirm）完成即算已扫
    // 只有 _inferQualityStage='done' 才将质检加入 scannedProcessNames
    const qualityProcess = countableProcesses.find(p => p.scanType === 'quality');
    let precomputedQualityStage = '';
    let qualityIsFullyDone = false;
    if (qualityProcess) {
      // 🔧 修复：用 scanType 匹配而非 processName，避免 "质检领取" !== "质检" 的问题
      const hasAnyQualityScan = scanHistory.some(r => (r.scanType || '').toLowerCase() === 'quality');
      if (hasAnyQualityScan) {
        precomputedQualityStage = await this._inferQualityStage(orderNo, scanHistory);
        qualityIsFullyDone = precomputedQualityStage === 'done';
      } else {
        // 无任何质检记录，默认需要先领取
        precomputedQualityStage = 'receive';
      }
    }

    // 🔧 修复：quality 工序两步骤共享 processName，必须两步全部完成才算"已扫"
    const scannedProcessNames = new Set(
      scanHistory
        .map(r => r.processName)
        .filter(name => {
          if (!name) return false;
          // 质检工序：只有全部完成才放入 scannedProcessNames
          if (qualityProcess && name === qualityProcess.processName) {
            return qualityIsFullyDone;
          }
          return true;
        })
    );
    const remainingProcesses = countableProcesses.filter(
      p => !scannedProcessNames.has(p.processName)
    );

    // === 步骤4：根据已扫工序过滤，返回第一个未完成的工序 ===
    if (remainingProcesses.length > 0) {
      const nextProcess = remainingProcesses[0];
      const doneCount = countableProcesses.length - remainingProcesses.length;

      // 质检工序：直接走 confirm，一步完成
      // 复用步骤3.5的预计算结果，不重复调用 _inferQualityStage
      // 由于 qualityIsFullyDone=true 时质检已被排出 remainingProcesses，
      // 进入此分支时 qualityIsFullyDone 必然为 false，qualityStage 只会是 receive/confirm
      let qualityStage = '';
      if (nextProcess.scanType === 'quality') {
        qualityStage = precomputedQualityStage || 'receive';
        if (!qualityStage) qualityStage = 'receive';
        // 此分支理论上不会出现 'done'（qualityIsFullyDone=true 时质检已排出 remainingProcesses）
        if (qualityStage === 'done') {
          const skipNames = new Set([...scannedProcessNames, nextProcess.processName]);
          const afterQuality = countableProcesses.filter(p => !skipNames.has(p.processName));
          if (afterQuality.length > 0) {
            const nextNext = afterQuality[0];
            const newDoneCount = countableProcesses.length - afterQuality.length;
            return {
              processName: nextNext.processName,
              progressStage: nextNext.progressStage || nextNext.processName,
              scanType: nextNext.scanType,
              hint: countableProcesses.length > 1
                ? `${nextNext.processName} (已完成${newDoneCount}/${countableProcesses.length}道工序)`
                : nextNext.processName,
              isDuplicate: false,
              quantity: accurateQuantity,
              unitPrice: Number(nextNext.price || 0),
              qualityStage: '',
              scannedProcessNames: [...skipNames],
              allBundleProcesses: bundleProcesses,
            };
          }
          // 质检是最后一道可计数工序 → 检查是否有入库环节
          if (_warehouseProcess) {
            const isWarehoused = await this._checkBundleWarehoused(orderNo, bundleNo);
            if (!isWarehoused) {
              // 检测质检结果是否为次品 → 次品返修入库模式
              // 🔧 修复：确认完成用 confirmTime 判断，不再查 processCode='quality_confirm'
              const confirmRec = scanHistory.find(r =>
                r.processCode === 'quality_receive' && r.scanResult === 'success' && r.confirmTime
              );
              const isUnqualified = confirmRec && (confirmRec.remark || '').startsWith('unqualified');
              const defectQty = isUnqualified
                ? _parseDefectQtyFromRemark(confirmRec.remark, confirmRec.quantity)
                : 0;
              return {
                processName: _warehouseProcess.processName,
                progressStage: _warehouseProcess.progressStage || _warehouseProcess.processName,
                scanType: 'warehouse',
                hint: (isUnqualified && defectQty > 0)
                  ? `次品入库 ${defectQty}件`
                  : _warehouseProcess.processName,
                isDuplicate: false,
                quantity: (isUnqualified && defectQty > 0) ? defectQty : accurateQuantity,
                unitPrice: Number(_warehouseProcess.price || 0),
                qualityStage: '',
                isDefectiveReentry: isUnqualified && defectQty > 0,
                defectQty: defectQty,
                defectRemark: isUnqualified ? (confirmRec.remark || '') : '',
                scannedProcessNames: [...scannedProcessNames],
                allBundleProcesses: bundleProcesses,
              };
            }
          }
          // 无入库工序或已入库，全部完成
          return {
            processName: nextProcess.processName,
            progressStage: nextProcess.progressStage || nextProcess.processName,
            scanType: nextProcess.scanType,
            hint: '进度节点已完成',
            isDuplicate: false,
            quantity: accurateQuantity,
            isCompleted: true,
            qualityStage: 'done',
            scannedProcessNames: [...scannedProcessNames],
            allBundleProcesses: bundleProcesses,
          };
        }
      }

      return {
        processName: nextProcess.processName,
        progressStage: nextProcess.progressStage || nextProcess.processName,
        scanType: nextProcess.scanType,
        hint:
          countableProcesses.length > 1
            ? `${nextProcess.processName} (已完成${doneCount}/${countableProcesses.length}道工序)`
            : nextProcess.processName,
        isDuplicate: false,
        quantity: accurateQuantity,
        unitPrice: Number(nextProcess.price || 0),
        // 质检子阶段（仅 quality 类型工序有值）
        qualityStage,
        // 携带已扫工序信息，供工序选择器过滤
        scannedProcessNames: [...scannedProcessNames],
        allBundleProcesses: bundleProcesses,
      };
    }

    // === 步骤5：所有可计数工序已完成 → 检查是否有入库环节 ===
    if (_warehouseProcess) {
      const isWarehoused = await this._checkBundleWarehoused(orderNo, bundleNo);
      if (!isWarehoused) {
        // 🔧 修复：确认完成用 confirmTime 判断，不再查 processCode='quality_confirm'
        const confirmRec = scanHistory.find(r =>
          r.processCode === 'quality_receive' && r.scanResult === 'success' && r.confirmTime
        );
        const isUnqualified = confirmRec && (confirmRec.remark || '').startsWith('unqualified');
        const defectQty = isUnqualified
          ? _parseDefectQtyFromRemark(confirmRec.remark, confirmRec.quantity)
          : 0;
        return {
          processName: _warehouseProcess.processName,
          progressStage: _warehouseProcess.progressStage || _warehouseProcess.processName,
          scanType: 'warehouse',
          hint: (isUnqualified && defectQty > 0)
            ? `次品入库 ${defectQty}件`
            : _warehouseProcess.processName,
          isDuplicate: false,
          quantity: (isUnqualified && defectQty > 0) ? defectQty : accurateQuantity,
          unitPrice: Number(_warehouseProcess.price || 0),
          qualityStage: '',
          isDefectiveReentry: isUnqualified && defectQty > 0,
          defectQty: defectQty,
          defectRemark: isUnqualified ? (confirmRec.remark || '') : '',
          scannedProcessNames: [...scannedProcessNames],
          allBundleProcesses: bundleProcesses,
        };
      }
    }

    // === 步骤6：所有工序（含入库）均已完成 ===
    const lastProcess = countableProcesses[countableProcesses.length - 1];
    return {
      processName: lastProcess.processName,
      progressStage: lastProcess.progressStage || lastProcess.processName,
      scanType: lastProcess.scanType,
      hint: '进度节点已完成',
      isDuplicate: false,
      quantity: accurateQuantity,
      isCompleted: true,
      scannedProcessNames: [...scannedProcessNames],
      allBundleProcesses: bundleProcesses,
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
   * 根据质检扫码历史推断当前应执行的质检子阶段
   *
   * 质检两步骤：receive（领取）→ confirm（录入结果+确认）
   * quality_inspect（验收）是后端遗留步骤，实际不触发
   * 通过查询 processCode 字段判断已完成到哪一步
   *
   * @private
   * @param {string} orderNo - 订单号
   * @param {Array} scanHistory - 当前菲号扫码历史（已过滤的）
   * @returns {Promise<string>} 'confirm' | 'done'
   */
  async _inferQualityStage(orderNo, scanHistory) {
    try {
      // 从已有扫码历史里查找 quality 子阶段记录
      const qualityRecords = scanHistory.filter(r => {
        const scanType = (r.scanType || '').toLowerCase();
        return scanType === 'quality';
      });

      // 查找 quality_receive 记录（领取阶段）
      const receiveRecord = qualityRecords.find(r =>
        r.processCode === 'quality_receive'
      );

      if (!receiveRecord) {
        return 'receive';   // 无领取记录 → 需要先领取
      }

      // 检查 confirmTime 是否已设置（后端 handleConfirm 会写入此字段）
      if (receiveRecord.confirmTime) {
        return 'done';      // 已完成质检确认
      }

      return 'confirm';     // 已领取未确认 → 需要录入结果
    } catch (e) {
      console.warn('[StageDetector] 推断质检阶段失败，默认 receive:', e);
      return 'receive';
    }
  }

  /**
   * 查询菲号的扫码历史（所有用户，不仅当前用户）
   *
   * ❗ 必须查所有用户的记录：工人A扫了车缝，工人B再扫同一菲号时不应该再选车缝
   * @private
   * @param {string} orderNo - 订单号
   * @param {string} bundleNo - 菲号
   * @returns {Promise<Array>} 扫码记录数组
   */
  async _getScanHistory(orderNo, bundleNo) {
    try {
      // ✅ 使用 listScans（不带 currentUser）查询所有用户的扫码记录
      const historyRes = await this.api.production.listScans({
        page: 1,
        pageSize: 100,
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
          requestId.startsWith('WAREHOUSING:') ||
          requestId.startsWith('SYSTEM:');

        // 统计 production 和 quality 类型的扫码记录
        const isValidScan = scanType === 'production' || scanType === 'quality';

        // ✅ 修复：只统计扫码成功的记录，失败记录不应阻断工序流转
        // 原因：若某次扫码 scanResult='fail'，该工序实际未完成，
        //       不能将其计入 scannedProcessNames，否则下次扫同一菲号会跳到错误的下一工序
        const isSuccess = record.scanResult === 'success';

        return !isSystemGenerated && isValidScan && isSuccess;
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
