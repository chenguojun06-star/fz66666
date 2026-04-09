const api = require('../../../utils/api');
const { getUserInfo } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    loading: false,
    tasks: [],
    filteredTasks: [],
    activeStatus: 'all',
    statusTabs: [
      { key: 'all', label: '全部', count: 0 },
      { key: 'pending', label: '待领取', count: 0 },
      { key: 'received', label: '已领取', count: 0 },
      { key: 'completed', label: '已完成', count: 0 }
    ]
  },

  onLoad() {
    this.loadTasks();
  },

  onShow() {
    this.loadTasks();
  },

  onPullDownRefresh() {
    this.loadTasks().then(() => wx.stopPullDownRefresh());
  },

  async loadTasks() {
    this.setData({ loading: true });
    try {
      const res = await api.production.myProcurementTasks();
      const list = this._normalizeToArray(res);
      const userInfo = getUserInfo() || {};
      const receiverId = String(userInfo.id || userInfo.userId || '').trim();
      const receiverName = String(userInfo.name || userInfo.username || '').trim();

      // Group by orderNo (matches ProcurementHandler pattern)
      const grouped = {};
      list.forEach(item => {
        const orderNo = item.orderNo || '未知订单';
        if (!grouped[orderNo]) {
          grouped[orderNo] = {
            orderNo,
            styleNo: item.styleNo || '',
            styleName: item.styleName || '',
            items: [],
            totalCount: 0,
            status: 'pending',
            statusText: '待领取',
            statusColor: 'orange'
          };
        }
        grouped[orderNo].totalCount++;
        grouped[orderNo].items.push(item);
      });

      const tasks = Object.values(grouped).map(group => {
        // Determine group status based on items
        const statuses = group.items.map(i => this._normalizeStatus(i.status));
        const allCompleted = statuses.every(s => s === 'completed');
        const someReceived = statuses.some(s => s === 'received' || s === 'partial');
        const somePending = statuses.some(s => s === 'pending' || !s);

        if (allCompleted) {
          group.status = 'completed';
          group.statusText = '已完成';
          group.statusColor = 'green';
          group.canOperate = false;
          group.canReceive = false;
        } else if (someReceived) {
          group.status = 'received';
          group.statusText = '已领取';
          group.statusColor = 'blue';
          group.canOperate = true;
          group.canReceive = false;
        } else if (somePending) {
          group.status = 'pending';
          group.statusText = '待领取';
          group.statusColor = 'orange';
          group.canOperate = false;
          group.canReceive = true;
        }

        // Count actionable items
        group.actionableCount = group.items.filter(item => {
          const status = this._normalizeStatus(item.status);
          if (status === 'completed' || status === 'cancelled') return false;
          if (!status || status === 'pending') return true;
          if (status === 'received' || status === 'partial') {
            return this._isSameReceiver(item, receiverId, receiverName);
          }
          return false;
        }).length;

        return group;
      });

      // Count by status
      const counts = { all: tasks.length, pending: 0, received: 0, completed: 0 };
      tasks.forEach(t => {
        if (counts[t.status] !== undefined) counts[t.status]++;
      });

      const statusTabs = this.data.statusTabs.map(tab => ({
        ...tab,
        count: counts[tab.key] || 0
      }));

      this.setData({ tasks, statusTabs, loading: false });
      this._applyFilter();
    } catch (e) {
      console.error('加载采购任务失败:', e);
      this.setData({ loading: false });
      toast.error('加载失败，请下拉刷新');
    }
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeStatus: key });
    this._applyFilter();
  },

  _applyFilter() {
    const { tasks, activeStatus } = this.data;
    const filtered = activeStatus === 'all'
      ? tasks
      : tasks.filter(t => t.status === activeStatus);
    this.setData({ filteredTasks: filtered });
  },

  async onReceive(e) {
    const { orderNo } = e.currentTarget.dataset;
    const group = this.data.tasks.find(t => t.orderNo === orderNo);
    if (!group) return;

    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error('领取人信息缺失，请重新登录');
      return;
    }

    wx.showLoading({ title: '领取中...', mask: true });
    try {
      const pendingItems = group.items.filter(item => {
        const status = this._normalizeStatus(item.status);
        if (!status || status === 'pending') return true;
        if ((status === 'received' || status === 'partial') &&
            !this._isSameReceiver(item, receiverId, receiverName)) return true;
        return false;
      });

      if (pendingItems.length === 0) {
        toast.success('当前采购任务均已领取');
        wx.hideLoading();
        return;
      }

      await Promise.all(pendingItems.map(item =>
        api.production.receivePurchase({
          purchaseId: item.id || item.purchaseId,
          receiverId,
          receiverName
        })
      ));

      wx.hideLoading();
      toast.success(`已领取 ${pendingItems.length} 个采购任务`);
      this.loadTasks();
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || '领取失败');
    }
  },

  goDetail(e) {
    const { orderNo, styleNo } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/procurement/task-detail/index?orderNo=${encodeURIComponent(orderNo)}&styleNo=${encodeURIComponent(styleNo || '')}`
    });
  },

  _normalizeToArray(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    if (res && Array.isArray(res.data)) return res.data;
    return [];
  },

  _normalizeStatus(rawStatus) {
    return String(rawStatus || '').trim().toLowerCase();
  },

  _isSameReceiver(item, receiverId, receiverName) {
    const existingId = String(item.receiverId || '').trim();
    const existingName = String(item.receiverName || '').trim();
    if (receiverId && existingId) return receiverId === existingId;
    if (receiverName && existingName) return receiverName === existingName;
    return false;
  }
});
