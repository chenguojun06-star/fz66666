const { style } = require('../../../utils/api-modules/style-warehouse');
const production = require('../../../utils/api-modules/production');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');
const { SAMPLE_PARENT_STAGES, SAMPLE_PROGRESS_NODE_ALIASES, getStageName, resolveStageKey } = require('../../../utils/sampleHelper');
const { enrichBomList, processTypeLabel, processStatusLabel, PATTERN_STATUS_MAP } = require('../../../shared/enumLabels');
const PatternScanProcessor = require('../../scan/handlers/PatternScanProcessor');
const { displayCategory } = require('../../../utils/displayHelper');

function formatFileSize(size) {
  if (!size) return '';
  if (size > 1024 * 1024) {
    return (size / 1024 / 1024).toFixed(1) + 'MB';
  }
  return (size / 1024).toFixed(0) + 'KB';
}

const REMARK_ROLES = [
  { key: '', label: '选择角色' },
  { key: 'designer', label: '设计师' },
  { key: 'pattern_maker', label: '制版师' },
  { key: 'merchandiser', label: '跟单员' },
  { key: 'factory', label: '工厂' },
  { key: 'qc', label: '质检' },
];

const AVATAR_COLORS = [
  'var(--color-primary)',
  'var(--color-success)',
  'var(--color-text-secondary)',
  'var(--color-warning)',
  'var(--color-purple)',
];

const SEASON_MAP = {
  SPRING: '春季',
  SUMMER: '夏季',
  AUTUMN: '秋季',
  WINTER: '冬季',
  SPRING_SUMMER: '春夏',
  AUTUMN_WINTER: '秋冬',
};

// 本地兜底：PATTERN_STATUS_MAP 未覆盖的样衣状态
const LOCAL_PATTERN_STATUS_FALLBACK = {
  REWORK: '返工中',
  CANCELLED: '已取消',
  CLOSED: '已关单',
};

function clampPercent(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeProgressNodes(raw) {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw;
  return {};
}

function getSampleNodeProgress(snapshot, key) {
  const nodes = normalizeProgressNodes(snapshot && snapshot.progressNodes);
  const aliases = SAMPLE_PROGRESS_NODE_ALIASES[key] || [key];
  for (let i = 0; i < aliases.length; i++) {
    const value = nodes[aliases[i]];
    if (value !== undefined && value !== null) {
      return clampPercent(value);
    }
  }
  return 0;
}

function isSampleSnapshotFullyCompleted(snapshot) {
  if (!snapshot) return false;
  var status = String(snapshot.status || snapshot._status || '').trim().toUpperCase();
  // 完成态状态直接返回 true（与后端对齐）
  if (status === 'PRODUCTION_COMPLETED' || status === 'COMPLETED' || status === 'WAREHOUSE_IN' || status === 'WAREHOUSE_OUT') {
    return true;
  }
  return SAMPLE_PARENT_STAGES.every(function (s) {
    if (s.key === 'procurement') {
      // 采购阶段用 procurementProgress 判断
      var pp = snapshot.procurementProgress;
      var pct = (pp && typeof pp === 'object') ? pp.percent : (pp || 0);
      return Number(pct) >= 100;
    }
    return getSampleNodeProgress(snapshot, s.key) >= 100;
  });
}

function formatNodeTime(value) {
  if (!value) return '待领取';
  const s = String(value).trim();
  // 后端返回格式为 MM-dd HH:mm，避免 replace 成 MM/DD HH:mm 导致 iOS 无法解析
  const match = s.match(/^(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (match) {
    return match[1] + '-' + match[2];
  }
  const d = new Date(s.replace(/-/g, '/'));
  if (isNaN(d.getTime())) return '待领取';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return m + '-' + day;
}

Page({
  data: {
    styleId: '',
    patternId: '',
    styleInfo: null,
    patternSnapshot: null,
    loading: true,

    // 阶段进度
    stages: [],
    noProcessConfig: false,    // D-182：明确未配置工序时为 true，阶段区显示提示而非假进度圆点
    activeStageKey: '',        // 当前选中的阶段（页面内切换）
    activeStageName: '',
    progressPercent: 0,
    completedCount: 0,
    totalCount: 0,

    // 工序（按 progressStage 分组，父子结构）
    allProcesses: [],          // 全部工序（从 /api/style/process/list 加载）
    processLoading: false,

    // 工序内嵌扫码记录（用于工序展开区展示，不再单独作为 tab）
    scanRecords: [],
    scanLoading: false,

    // 备注日志（BOM 清单下方 tab，与 PC 端同步：拉取 t_order_remark where targetType=pattern）
    patternRemarkList: [],
    patternRemarkLoading: false,

    // BOM 物料
    bomList: [],
    bomLoading: false,

    // 尺寸表
    sizeList: [],
    sizeLoading: false,

    // 二次工艺
    secondaryList: [],
    secondaryLoading: false,

    // 展开的阶段 key
    expandedStageKey: '',

    // 资料标签
    activeTab: 'bom',       // bom/pattern/size/process/secondary/remark/attachment
    tabs: [
      { key: 'bom',        name: '物料清单' },
      { key: 'pattern',    name: '纸样' },
      { key: 'size',       name: '尺寸表' },
      { key: 'process',    name: '工序' },
      { key: 'secondary',  name: '二次工艺' },
      { key: 'remark',     name: '备注日志' },
      { key: 'attachment', name: '附件' },
    ],

    // 附件
    attachmentList: [],
    attachmentLoading: false,

    // 备注
    remarkList: [],
    remarkLoading: false,
    remarkInput: '',
    remarkRole: '',
    remarkRoleIndex: 0,
    remarkRoles: REMARK_ROLES,
    submittingRemark: false,

    // 进度编辑器（与 PC 端 progressEditorOpen 对齐）
    progressEditor: {
      visible: false,
      stageKey: '',
      stageName: '',
      percent: 0,
    },
    progressSaving: false,
  },

  onLoad(options) {
    const styleId = options.styleId || '';
    const patternId = options.id || options.patternId || '';
    if (!styleId && !patternId) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      return;
    }
    this.setData({ styleId, patternId });
    if (!styleId && patternId) {
      this.loadStyleIdFromPattern(patternId);
    } else {
      this.loadStyleDetail();
    }
  },

  onPullDownRefresh() {
    this.loadStyleDetail().then(() => wx.stopPullDownRefresh());
  },

  onShow() {
    this._bindEvents();
  },

  onHide() {
    this._unbindEvents();
  },

  onUnload() {
    this._unbindEvents();
  },

  _bindEvents() {
    this._onDataChanged = (data) => {
      if (data && (data.type === 'sample' || data.type === 'style' || data.type === 'scan')) {
        this.loadStyleDetail();
      }
    };
    this._onRefreshAll = () => {
      this.loadStyleDetail();
    };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindEvents() {
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },

  async loadStyleIdFromPattern(patternId) {
    this.setData({ loading: true });
    try {
      const res = await production.getPatternDetail(patternId);
      const detail = res?.data || res || {};
      const styleId = detail.styleId || detail.styleNo || '';
      if (styleId) {
        this.setData({ styleId });
        this.loadStyleDetail();
      } else {
        this.processStyleInfo(detail);
        this.setData({ loading: false });
        wx.showToast({ title: '该样衣暂无关联款式', icon: 'none' });
      }
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadStyleDetail() {
    this.setData({ loading: true });
    try {
      const styleInfo = await this._fetchStyleInfo(this.data.styleId);

      // 同步加载 PatternProductionSnapshot（云端真实阶段进度）
      const snapshot = await this._loadPatternSnapshot(styleInfo);

      // 用 PatternProduction 的状态和交期回填 styleInfo，确保顶部卡片显示正确
      if (snapshot) {
        styleInfo._patternStatus = snapshot._status || '';
        if (snapshot.deliveryTime) styleInfo.deliveryTime = snapshot.deliveryTime;
        if (snapshot.coverImage) styleInfo._coverUrl = getAuthedImageUrl(snapshot.coverImage);
      }

      this.processStyleInfo(styleInfo);
      this.setData({ patternSnapshot: snapshot });
      // D-182：拉取真实工序配置——只渲染有子工序配置的父阶段，未配置不显示（避免误以为已配置）
      let configStageKeys = null; // null=配置未知（无patternId/接口失败），回退旧的4阶段渲染
      if (snapshot && snapshot.id) {
        try {
          const configRes = await production.getPatternProcessConfig(snapshot.id);
          const configNodes = (configRes && (configRes.data || configRes)) || [];
          if (Array.isArray(configNodes) && configNodes.length > 0) {
            configStageKeys = {};
            configNodes.forEach(function (n) {
              const key = resolveStageKey((n && (n.progressStage || n.name)) || '');
              if (key && key !== 'unknown' && key !== 'procurement' && key !== 'warehousing') {
                configStageKeys[key] = true;
              }
            });
          } else {
            configStageKeys = {}; // 明确无配置 → 阶段区显示"未配置"提示
          }
        } catch (_e) {
          configStageKeys = null;
        }
      }
      this.buildStages(snapshot, configStageKeys);

      this.setData({ loading: false });
      this.loadAttachments();
      this.loadRemarks();
      this._loadProcessesAndScans();
      this._loadBomAndSizes();
      this._loadPatternRemarks();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async _fetchStyleInfo(styleId) {
    const res = await style.getStyleDetail(styleId);
    return res?.data || res || {};
  },

  async _loadPatternSnapshot(styleInfo) {
    const styleNo = styleInfo.styleNo || styleInfo.styleCode || '';
    const patternId = this.data.patternId;

    // 优先用已有的 patternId 直接查详情
    if (patternId) {
      try {
        const res = await production.getPatternDetail(patternId);
        const detail = res?.data || res || {};
        if (detail && (detail.id || detail.styleId)) {
          return this._normalizeSnapshot(detail);
        }
      } catch (_e) { /* ignore */ }
    }

    // 否则按 styleNo / styleId 搜索 pattern 列表匹配
    const keyword = styleNo || String(styleInfo.id || '');
    if (!keyword) return null;
    try {
      const res = await production.listPatterns({ page: 1, pageSize: 20, keyword: keyword });
      const records = (res?.data?.records || res?.data || res?.records || []);
      const matched = records.find(function (item) {
        return String(item.id || '') === String(patternId || '')
          || String(item.styleId || '') === String(styleInfo.id || '')
          || String(item.styleNo || '') === String(styleNo || '');
      });
      return matched ? this._normalizeSnapshot(matched) : null;
    } catch (_e) {
      return null;
    }
  },

  _normalizeSnapshot(item) {
    if (!item) return null;
    const status = String(item.status || '').trim().toUpperCase();
    const progressNodes = normalizeProgressNodes(item.progressNodes);
    const procurementProgress = clampPercent(
      Number(
        (item.procurementProgress && typeof item.procurementProgress === 'object'
          ? item.procurementProgress.percent
          : item.procurementProgress) || 0,
      ),
    );
    return Object.assign({}, item, {
      _status: status,
      _progressNodes: progressNodes,
      _procurementProgress: procurementProgress,
      _receiver: item.receiver || '',
      _receiveTime: formatNodeTime(item.receiveTime),
      _completeTime: formatNodeTime(item.completeTime),
      _reviewStatus: String(item.reviewStatus || '').trim().toUpperCase(),
      _reviewTime: formatNodeTime(item.reviewTime),
      // D-181 对齐PC：审核/入库是详情页动作（非工序）
      // 审核通过 = reviewStatus/reviewResult 为 APPROVED（PC 端历史值为 PASS，兼容）
      // 注意：handleWarehouseIn 入库后 status=COMPLETED（已完成=已在库闭环），
      // D-183：入库按钮只在「生产完成+审核通过+尚未入库」出现，已入库(COMPLETED)绝不再显示
      _showReviewAction: status === 'PRODUCTION_COMPLETED'
        && !['APPROVED', 'PASS'].includes(String(item.reviewStatus || '').trim().toUpperCase())
        && !['APPROVED', 'PASS'].includes(String(item.reviewResult || '').trim().toUpperCase()),
      _showWarehouseInAction: (
        ['APPROVED', 'PASS'].includes(String(item.reviewStatus || '').trim().toUpperCase())
        || ['APPROVED', 'PASS'].includes(String(item.reviewResult || '').trim().toUpperCase())
      ) && status === 'PRODUCTION_COMPLETED',
      _isReceived: ['IN_PROGRESS', 'PRODUCTION_COMPLETED', 'COMPLETED', 'WAREHOUSE_IN', 'WAREHOUSE_OUT'].includes(status)
        || Boolean(item.receiver)
        || !!item.receiveTime,
      _isFullyCompleted: isSampleSnapshotFullyCompleted({
        status: status,
        progressNodes: progressNodes,
        procurementProgress: item.procurementProgress,
      })
        && ['PRODUCTION_COMPLETED', 'COMPLETED', 'WAREHOUSE_IN', 'WAREHOUSE_OUT'].includes(status),
      _isScrapped: status === 'SCRAPPED',
    });
  },

  buildStages(snapshot, configStageKeys) {
    // D-182：configStageKeys 为 null 时（配置未知，如无 patternId/接口失败）回退旧的4阶段渲染；
    // 为空对象时明确无配置 → 不渲染阶段圆点，显示"未配置"提示；
    // 有配置时只渲染配置了子工序的父阶段
    configStageKeys = configStageKeys || null;
    const stageDefs = configStageKeys === null
      ? SAMPLE_PARENT_STAGES
      : SAMPLE_PARENT_STAGES.filter(function (s) { return configStageKeys[s.key]; });
    const noProcessConfig = configStageKeys !== null && stageDefs.length === 0;

    if (!snapshot) {
      // 无样衣生产单：不展示假进度圆点
      this.setData({
        stages: [],
        noProcessConfig: false,
        progressPercent: 0,
        completedCount: 0,
        totalCount: 0,
      });
      return;
    }

    if (noProcessConfig) {
      // 明确未配置工序：不渲染阶段圆点，显示"未配置"提示（避免误以为已配置）
      this.setData({
        stages: [],
        noProcessConfig: true,
        progressPercent: 0,
        completedCount: 0,
        totalCount: 0,
      });
      return;
    }

    const completed = snapshot._isFullyCompleted;
    const received = snapshot._isReceived;

    // 行业标准：生产进度只算生产工序（裁剪/二次工艺/车缝/尾部），不包含采购/入库
    // 采购完成看采购单状态（到货率/确认完成），入库完成看仓库收货（成品入库记录）
    // 与 stageDetection.js NON_GATE_STAGES 对齐
    const NON_GATE_STAGE_KEYS = { procurement: true, warehousing: true };
    let totalPercent = 0; // 只累加生产工序的进度
    let productionCount = 0; // 生产工序数量
    const canOperate = received && !snapshot._isScrapped && !completed;
    const stages = SAMPLE_PARENT_STAGES.map(function (s, idx) {
      let percent;
      if (completed) {
        percent = 100;
      } else if (s.key === 'procurement') {
        percent = snapshot._procurementProgress;
      } else if (received) {
        percent = getSampleNodeProgress(snapshot, s.key);
      } else {
        percent = 0;
      }
      // 只累加生产工序的进度（采购/入库不参与核心生产进度计算）
      if (!NON_GATE_STAGE_KEYS[s.key]) {
        totalPercent += percent;
        productionCount++;
      }
      const status = percent >= 100 ? 'completed' : (percent > 0 ? 'in_progress' : 'not_started');
      // 未领取时所有阶段都可点击（触发领取），已领取时仅未完成的可点击
      const clickable = !snapshot._isScrapped && !completed && status !== 'completed';
      return {
        key: s.key,
        name: s.name,
        index: idx + 1,
        percent: percent,
        status: status,
        statusText: percent >= 100 ? '已完成' : (percent > 0 ? percent + '%' : '待开始'),
        _clickable: clickable,
        _showLine: idx > 0,
      };
    });

    // 完成数和总数只算生产工序（采购/入库不参与）
    const productionStages = stages.filter(function (s) { return !NON_GATE_STAGE_KEYS[s.key]; });
    const completedCount = productionStages.filter(function (s) { return s.status === 'completed'; }).length;
    const totalCount = productionCount;
    const progressPercent = totalCount > 0 ? Math.round(totalPercent / totalCount) : 0;

    this.setData({
      stages: stages,
      noProcessConfig: false,
      completedCount: completedCount,
      totalCount: totalCount,
      progressPercent: progressPercent,
    });
  },

  processStyleInfo(info) {
    if (!info) return;
    const rawCover = info.cover || info.coverUrl || info.coverImage || info.image || '';
    info._coverUrl = getAuthedImageUrl(rawCover);
    // 状态标签来自 PatternProduction.status，不是 StyleInfo.status(ENABLED/DISABLED)
    info._statusTag = this.getStatusLabel(info._patternStatus || info.status);
    info._statusColorVar = this.getStatusColorVar(info._patternStatus || info.status);
    info._metaText = this.buildMetaText(info);
    info._sizeText = info.sizes || info.sizeRange || info.size || '';
    info._colorText = info.color || info.colors || '';
    info._quantityText = info.sampleQuantity || info.quantity || info.orderQty || '';
    // 交板日期优先用 PatternProduction.deliveryTime
    info._deliveryDate = this.formatDate(info.deliveryTime || info.deliveryDate);
    // 倒计时/逾期用 PatternProduction.status 判断是否已完成
    var patternStatus = info._patternStatus || '';
    info._daysLeftText = this.calcDaysLeft(info.deliveryTime || info.deliveryDate, patternStatus);
    info._overdue = this.isOverdue(info.deliveryTime || info.deliveryDate, patternStatus);
    // P2：小程序补样衣完成/推送下单入口（此前仅 PC 端可操作）
    var sampleStatus = String(info.sampleStatus || '').trim().toUpperCase();
    info._canCompleteSample = sampleStatus === 'IN_PROGRESS';
    info._canPushToOrder = sampleStatus === 'COMPLETED' && Number(info.pushedToOrder) !== 1;
    this.setData({ styleInfo: info });
  },

  /** 完成样衣阶段（stage=sample action=complete） */
  onCompleteSampleTap() {
    const styleId = this.data.styleId;
    if (!styleId) return;
    wx.showModal({
      title: '完成样衣',
      content: '确认该款样衣已制作完成？完成后可推送到下单管理。',
      confirmColor: 'var(--color-primary)',
      success: (res) => {
        if (!res.confirm) return;
        style.stageAction(styleId, 'sample', 'complete')
          .then(() => {
            wx.showToast({ title: '样衣已完成', icon: 'success' });
            this.loadStyleDetail();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.errMsg) || '操作失败', icon: 'none' });
          });
      },
    });
  },

  /** 推送到下单管理（同步 BOM/纸样/尺寸表/工序单价） */
  onPushToOrderTap() {
    const styleId = this.data.styleId;
    if (!styleId) return;
    wx.showModal({
      title: '推送到下单管理',
      content: '将同步物料清单、纸样、尺寸表、工序单价到下单管理，确认推送？',
      confirmColor: 'var(--color-primary)',
      success: (res) => {
        if (!res.confirm) return;
        style.pushToOrderManagement(styleId, null, '小程序端推送')
          .then(() => {
            wx.showToast({ title: '推送成功', icon: 'success' });
            this.loadStyleDetail();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.errMsg) || '推送失败', icon: 'none' });
          });
      },
    });
  },

  getStatusLabel(status) {
    if (!status) return '';
    var upper = String(status).trim().toUpperCase();
    return PATTERN_STATUS_MAP[upper] || LOCAL_PATTERN_STATUS_FALLBACK[upper] || '';
  },

  getStatusColorVar(status) {
    const map = {
      'PENDING': 'var(--color-warning)',
      'IN_PROGRESS': 'var(--color-primary)',
      'PRODUCTION_COMPLETED': 'var(--color-success)',
      'COMPLETED': 'var(--color-success)',
      'WAREHOUSE_IN': 'var(--color-text-tertiary)',
      'WAREHOUSE_OUT': 'var(--color-text-tertiary)',
      'REWORK': 'var(--color-danger)',
      'CANCELLED': 'var(--color-danger)',
      'SCRAPPED': 'var(--color-text-tertiary)',
      'CLOSED': 'var(--color-text-tertiary)',
    };
    return map[status] || 'var(--color-text-tertiary)';
  },

  buildMetaText(info) {
    const parts = [];
    // 客户：StyleInfo 用 customer/customerName，enrichRecord 也用 customer
    if (info.customer || info.customerName) parts.push(info.customer || info.customerName);
    // 跟单员：StyleInfo 用 orderType 字段存储跟单员
    if (info.merchandiser || info.merchandiserName || info.orderType) {
      parts.push('跟单: ' + (info.merchandiser || info.merchandiserName || info.orderType));
    }
    let category = displayCategory(info.category);
    if (category) parts.push(category);
    let season = info.season;
    if (season && SEASON_MAP[season]) season = SEASON_MAP[season];
    if (season) parts.push(season);
    return parts.join(' · ');
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(String(dateStr).replace(/-/g, '/'));
      if (isNaN(d.getTime())) return '';
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    } catch (e) { return ''; }
  },

  calcDaysLeft(dateStr, status) {
    if (!dateStr) return '';
    if (['COMPLETED', 'WAREHOUSE_IN', 'WAREHOUSE_OUT', 'CANCELLED', 'SCRAPPED', 'CLOSED'].includes(status)) return '';
    try {
      const due = new Date(String(dateStr).replace(/-/g, '/'));
      if (isNaN(due.getTime())) return '';
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      if (diff < 0) return '逾期' + Math.abs(diff) + '天';
      if (diff === 0) return '今天交板';
      return diff + '天';
    } catch (e) { return ''; }
  },

  isOverdue(dateStr, status) {
    if (!dateStr) return false;
    if (['COMPLETED', 'WAREHOUSE_IN', 'WAREHOUSE_OUT', 'CANCELLED', 'SCRAPPED', 'CLOSED'].includes(status)) return false;
    try {
      const due = new Date(String(dateStr).replace(/-/g, '/'));
      const now = new Date();
      return due < now;
    } catch (e) { return false; }
  },

  // === 附件 ===

  async loadAttachments() {
    this.setData({ attachmentLoading: true });
    try {
      const res = await style.listAttachments({ styleId: this.data.styleId });
      const rawList = res?.data?.records || res?.data || res?.records || [];
      const attachmentList = rawList.map(function(item) {
        const uploader = item.uploader || item.uploadByName || item.createdByName || '';
        const uploadDate = this.formatDate(item.createTime || item.createdAt || item.uploadTime);
        const metaParts = [];
        if (item.fileSizeText || formatFileSize(item.fileSize)) metaParts.push(item.fileSizeText || formatFileSize(item.fileSize));
        if (uploader) metaParts.push(uploader);
        if (uploadDate) metaParts.push(uploadDate.substring(5));
        return Object.assign({}, item, {
          fileSizeText: formatFileSize(item.fileSize),
          _metaText: metaParts.join(' · '),
        });
      }.bind(this));
      this.setData({ attachmentList: attachmentList });
    } catch (_e) {
      // 附件加载失败不阻塞主流程
    }
    this.setData({ attachmentLoading: false });
  },

  onUploadAttachment() {
    const that = this;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: async function (res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        wx.showLoading({ title: '上传中...' });
        try {
          const uploadRes = await new Promise((resolve, reject) => {
            wx.uploadFile({
              url: (getApp().globalData && getApp().globalData.baseUrl || '') + '/api/file/upload',
              filePath: file.path,
              name: 'file',
              header: that._getAuthHeader(),
              success: (r) => {
                try {
                  const data = JSON.parse(r.data);
                  resolve(data);
                } catch (_e) {
                  reject(new Error('上传响应解析失败'));
                }
              },
              fail: reject,
            });
          });
          const fileUrl = uploadRes.data || uploadRes.url || '';
          if (!fileUrl) throw new Error('上传返回为空');
          await style.uploadAttachment({
            styleId: that.data.styleId,
            fileName: file.name,
            fileUrl: fileUrl,
            fileSize: file.size,
            fileType: file.name ? file.name.split('.').pop() : '',
          });
          wx.hideLoading();
          wx.showToast({ title: '上传成功', icon: 'success' });
          that.loadAttachments();
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      },
    });
  },

  onDownloadAttachment(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.showLoading({ title: '下载中...' });
    wx.downloadFile({
      url: url,
      success: function (res) {
        wx.hideLoading();
        if (res.statusCode === 200) {
          wx.openDocument({
            filePath: res.tempFilePath,
            fail: function () {
              wx.showToast({ title: '无法打开此文件', icon: 'none' });
            },
          });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
      },
    });
  },

  onDeleteAttachment(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const that = this;
    wx.showModal({
      title: '删除附件',
      content: '确认删除该附件？',
      success: async function (res) {
        if (!res.confirm) return;
        try {
          await style.deleteAttachment(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          that.loadAttachments();
        } catch (_e) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  _getAuthHeader() {
    const app = getApp();
    const token = app && app.globalData && app.globalData.token;
    return token ? { Authorization: 'Bearer ' + token } : {};
  },

  // === 备注模块 ===

  async loadRemarks() {
    const styleInfo = this.data.styleInfo || {};
    const targetNo = styleInfo.styleNo || styleInfo.styleCode || '';
    if (!targetNo) return;
    this.setData({ remarkLoading: true });
    try {
      const res = await production.listOrderRemarks('style', targetNo);
      const list = res?.data?.records || res?.data || res?.records || [];
      const remarkList = (Array.isArray(list) ? list : []).map(function(item, idx) {
        const authorName = item.authorName || item.createdByName || '匿名';
        return Object.assign({}, item, {
          _timeText: this.formatRemarkTime(item.createTime || item.createdAt),
          _roleLabel: this.getRoleLabel(item.authorRole),
          _avatarText: authorName.charAt(0),
          _avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
          _authorName: authorName,
        });
      }.bind(this));
      this.setData({ remarkList: remarkList });
    } catch (_e) {
      // 备注加载失败不阻塞主流程
    }
    this.setData({ remarkLoading: false });
  },

  getRoleLabel(role) {
    const found = REMARK_ROLES.find(r => r.key === role);
    return found && found.label || role || '';
  },

  formatRemarkTime(t) {
    if (!t) return '';
    const s = String(t);
    if (s.length >= 16) return s.substring(5, 16).replace('T', ' ');
    if (s.length >= 10) return s.substring(5);
    return s;
  },

  onRemarkInput(e) {
    this.setData({ remarkInput: e.detail.value });
  },

  onRemarkRoleChange(e) {
    const idx = Number(e.detail.value);
    const role = REMARK_ROLES[idx] || {};
    this.setData({ remarkRoleIndex: idx, remarkRole: role.key });
  },

  async onSubmitRemark() {
    const content = (this.data.remarkInput || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入备注内容', icon: 'none' });
      return;
    }
    const styleInfo = this.data.styleInfo || {};
    const targetNo = styleInfo.styleNo || styleInfo.styleCode || '';
    if (!targetNo) return;
    this.setData({ submittingRemark: true });
    try {
      await production.addOrderRemark('style', targetNo, content, this.data.remarkRole || undefined);
      this.setData({ remarkInput: '', remarkRole: '', remarkRoleIndex: 0 });
      wx.showToast({ title: '备注已提交', icon: 'success' });
      this.loadRemarks();
    } catch (e) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
    this.setData({ submittingRemark: false });
  },

  // === 备注日志（与 PC 端同步：拉取 t_order_remark where targetType=pattern） ===

  async _loadPatternRemarks() {
    const snapshot = this.data.patternSnapshot || {};
    const pid = String(snapshot.id || this.data.patternId || '');
    if (!pid) return;
    this.setData({ patternRemarkLoading: true });
    try {
      const res = await production.listOrderRemarks('pattern', pid);
      const list = res?.data?.records || res?.data || res?.records || [];
      const rawList = Array.isArray(list) ? list : [];
      const patternRemarkList = rawList.map(function (item, idx) {
        const authorName = item.authorName || item.createdByName || '匿名';
        return Object.assign({}, item, {
          _timeText: this._formatPatternRemarkTime(item.createTime || item.createdAt),
          _roleLabel: item.authorRole || '',
          _avatarText: authorName.charAt(0),
          _avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
          _authorName: authorName,
          _content: item.content || '',
        });
      }.bind(this));
      this.setData({ patternRemarkList: patternRemarkList });
    } catch (_e) {
      // 备注日志加载失败不阻塞主流程
    }
    this.setData({ patternRemarkLoading: false });
  },

  _formatPatternRemarkTime(t) {
    if (!t) return '';
    const s = String(t).replace('T', ' ');
    // 后端格式：yyyy-MM-dd HH:mm:ss
    if (s.length >= 16) return s.substring(5, 16);
    if (s.length >= 10) return s.substring(5);
    return s;
  },

  // === 阶段操作（页面内切换，不跳转）===

  onStageTap(e) {
    const stageKey = e.currentTarget.dataset.key;
    if (!stageKey) return;
    // 展开/收起阶段内容
    if (this.data.expandedStageKey === stageKey) {
      this.setData({ expandedStageKey: '' });
    } else {
      this.setData({ expandedStageKey: stageKey });
    }
  },

  /** 跳转采购管理（样衣采购闭环：patternProductionId 查询，sourceType=sample） */
  onGoProcurement() {
    const { patternId, styleInfo } = this.data;
    if (!patternId) return;
    const styleNo = (styleInfo && styleInfo.styleNo) || '';
    wx.navigateTo({
      url: '/pages/procurement/task-detail/index?patternProductionId=' +
        encodeURIComponent(patternId) +
        '&styleNo=' + encodeURIComponent(styleNo) +
        '&sourceType=sample',
      fail: () => wx.showToast({ title: '跳转失败', icon: 'none' }),
    });
  },

  // === 工序项点击展开：显示该工序的实际扫码记录 ===
  onProcessItemTap(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (Number.isNaN(idx) || idx < 0 || idx >= this.data.allProcesses.length) return;
    const cur = this.data.allProcesses[idx];
    if (!cur || cur._scanCount === 0) {
      // 无扫码记录：不展开，可加提示
      wx.showToast({ title: '该工序暂无扫码记录', icon: 'none', duration: 1200 });
      return;
    }
    this.setData({
      ['allProcesses[' + idx + ']._expanded']: !cur._expanded,
    });
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key) this.setData({ activeTab: key });
  },

  /** 按阶段过滤工序和扫码记录 */
  _filterStageContent(stageKey) {
    // 工序按 progressStage 过滤
    const stageKeyLower = String(stageKey || '').toLowerCase();
    const stageAliases = SAMPLE_PROGRESS_NODE_ALIASES[stageKey] || [stageKey];
    const stageProcesses = (this.data.allProcesses || []).filter(function (p) {
      const ps = String(p.progressStage || p.stage || '').toLowerCase();
      if (!ps) return false;
      return stageAliases.some(function (alias) {
        return ps === alias.toLowerCase();
      });
    });

    // 扫码记录按 progressStage 过滤
    const stageScanRecords = (this.data.scanRecords || []).filter(function (r) {
      const ps = String(r.progressStage || '').toLowerCase();
      const pn = String(r.processName || '').toLowerCase();
      if (!ps && !pn) return false;
      return stageAliases.some(function (alias) {
        return ps === alias.toLowerCase() || pn.indexOf(alias.toLowerCase()) >= 0;
      });
    });

    this.setData({ stageProcesses: stageProcesses, stageScanRecords: stageScanRecords });
  },

  /** 加载款式工序 + 扫码记录（一次性全量加载，页面内按阶段过滤） */
  async _loadProcessesAndScans() {
    if (!this.data.styleId && !this.data.patternId) return;

    this.setData({ processLoading: true, scanLoading: true });

    // 并行加载工序和扫码记录
    const tasks = [];

    // 1. 工序：GET /api/style/process/list?styleId=xxx
    if (this.data.styleId) {
      tasks.push(
        style.listProcesses({ styleId: this.data.styleId })
          .then(function (res) {
            const list = (res && res.data) || res || [];
            return Array.isArray(list) ? list : (list.records || []);
          }).catch(function () { return []; })
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    // 2. 扫码记录：GET /api/production/pattern/{pid}/scan-records
    let pid = this.data.patternId;
    if (!pid && this.data.patternSnapshot && this.data.patternSnapshot.id) {
      pid = this.data.patternSnapshot.id;
    }
    if (pid) {
      tasks.push(
        production.getPatternScanRecords(pid)
          .then(function (res) {
            const list = (res && res.data) || res || [];
            return Array.isArray(list) ? list : (list.records || []);
          }).catch(function () { return []; })
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    const [processes, scans] = await Promise.all(tasks);

    // D-170：与 PC 端对齐——采购/入库是独立流程，不进工序列表（客户端兜底过滤）
    const isNonProductionProcess = function (p) {
      const stage = String(p.progressStage || p.stage || '').trim();
      const name = String(p.processName || p.name || '').trim();
      return stage === '采购' || stage === '入库' || name === '采购' || name === '入库';
    };
    const validProcesses = (processes || []).filter(function (p) { return !isNonProductionProcess(p); });

    // 样衣总数（进度条分母）：优先样衣生产记录数量，退化取款式数量
    const snapshot = this.data.patternSnapshot || {};
    const totalQty = Number(snapshot.quantity || snapshot.totalQuantity
      || (this.data.styleInfo && (this.data.styleInfo.sampleQuantity || this.data.styleInfo.quantity)) || 0) || 0;

    // 处理工序：格式化显示 + 匹配扫码记录 + 计算进度状态
    // 先把扫码记录按 processName 分组（兼容 processName/operationType 两种匹配）
    const scansByProcessName = {};
    (scans || []).forEach(function (r) {
      const name = String(r.processName || '').trim();
      if (!name) return;
      if (!scansByProcessName[name]) scansByProcessName[name] = [];
      scansByProcessName[name].push(r);
    });

    // 扫码时间格式化（MM-dd HH:mm）
    const formatScanTime = function (r) {
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
    };

    const allProcesses = (validProcesses || []).map(function (p, idx) {
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
        _totalQty: totalQty,
        _percent: totalQty > 0 ? Math.min(100, Math.round((completedQty / totalQty) * 100)) : 0,
        _lastTime: workScans.length > 0 ? formatScanTime(workScans[0]) : '',
        _scanRecords: workScans.map(function (r) {
          return {
            _displayTime: formatScanTime(r),
            _operationText: r.operationType === 'RECEIVE' ? '领取'
              : r.operationType === 'COMPLETE' ? '完成'
              : r.operationType === 'WAREHOUSE_IN' ? '入库'
              : r.operationType === 'WAREHOUSE_OUT' ? '出库'
              : r.operationType === 'WAREHOUSE_RETURN' ? '归还'
              : r.operationType === 'PLATE' ? '车板'
              : r.operationType === 'FOLLOW_UP' ? '跟单'
              : r.processName || r.operationType || '-',
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
    const scanRecords = (scans || []).map(function (r, idx) {
      const timeStr = r.scanTime || r.createTime || '';
      let displayTime = '';
      if (timeStr) {
        try {
          const d = new Date(String(timeStr).replace(/-/g, '/'));
          if (!isNaN(d.getTime())) {
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            displayTime = mm + '-' + dd + ' ' + hh + ':' + mi;
          }
        } catch (_) {}
      }
      const stageRaw = r.progressStage || r.processName || '';
      return Object.assign({}, r, {
        _displayTime: displayTime,
        _stageLower: String(stageRaw).toLowerCase(),
        _operationText: r.operationType === 'RECEIVE' ? '领取'
          : r.operationType === 'COMPLETE' ? '完成'
          : r.operationType === 'WAREHOUSE_IN' ? '入库'
          : r.operationType === 'WAREHOUSE_OUT' ? '出库'
          : r.operationType === 'WAREHOUSE_RETURN' ? '归还'
          : r.operationType === 'PLATE' ? '车板'
          : r.operationType === 'FOLLOW_UP' ? '跟单'
          : r.processName || r.operationType || '',
        _operationClass: String(r.operationType || 'OTHER').toLowerCase(),
      });
    });

    this.setData({
      allProcesses: allProcesses,
      scanRecords: scanRecords,
      processLoading: false,
      scanLoading: false,
    });
  },

  /** 并行加载 BOM、尺寸表、二次工艺 */
  async _loadBomAndSizes() {
    if (!this.data.styleId) return;
    this.setData({ bomLoading: true, sizeLoading: true, secondaryLoading: true });

    const styleId = this.data.styleId;
    const tasks = [
      style.listBom({ styleId: styleId }).then(function (res) {
        const list = (res && res.data) || res || [];
        return Array.isArray(list) ? list : (list.records || []);
      }).catch(function () { return []; }),
      style.listSizes({ styleId: styleId }).then(function (res) {
        const list = (res && res.data) || res || [];
        return Array.isArray(list) ? list : (list.records || []);
      }).catch(function () { return []; }),
      style.listSecondaryProcesses({ styleId: styleId }).then(function (res) {
        const list = (res && res.data) || res || [];
        return Array.isArray(list) ? list : (list.records || []);
      }).catch(function () { return []; }),
    ];

    const [bomList, sizeList, secondaryList] = await Promise.all(tasks);

    // 尺寸表数据透视：部位为行，尺码为列
    const sizeTable = this._pivotSizeTable(sizeList || []);

    // BOM 物料类型英文 → 中文（fabricA → 面料A）
    // 二次工艺 processType/status 英文 → 中文
    const enrichedBomList = enrichBomList(bomList || []);
    const enrichedSecondaryList = (secondaryList || []).map(function (item) {
      var copy = Object.assign({}, item);
      if (item.processType) copy.processTypeText = processTypeLabel(item.processType);
      if (item.status) copy.statusText = processStatusLabel(item.status);
      return copy;
    });

    this.setData({
      bomList: enrichedBomList,
      bomLoading: false,
      sizeList: sizeList || [],
      sizeColumns: sizeTable.columns,
      sizeRows: sizeTable.rows,
      sizeLoading: false,
      secondaryList: enrichedSecondaryList,
      secondaryLoading: false,
    });
  },

  /** 尺寸表透视：把 [{partName, sizeName, standardValue}] 转成行=部位、列=尺码 */
  _pivotSizeTable(rawList) {
    if (!rawList || rawList.length === 0) {
      return { columns: [], rows: [] };
    }

    // 收集所有尺码（去重 + 排序）
    var sizeSet = [];
    var sizeSeen = {};
    rawList.forEach(function (item) {
      var s = item.sizeName || item.baseSize || '';
      if (s && !sizeSeen[s]) {
        sizeSeen[s] = true;
        sizeSet.push(s);
      }
    });

    // 尺码排序：按服装行业常见顺序
    var sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL', 'F', 'OS'];
    sizeSet.sort(function (a, b) {
      var ia = sizeOrder.indexOf(a.toUpperCase());
      var ib = sizeOrder.indexOf(b.toUpperCase());
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });

    // 收集所有部位（去重，保持出现顺序）
    var partList = [];
    var partSeen = {};
    rawList.forEach(function (item) {
      var p = item.partName || '';
      if (p && !partSeen[p]) {
        partSeen[p] = true;
        partList.push(p);
      }
    });

    // 构建查找索引：partName + sizeName → standardValue
    var lookup = {};
    rawList.forEach(function (item) {
      var p = item.partName || '';
      var s = item.sizeName || item.baseSize || '';
      var key = p + '|' + s;
      lookup[key] = item.standardValue || item.tolerance || '-';
    });

    // 构建行数据
    var rows = partList.map(function (part) {
      var values = {};
      sizeSet.forEach(function (size) {
        var key = part + '|' + size;
        values[size] = lookup[key] || '-';
      });
      return { partName: part, values: values };
    });

    return { columns: sizeSet, rows: rows };
  },

  /**
   * D-157 闭环：详情页直达"按工序扫码"确认页——
   * 复用主扫码页同一 PatternScanProcessor 流水线（详情+扫码记录+工序配置→操作选项），
   * 确认页提交走 executeScan(sourceBizType=SAMPLE)，后端三入口统一委派样衣链路
   */
  async onProcessScan() {
    const snapshot = this.data.patternSnapshot;
    const patternId = snapshot && snapshot.id;
    if (!patternId) return;
    wx.showLoading({ title: '加载工序...' });
    try {
      const handler = {
        api: { production },
        SCAN_MODE: { PATTERN: 'pattern' },
        _errorResult: (msg) => ({ success: false, message: msg }),
      };
      const result = await PatternScanProcessor.handlePatternScan(handler, { patternId: String(patternId) }, null);
      wx.hideLoading();
      if (!result || !result.success || !result.data) {
        wx.showToast({ title: (result && result.message) || '无法打开工序扫码', icon: 'none' });
        return;
      }
      const app = getApp();
      app.globalData.patternScanData = result.data;
      wx.navigateTo({ url: '/pages/scan/pattern/index' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: (e && (e.message || e.errMsg)) || '打开失败', icon: 'none' });
    }
  },

  onReceivePattern() {
    const snapshot = this.data.patternSnapshot;
    if (!snapshot || !snapshot.id) return;
    if (snapshot._isReceived || snapshot._isFullyCompleted) {
      wx.showToast({ title: '样衣已领取或已完成', icon: 'none' });
      return;
    }
    this._doReceivePattern(snapshot.id);
  },

  // ── D-181 对齐PC：样衣审核是详情页动作（生产完成未审核时显示）──
  onSampleReview() {
    const snapshot = this.data.patternSnapshot;
    const patternId = snapshot && snapshot.id;
    if (!patternId) {
      wx.showToast({ title: '缺少样衣生产单', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['审核通过', '审核返修', '审核驳回'],
      success: (res) => {
        const resultMap = ['APPROVED', 'REWORK', 'REJECTED'];
        const doneMap = ['审核已通过', '已标记返修', '已驳回'];
        this._doSampleReview(patternId, resultMap[res.tapIndex], doneMap[res.tapIndex]);
      },
    });
  },

  async _doSampleReview(patternId, result, doneMsg) {
    wx.showLoading({ title: '提交中...' });
    try {
      await production.reviewPattern(patternId, result, '');
      wx.hideLoading();
      wx.showToast({ title: doneMsg, icon: 'success' });
      this.loadStyleDetail();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: (e && (e.message || e.errMsg)) || '审核提交失败', icon: 'none' });
    }
  },

  // ── D-181 对齐PC：入库在样衣仓库完成（带参直达样品，与 PC 跳 /warehouse/sample 同构）──
  onSampleWarehouseIn() {
    const snapshot = this.data.patternSnapshot || {};
    const styleNo = snapshot.styleNo || this.data.styleInfo?.styleNo || this.data.styleInfo?.styleCode || '';
    const color = snapshot.color || '';
    const size = snapshot.size || '';
    let url = '/pages/warehouse/sample/scan-action/index';
    if (styleNo && color && size) {
      url += '?styleNo=' + encodeURIComponent(styleNo)
        + '&color=' + encodeURIComponent(color)
        + '&size=' + encodeURIComponent(size);
    }
    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: '打开样衣仓库失败', icon: 'none' }),
    });
  },

  async _doReceivePattern(patternId) {
    wx.showLoading({ title: '处理中...' });
    try {
      // D-112：后端 workflow-action 无 receive 分支（必然报"不支持的操作"），改走扫码领取规范接口，
      // 与扫码页 RECEIVE 同链路：写领取记录 + 置 IN_PROGRESS + 回填领取人
      await production.submitPatternScan({
        patternId: patternId,
        operationType: 'RECEIVE',
        operatorRole: 'PLATE_WORKER',
        quantity: 1,
        processName: '领取样衣',
        progressStage: '采购',
      });
      wx.hideLoading();
      wx.showToast({ title: '样衣已领取', icon: 'success' });
      this.loadStyleDetail();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: (e && (e.message || e.errMsg)) || '领取失败', icon: 'none' });
    }
  },

  async _doUpdateStageProgress(snapshot, stageKey, targetPercent) {
    wx.showLoading({ title: '更新中...' });
    try {
      const progress = {
        procurement: snapshot._procurementProgress,
        cutting: getSampleNodeProgress(snapshot, 'cutting'),
        secondary: getSampleNodeProgress(snapshot, 'secondary'),
        sewing: getSampleNodeProgress(snapshot, 'sewing'),
        tail: getSampleNodeProgress(snapshot, 'tail'),
        warehousing: getSampleNodeProgress(snapshot, 'warehousing'),
      };
      if (stageKey === 'procurement') {
        progress.procurement = targetPercent;
      } else {
        progress[stageKey] = targetPercent;
      }
      await production.savePatternProgress(snapshot.id, progress);
      wx.hideLoading();
      wx.showToast({ title: '进度已更新', icon: 'success' });
      this.loadStyleDetail();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // === 进度编辑器（与 PC 端 handleSaveSampleProgress 对齐）===

  onProgressSliderChange(e) {
    const val = clampPercent(Number(e.detail.value || 0));
    this.setData({ 'progressEditor.percent': val });
  },

  onProgressStep(e) {
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const isAbsolute = e.currentTarget.dataset.absolute === 'true';
    const current = this.data.progressEditor.percent || 0;
    const val = isAbsolute ? clampPercent(delta) : clampPercent(current + delta);
    this.setData({ 'progressEditor.percent': val });
  },

  onProgressInput(e) {
    const val = clampPercent(Number(e.detail.value || 0));
    this.setData({ 'progressEditor.percent': val });
  },

  async onProgressSave() {
    const editor = this.data.progressEditor;
    const snapshot = this.data.patternSnapshot;
    if (!editor || !editor.stageKey || !snapshot || !snapshot.id) return;
    if (this.data.progressSaving) return;

    this.setData({ progressSaving: true });
    try {
      // 构建完整进度数据（保留其他阶段不变）
      const progress = {
        procurement: snapshot._procurementProgress,
        cutting: getSampleNodeProgress(snapshot, 'cutting'),
        secondary: getSampleNodeProgress(snapshot, 'secondary'),
        sewing: getSampleNodeProgress(snapshot, 'sewing'),
        tail: getSampleNodeProgress(snapshot, 'tail'),
        warehousing: getSampleNodeProgress(snapshot, 'warehousing'),
      };
      // 只更新当前编辑的阶段
      if (editor.stageKey === 'procurement') {
        progress.procurement = editor.percent;
      } else {
        progress[editor.stageKey] = editor.percent;
      }
      await production.savePatternProgress(snapshot.id, progress);
      wx.showToast({ title: '进度已更新', icon: 'success' });
      this.setData({ 'progressEditor.visible': false });
      this.loadStyleDetail();
    } catch (e) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
    this.setData({ progressSaving: false });
  },

  onProgressCancel() {
    this.setData({ 'progressEditor.visible': false });
  },
});
