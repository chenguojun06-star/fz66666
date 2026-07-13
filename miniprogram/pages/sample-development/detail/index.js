const { style } = require('../../../utils/api-modules/style-warehouse');
const production = require('../../../utils/api-modules/production');
const { fieldConfig } = require('../../../utils/api-modules/field-config');
const { toast } = require('../../../utils/uiHelper');
const permission = require('../../../utils/permission');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');

function _unwrapList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.records)) return res.records;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data && res.data.records)) return res.data.records;
  return [];
}

/* ========== 纸样状态 / 开发来源 中文化 ========== */
var PATTERN_STATUS_LABELS = { PENDING: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', RETURNED: '已退回', LOCKED: '已锁定', UNLOCKED: '未锁定', NOT_STARTED: '未开始' };
var SOURCE_TYPE_LABELS = { SELF_DEVELOPED: '自主开发', SELECTION_CENTER: '选款中心', CUSTOMER_PROVIDED: '客户提供', OEM_DESIGN: 'OEM 设计', OTHER: '其他' };

/* ========== 与 PC 端 / 列表页 完全一致的状态与交期计算 ========== */

function getProgressNodeColor(node) {
  if (!node) return 'default';
  const s = String(node);
  if (/开发样报废|样衣报废|已报废/.test(s)) return 'default';
  if (/报废|驳回|不通过|异常|失败/.test(s)) return 'error';
  if (/返修|紧急/.test(s)) return 'warning';
  if (/完成|通过/.test(s)) return 'success';
  if (/中|待审|确认/.test(s)) return 'processing';
  return 'default';
}

function getDeliveryMeta(record, allStagesCompleted) {
  if (!record) return { tone: 'normal', label: '' };
  const sampleStatus = String(record.sampleStatus || record.status || '').trim().toUpperCase();
  if (sampleStatus === 'SCRAPPED') return { tone: 'scrapped', label: '已报废' };
  if (sampleStatus === 'CLOSED') return { tone: 'scrapped', label: '已关单' };
  if (sampleStatus === 'COMPLETED') return { tone: 'success', label: '已完成' };
  if (allStagesCompleted) return { tone: 'success', label: '已完成' };
  const deliveryDate = record.deliveryDate || record.deliveryTime;
  if (!deliveryDate) return { tone: 'normal', label: '待补交期' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(String(deliveryDate).replace(/-/g, '/'));
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { tone: 'danger', label: '延期' + Math.abs(diffDays) + '天' };
  if (diffDays <= 3) return { tone: 'warning', label: diffDays + '天内交板' };
  return { tone: 'normal', label: diffDays + '天后交板' };
}

const EN_TO_CN = {
  PENDING: '待领取', IN_PROGRESS: '制作中', PROGRESS: '制作中',
  COMPLETED: '已完成', WAREHOUSE_IN: '已入库',
  ENABLED: '启用', ACTIVE: '启用', DISABLED: '已停用',
  REVIEW_PENDING: '待审核', REVIEWED: '已审核',
  APPROVED: '已通过', REJECTED: '已驳回',
  CANCELLED: '已取消', CANCELED: '已取消',
  SCRAPPED: '样衣报废', CLOSED: '已关单',
};

function resolveMainStatus(styleInfo) {
  if (!styleInfo) return '未开始';
  const node = String(styleInfo.progressNode || styleInfo.status || '').trim();
  if (node) {
    const upper = node.toUpperCase();
    if (EN_TO_CN[upper]) return EN_TO_CN[upper];
    return node;
  }
  const status = String(styleInfo.sampleStatus || styleInfo.status || '').trim();
  if (status) {
    const upper = status.toUpperCase();
    if (EN_TO_CN[upper]) return EN_TO_CN[upper];
    return status;
  }
  return '未开始';
}

const ACTIONABLE_STAGES = ['pattern', 'bom', 'size', 'process', 'secondary', 'production'];

/**
 * 规范化交期日期：兼容 LocalDateTime 数组 [y,m,d]、字符串、ISO 等格式
 * 后端 StyleInfo.deliveryDate 是 LocalDateTime，Jackson 默认序列化为 [y,m,d] 数组
 * 直接 new Date(String([2026,7,12])) 会得到 Invalid Date
 */
function _normalizeDeliveryDate(dt) {
  if (!dt) return '';
  if (Array.isArray(dt) && dt.length >= 3) {
    var y = dt[0];
    var m = Number(dt[1]) < 10 ? '0' + dt[1] : '' + dt[1];
    var d = Number(dt[2]) < 10 ? '0' + dt[2] : '' + dt[2];
    return y + '-' + m + '-' + d;
  }
  var s = String(dt);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return s;
}

Page({
  data: {
    styleId: '',
    patternId: '',
    styleInfo: null,
    loading: true,
    styleImages: [],
    extFields: [],
    stages: [],
    _overallProgress: 0,
    _completedStages: 0,
    attachmentList: [],
    attachmentLoading: false,
    remarkList: [],
    remarkLoading: false,
    remarkInput: '',
    remarkRoleInput: '',
    remarkSubmitting: false,
  },

  onLoad(options) {
    const styleId = (options.styleId || '').trim();
    const patternId = (options.id || options.patternId || '').trim();
    if (!styleId && !patternId) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      return;
    }
    this.setData({ styleId, patternId });
    this.loadExtFields();
    if (!styleId && patternId) {
      this.loadStyleIdFromPattern(patternId);
    } else {
      this.loadStyleDetail();
      // P1 修复：当 styleId 存在但 patternId 缺失时（如从扫码/分享链接进入），主动反查 patternId
      // 避免 onStageJump 跳转 stage-detail 时 patternId 为空
      if (styleId && !patternId) {
        this._ensurePatternId(styleId);
      }
    }
    bindPageEvents(this, () => {
      this.loadStyleDetail();
    });
  },

  /** 通过 styleId 反查 PatternProduction.id，补全 patternId */
  async _ensurePatternId(sid) {
    if (this.data.patternId) return;
    try {
      const res = await production.listPatterns({ styleId: sid, page: 1, size: 1 });
      const data = (res && res.data) || res || {};
      const records = data.records || (Array.isArray(data) ? data : []);
      if (records.length > 0 && records[0].id) {
        this.setData({ patternId: String(records[0].id) });
      }
    } catch (e) {
      // 静默失败，stage-detail 有反查兜底
    }
  },

  onUnload() {
    unbindPageEvents(this);
  },

  onPullDownRefresh() {
    Promise.all([this.loadStyleDetail(), this.loadRemarks()]).then(() => wx.stopPullDownRefresh());
  },

  /** 通过 patternId 获取样衣详情，提取 styleId */
  async loadStyleIdFromPattern(patternId) {
    this.setData({ loading: true });
    try {
      const res = await production.getPatternDetail(patternId);
      const detail = (res && res.data) || res || {};
      this._patternCover = getAuthedImageUrl(detail.coverImage || detail.styleImage || detail.cover || '');
      const rawStatus = detail.status || '';
      const mainStatus = resolveMainStatus(detail);
      const mainStatusColor = getProgressNodeColor(mainStatus);
      const deliveryMeta = getDeliveryMeta(detail, false);
      const basicInfo = {
        color: detail.color || detail.colorName || '',
        size: detail.size || detail.sizeName || (Array.isArray(detail.sizes) && detail.sizes.length ? detail.sizes.join('/') : ''),
        quantity: detail.quantity || detail.sampleQuantity || detail.totalQuantity || 0,
        status: rawStatus,
        _mainStatus: mainStatus,
        _mainStatusColor: mainStatusColor,
        _deliveryLabel: deliveryMeta.label,
        _deliveryTone: deliveryMeta.tone,
        cover: getAuthedImageUrl(detail.coverImage || detail.styleImage || detail.cover || ''),
      };
      this.setData({ _patternBasicInfo: basicInfo });
      // P0 修复：只用真正的 styleId（UUID），不能用 styleNo（编号如 BR26X1K0652A）冒充
      // 否则 getStyleDetail(styleNo) 调用失败，stage-detail 的 BOM/纸样/工序全部加载不到
      const styleId = detail.styleId || '';
      if (styleId) {
        this.setData({ styleId, patternId });
        this.loadStyleDetail();
      } else {
        this.setData({
          styleInfo: {
            styleName: detail.styleName || detail.name || '未命名款式',
            styleNo: detail.styleNo || detail.patternNo || '',
            styleCode: '',
            cover: basicInfo.cover,
            customer: detail.customer || detail.customerName || detail.buyer || '',
            category: detail.category || '',
            developmentSourceType: detail.developmentSourceType || detail.sourceType || '',
            developmentSourceText: (detail.developmentSourceType || detail.sourceType)
              ? (SOURCE_TYPE_LABELS[String(detail.developmentSourceType || detail.sourceType).toUpperCase()] || '其他')
              : '',
            season: detail.season || '',
            patternMaker: detail.patternMaker || detail.patternDeveloper || detail.receiver || '',
            receiver: detail.receiver || '',
            _releaseTime: detail.releaseTime || detail.createTime || '',
            _deliveryTime: detail.deliveryTime || '',
            _completeTime: detail.completeTime || '',
            ...basicInfo,
          },
          loading: false,
        });
        this.loadRemarks();
      }
    } catch (e) {
      console.error('获取样衣详情失败', e);
      this.setData({ loading: false });
      toast.error('加载失败');
    }
  },

  /** 加载扩展字段配置（style 业务对象） */
  async loadExtFields() {
    try {
      const fields = await fieldConfig.list('style', 'mp', false);
      this.setData({ extFields: fields || [] });
    } catch (e) {
      // 字段配置加载失败不阻塞主流程
    }
  },

  async loadStyleDetail() {
    this.setData({ loading: true });
    try {
      const res = await style.getStyleDetail(this.data.styleId);
      const styleInfo = (res && res.data) || res || {};
      const basic = this.data._patternBasicInfo || {};
      const styleColor = styleInfo.color || styleInfo.colorName || '';
      const styleSize = styleInfo.size || styleInfo.sizeName || (Array.isArray(styleInfo.sizes) && styleInfo.sizes.length ? styleInfo.sizes.join('/') : '');
      const styleQty = styleInfo.quantity || styleInfo.sampleQuantity || styleInfo.totalQuantity || styleInfo.sampleCount || 0;
      const styleCover = getAuthedImageUrl(styleInfo.cover || styleInfo.coverImage || styleInfo.styleImage || '');
      const finalColor = basic.color || styleColor;
      const finalSize = basic.size || styleSize;
      const finalQty = basic.quantity || styleQty;
      Object.assign(styleInfo, {
        styleName: styleInfo.styleName || styleInfo.name || '',
        styleNo: styleInfo.styleNo || styleInfo.styleCode || '',
        color: finalColor,
        size: finalSize,
        quantity: finalQty,
        cover: basic.cover || styleCover,
        _mainStatus: basic._mainStatus || resolveMainStatus(styleInfo),
        _mainStatusColor: basic._mainStatusColor || getProgressNodeColor(basic._mainStatus || resolveMainStatus(styleInfo)),
        // P0 修复：交期字段优先级，deliveryTime（字符串）优先，deliveryDate 可能是数组
        _deliveryLabel: basic._deliveryLabel || getDeliveryMeta({
          deliveryDate: _normalizeDeliveryDate(styleInfo.deliveryTime || styleInfo.deliveryDate),
          sampleStatus: styleInfo.sampleStatus || styleInfo.status,
          status: styleInfo.status,
        }, false).label,
        _deliveryTone: basic._deliveryTone || getDeliveryMeta({
          deliveryDate: _normalizeDeliveryDate(styleInfo.deliveryTime || styleInfo.deliveryDate),
          sampleStatus: styleInfo.sampleStatus || styleInfo.status,
          status: styleInfo.status,
        }, false).tone,
        _countdownDays: (function() {
          const deliveryDate = _normalizeDeliveryDate(styleInfo.deliveryTime || styleInfo.deliveryDate || basic._deliveryTime);
          if (!deliveryDate) return null;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const target = new Date(String(deliveryDate).replace(/-/g, '/'));
          target.setHours(0, 0, 0, 0);
          return Math.ceil((target.getTime() - today.getTime()) / 86400000);
        })(),
        customer: styleInfo.customer || styleInfo.customerName || styleInfo.buyer || styleInfo.buyerName || '',
        category: styleInfo.category || styleInfo.productCategory || '',
        developmentSourceType: styleInfo.developmentSourceType || styleInfo.sourceType || '',
        developmentSourceText: (styleInfo.developmentSourceType || styleInfo.sourceType)
          ? (SOURCE_TYPE_LABELS[String(styleInfo.developmentSourceType || styleInfo.sourceType).toUpperCase()] || '其他')
          : '',
        season: styleInfo.season || '',
        patternMaker: styleInfo.patternMaker || styleInfo.patternDeveloper || styleInfo.receiver || '',
        receiver: styleInfo.receiver || '',
        _releaseTime: styleInfo.releaseTime || styleInfo.createTime || '',
        _deliveryTime: _normalizeDeliveryDate(styleInfo.deliveryTime || styleInfo.deliveryDate || basic._deliveryTime) || '',
        _completeTime: styleInfo.completeTime || styleInfo.sampleCompletedTime || '',
        _reviewStatusText: (function() {
          const REVIEW_LABELS = { PASS: '通过', REWORK: '需修改', REJECT: '不通过' };
          return REVIEW_LABELS[String(styleInfo.sampleReviewStatus || '').toUpperCase()] || '';
        })(),
        _reviewStatusColor: (function() {
          const s = String(styleInfo.sampleReviewStatus || '').toUpperCase();
          if (s === 'PASS') return 'success';
          if (s === 'REWORK') return 'warning';
          if (s === 'REJECT') return 'error';
          return 'default';
        })(),
        _reviewTimeText: this._fmtDateTime(styleInfo.sampleReviewTime),
      });
      this.setData({ styleInfo, loading: false });
      this.buildStages(styleInfo);
      this.buildStyleImages(styleInfo);
      this.loadAttachments();
      this.loadRemarks();
    } catch (e) {
      console.error('加载款式详情失败', e);
      this.setData({ loading: false });
      toast.error('加载失败');
    }
  },

  /** 构建阶段进度数据 — 基于 startTime/completedTime 判断真实状态 */
  buildStages(info) {
    // PC 端同款 6 阶段（BOM/纸样/尺寸/工序/生产制单/二次工艺）
    const stageConfig = [
      { key: 'bom', name: 'BOM配置' },
      { key: 'pattern', name: '纸样开发' },
      { key: 'size', name: '尺码表' },
      { key: 'process', name: '工序配置' },
      { key: 'production', name: '生产制单' },
      { key: 'secondary', name: '二次工艺' },
    ];
    const stages = stageConfig.map(s => {
      const completedTime = info[s.key + 'CompletedTime'] || '';
      const startTime = info[s.key + 'StartTime'] || '';
      const assignee = info[s.key + 'Assignee'] || '';
      let status;
      if (completedTime) status = 'completed';
      else if (startTime) status = 'in_progress';
      else status = 'not_started';
      const actionable = ACTIONABLE_STAGES.indexOf(s.key) !== -1;
      const canRollback = actionable && status === 'completed' && permission.isAdminOrSupervisor();
      let helper = '';
      if (status === 'completed') {
        helper = s.name + '已完成';
      } else if (status === 'in_progress') {
        helper = assignee ? '领取人 ' + assignee : '进行中';
      } else {
        helper = assignee ? '待领取' : '等待处理';
      }
      let timeLabel = '';
      if (completedTime && startTime) {
        timeLabel = this._fmtDate(startTime) + ' ~ ' + this._fmtDate(completedTime);
      } else if (startTime) {
        timeLabel = this._fmtDate(startTime);
      }
      let delayText = '';
      let delayTone = '';
      if (status === 'in_progress' && startTime) {
        const stageStart = new Date(String(startTime).replace(/-/g, '/'));
        const now = new Date();
        const elapsedDays = Math.floor((now.getTime() - stageStart.getTime()) / 86400000);
        if (elapsedDays > 7) {
          delayText = '已耗时' + elapsedDays + '天';
          delayTone = elapsedDays > 14 ? 'danger' : 'warning';
        }
      }
      return {
        key: s.key,
        name: s.name,
        status,
        statusText: this.statusText(status),
        assignee: assignee,
        startTime: startTime ? this._fmtDateTime(startTime) : '',
        completedAt: completedTime ? this._fmtDateTime(completedTime) : '',
        helper: helper,
        timeLabel: timeLabel,
        delayText: delayText,
        delayTone: delayTone,
        actionable,
        canReceive: actionable && status === 'not_started',
        canComplete: actionable && status === 'in_progress',
        canRollback,
      };
    });
    let completedCount = 0;
    stages.forEach(s => { if (s.status === 'completed') completedCount++; });
    const inProgressCount = stages.filter(s => s.status === 'in_progress').length;
    const overallProgress = stages.length > 0
      ? Math.round((completedCount * 100 + inProgressCount * 50) / stages.length)
      : 0;
    this.setData({
      stages,
      _overallProgress: overallProgress,
      _completedStages: completedCount,
    });
  },

  /** 点击阶段节点 → 跳转到阶段详情独立页面 */
  onStageJump(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const stage = (this.data.stages || []).find(s => s.key === key);
    if (!stage) return;
    // P1 修复：移除 styleInfo.id 兜底（styleInfo.id 是款式 UUID，不是 PatternProduction.id）
    // patternId 由 onLoad/loadStyleDetail 阶段主动补全，此处直接用 this.data.patternId
    var styleInfo = this.data.styleInfo || {};
    var patternId = this.data.patternId || '';
    const app = getApp();
    app._stageDetailCache = app._stageDetailCache || {};
    app._stageDetailCache[key] = {
      styleId: this.data.styleId,
      patternId: patternId,
      stage: stage,
      styleInfo: styleInfo,
    };
    wx.navigateTo({
      url: '/pages/sample-development/stage-detail/index?key=' + key
        + '&styleId=' + (this.data.styleId || '')
        + '&patternId=' + (patternId || ''),
    });
  },

  /** 构建款式图片列表（cover + pattern自带的coverImage + 附件中的图片） */
  buildStyleImages(info) {
    const images = [];
    if (info.cover) images.push(info.cover);
    else if (info.coverImage) images.push(getAuthedImageUrl(info.coverImage));
    if (info.sampleReviewImages) {
      try {
        const arr = typeof info.sampleReviewImages === 'string'
          ? JSON.parse(info.sampleReviewImages)
          : info.sampleReviewImages;
        if (Array.isArray(arr)) {
          arr.forEach(url => { if (url && typeof url === 'string') images.push(getAuthedImageUrl(url)); });
        }
      } catch (e) { /* 非JSON格式，忽略 */ }
    }
    const otherImgKeys = ['styleImages', 'photos', 'images', 'sampleImages'];
    for (let i = 0; i < otherImgKeys.length; i++) {
      const val = info[otherImgKeys[i]];
      if (Array.isArray(val)) {
        val.forEach(url => { if (url && typeof url === 'string') images.push(getAuthedImageUrl(url)); });
      } else if (typeof val === 'string' && val) {
        images.push(getAuthedImageUrl(val));
      }
    }
    if (this._patternCover && images.indexOf(this._patternCover) === -1) {
      images.push(this._patternCover);
    }
    this.setData({ styleImages: images });
  },

  statusText(status) {
    if (status === 'completed') return '已完成';
    if (status === 'in_progress') return '进行中';
    return '未开始';
  },

  _fmtDateTime(t) {
    if (!t) return '';
    const s = String(t).replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return s.substring(0, 16);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return s.trim() + ' 00:00';
    return s.substring(0, 16);
  },

  _fmtDate(t) {
    if (!t) return '';
    const s = String(t).replace('T', ' ');
    return s.substring(0, 10);
  },

  formatFileSize(bytes) {
    if (!bytes) return '';
    const size = Number(bytes) || 0;
    if (size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + 'MB';
    if (size >= 1024) return (size / 1024).toFixed(0) + 'KB';
    return '';
  },

  async loadAttachments() {
    if (this.data.attachmentList.length > 0) return;
    this.setData({ attachmentLoading: true });
    try {
      const res = await style.listAttachments({ styleId: this.data.styleId });
      // P0 修复：ok() 直接返回 resp.data 数组，原解析逻辑会把数组当成对象取 .data 得到 undefined
      let list = Array.isArray(res) ? res : (res && ((res.data && res.data.records) || res.data || res.records)) || [];
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
        return Object.assign({}, it, {
          fileSizeText: this.formatFileSize(it.fileSize || it.size || 0),
          createTimeText: it.createTime ? this._fmtDateTime(it.createTime) : '',
          _iconClass: iconClass,
        });
      });
      this.setData({ attachmentList: list });
      // 把图片附件补充到 styleImages（必须鉴权处理，否则 <image> 无法加载受保护文件）
      const imageUrls = list
        .filter(it => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(it.url || it.fileUrl || ''))
        .map(it => getAuthedImageUrl(it.url || it.fileUrl));
      if (imageUrls.length > 0) {
        const existing = this.data.styleImages || [];
        const merged = existing.slice();
        imageUrls.forEach(function (u) { if (u && merged.indexOf(u) === -1) merged.push(u); });
        this.setData({ styleImages: merged });
      }
    } catch (e) { console.error('附件加载失败', e); }
    this.setData({ attachmentLoading: false });
  },

  /** 封面图点击预览 */
  onCoverTap() {
    var styleInfo = this.data.styleInfo || {};
    var cover = styleInfo.cover;
    var imgs = this.data.styleImages || [];
    if (!cover && imgs.length === 0) return;
    var urls = imgs.length > 0 ? imgs : [cover];
    wx.previewImage({ urls: urls, current: urls[0] });
  },

  /** 刷新 */
  onRefresh() {
    this.loadStyleDetail();
  },

  /** 下载附件 */
  onAttachmentDownload(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    this.downloadFile(url);
  },

  /** 删除附件 */
  onAttachmentDelete(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '该附件';
    if (!id) return;
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定删除「' + name + '」？删除后不可恢复',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await style.deleteAttachment(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          that.setData({ attachmentList: [] });
          that.loadAttachments();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  /** 下载文件到本地 */
  downloadFile(url) {
    const authedUrl = getAuthedImageUrl(url);
    wx.showLoading({ title: '下载中...', mask: true });
    wx.downloadFile({
      url: authedUrl,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200) {
          wx.saveFile({
            tempFilePath: res.tempFilePath,
            success: () => { wx.showToast({ title: '已保存', icon: 'success' }); },
            fail: () => {
              wx.openDocument({
                filePath: res.tempFilePath,
                success: () => { wx.showToast({ title: '已打开', icon: 'success' }); },
                fail: () => { wx.showToast({ title: '打开失败', icon: 'none' }); }
              });
            }
          });
        } else {
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败，请重试', icon: 'none' });
      }
    });
  },

  /** 上传附件 - 支持图片拍照/相册 + 文件选择 */
  onUploadAttachment() {
    wx.showActionSheet({
      itemList: ['拍照上传', '从相册选择', '选择文件（PDF/文档/CAD等）'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseImage('camera');
        } else if (res.tapIndex === 1) {
          this.chooseImage('album');
        } else if (res.tapIndex === 2) {
          this.chooseFile();
        }
      }
    });
  },

  /** 选择文件（通过微信会话文件） */
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
        let uploadedCount = 0;
        tempFiles.forEach((tempFile) => {
          that.uploadFileAttachment(tempFile, () => {
            uploadedCount++;
            if (uploadedCount === tempFiles.length) {
              wx.hideLoading();
              wx.showToast({ title: '上传完成', icon: 'success' });
              that.setData({ attachmentList: [] });
              that.loadAttachments();
            }
          });
        });
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) return;
        wx.showToast({ title: '选择失败', icon: 'none' });
      }
    });
  },

  /** 上传文件附件（非图片） */
  uploadFileAttachment(tempFile, callback) {
    const that = this;
    const filePath = tempFile.path || tempFile.tempFilePath;
    const fileSize = tempFile.size;
    if (fileSize > 15 * 1024 * 1024) {
      wx.showToast({ title: '文件不能超过15MB', icon: 'none' });
      if (callback) callback();
      return;
    }
    const token = require('../../../utils/storage').getToken();
    const { getBaseUrl } = require('../../../config');
    const baseUrl = getBaseUrl();
    wx.uploadFile({
      url: baseUrl + '/api/style/attachment/upload',
      filePath: filePath,
      name: 'file',
      formData: {
        styleId: String(that.data.styleId),
        styleNo: (that.data.styleInfo && that.data.styleInfo.styleNo) || '',
        bizType: 'general',
      },
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (data.code === 200) {
            if (!callback) {
              wx.showToast({ title: '上传成功', icon: 'success' });
              that.setData({ attachmentList: [] });
              that.loadAttachments();
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
      }
    });
  },

  /** 选择图片（拍照或相册） */
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
          let uploadedCount = 0;
          tempFiles.forEach((tempFile) => {
            that.uploadImage(tempFile, () => {
              uploadedCount++;
              if (uploadedCount === tempFiles.length) {
                wx.hideLoading();
                wx.showToast({ title: '上传完成', icon: 'success' });
                that.setData({ attachmentList: [] });
                that.loadAttachments();
              }
            });
          });
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) return;
        wx.showToast({ title: '选择失败', icon: 'none' });
      }
    });
  },

  /** 上传图片 */
  uploadImage(tempFile, callback) {
    const that = this;
    const filePath = tempFile.tempFilePath;
    const fileSize = tempFile.size;
    const fileName = 'style_' + this.data.styleId + '_' + Date.now() + '.jpg';
    if (fileSize > 10 * 1024 * 1024) {
      wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
      if (callback) callback();
      return;
    }
    const token = require('../../../utils/storage').getToken();
    const { getBaseUrl } = require('../../../config');
    const baseUrl = getBaseUrl();
    wx.uploadFile({
      url: baseUrl + '/api/style/attachment/upload',
      filePath: filePath,
      name: 'file',
      formData: {
        styleId: String(this.data.styleId),
        styleNo: (this.data.styleInfo && this.data.styleInfo.styleNo) || '',
        bizType: 'general',
        fileName: fileName
      },
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (data.code === 200) {
            if (!callback) {
              wx.showToast({ title: '上传成功', icon: 'success' });
              that.setData({ attachmentList: [] });
              that.loadAttachments();
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
      }
    });
  },

  /* ============ 备注日志（主页直接展示） ============ */
  async loadRemarks() {
    const styleNo = this.data.styleInfo && this.data.styleInfo.styleNo;
    if (!styleNo) return;
    this.setData({ remarkLoading: true });
    try {
      const res = await production.listOrderRemarks('style', styleNo);
      let list = _unwrapList(res);
      // bizType 中文映射（后端 t_style_operation_log 的 bizType 字段）
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
        // 把英文 bizType 映射成中文
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

  async onSubmitRemark() {
    const content = (this.data.remarkInput || '').trim();
    const styleNo = this.data.styleInfo && this.data.styleInfo.styleNo;
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
});
