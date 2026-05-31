const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    styleId: '',
    activeTab: 'basic',
    
    // 基本信息
    styleInfo: null,
    loading: true,
    
    // BOM清单
    bomList: [],
    bomLoading: false,
    
    // 工序
    processList: [],
    processLoading: false,
    
    // 二次工艺
    secondaryList: [],
    secondaryLoading: false,
    
    // 进度状态
    stageStatus: {
      bom: false,
      pattern: false,
      process: false,
      secondary: false,
      production: false,
    },
  },

  onLoad: function(options) {
    const styleId = options.styleId || '';
    if (!styleId) {
      toast.error('缺少款式ID');
      wx.navigateBack();
      return;
    }
    this.setData({ styleId });
    this.loadStyleDetail();
    this.loadBomList();
    this.loadProcessList();
    this.loadSecondaryList();
  },

  onTabChange: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  loadStyleDetail: function() {
    const that = this;
    that.setData({ loading: true });
    
    api.style.getStyleDetail(that.data.styleId)
      .then(function(res) {
        const detail = res && res.data ? res.data : res;
        that.setData({ 
          styleInfo: detail,
          loading: false,
          stageStatus: {
            bom: !!detail.bomCompletedTime,
            pattern: !!detail.patternCompletedTime,
            process: !!detail.processCompletedTime,
            secondary: !!detail.secondaryCompletedTime,
            production: !!detail.productionCompletedTime,
          }
        });
      })
      .catch(function() {
        that.setData({ loading: false });
        toast.error('加载款式详情失败');
      });
  },

  loadBomList: function() {
    const that = this;
    that.setData({ bomLoading: true });
    
    api.style.listBom({ styleId: that.data.styleId })
      .then(function(res) {
        const list = res && res.data ? res.data : (Array.isArray(res) ? res : []);
        that.setData({ bomList: list, bomLoading: false });
      })
      .catch(function() {
        that.setData({ bomLoading: false });
      });
  },

  loadProcessList: function() {
    const that = this;
    that.setData({ processLoading: true });
    
    api.style.listProcesses({ styleId: that.data.styleId })
      .then(function(res) {
        const list = res && res.data ? res.data : (Array.isArray(res) ? res : []);
        that.setData({ processList: list, processLoading: false });
      })
      .catch(function() {
        that.setData({ processLoading: false });
      });
  },

  loadSecondaryList: function() {
    const that = this;
    that.setData({ secondaryLoading: true });
    
    api.style.listSecondaryProcesses({ styleId: that.data.styleId })
      .then(function(res) {
        const list = res && res.data ? res.data : (Array.isArray(res) ? res : []);
        that.setData({ secondaryList: list, secondaryLoading: false });
      })
      .catch(function() {
        that.setData({ secondaryLoading: false });
      });
  },

  onRefresh: function() {
    this.loadStyleDetail();
    this.loadBomList();
    this.loadProcessList();
    this.loadSecondaryList();
  },

  formatDate: function(dateStr) {
    if (!dateStr) return '-';
    const s = String(dateStr);
    if (s.length >= 10) return s.substring(0, 10);
    return s;
  },

  getStageStatusText: function(stage) {
    const status = this.data.stageStatus;
    if (stage === 'bom') return status.bom ? '已完成' : '进行中';
    if (stage === 'pattern') return status.pattern ? '已完成' : '进行中';
    if (stage === 'process') return status.process ? '已完成' : '进行中';
    if (stage === 'secondary') return status.secondary ? '已完成' : '进行中';
    if (stage === 'production') return status.production ? '已完成' : '进行中';
    return '-';
  },

  getStageStatusColor: function(stage) {
    const status = this.data.stageStatus;
    if (stage === 'bom') return status.bom ? '#52c41a' : '#faad14';
    if (stage === 'pattern') return status.pattern ? '#52c41a' : '#faad14';
    if (stage === 'process') return status.process ? '#52c41a' : '#faad14';
    if (stage === 'secondary') return status.secondary ? '#52c41a' : '#faad14';
    if (stage === 'production') return status.production ? '#52c41a' : '#faad14';
    return '#8c8c8c';
  },
});
