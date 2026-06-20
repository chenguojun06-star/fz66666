const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');
const permission = require('../../../utils/permission');

const STATUS_LABELS = {
  PENDING: '待领取',
  IN_PROGRESS: '制作中',
  COMPLETED: '已完成',
  WAREHOUSE_IN: '已入库',
};

const REVIEW_STATUS_LABELS = {
  'APPROVED': '已通过',
  'REJECTED': '已驳回',
  'PENDING': '待审核',
  'IN_REVIEW': '审核中',
  'DRAFT': '草稿',
  'SUBMITTED': '已提交',
};

const STATUS_COLORS = {
  PENDING: '#faad14',
  IN_PROGRESS: '#1677ff',
  COMPLETED: '#52c41a',
  WAREHOUSE_IN: '#8c8c8c',
};

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'PENDING', label: '待领取' },
  { key: 'IN_PROGRESS', label: '制作中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'WAREHOUSE_IN', label: '已入库' },
];

const DEV_STAGES = [
  { key: 'bom', name: 'BOM' },
  { key: 'pattern', name: '纸样' },
  { key: 'process', name: '单价' },
  { key: 'secondary', name: '二次工艺' },
  { key: 'production', name: '生产制单' },
];

function formatDate(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length >= 10) return s.substring(0, 10);
  return s;
}

function fmtDate(v) {
  if (!v) return '';
  const s = String(v);
  try {
    const parts = s.split(/[-T :]/);
    if (parts.length >= 3) return parts[1] + '-' + parts[2];
  } catch (_e) { /* ignore */ }
  return s;
}

Page({
  data: {
    loading: true,
    keyword: '',
    activeFilter: '',
    statusTabs: STATUS_TABS,

    list: [],
    page: 1,
    pageSize: 15,
    total: 0,
    hasMore: false,
    loadingMore: false,

    expandedId: '',
    patternDetail: null,
    detailLoading: false,
    roleHint: '',
    // 工序配置与展示
    processConfig: [],
    processStages: [],
    hasProcessSystem: false,
  },

  onLoad: function () {
    if (!permission.canReceiveTask('sample')) {
      this.setData({ roleHint: `您当前职务「${permission.getRoleDisplayName()}」非样衣岗，如需代领请知会主管` });
    }
    this.loadData(true);
  },

  onShow: function () {
    if (this._loaded) {
      this.loadData(true);
    }
    this._loaded = true;
    this._bindEvents();
  },

  onHide: function () {
    this._unbindEvents();
  },

  onUnload: function () {
    this._unbindEvents();
  },

  onPullDownRefresh: function () {
    const self = this;
    Promise.resolve(self.loadData(true)).then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadData(false);
    }
  },

  _bindEvents: function () {
    const that = this;
    this._onRefresh = function () { that.loadData(true); };
    eventBus.on(Events.REFRESH_ALL, this._onRefresh);
    eventBus.on(Events.DATA_CHANGED, this._onRefresh);
  },

  _unbindEvents: function () {
    if (this._onRefresh) {
      eventBus.off(Events.REFRESH_ALL, this._onRefresh);
      eventBus.off(Events.DATA_CHANGED, this._onRefresh);
    }
  },

  loadData: function (reset) {
    const that = this;
    if (reset) {
      that.setData({ loading: true, page: 1, list: [] });
    } else {
      that.setData({ loadingMore: true });
    }

    const params = {
      page: that.data.page,
      size: that.data.pageSize,
    };
    if (that.data.keyword.trim()) params.keyword = that.data.keyword.trim();
    if (that.data.activeFilter) params.status = that.data.activeFilter;

    return api.production.listPatterns(params)
      .then(function (res) {
        const data = res && res.data ? res.data : res;
        const records = (data && data.records) ? data.records : (Array.isArray(data) ? data : []);
        const total = Number(data && data.total) || records.length;

        const list = records.map(function (item) {
          item._cover = getAuthedImageUrl(item.coverImage || '');
          item._statusLabel = STATUS_LABELS[item.status] || item.status || '-';
          item._statusColor = STATUS_COLORS[item.status] || '#8c8c8c';
          item._deliveryDate = formatDate(item.deliveryTime);
          item._createDate = formatDate(item.releaseTime || item.createTime);
          item._expanded = false;

          item._devStages = DEV_STAGES.map(function (s) {
            return {
              key: s.key,
              name: s.name,
              completed: !!(item.styleInfo && item.styleInfo[s.key + 'CompletedTime']),
            };
          });

          item._devDoneCount = item._devStages.filter(function (s) { return s.completed; }).length;
          item._devTotalCount = item._devStages.length;
          return item;
        });

        const merged = reset ? list : (that.data.list || []).concat(list);
        const seen = new Set();
        const newList = merged.filter(function (item) {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        that.setData({
          list: newList,
          total: total,
          hasMore: newList.length < total,
          loading: false,
          loadingMore: false,
          page: reset ? 1 : that.data.page + 1,
        });
      })
      .catch(function () {
        that.setData({ loading: false, loadingMore: false });
        if (reset) toast.error('加载失败');
      });
  },

  onSearchInput: function (e) {
    let val = (e.detail.value || '').trim();
    if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.clear) val = '';
    this.setData({ keyword: val });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(this._doSearch.bind(this), 400);
  },

  onSearchClear: function () {
    this.setData({ keyword: '' });
    this._doSearch();
  },

  _doSearch: function () {
    this.loadData(true);
  },

  onFilterTap: function (e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    this.loadData(true);
  },

  onCardTap: function (e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const expandedId = this.data.expandedId === id ? '' : id;
    this.setData({ expandedId: expandedId });

    if (expandedId) {
      this.loadDetail(id);
    } else {
      this.setData({ patternDetail: null, processConfig: [], processStages: [], hasProcessSystem: false });
    }
  },

  loadDetail: function (patternId) {
    const that = this;
    that.setData({ detailLoading: true });
    const detailPromise = api.production.getPatternDetail(patternId);
    const configPromise = api.production.getPatternProcessConfig(patternId);
    const recordsPromise = api.production.getPatternScanRecords(patternId);

    return Promise.all([detailPromise, configPromise, recordsPromise])
      .then(function (results) {
        const detail = results[0] && results[0].data ? results[0].data : results[0];
        if (detail.reviewStatus) {
          detail._reviewStatusLabel = REVIEW_STATUS_LABELS[detail.reviewStatus] || detail.reviewStatus;
        }
        const config = Array.isArray(results[1]) ? results[1] : (results[1] && results[1].data ? (Array.isArray(results[1].data) ? results[1].data : []) : []);
        const records = Array.isArray(results[2]) ? results[2] : (results[2] && results[2].data ? (Array.isArray(results[2].data) ? results[2].data : []) : []);

        const stages = that._buildProcessStages(config, records, detail);

        that.setData({
          patternDetail: detail,
          processConfig: config,
          processStages: stages,
          hasProcessSystem: config.length > 0,
        });
      })
      .catch(function () {})
      .finally(function () {
        that.setData({ detailLoading: false });
      });
  },

  _buildProcessStages: function (config, records, patternDetail) {
    if (!config || !Array.isArray(config) || config.length === 0) {
      return [];
    }

    const completedSet = new Set();
    if (records && Array.isArray(records)) {
      records.forEach(function (r) {
        const op = String(r.operationType || '').trim();
        const pn = String(r.processName || '').trim();
        const ps = String(r.progressStage || '').trim();
        if (op) completedSet.add(op);
        if (pn) completedSet.add(pn);
        if (ps) completedSet.add(ps);
        // 规范化 key
        completedSet.add(op.toLowerCase());
        completedSet.add(pn.toLowerCase());
      });
    }

    const status = String(patternDetail.status || '').toUpperCase();

    // 按 PC 端工序配置构建工序列表（不自动加"领取样衣"或"入库"）
    const stages = [];

    // 找到第一个尚未完成的工序索引（用于判断可操作性）
    let firstIncompleteIdx = -1;

    for (let i = 0; i < config.length; i++) {
      const c = config[i];
      const processName = String(c.processName || c.operationType || '').trim();
      const progressStage = String(c.progressStage || processName).trim();
      const scanType = String(c.scanType || 'production').trim();
      const isCompleted = completedSet.has(processName) || completedSet.has(progressStage) || completedSet.has(progressStage.toLowerCase());

      // 查找完成时间
      let time = '';
      if (records && Array.isArray(records)) {
        for (let j = 0; j < records.length; j++) {
          const r = records[j];
          const rOp = String(r.operationType || '').trim();
          const rPn = String(r.processName || '').trim();
          if ((rOp === processName || rPn === processName) && r.scanTime) {
            time = fmtDate(r.scanTime);
            break;
          }
        }
      }

      // 可操作判断：该工序尚未完成，且前面的工序都已完成
      let canOperate = false;
      let locked = false;
      let lockReason = '';

      if (!isCompleted) {
        if (firstIncompleteIdx === -1) {
          firstIncompleteIdx = i;
        }
        // 只有第一个未完成的工序可以操作
        if (firstIncompleteIdx === i) {
          // 检查前面的工序是否都完成了
          let prevAllDone = true;
          for (let j = 0; j < i; j++) {
            const prev = config[j];
            const prevName = String(prev.processName || prev.operationType || '').trim();
            const prevDone = completedSet.has(prevName) || completedSet.has(String(prev.progressStage || prevName).trim());
            if (!prevDone) {
              prevAllDone = false;
              break;
            }
          }
          if (prevAllDone) {
            canOperate = true;
          } else {
            locked = true;
            lockReason = '需先完成前置工序';
          }
        } else {
          locked = true;
          lockReason = '需先完成前置工序';
        }
      }

      stages.push({
        name: processName,
        processName: processName,
        progressStage: progressStage,
        scanType: scanType,
        completed: isCompleted,
        time: time,
        canOperate: canOperate,
        locked: locked,
        lockReason: lockReason,
        isReceive: false,
      });
    }

    // 注意：入库等操作完全依赖 PC 端工序配置，不再自动追加
    return stages;
  },

  onGoDetail: function (e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    const styleId = item.styleId || '';
    const patternId = item.id || '';
    if (!styleId && !patternId) return;
    const param = styleId ? 'styleId=' + encodeURIComponent(styleId) : 'id=' + encodeURIComponent(patternId);
    safeNavigate({
      url: '/pages/sample-development/detail/index?' + param,
    }).catch(() => {});
  },

  // 顶部扫码按钮：扫码识别样衣，进入扫码页
  onTopScan: function () {
    const that = this;
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: function (res) {
        const scanCode = res.result || '';
        if (!scanCode) {
          toast.error('扫码内容为空');
          return;
        }
        // 解析 patternId：优先从 URL ?patternId= 取，其次取纯数字/ID
        let patternId = scanCode;
        const match = scanCode.match(/[?&]patternId=([^&]+)/);
        if (match && match[1]) {
          patternId = decodeURIComponent(match[1]);
        }
        // 跳转扫码页，让扫码页自己获取工序配置
        safeNavigate({
          url: '/pages/scan/pattern/index?patternId=' + encodeURIComponent(patternId) + '&scanCode=' + encodeURIComponent(scanCode),
        }).catch(function () {});
      },
      fail: function () {
        // 用户取消不提示
      }
    });
  },

  // 点击工序项：直接跳转到扫码页，让扫码页自己获取工序配置
  onProcessOperate: function (e) {
    const stage = e.currentTarget.dataset.stage;
    const patternId = e.currentTarget.dataset.patternId || this.data.expandedId;
    if (!stage || !patternId) return;

    if (stage.locked) {
      toast.error(stage.lockReason || '前置工序未完成');
      return;
    }
    if (!stage.canOperate) {
      if (stage.completed) {
        toast.error('该工序已完成');
      }
      return;
    }

    // 跳转到扫码页，带上指定工序名，扫码页自动定位到该工序
    const param = 'patternId=' + encodeURIComponent(patternId) +
      '&manual=1' +
      '&processName=' + encodeURIComponent(stage.processName || '') +
      '&progressStage=' + encodeURIComponent(stage.progressStage || '') +
      '&scanType=' + encodeURIComponent(stage.scanType || '');
    safeNavigate({
      url: '/pages/scan/pattern/index?' + param,
    }).catch(function () {});
  },

  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.src;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },
});
