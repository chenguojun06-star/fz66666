/**
 * 领料出库（手机端）— 对标 PC 端 /production/picking（MaterialPickingList）
 *
 * 背景（用户 2026-09-21 反馈）：
 *   "领取面料 手机端有没有提示 待出库的这些通知信息 点击跳转对应的物料仓库做这些"
 *
 * 核实结论：
 *   1. 通知是有的：todo-detail 页展示统一待办，MATERIAL_PICKING 类型有「去领料」按钮
 *   2. 但跳转缺：MATERIAL_PICKING → /pages/warehouse/material/scan/index（扫码页）
 *      ——扫码页只能「确认发料/退回」（走 materialRoll.scan 改料卷状态），
 *      不是领料出库两步流，看不到待出库列表，也确认不了出库。
 *   3. 结果：采购员在手机端能创建待出库领料单（procurement/task-detail 调 createPickingPending），
 *      但仓库人员在手机端看不到、也确认不了 —— 闭环断了。
 *
 * 本页补上这个闭环（两步流第二步：仓库确认出库）：
 *   - 待出库列表（status=pending）
 *   - 确认出库 → 扣减库存 + 状态 completed
 *   - 取消 → 回退库存 + 状态 cancelled
 *   - 展开看明细（后端 list 已把 items 塞进来了，不用额外请求）
 *
 * 后端契约（MaterialPickingController，@RequestMapping("/api/production/picking")）：
 *   GET  /list?page&pageSize&status&keyword     → IPage<MaterialPicking>（含 items）
 *   POST /{id}/confirm-outbound                  → 确认出库
 *   POST /{id}/cancel-pending                    → 取消待出库
 * 状态值：pending（待出库）/ completed（已完成）/ cancelled（已取消）
 *
 * ⚠️ 路径注意：后端真实路由是 /api/production/picking，
 *   PC 端 MaterialPicking/index.tsx 里写的 /production/material-picking 后端没有（404），
 *   移动端 api.production.* 封装的是正确路径。
 */

const api = require('../../../utils/api');

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待出库' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const STATUS_META = {
  pending: { label: '待出库', color: '#f59e0b', bg: '#fffbeb' },
  completed: { label: '已完成', color: '#10b981', bg: '#ecfdf5' },
  cancelled: { label: '已取消', color: '#9ca3af', bg: '#f3f4f6' },
};

/** 用途：production=生产领料 sample=样品领料（与 PC 端一致） */
const USAGE_LABEL = {
  production: '生产领料',
  sample: '样品领料',
  BULK: '生产领料',
  SAMPLE: '样品领料',
  STOCK: '备货领料',
};

/** 领取方式：SELF=自领 DELIVERY=配送 等，未知时原样显示 */
const PICKUP_LABEL = {
  SELF: '自领',
  DELIVERY: '配送',
  PICKUP: '自领',
};

function fmtTime(v) {
  if (!v) return '';
  const s = String(v).replace(' ', 'T');
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(v || '');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    statusTabs: STATUS_TABS,
    status: 'pending', // 默认看重头戏：待出库
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
  },

  onLoad(options) {
    // D-513：从待办通知跳过来时带 status=pending，直接定位到「待出库」
    const st = (options && options.status) || '';
    const valid = STATUS_TABS.some((t) => t.key === st);
    if (valid && st) {
      this.setData({ status: st });
    }
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadList(false);
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
      const mapped = records.map(this._toRow, this);
      const next = reset ? mapped : this.data.list.concat(mapped);
      this.setData({
        list: next,
        total,
        page: params.page,
        hasMore: next.length < total,
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  _toRow(r) {
    const st = r.status || '';
    const meta = STATUS_META[st] || { label: st || '-', color: '#6b7280', bg: '#f3f4f6' };
    const items = Array.isArray(r.items) ? r.items : [];
    return {
      id: r.id,
      pickingNo: r.pickingNo || '-',
      orderNo: r.orderNo || '-',
      styleNo: r.styleNo || '-',
      pickerName: r.pickerName || '-',
      factoryName: r.factoryName || '',
      usageLabel: USAGE_LABEL[r.usageType] || r.usageType || '-',
      pickupLabel: PICKUP_LABEL[r.pickupType] || r.pickupType || '',
      status: st,
      statusLabel: meta.label,
      statusColor: meta.color,
      statusBg: meta.bg,
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
      title: '确认出库',
      content: `确认领料单 ${no} 出库？将扣减对应库存。`,
      success: function (res) {
        if (!res.confirm) return;
        self._doConfirmOutbound(id);
      },
    });
  },

  async _doConfirmOutbound(id) {
    this.setData({ submittingId: id });
    try {
      await api.production.confirmPickingOutbound(id);
      wx.showToast({ title: '出库成功', icon: 'success' });
      await this.loadList(true);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '出库失败', icon: 'none' });
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
      title: '取消领料单',
      content: `取消 ${no}？库存将回退。`,
      confirmColor: '#dc2626',
      success: function (res) {
        if (!res.confirm) return;
        self._doCancel(id);
      },
    });
  },

  async _doCancel(id) {
    this.setData({ submittingId: id });
    try {
      await api.production.cancelPickingPending(id);
      wx.showToast({ title: '已取消', icon: 'success' });
      await this.loadList(true);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '取消失败', icon: 'none' });
    } finally {
      this.setData({ submittingId: '' });
    }
  },
});