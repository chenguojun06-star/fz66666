/**
 * 阶段详情独立页面
 * 接收参数：key(阶段key), styleId, patternId
 * 从全局缓存 _stageDetailCache 读取 stage/styleInfo
 * 根据stageKey加载对应阶段数据，样衣扫码阶段支持退回操作，其它阶段纯查看
 * 附件功能：所有阶段通用，支持上传+查看PC端同步的文件
 */
const { style: styleApi } = require('../../../utils/api-modules/style-warehouse');
const production = require('../../../utils/api-modules/production');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');
const { displayCategory, displaySeason } = require('../../../utils/displayHelper');
const { STAGE_NAMES, getStageName } = require('../../../utils/sampleHelper');

// 样衣扫码操作类型中文映射（与PC端一致）
const OPERATION_TYPE_LABELS = {
  RECEIVE: '领取样板', PLATE: '车板', FOLLOW_UP: '跟单', COMPLETE: '完成确认',
  PROCUREMENT: '采购', CUTTING: '裁剪', SECONDARY: '二次工艺', SEWING: '车缝',
  TAIL: '尾部', REVIEW: '审核', WAREHOUSE_IN: '入库', WAREHOUSE_OUT: '出库',
  WAREHOUSE_RETURN: '归还', REWORK: '返修完成',
};

/**
 * 解包 ok() 返回的数据：小程序 ok() 直接返回 resp.data
 * 后端返回可能是 { code: 200, data: [...] }，ok 包装后得到数组 [...]
 * 兼容个别接口仍返回 { records: [...] } 或 { data: [...] } 的情况
 */
function _unwrapList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.records)) return res.records;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data && res.data.records)) return res.data.records;
  return [];
}

// 二次工艺类型映射
const PROCESS_TYPE_MAP = {
  embroidery: '绣花', printing: '印花', washing: '洗水',
  dyeing: '染色', ironing: '整烫', pleating: '压褶',
  beading: '钉珠', other: '其他',
};

const STATUS_MAP = {
  pending: { label: '待处理', color: 'default' },
  processing: { label: '处理中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'error' },
};

// 纸样状态映射
const PATTERN_STATUS_LABELS = {
  PENDING: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成',
  RETURNED: '已退回', LOCKED: '已锁定', UNLOCKED: '未锁定', NOT_STARTED: '未开始',
};

/* ========== 公共辅助：鉴权 + 上传/下载（消除 token/baseUrl 重复） ========== */

/**
 * 统一文件上传（图片/附件），复用 token + baseUrl + wx.uploadFile 逻辑
 * @param {string} filePath - 文件临时路径
 * @param {object} formData - 表单数据（styleId/styleNo/bizType 等）
 * @param {function|null} callback - 完成回调（无参，成功或失败均调用）
 * @param {object} pageCtx - 页面实例（用于无回调时调用 loadAttachments）
 */
function _uploadFileWithAuth(filePath, formData, callback, pageCtx) {
  const token = require('../../../utils/storage').getToken();
  const { getBaseUrl } = require('../../../config');
  const baseUrl = getBaseUrl();
  wx.uploadFile({
    url: baseUrl + '/api/style/attachment/upload',
    filePath: filePath,
    name: 'file',
    formData: formData || {},
    header: { 'Authorization': 'Bearer ' + token },
    success: (res) => {
      try {
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        if (data.code === 200) {
          if (!callback) {
            wx.showToast({ title: '上传成功', icon: 'success' });
            pageCtx && pageCtx.loadAttachments && pageCtx.loadAttachments();
          }
        } else {
          wx.showToast({ title: data.message || '上传失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
      if (callback) callback();
    },
    fail: () => {
      wx.showToast({ title: '上传失败', icon: 'none' });
      if (callback) callback();
    },
  });
}

/**
 * 带鉴权的文件下载，仅提取 token + baseUrl + wx.downloadFile 通用逻辑
 * @param {string} url - 文件地址（相对或绝对）
 * @param {function} onSuccess - statusCode=200 时回调，入参 tempFilePath
 * @param {function} [onFail] - 下载失败回调，缺省显示"下载失败"
 */
function _downloadWithAuth(url, onSuccess, onFail) {
  const token = require('../../../utils/storage').getToken();
  const { getBaseUrl } = require('../../../config');
  const baseUrl = getBaseUrl();
  const authedUrl = url.startsWith('http') ? url : (baseUrl + url);
  wx.downloadFile({
    url: authedUrl,
    header: { 'Authorization': 'Bearer ' + token },
    success: (res) => {
      if (res.statusCode === 200 && onSuccess) {
        onSuccess(res.tempFilePath);
      }
    },
    fail: (err) => {
      if (onFail) {
        onFail(err);
      } else {
        wx.showToast({ title: '下载失败', icon: 'none' });
      }
    },
  });
}

Page({
  data: {
    stageKey: '',
    styleId: '',
    patternId: '',
    stage: null,
    styleInfo: null,
    stageName: '',
    navTitle: '阶段详情',
    loading: true,
    // 各阶段数据
    bomList: [],
    bomGroups: [],
    bomSummary: { totalCount: 0, totalAmount: '0.00', mainCount: 0, accessoryCount: 0 },
    patternData: null,
    secondaryList: [],
    processStages: [],
    processGroups: [],
    processTotalCount: 0,
    patternScanRecords: [],
    patternScanGroups: [],
    productionData: null,
    // 附件
    attachmentList: [],
    attachmentLoading: false,
    // 尺码表/码数单价（从styleInfo提取）
    sizeTableData: null,
    sizePriceData: null,
    // 备注日志
    remarkList: [],
    remarkLoading: false,
    remarkInput: '',
    remarkRoleInput: '',
    remarkSubmitting: false,
    // 设计稿字段：时间轴 + 样衣信息卡 + 当前阶段详情
    timelineStages: [],
    sampleCard: null,
    stageDetail: null,
    progressPercent: 0,
    progressDashoffset: 125.66,
    stagePhotos: [],
    patternSnapshot: null,
    devStages: [],
  },

  onLoad(options) {
    const stageKey = options.key || '';
    const styleId = options.styleId || '';
    const patternId = options.patternId || '';
    const stageName = STAGE_NAMES[stageKey] || '阶段详情';

    // 从全局缓存读取stage和styleInfo
    const app = getApp();
    const cache = (app._stageDetailCache || {})[stageKey] || {};
    const stage = cache.stage || null;
    const styleInfo = cache.styleInfo || null;
    // P0 修复：URL 传的 patternId 可能被截断或丢失，兜底从 cache 取
    // cache.patternId 是 detail 页 onStageJump 时传入的
    const finalPatternId = patternId || cache.patternId || (styleInfo && styleInfo.patternId) || '';
    const finalStyleId = styleId || cache.styleId || (styleInfo && styleInfo.id) || '';

    this.setData({
      stageKey, styleId: finalStyleId, patternId: finalPatternId, stageName,
      stage, styleInfo,
      navTitle: stageName || '阶段详情',
      patternSnapshot: cache.snapshot || null,
    });
    wx.setNavigationBarTitle({ title: stageName });

    // 从 styleInfo 构建时间轴和样衣信息卡（纯数据准备，无 API 调用）
    if (styleInfo) {
      this.buildTimeline(styleInfo);
      // 加载对应阶段的数据
      this.loadStageData();
      // 附件通用加载
      this.loadAttachments();
      // 备注日志加载
      this.loadRemarks();
      bindPageEvents(this, () => this.loadStageData());
    } else if (finalStyleId) {
      // 兜底：缓存丢失时用 API 加载 styleInfo
      var that = this;
      styleApi.getStyleDetail(finalStyleId).then(function (res) {
        var info = (res && res.data) || res || null;
        if (info) {
          that.setData({ styleInfo: info });
          that.buildTimeline(info);
        } else {
          // API 也没拿到，用空数据构建阶段框架
          that.buildTimeline({ id: finalStyleId });
        }
        that.loadStageData();
        that.loadAttachments();
        that.loadRemarks();
        bindPageEvents(that, () => that.loadStageData());
      }).catch(function () {
        // API 失败也构建阶段框架
        that.buildTimeline({ id: finalStyleId });
        that.loadStageData();
        that.loadAttachments();
        that.loadRemarks();
        bindPageEvents(that, () => that.loadStageData());
      });
    } else {
      // 无 styleId 也无缓存，用空数据构建阶段框架
      this.buildTimeline({ id: '' });
      this.loadStageData();
      this.loadAttachments();
      this.loadRemarks();
      bindPageEvents(this, () => this.loadStageData());
    }
  },

  onUnload() {
    unbindPageEvents(this);
  },

  onPullDownRefresh() {
    var that = this;
    this.loadStageData().then(function() {
      return Promise.all([that.loadAttachments(), that.loadRemarks()]);
    }).then(function() {
      wx.stopPullDownRefresh();
    }).catch(function() {
      wx.stopPullDownRefresh();
    });
  },

  /** 统一时间格式化 */
  _fmtDateTime(t) {
    if (!t) return '';
    const s = String(t).replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return s.substring(0, 16);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return s.trim() + ' 00:00';
    return s.substring(0, 16);
  },

  /** 日期格式化（仅日期部分 yyyy-MM-dd） */
  _fmtDate(t) {
    if (!t) return '';
    const s = String(t).replace('T', ' ');
    return s.substring(0, 10);
  },

  /**
   * 从 styleInfo + snapshot 构建时间轴 + 样衣信息卡 + 当前阶段详情
   * 进度数据来源与 detail/index.js 的 buildStages 完全一致
   */
  buildTimeline(styleInfo) {
    if (!styleInfo) return;
    var that = this;
    var snapshot = this.data.patternSnapshot || styleInfo.snapshot || {};
    var stageConfig = [
      { key: 'procurement', name: '采购' },
      { key: 'cutting', name: '裁剪' },
      { key: 'secondary', name: '二次工艺' },
      { key: 'sewing', name: '车缝' },
      { key: 'tail', name: '尾部' },
      { key: 'warehousing', name: '入库' },
    ];

    // 从 snapshot.progressNodes 获取阶段进度（与 detail 页面 getSampleNodeProgress 逻辑一致）
    function getNodeProgress(snap, key) {
      if (!snap) return 0;
      // 采购阶段用 _procurementProgress
      if (key === 'procurement') return snap._procurementProgress || 0;
      // 其他阶段从 progressNodes JSON 取
      var nodes = snap.progressNodes;
      if (!nodes) return 0;
      if (typeof nodes === 'string') {
        try { nodes = JSON.parse(nodes); } catch (e) { return 0; }
      }
      var node = nodes[key];
      if (!node) return 0;
      if (typeof node === 'number') return node;
      if (typeof node === 'object') {
        if (typeof node.percent === 'number') return node.percent;
        if (typeof node.progress === 'number') return node.progress;
        if (node.completed && node.total && node.total > 0) {
          return Math.round((node.completed / node.total) * 100);
        }
      }
      return 0;
    }

    var isFullyCompleted = snapshot._isFullyCompleted;
    var totalPercent = 0;
    var stages = stageConfig.map(function (s, idx) {
      var percent;
      if (isFullyCompleted) {
        percent = 100;
      } else {
        percent = getNodeProgress(snapshot, s.key);
      }
      totalPercent += percent;
      var status = percent >= 100 ? 'completed' : (percent > 0 ? 'in_progress' : 'not_started');
      var statusText = percent >= 100 ? '已完成' : (percent > 0 ? percent + '%' : '待开始');

      // 时间标签从 snapshot 获取
      var timeLabel = '';
      var deliveryShort = styleInfo._deliveryTime
        ? that._fmtDate(styleInfo._deliveryTime) : '';
      if (deliveryShort) {
        timeLabel = '交期 ' + deliveryShort;
      }

      // 延时提示
      var delayText = '';
      var delayTone = '';
      if (status === 'in_progress' && snapshot._countdownDays != null) {
        if (snapshot._countdownDays < 0) {
          delayText = '已逾期' + Math.abs(snapshot._countdownDays) + '天';
          delayTone = 'danger';
        } else if (snapshot._countdownDays <= 3) {
          delayText = '临近交期' + snapshot._countdownDays + '天';
          delayTone = 'warning';
        }
      }

      // 描述文本
      var description = '';
      var stageProgress = percent;
      if (status === 'completed') {
        description = s.name + '已完成';
      } else if (status === 'in_progress') {
        description = s.name + '进行中 ' + percent + '%';
      } else {
        description = '待开始';
      }

      return {
        key: s.key,
        name: s.name,
        status: status,
        statusText: statusText,
        assignee: snapshot._receiverName || styleInfo.receiver || '',
        startTime: '',
        completedAt: '',
        timeLabel: timeLabel,
        delayText: delayText,
        delayTone: delayTone,
        description: description,
        stageProgress: stageProgress,
        isCurrent: s.key === that.data.stageKey,
      };
    });

    // 进度计算
    var completedCount = 0;
    stages.forEach(function (s) { if (s.status === 'completed') completedCount++; });
    var progressPercent = stages.length > 0
      ? Math.round(totalPercent / stages.length)
      : 0;
    var circumference = 125.66;
    var dashoffset = circumference * (1 - progressPercent / 100);

    // 样衣信息卡
    var info = styleInfo;
    var deliveryDate = info._deliveryTime || info.deliveryTime || info.deliveryDate || '';
    var deliveryDateShort = deliveryDate ? that._fmtDate(deliveryDate) : '';
    var countdownDays = info._countdownDays != null ? info._countdownDays : (function () {
      if (!deliveryDate) return null;
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var target = new Date(String(deliveryDate).replace(/-/g, '/')); target.setHours(0, 0, 0, 0);
      return Math.ceil((target.getTime() - today.getTime()) / 86400000);
    })();
    var countdownText = '';
    var countdownTone = 'normal';
    if (countdownDays != null) {
      if (countdownDays < 0) {
        countdownText = '已逾期' + Math.abs(countdownDays) + '天';
        countdownTone = 'danger';
      } else if (countdownDays === 0) {
        countdownText = '今日到期';
        countdownTone = 'danger';
      } else {
        countdownText = '剩余' + countdownDays + '天';
        countdownTone = countdownDays <= 3 ? 'danger' : (countdownDays <= 7 ? 'warning' : 'normal');
      }
    }
    var sampleCard = {
      styleNo: info.styleNo || info.styleCode || '',
      styleName: info.styleName || info.name || '',
      statusText: info._mainStatus || '开发中',
      customer: info.customer || info.customerName || '',
      patternMaker: info.patternMaker || info.patternDeveloper || info.receiver || '',
      category: displayCategory(info.category || info.productCategory || ''),
      season: displaySeason(info.season || ''),
      color: info.color || '',
      size: info.size || '',
      quantity: info.quantity || info.sampleQuantity || 0,
      coverUrl: info.cover || (info.coverImage ? getAuthedImageUrl(info.coverImage) : ''),
      deliveryDateShort: deliveryDateShort,
      countdownText: countdownText,
      countdownTone: countdownTone,
      completedCount: completedCount,
      totalStages: stages.length,
    };

    // 当前阶段详情
    var currentStage = stages.find(function (s) { return s.key === that.data.stageKey; })
      || that.data.stage || {};
    var plannedQty = sampleCard.quantity || 0;
    var completedQty = currentStage.completedQty || currentStage.actualQty || 0;
    var remainingQty = Math.max(0, plannedQty - completedQty);
    var stageDetail = {
      name: that.data.stageName,
      status: currentStage.status || (that.data.stage && that.data.stage.status) || 'not_started',
      statusText: currentStage.statusText || (that.data.stage && that.data.stage.statusText) || '',
      assignee: currentStage.assignee || (that.data.stage && that.data.stage.assignee) || '',
      startTime: currentStage.startTime || (that.data.stage && that.data.stage.startTime) || '',
      completedAt: currentStage.completedAt || (that.data.stage && that.data.stage.completedAt) || '',
      plannedQty: plannedQty,
      completedQty: completedQty,
      remainingQty: remainingQty,
    };

    // 开发阶段快捷入口数据（从 snapshot 或 styleInfo 推导状态）
    var devStageConfig = [
      { key: 'bom', name: 'BOM', iconClass: 'icon-bom' },
      { key: 'pattern', name: '纸样', iconClass: 'icon-pattern' },
      { key: 'size', name: '尺码', iconClass: 'icon-size' },
      { key: 'process', name: '工序', iconClass: 'icon-process' },
      { key: 'secondary', name: '二次工艺', iconClass: 'icon-secondary' },
      { key: 'production', name: '制单', iconClass: 'icon-production' },
      { key: 'sizePrice', name: '码价', iconClass: 'icon-price' },
    ];
    var devStages = devStageConfig.map(function (s) {
      // 从 progressNodes 取进度，优先用 snapshot 数据
      var percent = getNodeProgress(snapshot, s.key);
      var status = percent >= 100 ? 'completed' : (percent > 0 ? 'in_progress' : 'not_started');
      var statusText = percent >= 100 ? '已完成' : (percent > 0 ? '进行中' : '');
      //  fallback：从 styleInfo 直接字段判断（如 patternStatus）
      if (status === 'not_started' && s.key === 'pattern' && styleInfo.patternStatus) {
        status = styleInfo.patternStatus === 'COMPLETED' ? 'completed' : 'in_progress';
        statusText = styleInfo.patternStatus === 'COMPLETED' ? '已完成' : '进行中';
      }
      return {
        key: s.key,
        name: s.name,
        iconClass: s.iconClass,
        status: status,
        statusText: statusText,
      };
    });

    that.setData({
      timelineStages: stages,
      sampleCard: sampleCard,
      stageDetail: stageDetail,
      progressPercent: progressPercent,
      progressDashoffset: dashoffset,
      devStages: devStages,
    });
  },

  formatFileSize(bytes) {
    if (!bytes) return '';
    const size = Number(bytes) || 0;
    if (size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + 'MB';
    if (size >= 1024) return (size / 1024).toFixed(0) + 'KB';
    return size + 'B';
  },

  /** 根据stageKey加载对应阶段数据 */
  async loadStageData() {
    const { stageKey } = this.data;
    if (!stageKey) return;
    this.setData({ loading: true });
    try {
      switch (stageKey) {
        case 'procurement':
          // 采购阶段：复用BOM数据展示物料需求
          await this.loadBom();
          break;
        case 'cutting':
          // 裁剪阶段：加载裁剪/扫码记录
          await this.loadProcessAndScans();
          break;
        case 'secondary':
          // 二次工艺
          await this.loadSecondary();
          break;
        case 'sewing':
          // 车缝阶段：加载工序扫码记录
          await this.loadProcessAndScans();
          break;
        case 'tail':
          // 尾部阶段：加载工序扫码记录
          await this.loadProcessAndScans();
          break;
        case 'warehousing':
          // 入库阶段：加载生产制单
          this.loadProduction();
          break;
        // 兼容旧 key（防止其他入口传入）
        case 'bom':
          await this.loadBom();
          break;
        case 'pattern':
          await this.loadPattern();
          break;
        case 'size':
          this.loadSizeTable();
          break;
        case 'process':
          await this.loadProcessAndScans();
          break;
        case 'production':
          this.loadProduction();
          break;
        case 'sizePrice':
          this.loadSizePrice();
          break;
      }
    } catch (e) {
      console.error('[stage-detail] loadStageData error:', e);
    }
    this.setData({ loading: false });
  },

  /* ============ BOM ============ */
  async loadBom() {
    if (!this.data.styleId) return;
    try {
      const res = await styleApi.listBom({ styleId: this.data.styleId });
      const list = _unwrapList(res);
      list.forEach(it => {
        it._displayQty = it.devUsageAmount || it.usageAmount || 0;
        it._unit = it.unit || '';
        it._materialLabel = it.materialName || it.name || '';
        it._specLabel = [it.spec, it.specification, it.color].filter(v => v).join(' ');
        // 部位标签：未指定部位时显示"整件"，与后端兜底一致
        var partName = (it.partName || '').toString().trim();
        if (!partName) partName = '整件';
        it._partLabel = partName;
        it._isWholePart = partName === '整件';
        // 子部位标签：未指定则为空（不展示），与后端逻辑一致
        var subPartName = (it.subPartName || '').toString().trim();
        it._subPartLabel = subPartName;
        // P0 修复：与 PC 端 calcTotalPrice 一致，含损耗率
        var effectiveUsage = Number(it.devUsageAmount || it.usageAmount || 0);
        var lossRate = Number(it.lossRate || 0);
        it._amount = (effectiveUsage * (1 + lossRate / 100) * Number(it.unitPrice || 0)).toFixed(2);
        const mType = String(it.materialType || '').toLowerCase();
        if (/主料|面料|main|fabric/.test(mType)) it._category = 'main';
        else if (/辅料|accessory|lining|button|zipper|thread/.test(mType)) it._category = 'accessory';
        else it._category = 'other';
      });
      const groups = { main: [], accessory: [], other: [] };
      list.forEach(it => { groups[it._category].push(it); });
      const bomGroups = [
        { key: 'main', name: '主料', count: groups.main.length, items: groups.main },
        { key: 'accessory', name: '辅料', count: groups.accessory.length, items: groups.accessory },
        { key: 'other', name: '其他', count: groups.other.length, items: groups.other },
      ].filter(g => g.count > 0);
      let totalAmount = 0;
      list.forEach(it => { totalAmount += Number(it._amount || 0); });
      this.setData({
        bomList: list,
        bomGroups,
        bomSummary: {
          totalCount: list.length,
          totalAmount: totalAmount.toFixed(2),
          mainCount: groups.main.length,
          accessoryCount: groups.accessory.length,
        },
      });
    } catch (e) { console.error('BOM加载失败', e); }
  },

  /* ============ 纸样 ============ */
  async loadPattern() {
    if (!this.data.styleId) return;
    // 防重入：避免 bindPageEvents + onLoad 重复触发
    if (this._patternLoading) return;
    this._patternLoading = true;
    try {
      const res = await styleApi.getPatternRevision(this.data.styleId);
      const patternData = res ? Object.assign({}, res) : null;
      if (patternData && patternData.status) {
        patternData.statusText = PATTERN_STATUS_LABELS[String(patternData.status).toUpperCase()] || '其他';
      }
      this.setData({ patternData });
    } catch (e) {
      // 404 = 该款式没有纸样数据，静默处理不刷错误日志
      const status = e && (e.statusCode || (e.data && e.data.code));
      if (status === 404 || status === 40400) {
        this.setData({ patternData: null });
      } else {
        console.error('纸样加载失败', e);
      }
    } finally {
      this._patternLoading = false;
    }
  },

  /* ============ 尺码表（调用PC端同款API） ============ */
  async loadSizeTable() {
    if (!this.data.styleId) return;
    try {
      const res = await styleApi.listSizes({ styleId: this.data.styleId });
      const list = _unwrapList(res);
      // P0 修复：与 PC 端 splitSizeNames 一致，拆分组合尺码 "S,M,L" → ["S","M","L"]
      const splitSizeNames = function (raw) {
        if (!raw) return [];
        var s = String(raw).trim();
        if (s.startsWith('[')) {
          try { return JSON.parse(s).map(function (x) { return String(x).trim(); }).filter(Boolean); } catch (e) { /* JSON解析失败，降级为分割 */ }
        }
        return s.split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean);
      }
      // 按部位分组，每个尺码取对应 standardValue
      const sizeSet = {};
      const partMap = {};
      (list || []).forEach(function (it) {
        const part = String(it.partName || '未命名部位').trim();
        if (!partMap[part]) partMap[part] = {};
        // 尺码可能是组合尺码 "S,M,L"，拆分后每个尺码都关联同一条记录
        var sizeNames = splitSizeNames(it.sizeName);
        if (sizeNames.length === 0) {
          // 无尺码名，用空字符串占位
          sizeNames = [''];
        }
        sizeNames.forEach(function (sn) {
          if (sn) sizeSet[sn] = true;
          partMap[part][sn] = it;
        });
      });
      const sizes = Object.keys(sizeSet);
      const parts = Object.keys(partMap).sort();
      const rows = parts.map(function (part) {
        const cells = partMap[part];
        const first = cells[sizes[0]] || {};
        const row = {
          partName: part,
          measureMethod: first.measureMethod || '',
          tolerance: first.tolerance || '',
          baseSize: first.baseSize || '',
        };
        sizes.forEach(function (sn) {
          const cell = cells[sn] || {};
          row['size_' + sn] = cell.standardValue != null ? String(cell.standardValue) : '';
        });
        return row;
      });
      this.setData({ sizeTableData: { sizes: sizes, rows: rows } });
    } catch (e) { console.error('尺码表加载失败', e); }
  },

  /* ============ 工序配置 + 样衣扫码记录 ============ */
  async loadProcessAndScans() {
    var pid = (this.data.patternId || '').trim();
    if (!pid) {
      // P0 修复：styleInfo.id 是款式 UUID（StyleInfo.id），不是 PatternProduction.id
      // 不能用 styleInfo.id 当 patternId，否则调用失败
      // 正确做法：通过 styleId 反查 PatternProduction 列表取第一条
      const info = this.data.styleInfo || {};
      const styleId = this.data.styleId || info.id || '';
      if (!styleId) {
        console.warn('[stage-detail] loadProcessAndScans: 既无 patternId 也无 styleId');
        return;
      }
      try {
        // 通过 styleId 反查 patternProduction
        const listRes = await production.listPatterns({ styleId: styleId, page: 1, pageSize: 1 });
        const data = (listRes && listRes.data) || listRes || {};
        const records = data.records || (Array.isArray(data) ? data : []);
        if (records.length > 0 && records[0].id) {
          pid = String(records[0].id);
          this.setData({ patternId: pid });
        } else {
          console.warn('[stage-detail] 通过 styleId=' + styleId + ' 未查到 patternProduction');
          return;
        }
      } catch (e) {
        console.error('[stage-detail] 通过 styleId 反查 patternProduction 失败', e);
        return;
      }
    }
    try {
      const styleId = this.data.styleId;
      const [detailRes, configRes, recordsRes, styleProcessRes] = await Promise.all([
        production.getPatternDetail(pid),
        production.getPatternProcessConfig(pid),
        production.getPatternScanRecords(pid),
        styleApi.listProcesses({ styleId: styleId }),
      ]);
      const config = (configRes && configRes.data) || configRes || [];
      const records = (recordsRes && recordsRes.data) || recordsRes || [];
      const detail = (detailRes && detailRes.data) || detailRes || {};
      // 优先使用 PC 端同款 /style/process/list 数据，无数据时兜底用 pattern 工序配置
      const styleProcesses = _unwrapList(styleProcessRes);
      const processList = styleProcesses.length > 0 ? styleProcesses : config;

      // 构建工序列表（平铺）
      const processStages = this._buildProcessStages(processList, records, detail);
      // 按阶段分组（同步PC端父子结构）
      const processGroups = this._filterGroupsByStageKey(
        this._groupProcessesByStage(processStages),
        this.data.stageKey
      );
      this.setData({
        processStages,
        processGroups,
        processTotalCount: processStages.length,
      });

      // 构建扫码记录列表（与PC端6列对齐）
      this._buildScanRecords(records);
    } catch (e) {
      console.error('工序/扫码记录加载失败', e);
    }
  },

  _buildProcessStages(config, records, detail) {
    if (!config || !config.length) return [];
    const now = Date.now();
    // 按工序名/id归集所有扫码记录（不只取最新一条，与PC端对齐）
    const recordMap = {};
    (records || []).forEach(r => {
      const key = r.processId || r.processName || '';
      const altKey = r.operationType || '';
      if (key) {
        if (!recordMap[key]) recordMap[key] = [];
        recordMap[key].push(r);
      }
      // 也按 operationType 归集（PC端 scan-records 用 operationType 关联）
      if (altKey && !recordMap[altKey]) {
        recordMap[altKey] = [];
        recordMap[altKey].push(r);
      } else if (altKey) {
        recordMap[altKey].push(r);
      }
    });
    return config.map((c, idx) => {
      const key = c.id || c.processId || ('p_' + idx);
      const processName = c.processName || c.name || ('工序' + (idx + 1));
      const processCode = c.processCode || c.operationType || '';
      // 该工序的所有扫码记录
      const allRecords = recordMap[key] || recordMap[processName] || recordMap[processCode] || [];
      const sortedRecords = allRecords.slice().sort((a, b) => {
        const ta = a.scanTime || '';
        const tb = b.scanTime || '';
        return tb > ta ? 1 : (tb < ta ? -1 : 0);
      });
      const latest = sortedRecords[0] || null;
      const completed = latest && (latest.operationType === 'COMPLETE' || latest.operationType === 'WAREHOUSE_IN');
      const inProgress = latest && !completed;
      const scanTime = latest && latest.scanTime ? new Date(String(latest.scanTime).replace(/-/g, '/')).getTime() : 0;
      const canUndo = scanTime > 0 && (now - scanTime) < 30 * 60 * 1000;
      const price = Number(c.unitPrice || c.price || 0);
      const qty = Number(detail.quantity || detail.sampleQuantity || 1);
      const totalPrice = price > 0 ? (price * qty).toFixed(2) : '';

      // 构建该工序的扫码记录列表（与PC端6列对齐）
      const scanList = sortedRecords.map(r => {
        const opType = String(r.operationType || '').toUpperCase();
        const opLabel = OPERATION_TYPE_LABELS[opType] || opType || '未知';
        const rScanTime = r.scanTime ? new Date(String(r.scanTime).replace(/-/g, '/')).getTime() : 0;
        const rCanUndo = rScanTime > 0 && (now - rScanTime) < 30 * 60 * 1000;
        // P1 修复（手机端同步）：补 unitPrice / scanCost，与 PC 端扫码记录表对齐
        const rQty = Number(r.quantity || qty || 1);
        const rPrice = Number(r.unitPrice || 0);
        const rScanCostNum = Number(r.scanCost || 0) > 0
          ? Number(r.scanCost)
          : (rPrice > 0 ? rPrice * rQty : 0);
        return {
          id: r.id || '',
          operatorName: r.operatorName || r.operator || '未知',
          operationLabel: opLabel,
          scanTimeText: this._fmtDateTime(r.scanTime),
          warehouse: r.warehouse || r.warehouseName || '-',
          remark: r.remark || '',
          canUndo: rCanUndo,
          quantity: r.quantity || qty,
          color: r.color || '',
          size: r.size || '',
          unitPrice: rPrice > 0 ? rPrice.toFixed(2) : '',
          scanCost: rScanCostNum > 0 ? rScanCostNum.toFixed(2) : '',
        };
      });

      return {
        key: String(key),
        name: processName,
        progressStage: c.progressStage || c.stage || '',
        assignee: (latest && latest.operatorName) || c.assignee || '',
        scanTime: scanTime > 0 ? this._fmtDateTime(latest.scanTime) : '',
        completed,
        inProgress,
        status: completed ? 'completed' : (inProgress ? 'in_progress' : 'not_started'),
        statusText: completed ? '已完成' : (inProgress ? '进行中' : '未开始'),
        warehouse: (latest && (latest.warehouse || latest.warehouseName)) || '',
        remark: (latest && latest.remark) || '',
        unitPrice: price > 0 ? price.toFixed(2) : '',
        totalPrice: totalPrice,
        quantity: qty,
        recordId: latest ? latest.id : '',
        canUndo: canUndo,
        // 展开相关
        expanded: false,
        scanCount: scanList.length,
        scanList: scanList,
        // 工序额外信息（与PC端列对齐）
        processCode: processCode,
        machineType: c.machineType || '',
        difficulty: c.difficulty || '',
        standardTime: c.standardTime || '',
        sortOrder: c.sortOrder || (idx + 1),
      };
    });
  },

  /**
   * 按阶段分组（同步PC端父子结构，STAGE_ORDER: 采购/裁剪/二次工艺/车缝/尾部/入库）
   * @param {Array} processStages - 平铺的子工序列表
   * @returns {Array} 分组后的工序列表 [{stageName, processes, totalCount, completedCount}]
   */
  _groupProcessesByStage(processStages) {
    if (!processStages || processStages.length === 0) return [];
    // 与 PC 端 STAGE_ORDER 一致
    var STAGE_ORDER = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];
    // progressStage → 中文阶段名映射（覆盖后端可能返回的英文/中文变体）
    var STAGE_MAP = {
      '采购': '采购', 'procurement': '采购', '备料': '采购',
      '裁剪': '裁剪', 'cutting': '裁剪',
      '二次工艺': '二次工艺', 'secondary': '二次工艺',
      '车缝': '车缝', 'sewing': '车缝', '缝制': '车缝', 'carSewing': '车缝',
      '尾部': '尾部', 'tail': '尾部', '后整': '尾部', 'tailProcess': '尾部',
      '入库': '入库', 'warehousing': '入库',
    };

    function resolveStageName(progressStage) {
      var ps = String(progressStage || '').trim();
      if (!ps) return '其他';
      if (STAGE_MAP[ps]) return STAGE_MAP[ps];
      var lowerPs = ps.toLowerCase();
      for (var k in STAGE_MAP) {
        var lk = k.toLowerCase();
        if (lowerPs === lk || lowerPs.indexOf(lk) >= 0 || lk.indexOf(lowerPs) >= 0) {
          return STAGE_MAP[k];
        }
      }
      return ps;
    }

    // 分组
    var groupMap = {};
    var customOrder = [];
    processStages.forEach(function (p) {
      var stageName = resolveStageName(p.progressStage);
      if (!groupMap[stageName]) {
        groupMap[stageName] = [];
        customOrder.push(stageName);
      }
      groupMap[stageName].push(p);
    });

    // 按 PC 端 STAGE_ORDER 排序
    var result = STAGE_ORDER
      .filter(function (name) { return groupMap[name] && groupMap[name].length > 0; })
      .map(function (name) {
        var processes = groupMap[name];
        return {
          stageName: name,
          processes: processes,
          totalCount: processes.length,
          completedCount: processes.filter(function (p) { return p.status === 'completed'; }).length,
        };
      });

    // 处理不在 STAGE_ORDER 中的自定义阶段
    customOrder.forEach(function (name) {
      if (STAGE_ORDER.indexOf(name) < 0 && groupMap[name] && groupMap[name].length > 0) {
        result.push({
          stageName: name,
          processes: groupMap[name],
          totalCount: groupMap[name].length,
          completedCount: groupMap[name].filter(function (p) { return p.status === 'completed'; }).length,
        });
      }
    });

    return result;
  },

  /**
   * 根据当前 stageKey 过滤分组
   * - stageKey === 'process'：显示全部分组（父子结构）
   * - stageKey 为具体阶段：只显示对应阶段分组
   */
  _filterGroupsByStageKey(groups, stageKey) {
    if (!groups || groups.length === 0) return [];
    if (stageKey === 'process' || !stageKey) return groups;
    // stageKey → 中文阶段名
    var STAGE_KEY_MAP = {
      procurement: '采购',
      cutting: '裁剪',
      secondary: '二次工艺',
      sewing: '车缝',
      tail: '尾部',
      warehousing: '入库',
    };
    var targetStage = STAGE_KEY_MAP[stageKey];
    if (!targetStage) return groups;
    return groups.filter(function (g) { return g.stageName === targetStage; });
  },

  _buildScanRecords(records) {
    const now = Date.now();
    const list = (records || []).map(r => {
      const opType = String(r.operationType || '').toUpperCase();
      const opLabel = OPERATION_TYPE_LABELS[opType] || '未知';
      const scanTime = r.scanTime ? new Date(String(r.scanTime).replace(/-/g, '/')).getTime() : 0;
      const canUndo = scanTime > 0 && (now - scanTime) < 30 * 60 * 1000;
      // 颜色/码数/数量展示
      const colorVal = r.color || '';
      const sizeVal = r.size || '';
      let colorSizeText = '';
      if (colorVal && sizeVal) colorSizeText = colorVal + ' / ' + sizeVal;
      else if (colorVal) colorSizeText = colorVal;
      else if (sizeVal) colorSizeText = sizeVal;
      const qtyVal = Number(r.quantity || 0);
      const qtyText = qtyVal > 0 ? qtyVal + '件' : '';
      return Object.assign({}, r, {
        _operationLabel: opLabel,
        _operatorName: r.operatorName || r.operator || '未知',
        _scanTimeText: this._fmtDateTime(r.scanTime),
        _warehouse: r.warehouse || r.warehouseName || '-',
        _remark: r.remark || '',
        _canUndo: canUndo,
        _colorSizeText: colorSizeText,
        _qtyText: qtyText,
      });
    }).sort((a, b) => {
      const ta = a.scanTime || '';
      const tb = b.scanTime || '';
      return tb > ta ? 1 : (tb < ta ? -1 : 0);
    });

    // 按日期分组
    const groups = [];
    const dateMap = {};
    list.forEach(item => {
      const dateStr = item._scanTimeText ? item._scanTimeText.substring(0, 10) : '未知日期';
      const timeStr = item._scanTimeText && item._scanTimeText.length > 10
        ? item._scanTimeText.substring(11, 16) : '';
      item._timeOnly = timeStr;
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { date: dateStr, items: [] };
        groups.push(dateMap[dateStr]);
      }
      dateMap[dateStr].items.push(item);
    });
    // 日期标签
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
      (today.getMonth() + 1 < 10 ? '0' : '') + (today.getMonth() + 1) + '-' +
      (today.getDate() < 10 ? '0' : '') + today.getDate();
    const yesterday = new Date(today.getTime() - 86400000);
    const yestStr = yesterday.getFullYear() + '-' +
      (yesterday.getMonth() + 1 < 10 ? '0' : '') + (yesterday.getMonth() + 1) + '-' +
      (yesterday.getDate() < 10 ? '0' : '') + yesterday.getDate();
    groups.forEach(g => {
      g.count = g.items.length;
      if (g.date === todayStr) g._dateLabel = '今天 · ' + g.date;
      else if (g.date === yestStr) g._dateLabel = '昨天 · ' + g.date;
      else g._dateLabel = g.date;
    });
    this.setData({ patternScanRecords: list, patternScanGroups: groups });
  },

  /** 展开/收起工序详情（查看扫码记录） */
  onToggleProcess(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const groups = this.data.processGroups || [];
    for (let gi = 0; gi < groups.length; gi++) {
      const processes = groups[gi].processes || [];
      const pi = processes.findIndex(p => p.key === key);
      if (pi >= 0) {
        const newExpanded = !processes[pi].expanded;
        this.setData({
          ['processGroups[' + gi + '].processes[' + pi + '].expanded']: newExpanded,
        });
        return;
      }
    }
  },

  /** 撤回样衣扫码记录 */
  async onUndoScan(e) {
    const scanRecordId = e.currentTarget.dataset.id;
    const patternId = this.data.patternId;
    if (!scanRecordId || !patternId) return;
    wx.showModal({
      title: '确认撤回',
      content: '撤回后该扫码记录将被删除，是否继续？',
      confirmText: '撤回',
      confirmColor: '#ff3b30',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '撤回中...', mask: true });
        try {
          await production.undoPatternScanRecord(patternId, scanRecordId);
          wx.hideLoading();
          wx.showToast({ title: '已撤销', icon: 'success' });
          // 刷新数据
          this.loadProcessAndScans();
        } catch (err) {
          wx.hideLoading();
          const msg = err && err.message ? err.message : '撤销失败';
          wx.showToast({ title: msg, icon: 'none' });
        }
      },
    });
  },

  /* ============ 二次工艺 ============ */
  async loadSecondary() {
    if (!this.data.styleId) return;
    try {
      const res = await styleApi.listSecondaryProcesses({ styleId: this.data.styleId });
      const list = _unwrapList(res);
      list.forEach(s => {
        const rawType = s.type || s.processType || '';
        s.typeText = rawType ? (PROCESS_TYPE_MAP[rawType] || '未知') : '';
        const statusKey = String(s.status || '').toLowerCase();
        const statusInfo = STATUS_MAP[statusKey];
        s._statusText = statusInfo ? statusInfo.label : (s.status || '');
        s.status = statusKey || s.status;
        const qty = Number(s.quantity || 0);
        const price = Number(s.unitPrice || s.price || 0);
        const total = s.totalPrice !== undefined && s.totalPrice !== null
          ? Number(s.totalPrice) : qty * price;
        s._totalPriceText = total > 0 ? total.toFixed(2) : '';
        let imgs = s.images || s.imageUrls || s.imageList;
        if (typeof imgs === 'string') {
          try { imgs = JSON.parse(imgs); } catch (e) { imgs = imgs.split(',').filter(Boolean); }
        }
        s._thumbUrl = Array.isArray(imgs) && imgs.length > 0 ? getAuthedImageUrl(imgs[0]) : '';
        s.completedTimeText = this._fmtDateTime(s.completedTime || s.completeTime);
      });
      this.setData({ secondaryList: list });
    } catch (e) { console.error('二次工艺加载失败', e); }
  },

  /* ============ 生产制单（工艺单，调用PC端同款API） ============
   * PC端生产制单核心：款式信息 + 生产要求(style.description) + 样衣审核 + 尺寸表 + 附件
   * 注意：BOM清单应在BOM配置阶段展示，生产制单中不再重复展示。
   */
  async loadProduction() {
    if (!this.data.styleId) return;
    try {
      const res = await production.getProductionSheet(this.data.styleId);
      const data = res || {};
      const style = data.style || {};
      const sizeList = _unwrapList(data.sizeList);
      const attachments = _unwrapList(data.attachments);
      // 预计算尺寸表：与PC端 buildProductionSheetHtml 一致，按部位+尺码展开
      var sizeNames = [];
      var sizeNameSet = {};
      var partNames = [];
      var partNameSet = {};
      var cellMap = {};
      var partMethodMap = {};
      (sizeList || []).forEach(function (row) {
        var sn = String(row.sizeName || '').trim();
        var pn = String(row.partName || '').trim();
        if (sn && !sizeNameSet[sn]) { sizeNameSet[sn] = true; sizeNames.push(sn); }
        if (pn && !partNameSet[pn]) { partNameSet[pn] = true; partNames.push(pn); }
        var key = pn + '__' + sn;
        cellMap[key] = row;
        if (pn && !partMethodMap[pn]) partMethodMap[pn] = String(row.measureMethod || '').trim();
      });
      var sortedSizeNames = sizeNames; // 保持原始顺序即可，如需排序可复用 splitSizeNames + sort
      var sizeTableRows = partNames.map(function (part) {
        var toleranceVal = null;
        var cells = sortedSizeNames.map(function (sn) {
          var key = part + '__' + sn;
          var cell = cellMap[key] || {};
          if (toleranceVal == null && cell.tolerance != null) toleranceVal = String(cell.tolerance);
          return cell.standardValue != null ? String(cell.standardValue) : '';
        });
        return {
          partName: part,
          measureMethod: partMethodMap[part] || '',
          tolerance: toleranceVal != null ? toleranceVal : null,
          cells: cells,
        };
      });
      // 样衣审核
      var reviewStatusMap = {
        PASS: { text: '通过', tone: 'success' },
        REWORK: { text: '需修改', tone: 'warning' },
        REJECT: { text: '不通过', tone: 'danger' },
      };
      var reviewStatus = style.sampleReviewStatus || '';
      var reviewInfo = reviewStatusMap[reviewStatus] || { text: '未审核', tone: 'default' };
      this.setData({
        productionData: {
          styleNo: style.styleNo || '',
          styleName: style.styleName || '',
          category: displayCategory(style.category || ''),
          season: displaySeason(style.season || ''),
          color: style.color || '',
          size: style.size || '',
          quantity: style.quantity || style.sampleQuantity || 0,
          customer: style.customerName || style.customer || '',
          salesChannel: style.salesChannel || '',
          tagPrice: style.tagPrice || '',
          salesPrice: style.salesPrice || '',
          price: style.price || '',
          coverUrl: style.cover || '',
          description: style.description || '',
          sampleReview: reviewStatus ? {
            status: reviewStatus,
            statusText: reviewInfo.text,
            tone: reviewInfo.tone,
            reviewer: style.sampleReviewer || '',
            reviewTime: style.sampleReviewTime ? this._fmtDateTime(style.sampleReviewTime) : '',
            reviewComment: style.sampleReviewComment || '',
          } : null,
          sizeTable: {
            sizes: sortedSizeNames,
            rows: sizeTableRows,
          },
          attachments: attachments,
        },
      });
    } catch (e) { console.error('生产制单加载失败', e); }
  },

  /* ============ 码数单价（调用PC端同款API） ============ */
  async loadSizePrice() {
    if (!this.data.styleId) return;
    try {
      const res = await production.listSizePrices(this.data.styleId);
      const list = _unwrapList(res);
      // 按工序分组，每道工序下按尺码展示单价
      var sizeSet = {};
      var processMap = {};
      (list || []).forEach(function (it) {
        var pc = String(it.processCode || '').trim();
        var pn = String(it.processName || '').trim();
        var key = pc || pn || '未命名工序';
        var sn = String(it.size || '').trim();
        if (sn) sizeSet[sn] = true;
        if (!processMap[key]) {
          processMap[key] = { processCode: pc, processName: pn || key, progressStage: it.progressStage || '', cells: {} };
        }
        processMap[key].cells[sn] = it.price != null ? Number(it.price) : null;
      });
      var sizes = Object.keys(sizeSet);
      var processes = Object.keys(processMap).map(function (k) { return processMap[k]; });
      this.setData({ sizePriceData: { sizes: sizes, processes: processes } });
    } catch (e) { console.error('码数单价加载失败', e); }
  },

  /* ============ 附件（通用） ============ */
  async loadAttachments() {
    if (!this.data.styleId) return;
    this.setData({ attachmentLoading: true });
    try {
      const res = await styleApi.listAttachments({ styleId: this.data.styleId });
      let list = _unwrapList(res);
      list = list.map(it => {
        const fileName = it.fileName || it.name || '';
        const fileType = it.fileType || it.type || '';
        const lowerName = (fileName + '.' + fileType).toLowerCase();
        let iconClass = 'ai-default';
        if (/\.pdf$/.test(lowerName)) iconClass = 'ai-pdf';
        else if (/\.(doc|docx|xls|xlsx|ppt|pptx|txt|md)$/.test(lowerName)) iconClass = 'ai-doc';
        else if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(lowerName)) iconClass = 'ai-img';
        else if (/\.(zip|rar|7z|tar|gz)$/.test(lowerName)) iconClass = 'ai-zip';
        else if (/\.(dxf|dwg|plt|dst|cad)$/.test(lowerName)) iconClass = 'ai-cad';
        return {
          ...it,
          fileSizeText: this.formatFileSize(it.fileSize || it.size || 0),
          createTimeText: it.createTime ? this._fmtDateTime(it.createTime) : '',
          _iconClass: iconClass,
          _url: it.url || it.fileUrl || '',
          _uploader: it.uploader || it.uploadBy || it.createBy || '',
        };
      });
      this.setData({ attachmentList: list });
      // 为当前阶段详情卡准备现场照片（仅图片，最多 4 张）
      var photos = list.filter(function (it) {
        var fn = (it.fileName || it.name || '') + '.' + (it.fileType || it.type || '');
        return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fn);
      }).slice(0, 4).map(function (it) {
        return { url: it._url, name: it.fileName || it.name || '' };
      });
      this.setData({ stagePhotos: photos });
    } catch (e) { console.error('附件加载失败', e); }
    this.setData({ attachmentLoading: false });
  },

  /** 上传附件 */
  onUploadAttachment() {
    wx.showActionSheet({
      itemList: ['拍照上传', '从相册选择', '选择文件（PDF/文档/CAD等）'],
      success: (res) => {
        if (res.tapIndex === 0) this.chooseImage('camera');
        else if (res.tapIndex === 1) this.chooseImage('album');
        else if (res.tapIndex === 2) this.chooseFile();
      },
    });
  },

  chooseImage(sourceType) {
    const that = this;
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: [sourceType],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFiles = res.tempFiles;
        if (tempFiles.length === 1) {
          that.uploadImage(tempFiles[0]);
        } else {
          wx.showLoading({ title: '上传中...', mask: true });
          let count = 0;
          tempFiles.forEach(tf => {
            that.uploadImage(tf, () => {
              count++;
              if (count === tempFiles.length) {
                wx.hideLoading();
                wx.showToast({ title: '上传完成', icon: 'success' });
                that.loadAttachments();
              }
            });
          });
        }
      },
    });
  },

  uploadImage(tempFile, callback) {
    const filePath = tempFile.tempFilePath || tempFile.path;
    const formData = {
      styleId: String(this.data.styleId),
      styleNo: (this.data.styleInfo && this.data.styleInfo.styleNo) || '',
      bizType: 'general',
    };
    _uploadFileWithAuth(filePath, formData, callback, this);
  },

  chooseFile() {
    const that = this;
    wx.chooseMessageFile({
      count: 5,
      type: 'file',
      extension: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'dxf', 'plt', 'ets', 'paj', 'zip', 'rar', 'txt'],
      success: (res) => {
        const tempFiles = res.tempFiles;
        if (!tempFiles || tempFiles.length === 0) return;
        wx.showLoading({ title: '上传中...', mask: true });
        let count = 0;
        tempFiles.forEach(tf => {
          that.uploadFileAttachment(tf, () => {
            count++;
            if (count === tempFiles.length) {
              wx.hideLoading();
              wx.showToast({ title: '上传完成', icon: 'success' });
              that.loadAttachments();
            }
          });
        });
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) return;
        wx.showToast({ title: '选择失败', icon: 'none' });
      },
    });
  },

  uploadFileAttachment(tempFile, callback) {
    const filePath = tempFile.path || tempFile.tempFilePath;
    const fileSize = tempFile.size;
    if (fileSize > 15 * 1024 * 1024) {
      wx.showToast({ title: '文件不能超过15MB', icon: 'none' });
      if (callback) callback();
      return;
    }
    const formData = {
      styleId: String(this.data.styleId),
      styleNo: (this.data.styleInfo && this.data.styleInfo.styleNo) || '',
      bizType: 'general',
    };
    _uploadFileWithAuth(filePath, formData, callback, this);
  },

  /** 附件点击：预览/下载 */
  onAttachmentTap(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url)) {
      const authedUrl = getAuthedImageUrl(url);
      wx.previewImage({ urls: [authedUrl], current: authedUrl });
      return;
    }
    if (/\.pdf$/i.test(url)) {
      this.previewPdf(url);
      return;
    }
    if (/\.(doc|docx|xls|xlsx|ppt|pptx)$/i.test(url)) {
      this.previewOffice(url);
      return;
    }
    wx.showActionSheet({
      itemList: ['下载到本地', '复制链接'],
      success: (res) => {
        if (res.tapIndex === 0) this.downloadFile(url);
        else if (res.tapIndex === 1) wx.setClipboardData({ data: url });
      },
    });
  },

  previewPdf(url) {
    _downloadWithAuth(url, (tempFilePath) => {
      wx.openDocument({
        filePath: tempFilePath,
        fileType: 'pdf',
        success: () => {},
        fail: () => wx.showToast({ title: '无法打开PDF', icon: 'none' }),
      });
    });
  },

  previewOffice(url) {
    _downloadWithAuth(url, (tempFilePath) => {
      let fileType = 'doc';
      if (/\.xlsx?$/.test(url)) fileType = 'xls';
      else if (/\.pptx?$/.test(url)) fileType = 'ppt';
      wx.openDocument({
        filePath: tempFilePath,
        fileType: fileType,
        success: () => {},
        fail: () => wx.showToast({ title: '无法打开文档', icon: 'none' }),
      });
    });
  },

  downloadFile(url) {
    _downloadWithAuth(url, (tempFilePath) => {
      wx.saveFileToDisk({
        tempFilePath: tempFilePath,
        success: () => wx.showToast({ title: '已保存', icon: 'success' }),
        fail: () => wx.showToast({ title: '保存失败', icon: 'none' }),
      });
    });
  },

  /** 删除附件 */
  onDeleteAttachment(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      confirmText: '删除',
      confirmColor: '#ff3b30',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await styleApi.deleteAttachment(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          that.loadAttachments();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  /** 二次工艺图片预览 */
  onSecondaryImageTap(e) {
    const urls = e.currentTarget.dataset.urls;
    const current = e.currentTarget.dataset.url;
    if (!urls || !urls.length) return;
    const authedUrls = urls.map(u => getAuthedImageUrl(u));
    wx.previewImage({ urls: authedUrls, current: getAuthedImageUrl(current) });
  },

  /* ============ 备注日志 ============ */
  /** 加载备注日志列表（与PC端 order-remark/list 对齐） */
  async loadRemarks() {
    const styleNo = (this.data.styleInfo && this.data.styleInfo.styleNo) || this.data.styleNo;
    if (!styleNo) return;
    this.setData({ remarkLoading: true });
    try {
      const res = await production.listOrderRemarks('style', styleNo);
      let list = _unwrapList(res);
      var BIZ_TYPE_LABELS = {
        style: '款式操作', pattern: '纸样操作', sample: '样衣操作', maintenance: '维护操作',
      };
      list = list.map(r => {
        var author = r.authorName || r.author || r.operatorName || r.createBy || '系统';
        var images = [];
        if (r.imageUrls) {
          try { images = JSON.parse(r.imageUrls); } catch (e) { images = []; }
        }
        var role = r.authorRole || '';
        if (BIZ_TYPE_LABELS[role]) role = BIZ_TYPE_LABELS[role];
        return Object.assign({}, r, {
          _createTimeText: this._fmtDateTime(r.createTime || r.createTimeStr),
          _author: author,
          _authorInitial: (author && author.length > 0) ? author.charAt(0).toUpperCase() : 'S',
          _authorRole: role,
          _content: r.content || r.remark || '',
          _images: images,
        });
      }).sort((a, b) => {
        // 按时间倒序
        const ta = a.createTime || '';
        const tb = b.createTime || '';
        return tb > ta ? 1 : (tb < ta ? -1 : 0);
      });
      this.setData({ remarkList: list });
    } catch (e) {
      console.error('备注日志加载失败', e);
    }
    this.setData({ remarkLoading: false });
  },

  /** 备注输入 */
  onRemarkInput(e) {
    this.setData({ remarkInput: e.detail.value });
  },

  onRemarkRoleInput(e) {
    this.setData({ remarkRoleInput: e.detail.value });
  },

  onPreviewRemarkImage(e) {
    const url = e.currentTarget.dataset.url;
    const allImages = (this.data.remarkList || []).reduce(function(arr, r) {
      return arr.concat(r._images || []);
    }, []);
    if (url) {
      wx.previewImage({ urls: allImages.length ? allImages : [url], current: url });
    }
  },

  /** 提交备注 */
  async onSubmitRemark() {
    const content = (this.data.remarkInput || '').trim();
    const styleNo = (this.data.styleInfo && this.data.styleInfo.styleNo) || this.data.styleNo;
    const role = (this.data.remarkRoleInput || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入备注内容', icon: 'none' });
      return;
    }
    if (!styleNo) {
      wx.showToast({ title: '缺少款式信息', icon: 'none' });
      return;
    }
    this.setData({ remarkSubmitting: true });
    try {
      await production.addOrderRemark('style', styleNo, content, role || undefined);
      wx.showToast({ title: '备注已添加', icon: 'success' });
      this.setData({ remarkInput: '', remarkRoleInput: '' });
      this.loadRemarks();
    } catch (e) {
      console.error('添加备注失败', e);
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
    this.setData({ remarkSubmitting: false });
  },

  /* ============ 设计稿交互 ============ */
  /** 修改信息 */
  onEditInfo() {
    var styleId = this.data.styleId;
    if (styleId) {
      wx.navigateTo({
        url: '/pages/sample-development/edit/index?id=' + styleId,
      });
    } else {
      wx.showToast({ title: '缺少款式信息', icon: 'none' });
    }
  },

  /** 提交审核 —— 展开页面内审核表单 */
  onSubmitReview() {
    this.setData({
      showReviewForm: true,
      reviewFormStatus: 'PASS',
      reviewFormComment: '',
    });
  },

  /** 取消审核表单 */
  onCancelReviewForm() {
    this.setData({ showReviewForm: false });
  },

  /** 审核结论选择变更 */
  onReviewStatusChange(e) {
    var val = e.detail.value;
    var options = ['PASS', 'REWORK', 'REJECT'];
    this.setData({ reviewFormStatus: options[val] || 'PASS' });
  },

  /** 审核评语输入 */
  onReviewCommentInput(e) {
    this.setData({ reviewFormComment: e.detail.value });
  },

  /** 确认提交审核 —— 调用后端 sample-review API */
  onConfirmSubmitReview() {
    var that = this;
    var styleId = this.data.styleId;
    var status = this.data.reviewFormStatus;
    var comment = (this.data.reviewFormComment || '').trim();

    if (!styleId) {
      wx.showToast({ title: '缺少款式信息', icon: 'none' });
      return;
    }

    var statusLabels = { PASS: '通过', REWORK: '需修改', REJECT: '不通过' };
    wx.showModal({
      title: '确认提交审核',
      content: '审核结论：' + statusLabels[status] + (comment ? '\n评语：' + comment : ''),
      confirmText: '确认提交',
      confirmColor: status === 'PASS' ? '#1677ff' : (status === 'REWORK' ? '#faad14' : '#ff4d4f'),
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '提交中...', mask: true });
          styleApi.saveSampleReview(styleId, {
            reviewStatus: status,
            reviewComment: comment,
            reviewImages: [],
          })
            .then(function () {
              wx.hideLoading();
              wx.showToast({ title: '审核提交成功', icon: 'success' });
              that.setData({ showReviewForm: false });
              // 刷新生产制单数据
              that.loadProduction();
            })
            .catch(function (err) {
              wx.hideLoading();
              var msg = (err && err.message) || '审核提交失败，请重试';
              wx.showToast({ title: msg, icon: 'none' });
            });
        }
      },
    });
  },

  /** 扫码更新 */
  onScanUpdate() {
    var patternId = this.data.patternId;
    if (patternId) {
      wx.navigateTo({
        url: '/pages/scan/index?patternId=' + patternId,
      });
    } else {
      wx.showToast({ title: '暂无可扫码任务', icon: 'none' });
    }
  },

  /** 上传现场照片（复用附件上传） */
  onUploadPhotoDetail() {
    this.chooseImage('camera');
  },

  /** 切换开发阶段快捷入口 */
  onSwitchDevStage(e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.stageKey) return;
    // 找到对应的阶段名称更新导航栏
    var stage = (this.data.devStages || []).find(function(s) { return s.key === key; });
    var newName = stage ? stage.name : '阶段详情';
    this.setData({ stageKey: key, navTitle: newName });
    wx.setNavigationBarTitle({ title: newName });
    this.loadStageData();
  },

  /**
   * 标记完成 —— 调用后端 stage-action API
   * 开发阶段（bom/pattern/size/process/secondary/production/sizePrice）走 styleInfo stage-action
   * 生产阶段（procurement/cutting/sewing/tail/warehousing）暂不支持移动端标记完成
   */
  onMarkComplete() {
    var that = this;
    var stageKey = this.data.stageKey;
    var styleId = this.data.styleId;
    var stageName = this.data.stageName;

    // stageKey → 后端 stage 参数映射
    var STAGE_KEY_MAP = {
      bom: 'bom',
      pattern: 'pattern',
      size: 'size',
      process: 'process',
      secondary: 'secondary',
      production: 'production',
      sizePrice: 'size-price',
    };
    var stage = STAGE_KEY_MAP[stageKey];

    if (!stage) {
      wx.showToast({ title: '该阶段暂不支持移动端标记完成', icon: 'none' });
      return;
    }
    if (!styleId) {
      wx.showToast({ title: '缺少款式信息', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '标记完成',
      content: '确定要将「' + stageName + '」标记为完成吗？完成后不可撤销。',
      confirmText: '确认完成',
      confirmColor: '#1677ff',
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '提交中...', mask: true });
          styleApi.stageAction(styleId, stage, 'complete')
            .then(function () {
              wx.hideLoading();
              wx.showToast({ title: '标记成功', icon: 'success' });
              // 刷新页面数据
              that.loadStageData();
              if (that.data.styleInfo) {
                that.buildTimeline(that.data.styleInfo);
              }
            })
            .catch(function (err) {
              wx.hideLoading();
              var msg = (err && err.message) || '标记失败，请重试';
              wx.showToast({ title: msg, icon: 'none' });
            });
        }
      },
    });
  },

  /** 时间轴 - 查看阶段详情（内联切换，不跳转页面） */
  onViewStageDetail(e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.stageKey) return;
    var stage = (this.data.timelineStages || []).find(function (s) {
      return s.key === key;
    });
    if (!stage) return;

    var stageName = STAGE_NAMES[key] || key;
    this.setData({
      stageKey: key,
      stageName: stageName,
      stage: stage,
    });

    // 重新加载该阶段的数据
    var self = this;
    this.loadStageData().then(function () {
      // 重新构建时间轴和阶段详情
      if (self.data.styleInfo) {
        self.buildTimeline(self.data.styleInfo);
      }
      // 滚动到顶部
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    }).catch(function (err) {
      console.error('[stage-detail] switch stage error:', err);
    });
  },

  /** 时间轴 - 扫码进度 */
  onScanProgress() {
    this.onScanUpdate();
  },

  /** 预览现场照片 */
  onPreviewStagePhoto(e) {
    var current = e.currentTarget.dataset.url;
    var urls = (this.data.stagePhotos || []).map(function (p) { return p.url; });
    if (!urls.length) return;
    wx.previewImage({ urls: urls, current: current });
  },

  /** 预览生产制单封面图 */
  onPreviewImage(e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },
});
