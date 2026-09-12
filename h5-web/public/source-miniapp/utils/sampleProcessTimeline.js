/**
 * 样衣工序时间线构建（单点收敛）
 *
 * D-257：此前列表页（sample-development/index）与详情页（sample-development/detail）
 * 各写一份工序构建逻辑，数据源与口径都不同——
 * 列表页用 pattern process-config 按父阶段聚合（无扫码人/时间，工序名是"裁剪/车缝/尾部"父标签），
 * 详情页用 style.listProcesses + 扫码记录按子工序展示（有领取人/时间/单价），
 * 表现为「里面与外面显示的不一样」。现抽成共享模块，两页共用同一份构建逻辑。
 *
 * 输入：
 *   processes - GET /api/style/process/list?styleId=xxx 返回的工序配置数组
 *   scans     - GET /api/production/pattern/{pid}/scan-records 返回的扫码记录数组
 *   totalQty  - 样衣总数（进度条分母）
 * 输出：
 *   { processes: [...], scanRecords: [...] }，字段与详情页 allProcesses/scanRecords 完全一致
 */

// 采购/入库是独立流程，不进工序列表（D-170/D-176 口径，客户端兜底过滤）
function isNonProductionProcess(p) {
  const stage = String(p.progressStage || p.stage || '').trim();
  const name = String(p.processName || p.name || '').trim();
  return stage === '采购' || stage === '入库' || name === '采购' || name === '入库';
}

function formatScanTime(r) {
  const timeStr = r.scanTime || r.createTime || '';
  if (!timeStr) return '';
  try {
    const d = new Date(String(timeStr).replace(/-/g, '/'));
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return mm + '-' + dd + ' ' + hh + ':' + mi;
  } catch (_) { return ''; }
}

function operationText(r) {
  return r.operationType === 'RECEIVE' ? '领取'
    : r.operationType === 'COMPLETE' ? '完成'
    : r.operationType === 'WAREHOUSE_IN' ? '入库'
    : r.operationType === 'WAREHOUSE_OUT' ? '出库'
    : r.operationType === 'WAREHOUSE_RETURN' ? '归还'
    : r.operationType === 'PLATE' ? '车板'
    : r.operationType === 'FOLLOW_UP' ? '跟单'
    : r.processName || r.operationType || '-';
}

function toList(res) {
  const list = (res && res.data) || res || [];
  return Array.isArray(list) ? list : (list.records || []);
}

/**
 * 构建子工序时间线
 * @returns {{ processes: Array, scanRecords: Array }}
 */
/**
 * D-380：解析色码矩阵（sizeColorMatrix）为可渲染结构
 * （与列表页 parseMatrix 同逻辑，收敛到这里避免两页口径漂移）
 */
function parseColorSizeMatrix(item) {
  const scm = (item && item.sizeColorMatrix) || null;
  if (!scm) return { sizes: [], rows: [] };
  const sizes = Array.isArray(scm.sizes) ? scm.sizes.map(String) : [];
  const rows = Array.isArray(scm.matrixRows) ? scm.matrixRows.map(function (r) {
    const qtyArr = Array.isArray(r && r.quantities) ? r.quantities : [];
    const rowTotal = qtyArr.reduce(function (s, n) { return s + (Number(n) || 0); }, 0);
    return { color: (r && r.color) || '', quantities: qtyArr, rowTotal: rowTotal };
  }) : [];
  return { sizes: sizes, rows: rows };
}

/**
 * D-380：样衣「应做总件数」——工序进度的分母。
 *
 * 为什么不能直接用 quantity：`t_pattern_production.quantity` 常常只记了 1 件，
 * 而真实件数在 `sizeColorMatrix` 里（例如 3 色 × 每色 1 件 = 应做 3 件）。
 * 列表页 D-177 已按这个口径算（显示 0/3），但详情页一直用 quantity（显示 3/1），
 * 两页对不上。统一收敛到这里。
 *
 * @param {object} item 样衣快照 / 列表项（需含 sizeColorMatrix / quantity）
 * @param {number} fallback 矩阵与 quantity 都取不到时的兜底（如款式 sampleQuantity）
 */
function resolveSampleTotalQty(item, fallback) {
  const matrix = parseColorSizeMatrix(item);
  let matrixTotal = 0;
  (matrix.rows || []).forEach(function (r) { matrixTotal += Number(r.rowTotal) || 0; });
  if (matrixTotal > 0) return matrixTotal;
  const raw = Number((item && (item.quantity || item.totalQuantity)) || fallback);
  return raw > 0 ? raw : 0;
}

/**
 * 构建子工序时间线
 * @returns {{ processes: Array, scanRecords: Array }}
 */
function buildProcessTimeline(processes, scans, totalQty) {
  const validProcesses = (processes || []).filter(function (p) { return !isNonProductionProcess(p); });
  const total = Number(totalQty) || 0;

  // 先把扫码记录按 processName 分组（兼容 processName/operationType 两种匹配）
  const scansByProcessName = {};
  (scans || []).forEach(function (r) {
    const name = String(r.processName || '').trim();
    if (!name) return;
    if (!scansByProcessName[name]) scansByProcessName[name] = [];
    scansByProcessName[name].push(r);
  });

  const timeline = (validProcesses || []).map(function (p, idx) {
    const stageRaw = p.progressStage || p.stage || '';
    const name = p.processName || p.name || ('工序' + (idx + 1));
    // 该工序的扫码记录（按时间倒序）
    const myScans = (scansByProcessName[name] || []).slice().sort(function (a, b) {
      const ta = new Date(String(a.scanTime || a.createTime || '').replace(/-/g, '/')).getTime() || 0;
      const tb = new Date(String(b.scanTime || b.createTime || '').replace(/-/g, '/')).getTime() || 0;
      return tb - ta;
    });
    // D-167：CLAIM（领取）不算扫码记录——领取人单独展示；报工记录去重展示
    const claimRec = myScans.find(function (r) { return r.operationType === 'CLAIM'; });
    const workScans = myScans.filter(function (r) { return r.operationType !== 'CLAIM'; });

    // 数量统计（D-167：CLAIM 不计入数量）——必须先算，状态判定要用
    let completedQty = 0;
    workScans.forEach(function (r) {
      completedQty += Number(r.quantity) || 0;
    });

    // D-380：状态按「件数」判定，不再"有报工就算完成"。
    // 旧逻辑会让只做了 1 个颜色（1/3）的工序显示"已完成"，用户以为做完了、
    // 后续该工序颜色无法继续报工 → 业务被卡死。
    //   报工数 ≥ 应做数        → 已完成
    //   有报工 / 已领取未做满   → 生产中
    //   应做数取不到(=0)        → 回退旧行为：有报工即完成（避免误判阻塞）
    let status = 'pending';
    let statusText = '待领取';
    if (total > 0) {
      if (completedQty >= total) {
        status = 'completed';
        statusText = '已完成';
      } else if (completedQty > 0 || claimRec) {
        status = 'in_progress';
        statusText = completedQty > 0
          ? ('已完成 ' + completedQty + '/' + total)
          : ((claimRec.operatorName || '') + ' 生产中');
      }
    } else if (workScans.length > 0) {
      status = 'completed';
      statusText = '已完成';
    } else if (claimRec) {
      status = 'in_progress';
      statusText = (claimRec.operatorName || '') + ' 生产中';
    }
    let receivedQty = 0;
    myScans.forEach(function (r) {
      if (r.operationType === 'RECEIVE') {
        receivedQty += Number(r.quantity) || 0;
      }
    });

    return Object.assign({}, p, {
      _key: p.id || ('p_' + idx),
      _name: name,
      _stage: stageRaw,
      _stageLower: String(stageRaw).toLowerCase(),
      _price: p.price || p.unitPrice || '',
      _assignee: p.assignee || '',
      _status: status,
      _statusText: statusText,
      _claimBy: claimRec ? (claimRec.operatorName || '') : '',
      _scanCount: workScans.length,
      _totalQty: total,
      _percent: total > 0 ? Math.min(100, Math.round((completedQty / total) * 100)) : 0,
      _lastTime: workScans.length > 0 ? formatScanTime(workScans[0]) : '',
      _scanRecords: workScans.map(function (r) {
        return {
          _displayTime: formatScanTime(r),
          _operationText: operationText(r),
          _operationClass: String(r.operationType || 'OTHER').toLowerCase(),
          operatorName: r.operatorName || r.userName || '-',
          quantity: r.quantity || 0,
          color: r.color || '',
          size: r.size || '',
        };
      }),
      _completedQty: completedQty,
      _receivedQty: receivedQty,
      _expanded: false,
    });
  });

  // 处理扫码记录：格式化时间
  const scanRecords = (scans || []).map(function (r) {
    const stageRaw = r.progressStage || r.processName || '';
    return Object.assign({}, r, {
      _displayTime: formatScanTime(r),
      _stageLower: String(stageRaw).toLowerCase(),
      _operationText: operationText(r),
      _operationClass: String(r.operationType || 'OTHER').toLowerCase(),
    });
  });

  return { processes: timeline, scanRecords: scanRecords };
}

module.exports = {
  buildProcessTimeline: buildProcessTimeline,
  toList: toList,
  parseColorSizeMatrix: parseColorSizeMatrix,
  resolveSampleTotalQty: resolveSampleTotalQty,
};
