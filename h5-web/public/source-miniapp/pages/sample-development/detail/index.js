const { style } = require('../../../utils/api-modules/style-warehouse');
const { production } = require('../../../utils/api-modules/production');
const { toast } = require('../../../utils/uiHelper');
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
      { key: 'production', name: '生产工序', icon: '📷' },
      { key: 'bom', name: 'BOM', icon: '📦' },
      { key: 'process', name: '工序单价', icon: '⚙️' },
      { key: 'secondary', name: '二次工艺', icon: '🎨' },
      { key: 'pattern', name: '纸样', icon: '📐' },
      { key: 'sheet', name: '制单', icon: '📝' },
      { key: 'quotation', name: '报价', icon: '💰' },
      { key: 'attachment', name: '附件', icon: '📎' },
    ],
    // BOM清单
    bomList: [],
    bomLoading: false,
    // 工序单价
    processList: [],
    processLoading: false,
    // 生产工序扫码（父子工序，可操作）
    processStages: [],
    processScanLoading: false,
    hasProcessSystem: false,
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
      this._patternCover = detail.coverImage || '';
      const basicInfo = {
        color: detail.color || '',
        size: detail.size || '',
        quantity: detail.quantity || 0,
        status: detail.status || '',
        statusText: detail.status || '',
        statusType: (detail.status || '').toLowerCase().replace('_', ''),
        cover: detail.coverImage || '',
      };
      this.setData({ _patternBasicInfo: basicInfo });
      const styleId = detail.styleId || detail.styleNo || '';
      if (styleId) {
        this.setData({ styleId, patternId });
        this.loadStyleDetail();
      } else {
        this.setData({
          styleInfo: {
            name: detail.styleNo || detail.patternProductionId || '未命名款式',
            styleNo: detail.styleNo || '',
            styleCode: '',
            cover: basicInfo.cover || '',
            ...basicInfo,
          },
          loading: false,
        });
        toast.error('该样衣暂无关联款式');
      }
    } catch (e) {
      console.error('获取样衣详情失败', e);
      this.setData({ loading: false });
      toast.error('加载失败');
    }
  },

  async loadStyleDetail() {
    this.setData({ loading: true });
    try {
      const res = await style.getStyleDetail(this.data.styleId);
      const styleInfo = res?.data || res || {};
      const basic = this.data._patternBasicInfo || {};
      if (Object.keys(basic).length > 0) {
        Object.assign(styleInfo, {
          color: basic.color || styleInfo.color || '',
          size: basic.size || styleInfo.size || '',
          quantity: basic.quantity || styleInfo.quantity || 0,
          status: basic.status || styleInfo.status || '',
          statusText: basic.statusText || styleInfo.statusText || '',
          statusType: basic.statusType || styleInfo.statusType || '',
          cover: basic.cover || styleInfo.cover || '',
        });
      }
      this.setData({ styleInfo, loading: false });
      this.buildStages(styleInfo);
      this.buildStyleImages(styleInfo);
      this.loadTabData(0);
      if (this.data.patternId) this.loadProductionScanStages();
    } catch (e) {
      console.error('加载款式详情失败', e);
      this.setData({ loading: false });
      toast.error('加载失败');
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

  /** 构建款式图片列表（cover + pattern自带的coverImage + 附件中的图片） */
  buildStyleImages(info) {
    const images = [];
    // 1. 款式封面
    if (info.cover) images.push(info.cover);
    // 2. 样衣审核图片（JSON数组）
    if (info.sampleReviewImages) {
      try {
        const arr = typeof info.sampleReviewImages === 'string'
          ? JSON.parse(info.sampleReviewImages)
          : info.sampleReviewImages;
        if (Array.isArray(arr)) {
          arr.forEach(url => { if (url && typeof url === 'string') images.push(url); });
        }
      } catch (e) { /* 非JSON格式，忽略 */ }
    }
    // 3. pattern 自带的 coverImage 兜底
    if (this._patternCover && !images.includes(this._patternCover)) {
      images.push(this._patternCover);
    }
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
      case 'production': this.loadProductionScanStages(); break; // 生产工序扫码（可操作）
      case 'process': this.loadStyleProcesses(); break; // 工序单价（款式维度）
      case 'bom': this.loadBom(); break;
      case 'secondary': this.loadSecondary(); break;
      case 'pattern': this.loadPattern(); break;
      case 'sheet': this.loadProduction(); break; // 制单
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

  async loadStyleProcesses() {
    if (this.data.processList.length > 0) return;
    this.setData({ processLoading: true });
    try {
      const res = await style.listProcesses({ styleId: this.data.styleId });
      this.setData({ processList: res?.data?.records || res?.data || res?.records || [] });
    } catch (e) { console.error('工序加载失败', e); }
    this.setData({ processLoading: false });
  },

  /** 加载生产工序扫码（父子工序，可操作） */
  async loadProductionScanStages() {
    if (this.data.processStages.length > 0) return;
    this.setData({ processScanLoading: true });
    try {
      const pid = this.data.patternId;
      const [detailRes, configRes, recordsRes] = await Promise.all([
        production.getPatternDetail(pid),
        production.getPatternProcessConfig(pid),
        production.getPatternScanRecords(pid),
      ]);
      const detail = detailRes?.data || detailRes || {};
      const config = configRes?.data || configRes || [];
      const records = recordsRes?.data || recordsRes || [];
      const processStages = this._buildProcessStages(config, records, detail);
      this.setData({
        processStages,
        hasProcessSystem: config.length > 0,
        processScanLoading: false,
      });
    } catch (e) {
      console.error('加载生产工序失败', e);
      this.setData({ processScanLoading: false });
    }
  },

  /** 构建生产工序列表（与列表页一致） */
  _buildProcessStages(config, records, patternDetail) {
    if (!config || !Array.isArray(config) || config.length === 0) return [];
    const completedSet = new Set();
    (records || []).forEach(r => {
      const name = r.progressStage || r.processName || r.operationType || '';
      if (name) completedSet.add(name.trim());
    });
    const stages = [];
    let firstIncompleteIdx = -1;
    for (let i = 0; i < config.length; i++) {
      const c = config[i];
      const processName = String(c.processName || c.operationType || '').trim();
      const completed = completedSet.has(processName);
      if (!completed && firstIncompleteIdx === -1) firstIncompleteIdx = i;
      const stageRecord = (records || []).find(r =>
        (r.progressStage || r.processName || r.operationType || '').trim() === processName
      );
      stages.push({
        processName,
        progressStage: c.progressStage || processName,
        scanType: c.scanType || 'production',
        completed,
        canOperate: !completed && i === firstIncompleteIdx,
        locked: !completed && i > firstIncompleteIdx,
        lockReason: !completed && i > firstIncompleteIdx ? '前置工序未完成' : '',
        color: patternDetail.color || (stageRecord && stageRecord.color) || '',
        size: patternDetail.size || (stageRecord && stageRecord.size) || '',
        quantity: patternDetail.quantity || (stageRecord && stageRecord.quantity) || 0,
        operatorName: stageRecord && stageRecord.operatorName ? stageRecord.operatorName : '',
        time: stageRecord && stageRecord.scanTime
          ? String(stageRecord.scanTime).substring(0, 16).replace('T', ' ')
          : '',
      });
    }
    return stages;
  },

  /** 点击生产工序 → 跳转扫码页 */
  onProductionProcessOperate(e) {
    const stage = e.currentTarget.dataset.stage;
    const patternId = this.data.patternId;
    if (!stage || !patternId) return;
    if (stage.locked) { toast.error(stage.lockReason || '前置工序未完成'); return; }
    if (!stage.canOperate) {
      if (stage.completed) toast.error('该工序已完成');
      return;
    }
    const url = `/pages/scan/pattern/index?patternId=${encodeURIComponent(patternId)}` +
      `&manual=1&processName=${encodeURIComponent(stage.processName || '')}` +
      `&progressStage=${encodeURIComponent(stage.progressStage || '')}` +
      `&scanType=${encodeURIComponent(stage.scanType || '')}`;
    wx.navigateTo({ url }).catch(() => {});
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
        toast.error('领取失败');
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
          toast.error('操作失败');
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
          toast.success('已退回');
          this.loadStyleDetail();
        } catch (e) {
          toast.error('退回失败');
        }
      }
    });
  },

  /** 刷新 */
  onRefresh() {
    this.loadStyleDetail();
  },
});
