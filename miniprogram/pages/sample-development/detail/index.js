const { style } = require('../../../utils/api-modules/style-warehouse');
const { production } = require('../../../utils/api-modules/production');

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
      // 默认加载概览数据
      this.loadTabData(0);
    } catch (e) {
      console.error('加载款式详情失败', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 构建阶段进度数据 */
  buildStages(info) {
    const stageConfig = [
      { key: 'bom', name: 'BOM清单', field: 'bomStage' },
      { key: 'pattern', name: '纸样开发', field: 'patternStage' },
      { key: 'process', name: '工序单价', field: 'processStage' },
      { key: 'secondary', name: '二次工艺', field: 'secondaryStage' },
      { key: 'production', name: '生产制单', field: 'productionStage' },
      { key: 'quotation', name: '报价单', field: 'quotationStage' },
      { key: 'attachment', name: '附件文件', field: 'attachmentStage' },
    ];
    const stages = stageConfig.map(s => {
      const raw = info[s.field] || info[`${s.key}Stage`] || 'not_started';
      const status = this.normalizeStatus(raw);
      return {
        key: s.key,
        name: s.name,
        status,
        statusText: this.statusText(status),
        assignee: info[`${s.key}Assignee`] || info[`${s.key}AssigneeName`] || '',
        completedAt: info[`${s.key}CompletedAt`] || info[`${s.key}CompletedTime`] || '',
        budgetHours: info[`${s.key}BudgetHours`] || '',
        actualHours: info[`${s.key}ActualHours`] || '',
      };
    });
    this.setData({ stages });
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
      this.setData({ patternData: res?.data || res || null });
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

  async loadAttachments() {
    if (this.data.attachmentList.length > 0) return;
    this.setData({ attachmentLoading: true });
    try {
      const res = await style.listAttachments({ styleId: this.data.styleId });
      this.setData({ attachmentList: res?.data?.records || res?.data || res?.records || [] });
    } catch (e) { console.error('附件加载失败', e); }
    this.setData({ attachmentLoading: false });
  },

  // === 交互方法 ===

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

  /** 阶段完成确认 */
  onStageConfirm(e) {
    const stageKey = e.currentTarget.dataset.key;
    const stage = this.data.stages.find(s => s.key === stageKey);
    if (!stage || stage.status === 'completed') return;

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

  /** 刷新 */
  onRefresh() {
    this.loadStyleDetail();
  },
});
