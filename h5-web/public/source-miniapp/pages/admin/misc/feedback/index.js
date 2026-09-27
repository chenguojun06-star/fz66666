const i18n = require('../../../../utils/i18n/index');

const NS = 'mp.feedback.';

const api = require('../../../../utils/api');

// 后端状态码 → 语言包键名（显示文案由 applyLanguage 决定，value 保持英文 code）
const STATUS_KEY_MAP = {
  PENDING: 'statusPending',
  PROCESSING: 'statusProcessing',
  RESOLVED: 'statusResolved',
  CLOSED: 'statusClosed',
};

// value 是**提交后端的载荷**（英文 code），label 由 applyLanguage 按语言生成
const CATEGORY_LIST = [
  { value: 'BUG', key: 'catBug' },
  { value: 'SUGGESTION', key: 'catSuggestion' },
  { value: 'QUESTION', key: 'catQuestion' },
  { value: 'OTHER', key: 'catOther' },
];

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    activeTab: 'submit',
    categoryList: [],
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

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        tabSubmit: t('tabSubmit'),
        tabMy: t('tabMy'),
        categoryLabel: t('categoryLabel'),
        titleLabel: t('titleLabel'),
        titlePlaceholder: t('titlePlaceholder'),
        descLabel: t('descLabel'),
        descPlaceholder: t('descPlaceholder'),
        submitting: t('submitting'),
        submitBtn: t('submitBtn'),
        emptyRecords: t('emptyRecords'),
        replyPrefix: t('replyPrefix'),
      },
      // picker 选项数组必须整体重建（只翻 data.t 不够）
      categoryList: CATEGORY_LIST.map((c) => ({ value: c.value, label: t(c.key) })),
      // 列表里的状态文案也要跟着语言重算
      myFeedbacks: (this.data.myFeedbacks || []).map((it) => ({
        ...it,
        statusText: STATUS_KEY_MAP[it.status] ? i18n.t(NS + STATUS_KEY_MAP[it.status], lang) : it.status,
      })),
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  async onSubmitFeedback() {
    const { title, content, category, contact } = this.data.form;
    if (!title.trim()) return wx.showToast({ title: i18n.t(NS + 'titleRequired', this._lang), icon: 'none' });
    if (!content.trim()) return wx.showToast({ title: i18n.t(NS + 'descRequired', this._lang), icon: 'none' });

    this.setData({ submitting: true });
    try {
      await api.system.submitFeedback({
        title: title.trim(),
        content: content.trim(),
        category,
        contact: contact.trim(),
        source: 'MINIPROGRAM',
      });
      wx.showToast({ title: i18n.t(NS + 'submitSuccess', this._lang), icon: 'success' });
      this.setData({
        form: { title: '', content: '', contact: '', category: 'BUG' },
        categoryIndex: 0,
      });
      this.loadMyFeedbacks();
    } catch (err) {
      wx.showToast({ title: err.message || i18n.t('common.submitFailed', this._lang), icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async loadMyFeedbacks() {
    try {
      const res = await api.system.myFeedbackList({ page: 1, pageSize: 20 });
      const list = (res.records || (Array.isArray(res) ? res : [])).map(item => ({
        ...item,
        statusText: STATUS_KEY_MAP[item.status] ? i18n.t(NS + STATUS_KEY_MAP[item.status], this._lang) : item.status,
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
      pickerTitle: ds.title || i18n.t('common.pleaseSelect', this._lang),
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
