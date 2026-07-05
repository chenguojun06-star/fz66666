const api = require('../../../../utils/api');
const { toast } = require('../../../../utils/uiHelper');

const STATUS_MAP = {
  PENDING: '待处理',
  PROCESSING: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
};

const CATEGORY_LIST = [
  { value: 'BUG', label: '系统问题' },
  { value: 'SUGGESTION', label: '功能建议' },
  { value: 'QUESTION', label: '使用疑问' },
  { value: 'OTHER', label: '其他' },
];

Page({
  data: {
    activeTab: 'submit',
    categoryList: CATEGORY_LIST,
    categoryIndex: 0,
    form: { title: '', content: '', category: 'BUG' },
    submitting: false,
    myFeedbacks: [],
  },

  onLoad() {
    this.loadMyFeedbacks();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'list') this.loadMyFeedbacks();
  },

  onCategoryChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      categoryIndex: idx,
      'form.category': CATEGORY_LIST[idx].value,
    });
  },

  onTitleInput(e) { this.setData({ 'form.title': e.detail.value }); },
  onContentInput(e) { this.setData({ 'form.content': e.detail.value }); },

  async onSubmitFeedback() {
    const { title, content, category } = this.data.form;
    if (!title.trim()) return toast.error('请填写标题');
    if (!content.trim()) return toast.error('请填写描述');

    this.setData({ submitting: true });
    try {
      await api.system.submitFeedback({
        title: title.trim(),
        content: content.trim(),
        category,
        source: 'MINIPROGRAM',
      });
      toast.success('提交成功');
      this.setData({
        form: { title: '', content: '', category: 'BUG' },
        categoryIndex: 0,
      });
      this.loadMyFeedbacks();
    } catch (err) {
      toast.error(err.message || '提交失败');
    } finally {
      this.setData({ submitting: false });
    }
  },

  async loadMyFeedbacks() {
    try {
      const res = await api.system.myFeedbackList({ page: 1, pageSize: 20 });
      const list = (res.records || (Array.isArray(res) ? res : [])).map(item => ({
        ...item,
        statusText: item.status ? (STATUS_MAP[item.status] || '未知') : '',
      }));
      this.setData({ myFeedbacks: list });
    } catch (err) {
      console.warn('[feedback] loadMyFeedbacks failed:', err);
    }
  },
});
