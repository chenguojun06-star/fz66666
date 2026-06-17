const { style } = require('../../../utils/api-modules/style-warehouse');
const { production } = require('../../../utils/api-modules/production');
const permission = require('../../../utils/permission');

// 可手动领取/完成的子工序（其他只展示）
const ACTIONABLE_STAGES = new Set(['pattern', 'bom', 'process', 'secondary', 'production']);

Page({
  data: {
    styleId: '',
    patternId: '',
    styleInfo: null,
    loading: true,
    activeTab: 0,
    tabs: [
      { key: 'overview', name: '概览', icon: '📋' },
      { key: 'bom', name: 'BOM', icon: '📦' },
      { key: 'process', name: '工序', icon: '⚙️' },
      { key: 'secondary', name: '二次工艺', icon: '🎨' },
      { key: 'pattern', name: '纸样', icon: '📐' },
      { key: 'production', name: '制单', icon: '📝' },
      { key: 'quotation', name: '报价', icon: '💰' },
      { key: 'attachment', name: '附件', icon: '📎' },
    ],

    // 阶段进度
    stages: [],
    // BOM清单
    bomList: [],
    bomLoading: false,
    // 工序单价
    processList: [],
    processLoading: false,
    // 二次工艺
    secondaryList: [],
    secondaryLoading: false,
    // 纸样
    patternData: null,
    patternLoading: false,
    // 生产制单
    productionData: null,
    productionLoading: false,
    // 报价单
    quotationData: null,
    quotationLoading: false,
    // 附件
    attachmentList: [],
    attachmentLoading: false,
    // 款式图片（cover + 附件中的图片）
    styleImages: [],
  },

  onLoad(options) {
    const styleId = options.styleId || '';
    const patternId = options.id || options.patternId || '';
    if (!styleId && !patternId) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      return;
    }
    this.setData({ styleId, patternId });
    // 如果只有 patternId，先获取样衣详情拿到 styleId
    if (!styleId && patternId) {
      this.loadStyleIdFromPattern(patternId);
    } else {
      this.loadStyleDetail();
    }
  },

  onPullDownRefresh() {
    this.loadStyleDetail().then(() => wx.stopPullDownRefresh());
  },

  /** 通过 patternId 获取样衣详情，提取 styleId */
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
        // 没有 styleId，用 patternId 作为兜底显示样衣信息
        this.setData({ styleInfo: detail, loading: false });
        wx.showToast({ title: '该样衣暂无关联款式', icon: 'none' });
      }
    } catch (e) {
      console.error('获取样衣详情失败', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadStyleDetail() {
    this.setData({ loading: true });
    try {
      const res = await style.getStyleDetail(this.data.styleId);
      const styleInfo = res?.data || res || {};
      this.setData({ styleInfo, loading: false });
      this.buildStages(styleInfo);
      this.buildStyleImages(styleInfo);
      // 默认加载概览数据
      this.loadTabData(0);
    } catch (e) {
      console.error('加载款式详情失败', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 构建阶段进度数据 — 基于 startTime/completedTime 判断真实状态 */
  buildStages(info) {
    const stageConfig = [
      { key: 'bom', name: 'BOM清单' },
      { key: 'pattern', name: '纸样开发' },
      { key: 'process', name: '工序单价' },
      { key: 'secondary', name: '二次工艺' },
      { key: 'production', name: '生产制单' },
      { key: 'quotation', name: '报价单' },
      { key: 'attachment', name: '附件文件' },
    ];
    const stages = stageConfig.map(s => {
      // 用实际时间字段判断状态（比 xxxStage 字段更可靠）
      const completedTime = info[`${s.key}CompletedTime`] || '';
      const startTime = info[`${s.key}StartTime`] || '';
      let status;
      if (completedTime) {
        status = 'completed';
      } else if (startTime) {
        status = 'in_progress';
      } else {
        status = 'not_started';
      }
      const actionable = ACTIONABLE_STAGES.has(s.key);
      const canRollback = actionable && status === 'completed' && permission.isAdminOrSupervisor();
      return {
        key: s.key,
        name: s.name,
        status,
        statusText: this.statusText(status),
        assignee: info[`${s.key}Assignee`] || '',
        startTime: startTime ? String(startTime).substring(0, 16) : '',
        completedAt: completedTime ? String(completedTime).substring(0, 16) : '',
        actionable,
        canReceive: actionable && status === 'not_started',
        canComplete: actionable && status === 'in_progress',
        canRollback,
      };
    });
    this.setData({ stages });
  },

  /** 构建款式图片列表（cover + 附件中的图片） */
  buildStyleImages(info) {
    const images = [];
    if (info.cover) images.push(info.cover);
    // 附件中的图片在加载附件后补充
    this.setData({ styleImages: images });
  },

  normalizeStatus(raw) {
    const s = String(raw || '').toLowerCase();
    if (s === 'completed' || s === 'done' || s === 'finished' || s === '已完成') return 'completed';
    if (s === 'in_progress' || s === 'in-progress' || s === 'active' || s === '进行中') return 'in_progress';
    return 'not_started';
  },

  statusText(status) {
    if (status === 'completed') return '已完成';
    if (status === 'in_progress') return '进行中';
    return '未开始';
  },

  /** Tab切换 */
  onTabTap(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === this.data.activeTab) return;
    this.setData({ activeTab: idx });
    this.loadTabData(idx);
  },

  /** 按Tab加载数据 */
  loadTabData(idx) {
    const key = this.data.tabs[idx]?.key;
    switch (key) {
      case 'bom': this.loadBom(); break;
      case 'process': this.loadProcess(); break;
      case 'secondary': this.loadSecondary(); break;
      case 'pattern': this.loadPattern(); break;
      case 'production': this.loadProduction(); break;
      case 'quotation': this.loadQuotation(); break;
      case 'attachment': this.loadAttachments(); break;
    }
  },

  // === 数据加载方法 ===

  async loadBom() {
    if (this.data.bomList.length > 0) return;
    this.setData({ bomLoading: true });
    try {
      const res = await style.listBom({ styleId: this.data.styleId });
      this.setData({ bomList: res?.data?.records || res?.data || res?.records || [] });
    } catch (e) { console.error('BOM加载失败', e); }
    this.setData({ bomLoading: false });
  },

  async loadProcess() {
    if (this.data.processList.length > 0) return;
    this.setData({ processLoading: true });
    try {
      const res = await style.listProcesses({ styleId: this.data.styleId });
      this.setData({ processList: res?.data?.records || res?.data || res?.records || [] });
    } catch (e) { console.error('工序加载失败', e); }
    this.setData({ processLoading: false });
  },

  async loadSecondary() {
    if (this.data.secondaryList.length > 0) return;
    this.setData({ secondaryLoading: true });
    try {
      const res = await style.listSecondaryProcesses({ styleId: this.data.styleId });
      this.setData({ secondaryList: res?.data?.records || res?.data || res?.records || [] });
    } catch (e) { console.error('二次工艺加载失败', e); }
    this.setData({ secondaryLoading: false });
  },

  async loadPattern() {
    if (this.data.patternData) return;
    this.setData({ patternLoading: true });
    try {
      const res = await style.getPatternRevision(this.data.styleId);
      // getPatternRevision 直接返回纸样对象或null
      this.setData({ patternData: res || null });
    } catch (e) { console.error('纸样加载失败', e); }
    this.setData({ patternLoading: false });
  },

  async loadProduction() {
    if (this.data.productionData) return;
    this.setData({ productionLoading: true });
    try {
      const res = await style.getStyleDetail(this.data.styleId);
      const info = res?.data || res || {};
      this.setData({
        productionData: {
          productionNotes: info.productionNotes || info.productionOrderNotes || '',
          techSpec: info.techSpec || info.technicalSpec || '',
          sizeSpec: info.sizeSpec || info.sizeSpecification || '',
        }
      });
    } catch (e) { console.error('制单加载失败', e); }
    this.setData({ productionLoading: false });
  },

  async loadQuotation() {
    if (this.data.quotationData) return;
    this.setData({ quotationLoading: true });
    try {
      const res = await style.getQuotation(this.data.styleId);
      this.setData({ quotationData: res?.data || res || null });
    } catch (e) { console.error('报价单加载失败', e); }
    this.setData({ quotationLoading: false });
  },

  /** 格式化文件大小（字节 → 1.2MB / 500KB） */
  formatFileSize(bytes) {
    if (!bytes) return '';
    const size = Number(bytes) || 0;
    if (size >= 1024 * 1024) {
      return (size / 1024 / 1024).toFixed(1) + 'MB';
    }
    if (size >= 1024) {
      return (size / 1024).toFixed(0) + 'KB';
    }
    return '';
  },

  async loadAttachments() {
    if (this.data.attachmentList.length > 0) return;
    this.setData({ attachmentLoading: true });
    try {
      const res = await style.listAttachments({ styleId: this.data.styleId });
      let list = res?.data?.records || res?.data || res?.records || [];
      list = list.map(it => ({ ...it, fileSizeText: this.formatFileSize(it.fileSize || it.size || 0) }));
      this.setData({ attachmentList: list });
      // 把图片附件补充到 styleImages
      const imageUrls = list
        .filter(it => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(it.url || it.fileUrl || ''))
        .map(it => it.url || it.fileUrl);
      if (imageUrls.length > 0) {
        const existing = this.data.styleImages || [];
        const merged = [...new Set([...existing, ...imageUrls])];
        this.setData({ styleImages: merged });
      }
    } catch (e) { console.error('附件加载失败', e); }
    this.setData({ attachmentLoading: false });
  },

  // === 交互方法 ===

  /** 封面图点击预览 */
  onCoverTap() {
    const cover = this.data.styleInfo?.cover;
    if (!cover) return;
    wx.previewImage({ urls: this.data.styleImages.length > 0 ? this.data.styleImages : [cover], current: cover });
  },

  /** 款式图片点击预览 */
  onImagePreview(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: this.data.styleImages, current: url });
  },

  /** 预览附件 */
  onAttachmentTap(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    // 图片预览
    if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url)) {
      wx.previewImage({ urls: [url], current: url });
    } else {
      // 其他文件复制链接
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
      });
    }
  },

  /** 领取子工序 */
  onStageReceive(e) {
    const stageKey = e.currentTarget.dataset.key;
    const stage = this.data.stages.find(s => s.key === stageKey);
    if (!stage || !stage.canReceive) return;

    // 软校验：非样衣岗且非主管，提示但不阻断
    const doReceive = async () => {
      try {
        await style.stageAction(this.data.styleId, stageKey, 'start');
        wx.showToast({ title: '领取成功', icon: 'success' });
        this.loadStyleDetail();
      } catch (e) {
        wx.showToast({ title: '领取失败', icon: 'none' });
      }
    };

    if (!permission.canReceiveTask('sample')) {
      wx.showModal({
        title: '岗位提示',
        content: `您当前职务「${permission.getRoleDisplayName()}」非样衣岗，确定代领「${stage.name}」？`,
        confirmText: '确定代领',
        cancelText: '取消',
        success: (res) => { if (res.confirm) doReceive(); },
      });
    } else {
      wx.showModal({
        title: '领取确认',
        content: `确认领取「${stage.name}」工序？`,
        success: (res) => { if (res.confirm) doReceive(); },
      });
    }
  },

  /** 阶段完成确认 */
  onStageConfirm(e) {
    const stageKey = e.currentTarget.dataset.key;
    const stage = this.data.stages.find(s => s.key === stageKey);
    if (!stage || !stage.canComplete) return;

    wx.showModal({
      title: '确认完成',
      content: `确认「${stage.name}」阶段已完成？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await style.stageAction(this.data.styleId, stageKey, 'complete');
          wx.showToast({ title: '已确认完成', icon: 'success' });
          this.loadStyleDetail();
        } catch (e) {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  },

  /** 退回修改（主管） */
  onStageRollback(e) {
    const stageKey = e.currentTarget.dataset.key;
    const stage = this.data.stages.find(s => s.key === stageKey);
    if (!stage || !stage.canRollback) return;

    wx.showModal({
      title: '退回修改',
      content: `退回「${stage.name}」后需重新完成，确认退回？`,
      editable: true,
      placeholderText: '请输入退回原因（选填）',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const reason = (res.content || '').trim();
          await style.stageAction(this.data.styleId, stageKey, 'reset', reason || undefined);
          wx.showToast({ title: '已退回', icon: 'success' });
          this.loadStyleDetail();
        } catch (e) {
          wx.showToast({ title: '退回失败', icon: 'none' });
        }
      }
    });
  },

  /** 刷新 */
  onRefresh() {
    this.loadStyleDetail();
  },
});
