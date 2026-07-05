const { style } = require('../../../utils/api-modules/style-warehouse');
const production = require('../../../utils/api-modules/production');
const { fieldConfig } = require('../../../utils/api-modules/field-config');
const { toast } = require('../../../utils/uiHelper');
const permission = require('../../../utils/permission');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

/* ========== 纸样状态 / 开发来源 中文化 ========== */
var PATTERN_STATUS_LABELS = { PENDING: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', RETURNED: '已退回', LOCKED: '已锁定', UNLOCKED: '未锁定', NOT_STARTED: '未开始' };
var SOURCE_TYPE_LABELS = { SELF_DEVELOPED: '自主开发', SELECTION_CENTER: '选款中心', CUSTOMER_PROVIDED: '客户提供', OEM_DESIGN: 'OEM 设计', OTHER: '其他' };

/* ========== 与 PC 端 / 列表页 完全一致的状态与交期计算 ========== */

// PC 端同款 getProgressNodeColor：中文关键字匹配颜色
// 返回: default | success | warning | error | processing
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

// PC 端同款 getDeliveryMeta：计算交期标签
function getDeliveryMeta(record, allStagesCompleted) {
  if (!record) return { tone: 'normal', label: '' };
  const sampleStatus = String(record.sampleStatus || record.status || '').trim().toUpperCase();
  if (sampleStatus === 'SCRAPPED') return { tone: 'scrapped', label: '已报废' };
  if (sampleStatus === 'CLOSED') return { tone: 'scrapped', label: '已关单' };
  if (sampleStatus === 'COMPLETED' || sampleStatus === 'WAREHOUSE_IN') return { tone: 'success', label: '已完成' };
  if (allStagesCompleted) return { tone: 'success', label: '已完成' };
  const deliveryDate = record.deliveryDate || record.deliveryTime;
  if (!deliveryDate) return { tone: 'normal', label: '待补交期' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deliveryDate);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { tone: 'danger', label: '延期' + Math.abs(diffDays) + '天' };
  if (diffDays <= 3) return { tone: 'warning', label: diffDays + '天内交板' };
  return { tone: 'normal', label: diffDays + '天后交板' };
}

// 英文枚举 → 中文兜底映射（当后端没有返回 progressNode 时使用）
const EN_TO_CN = {
  PENDING: '待领取',
  IN_PROGRESS: '制作中',
  PROGRESS: '制作中',
  COMPLETED: '已完成',
  WAREHOUSE_IN: '已入库',
  ENABLED: '启用',
  ACTIVE: '启用',
  DISABLED: '已停用',
  REVIEW_PENDING: '待审核',
  REVIEWED: '已审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  CANCELLED: '已取消',
  CANCELED: '已取消',
  SCRAPPED: '样衣报废',
  CLOSED: '已关单',
};

// 主状态文本：优先使用后端返回的 progressNode（已是中文），否则使用枚举映射
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

// 可手动领取/完成的子工序（其他只展示）
const ACTIONABLE_STAGES = new Set(['pattern', 'bom', 'process', 'secondary', 'production']);

Page({
  data: {
    styleId: '',
    patternId: '',
    styleInfo: null,
    loading: true,
    showDetails: false,
    // 开发阶段快捷操作（与 PC 端 useStagePanel 一致）
    stages: [],
    // 样衣生产工作流快捷操作（与 PC 端 useSampleStage 一致）
    showSampleWorkflow: false,
    canReceiveSample: false,
    canCompleteSample: false,
    sampleWfStatusText: '',
    // BOM清单
    bomList: [],
    bomLoading: false,
    // 采购节点（样衣采购，与 PC 端 useSampleProcurementQuickActions 一致）
    purchaseList: [],
    purchaseLoading: false,
    purchaseGenerating: false,
    // BOM 物料数量编辑（同步 devUsageAmount 回 BOM）
    editingBomId: '',
    editingBomQty: '',
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
    // 扩展字段配置
    extFields: [],
  },

  onLoad(options) {
    const styleId = options.styleId || '';
    const patternId = options.id || options.patternId || '';
    if (!styleId && !patternId) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      return;
    }
    this.setData({ styleId, patternId });
    // 加载扩展字段配置（非阻塞，不影响主流程）
    this.loadExtFields();
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
      // 保存 pattern 自带的 coverImage 作为兜底
      this._patternCover = getAuthedImageUrl(detail.coverImage || detail.styleImage || detail.cover || '');
      // 构建样衣生产工作流快捷操作
      this.buildSampleWorkflow(detail);
      // 把 PatternProduction 基础字段存起来，后续合并到 styleInfo
      const rawStatus = detail.status || '';
      const mainStatus = resolveMainStatus(detail);
      const mainStatusColor = getProgressNodeColor(mainStatus);
      const deliveryMeta = getDeliveryMeta(detail, false);
      const basicInfo = {
        color: detail.color || detail.colorName || '',
        size: detail.size || detail.sizeName || (Array.isArray(detail.sizes) && detail.sizes.length ? detail.sizes.join('/') : ''),
        quantity: detail.quantity || detail.sampleQuantity || detail.totalQuantity || 0,
        status: rawStatus,
        // 与 PC 端一致：主状态 + 颜色 + 交期
        _mainStatus: mainStatus,
        _mainStatusColor: mainStatusColor,
        _deliveryLabel: deliveryMeta.label,
        _deliveryTone: deliveryMeta.tone,
        cover: getAuthedImageUrl(detail.coverImage || detail.styleImage || detail.cover || ''),
      };
      this.setData({ _patternBasicInfo: basicInfo });
      const styleId = detail.styleId || detail.styleNo || '';
      if (styleId) {
        this.setData({ styleId, patternId });
        this.loadStyleDetail();
      } else {
        // 没有 styleId：把 pattern 数据作为 styleInfo 展示
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
        // 仍尝试加载工序列表（若 patternId 存在）
        if (this.data.patternId) this.loadProductionScanStages();
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
      const styleInfo = res?.data || res || {};
      // 合并 PatternProduction 基础字段（颜色/码数/数量/状态），让头部能显示
      const basic = this.data._patternBasicInfo || {};
      // 从 styleInfo 自身提取多字段兼容（款式维度
      const styleColor = styleInfo.color || styleInfo.colorName || '';
      const styleSize = styleInfo.size || styleInfo.sizeName || (Array.isArray(styleInfo.sizes) && styleInfo.sizes.length ? styleInfo.sizes.join('/') : '');
      const styleQty = styleInfo.quantity || styleInfo.sampleQuantity || styleInfo.totalQuantity || styleInfo.sampleCount || 0;
      const styleCover = getAuthedImageUrl(styleInfo.cover || styleInfo.coverImage || styleInfo.styleImage || '');
      // 计算主状态 + 颜色 + 交期（与 PC 端一致）
      const finalColor = basic.color || styleColor;
      const finalSize = basic.size || styleSize;
      const finalQty = basic.quantity || styleQty;
      Object.assign(styleInfo, {
        styleName: styleInfo.styleName || styleInfo.name || '',
        styleNo: styleInfo.styleNo || styleInfo.styleCode || styleInfo.styleId || '',
        color: finalColor,
        size: finalSize,
        quantity: finalQty,
        cover: basic.cover || styleCover,
        // 与 PC 端一致：主状态 + 颜色 + 交期（覆盖 basic 中的同名字段）
        _mainStatus: basic._mainStatus || resolveMainStatus(styleInfo),
        _mainStatusColor: basic._mainStatusColor || getProgressNodeColor(basic._mainStatus || resolveMainStatus(styleInfo)),
        _deliveryLabel: basic._deliveryLabel || getDeliveryMeta({
          deliveryDate: styleInfo.deliveryTime || styleInfo.deliveryDate,
          sampleStatus: styleInfo.sampleStatus || styleInfo.status,
          status: styleInfo.status,
        }, false).label,
        _deliveryTone: basic._deliveryTone || getDeliveryMeta({
          deliveryDate: styleInfo.deliveryTime || styleInfo.deliveryDate,
          sampleStatus: styleInfo.sampleStatus || styleInfo.status,
          status: styleInfo.status,
        }, false).tone,
        // 客户信息（兼容多字段）
        customer: styleInfo.customer || styleInfo.customerName || styleInfo.buyer || styleInfo.buyerName || '',
        category: styleInfo.category || styleInfo.productCategory || '',
        developmentSourceType: styleInfo.developmentSourceType || styleInfo.sourceType || '',
        developmentSourceText: (styleInfo.developmentSourceType || styleInfo.sourceType)
          ? (SOURCE_TYPE_LABELS[String(styleInfo.developmentSourceType || styleInfo.sourceType).toUpperCase()] || '其他')
          : '',
        season: styleInfo.season || '',
        // 制版师 / 操作工
        patternMaker: styleInfo.patternMaker || styleInfo.patternDeveloper || styleInfo.receiver || '',
        receiver: styleInfo.receiver || '',
        // 时间字段（格式化前端展示用）
        _releaseTime: styleInfo.releaseTime || styleInfo.createTime || '',
        _deliveryTime: styleInfo.deliveryTime || '',
        _completeTime: styleInfo.completeTime || styleInfo.sampleCompletedTime || '',
      });
      this.setData({ styleInfo, loading: false });
      this.buildStages(styleInfo);
      this.buildStyleImages(styleInfo);
      // 并行预加载折叠区域内的所有数据
      this.loadBom();
      this.loadStyleProcesses();
      this.loadSecondary();
      this.loadPattern();
      this.loadProduction();
      this.loadQuotation();
      this.loadAttachments();
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

  /**
   * 构建样衣生产工作流快捷操作（与 PC 端 useSampleStage 一致）
   * 根据 patternDetail.status 判断可领取/可完成
   *   PENDING → 可领取
   *   IN_PROGRESS / PROGRESS → 可标记完成
   *   COMPLETED / WAREHOUSE_IN → 已完成，不显示按钮
   */
  buildSampleWorkflow(patternDetail) {
    if (!patternDetail || !this.data.patternId) {
      this.setData({ showSampleWorkflow: false, canReceiveSample: false, canCompleteSample: false, sampleWfStatusText: '' });
      return;
    }
    const rawStatus = String(patternDetail.status || patternDetail.sampleStatus || '').trim().toUpperCase();
    const isScrapped = rawStatus === 'SCRAPPED' || rawStatus === 'CLOSED';
    const isCompleted = rawStatus === 'COMPLETED' || rawStatus === 'WAREHOUSE_IN' ||
      String(patternDetail.progressNode || '').includes('完成');
    const isReceived = rawStatus === 'IN_PROGRESS' || rawStatus === 'PROGRESS' ||
      !!patternDetail.receiveTime || !!patternDetail.receiver;
    const canReceive = !isScrapped && !isCompleted && !isReceived;
    const canComplete = !isScrapped && !isCompleted && isReceived;
    let statusText = '未领取';
    if (isScrapped) statusText = '已报废/关单';
    else if (isCompleted) statusText = '已完成';
    else if (isReceived) statusText = '制作中';
    this.setData({
      showSampleWorkflow: !isScrapped,
      canReceiveSample: canReceive,
      canCompleteSample: canComplete,
      sampleWfStatusText: statusText,
    });
  },

  /** 构建款式图片列表（cover + pattern自带的coverImage + 附件中的图片） */
  buildStyleImages(info) {
    const images = [];
    // 1. 款式封面
    if (info.cover) images.push(info.cover);
    else if (info.coverImage) images.push(getAuthedImageUrl(info.coverImage));
    // 2. 样衣审核图片（JSON数组）
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
    // 3. 从 styleInfo 其他图片字段中提取
    const otherImgKeys = ['styleImages', 'photos', 'images', 'sampleImages'];
    for (let i = 0; i < otherImgKeys.length; i++) {
      const val = info[otherImgKeys[i]];
      if (Array.isArray(val)) {
        val.forEach(url => { if (url && typeof url === 'string') images.push(getAuthedImageUrl(url)); });
      } else if (typeof val === 'string' && val) {
        images.push(getAuthedImageUrl(val));
      }
    }
    // 4. pattern 自带的 coverImage 兜底（已做了认证）
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

  /** 切换折叠区域的展开/收起 */
  onToggleCollapse() {
    this.setData({ showDetails: !this.data.showDetails });
  },

  // === 数据加载方法 ===

  async loadBom() {
    if (this.data.bomList.length > 0) return;
    this.setData({ bomLoading: true });
    try {
      const res = await style.listBom({ styleId: this.data.styleId });
      const list = res?.data?.records || res?.data || res?.records || [];
      // 为每条 BOM 附加展示字段
      list.forEach(it => {
        it._displayQty = it.devUsageAmount || it.usageAmount || 0;
        it._unit = it.unit || '';
        it._materialLabel = it.materialName || it.name || '';
        it._specLabel = [it.spec, it.specification, it.color].filter(v => v).join(' ');
      });
      this.setData({ bomList: list });
      // BOM 加载完后，若有 styleNo 则加载采购列表
      this.loadPurchases();
    } catch (e) { console.error('BOM加载失败', e); }
    this.setData({ bomLoading: false });
  },

  /**
   * 加载样衣采购列表（与 PC 端 useSampleProcurementQuickActions 一致）
   * GET /api/production/purchase/list?styleNo=xxx&sourceType=sample
   */
  async loadPurchases() {
    const styleInfo = this.data.styleInfo || {};
    const styleNo = styleInfo.styleNo || styleInfo.styleCode || '';
    // 后端按 styleNo 过滤，没有 styleNo 时无法精确查询，跳过
    if (!styleNo) return;
    this.setData({ purchaseLoading: true });
    try {
      const params = {
        sourceType: 'sample',
        styleNo: styleNo,
        page: 1,
        pageSize: 200,
      };
      const res = await production.getMaterialPurchases(params);
      const data = res?.data || res || {};
      const records = data.records || (Array.isArray(data) ? data : []);
      // 附加展示字段
      records.forEach(p => {
        p._statusText = this._purchaseStatusText(p.status);
        p._canReceive = p.status === 'pending';
        p._canComplete = p.status === 'received' || p.status === 'awaiting_confirm';
      });
      this.setData({ purchaseList: records });
    } catch (e) {
      console.error('采购列表加载失败', e);
    }
    this.setData({ purchaseLoading: false });
  },

  /** 采购状态 → 中文 */
  _purchaseStatusText(status) {
    const s = String(status || '').toLowerCase();
    const map = {
      pending: '待采购',
      received: '已领取',
      awaiting_confirm: '待确认',
      completed: '已完成',
      partial_arrived: '部分到货',
      cancelled: '已取消',
    };
    return map[s] || status || '';
  },

  /** 生成样衣采购单（基于 BOM，与 PC 端 handleGeneratePurchase 一致） */
  onGeneratePurchase() {
    const styleId = this.data.styleId;
    if (!styleId) { toast.error('缺少款式信息'); return; }
    const hasExisting = this.data.purchaseList.length > 0;
    wx.showModal({
      title: '生成采购单',
      content: hasExisting
        ? '已存在采购记录，是否强制重新生成？（仅删除待采购状态的旧记录，已领取/已完成的不受影响）'
        : '将基于 BOM 清单自动生成样衣采购单，确认继续？',
      confirmText: hasExisting ? '强制重新生成' : '确认生成',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ purchaseGenerating: true });
        try {
          const result = await style.generateSamplePurchase({ styleId: Number(styleId), force: hasExisting });
          const count = (result && (result.data || result)) || 0;
          wx.showToast({ title: `已生成 ${count} 条采购记录`, icon: 'success' });
          // 刷新采购列表
          this.setData({ purchaseList: [] });
          this.loadPurchases();
        } catch (e) {
          const msg = (e && e.message) || '生成失败';
          toast.error(msg);
        }
        this.setData({ purchaseGenerating: false });
      }
    });
  },

  /** 编辑 BOM 物料数量（进入编辑状态） */
  onEditBomQty(e) {
    const bomId = e.currentTarget.dataset.id;
    const bom = this.data.bomList.find(b => b.id === bomId);
    if (!bom) return;
    this.setData({
      editingBomId: bomId,
      editingBomQty: String(bom.devUsageAmount || bom.usageAmount || ''),
    });
  },

  /** 取消编辑 BOM 物料数量 */
  onCancelEditBomQty() {
    this.setData({ editingBomId: '', editingBomQty: '' });
  },

  /** 编辑中输入数量 */
  onBomQtyInput(e) {
    this.setData({ editingBomQty: e.detail.value });
  },

  /**
   * 保存 BOM 物料数量（同步 devUsageAmount 回 BOM）
   * 调用 PUT /api/style/bom，后端会自动同步 pending 状态的样衣采购任务数量
   */
  onSaveBomQty(e) {
    const bomId = e.currentTarget.dataset.id;
    const bom = this.data.bomList.find(b => b.id === bomId);
    if (!bom) return;
    const rawVal = (this.data.editingBomQty || '').trim();
    const val = Number(rawVal);
    if (!rawVal || isNaN(val) || val < 0) {
      toast.error('请输入有效数量');
      return;
    }
    wx.showLoading({ title: '保存中...' });
    // 构造完整 payload（后端 PUT /api/style/bom 需要 id + 关键字段）
    const payload = {
      id: bom.id,
      styleId: bom.styleId,
      materialCode: bom.materialCode,
      materialName: bom.materialName,
      materialType: bom.materialType,
      spec: bom.spec,
      unit: bom.unit,
      devUsageAmount: val,
      usageAmount: val, // 同步到 usageAmount，保持一致
      lossRate: bom.lossRate || 0,
      unitPrice: bom.unitPrice || 0,
      supplier: bom.supplier || '',
    };
    style.updateBom(payload).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '已保存，采购数量已同步', icon: 'success' });
      // 更新本地 BOM 列表
      const list = this.data.bomList.map(b => {
        if (b.id === bomId) {
          b.devUsageAmount = val;
          b.usageAmount = val;
          b._displayQty = val;
        }
        return b;
      });
      this.setData({ bomList: list, editingBomId: '', editingBomQty: '' });
      // 刷新采购列表（pending 状态的采购数量已被后端自动同步）
      this.loadPurchases();
    }).catch(err => {
      wx.hideLoading();
      const msg = (err && err.message) || '保存失败';
      toast.error(msg);
    });
  },

  /** 领取采购任务（与 PC 端 useSampleProcurementQuickActions 一致） */
  onReceivePurchase(e) {
    const purchaseId = e.currentTarget.dataset.id;
    if (!purchaseId) return;
    const userInfo = wx.getStorageSync('userInfo') || {};
    wx.showModal({
      title: '领取确认',
      content: '确认领取此采购任务？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await production.receivePurchase({
            purchaseId: purchaseId,
            receiverId: userInfo.userId || userInfo.id || '',
            receiverName: userInfo.realName || userInfo.nickname || userInfo.userName || '',
          });
          wx.hideLoading();
          wx.showToast({ title: '领取成功', icon: 'success' });
          this.loadPurchases();
        } catch (err) {
          wx.hideLoading();
          toast.error((err && err.message) || '领取失败');
        }
      }
    });
  },

  /** 确认采购完成（与 PC 端 useSampleProcurementQuickActions 一致） */
  onConfirmPurchaseComplete(e) {
    const purchaseId = e.currentTarget.dataset.id;
    if (!purchaseId) return;
    wx.showModal({
      title: '确认完成',
      content: '确认此采购任务已完成？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await production.confirmPurchaseComplete({ purchaseId: purchaseId });
          wx.hideLoading();
          wx.showToast({ title: '已完成', icon: 'success' });
          this.loadPurchases();
        } catch (err) {
          wx.hideLoading();
          toast.error((err && err.message) || '操作失败');
        }
      }
    });
  },

  async loadStyleProcesses() {
    if (this.data.processList.length > 0) return;
    this.setData({ processLoading: true });
    try {
      const res = await style.listProcesses({ styleId: this.data.styleId });
      const list = res?.data?.records || res?.data || res?.records || [];
      // 添加 processCodeText 字段用于显示（processCode 是工序编号，保留原值）
      list.forEach(p => {
        p.processCodeText = p.processCode || '';
      });
      this.setData({ processList: list });
    } catch (e) { console.error('工序加载失败', e); }
    this.setData({ processLoading: false });
  },

  /** 加载生产工序扫码（父子工序，可操作） */
  async loadProductionScanStages() {
    const pid = (this.data.patternId || '').trim();
    if (!pid) {
      console.warn('[loadProductionScanStages] patternId为空，跳过加载');
      return;
    }
    if (this.data.processStages.length > 0) return;
    this.setData({ processScanLoading: true });
    try {
      const [detailRes, configRes, recordsRes] = await Promise.all([
        production.getPatternDetail(pid),
        production.getPatternProcessConfig(pid),
        production.getPatternScanRecords(pid),
      ]);
      const detail = detailRes?.data || detailRes || {};
      const config = configRes?.data || configRes || [];
      const records = recordsRes?.data || recordsRes || [];
      const processStages = this._buildProcessStages(config, records, detail);
      // 同步更新样衣生产工作流状态（detail 中含最新 status/receiveTime）
      this.buildSampleWorkflow(detail);
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

    // 从 patternDetail 预提取基础字段（一次提取，全工序共用）
    const colorCandidates = [patternDetail && patternDetail.color, patternDetail && patternDetail.colorName, patternDetail && patternDetail.sampleColor];
    const baseColor = colorCandidates.find(function (v) { return v != null && v !== ''; }) || '';
    let baseSize = (patternDetail && (patternDetail.size || patternDetail.sizeName)) || '';
    if (!baseSize && patternDetail && Array.isArray(patternDetail.sizes) && patternDetail.sizes.length) {
      baseSize = patternDetail.sizes.join('/');
    }
    const qtyCandidates = [patternDetail && patternDetail.quantity, patternDetail && patternDetail.sampleQuantity, patternDetail && patternDetail.totalQuantity, patternDetail && patternDetail.orderQuantity];
    const baseQuantity = qtyCandidates.find(function (v) { return typeof v === 'number' && v > 0; }) || 0;

    const completedSet = new Set();
    (records || []).forEach(r => {
      const name = (r.progressStage || r.processName || r.operationType || '').toString().trim();
      if (name) completedSet.add(name);
    });
    const stages = [];
    let firstIncompleteIdx = -1;
    for (let i = 0; i < config.length; i++) {
      const c = config[i];
      const processName = String(c.processName || c.operationType || '').trim();
      const isCompleted = completedSet.has(processName);
      if (!isCompleted && firstIncompleteIdx === -1) firstIncompleteIdx = i;
      const stageRecord = (records || []).find(r =>
        (r.progressStage || r.processName || r.operationType || '').toString().trim() === processName
      );
      stages.push({
        processName,
        progressStage: c.progressStage || processName,
        scanType: c.scanType || 'production',
        completed: isCompleted,
        canOperate: !isCompleted && i === firstIncompleteIdx,
        locked: !isCompleted && i > firstIncompleteIdx,
        lockReason: !isCompleted && i > firstIncompleteIdx ? '前置工序未完成' : '',
        color: (stageRecord && stageRecord.color) || baseColor,
        size: (stageRecord && stageRecord.size) || baseSize,
        quantity: (stageRecord && stageRecord.quantity) || baseQuantity,
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
      const list = res?.data?.records || res?.data || res?.records || [];
      // 二次工艺类型英文 code → 中文映射，兜底 '未知'，不展示英文 code
      const PROCESS_TYPE_MAP = {
        embroidery: '绣花', printing: '印花', washing: '洗水',
        dyeing: '染色', ironing: '整烫', pleating: '压褶',
        beading: '钉珠', other: '其他',
      };
      list.forEach(s => {
        const rawType = s.type || s.processType || '';
        s.typeText = rawType ? (PROCESS_TYPE_MAP[rawType] || '未知') : '';
      });
      this.setData({ secondaryList: list });
    } catch (e) { console.error('二次工艺加载失败', e); }
    this.setData({ secondaryLoading: false });
  },

  async loadPattern() {
    if (this.data.patternData) return;
    this.setData({ patternLoading: true });
    try {
      const res = await style.getPatternRevision(this.data.styleId);
      // getPatternRevision 直接返回纸样对象或null
      const patternData = res ? Object.assign({}, res) : null;
      if (patternData && patternData.status) {
        patternData.statusText = PATTERN_STATUS_LABELS[String(patternData.status).toUpperCase()] || '其他';
      }
      this.setData({ patternData });
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

  /** 领取样衣（与 PC 端 useSampleStage.receive 一致） */
  onSampleReceive() {
    const patternId = this.data.patternId;
    if (!patternId || !this.data.canReceiveSample) return;

    const doReceive = async () => {
      try {
        await production.receivePattern(patternId, '');
        wx.showToast({ title: '领取成功', icon: 'success' });
        // 刷新工作流状态 + 工序列表
        this.loadProductionScanStages();
        if (this.data.styleId) this.loadStyleDetail();
      } catch (e) {
        toast.error('领取失败');
      }
    };

    if (!permission.canReceiveTask('sample')) {
      wx.showModal({
        title: '岗位提示',
        content: `您当前职务「${permission.getRoleDisplayName()}」非样衣岗，确定代领样衣？`,
        confirmText: '确定代领',
        cancelText: '取消',
        success: (res) => { if (res.confirm) doReceive(); },
      });
    } else {
      wx.showModal({
        title: '领取确认',
        content: '确认领取此样衣任务？',
        success: (res) => { if (res.confirm) doReceive(); },
      });
    }
  },

  /** 标记样衣完成（与 PC 端 useSampleStage.complete 一致） */
  onSampleComplete() {
    const patternId = this.data.patternId;
    if (!patternId || !this.data.canCompleteSample) return;

    wx.showModal({
      title: '确认完成',
      content: '确认此样衣已制作完成？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await production.patternWorkflowAction(patternId, 'complete');
          wx.showToast({ title: '已标记完成', icon: 'success' });
          this.loadProductionScanStages();
          if (this.data.styleId) this.loadStyleDetail();
        } catch (e) {
          toast.error('操作失败');
        }
      }
    });
  },

  /** 刷新 */
  onRefresh() {
    this.loadStyleDetail();
  },
});
