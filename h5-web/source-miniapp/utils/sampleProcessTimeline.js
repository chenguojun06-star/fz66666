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

    // 状态判断：有报工记录 → 已完成；有 CLAIM 未报工 → 生产中；无记录 → 待领取
    let status = 'pending';
    let statusText = '待领取';
    if (workScans.length > 0) {
      status = 'completed';
      statusText = '已完成';
    } else if (claimRec) {
      status = 'in_progress';
      statusText = (claimRec.operatorName || '') + ' 生产中';
    }
    // 数量统计（D-167：CLAIM 不计入数量）
    let completedQty = 0;
    workScans.forEach(function (r) {
      completedQty += Number(r.quantity) || 0;
    });
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
};
