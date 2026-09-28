const i18n = require('../../../utils/i18n/index');

const NS = 'mp.payrollFeedback.';

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission } = require('../../../utils/permission');

Page({
  data: {
    t: {},
    settlements: [],
    loading: false,
    submitting: false,
    showForm: false,
    currentSettlementId: '',
    currentSettlementNo: '',
    feedbackType: 'CONFIRM',
    feedbackContent: '',
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        emptySettlements: t('emptySettlements'),
        statusNone: t('statusNone'),
        statusPending: t('statusPending'),
        statusResolved: t('statusResolved'),
        statusRejected: t('statusRejected'),
        tapFeedback: t('tapFeedback'),
        submitTitle: t('submitTitle'),
        settlementNo: t('settlementNo'),
        feedbackType: t('feedbackType'),
        typeConfirm: t('typeConfirm'),
        typeDispute: t('typeDispute'),
        disputeContent: t('disputeContent'),
        disputePlaceholder: t('disputePlaceholder'),
        cancel: i18n.t('common.cancel', lang),
        submitting: t('submitting'),
        submitBtn: t('submitBtn'),
        pieceUnit: t('pieceUnit'),
      },
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad() {
    if (!hasFeaturePermission('view_payroll')) {
      toast(i18n.t(NS + 'noPermission', this._lang));
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
      toast.info(i18n.t(NS + 'loadFailed', this._lang));
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
      toast.info(i18n.t(NS + 'disputeRequired', this._lang));
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.wageSettlementFeedback.submit({ settlementId: currentSettlementId, feedbackType, feedbackContent });
      toast.success(i18n.t(NS + 'submitSuccess', this._lang));
      this.setData({ showForm: false, feedbackContent: '' });
      this.loadSettlements();
    } catch (e) {
      toast.error(e?.message || i18n.t(NS + 'submitFailed', this._lang));
    } finally {
      this.setData({ submitting: false });
    }
  },
});
