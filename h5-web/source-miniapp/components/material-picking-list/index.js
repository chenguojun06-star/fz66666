/**
 * 领料出库列表（通用组件）
 *
 * 为什么要抽成组件（D-514）：
 *   同一份列表有两个消费方 —— ① 独立页 pages/warehouse/material-picking
 *   ② 物料中心 pages/warehouse/material-center 的「领料」tab（内联）。
 *
 * 业务（对标 PC 端 /production/picking MaterialPickingList）：
 *   两步流第二步：仓库确认出库
 *   - 待出库列表（status=pending）
 *   - 确认出库 → 扣减库存 + 状态 completed
 *   - 取消 → 回退库存 + 状态 cancelled
 *   - 展开看明细（后端 list 已把 items 塞进来了，不用额外请求）
 *
 * 后端契约（MaterialPickingController，@RequestMapping("/api/production/picking")）：
 *   GET  /list?page&pageSize&status&keyword → IPage<MaterialPicking>（含 items）
 *   POST /{id}/confirm-outbound              → 确认出库
 *   POST /{id}/cancel-pending                → 取消待出库
 * 状态值：pending（待出库）/ completed（已完成）/ cancelled（已取消）
 *
 * ⚠️ 路径注意：后端真实路由是 /api/production/picking，
 *   PC 端 MaterialPicking/index.tsx 里写的 /production/material-picking 后端没有（404），
 *   移动端 api.production.* 封装的是正确路径。
 *
 * ⚠️ 组件里不能用 onReachBottom（那是页面级生命周期），故底部提供「加载更多」按钮，
 *   并暴露 loadMore() 供父级在需要时调用。
 *
 * 事件：
 *   bind:success → 确认出库 / 取消成功后触发，父级可据此刷新库存
 */

const api = require('../../utils/api');
const i18n = require('../../utils/i18n/index');

/**
 * ⚠️ `key` 是**后端契约**（后端 status 存 pending/completed/cancelled），
 *    绝不能跟着语言变；label 由 applyLanguage 展开。
 */
const STATUS_TABS = [
  { key: '', labelKey: 'mp.warehouse.materialPicking.statusAll' },
  { key: 'pending', labelKey: 'mp.warehouse.materialPicking.statusPending' },
  { key: 'completed', labelKey: 'mp.warehouse.materialPicking.statusCompleted' },
  { key: 'cancelled', labelKey: 'mp.warehouse.materialPicking.statusCancelled' },
];

const STATUS_META = {
  pending: { labelKey: 'mp.warehouse.materialPicking.statusPending', color: '#f59e0b', bg: '#fffbeb' },
  completed: { labelKey: 'mp.warehouse.materialPicking.statusCompleted', color: '#10b981', bg: '#ecfdf5' },
  cancelled: { labelKey: 'mp.warehouse.materialPicking.statusCancelled', color: '#9ca3af', bg: '#f3f4f6' },
};

/** 用途：production=生产领料 sample=样品领料（与 PC 端一致）；key 是后端契约 */
const USAGE_LABEL_KEYS = {
  production: 'common.usageProduction',
  sample: 'common.usageSample',
  BULK: 'common.usageProduction',
  SAMPLE: 'common.usageSample',
  STOCK: 'common.usageStock',
};

/** 领取方式：SELF=自领 DELIVERY=配送 等，未知时原样显示 */
const PICKUP_LABEL_KEYS = {
  SELF: 'mp.warehouse.materialPicking.pickupSelf',
  DELIVERY: 'mp.warehouse.materialPicking.pickupDelivery',
  PICKUP: 'mp.warehouse.materialPicking.pickupSelf',
};

/** 把「只带 labelKey 的状态页签」按当前语言展开成 wxml 需要的 {key, label} */
function localizeStatusTabs(lang) {
  return STATUS_TABS.map(function (o) {
    return { key: o.key, label: i18n.t(o.labelKey, lang) };
  });
}

function fmtTime(v) {
  if (!v) return '';
  const s = String(v).replace(' ', 'T');
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(v || '');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** 初始状态筛选（D-515：默认「全部」，与 PC 端一致）
        不要默认 pending —— D-099 后内部领料是「领取即出库」直接落 completed，
        默认只看待出库会一直空白。从待办通知跳过来时仍可显式传 pending。 */
    status: {
      type: String,
      value: '',
    },
    /** 是否显示吸顶搜索栏（内联在 tab 里时父级已提供，可关掉） */
    showSearch: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    statusTabs: localizeStatusTabs(i18n.getLanguage()),
    status: '',
    keyword: '',
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: true,
    // 展开明细的领料单 id
    expandedId: '',
    submittingId: '',

    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},
  },

  lifetimes: {
    attached: function () {
      this.applyLanguage(i18n.getLanguage());
      const st = this.properties.status || '';
      const valid = STATUS_TABS.some((t) => t.key === st);
      if (valid && st) {
        this.setData({ status: st }, () => this.loadList(true));
      } else {
        this.loadList(true);
      }
    },
  },

  pageLifetimes: {
    show: function () {
      // 用户可能在「我的 → 语言」里切了语言，回到本页时重刷（组件拿不到 onShow）
      this.applyLanguage(i18n.getLanguage());
    },
  },

  methods: {
    /**
     * 按当前语言刷新全部文案。
     *
     * ⚠️ 组件里没有 json 导航栏标题（标题在宿主页的 json 里），故这里不设标题。
     */
    applyLanguage(language) {
      const lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
      this._lang = lang;
      this.setData({
        t: {
          searchPlaceholder: i18n.t('mp.warehouse.materialPicking.searchPlaceholder', lang),
          loading: i18n.t('common.loading', lang),
          noData: i18n.t('common.noData', lang),
          emptyPending: i18n.t('mp.warehouse.materialPicking.emptyPending', lang),
          emptyPendingHint: i18n.t('mp.warehouse.materialPicking.emptyPendingHint', lang),
          order: i18n.t('common.order', lang),
          styleNo: i18n.t('common.styleNo', lang),
          pickerLabel: i18n.t('mp.warehouse.materialPicking.pickerLabel', lang),
          factory: i18n.t('common.factory', lang),
          usageLabel: i18n.t('mp.warehouse.materialPicking.usageLabel', lang),
          time: i18n.t('common.time', lang),
          detailEmpty: i18n.t('mp.warehouse.materialPicking.detailEmpty', lang),
          cancel: i18n.t('common.cancel', lang),
          confirmOutbound: i18n.t('mp.warehouse.materialPicking.confirmOutbound', lang),
          processing: i18n.t('mp.warehouse.materialPicking.processing', lang),
          loadMore: i18n.t('common.loadMore', lang),
          noMore: i18n.t('common.noMore', lang),
        },
        statusTabs: localizeStatusTabs(lang),
        list: this._decorateList(this.data.list, lang),
      });
      this._refreshSummaryTexts(lang);
    },

    /** 列表里每条都有「共 N 张 / 已显示 N / 物料明细（N 项）」这类带参文案 → 逐条生成 */
    _decorateList(list, lang) {
      return (list || []).map((item) => {
        const decorated = Object.assign({}, item);
        decorated._detailTitle = i18n.tf('mp.warehouse.materialPicking.detailTitle', { count: item.itemCount }, lang);
        decorated.items = (item.items || []).map((it) => Object.assign({}, it, {
          _locationText: i18n.tf('mp.warehouse.materialPicking.locationText', { loc: it.warehouseLocation }, lang),
        }));
        return decorated;
      });
    },

    /** 顶部统计（共 N 张 / · 已显示 N）—— 条数在 data 里，语言切换时要重算 */
    _refreshSummaryTexts(lang) {
      const l = lang || this._lang;
      this.setData({
        't.totalText': i18n.tf('mp.warehouse.materialPicking.totalText', { total: this.data.total }, l),
        't.shownText': i18n.tf('mp.warehouse.materialPicking.shownText', { count: (this.data.list || []).length }, l),
      });
    },
    onStatusTap(e) {
      const key = e.currentTarget.dataset.key || '';
      if (key === this.data.status) return;
      this.setData({ status: key }, () => this.loadList(true));
    },

    onKeywordInput(e) {
      this.setData({ keyword: e.detail.value || '' });
    },

    onSearch() {
      this.loadList(true);
    },

    onSearchClear() {
      this.setData({ keyword: '' });
      this.loadList(true);
    },

    /** 供父级调用：刷新列表 */
    refresh() {
      return this.loadList(true);
    },

    loadMore() {
      if (this.data.hasMore && !this.data.loading) this.loadList(false);
    },

    loadList: async function (reset) {
      if (reset) {
        this.setData({ loading: true, page: 1, hasMore: true, list: [] });
      } else {
        if (!this.data.hasMore) return;
        this.setData({ loading: true });
      }
      try {
        const params = {
          page: reset ? 1 : this.data.page + 1,
          pageSize: this.data.pageSize,
          status: this.data.status || undefined,
          keyword: this.data.keyword || undefined,
        };
        const res = await api.production.getPickingList(params);
        // 兼容 IPage 与裸数组两种返回
        const records = (res && res.records) || (res && res.data && res.data.records) || [];
        const total = (res && res.total) || (res && res.data && res.data.total) || 0;
        const mapped = records.map((r) => this._toRow(r, this._lang));
        const next = reset ? mapped : this.data.list.concat(mapped);
        this.setData({
          list: next,
          total,
          page: params.page,
          hasMore: next.length < total,
          loading: false,
        });
        this._refreshSummaryTexts();
      } catch (e) {
        this.setData({ loading: false });
        wx.showToast({ title: (e && e.message) || i18n.t('common.loadFailed', this._lang), icon: 'none' });
      }
    },

    _toRow(r, lang) {
      const st = r.status || '';
      const meta = STATUS_META[st];
      const items = Array.isArray(r.items) ? r.items : [];
      return {
        id: r.id,
        pickingNo: r.pickingNo || '-',
        orderNo: r.orderNo || '-',
        styleNo: r.styleNo || '-',
        pickerName: r.pickerName || '-',
        factoryName: r.factoryName || '',
        usageLabel: USAGE_LABEL_KEYS[r.usageType]
          ? i18n.t(USAGE_LABEL_KEYS[r.usageType], lang)
          : (r.usageType || '-'),
        pickupLabel: PICKUP_LABEL_KEYS[r.pickupType]
          ? i18n.t(PICKUP_LABEL_KEYS[r.pickupType], lang)
          : (r.pickupType || ''),
        status: st,
        statusLabel: meta ? i18n.t(meta.labelKey, lang) : (st || '-'),
        statusColor: meta ? meta.color : '#6b7280',
        statusBg: meta ? meta.bg : '#f3f4f6',
        isPending: st === 'pending',
        createTime: fmtTime(r.createTime || r.pickTime),
        itemCount: items.length,
        // 明细：后端 list 已塞好 items，直接展示
        items: items.map((it) => ({
          materialCode: it.materialCode || '-',
          materialName: it.materialName || it.materialCode || '-',
          color: it.color || '',
          size: it.size || '',
          quantity: it.quantity,
          unit: it.unit || '',
          warehouseLocation: it.warehouseLocation || '-',
        })),
      };
    },

    /** 展开/收起明细 */
    onToggleDetail(e) {
      const id = e.currentTarget.dataset.id;
      this.setData({ expandedId: this.data.expandedId === id ? '' : id });
    },

    /** 确认出库（两步流第二步：扣减库存 + 状态 completed） */
    onConfirmOutbound(e) {
      const id = e.currentTarget.dataset.id;
      const no = e.currentTarget.dataset.no || '';
      if (!id) return;
      const self = this;
      wx.showModal({
        title: i18n.t('mp.warehouse.materialPicking.confirmOutbound', this._lang),
        content: i18n.tf('mp.warehouse.materialPicking.confirmOutboundText', { no: no }, this._lang),
        success: function (res) {
          if (!res.confirm) return;
          self._doConfirmOutbound(id);
        },
      });
    },

    _doConfirmOutbound: async function (id) {
      this.setData({ submittingId: id });
      try {
        await api.production.confirmPickingOutbound(id);
        wx.showToast({ title: i18n.t('mp.warehouse.materialPicking.outboundSuccess', this._lang), icon: 'success' });
        await this.loadList(true);
        this.triggerEvent('success', { action: 'confirm', id: id });
      } catch (e) {
        wx.showToast({ title: (e && e.message) || i18n.t('mp.warehouse.materialPicking.outboundFailed', this._lang), icon: 'none' });
      } finally {
        this.setData({ submittingId: '' });
      }
    },

    /** 取消待出库（回退库存） */
    onCancel(e) {
      const id = e.currentTarget.dataset.id;
      const no = e.currentTarget.dataset.no || '';
      if (!id) return;
      const self = this;
      wx.showModal({
        title: i18n.t('mp.warehouse.materialPicking.cancelTitle', this._lang),
        content: i18n.tf('mp.warehouse.materialPicking.cancelText', { no: no }, this._lang),
        confirmColor: '#dc2626',
        success: function (res) {
          if (!res.confirm) return;
          self._doCancel(id);
        },
      });
    },

    _doCancel: async function (id) {
      this.setData({ submittingId: id });
      try {
        await api.production.cancelPickingPending(id);
        wx.showToast({ title: i18n.t('mp.warehouse.materialPicking.cancelSuccess', this._lang), icon: 'success' });
        await this.loadList(true);
        this.triggerEvent('success', { action: 'cancel', id: id });
      } catch (e) {
        wx.showToast({ title: (e && e.message) || i18n.t('mp.warehouse.materialPicking.cancelFailed', this._lang), icon: 'none' });
      } finally {
        this.setData({ submittingId: '' });
      }
    },
  },
});
