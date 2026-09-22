/**
 * 物料库存查询（手机端）
 *
 * 背景：用户反馈「手机端物料仓库没有出库动作」——查实后是首页没挂入库/出库入口，
 * 但还有更深一层问题：**手机端根本没地方看当前库存**。能入库出库却看不到数，等于瞎操作。
 *
 * 因此补一个物料库存查询页：列表 + 筛选 + 点击进入出入库（连贯操作）。
 * 复用 PC 端 MaterialStockController.getPage —— 接口本来就支持，无需后端改动。
 *
 * 字段映射（与 PC 端展示对齐）：
 * - 可用库存 = quantity - locked_quantity（在途/锁定数显示在次要信息里）
 * - 安全库存/低库存 标红提示
 */

const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '面料', value: 'fabric' },
  { label: '面料', value: '面料' },
  { label: '里料', value: 'lining' },
  { label: '里料', value: '里料' },
  { label: '辅料', value: 'accessory' },
  { label: '辅料', value: '辅料' },
];

const TYPE_COLOR_MAP = {
  fabric: '#2563eb',
  lining: '#f59e0b',
  accessory: '#10b981',
  面料: '#2563eb',
  里料: '#f59e0b',
  辅料: '#10b981',
};

const TYPE_LABEL_MAP = {
  fabric: '面料',
  lining: '里料',
  accessory: '辅料',
  面料: '面料',
  里料: '里料',
  辅料: '辅料',
};

/**
 * D-513：物料类型在数据库里有三种存法：英文代码（fabric）/ 中文（面料）/ 业务编码（fabricA/B/C）。
 * 用 startsWith 做前缀匹配，避免显示成原始字面值。
 */
function resolveTypeLabel(rawType) {
  if (!rawType) return '-';
  if (TYPE_LABEL_MAP[rawType]) return TYPE_LABEL_MAP[rawType];
  const t = String(rawType).toLowerCase();
  if (t.startsWith('fabric')) return '面料';
  if (t.startsWith('lining')) return '里料';
  if (t.startsWith('accessory')) return '辅料';
  return rawType;
}

function resolveTypeColor(rawType) {
  if (!rawType) return '#6b7280';
  if (TYPE_COLOR_MAP[rawType]) return TYPE_COLOR_MAP[rawType];
  const t = String(rawType).toLowerCase();
  if (t.startsWith('fabric')) return '#2563eb';
  if (t.startsWith('lining')) return '#f59e0b';
  if (t.startsWith('accessory')) return '#10b981';
  return '#6b7280';
}

Page({
  data: {
    loading: true,
    list: [],
    total: 0,
    pageNum: 1,
    pageSize: 20,
    hasMore: true,

    keyword: '',
    typeValue: '',
    typeOptions: TYPE_OPTIONS,
    typeIndex: 0,
  },

  onLoad: function () {
    this.loadData(true);
  },

  onPullDownRefresh: function () {
    this.loadData(true).then(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false);
    }
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearchConfirm: function () {
    this.loadData(true);
  },

  onTypeChange: function (e) {
    const idx = e.detail.value || 0;
    this.setData({ typeIndex: idx, typeValue: TYPE_OPTIONS[idx].value }, function () {
      this.loadData(true);
    }.bind(this));
  },

  loadData: async function (reset) {
    if (reset) {
      this.setData({ loading: true, pageNum: 1, hasMore: true, list: [] });
    } else {
      if (!this.data.hasMore) return;
      this.setData({ loading: true });
    }
    try {
      const params = {
        keyword: this.data.keyword || undefined,
        materialType: this.data.typeValue || undefined,
        pageNum: reset ? 1 : this.data.pageNum + 1,
        pageSize: this.data.pageSize,
      };
      const res = await api.material.listStock(params);
      // D-514 修 bug：ok() 已剥掉 resp.data，这里 res 就是 data；之前误用 res.data.records 导致列表永远为空
      const records = (res && res.records) || [];
      const mapped = records.map(this._toRow.bind(this));
      const nextList = reset ? mapped : this.data.list.concat(mapped);
      const total = (res && res.total) || 0;
      this.setData({
        list: nextList,
        total,
        pageNum: params.pageNum,
        hasMore: mapped.length >= this.data.pageSize && nextList.length < total,
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  _toRow: function (r) {
    const qty = Number(r.quantity || 0);
    const locked = Number(r.lockedQuantity || 0);
    const safety = Number(r.safetyStock || 0);
    const available = Math.max(0, qty - locked);
    return {
      id: r.id,
      materialCode: r.materialCode || '',
      materialName: r.materialName || r.materialCode || '',
      materialType: r.materialType || '',
      typeLabel: resolveTypeLabel(r.materialType),
      typeColor: resolveTypeColor(r.materialType),
      unit: r.unit || '',
      warehouseLocation: r.location || r.warehouseLocation || '-',
      availableQty: available,
      lockedQty: locked,
      inTransitQty: 0, // 当前实体无此字段，PC 端同样以 0 显示
      safetyStock: safety,
      lowStock: qty < safety,
      isZero: qty === 0,
      image: r.materialImage ? getAuthedImageUrl(r.materialImage) : '',
      unitPrice: r.unitPrice,
    };
  },

  onRowTap: function (e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.materialCode) return;
    wx.navigateTo({
      url: '/pages/warehouse/material-outbound/index?materialCode=' + encodeURIComponent(item.materialCode),
    });
  },

  // D-513：手机端快捷入库（原先列表页没有入库入口，只能点卡片出库）
  onInboundTap: function (e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.navigateTo({
      url: '/pages/warehouse/material-inbound/index?materialCode=' + encodeURIComponent(code),
    });
  },

  // D-513：手机端快捷出库（与点卡片等效，但按钮更明确、不易误触）
  onOutboundTap: function (e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.navigateTo({
      url: '/pages/warehouse/material-outbound/index?materialCode=' + encodeURIComponent(code),
    });
  },

  // D-514：搜索栏扫码按钮 → 跳物料扫码页（料卷出库/退回）
  onScanTap: function () {
    wx.navigateTo({
      url: '/pages/warehouse/material/scan/index',
    });
  },
});