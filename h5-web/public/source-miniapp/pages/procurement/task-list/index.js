const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { eventBus, Events } = require('../../../utils/eventBus');
const permission = require('../../../utils/permission');
const { getUserInfo } = require('../../../utils/storage');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

Page({
  data: {
    loading: false,
    activeStatus: 'all', // 对齐裁剪明细页面：'all' 而非空字符串
    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待采购' },
      { key: 'received', label: '采购中' },
      { key: 'completed', label: '已完成' },
    ],
    groups: [],
    filteredGroups: [], // 筛选后的分组
    roleHint: '', // 跨岗位提示
    searchKeyword: '', // 搜索关键词（对齐裁剪明细页面）
  },

  onLoad() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    // 职务提示：非采购员且非主管以上，显示跨岗位提示
    if (!permission.canReceiveTask('procurement')) {
      this.setData({ roleHint: `您当前职务「${permission.getRoleDisplayName()}」非采购岗，如需代领请知会主管` });
    }
    this.loadData();
  },

  // 对齐裁剪明细页面：onShow 主动刷新数据
  onShow() {
    this.loadData();
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
      const list = this._normalizeList(res);
      const groups = this._groupByOrder(list);
      this.setData({ groups, loading: false });
      this._applyFilter();
    } catch (e) {
      console.error('[ProcurementTaskList] loadData error', e);
      this.setData({ loading: false });
      toast.error('加载采购页面失败');
    }
  },

  // 对齐裁剪明细页面：方法名 onTabChange（原 onFilterTap）
  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeStatus: key });
    this._applyFilter();
  },

  // 搜索输入（对齐裁剪明细页面）
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    this._applyFilter();
  },

  onSearchConfirm() {
    this._applyFilter();
  },

  _applyFilter() {
    const { groups, activeStatus, searchKeyword } = this.data;
    const kw = (searchKeyword || '').trim().toLowerCase();
    let filtered;
    // 对齐裁剪明细页面：'all' 而非空字符串
    if (activeStatus === 'all') {
      filtered = groups;
    } else {
      filtered = groups.filter(g => {
        if (activeStatus === 'pending') return g.pendingCount > 0;
        if (activeStatus === 'received') return g.receivedCount > 0;
        if (activeStatus === 'completed') return g.completedCount === g.totalCount && g.totalCount > 0;
        return true;
      });
    }
    // 搜索过滤
    if (kw) {
      filtered = filtered.filter(g => {
        const orderNo = String(g.orderNo || '').toLowerCase();
        const styleNo = String(g.styleNo || '').toLowerCase();
        return orderNo.indexOf(kw) >= 0 || styleNo.indexOf(kw) >= 0;
      });
    }
    // 更新筛选 tab 计数
    const statusTabs = this.data.statusTabs.map(tab => {
      let count = 0;
      if (tab.key === 'all') count = groups.length;
      else if (tab.key === 'pending') count = groups.filter(g => g.pendingCount > 0).length;
      else if (tab.key === 'received') count = groups.filter(g => g.receivedCount > 0).length;
      else if (tab.key === 'completed') count = groups.filter(g => g.completedCount === g.totalCount && g.totalCount > 0).length;
      return { ...tab, count };
    });
    this.setData({ filteredGroups: filtered, statusTabs });
  },

  onGroupTap(e) {
    const group = e.currentTarget.dataset.group;
    if (!group) return;
    // P1-2 修复：样衣采购无 orderNo，按 patternProductionId 跳转
    if (!group.orderNo && group.patternProductionId) {
      safeNavigate({
        url: `/pages/procurement/task-detail/index?patternProductionId=${encodeURIComponent(group.patternProductionId)}&sourceType=sample&styleNo=${encodeURIComponent(group.styleNo || '')}`,
      }).catch(() => {});
      return;
    }
    if (!group.orderNo) return;
    safeNavigate({
      url: `/pages/procurement/task-detail/index?orderNo=${encodeURIComponent(group.orderNo)}&styleNo=${encodeURIComponent(group.styleNo || '')}`,
    }).catch(() => {});
  },

  onCoverPreview(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) {
      // 无封面图时，不阻止卡片跳转，继续冒泡触发 onGroupTap
      return;
    }
    e.stopPropagation && e.stopPropagation();
    try {
      wx.previewImage({ current: url, urls: [url] });
    } catch (err) { /* ignore */ }
  },

  async onReceive(e) {
    const group = e.currentTarget.dataset.group;
    if (!group || !group.items || group.items.length === 0) return;

    if (!permission.canReceiveTask('procurement')) {
      const allowed = await new Promise(resolve => {
        wx.showModal({
          title: '岗位提示',
          content: `您当前职务「${permission.getRoleDisplayName()}」非采购岗，确定代领？`,
          confirmText: '确定代领',
          cancelText: '取消',
          success: res => resolve(!!res.confirm),
        });
      });
      if (!allowed) return;
    }

    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error('采购人信息缺失，请重新登录');
      return;
    }

    const pendingItems = group.items.filter(item => {
      const status = String(item.status || '').toLowerCase();
      return !status || status === 'pending';
    });

    if (pendingItems.length === 0) {
      toast.success('所有物料均已采购');
      return;
    }

    wx.showLoading({ title: '领取中...', mask: true });
    try {
      await Promise.all(pendingItems.map(item =>
        api.production.receivePurchase({
          purchaseId: item.id || item.purchaseId,
          receiverId,
          receiverName,
        }),
      ));
      wx.hideLoading();
      toast.success(`已领取 ${pendingItems.length} 项采购任务`);
      eventBus.emit(Events.DATA_CHANGED);
      this.loadData();
    } catch (err) {
      wx.hideLoading();
      console.error('[ProcurementTaskList] receive error', err);
      toast.error('领取失败：' + (err.errMsg || err.message || '请稍后重试'));
    }
  },

  _normalizeList(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    return [];
  },

  _groupByOrder(list) {
    const map = {};
    list.forEach(item => {
      // P1-2 修复：样衣采购无 orderNo，按 patternProductionId 分组
      const orderNo = item.orderNo || '';
      const patternProductionId = item.patternProductionId || '';
      const sourceType = item.sourceType || '';
      const groupKey = orderNo || (patternProductionId ? `sample_${patternProductionId}` : '未知订单');
      if (!map[groupKey]) {
        map[groupKey] = {
          orderNo,
          styleNo: item.styleNo || '',
          styleCoverUrl: getAuthedImageUrl(item.styleCoverUrl || item.styleCover || item.coverImage || item.cover || ''),
          patternProductionId,
          sourceType,
          items: [],
          totalPurchased: 0,
          totalArrived: 0,
          pendingCount: 0,
          receivedCount: 0,
          completedCount: 0,
          totalCount: 0,
        };
      }
      const g = map[groupKey];
      // 封面图兜底：取首个有图的 item（需通过 getAuthedImageUrl 转完整 URL + token）
      if (!g.styleCoverUrl) {
        const rawCover = item.styleCoverUrl || item.styleCover || item.coverImage || item.cover || '';
        if (rawCover) g.styleCoverUrl = getAuthedImageUrl(rawCover);
      }
      g.items.push(item);
      const purchaseQty = Number(item.purchaseQuantity || 0);
      const arrivedQty = Number(item.arrivedQuantity || 0);
      g.totalPurchased += purchaseQty;
      g.totalArrived += arrivedQty;
      g.totalCount++;

      const status = String(item.status || '').toLowerCase();
      if (status === 'completed' || status === 'procurement_completed') {
        g.completedCount++;
      } else if (status === 'received' || status === 'partial' || status === 'procurement_in_progress') {
        g.receivedCount++;
      } else {
        g.pendingCount++;
      }
    });

    return Object.values(map).map(g => {
      const userInfo = getUserInfo() || {};
      const receiverId = String(userInfo.id || userInfo.userId || '').trim();
      const receiverName = String(userInfo.name || userInfo.username || '').trim();

      let canReceive = false;
      let canOperate = false;
      // 对齐裁剪明细页面：显示领取人（取该订单下本人领取的物料对应的领取人）
      let groupReceiverName = '';

      if (g.pendingCount > 0) {
        canReceive = true;
      } else if (g.receivedCount > 0) {
        const myItems = g.items.filter(item => {
          const rid = String(item.receiverId || '').trim();
          const rname = String(item.receiverName || '').trim();
          return rid === receiverId || rname === receiverName;
        });
        canOperate = myItems.length > 0;
        if (myItems.length > 0) {
          groupReceiverName = myItems[0].receiverName || receiverName || '';
        }
      } else if (g.completedCount === g.totalCount && g.totalCount > 0) {
        // 已完成的订单，显示首个领取人
        const receivedItem = g.items.find(item => {
          const rname = String(item.receiverName || '').trim();
          return rname;
        });
        if (receivedItem) groupReceiverName = receivedItem.receiverName;
      }

      // 样衣采购无 orderNo，需要唯一 key 和显示标识
      const isSample = g.sourceType === 'sample' || (!g.orderNo && !!g.patternProductionId);
      return {
        ...g,
        groupKey: g.orderNo || (g.patternProductionId ? `sample_${g.patternProductionId}` : `unknown_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
        displayOrderNo: g.orderNo || (isSample ? '样衣采购' : '无订单号'),
        arrivalRate: g.totalPurchased > 0 ? Math.round(g.totalArrived / g.totalPurchased * 100) : 0,
        statusText: g.completedCount === g.totalCount ? '已完成' : (g.pendingCount === g.totalCount ? '待采购' : '采购中'),
        statusColor: g.completedCount === g.totalCount ? 'success' : (g.pendingCount === g.totalCount ? 'warning' : 'processing'),
        isSample,
        canReceive,
        canOperate,
        receiverName: groupReceiverName, // 对齐裁剪明细页面：显示领取人
      };
    });
  },
});
