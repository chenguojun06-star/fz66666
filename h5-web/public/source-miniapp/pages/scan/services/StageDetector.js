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

var shared = require('../../shared/stageDetection');
var inferScanType = shared.inferScanType;
var parseDefectQtyFromRemark = shared.parseDefectQtyFromRemark;
var extractQualityMeta = shared.extractQualityMeta;
var SCAN_TYPE_RULES = shared.SCAN_TYPE_RULES;
var VALID_SCAN_TYPES = shared.VALID_SCAN_TYPES;
var DEFAULT_SCAN_TYPE = shared.DEFAULT_SCAN_TYPE;

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

    // 缓存有效期：60秒（PC端刷新单价后，最多1分钟小程序新扫码就能使用最新价格）
    // 注：历史扫码记录的工资金额由后端 syncUnitPrices 统一回填
    this.CACHE_TTL = 60 * 1000;

    // scanType 推断规则（根据 progressStage 或 processName 推断扫码类型）
    // ⚠️ 这套规则仅作兜底，后端 /process-config 接口现在已统一返回 scanType
    // 工序名称到 scanType 的映射规则
    this.scanTypeRules = SCAN_TYPE_RULES;
    // 合法的 scanType 集合（用于校验后端返回值）
    this.VALID_SCAN_TYPES = VALID_SCAN_TYPES;
    // 默认 scanType（不在上述规则中的工序）
    this.defaultScanType = DEFAULT_SCAN_TYPE;
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
      .sort((a, b) => {
        const sa = a.sortOrder || 0;
        const sb = b.sortOrder || 0;
        if (sa !== sb) return sa - sb;
        const ia = parseInt(String(a.id || '').replace(/\D/g, ''), 10) || 0;
        const ib = parseInt(String(b.id || '').replace(/\D/g, ''), 10) || 0;
        if (ia && ib && ia !== ib) return ia - ib;
        return 0;
      })
      .map(p => ({
        ...p,
        // 优先使用后端已计算的 scanType，无则就地推断
        scanType: this._inferScanType(p.processName, p.progressStage, p.scanType),
      }));

    this.processConfigCache.set(orderNo, { config: sorted, timestamp: Date.now() });
    return sorted;
  }

  /**
   * 根据工序名称/进度阶段推断 scanType
   * @param {string} processName - 工序名
   * @param {string} [progressStage] - 父进度阶段
   * @param {string} [backendScanType] - 后端已返回的 scanType（如有则直接使用）
   * @private
   */
  _inferScanType(processName, progressStage, backendScanType) {
    return inferScanType(processName, progressStage, backendScanType);
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
      // 历史 bug：此处曾软兼容返回推断工序，导致当工序名与配置不匹配时误展示错误工序页面。
      throw new Error(`当前工序「${currentProgress}」不在订单[${orderNo}]的工序配置中，请在PC端检查工序模板配置`);
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
    const _warehouseProcess = bundleProcesses.find(p => p.scanType === 'warehouse');
    const countableProcesses = bundleProcesses.filter(p => p.scanType !== 'warehouse');

    // === 步骤3：查询该菲号的扫码历史（仅统计 production + quality 的成功记录） ===
    const scanHistory = await this._getScanHistory(orderNo, bundleNo);

    // === 步骤3.5：预判质检完成状态 ===
    const qualityProcess = countableProcesses.find(p => p.scanType === 'quality');
    let precomputedQualityStage = '';
    let qualityIsFullyDone = false;
    if (qualityProcess) {
      let bundleStatus = '';
      try {
        const bundleInfo = await this.api.production.getCuttingBundle(orderNo, bundleNo);
        bundleStatus = (bundleInfo && bundleInfo.status) ? bundleInfo.status : '';
      } catch (e) {
        console.warn('[StageDetector] 获取菲号状态失败，跳过返修质检判断:', e);
      }
      const hasAnyQualityScan = scanHistory.some(r => (r.scanType || '').toLowerCase() === 'quality');
      if (hasAnyQualityScan || bundleStatus === 'repaired_waiting_qc') {
        precomputedQualityStage = await this._inferQualityStage(orderNo, scanHistory, bundleStatus);
        qualityIsFullyDone = precomputedQualityStage === 'done';
      } else {
        precomputedQualityStage = 'receive';
      }
    }

    const scannedProcessNames = new Set(
      scanHistory
        .map(r => r.processName)
        .filter(name => {
          if (!name) return false;
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

      let qualityStage = '';
      if (nextProcess.scanType === 'quality') {
        qualityStage = precomputedQualityStage || 'receive';
        if (!qualityStage) qualityStage = 'receive';
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
          if (_warehouseProcess) {
            const qualityMeta = this._extractQualityMeta(scanHistory, accurateQuantity);
            const whResult = await this._checkBundleWarehoused(orderNo, bundleNo, qualityMeta.expectedQty);
            if (!whResult.isComplete) {
              const totalQty = qualityMeta.expectedQty || accurateQuantity;
              const defects = qualityMeta.defectQty || 0;
              const qualifiedTarget = qualityMeta.isUnqualified ? Math.max(0, totalQty - defects) : totalQty;
              const qualifiedPending = Math.max(0, qualifiedTarget - whResult.warehousedQty);

              if (qualifiedPending > 0) {
                return {
                  processName: _warehouseProcess.processName,
                  progressStage: _warehouseProcess.progressStage || _warehouseProcess.processName,
                  scanType: 'warehouse',
                  hint: qualityMeta.isUnqualified
                    ? `${_warehouseProcess.processName}（合格 ${qualifiedPending}件）`
                    : _warehouseProcess.processName,
                  isDuplicate: false,
                  quantity: qualifiedPending,
                  unitPrice: Number(_warehouseProcess.price || 0),
                  qualityStage: '',
                  isDefectiveReentry: false,
                  scannedProcessNames: [...scannedProcessNames],
                  allBundleProcesses: bundleProcesses,
                };
              }

              if (qualityMeta.isUnqualified && defects > 0 && !qualityMeta.isScrap) {
                return {
                  processName: _warehouseProcess.processName,
                  progressStage: _warehouseProcess.progressStage || _warehouseProcess.processName,
                  scanType: 'warehouse',
                  hint: `次品入库 ${defects}件`,
                  isDuplicate: false,
                  quantity: defects,
                  unitPrice: Number(_warehouseProcess.price || 0),
                  qualityStage: '',
                  isDefectiveReentry: true,
                  defectQty: defects,
                  defectRemark: qualityMeta.defectRemark,
                  scannedProcessNames: [...scannedProcessNames],
                  allBundleProcesses: bundleProcesses,
                };
              }

              return {
                processName: _warehouseProcess.processName,
                progressStage: _warehouseProcess.progressStage || _warehouseProcess.processName,
                scanType: 'warehouse',
                hint: _warehouseProcess.processName,
                isDuplicate: false,
                quantity: Math.max(1, totalQty - whResult.warehousedQty),
                unitPrice: Number(_warehouseProcess.price || 0),
                qualityStage: '',
                isDefectiveReentry: false,
                scannedProcessNames: [...scannedProcessNames],
                allBundleProcesses: bundleProcesses,
              };
            }
          }
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
        qualityStage,
        scannedProcessNames: [...scannedProcessNames],
        allBundleProcesses: bundleProcesses,
      };
    }

    // === 步骤5：所有可计数工序已完成 → 检查是否有入库环节 ===
    if (_warehouseProcess) {
      const qualityMeta = this._extractQualityMeta(scanHistory, accurateQuantity);
      const whResult = await this._checkBundleWarehoused(orderNo, bundleNo, qualityMeta.expectedQty);
      if (!whResult.isComplete) {
        const totalQty = qualityMeta.expectedQty || accurateQuantity;
        const defects = qualityMeta.defectQty || 0;
        const qualifiedTarget = qualityMeta.isUnqualified ? Math.max(0, totalQty - defects) : totalQty;
        const qualifiedPending = Math.max(0, qualifiedTarget - whResult.warehousedQty);

        if (qualifiedPending > 0) {
          return {
            processName: _warehouseProcess.processName,
            progressStage: _warehouseProcess.progressStage || _warehouseProcess.processName,
            scanType: 'warehouse',
            hint: qualityMeta.isUnqualified
              ? `${_warehouseProcess.processName}（合格 ${qualifiedPending}件）`
              : _warehouseProcess.processName,
            isDuplicate: false,
            quantity: qualifiedPending,
            unitPrice: Number(_warehouseProcess.price || 0),
            qualityStage: '',
            isDefectiveReentry: false,
            scannedProcessNames: [...scannedProcessNames],
            allBundleProcesses: bundleProcesses,
          };
        }

        if (qualityMeta.isUnqualified && defects > 0 && !qualityMeta.isScrap) {
          return {
            processName: _warehouseProcess.processName,
            progressStage: _warehouseProcess.progressStage || _warehouseProcess.processName,
            scanType: 'warehouse',
            hint: `次品入库 ${defects}件`,
            isDuplicate: false,
            quantity: defects,
            unitPrice: Number(_warehouseProcess.price || 0),
            qualityStage: '',
            isDefectiveReentry: true,
            defectQty: defects,
            defectRemark: qualityMeta.defectRemark,
            scannedProcessNames: [...scannedProcessNames],
            allBundleProcesses: bundleProcesses,
          };
        }

        return {
          processName: _warehouseProcess.processName,
          progressStage: _warehouseProcess.progressStage || _warehouseProcess.processName,
          scanType: 'warehouse',
          hint: _warehouseProcess.processName,
          isDuplicate: false,
          quantity: Math.max(1, totalQty - whResult.warehousedQty),
          unitPrice: Number(_warehouseProcess.price || 0),
          qualityStage: '',
          isDefectiveReentry: false,
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
   */
  async _checkBundleWarehoused(orderNo, bundleNo, expectedQuantity) {
    const EMPTY = { isComplete: false, warehousedQty: 0 };
    try {
      const bundleInfo = await this.api.production.getCuttingBundle(orderNo, bundleNo);
      if (!bundleInfo || !bundleInfo.id) {
        return EMPTY;
      }

      const fallbackQty = Number(bundleInfo.quantity || 0) || 0;
      const targetQty = Number(expectedQuantity || 0) > 0
        ? Number(expectedQuantity || 0)
        : fallbackQty;

      const pageSize = 200;
      const maxPages = 50;
      let page = 1;
      let hasAnyRecord = false;
      let warehousedQty = 0;

      while (page <= maxPages) {
        const res = await this.api.production.listWarehousing({
          cuttingBundleId: bundleInfo.id,
          page,
          pageSize,
        });

        const records = res && res.records ? res.records : [];
        if (!records.length) {
          break;
        }

        hasAnyRecord = true;
        const pageQty = records.reduce((sum, item) => {
          if (item && (item.warehousingType === 'quality_scan' || item.warehousingType === 'quality_scan_scrap' || item.warehousingType === 'repair_return')) return sum;
          const qualified = Number(item && item.qualifiedQuantity);
          if (!Number.isNaN(qualified) && qualified > 0) {
            return sum + qualified;
          }
          const total = Number(item && item.warehousingQuantity);
          if (!Number.isNaN(total) && total > 0) {
            return sum + total;
          }
          return sum;
        }, 0);
        warehousedQty += pageQty;

        if (targetQty > 0 && warehousedQty >= targetQty) {
          return { isComplete: true, warehousedQty };
        }

        if (records.length < pageSize) {
          break;
        }
        page += 1;
      }

      if (!hasAnyRecord) {
        return EMPTY;
      }

      if (!(targetQty > 0)) {
        return { isComplete: warehousedQty > 0, warehousedQty };
      }
      return { isComplete: warehousedQty >= targetQty, warehousedQty };
    } catch (e) {
      console.warn('[StageDetector] 检查入库状态失败:', e);
      return EMPTY;
    }
  }

  /**
   * 获取菲号准确数量（优先从裁剪表查询）
   * @private
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

    return fallbackQuantity || 10;
  }

  /**
   * 根据质检扫码历史推断当前应执行的质检子阶段
   * @private
   */
  async _inferQualityStage(orderNo, scanHistory, bundleStatus) {
    try {
      if (bundleStatus === 'repaired_waiting_qc') {
        const receiveRecords = (scanHistory || []).filter(r => {
          const scanType = (r.scanType || '').toLowerCase();
          return scanType === 'quality' && r.processCode === 'quality_receive';
        });
        const hasNewUnconfirmed = receiveRecords.some(r => !r.confirmTime);
        if (hasNewUnconfirmed) {
          return 'confirm';
        }
        return 'receive';
      }

      const qualityRecords = scanHistory.filter(r => {
        const scanType = (r.scanType || '').toLowerCase();
        return scanType === 'quality';
      });

      const receiveRecords = qualityRecords.filter(r => r.processCode === 'quality_receive');

      if (!receiveRecords.length) {
        return 'receive';
      }

      if (receiveRecords.some(r => !!r.confirmTime)) {
        return 'done';
      }

      return 'confirm';
    } catch (e) {
      console.warn('[StageDetector] 推断质检阶段失败，默认 receive:', e);
      return 'receive';
    }
  }

  _extractQualityMeta(scanHistory, fallbackQty) {
    return extractQualityMeta(scanHistory, fallbackQty);
  }

  /**
   * 查询菲号的扫码历史（所有用户，不仅当前用户）
   * @private
   */
  async _getScanHistory(orderNo, bundleNo) {
    var allRecords = [];
    var page = 1;
    var pageSize = 200;
    var maxPages = 5;
    while (page <= maxPages) {
      var historyRes = await this.api.production.listScans({
        page: page,
        pageSize: pageSize,
        orderNo: orderNo,
        bundleNo: bundleNo,
      });
      var records = historyRes && historyRes.records ? historyRes.records : [];
      if (records.length === 0) break;
      allRecords = allRecords.concat(records);
      if (records.length < pageSize) break;
      page++;
    }

    var manualRecords = allRecords.filter(function(record) {
      var requestId = (record.requestId || '').trim();
      var scanType = (record.scanType || '').toLowerCase();

      var isSystemGenerated =
        requestId.startsWith('ORDER_CREATED:') ||
        requestId.startsWith('CUTTING_BUNDLED:') ||
        requestId.startsWith('ORDER_PROCUREMENT:') ||
        requestId.startsWith('WAREHOUSING:') ||
        requestId.startsWith('SYSTEM:');

      var isValidScan = scanType === 'production' || scanType === 'quality' || scanType === 'cutting' || scanType === 'warehouse';
      var isSuccess = record.scanResult === 'success';

      return !isSystemGenerated && isValidScan && isSuccess;
    });

    return manualRecords;
  }

}

// 导出类（非单例，因为需要传入 api）
module.exports = StageDetector;
