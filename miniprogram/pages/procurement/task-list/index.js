const api = require('../../../utils/api');
const { toast, safeNavigate, scanInPage } = require('../../../utils/uiHelper');
const { eventBus, Events, triggerDataRefresh } = require('../../../utils/eventBus');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { getUserInfo } = require('../../../utils/storage');
const displayHelper = require('../../../utils/displayHelper');

/**
 * 筛选 Tab 定义（与 PC 端 MaterialSearchForm 状态筛选对齐）
 * 全部 / 待采购 / 已领取 / 部分到货 / 已完成 / 已取消 / 已延期
 * pillClass 对应 dashboard 的 filter-pill--* 颜色类
 */
const STATUS_TABS = [
  { key: '', label: '全部', pillClass: '' },
  { key: 'pending', label: '待采购', pillClass: '' },
  { key: 'received', label: '已领取', pillClass: 'filter-pill--prod' },
  { key: 'partial', label: '部分到货', pillClass: 'filter-pill--prod' },
  { key: 'completed', label: '已完成', pillClass: 'filter-pill--done' },
  { key: 'cancelled', label: '已取消', pillClass: '' },
  { key: 'delayed', label: '已延期', pillClass: 'filter-pill--danger' },
];

/**
 * displayHelper 颜色常量 → 小程序 tag-* 颜色类映射
 * （displayHelper 返回 CSS 变量，模板用 tag-* 类）
 */
const COLOR_TO_TAG_CLASS = {
  [displayHelper.STATUS_COLOR_DEFAULT]: 'tag-gray',
  [displayHelper.STATUS_COLOR_SUCCESS]: 'tag-green',
  [displayHelper.STATUS_COLOR_PROCESSING]: 'tag-blue',
  [displayHelper.STATUS_COLOR_WARNING]: 'tag-orange',
  [displayHelper.STATUS_COLOR_ERROR]: 'tag-red',
  [displayHelper.STATUS_COLOR_BLUE]: 'tag-blue',
  [displayHelper.STATUS_COLOR_CYAN]: 'tag-cyan',
  [displayHelper.STATUS_COLOR_ORANGE]: 'tag-orange',
  [displayHelper.STATUS_COLOR_VOLCANO]: 'tag-red',
  [displayHelper.STATUS_COLOR_PURPLE]: 'tag-purple',
  [displayHelper.STATUS_COLOR_GEEKBLUE]: 'tag-geekblue',
};

/**
 * 臆造/历史状态值本地兜底（displayHelper PURCHASE_STATUS_LABEL 未覆盖）
 * 文案对齐 displayHelper 语义
 */
const LOCAL_STATUS_FALLBACK = {
  procuring: { label: '采购中', color: displayHelper.STATUS_COLOR_BLUE },
  waiting_procurement: { label: '待采购', color: displayHelper.STATUS_COLOR_WARNING },
  procurement_in_progress: { label: '采购中', color: displayHelper.STATUS_COLOR_BLUE },
  material_preparation: { label: '物料准备中', color: displayHelper.STATUS_COLOR_BLUE },
  procurement_completed: { label: '采购完成', color: displayHelper.STATUS_COLOR_SUCCESS },
  delayed: { label: '已延期', color: displayHelper.STATUS_COLOR_ERROR },
};

/**
 * 统一状态展示：优先 displayHelper，未命中查本地兜底
 * @param {string} status - 已小写归一的状态值
 * @returns {{label:string, tagClass:string}|null}
 */
function resolveStatusDisplay(status) {
  if (!status) return null;
  const result = displayHelper.displayPurchaseStatus(status);
  if (result.text !== status) {
    return { label: result.text, tagClass: COLOR_TO_TAG_CLASS[result.color] || 'tag-gray' };
  }
  const fb = LOCAL_STATUS_FALLBACK[status];
  if (fb) {
    return { label: fb.label, tagClass: COLOR_TO_TAG_CLASS[fb.color] || 'tag-gray' };
  }
  return null;
}

/**
 * 状态优先级（数字越大优先级越高，聚合时取最高优先级作为整体状态）
 * 取"最差"状态作为款式整体状态，让用户一眼看到需要处理的款式
 */
const STATUS_PRIORITY = {
  cancelled: 7,
  delayed: 6,
  pending: 5,
  partial: 4,
  received: 3,
  procuring: 2,
  completed: 1,
};

Page({
  data: {
    loading: false,
    activeFilter: '',
    keyword: '',
    statusTabs: STATUS_TABS,
    items: [],         // 按款聚合后的卡片列表
    filteredItems: [],
  },

  onLoad() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.loadData();
  },

  onShow() {
    this._bindEvents();
  },

  onHide() { this._unbindEvents(); },
  onUnload() { this._unbindEvents(); },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  _bindEvents() {
    if (this._wsBound) return;
    this._wsBound = true;
    const that = this;
    this._onRefresh = () => that.loadData();
    eventBus.on(Events.REFRESH_ALL, this._onRefresh);
    eventBus.on(Events.DATA_CHANGED, this._onRefresh);
  },

  _unbindEvents() {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onRefresh) {
      eventBus.off(Events.REFRESH_ALL, this._onRefresh);
      eventBus.off(Events.DATA_CHANGED, this._onRefresh);
    }
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const res = await api.production.myProcurementTasks();
      const rawList = this._normalizeList(res);
      // 按款聚合：一个款一张卡片
      const items = this._groupByStyle(rawList);
      this.setData({ items, loading: false });
      this._applyFilter();
    } catch (err) {
      console.error('[ProcurementTaskList] loadData error', err);
      this.setData({ loading: false });
      toast.error('加载采购任务失败');
    }
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    this._applyFilter();
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
    this._applyFilter();
  },

  /**
   * 扫码按钮：当前页直接扫码 → 匹配款式 → 打开详情
   * 不再跳转到统一扫码页
   */
  onScanTap() {
    scanInPage((parsed, raw) => {
      if (!parsed) return; // 用户取消
      if (!parsed.success || !parsed.data) {
        toast.error('无法识别：' + (raw || ''));
        return;
      }
      const { orderNo, styleNo } = parsed.data;
      // 在当前列表中匹配
      const matched = this.data.items.find(item =>
        (orderNo && item.orderNo === orderNo) ||
        (styleNo && item.styleNo === styleNo)
      );
      if (matched) {
        // 找到匹配 → 打开详情
        this.onViewDetail({
          currentTarget: {
            dataset: {
              orderNo: matched.orderNo,
              styleNo: matched.styleNo,
              patternProductionId: matched.patternProductionId,
              sourceType: matched.sourceType,
            },
          },
        });
      } else {
        // 没找到 → 用扫到的 orderNo 直接打开详情页（让详情页查后端）
        if (orderNo) {
          this.onViewDetail({
            currentTarget: {
              dataset: { orderNo, styleNo: styleNo || '' },
            },
          });
        } else {
          toast.error('未匹配到采购任务');
        }
      }
    });
  },

  _applyFilter() {
    const { items, activeFilter, keyword } = this.data;
    let filtered = items;

    if (activeFilter) {
      filtered = filtered.filter(item => item.displayStatus === activeFilter);
    }

    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      filtered = filtered.filter(item =>
        (item.styleNo && item.styleNo.toLowerCase().includes(kw)) ||
        (item.orderNo && item.orderNo.toLowerCase().includes(kw)) ||
        (item.styleName && item.styleName.toLowerCase().includes(kw))
      );
    }

    const statusTabs = STATUS_TABS.map(tab => {
      let count = 0;
      if (!tab.key) {
        count = items.length;
      } else {
        count = items.filter(item => item.displayStatus === tab.key).length;
      }
      return { ...tab, count };
    });

    this.setData({ filteredItems: filtered, statusTabs });
  },

  onViewDetail(e) {
    const { orderNo, styleNo, patternProductionId, sourceType } = e.currentTarget.dataset;
    // 优先用 orderNo（大货），其次用 patternProductionId（样衣采购）
    if (!orderNo && !patternProductionId) return;
    const params = orderNo
      ? 'orderNo=' + encodeURIComponent(orderNo)
      : 'patternProductionId=' + encodeURIComponent(patternProductionId);
    safeNavigate({
      url: '/pages/procurement/task-detail/index?' + params +
        '&styleNo=' + encodeURIComponent(styleNo || '') +
        '&sourceType=' + encodeURIComponent(sourceType || ''),
    }).catch(() => {});
  },

  /**
   * 一键领取：领取该款式下所有待采购物料
   * 如果款式只有一个待领取物料，直接领取；多个则跳详情页批量领取
   */
  async onClaimPurchase(e) {
    const { groupKey } = e.currentTarget.dataset;
    const item = this.data.items.find(it => it.groupKey === groupKey);
    if (!item) return;

    // 找出所有待领取的物料
    const pendingItems = (item.items || []).filter(it => it.displayStatus === 'pending');
    if (pendingItems.length === 0) {
      toast.error('没有待领取的物料');
      return;
    }

    // 单条物料直接领取
    if (pendingItems.length === 1) {
      await this._claimOne(pendingItems[0]);
      return;
    }

    // 多条物料跳详情页批量领取
    this.onViewDetail({
      currentTarget: {
        dataset: {
          orderNo: item.orderNo,
          styleNo: item.styleNo,
          patternProductionId: item.patternProductionId,
          sourceType: item.sourceType,
        },
      },
    });
  },

  async _claimOne(purchaseItem) {
    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error('采购人信息缺失，请重新登录');
      return;
    }

    wx.showLoading({ title: '领取中...', mask: true });
    try {
      await api.production.receivePurchase({
        purchaseId: purchaseItem.id,
        receiverId,
        receiverName,
      });
      wx.hideLoading();
      toast.success('领取成功');
      triggerDataRefresh('procurement');
      this.loadData();
    } catch (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || '领取失败');
    }
  },

  _normalizeList(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    return [];
  },

  /**
   * 按款聚合：把物料级别记录按 orderNo 或 patternProductionId 聚合成款式级别卡片
   * - 大货订单：按 orderNo 聚合
   * - 样衣采购：按 patternProductionId 聚合
   * - 一个款多张采购单 → 一张卡片
   */
  _groupByStyle(rawList) {
    const groupMap = {};
    const order = [];

    rawList.forEach(raw => {
      const item = this._normalizeItem(raw);
      // 聚合键：优先 patternProductionId（样衣），其次 orderNo
      const groupKey = item.patternProductionId
        ? 'sample::' + item.patternProductionId
        : 'order::' + (item.orderNo || item.id || 'unknown');

      if (!groupMap[groupKey]) {
        groupMap[groupKey] = {
          groupKey,
          orderNo: item.orderNo || '',
          patternProductionId: item.patternProductionId || '',
          sourceType: item.sourceType || '',
          styleNo: item.styleNo || '',
          styleName: item.styleName || '',
          styleCoverUrl: item.styleCoverUrl || '',
          items: [],
        };
        order.push(groupKey);
      }

      groupMap[groupKey].items.push(item);
    });

    return order.map(key => this._buildGroupCard(groupMap[key]));
  },

  /**
   * 构建款式级别卡片
   */
  _buildGroupCard(group) {
    const items = group.items;

    // 计算整体状态（取最差状态）
    const displayStatus = this._computeGroupStatus(items);
    const statusConfig = resolveStatusDisplay(displayStatus) || { label: '待处理', tagClass: 'tag-gray' };

    // 物料数量
    const materialCount = items.length;

    // 总数量
    const totalQuantity = items.reduce((sum, it) => sum + (Number(it.purchaseQuantity) || 0), 0);

    // 交货日期：预计到货日期优先，为空时兜底订单交期（expectedShipDate，后端已回填）
    const expectedDates = items
      .map(it => it.expectedArrivalDate || it.expectedShipDate)
      .filter(Boolean)
      .sort();
    const actualDates = items
      .map(it => it.actualArrivalDate)
      .filter(Boolean)
      .sort();

    const isArrived = displayStatus === 'completed' || displayStatus === 'partial';
    const expectedDateText = expectedDates.length ? this._formatDate(expectedDates[0]) : '';
    const actualDateText = actualDates.length ? this._formatDate(actualDates[actualDates.length - 1]) : '';

    // 是否延期：按最早预计到货日期距今天数计算（供应商/采购员/到货明细等进详情页看）
    let overdue = false;
    let overdueText = '—';
    if (displayStatus === 'delayed' && expectedDates.length) {
      const d = new Date(this._formatDate(expectedDates[0]) + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.round((today - d) / 86400000);
        overdue = true;
        overdueText = days > 0 ? '延期' + days + '天' : '已延期';
      }
    }

    // 是否有待领取物料（用于显示"一键领取"按钮）
    // 仅在非终态（非已取消/已完成）时显示
    const isTerminal = displayStatus === 'cancelled' || displayStatus === 'completed';
    const pendingItems = isTerminal ? [] : items.filter(it => it.displayStatus === 'pending');

    return {
      groupKey: group.groupKey,
      orderNo: group.orderNo,
      patternProductionId: group.patternProductionId,
      sourceType: group.sourceType,
      styleNo: group.styleNo,
      styleName: group.styleName,
      styleCoverUrl: group.styleCoverUrl,
      displayStatus,
      statusLabel: statusConfig.label,
      statusTagClass: statusConfig.tagClass,
      materialCount,
      quantityText: this._formatQuantity(totalQuantity, items[0] && items[0].unit),
      isArrived,
      dateText: isArrived ? actualDateText : expectedDateText,
      overdue,
      overdueText,
      isPending: pendingItems.length > 0,
      pendingCount: pendingItems.length,
      items,
    };
  },

  /**
   * 计算款式整体状态（取最差状态）
   * 优先级：cancelled > delayed > pending > partial > received > procuring > completed
   */
  _computeGroupStatus(items) {
    if (!items || items.length === 0) return 'pending';

    let maxPriority = 0;
    let maxStatus = 'pending';

    items.forEach(item => {
      const status = this._computeDisplayStatus(item);
      const priority = STATUS_PRIORITY[status] || 0;
      if (priority > maxPriority) {
        maxPriority = priority;
        maxStatus = status;
      }
    });

    return maxStatus;
  },

  /**
   * 将后端物料采购记录规范化为前端展示对象
   * 设计稿：物料级别卡片，每条记录一张卡片
   */
  _normalizeItem(item) {
    const rawStatus = String(item.status || '').trim().toLowerCase();
    const displayStatus = this._computeDisplayStatus(item);
    const statusConfig = resolveStatusDisplay(rawStatus) || resolveStatusDisplay(displayStatus) || { label: '待领取', tagClass: 'tag-orange' };

    const styleCoverUrl = getAuthedImageUrl(item.styleCover || '');

    return {
      ...item,
      id: item.id || item.purchaseId || '',
      displayStatus,
      statusLabel: statusConfig.label,
      statusTagClass: statusConfig.tagClass,
      styleCoverUrl,
      expectedDateText: this._formatDate(item.expectedArrivalDate || item.expectedShipDate),
      actualDateText: this._formatDate(item.actualArrivalDate),
    };
  },

  /**
   * 计算展示状态（与 PC 端 MaterialSearchForm 状态对齐：7 档）
   * 优先级：已取消 > 已完成 > 已延期 > 已领取 > 部分到货 > 待采购 > 采购中
   * 注：cancelled 优先级高于 delayed，因为取消是终态；延期是过程态
   */
  _computeDisplayStatus(item) {
    const rawStatus = String(item.status || '').trim().toLowerCase();

    if (rawStatus === 'cancelled') {
      return 'cancelled';
    }

    if (rawStatus === 'completed' || rawStatus === 'procurement_completed') {
      return 'completed';
    }

    // 部分到货（优先级高于延期，因为部分到货是事实，延期是时间）
    if (rawStatus === 'partial' || rawStatus === 'partial_arrival') {
      return 'partial';
    }

    // 已领取（received 状态：已领取但未到货或部分到货）
    if (rawStatus === 'received') {
      return 'received';
    }

    // 延期：未到货且已超期（预计到货日期为空时兜底订单交期）
    if (this._isOverdue(item.expectedArrivalDate || item.expectedShipDate)) {
      return 'delayed';
    }

    // 待采购：未领取
    if (!rawStatus || rawStatus === 'pending' || rawStatus === 'waiting_procurement') {
      return 'pending';
    }

    // 其余状态归为采购中（procurement / purchasing / material_preparation / awaiting_confirm / warehouse_pending）
    return 'procuring';
  },

  _isOverdue(expectedArrivalDate) {
    if (!expectedArrivalDate) return false;
    const dateStr = String(expectedArrivalDate).substring(0, 10);
    if (!dateStr || dateStr.length < 10) return false;
    const expected = new Date(dateStr + 'T00:00:00');
    if (isNaN(expected.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expected < today;
  },

  _formatDate(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).substring(0, 10);
  },

  _formatQuantity(qty, unit) {
    const q = Number(qty || 0);
    const u = unit || '';
    return u ? q + u : String(q);
  },
});
