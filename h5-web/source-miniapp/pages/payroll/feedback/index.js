const { request } = require('../../../utils/request');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    feedbackList: [],
    loading: false,
    submitting: false,
    showForm: false,
    settlementId: '',
    feedbackType: 'CONFIRM',
    feedbackContent: '',
    statusFilter: '',
  },

  onLoad(options) {
    if (options.settlementId) {
      this.setData({ settlementId: options.settlementId });
    }
    this.loadFeedbackList();
  },

  async loadFeedbackList() {
    this.setData({ loading: true });
    try {
      const params = {};
      if (this.data.settlementId) params.settlementId = this.data.settlementId;
      if (this.data.statusFilter) params.status = this.data.statusFilter;
      const res = await request({
        url: '/api/finance/wage-settlement-feedback/my-list',
        method: 'POST',
        data: params,
      });
      const list = res?.data || [];
      list.forEach(item => {
        item.statusText = this._statusText(item.status);
        item.typeText = item.feedbackType === 'CONFIRM' ? '确认' : '异议';
        item.typeColor = item.feedbackType === 'CONFIRM' ? '#52c41a' : '#faad14';
        item.statusTextColor = item.status === 'PENDING' ? '#faad14' : item.status === 'RESOLVED' ? '#52c41a' : '#ff4d4f';
        const d = item.createTime ? new Date(String(item.createTime).replace(' ', 'T')) : null;
        item.createTimeText = d && !isNaN(d.getTime())
          ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
          : '-';
      });
      this.setData({ feedbackList: list });
    } catch (e) {
      toast('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  _statusText(s) {
    const m = { PENDING: '待处理', RESOLVED: '已解决', REJECTED: '已驳回' };
    return m[s] || s || '-';
  },

  onStatusFilterChange(e) {
    this.setData({ statusFilter: e.detail.value });
    this.loadFeedbackList();
  },

  openForm() {
    this.setData({ showForm: true, feedbackType: 'CONFIRM', feedbackContent: '' });
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

  onSettlementIdInput(e) {
    this.setData({ settlementId: e.detail.value });
  },

  async submitFeedback() {
    const { settlementId, feedbackType, feedbackContent } = this.data;
    if (!settlementId || !settlementId.trim()) {
      toast('请输入结算单ID');
      return;
    }
    if (feedbackType === 'OBJECTION' && (!feedbackContent || !feedbackContent.trim())) {
      toast('提出异议时必须填写反馈内容');
      return;
    }
    this.setData({ submitting: true });
    try {
      await request({
        url: '/api/finance/wage-settlement-feedback/submit',
        method: 'POST',
        data: { settlementId, feedbackType, feedbackContent },
      });
      toast('提交成功');
      this.setData({ showForm: false, feedbackContent: '' });
      this.loadFeedbackList();
    } catch (e) {
      toast(e?.message || '提交失败');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
