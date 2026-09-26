const i18n = require('../../../utils/i18n/index');
const NS = 'mp.attendanceDetail.';
const api = require('../../../utils/api');
const permission = require('../../../utils/permission');

/**
 * 考勤明细页
 * 普通模式：月度汇总 + 日历视图（哪天打了/没打，可点击补卡）+ 每日明细列表
 * 管理员模式：选员工 + 记录列表 + 补卡/调整/作废
 */
Page({
  data: {
    loading: true,
    isAdmin: false,     // 是否是管理员
    adminMode: false,   // 是否处于管理员模式
    month: '',          // 当前查询月份 yyyy-MM
    monthLabel: '',     // 月份显示文案 2026年8月
    canPrev: true,      // 是否允许上个月（最早到当月-11）
    canNext: true,      // 是否允许下个月（最晚当月）
    summary: {
      workHours: 0,
      workDays: 0,
      monthMinutes: 0,
      avgHoursPerDay: 0,
      expectedDays: 0,
      absentDays: 0,
    },
    calendar: [],       // 整月日历
    weekHeader: [],  // applyLanguage 重建
    records: [],        // 每日打卡明细（倒序：最新在前）
    todayDate: '',      // 今日日期 yyyy-MM-dd
    // 补卡弹窗（员工提交申请）
    supplementOpen: false,
    supplementSubmitting: false,
    maxSupplementDate: '',   // picker end，今天
    supplementForm: {
      workDate: '',
      clockInTime: '',
      clockOutTime: '',
      remark: '',
    },
    // 我的补卡申请列表
    myApplies: [],
    // 管理员模式 Tab：records=打卡记录，approval=补卡审批
    adminTab: 'records',
    pendingApplies: [],       // 待审批列表
    // ========== 管理员模式 ==========
    employeeList: [],       // 员工列表
    employeePickerIdx: 0,   // 选中的员工索引
    selectedEmployee: null, // 选中的员工 { userId, userName }
    adminStats: null,       // 管理端统计
    // 员工搜索弹窗
    employeePickerOpen: false,
    employeeSearchKey: '',
    filteredEmployeeList: [],
    employeePickerSource: 'top',  // 'top'=顶部员工选择, 'supplement'=补卡弹窗员工选择
    // D-517：远程搜索加载态
    employeePickerLoading: false,
    // 管理员补卡弹窗
    adminSupplementOpen: false,
    adminSupplementSubmitting: false,
    adminSupplementForm: {
      targetUserId: '',
      targetUserName: '',
      workDate: '',
      clockInTime: '09:00',
      clockOutTime: '18:00',
      remark: '',
    },
    // 管理员调整弹窗
    adminAdjustOpen: false,
    adminAdjustSubmitting: false,
    adminAdjustForm: {
      id: null,
      userName: '',
      workDate: '',
      clockInTime: '',
      clockOutTime: '',
      remark: '',
    },
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        exitManage: i18n.t(NS + 'exitManage', lang),
        cardWord: i18n.t(NS + 'cardWord', lang),
        manageWord: i18n.t(NS + 'manageWord', lang),
        clockRecordsTab: i18n.t(NS + 'clockRecordsTab', lang),
        cardApprovalTab: i18n.t(NS + 'cardApprovalTab', lang),
        totalRecords: i18n.t(NS + 'totalRecords', lang),
        attendanceDays: i18n.t(NS + 'attendanceDays', lang),
        hoursUnit: i18n.t(NS + 'hoursUnit', lang),
        voidedLabel: i18n.t(NS + 'voidedLabel', lang),
        voidBtn: i18n.t(NS + 'voidBtn', lang),
        pendingApprovals: i18n.t(NS + 'pendingApprovals', lang),
        reasonPrefix: i18n.t(NS + 'reasonPrefix', lang),
        rejectBtn: i18n.t(NS + 'rejectBtn', lang),
        passBtn: i18n.t(NS + 'passBtn', lang),
        monthlyHours: i18n.t(NS + 'monthlyHours', lang),
        attendanceDaysN: i18n.t(NS + 'attendanceDaysN', lang),
        avgHours: i18n.t(NS + 'avgHours', lang),
        absentDays: i18n.t(NS + 'absentDays', lang),
        monthlyOutput: i18n.t(NS + 'monthlyOutput', lang),
        processAmount: i18n.t(NS + 'processAmount', lang),
        statusNormal: i18n.t(NS + 'statusNormal', lang),
        statusLate: i18n.t(NS + 'statusLate', lang),
        statusEarly: i18n.t(NS + 'statusEarly', lang),
        statusMissed: i18n.t(NS + 'statusMissed', lang),
        statusLeave: i18n.t(NS + 'statusLeave', lang),
        statusAbnormal: i18n.t(NS + 'statusAbnormal', lang),
        statusAbsent: i18n.t(NS + 'statusAbsent', lang),
        dailyDetail: i18n.t(NS + 'dailyDetail', lang),
        voidedHint: i18n.t(NS + 'voidedHint', lang),
        goClockBtn: i18n.t(NS + 'goClockBtn', lang),
        applyCardBtn: i18n.t(NS + 'applyCardBtn', lang),
        remarkOptional: i18n.t(NS + 'remarkOptional', lang),
        remarkOptional2: i18n.t(NS + 'remarkOptional2', lang),
        cardRuleHint: i18n.t(NS + 'cardRuleHint', lang),
        adjustClockBtn: i18n.t(NS + 'adjustClockBtn', lang),
        employeeLabel: i18n.t(NS + 'employeeLabel', lang),
        dateLabel: i18n.t(NS + 'dateLabel', lang),
        searchingTxt: i18n.t(NS + 'searchingTxt', lang),
        adminCardTitle: i18n.t(NS + 'adminCardTitle', lang),
        cardApplyDate: i18n.t(NS + 'cardApplyDate', lang),
        clockInLabelW: i18n.t(NS + 'clockInLabelW', lang),
        clockOutLabelW: i18n.t(NS + 'clockOutLabelW', lang),
        selectEmployee: i18n.t(NS + 'selectEmployee', lang),
        outputLabel: i18n.t(NS + 'outputLabel', lang),
        amountLabel: i18n.t(NS + 'amountLabel', lang),
        adjustLabel: i18n.t(NS + 'adjustLabel', lang),
        clockInW: i18n.t(NS + 'clockInW', lang),
        clockOutW: i18n.t(NS + 'clockOutW', lang),
        cancel: i18n.t('common.cancel', lang),
        submitWord: i18n.t(NS + 'submitWord', lang),
        selectEmployeePh: i18n.t(NS + 'selectEmployeePh', lang),
        recordsOfFmt: i18n.t(NS + 'recordsOfFmt', lang),
        pieceUnitW: i18n.t('common.piece', lang),
        noRecordForEmp: i18n.t(NS + 'noRecordForEmp', lang),
        noRecordHintEmp: i18n.t(NS + 'noRecordHintEmp', lang),
        noPendingW: i18n.t(NS + 'noPendingW', lang),
        employeeIdLabel: i18n.t(NS + 'employeeIdLabel', lang),
        expectedDaysW: i18n.t(NS + 'expectedDaysW', lang),
        accumHoursW: i18n.t(NS + 'accumHoursW', lang),
        hoursShortW: i18n.t(NS + 'hoursShortW', lang),
        todaySuffix: i18n.t(NS + 'todaySuffix', lang),
        weekendSuffix: i18n.t(NS + 'weekendSuffix', lang),
        noRecordMonth: i18n.t(NS + 'noRecordMonth', lang),
        goClockHint: i18n.t(NS + 'goClockHint', lang),
        pickPastDate: i18n.t(NS + 'pickPastDate', lang),
        emptyMeansOff: i18n.t(NS + 'emptyMeansOff', lang),
        emptyMeansOff2: i18n.t(NS + 'emptyMeansOff2', lang),
        emptyWord: i18n.t(NS + 'emptyWord', lang),
        remarkPh1: i18n.t(NS + 'remarkPh1', lang),
        remarkPh2: i18n.t(NS + 'remarkPh2', lang),
        submitCardBtn: i18n.t(NS + 'submitCardBtn', lang),
        pickEmployeeHint: i18n.t(NS + 'pickEmployeeHint', lang),
        selectDateW: i18n.t(NS + 'selectDateW', lang),
        adjustReasonPh: i18n.t(NS + 'adjustReasonPh', lang),
        saveAdjustBtn: i18n.t(NS + 'saveAdjustBtn', lang),
        searchAllPh: i18n.t(NS + 'searchAllPh', lang),
        noMatchEmployee: i18n.t(NS + 'noMatchEmployee', lang),
        searchEmpHint: i18n.t(NS + 'searchEmpHint', lang),
      },
      weekHeader: ['weekMon', 'weekTue', 'weekWed', 'weekThu', 'weekFri', 'weekSat', 'weekSun']
        .map(function (k) { return i18n.t(NS + k, lang); }),
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function () {
    this.applyLanguage(i18n.getLanguage());
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const month = y + '-' + (m < 10 ? '0' + m : m);
    const todayDate = y + '-' + (m < 10 ? '0' + m : m) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
    // 补卡日期上限：今天（picker end 不含今天，但微信 picker end 是包含当天，所以用昨天）
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const maxY = yesterday.getFullYear();
    const maxM = yesterday.getMonth() + 1;
    const maxD = yesterday.getDate();
    const maxSupplementDate = maxY + '-' + (maxM < 10 ? '0' + maxM : maxM) + '-' + (maxD < 10 ? '0' + maxD : maxD);

    // 判断是否是管理员
    const isAdmin = permission.isAdminOrSupervisor();

    this.setData({ month: month, todayDate: todayDate, maxSupplementDate: maxSupplementDate, isAdmin: isAdmin });
    this._loadData();

    // 管理员预加载员工列表
    if (isAdmin) {
      this._loadEmployees();
    }
  },

  onShow: function () {
    if (this._needReload) {
      this._needReload = false;
      this._loadData();
    }
  },

  onPullDownRefresh: function () {
    const self = this;
    this._loadData().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  // 月份切换
  onPrevMonth: function () {
    if (!this.data.canPrev) return;
    const prev = this._shiftMonth(this.data.month, -1);
    this.setData({ month: prev });
    this._loadData();
  },

  onNextMonth: function () {
    if (!this.data.canNext) return;
    const next = this._shiftMonth(this.data.month, 1);
    this.setData({ month: next });
    this._loadData();
  },

  // 跳转首页去打卡
  onGoClock: function () {
    this._needReload = true;
    wx.switchTab({ url: '/pages/home/index' });
  },

  // ========== 补卡相关 ==========

  // 点击日历单元格（过去日期）
  onCellTap: function (e) {
    const cell = e.currentTarget.dataset.cell;
    if (!cell || cell.isFuture || cell.isToday) return;

    // 管理员：直接走管理员补卡/调整流程，无需提示联系管理员
    if (this.data.isAdmin) {
      // 已有非作废记录 → 打开管理员调整弹窗
      if (cell.hasRecord && cell.status !== 'CANCELLED') {
        const record = this._findRecordByDate(cell.date);
        if (record && record.id) {
          const clockInTime = record.clockInTime ? String(record.clockInTime).substring(11, 16) : '';
          const clockOutTime = record.clockOutTime ? String(record.clockOutTime).substring(11, 16) : '';
          this.setData({
            adminAdjustOpen: true,
            adminAdjustForm: {
              id: record.id,
              userName: record.userName || '',
              workDate: record.workDate || '',
              clockInTime: clockInTime,
              clockOutTime: clockOutTime,
              remark: record.remark || '',
            },
          });
          return;
        }
      }
      // 无记录或作废记录 → 打开管理员补卡弹窗，预填该日期
      // 管理员模式下用选中的员工；普通模式下（看自己考勤）用当前登录用户
      const emp = this.data.adminMode
        ? (this.data.selectedEmployee || this.data.employeeList[0])
        : this._getCurrentUserAsEmployee();
      if (!emp) {
        wx.showToast({ title: i18n.t(NS + 'selectEmployeeT', this._lang), icon: 'none' });
        return;
      }
      this.setData({
        adminSupplementOpen: true,
        adminSupplementForm: {
          targetUserId: emp.userId,
          targetUserName: emp.userName,
          workDate: cell.date,
          clockInTime: '09:00',
          clockOutTime: '18:00',
          remark: '',
        },
      });
      return;
    }

    // 普通员工：已有非作废记录的，提示走管理员修改
    if (cell.hasRecord && cell.status !== 'CANCELLED') {
      wx.showModal({
        title: i18n.t(NS + 'hasRecordThatDay', this._lang),
        content: i18n.t(NS + 'hasRecordMsg', this._lang),
        showCancel: false,
        confirmText: i18n.t('common.gotIt', this._lang),
      });
      return;
    }
    // 打开员工补卡申请弹窗，预填该日期
    this.setData({
      supplementOpen: true,
      supplementForm: {
        workDate: cell.date,
        clockInTime: '09:00',
        clockOutTime: '18:00',
        remark: '',
      },
    });
  },

  // 按日期查找记录
  _findRecordByDate: function (date) {
    if (!date) return null;
    const list = this.data.records || [];
    for (let i = 0; i < list.length; i++) {
      if (String(list[i].workDate || '') === String(date)) {
        return list[i];
      }
    }
    return null;
  },

  // 获取当前登录用户作为员工对象（管理员看自己考勤时用）
  _getCurrentUserAsEmployee: function () {
    try {
      const userInfo = wx.getStorageSync('user_info');
      if (!userInfo) return null;
      const userId = String(userInfo.id || userInfo.userId || userInfo.idStr || '');
      if (!userId) return null;
      const userName = userInfo.realName || userInfo.username || userInfo.name || userInfo.nickname || i18n.t(NS + 'meLabel', this._lang);
      return { userId: userId, userName: userName };
    } catch (e) {
      return null;
    }
  },

  // 顶部"补卡"按钮
  onOpenSupplement: function () {
    this.setData({
      supplementOpen: true,
      supplementForm: {
        workDate: '',
        clockInTime: '09:00',
        clockOutTime: '18:00',
        remark: '',
      },
    });
  },

  onCloseSupplement: function () {
    if (this.data.supplementSubmitting) return;
    this.setData({ supplementOpen: false });
  },

  onStopPropagation: function () {
    // 阻止冒泡到 mask
  },

  onPickDate: function (e) {
    this.setData({ 'supplementForm.workDate': e.detail.value });
  },

  onPickClockIn: function (e) {
    this.setData({ 'supplementForm.clockInTime': e.detail.value });
  },

  onPickClockOut: function (e) {
    this.setData({ 'supplementForm.clockOutTime': e.detail.value });
  },

  onInputRemark: function (e) {
    this.setData({ 'supplementForm.remark': e.detail.value });
  },

  onSubmitSupplement: function () {
    const self = this;
    if (self.data.supplementSubmitting) return;

    const form = self.data.supplementForm;
    if (!form.workDate) {
      wx.showToast({ title: i18n.t(NS + 'selectCardDate', this._lang), icon: 'none' });
      return;
    }
    if (!form.clockInTime && !form.clockOutTime) {
      wx.showToast({ title: i18n.t(NS + 'atLeastOneTime', this._lang), icon: 'none' });
      return;
    }

    // 拼接完整时间（yyyy-MM-dd HH:mm）
    const clockInTime = form.clockInTime ? (form.workDate + ' ' + form.clockInTime) : '';
    const clockOutTime = form.clockOutTime ? (form.workDate + ' ' + form.clockOutTime) : '';

    self.setData({ supplementSubmitting: true });
    wx.showLoading({ title: i18n.t(NS + 'submitWord', this._lang), mask: true });

    api.attendance.submitApply({
      workDate: form.workDate,
      clockInTime: clockInTime,
      clockOutTime: clockOutTime,
      reason: form.remark,
    }).then(function () {
      wx.hideLoading();
      wx.showToast({ title: i18n.t(NS + 'applySubmitted', this._lang), icon: 'success' });
      self.setData({ supplementOpen: false, supplementSubmitting: false });
      self._needReload = false;
      self._loadData();
      self._loadMyApplies();
    }).catch(function (e) {
      wx.hideLoading();
      const errMsg = (e && e.errMsg) || i18n.t('common.submitFailed', this._lang);
      wx.showModal({
        title: i18n.t('common.submitFailed', this._lang),
        content: errMsg,
        showCancel: false,
        confirmText: i18n.t('common.gotIt', this._lang),
      });
      self.setData({ supplementSubmitting: false });
    });
  },

  // ========== 管理员模式 ==========

  // 切换管理员/普通模式
  onToggleAdminMode: function () {
    const newMode = !this.data.adminMode;
    this.setData({ adminMode: newMode, adminTab: 'records' });
    if (newMode) {
      this._loadAdminList();
      this._loadPendingApplies();
    } else {
      this._loadData();
      this._loadMyApplies();
    }
  },

  // 切换管理员 Tab（records=打卡记录，approval=补卡审批）
  onSwitchAdminTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.adminTab) return;
    this.setData({ adminTab: tab });
    if (tab === 'approval') {
      this._loadPendingApplies();
    }
  },

  // 加载待审批列表
  _loadPendingApplies: function () {
    const self = this;
    const parts = self.data.month.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const startDate = y + '-' + (m < 10 ? '0' + m : m) + '-01';
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = y + '-' + (m < 10 ? '0' + m : m) + '-' + (lastDay < 10 ? '0' + lastDay : lastDay);
    api.attendance.pendingList({ startDate: startDate, endDate: endDate }).then(function (res) {
      const list = (res && res.records) || (res && Array.isArray(res) ? res : []) || [];
      self.setData({ pendingApplies: list });
    }).catch(function (e) {
      console.warn('[attendance.detail] _loadPendingApplies failed:', e && e.errMsg);
    });
  },

  // 管理员审批通过
  onApproveApply: function (e) {
    const self = this;
    const applyId = e.currentTarget.dataset.id;
    wx.showModal({
      title: i18n.t(NS + 'approvePass', this._lang),
      content: i18n.t(NS + 'approvePassConfirm', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t(NS + 'statusApproving', this._lang), mask: true });
        api.attendance.approveApply({ id: applyId }).then(function () {
          wx.hideLoading();
          wx.showToast({ title: i18n.t(NS + 'statusApproved', this._lang), icon: 'success' });
          self._loadPendingApplies();
          self._loadAdminList();
        }).catch(function (err) {
          wx.hideLoading();
          wx.showModal({
            title: i18n.t(NS + 'approveFail', this._lang),
            content: (err && err.errMsg) || i18n.t('common.operationFailed', this._lang),
            showCancel: false,
          });
        });
      },
    });
  },

  // 管理员审批拒绝
  onRejectApply: function (e) {
    const self = this;
    const applyId = e.currentTarget.dataset.id;
    wx.showModal({
      title: i18n.t(NS + 'approveReject', this._lang),
      content: i18n.t(NS + 'approveRejectConfirm', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t('mp.sampleDetail.processing', this._lang), mask: true });
        api.attendance.rejectApply({ id: applyId }).then(function () {
          wx.hideLoading();
          wx.showToast({ title: i18n.t(NS + 'statusRejected', this._lang), icon: 'none' });
          self._loadPendingApplies();
        }).catch(function (err) {
          wx.hideLoading();
          wx.showModal({
            title: i18n.t('common.operationFailed', this._lang),
            content: (err && err.errMsg) || i18n.t('common.operationFailed', this._lang),
            showCancel: false,
          });
        });
      },
    });
  },

  // 加载我的补卡申请列表
  _loadMyApplies: function () {
    const self = this;
    api.attendance.myApplies(self.data.month).then(function (res) {
      const list = (res && res.records) || (res && Array.isArray(res) ? res : []) || [];
      self.setData({ myApplies: list });
    }).catch(function (e) {
      console.warn('[attendance.detail] _loadMyApplies failed:', e && e.errMsg);
    });
  },

  // 加载员工列表（D-517：只拉首屏，全量靠关键字远程搜索 —— 原先拉 200 条后本地过滤，
  // 第 201 个员工永远搜不到；后端 name 是 LIKE，按关键字搜可覆盖全员）
  _loadEmployees: function () {
    const self = this;
    api.system.listUsers({ page: 1, pageSize: 20 }).then(function (res) {
      const list = (res && res.records) || (res && res.list) || (res && Array.isArray(res) ? res : []) || [];
      // 格式化为 picker 选项
      const employeeList = list.map(function (u) {
        return {
          userId: String(u.id || u.userId || u.idStr || ''),
          userName: u.realName || u.username || u.name || u.nickname || i18n.t('mp.stageDetail.unknownWord', this._lang),
        };
      }).filter(function (e) { return e.userId; });
      self.setData({
        employeeList: employeeList,
        selectedEmployee: employeeList.length > 0 ? employeeList[0] : null,
        employeePickerIdx: 0,
      });
    }).catch(function (e) {
      console.warn('[attendance.detail] _loadEmployees failed:', e && e.errMsg);
    });
  },

  // 打开员工搜索弹窗（顶部员工选择）
  onOpenEmployeePicker: function () {
    if (this.data.employeeList.length === 0) {
      wx.showToast({ title: i18n.t(NS + 'noEmployeeData', this._lang), icon: 'none' });
      return;
    }
    this.setData({
      employeePickerOpen: true,
      employeePickerSource: 'top',
      employeeSearchKey: '',
      filteredEmployeeList: this.data.employeeList,
    });
  },

  // 打开员工搜索弹窗（管理员补卡弹窗内员工选择）
  onOpenSupplementEmployeePicker: function () {
    if (this.data.employeeList.length === 0) {
      wx.showToast({ title: i18n.t(NS + 'noEmployeeData', this._lang), icon: 'none' });
      return;
    }
    this.setData({
      employeePickerOpen: true,
      employeePickerSource: 'supplement',
      employeeSearchKey: '',
      filteredEmployeeList: this.data.employeeList,
    });
  },

  // 关闭员工搜索弹窗
  onCloseEmployeePicker: function () {
    this.setData({ employeePickerOpen: false });
  },

  /**
   * 搜索输入（D-517：改为**后端关键字搜索**）
   * 原先只对本地已加载的 200 条做过滤，超过 200 人时后面的员工永远搜不到。
   * 后端 /api/system/user/list 的 name 是 LIKE 匹配，按关键字搜可命中全员。
   */
  onInputEmployeeSearch: function (e) {
    const raw = e.detail.value || '';
    const key = raw.trim();
    this.setData({ employeeSearchKey: raw });
    const self = this;
    if (this._empSearchTimer) clearTimeout(this._empSearchTimer);
    this._empSearchTimer = setTimeout(function () {
      self._empSearchTimer = null;
      if (!key) {
        // 清空关键字 → 回到首屏列表
        self.setData({ filteredEmployeeList: self.data.employeeList });
        return;
      }
      self.setData({ employeePickerLoading: true });
      api.system.listUsers({ page: 1, pageSize: 50, name: key }).then(function (res) {
        const list = (res && res.records) || (res && res.list) || [];
        self.setData({
          employeePickerLoading: false,
          filteredEmployeeList: list.map(function (u) {
            return {
              userId: String(u.id || u.userId || ''),
              userName: u.realName || u.username || u.name || u.nickname || i18n.t('mp.stageDetail.unknownWord', this._lang),
              deptName: u.deptName || u.departmentName || '',
            };
          }).filter(function (o) { return o.userId; }),
        });
      }).catch(function (err) {
        console.warn('[attendance.detail] 员工搜索失败:', err && err.errMsg);
        self.setData({ employeePickerLoading: false });
      });
    }, 300);
  },

  // 从搜索弹窗选择员工（根据 source 来源回填不同字段）
  onPickEmployeeFromSearch: function (e) {
    const emp = e.currentTarget.dataset.employee;
    if (!emp || !emp.userId) return;
    const idx = this.data.employeeList.findIndex(function (it) { return it.userId === emp.userId; });
    const source = this.data.employeePickerSource;

    if (source === 'supplement') {
      // 补卡弹窗：回填 targetUserId/targetUserName，不触发列表刷新
      this.setData({
        employeePickerOpen: false,
        'adminSupplementForm.targetUserId': emp.userId,
        'adminSupplementForm.targetUserName': emp.userName,
      });
    } else {
      // 顶部员工选择：回填 selectedEmployee + 刷新打卡记录列表
      this.setData({
        employeePickerIdx: idx >= 0 ? idx : 0,
        selectedEmployee: emp,
        employeePickerOpen: false,
      });
      this._loadAdminList();
    }
  },

  // 加载管理员列表数据
  _loadAdminList: function () {
    const self = this;
    if (!self.data.selectedEmployee) {
      wx.showToast({ title: i18n.t(NS + 'selectEmployeeT', this._lang), icon: 'none' });
      return;
    }

    // 计算当月起止日期
    const parts = self.data.month.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const startDate = y + '-' + (m < 10 ? '0' + m : m) + '-01';
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = y + '-' + (m < 10 ? '0' + m : m) + '-' + (lastDay < 10 ? '0' + lastDay : lastDay);

    self.setData({ loading: true });
    api.attendance.adminList({
      startDate: startDate,
      endDate: endDate,
      userId: self.data.selectedEmployee.userId,
    }).then(function (res) {
      const records = (res && res.records) || [];
      // 倒序
      const sorted = records.slice().sort(function (a, b) {
        return String(b.workDate || '').localeCompare(String(a.workDate || ''));
      });
      sorted.forEach(function (r) {
        r.operatedByText = r.operatorName ? i18n.tf(NS + 'operatedByFmt', { name: r.operatorName }, self._lang) : '';
      });
      self.setData({
        records: sorted,
        adminStats: res && res.stats ? res.stats : null,
        loading: false,
      });
    }).catch(function (e) {
      self.setData({ loading: false });
      console.warn('[attendance.detail] _loadAdminList failed:', e && e.errMsg);
      wx.showToast({ title: (e && e.errMsg) || i18n.t('common.loadFailed', this._lang), icon: 'none' });
    });
  },

  // 打开管理员补卡弹窗
  onOpenAdminSupplement: function () {
    const emp = this.data.selectedEmployee || this.data.employeeList[0];
    if (!emp) {
      wx.showToast({ title: i18n.t(NS + 'selectEmployeeT', this._lang), icon: 'none' });
      return;
    }
    this.setData({
      adminSupplementOpen: true,
      adminSupplementForm: {
        targetUserId: emp.userId,
        targetUserName: emp.userName,
        workDate: '',
        clockInTime: '09:00',
        clockOutTime: '18:00',
        remark: '',
      },
    });
  },

  onCloseAdminSupplement: function () {
    if (this.data.adminSupplementSubmitting) return;
    this.setData({ adminSupplementOpen: false });
  },

  onAdminSupplementPickDate: function (e) {
    this.setData({ 'adminSupplementForm.workDate': e.detail.value });
  },
  onAdminSupplementPickClockIn: function (e) {
    this.setData({ 'adminSupplementForm.clockInTime': e.detail.value });
  },
  onAdminSupplementPickClockOut: function (e) {
    this.setData({ 'adminSupplementForm.clockOutTime': e.detail.value });
  },
  onAdminSupplementInputRemark: function (e) {
    this.setData({ 'adminSupplementForm.remark': e.detail.value });
  },

  // 提交管理员补卡
  onSubmitAdminSupplement: function () {
    const self = this;
    if (self.data.adminSupplementSubmitting) return;

    const form = self.data.adminSupplementForm;
    if (!form.targetUserId) {
      wx.showToast({ title: i18n.t(NS + 'selectEmployeeT', this._lang), icon: 'none' });
      return;
    }
    if (!form.workDate) {
      wx.showToast({ title: i18n.t(NS + 'selectCardDate', this._lang), icon: 'none' });
      return;
    }
    if (!form.clockInTime && !form.clockOutTime) {
      wx.showToast({ title: i18n.t(NS + 'atLeastOneTime', this._lang), icon: 'none' });
      return;
    }

    const clockInTime = form.clockInTime ? (form.workDate + ' ' + form.clockInTime) : '';
    const clockOutTime = form.clockOutTime ? (form.workDate + ' ' + form.clockOutTime) : '';

    self.setData({ adminSupplementSubmitting: true });
    wx.showLoading({ title: i18n.t(NS + 'submitWord', this._lang), mask: true });

    api.attendance.adminSupplement({
      targetUserId: form.targetUserId,
      targetUserName: form.targetUserName,
      workDate: form.workDate,
      clockInTime: clockInTime,
      clockOutTime: clockOutTime,
      remark: form.remark,
    }).then(function () {
      wx.hideLoading();
      wx.showToast({ title: i18n.t(NS + 'cardSuccess', this._lang), icon: 'success' });
      self.setData({ adminSupplementOpen: false, adminSupplementSubmitting: false });
      self._loadAdminList();
    }).catch(function (e) {
      wx.hideLoading();
      const errMsg = (e && e.errMsg) || i18n.t(NS + 'cardFailed', this._lang);
      wx.showModal({
        title: i18n.t(NS + 'cardFailed', this._lang),
        content: errMsg,
        showCancel: false,
        confirmText: i18n.t('common.gotIt', this._lang),
      });
      self.setData({ adminSupplementSubmitting: false });
    });
  },

  // 打开管理员调整弹窗
  onOpenAdminAdjust: function (e) {
    const record = e.currentTarget.dataset.record;
    if (!record || !record.id) return;

    // 解析时间为 HH:mm 格式
    const clockInTime = record.clockInTime ? String(record.clockInTime).substring(11, 16) : '';
    const clockOutTime = record.clockOutTime ? String(record.clockOutTime).substring(11, 16) : '';

    this.setData({
      adminAdjustOpen: true,
      adminAdjustForm: {
        id: record.id,
        userName: record.userName || '',
        workDate: record.workDate || '',
        clockInTime: clockInTime,
        clockOutTime: clockOutTime,
        remark: record.remark || '',
      },
    });
  },

  onCloseAdminAdjust: function () {
    if (this.data.adminAdjustSubmitting) return;
    this.setData({ adminAdjustOpen: false });
  },

  onAdminAdjustPickClockIn: function (e) {
    this.setData({ 'adminAdjustForm.clockInTime': e.detail.value });
  },
  onAdminAdjustPickClockOut: function (e) {
    this.setData({ 'adminAdjustForm.clockOutTime': e.detail.value });
  },
  onAdminAdjustInputRemark: function (e) {
    this.setData({ 'adminAdjustForm.remark': e.detail.value });
  },

  // 提交管理员调整
  onSubmitAdminAdjust: function () {
    const self = this;
    if (self.data.adminAdjustSubmitting) return;

    const form = self.data.adminAdjustForm;
    const clockInTime = form.clockInTime ? (form.workDate + ' ' + form.clockInTime) : '';
    const clockOutTime = form.clockOutTime ? (form.workDate + ' ' + form.clockOutTime) : '';

    self.setData({ adminAdjustSubmitting: true });
    wx.showLoading({ title: i18n.t(NS + 'submitWord', this._lang), mask: true });

    api.attendance.adminAdjust({
      id: form.id,
      clockInTime: clockInTime,
      clockOutTime: clockOutTime,
      remark: form.remark,
    }).then(function () {
      wx.hideLoading();
      wx.showToast({ title: i18n.t(NS + 'adjustSuccess', this._lang), icon: 'success' });
      self.setData({ adminAdjustOpen: false, adminAdjustSubmitting: false });
      self._loadAdminList();
    }).catch(function (e) {
      wx.hideLoading();
      const errMsg = (e && e.errMsg) || i18n.t(NS + 'adjustFailed', this._lang);
      wx.showModal({
        title: i18n.t(NS + 'adjustFailed', this._lang),
        content: errMsg,
        showCancel: false,
        confirmText: i18n.t('common.gotIt', this._lang),
      });
      self.setData({ adminAdjustSubmitting: false });
    });
  },

  // 管理员作废
  onAdminCancel: function (e) {
    const self = this;
    const record = e.currentTarget.dataset.record;
    if (!record || !record.id) return;

    wx.showModal({
      title: i18n.t(NS + 'voidTitle', this._lang),
      content: i18n.tf(NS + 'voidConfirmFmt', { name: (record.userName || '') + ' ' + (record.workDate || '') }, this._lang),
      confirmText: i18n.t(NS + 'voidConfirmBtn', this._lang),
      confirmColor: '#e64340',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t('mp.sampleDetail.processing', this._lang), mask: true });
        api.attendance.adminCancel({ id: record.id }).then(function () {
          wx.hideLoading();
          wx.showToast({ title: i18n.t(NS + 'statusVoided', this._lang), icon: 'success' });
          self._loadAdminList();
        }).catch(function (err) {
          wx.hideLoading();
          const errMsg = (err && err.errMsg) || i18n.t(NS + 'voidFailed', this._lang);
          wx.showModal({
            title: i18n.t(NS + 'voidFailed', this._lang),
            content: errMsg,
            showCancel: false,
            confirmText: i18n.t('common.gotIt', this._lang),
          });
        });
      },
    });
  },

  // ========== 内部方法 ==========

  _loadData: function () {
    const self = this;
    self.setData({ loading: true });
    return api.attendance.monthlyRecords(self.data.month).then(function (res) {
      self._applyData(res || {});
    }).catch(function (e) {
      console.warn('[attendance.detail] _loadData failed:', e && e.errMsg);
      wx.showToast({ title: (e && e.errMsg) || i18n.t('common.loadFailed', this._lang), icon: 'none' });
    }).then(function () {
      self.setData({ loading: false });
    });
  },

  _applyData: function (data) {
    const month = data.month || this.data.month;
    const summary = data.summary || {};
    const calendar = data.calendar || [];
    const records = data.records || [];

    // 月显示文案
    const parts = String(month).split('-');
    const monthLabel = parts.length >= 2 ? (parts[0] + i18n.t(NS + 'yearUnit', this._lang) + parseInt(parts[1], 10) + i18n.t(NS + 'monthUnit', this._lang) ) : month;

    // 控制按钮可用性（最早当月-11，最晚当月）
    const now = new Date();
    const curMonth = now.getFullYear() + '-' + (now.getMonth() + 1 < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1));
    const minMonth = this._shiftMonth(curMonth, -11);
    const canPrev = this._compareMonth(month, minMonth) > 0;
    const canNext = this._compareMonth(month, curMonth) < 0;

    // 把日历数据按"周一起始"重新排布：在前面补空格
    const calendarGrid = this._buildCalendarGrid(calendar);

    // 倒序展示明细（最新在前）
    const sortedRecords = records.slice().reverse();

    this.setData({
      month: month,
      monthLabel: monthLabel,
      canPrev: canPrev,
      canNext: canNext,
      summary: {
        workHours: Number(summary.workHours || 0),
        workDays: Number(summary.workDays || 0),
        monthMinutes: Number(summary.monthMinutes || 0),
        avgHoursPerDay: Number(summary.avgHoursPerDay || 0),
        expectedDays: Number(summary.expectedDays || 0),
        absentDays: Number(summary.absentDays || 0),
        monthScanQty: Number(summary.monthScanQty || 0),
        monthScanAmount: Number(summary.monthScanAmount || 0),
      },
      calendar: calendarGrid,
      records: (sortedRecords.forEach(function (r) {
        r.operatedByText = r.operatorName ? i18n.tf(NS + 'operatedByFmt', { name: r.operatorName }, this._lang || i18n.getLanguage()) : '';
      }), sortedRecords),
    });
  },

  /**
   * 把后端返回的日历（按日升序）排成 6 行 7 列的网格（周一起始）
   * 前面补 null 让第一天对齐正确的星期
   */
  _buildCalendarGrid: function (calendar) {
    if (!calendar || !calendar.length) return [];
    const first = calendar[0];
    const parts = String(first.date).split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    // JS getDay(): 0=周日, 1=周一 ... 我们要周一起始
    const firstDay = new Date(y, m - 1, d).getDay();
    const lead = (firstDay + 6) % 7;  // 周一=0, 周日=6
    const grid = [];
    for (let i = 0; i < lead; i++) grid.push(null);
    for (let i = 0; i < calendar.length; i++) grid.push(calendar[i]);
    while (grid.length % 7 !== 0) grid.push(null);
    // 切分成行
    const rows = [];
    for (let i = 0; i < grid.length; i += 7) {
      rows.push(grid.slice(i, i + 7));
    }
    return rows;
  },

  _shiftMonth: function (month, delta) {
    const parts = String(month).split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1 + delta;
    const d = new Date(y, m, 1);
    const yy = d.getFullYear();
    const mm = d.getMonth() + 1;
    return yy + '-' + (mm < 10 ? '0' + mm : mm);
  },

  _compareMonth: function (a, b) {
    const pa = String(a).split('-');
    const pb = String(b).split('-');
    const ya = parseInt(pa[0], 10), ma = parseInt(pa[1], 10);
    const yb = parseInt(pb[0], 10), mb = parseInt(pb[1], 10);
    if (ya !== yb) return ya - yb;
    return ma - mb;
  },
});
