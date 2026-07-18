const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission } = require('../../../utils/permission');

Page({
  data: {
    settlements: [],
    loading: false,
    submitting: false,
    showForm: false,
    currentSettlementId: '',
    currentSettlementNo: '',
    feedbackType: 'CONFIRM',
    feedbackContent: '',
  },

  onLoad() {
    if (!hasFeaturePermission('view_payroll')) {
      toast('您没有查看工资的权限');
      wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/dashboard/index' }) });
      return;
    }
    this.loadSettlements();
  },

  onPullDownRefresh() {
    this.loadSettlements().then(() => wx.stopPullDownRefresh());
  },

  async loadSettlements() {
    this.setData({ loading: true });
    try {
      const res = await api.wageSettlementFeedback.myPaidSettlements();
      const list = res?.data || [];
      list.forEach(item => {
        const d = item.createTime ? new Date(String(item.createTime).replace(' ', 'T')) : null;
        item.createTimeText = d && !isNaN(d.getTime())
          ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          : '-';
      });
      this.setData({ settlements: list });
    } catch (e) {
      toast.info('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  onSettlementTap(e) {
    const id = e.currentTarget.dataset.id;
    const no = e.currentTarget.dataset.no;
    const item = this.data.settlements.find(s => s.id === id);
    if (item && item.feedbackStatus) {
      return;
    }
    this.setData({
      showForm: true,
      currentSettlementId: id,
      currentSettlementNo: no || id,
      feedbackType: 'CONFIRM',
      feedbackContent: '',
    });
  },

  closeForm() {
    this.setData({ showForm: false });
  },

  onFeedbackTypeChange(e) {
    this.setData({ feedbackType: e.detail.value });
  },

  onFeedbackContentInput(e) {
    this.setData({ feedbackContent: e.detail.value });
  },

  async submitFeedback() {
    const { currentSettlementId, feedbackType, feedbackContent } = this.data;
    if (feedbackType === 'OBJECTION' && (!feedbackContent || !feedbackContent.trim())) {
      toast.info('提出异议时必须填写反馈内容');
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.wageSettlementFeedback.submit({ settlementId: currentSettlementId, feedbackType, feedbackContent });
      toast.success('提交成功');
      this.setData({ showForm: false, feedbackContent: '' });
      this.loadSettlements();
    } catch (e) {
      toast.error(e?.message || '提交失败');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
