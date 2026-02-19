/**
 * 生产详情页面
 * 展示扫码记录表格 - 支持三种 Tab：全部、生产、完成
 * 默认只显示当天记录，其他归档可通过日期筛选查看
 */
const api = require('../../../utils/api');
const { onDataRefresh } = require('../../../utils/eventBus');

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化时间为 HH:mm
 */
function formatTime(timeStr) {
  if (!timeStr) return '-';
  // 如果包含空格（日期+时间），取时间部分
  if (timeStr.includes(' ')) {
    return timeStr.split(' ')[1]?.substring(0, 5) || timeStr;
  }
  return timeStr.substring(0, 5);
}

Page({
  data: {
    // Tab 状态：0=全部, 1=生产, 2=完成
    activeTab: 0,
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'production', label: '生产' },
      { key: 'completed', label: '完成' },
    ],

    // 日期筛选（默认今天）
    startDate: getToday(),
    endDate: getToday(),

    // 搜索条件
    searchKeyword: '',

    // 数据
    records: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,


  },

  onLoad() {
    this.loadData(true);
  },

  onShow() {
    // 监听数据刷新
    this._unsubscribe = onDataRefresh(() => {
      this.loadData(true);
    });
  },

  onHide() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  },

  onUnload() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false);
    }
  },

  // ======================== Tab 切换 ========================

  onTabChange(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (idx === this.data.activeTab) return;
    this.setData({ activeTab: idx });
    this.loadData(true);
  },

  // ======================== 日期选择 ========================

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
    this.loadData(true);
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this.loadData(true);
  },

  // ======================== 搜索 ========================

  onKeywordInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearch() {
    this.loadData(true);
  },

  onClearSearch() {
    this.setData({
      searchKeyword: '',
      startDate: getToday(),
      endDate: getToday(),
    });
    this.loadData(true);
  },

  // ======================== 加载数据 ========================

  async loadData(reset) {
    if (this.data.loading) return;

    if (!reset && !this.data.hasMore) return;

    const nextPage = reset ? 1 : this.data.page + 1;

    this.setData({ loading: true });

    try {
      const params = {
        currentUser: 'true',
        page: nextPage,
        pageSize: this.data.pageSize,
      };

      // 日期筛选
      if (this.data.startDate) {
        params.startTime = this.data.startDate + ' 00:00:00';
      }
      if (this.data.endDate) {
        params.endTime = this.data.endDate + ' 23:59:59';
      }

      // 搜索条件（订单号/款号统一搜索）
      if (this.data.searchKeyword) {
        params.orderNo = this.data.searchKeyword.trim();
      }

      // Tab 对应的 scanType 过滤
      const tabKey = this.data.tabs[this.data.activeTab]?.key;
      if (tabKey === 'completed') {
        // 完成 tab：筛选入库类型的记录
        params.scanType = 'WAREHOUSE';
      } else if (tabKey === 'production') {
        // 生产 tab：排除入库类型
        params.excludeScanType = 'WAREHOUSE';
      }
      // 全部 tab 不额外过滤 scanType，显示所有记录

      const result = await api.production.myScanHistory(params);
      const newRecords = (result?.records || []).filter(
        (item) => (item.scanResult || '').toLowerCase() !== 'failure'
      );

      // 处理记录，添加格式化字段
      const formatted = newRecords.map((item) => ({
        ...item,
        displayTime: formatTime(item.scanTime),
        displayProcess: item.processName || item.progressStage || item.scanType || '-',
        displayWorker: item.workerName || item.operatorName || '-',
        displayOrderNo: item.orderNo || '-',
        displayBundleNo: item.bundleNo || '-',
        displayColor: item.color || '-',
        displaySize: item.size || '-',
        displayQuantity: item.quantity || 0,
        displayUnitPrice:
          item.unitPrice == null || item.unitPrice === '' ? '-' : item.unitPrice,
      }));

      const prevList = reset ? [] : this.data.records;
      const merged = prevList.concat(formatted);

      const total = result?.total || 0;
      const hasMore = merged.length < total;

      this.setData({
        records: merged,
        page: nextPage,
        hasMore,
        loading: false,
      });
    } catch (e) {
      if (e && e.type === 'auth') return;
      wx.showToast({ title: `加载失败: ${(e && e.message) || '请稍后重试'}`, icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onLoadMore() {
    this.loadData(false);
  },


});
