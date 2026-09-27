/**
 * 扫码页面 - 生产扫码主页
 * Version: 2.3 (重构版)
 * Date: 2026-02-15
 *
 * [FIX] 重构说明 (v2.2 → v2.3):
 * 1. 提取 data 配置到 scanDataConfig.js (~150行)
 * 2. 提取生命周期到 scanLifecycleMixin.js (~200行)
 * 3. 提取核心扫码逻辑到 scanCoreMixin.js (~370行)
 * 4. 保留所有 Handler 委托方法（100% 业务逻辑兼容）
 * 5. 使用微信小程序 Behavior 机制实现 Mixin
 * 6. 主文件减少: 916行 → 427行 (-53%)
 *
 * 功能:
 * 1. 集成 ScanHandler 业务处理器 (面向对象架构)
 * 2. 支持多种扫码模式 (菲号/订单/SKU/样板)
 * 3. 支持手动输入 + 工序识别
 * 4. 模式切换: 单选(自动/订单/SKU) + 快捷模式(库存查询)
 * 5. 撤销功能 (UndoHandler)
 * 6. 质检入库页面 (QualityHandler → /pages/scan/quality/index)
 * 7. 退回重扫页面 (RescanHandler → /pages/scan/rescan/index)
 * 8. 样板生产扫码确认 (PatternScanProcessor → /pages/scan/pattern/index)
 * 9. 扫码结果确认页 (ScanResultHandler → /pages/scan/scan-result/index)
 * 10. 确认弹窗页 (ConfirmModalHandler → /pages/scan/confirm/index)
 * 11. 历史分组折叠展开 (HistoryHandler)
 * 12. 修复: 使用 eventBus.on 替代 subscribe (2026-02-01)
 * 13. 🆕 扫码结果确认页 - 2026-02-06 - 混合模式 (手动+自动)
 * 14. 🆕 采购/裁剪任务已迁移到独立页面 (pkg-cutting/ + pkg-procurement/)，扫码页不再包含相关弹窗与处理器
 *
 * 业务处理器职责分配:
 * - ScanHandler: 扫码逻辑 + QRCodeParser
 * - UndoHandler: 撤销倒计时
 * - QualityHandler: 质检页面导航
 * - RescanHandler: 退回重扫页面导航
 * - ScanResultHandler: 扫码结果确认页导航
 * - HistoryHandler: 历史记录折叠/展开 + 分组
 * - ConfirmModalHandler: 确认页导航 (样板/普通)
 * - StockHandler: 库存查询
 *
 * @version 2.3
 * @date 2026-02-15
 */

// ==================== 导入模块 ====================
const { safeNavigate, toast } = require('../../utils/uiHelper');
const i18n = require('../../utils/i18n/index');

const NS = 'mp.scanHome.';

// 导入 Mixins (生命周期 + 核心业务 + 数据配置)
const scanLifecycleMixin = require('./mixins/scanLifecycleMixin');
const scanCoreMixin = require('./mixins/scanCoreMixin');
const { scanPageData } = require('./mixins/scanDataConfig');

// 导入 Handlers (所有委托调用)
const QualityHandler = require('./handlers/QualityHandler');
const UndoHandler = require('./handlers/UndoHandler');
const StockHandler = require('./handlers/StockHandler');
const RescanHandler = require('./handlers/RescanHandler');
const ScanResultHandler = require('./handlers/ScanResultHandler');
const ConfirmModalHandler = require('./handlers/ConfirmModalHandler');
const HistoryHandler = require('./handlers/HistoryHandler');

// ==================== Page 定义 ====================

Page({
  // 使用 Mixins (微信小程序 behaviors 机制)
  behaviors: [scanLifecycleMixin, scanCoreMixin],

  // 数据对象 (从 scanDataConfig 导入)
  data: scanPageData,

  // ==================== 多语言 ====================

  /**
   * 应用语言：一次性生成本页文案表。
   * wxml 用 {{t.xxx}}；带 {count} 占位的文案由 wxs 的 utils.fmt 替换。
   */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    // ⚠️ 必须记住当前语言：JS 层（toast / showModal / showLoading）拿不到 data.t，
    //    只能靠 this._lang 取词，否则切到非中文后提示仍是中文（全项目统一手法）
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        offlinePendingFmt: t('offlinePendingFmt'),
        offlineSyncing: t('offlineSyncing'),
        justNow: t('justNow'),
        minutesAgo: t('minutesAgo'),
        hoursAgo: t('hoursAgo'),
        daysAgo: t('daysAgo'),
        statsTitle: t('statsTitle'),
        unitTimes: t('unitTimes'),
        todayScan: t('todayScan'),
        unitOrder: t('unitOrder'),
        inProgress: t('inProgress'),
        historyEntry: t('historyEntry'),
        myPayroll: t('myPayroll'),
        recognizing: t('recognizing'),
        tapToScan: t('tapToScan'),
        lastPrefix: t('lastPrefix'),
        autoMatchStage: t('autoMatchStage'),
        targetWarehouse: t('targetWarehouse'),
        clear: t('clear'),
        warehouseCodePh: t('warehouseCodePh'),
        targetLocationFmt: t('targetLocationFmt'),
        selectLocation: t('selectLocation'),
        locationCodePh: t('locationCodePh'),
        currentOwner: t('currentOwner'),
        suffixInternal: t('suffixInternal'),
        suffixExternal: t('suffixExternal'),
        scanModeTip: t('scanModeTip'),
        revoke: t('revoke'),
        internal: t('internal'),
        external: t('external'),
        sessionTotalFmt: t('sessionTotalFmt'),
        checkNetwork: t('checkNetwork'),
        todayRecords: t('todayRecords'),
        noRecordsToday: t('noRecordsToday'),
        totalQtyFmt: t('totalQtyFmt'),
        collapse: t('collapse'),
        expand: t('expand'),
        colorLabel: t('colorLabel'),
        priceLabel: t('priceLabel'),
        sizeLabel: t('sizeLabel'),
        qtyLabel: t('qtyLabel'),
        handle: t('handle'),
        undoWord: t('undoWord'),
        noMoreBottom: t('noMoreBottom'),
        // 跨页共用词条
        refresh: i18n.t('common.refresh', lang),
        completed: i18n.t('common.completed', lang),
        success: i18n.t('common.success', lang),
        failed: i18n.t('common.failed', lang),
        rescan: i18n.t('common.rescan', lang),
        piece: i18n.t('common.piece', lang),
        loading: i18n.t('common.loading', lang),
        loadMore: i18n.t('common.loadMore', lang),
      },
      // 不合格原因大类是 picker 选项数组，必须按语言整体重建（不能只翻 data.t）
      // ⚠️ 这几个键在 mp.scanLogic.* 下（与 scanQuality 页共用同一套缺陷类别词条），
      //    不能用本页的 t()（那是 mp.scanHome.* 前缀）
      defectCategories: [
        i18n.t('mp.scanLogic.defectAppearance', lang),
        i18n.t('mp.scanLogic.defectSize', lang),
        i18n.t('mp.scanLogic.defectProcess', lang),
        i18n.t('mp.scanLogic.defectFunction', lang),
        i18n.t('mp.scanLogic.defectOther', lang),
      ],
    });
    // navigationBarTitleText 只能静态写死，标题必须运行时设置
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  // 业务处理器实例
  scanHandler: null,
  // 事件订阅取消函数
  unsubscribeEvents: null,

  // ==================== 历史记录（委托 HistoryHandler）====================

  /**
   * 创建分组键
   * @param {string} orderNo - 订单号
   * @param {string} progressStage - 工序名称
   * @returns {string} 分组键
   */
  _createGroupKey(orderNo, progressStage) {
    return HistoryHandler.groupScanRecords ? `${orderNo}_${progressStage}` : '';
  },

  /**
   * 分组扫码记录
   * @param {Array} records - 扫码记录数组
   * @returns {Array} 分组后的数组
   */
  _groupScanRecords(records) {
    return HistoryHandler.groupScanRecords(records);
  },

  /**
   * 合并分组历史
   * @param {Array} existing - 现有分组
   * @param {Array} newGroups - 新分组
   * @returns {Array} 合并后的分组
   */
  _mergeGroupedHistory(existing, newGroups) {
    return HistoryHandler.mergeGroupedHistory(existing, newGroups);
  },

  /**
   * 加载我的历史记录
   * @param {boolean} refresh - 是否刷新
   * @returns {Promise<void>} 无返回值
   */
  async loadMyHistory(refresh) {
    return HistoryHandler.loadMyHistory(this, refresh);
  },

  /**
   * 加载更多历史记录
   * @returns {void} 无返回值
   */
  loadMoreMyHistory() {
    HistoryHandler.loadMoreMyHistory(this);
  },

  /**
   * 切换分组展开/折叠
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  toggleGroupExpand(e) {
    HistoryHandler.toggleGroupExpand(this, e);
  },

  /**
   * 切换尺码明细展开/折叠
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  toggleSizeExpand(e) {
    HistoryHandler.toggleSizeExpand(this, e);
  },

  /**
   * 处理质检操作
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onHandleQuality(e) {
    HistoryHandler.onHandleQuality(this, e);
  },

  /**
   * 处理采购任务（已迁移到独立页面 pages/procurement/task-detail）
   * WXML: scan-history.wxml bindtap="onHandleProcurement"
   *
   * 修复：原路径 /pkg-procurement/pages/task/index 不存在导致静默失败
   * 现在从扫码历史分组中提取 orderNo/styleNo，直接跳转到采购详情页
   */
  onHandleProcurement(e) {
    const groupId = e.currentTarget.dataset.groupId;
    const recordIdx = e.currentTarget.dataset.recordIdx;
    const groupedHistory = (this.data.my && this.data.my.groupedHistory) || [];
    const group = groupedHistory.find((g) => g.id === groupId);
    if (!group) {
      toast.error(i18n.t(NS + 'recordNotFound', this._lang));
      return;
    }
    const orderNo = group.orderNo || '';
    const styleNo = group.styleNo || '';
    // 支持大货(orderNo)和样衣(patternProductionId)两种路径
    // ⚠️ '未知订单' 是 HistoryHandler 分组时的兜底**数据值**，不是文案，不能走语言包
    const hasOrderNo = orderNo && orderNo !== '未知订单';
    // 从分组内的扫码记录中查找 patternProductionId（样衣采购场景）
    let patternProductionId = group.patternProductionId || '';
    if (!patternProductionId && group.items) {
      for (let i = 0; i < group.items.length; i++) {
        const item = group.items[i];
        if (item.patternProductionId) {
          patternProductionId = item.patternProductionId;
          break;
        }
      }
    }
    if (!hasOrderNo && !patternProductionId) {
      toast.error(i18n.t(NS + 'missingOrderNo', this._lang));
      return;
    }
    const params = [];
    if (hasOrderNo) {
      params.push('orderNo=' + encodeURIComponent(orderNo));
    }
    if (patternProductionId) {
      params.push('patternProductionId=' + encodeURIComponent(patternProductionId));
    }
    params.push('styleNo=' + encodeURIComponent(styleNo));
    safeNavigate({
      url: '/pages/procurement/task-detail/index?' + params.join('&'),
    }).catch(() => {});
  },

  // ==================== 快捷导航（历史记录 / 当月记录） ====================

  /**
   * 跳转到历史记录页面
   * @returns {void} 无返回值
   */
  onGoToHistory() {
    safeNavigate({ url: '/pages/scan/history/index' }).catch(() => {
      // 导航失败忽略（通常是重复点击）
    });
  },

  /**
   * 跳转到当月记录页面
   * @returns {void} 无返回值
   */
  onGoToMonthly() {
    safeNavigate({ url: '/pages/payroll/payroll' }).catch(() => {
      // 导航失败忽略（通常是重复点击）
    });
  },

  // ==================== 退回重扫（委托 RescanHandler）====================

  /**
   * 点击退回重扫 — 跳转独立页面 /pages/scan/rescan/index
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onRescanRecord(e) {
    RescanHandler.onRescanRecord(this, e);
  },



  // ==================== 库存查询（委托 StockHandler）====================

  /**
   * 处理库存查询
   * @param {string} codeStr - 扫码字符串
   * @returns {Promise<void>} 无返回值
   */
  async handleStockQuery(codeStr) {
    this._ensureScanHandler();
    const qrParser = this.scanHandler ? this.scanHandler.qrParser : null;
    return StockHandler.handleStockQuery(this, codeStr, qrParser);
  },

  /**
   * 显示库存更新对话框
   * @param {string} skuCode - SKU代码
   * @returns {void} 无返回值
   */
  showStockUpdateDialog(skuCode) {
    StockHandler.showStockUpdateDialog(skuCode);
  },

  // ==================== 扫码结果确认页（委托 ScanResultHandler） ====================

  /**
   * 显示扫码结果确认页 — 跳转独立页面 /pages/scan/scan-result/index
   * @param {Object} data - 扫码结果数据
   * @returns {void} 无返回值
   */
  showScanResultConfirm(data) {
    ScanResultHandler.showScanResultConfirm(this, data);
  },

  // ==================== 确认弹窗（委托 ConfirmModalHandler） ====================

  /**
   * 显示确认弹窗 — 样板模式跳转 /pages/scan/pattern/index，普通模式跳转 /pages/scan/confirm/index
   * @param {Object} data - 弹窗数据
   * @returns {void} 无返回值
   */
  showConfirmModal(data) {
    ConfirmModalHandler.showConfirmModal(this, data);
  },



  // ==================== 质检/入库（委托 QualityHandler） ====================

  /**
   * 显示质检页面 — 跳转独立页面 /pages/scan/quality/index
   * @param {Object} detail - 质检数据
   * @returns {void} 无返回值
   */
  showQualityModal(detail) {
    QualityHandler.showQualityModal(this, detail);
  },

  // ==================== 撤销功能（委托 UndoHandler）====================

  /**
   * 启动撤销倒计时
   * @param {Object} record - 扫码记录
   * @returns {void} 无返回值
   */
  startUndoTimer(record) {
    UndoHandler.startUndoTimer(this, record);
  },

  /**
   * 停止撤销定时器
   * @returns {void} 无返回值
   */
  stopUndoTimer() {
    UndoHandler.stopUndoTimer(this);
  },

  /**
   * 执行撤销操作（WXML 绑定 bindtap="onUndoLast"）
   * @returns {Promise<void>} 无返回值
   */
  async handleUndo() {
    return UndoHandler.handleUndo(this);
  },

  /**
   * WXML bindtap="onUndoLast" 的别名（扫码结果卡片上的撤销按钮）
   * @returns {Promise<void>}
   */
  async onUndoLast() {
    return UndoHandler.handleUndo(this);
  },

  /**
   * 网络错误时「检查网络」按钮 — 重新扫码
   * WXML: scan-result.wxml bindtap="onCheckNetwork"
   */
  onCheckNetwork() {
    wx.showLoading({ title: i18n.t(NS + 'detecting', this._lang), mask: true });
    wx.getNetworkType({
      success: (res) => {
        wx.hideLoading();
        if (res.networkType === 'none' || res.networkType === 'unknown') {
          wx.showToast({ title: i18n.t(NS + 'networkUnavailable', this._lang), icon: 'none', duration: 2500 });
        } else {
          wx.showToast({ title: i18n.t(NS + 'networkRestored', this._lang), icon: 'success', duration: 1500 });
          this.onScan();
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: i18n.t(NS + 'detectFailed', this._lang), icon: 'none' });
      },
    });
  },

  /**
   * 历史记录列表中的撤回按钮（catchtap="onUndoHistoryRecord"）
   * 适用于1小时内、未参与工资结算、下一工序未扫码的记录
   * @param {Object} e - 事件对象，e.currentTarget.dataset.recordId
   */
  async onUndoHistoryRecord(e) {
    const recordId = e.currentTarget.dataset.recordId;
    if (!recordId) {
      require('./../../utils/uiHelper').toast.error(i18n.t(NS + 'missingRecordId', this._lang));
      return;
    }
    wx.showModal({
      title: i18n.t(NS + 'undoTitle', this._lang),
      content: i18n.t(NS + 'undoContent', this._lang),
      confirmText: i18n.t(NS + 'undoWord', this._lang),
      confirmColor: '#ff3b30',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t(NS + 'undoing', this._lang), mask: true });
        try {
          await require('./../../utils/api').production.undoScan({ recordId });
          require('./../../utils/uiHelper').toast.success(i18n.t(NS + 'undoSuccess', this._lang));
          // 刷新面板
          this.loadMyPanel(true);
          const { triggerDataRefresh } = require('./../../utils/eventBus');
          triggerDataRefresh('scan');
        } catch (err) {
          require('./../../utils/uiHelper').toast.error(
            i18n.tf(NS + 'undoFailedFmt', { msg: err.errMsg || err.message || i18n.t(NS + 'unknownError', this._lang) }, this._lang)
          );
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  // ==================== 历史记录 - 本地（委托 HistoryHandler）====================

  /**
   * 加载本地历史记录
   * @returns {void} 无返回值
   */
  loadLocalHistory() {
    HistoryHandler.loadLocalHistory(this);
  },

  /**
   * 添加到本地历史
   * @param {Object} record - 扫码记录
   * @returns {void} 无返回值
   */
  addToLocalHistory(record) {
    HistoryHandler.addToLocalHistory(this, record);
  },

  /**
   * 点击历史记录项
   * @param {Object} e - 事件对象
   * @returns {void} 无返回值
   */
  onTapHistoryItem(e) {
    HistoryHandler.onTapHistoryItem(this, e);
  },


  // ==================== 仓库选择（入库扫码时显示）====================

  /**
   * 点击仓库快捷选项 chip
   * @param {Object} e - 事件对象
   * @returns {void}
   */
  onWarehouseChipTap(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.warehouse === value) {
      this.setData({ warehouse: '', warehouseAreaId: '', warehouseLocationCode: '', locationOptions: [] });
      try { wx.setStorageSync('scan_pref_warehouse', ''); } catch (_) { /* 存储写入失败忽略 */ }
    } else {
      const areaId = (this._warehouseAreaMap && this._warehouseAreaMap[value]) || '';
      this.setData({ warehouse: value, warehouseAreaId: areaId, warehouseLocationCode: '', locationOptions: [] });
      try { wx.setStorageSync('scan_pref_warehouse', value); } catch (_) { /* 存储写入失败忽略 */ }
      if (areaId) { this._loadLocationOptions(areaId); }
    }
  },

  onWarehouseCodeInput(e) {
    const value = e.detail.value;
    const areaId = (this._warehouseAreaMap && this._warehouseAreaMap[value]) || '';
    this.setData({ warehouse: value, warehouseAreaId: areaId, warehouseLocationCode: '' });
    if (areaId) {
      this._loadLocationOptions(areaId);
    } else {
      this.setData({ locationOptions: [] });
    }
  },

  onWarehouseClear() {
    this.setData({ warehouse: '', warehouseAreaId: '', warehouseLocationCode: '', locationOptions: [] });
  },

  onLocationChipTap(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.warehouseLocationCode === value) {
      this.setData({ warehouseLocationCode: '' });
    } else {
      this.setData({ warehouseLocationCode: value });
    }
  },

  /* ═══ D-517：库位改可搜索选择器 ═══
     库位常有几十上百个，chip 平铺只能一路滚 —— 改成底部可搜索弹层（本地过滤已加载库位） */
  _openPickerByKey(e) {
    const key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || '';
    if (key !== 'location') return;
    this.setData({
      pickerKey: key,
      pickerTitle: i18n.t(NS + 'selectLocationTitle', this._lang),
      pickerValue: this.data.warehouseLocationCode || '',
      pickerOptions: (this.data.locationOptions || []).map(function (v) {
        return { label: String(v), value: String(v) };
      }).filter(function (o) { return o.value; }),
      pickerVisible: true,
    });
  },

  _onPickerSelectByKey(e) {
    const d = (e && e.detail) || {};
    if (this.data.pickerKey === 'location') {
      this.setData({ warehouseLocationCode: d.value || '' });
    }
  },

  onLocationClear() {
    this.setData({ warehouseLocationCode: '' });
  },

  onLocationCodeInput(e) {
    this.setData({ warehouseLocationCode: e.detail.value });
  },

  onManualSync() {
    this._flushOfflineQueue();
  },

  onPreviewCover(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },
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
