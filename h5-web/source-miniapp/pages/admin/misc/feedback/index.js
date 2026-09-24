const api = require('../../../../utils/api');

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

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    activeTab: 'submit',
    categoryList: CATEGORY_LIST,
    categoryIndex: 0,
    form: { title: '', content: '', contact: '', category: 'BUG' },
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
  onContactInput(e) { this.setData({ 'form.contact': e.detail.value }); },

  async onSubmitFeedback() {
    const { title, content, category, contact } = this.data.form;
    if (!title.trim()) return wx.showToast({ title: '请填写标题', icon: 'none' });
    if (!content.trim()) return wx.showToast({ title: '请填写描述', icon: 'none' });

    this.setData({ submitting: true });
    try {
      await api.system.submitFeedback({
        title: title.trim(),
        content: content.trim(),
        category,
        contact: contact.trim(),
        source: 'MINIPROGRAM',
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
      this.setData({
        form: { title: '', content: '', contact: '', category: 'BUG' },
        categoryIndex: 0,
      });
      this.loadMyFeedbacks();
    } catch (err) {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async loadMyFeedbacks() {
    try {
      const res = await api.system.myFeedbackList({ page: 1, pageSize: 20 });
      const list = (res.records || (Array.isArray(res) ? res : [])).map(item => ({
        ...item,
        statusText: STATUS_MAP[item.status] || item.status,
      }));
      this.setData({ myFeedbacks: list });
    } catch (err) {
      console.warn('[feedback] loadMyFeedbacks failed:', err);
    }
  },

  /* ── D-533：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）────────
     由 scripts/codemod-search-picker.py 注入，各页面内容一致。
     选中后回调页面原有的 onXxxChange（e.detail.value 为下标），既有逻辑不变。 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || '请选择',
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

});
