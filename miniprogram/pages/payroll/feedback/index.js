const { request } = require('../../../utils/request');
const { toast } = require('../../../utils/uiHelper');

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
    this.loadSettlements();
  },

  onPullDownRefresh() {
    this.loadSettlements().then(() => wx.stopPullDownRefresh());
  },

  async loadSettlements() {
    this.setData({ loading: true });
    try {
      const res = await request({
        url: '/api/finance/wage-settlement-feedback/my-paid-settlements',
        method: 'POST',
      });
      const list = res?.data || [];
      list.forEach(item => {
        const d = item.createTime ? new Date(String(item.createTime).replace(' ', 'T')) : null;
        item.createTimeText = d && !isNaN(d.getTime())
          ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          : '-';
      });
      this.setData({ settlements: list });
    } catch (e) {
      toast('加载失败');
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
      toast('提出异议时必须填写反馈内容');
      return;
    }
    this.setData({ submitting: true });
    try {
      await request({
        url: '/api/finance/wage-settlement-feedback/submit',
        method: 'POST',
        data: { settlementId: currentSettlementId, feedbackType, feedbackContent },
      });
      toast('提交成功');
      this.setData({ showForm: false, feedbackContent: '' });
      this.loadSettlements();
    } catch (e) {
      toast(e?.message || '提交失败');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
