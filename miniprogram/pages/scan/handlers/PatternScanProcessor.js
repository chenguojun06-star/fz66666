/**
 * 样板生产扫码处理器（样衣独立逻辑）
 *
 * 样衣流程与大货共享同一套父子工序模型：
 * - 父工序顺序：采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库
 * - 样衣开发：BOM → 纸样 → 单价 → 二次工艺 → 生产制单（PC端配置）
 * - 样衣生产：由PC端配置的工序驱动，支持动态工序
 * - 使用 patternId 识别（不使用菲号）
 * - 一个样衣一个二维码，父子关系在PC端配置
 * - 门禁校验：与后端 ProductionScanStageSupport 对齐
 *
 * @author GitHub Copilot
 * @date 2026-05-31
 */

var stageDetection = require('../../../shared/stageDetection');

/**
 * 规范化 patternId：从多种格式中提取真正的样衣 ID
 * 防御性清洗：无论入口传什么，都确保拿到纯 id，避免后端 400
 *
 * 支持格式：
 * 1. 纯 id：'2068567491605024769'
 * 2. JSON 字符串：'{"type":"pattern","id":"2068567491605024769"}'
 * 3. URL 参数：'?type=pattern&patternId=xxx' 或 'xxx?patternId=yyy'
 * 4. 带 pattern 前缀：'pattern:2068567491605024769'
 */
function normalizePatternId(patternId) {
  if (!patternId) return '';
  const s = String(patternId).trim();
  if (!s) return '';
  // 情况1：JSON 字符串
  if (s.charAt(0) === '{') {
    try {
      const obj = JSON.parse(s);
      const id = obj.id || obj.patternId || obj.patternProductionId || obj.orderId;
      if (id) return String(id).trim();
    } catch (_e) { /* 解析失败，继续下面的尝试 */ }
  }
  // 情况2：URL 参数格式 ?patternId=xxx
  const m = s.match(/[?&]patternId=([^&]+)/);
  if (m && m[1]) {
    try { return decodeURIComponent(m[1]).trim(); } catch (_e) { return String(m[1]).trim(); }
  }
  // 情况3：带 pattern 前缀（pattern:xxx / pattern-xxx / pattern_xxx）
  const prefixMatch = s.match(/^pattern[-:_#](.+)/i);
  if (prefixMatch && prefixMatch[1]) return String(prefixMatch[1]).trim();
  // 情况4：纯 id
  return s;
}

// 样衣生产操作类型（5个基本操作）
const SAMPLE_OPERATIONS = [
  { key: 'RECEIVE', label: '领取样衣', color: '#1890ff', icon: 'scan' },
  { key: 'PLATE', label: '车板', color: '#722ed1', icon: 'tool' },
  { key: 'FOLLOW_UP', label: '跟单确认', color: '#fa8c16', icon: 'check-circle' },
  { key: 'COMPLETE', label: '完成确认', color: '#52c41a', icon: 'check' },
  { key: 'WAREHOUSE_IN', label: '样衣入库', color: '#13c2c2', icon: 'inbox' },
];

// 样衣开发阶段（PC端配置）
const DEV_STAGES = [
  { key: 'bom', name: 'BOM' },
  { key: 'pattern', name: '纸样' },
  { key: 'process', name: '单价' },
  { key: 'secondary', name: '二次工艺' },
  { key: 'production', name: '生产制单' },
];

async function handlePatternScan(handler, parsedData, manualScanType) {
  // 防御性清洗：无论入口传什么格式，都提取出纯 patternId
  // 修复 P0：onTopScan 扫 JSON 二维码时把整个 JSON 当 id 传过来，导致后端 400
  const rawPatternId = parsedData.patternId || parsedData.scanCode;
  const patternId = normalizePatternId(rawPatternId);
  if (!patternId) {
    return handler._errorResult('无效的样衣二维码');
  }

  try {
    // 获取样衣详情
    const patternDetail = await getPatternDetail(handler, patternId);
    if (!patternDetail) {
      return handler._errorResult('样衣记录不存在');
    }

    // 获取样衣扫码记录，判断当前可执行的操作
    const scanRecords = await getPatternScanRecords(handler, patternId);
    // 获取PC端配置的工序配置
    let processConfig = null;
    let hasProcessSystem = false;
    let operationOptions = [];

    try {
      processConfig = await getPatternProcessConfig(handler, patternId);
      if (processConfig && processConfig.length > 0) {
        hasProcessSystem = true;
        operationOptions = buildProcessOperationOptions(processConfig, scanRecords, patternDetail, manualScanType);
      }
    } catch (e) {
      console.warn('[PatternScanProcessor] 获取工序配置失败，使用默认流程:', e);
    }

    // 如果没有工序配置或工序配置为空，使用默认流程
    if (!hasProcessSystem || operationOptions.length === 0) {
      operationOptions = buildSampleOperationOptions(patternDetail, scanRecords, manualScanType);
    }

    if (operationOptions.length === 0) {
      return handler._errorResult('该样衣没有可执行操作，请检查样衣状态');
    }

    // 选择默认操作（如果指定了手动扫码类型，优先匹配）
    const selected = pickSelectedOperation(operationOptions, manualScanType);

    // 稳健提取基础字段（兼容多种后端返回结构）
    const extractText = function (obj) {
      if (!obj) return '';
      const args = Array.prototype.slice.call(arguments, 1);
      for (let i = 0; i < args.length; i++) {
        const v = obj[args[i]];
        if (v !== undefined && v !== null && v !== '') return String(v);
      }
      return '';
    };

    // 从 patternDetail 提取基础字段（多字段兼容）
    const colorVal = extractText(patternDetail, 'color', 'colorName', 'sampleColor', 'colour');
    // 码数：优先单码数，其次多码数数组
    let sizeVal = patternDetail.size || patternDetail.sizeName || '';
    if (!sizeVal) {
      const sizesArr = Array.isArray(patternDetail.sizes) ? patternDetail.sizes : [];
      if (sizesArr.length > 0) sizeVal = sizesArr.join('/');
    }
    // 数量
    const qtyCandidates = [patternDetail.quantity, patternDetail.sampleQuantity, patternDetail.totalQuantity, patternDetail.orderQuantity];
    let qtyVal = 0;
    for (let i = 0; i < qtyCandidates.length; i++) {
      if (typeof qtyCandidates[i] === 'number' && qtyCandidates[i] > 0) { qtyVal = qtyCandidates[i]; break; }
    }
    // 款号
    const styleNoVal = patternDetail.styleNo || patternDetail.styleCode || patternId || '';
    // 款式名
    const styleNameVal = patternDetail.styleName || patternDetail.name || '';
    // 封面
    const coverVal = patternDetail.coverImage || patternDetail.styleImage || patternDetail.cover || '';
    // sizes 数组
    const sizesArrVal = Array.isArray(patternDetail.sizes) ? patternDetail.sizes.slice() : [];

    return {
      success: true,
      needConfirm: true,
      scanMode: handler.SCAN_MODE.PATTERN,
      data: {
        ...parsedData,
        patternId: patternId,
        patternDetail: patternDetail,
        operationType: selected.value,
        operationLabel: selected.label,
        operationOptions: operationOptions,
        styleNo: styleNoVal,
        styleName: styleNameVal,
        color: colorVal,
        size: sizeVal,
        sizes: sizesArrVal,
        quantity: qtyVal,
        status: patternDetail.status || '',
        hasProcessSystem: hasProcessSystem,
        cover: coverVal,
      },
      message: '请确认样衣操作',
    };
  } catch (e) {
    console.error('[PatternScanProcessor] 样衣扫码失败:', e);
    return handler._errorResult(e.errMsg || e.message || '样衣扫码失败');
  }
}

/**
 * 构建样衣操作选项
 * 根据样衣状态和扫码记录，判断下一步可执行的操作
 */
function buildSampleOperationOptions(patternDetail, scanRecords, manualScanType) {
  // 全部开放：所有操作都展示给用户选择，已完成的操作不显示
  // 用户反馈：不要按状态上锁，让用户自由选择，已领取/已完成的操作自动隐藏
  const options = [];
  const status = String(patternDetail.status || '').toUpperCase();

  // 提取已完成的操作类型（已领取/已完成的操作不重复显示）
  const completedOps = new Set(
    scanRecords
      .filter(function(r) { return r.operationType && r.success !== false; })
      .map(function(r) { return String(r.operationType).toUpperCase(); })
  );

  // 所有操作清单（按流程顺序）
  const allOps = [
    { value: 'RECEIVE', label: '领取样衣', icon: 'scan' },
    { value: 'PLATE', label: '车板', icon: 'tool' },
    { value: 'FOLLOW_UP', label: '跟单确认', icon: 'check-circle' },
    { value: 'COMPLETE', label: '完成确认', icon: 'check' },
    { value: 'REVIEW', label: '样衣审核', icon: 'eye' },
    { value: 'WAREHOUSE_IN', label: '样衣入库', icon: 'inbox' },
    { value: 'WAREHOUSE_OUT', label: '样衣出库', icon: 'export' },
    { value: 'WAREHOUSE_RETURN', label: '样衣归还', icon: 'rollback' },
  ];

  // 已入库状态额外允许出库/归还（即使没扫过也显示）
  for (let i = 0; i < allOps.length; i++) {
    const op = allOps[i];
    const isCompleted = completedOps.has(op.value);
    // 已完成的操作不显示（避免重复领取）
    if (isCompleted) continue;
    // 已入库状态：出库/归还总是显示
    if (status === 'WAREHOUSE_IN' && (op.value === 'WAREHOUSE_OUT' || op.value === 'WAREHOUSE_RETURN')) {
      options.push(op);
      continue;
    }
    // 其他操作：只要未完成就显示
    options.push(op);
  }

  return options;
}

/**
 * 获取样衣详情
 */
async function getPatternDetail(handler, patternId) {
  try {
    const res = await handler.api.production.getPatternDetail(normalizePatternId(patternId));
    return res || null;
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样衣详情失败:', e);
    return null;
  }
}

/**
 * 获取样衣扫码记录
 */
async function getPatternScanRecords(handler, patternId) {
  try {
    const list = await handler.api.production.getPatternScanRecords(normalizePatternId(patternId));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样衣扫码记录失败:', e);
    return [];
  }
}

/**
 * 获取样衣工序配置
 */
async function getPatternProcessConfig(handler, patternId) {
  try {
    const config = await handler.api.production.getPatternProcessConfig(normalizePatternId(patternId));
    return Array.isArray(config) ? config : [];
  } catch (e) {
    console.error('[PatternScanProcessor] 获取样衣工序配置失败:', e);
    return [];
  }
}

/**
 * 基于工序配置构建操作选项
 * 核心逻辑：只显示当前可执行的工序，已完成的不显示
 * 门禁校验：与后端 ProductionScanStageSupport.validateParentStagePrerequisite 对齐
 */
function buildProcessOperationOptions(processConfig, scanRecords, patternDetail, manualScanType) {
  if (!processConfig || processConfig.length === 0) {
    return [];
  }

  // 从 patternDetail 提取基础字段（一次提取，所有工序共用）
  const baseColor = (function () {
    if (!patternDetail) return '';
    const candidates = [patternDetail.color, patternDetail.colorName, patternDetail.sampleColor, patternDetail.colour];
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i] != null && candidates[i] !== '') return String(candidates[i]);
    }
    return '';
  })();

  const baseSize = (function () {
    if (!patternDetail) return '';
    let s = patternDetail.size || patternDetail.sizeName || '';
    if (!s && Array.isArray(patternDetail.sizes) && patternDetail.sizes.length > 0) {
      s = patternDetail.sizes.join('/');
    }
    return s;
  })();

  const baseSizes = patternDetail && Array.isArray(patternDetail.sizes) ? patternDetail.sizes.slice() : [];

  const baseQuantity = (function () {
    if (!patternDetail) return 0;
    const candidates = [patternDetail.quantity, patternDetail.sampleQuantity, patternDetail.totalQuantity, patternDetail.orderQuantity];
    for (let i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] === 'number' && candidates[i] > 0) return candidates[i];
    }
    return 0;
  })();

  // 提取已完成的工序（规范化为标准工序名）
  const completedStages = new Set();
  if (scanRecords && Array.isArray(scanRecords)) {
    scanRecords.forEach(function(record) {
      const opType = String(record.operationType || '').trim();
      const processName = String(record.processName || '').trim();
      const progressStage = String(record.progressStage || '').trim();
      if (opType) {
        completedStages.add(stageDetection.canonicalStageKey(opType));
        completedStages.add(opType);
      }
      if (processName) {
        completedStages.add(stageDetection.canonicalStageKey(processName));
        completedStages.add(processName);
      }
      if (progressStage) {
        completedStages.add(stageDetection.canonicalStageKey(progressStage));
        completedStages.add(progressStage);
      }
    });
  }
  
  const options = [];
  const status = String(patternDetail.status || '').toUpperCase();
  
  // 完全按 PC 端工序配置构建操作选项
  // 1. 已完成的工序：显示已完成标记
  // 2. 当前可操作工序（父工序都已完成）：显示可操作
  // 3. 被门禁拦截的工序：显示锁定
  
  // 遍历工序配置，逐个构建选项（不 break）
  let foundFirstOperable = false;
  for (let i = 0; i < processConfig.length; i++) {
    const config = processConfig[i];
    const processName = String(config.processName || config.operationType || '').trim();
    const progressStage = String(config.progressStage || processName).trim();
    const scanType = String(config.scanType || 'production').trim();
    const isCompleted = completedStages.has(processName) || completedStages.has(config.operationType) || completedStages.has(stageDetection.canonicalStageKey(processName));
    
    if (isCompleted) {
      options.push({
        value: processName,
        label: processName,
        icon: 'check',
        processName: processName,
        progressStage: progressStage,
        scanType: scanType,
        sortOrder: config.sortOrder || i,
        completed: true,
        color: baseColor,
        size: baseSize,
        sizes: baseSizes,
        quantity: baseQuantity,
      });
      continue;
    }
    
    // 门禁校验：检查父工序是否全部完成
    const gate = stageDetection.checkParentStageGate(progressStage, completedStages);
    if (!gate.pass) {
      options.push({
        value: processName,
        label: processName,
        icon: 'lock',
        processName: processName,
        progressStage: progressStage,
        scanType: scanType,
        sortOrder: config.sortOrder || i,
        locked: true,
        lockReason: '需先完成：' + gate.missing.join('、'),
        color: baseColor,
        size: baseSize,
        sizes: baseSizes,
        quantity: baseQuantity,
      });
      continue; // 门禁拦截后继续显示后续工序（只读展示）
    }
    
    // 门禁通过：可操作
    options.push({
      value: processName,
      label: processName,
      icon: 'tool',
      processName: processName,
      progressStage: progressStage,
      scanType: scanType,
      sortOrder: config.sortOrder || i,
      canOperate: !foundFirstOperable, // 只有第一个可操作项能执行（父子顺序）
      color: baseColor,
      size: baseSize,
      sizes: baseSizes,
      quantity: baseQuantity,
    });
    foundFirstOperable = true;
  }
  
  return options;
}

/**
 * 规范化手动扫码类型
 */
function normalizeManualType(manualScanType) {
  if (!manualScanType) return '';
  const typeMap = {
    receive: 'RECEIVE',
    plate: 'PLATE',
    followup: 'FOLLOW_UP',
    follow_up: 'FOLLOW_UP',
    complete: 'COMPLETE',
    review: 'REVIEW',
    warehouse: 'WAREHOUSE_IN',
    warehouse_in: 'WAREHOUSE_IN',
    out: 'WAREHOUSE_OUT',
    warehouse_out: 'WAREHOUSE_OUT',
    return: 'WAREHOUSE_RETURN',
    warehouse_return: 'WAREHOUSE_RETURN',
  };
  const normalized = typeMap[manualScanType] || String(manualScanType || '').toUpperCase();
  return normalized;
}

/**
 * 选择默认操作（优先匹配手动扫码类型）
 */
function pickSelectedOperation(operationOptions, manualScanType) {
  const manual = normalizeManualType(manualScanType);
  if (manual) {
    const matched = operationOptions.find(function(item) { return item.value === manual; });
    if (matched) return matched;
  }
  // 默认返回第一个可选操作
  return operationOptions[0];
}

module.exports = {
  handlePatternScan: handlePatternScan,
  getPatternDetail: getPatternDetail,
  getPatternScanRecords: getPatternScanRecords,
  buildSampleOperationOptions: buildSampleOperationOptions,
  SAMPLE_OPERATIONS: SAMPLE_OPERATIONS,
  DEV_STAGES: DEV_STAGES,
};
