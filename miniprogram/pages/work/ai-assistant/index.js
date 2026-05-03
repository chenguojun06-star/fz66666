const api = require('../../../utils/api');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { parseChatReply } = require('./chat-parser');
const _uiHelper = require('../../../utils/uiHelper'); // toast reserved for future use
const { eventBus } = require('../../../utils/eventBus');

var TOOL_NAMES = {
  tool_query_production_progress: '生产进度', tool_order_edit: '订单编辑',
  tool_query_warehouse_stock: '库存查询', tool_finished_product_stock: '成品库存',
  tool_deep_analysis: '深度分析', tool_knowledge_search: '知识搜索',
  tool_material_receive: '物料收货', tool_finished_outbound: '成品出库',
  tool_quality_inbound: '质检入库', tool_finance_workflow: '财务审批',
  tool_smart_report: '智能报表', tool_delay_trend: '延期趋势',
  tool_root_cause_analysis: '根因分析', tool_whatif: '假设模拟',
  tool_action_executor: '执行操作', tool_procurement: '采购管理',
  tool_create_production_order: 'AI建单', tool_sample_loan: '样衣借调',
  tool_sample_stock: '样衣库存', tool_sample_workflow: '样衣流程',
  tool_query_style_info: '款式查询', tool_order_contact_urge: '催单',
  tool_scan_undo: '扫码撤回', tool_cutting_task_create: '创建裁剪',
  tool_bundle_split_transfer: '拆菲转派', tool_team_dispatch: '协同派单',
  tool_order_batch_close: '批量关单', tool_payroll_approve: '工资审批',
  tool_material_audit: '面辅料审核', tool_material_reconciliation: '物料对账',
  tool_shipment_reconciliation: '出货对账', tool_change_approval: '变更审批',
  tool_material_picking: '领料单', tool_material_calculation: '物料计算',
  tool_defective_board: '次品看板', tool_production_exception: '生产异常',
  tool_order_factory_transfer: '订单转厂', tool_style_template: '模板库',
  tool_warehouse_op_log: '仓库日志', tool_org_query: '组织架构',
};

function describeTool(name) {
  return TOOL_NAMES[name] || (name || '').replace(/^tool_/, '').replace(/_/g, '');
}

/**
 * 将 formData 中的数组字段转为 {value: true} 查找表。
 * 目的：避免在 WXML class 绑定里使用 (arr||[]).indexOf(v)（WeChat 编译器不支持括号后跟点）。
 * @param {object} formData
 * @returns {object} e.g. { colors: { red: true, blue: true } }
 */
function _buildSelectedSet(formData) {
  const result = {};
  Object.keys(formData || {}).forEach(function(k) {
    if (Array.isArray(formData[k])) {
      const lookup = {};
      formData[k].forEach(function(v) { lookup[v] = true; });
      result[k] = lookup;
    }
  });
  return result;
}

// 工厂工人快捷提问
const WORKER_PROMPTS = [
  { label: '内部资料: 扫码规范', text: '请给我内部资料：扫码规范', cmd: false },
  { label: '内部资料: 质检流程', text: '请给我内部资料：质检流程', cmd: false },
  { label: '内部资料: 入库流程', text: '请给我内部资料：入库流程', cmd: false },
  { label: '内部资料: 常见问题', text: '请给我内部资料：常见问题', cmd: false },
];

// 管理员/跟单员快捷指令（查询 + 操作两类）
const MANAGER_PROMPTS = [
  { label: '📋 下单', text: '帮我下单', cmd: true },
  { label: '👕 借调样衣', text: '帮我借调样衣', cmd: true },
  { label: '内部资料: 日报口径', text: '请给我内部资料：日报统计口径', cmd: false },
  { label: '内部资料: 逾期定义', text: '请给我内部资料：逾期定义', cmd: false },
  { label: '内部资料: 采购流程', text: '请给我内部资料：采购流程', cmd: false },
  { label: '内部资料: 返修流程', text: '请给我内部资料：返修流程', cmd: false },
];

const MAX_MESSAGES = 30;

function buildTextSegments(text) {
  if (!text) return null;
  const re = /\b(PO\d{8,15})\b/g;
  if (!re.test(text)) return null;
  re.lastIndex = 0;
  const segs = [];
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ content: text.slice(last, m.index), isOrder: false, orderNo: '' });
    segs.push({ content: m[0], isOrder: true, orderNo: m[0] });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ content: text.slice(last), isOrder: false, orderNo: '' });
  return segs;
}

Page({
  data: {
    messages: [],
    visibleMessages: [],
    inputText: '',
    sending: false,
    streamingText: '',
    streamingTool: '',
    quickPrompts: WORKER_PROMPTS,
    conversationId: '',
    isManager: false,
    dynamicSuggestions: [],
  },

  onLoad() {
    // 隐私合规：监听隐私弹窗事件
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', (resolve) => {
        try {
          var dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') dialog.showDialog(resolve);
        } catch (_) { /* dialog may not exist on this page, intentional no-op */ }
      });
    }
    const isManager = isAdminOrSupervisor();
    const conversationId = 'mp_' + Date.now();
    const welcomeId = conversationId + '_w';
    const welcomeText = isManager
      ? '你好！这里是小云帮助中心。'
      : '你好！这里是小云帮助中心。';
    var initMsgs = [{ id: welcomeId, role: 'ai', text: welcomeText }];
    this.setData({
      conversationId,
      isManager,
      quickPrompts: isManager ? MANAGER_PROMPTS : WORKER_PROMPTS,
      messages: initMsgs,
      visibleMessages: initMsgs,
    });
    if (!(wx.getStorageSync('auth_token') || '')) return;
    this._loadDynamicSuggestions();
  },

  onInputChange(e) {
    this.setData({ inputText: e.detail.value });
  },

  onQuickPrompt(e) {
    const { text, cmd } = e.currentTarget.dataset;
    // 指令型快捷键只填入输入框（需用户补充订单号），查询型直接发送
    if (cmd) {
      this.setData({ inputText: text });
    } else {
      this.setData({ inputText: text });
      this._send(text);
    }
  },

  onSend() {
    const text = String(this.data.inputText || '').trim();
    if (!text) return;
    this.setData({ inputText: '' });
    if (this.data.sending) {
      this._abortStream();
    }
    this._send(text);
  },

  /** 预览图片 */
  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    if (src) wx.previewImage({ current: src, urls: [src] });
  },

  async _send(text) {
    this._appendMsg({ role: 'user', text });
    const loadingId = this._appendMsg({ role: 'ai', text: '', loading: true });
    this.setData({ sending: true, streamingText: '', streamingTool: '' });

    var self = this;
    var accumulatedText = '';
    var streamStarted = false;
    var _streamPendingUpdate = false;
    var _streamUpdateTimer = null;
    var chatContext = this.data.isManager ? 'manager_assistant' : 'worker_assistant';

    try {
      var requestTask = api.intelligence.aiAdvisorChatStream(
        {
          question: text,
          pageContext: chatContext,
          conversationId: this.data.conversationId,
        },
        function (event) {
          streamStarted = true;
          if (event.type === 'thinking') {
            // 思考中——无需展示状态条
          } else if (event.type === 'tool_call') {
            // 工具调用中——无需展示状态条
          } else if (event.type === 'tool_result') {
            // 工具结果——无需展示状态条
          } else if (event.type === 'answer') {
            var content = String(event.data.content || '');
            if (content) {
              accumulatedText += content;
              // 不实时刷 UI，等全文到齐后一次性展示
            }
          }
        },
        function () {
          if (_streamUpdateTimer) { clearTimeout(_streamUpdateTimer); _streamUpdateTimer = null; }
          _streamPendingUpdate = false;
          self._streamTask = null;
          var rawText = accumulatedText || '抱歉，我暂时无法回答这个问题。';
          self._updateMsg(loadingId, rawText);
          self.setData({ sending: false, streamingText: '', streamingTool: '' });
          self._scrollToBottom();
        },
        async function (err) {
          console.warn('[AI-Page] SSE failed, fallback:', err);
          self._streamTask = null;
          if (streamStarted && accumulatedText) {
            self._updateMsg(loadingId, accumulatedText);
            self.setData({ sending: false, streamingText: '', streamingTool: '' });
            self._scrollToBottom();
            return;
          }
          try {
            var reply;
            if (self.data.isManager) {
              try {
                var res = await api.intelligence.naturalLanguageExecute({ text: text, conversationId: self.data.conversationId });
                reply = (res && (res.message || res.reply || res.content)) || '操作完成';
              } catch (nlErr) {
                var fbRes = await api.intelligence.aiAdvisorChat({ question: text, conversationId: self.data.conversationId, context: 'manager_assistant' });
                reply = (fbRes && (fbRes.reply || fbRes.content || fbRes.message)) || '（无回应）';
              }
            } else {
              var res2 = await api.intelligence.aiAdvisorChat({ question: text, conversationId: self.data.conversationId, context: 'worker_assistant' });
              reply = (res2 && (res2.reply || res2.content || res2.message)) || '（无回应）';
            }
            self._updateMsg(loadingId, reply);
          } catch (syncErr) {
            self._updateMsg(loadingId, '服务暂时无法响应，请稍后再试。');
          } finally {
            self.setData({ sending: false, streamingText: '', streamingTool: '' });
            self._scrollToBottom();
          }
        }
      );
      this._streamTask = requestTask;
    } catch (err) {
      console.error('[AI-Page] send error:', err);
      var errText = (err && err.errMsg && err.errMsg !== 'undefined') ? err.errMsg : (err && err.message && err.message !== 'undefined') ? err.message : '';
      this._updateMsg(loadingId, errText || '服务暂时无法响应，请稍后再试。');
      this.setData({ sending: false, streamingText: '', streamingTool: '' });
      this._scrollToBottom();
    }
  },

  /** 点击 ActionCard 按钮 */
  onCardAction(e) {
    const { type, path, orderid, cardtitle } = e.currentTarget.dataset;
    if (type === 'navigate' && path) {
      wx.navigateTo({ url: path, fail: () => wx.showToast({ title: '页面不存在', icon: 'none' }) });
      return;
    }
    // 其余操作类型（mark_urgent / remove_urgent / send_notification / urge_order）→ 作为指令发送到对话
    const cmdMap = {
      mark_urgent: '把订单标记为紧急',
      remove_urgent: '取消订单紧急标记',
      send_notification: '通知相关人员跟进订单',
      urge_order: '催促工厂跟进订单',
      view_cutting: '打印子菲号',
    };
    const label = cmdMap[type] || ('执行操作：' + (cardtitle || type));
    const text = orderid ? (label + ' ' + orderid) : label;
    this.setData({ inputText: '' });
    this._send(text);
  },

  onTeamCardNavigate(e) {
    const { path } = e.currentTarget.dataset;
    if (path) wx.navigateTo({ url: path, fail: () => wx.showToast({ title: '页面不存在', icon: 'none' }) });
  },

  _findWizardCard(msgid, wi) {
    var msg = this.data.messages.find(function (m) { return m.id === msgid; });
    if (!msg || !msg.stepWizardCards || !msg.stepWizardCards[wi]) return null;
    return { msg: msg, wiz: msg.stepWizardCards[wi] };
  },

  _updateWizardCard(msgid, wi, updater) {
    var found = this._findWizardCard(msgid, wi);
    if (!found) return;
    var wiz = found.wiz;
    updater(wiz);
    var key = 'messages[' + this.data.messages.indexOf(found.msg) + '].stepWizardCards[' + wi + ']';
    this.setData({
      [key]: wiz,
    });
    var vIdx = this.data.visibleMessages.findIndex(function (m) { return m.id === msgid; });
    if (vIdx >= 0) {
      this.setData({ ['visibleMessages[' + vIdx + '].stepWizardCards[' + wi + ']']: wiz });
    }
  },

  _recalcCanNext(wiz) {
    var step = wiz.steps && wiz.steps[wiz._currentStep];
    if (!step) { wiz._canNext = false; return; }
    wiz._canNext = step.fields.every(function (f) {
      if (!f.required) return true;
      var val = wiz._formData[f.key];
      if (f.inputType === 'multi_select') return Array.isArray(val) && val.length > 0;
      return val !== undefined && val !== null && val !== '';
    });
  },

  onWizardSelect(e) {
    var ds = e.currentTarget.dataset;
    var self = this;
    this._updateWizardCard(ds.msgid, ds.wi, function (wiz) {
      wiz._formData[ds.key] = ds.value;
      self._recalcCanNext(wiz);
    });
  },

  onWizardMultiSelect(e) {
    var ds = e.currentTarget.dataset;
    var self = this;
    this._updateWizardCard(ds.msgid, ds.wi, function (wiz) {
      var cur = wiz._formData[ds.key] || [];
      var idx = cur.indexOf(ds.value);
      if (idx >= 0) {
        cur = cur.filter(function (v) { return v !== ds.value; });
      } else {
        cur = cur.concat([ds.value]);
      }
      wiz._formData[ds.key] = cur;
      // 同步维护 _formDataSelectedSet，避免 WXML class 绑定里出现 indexOf（method call 编译报错）
      wiz._formDataSelectedSet = wiz._formDataSelectedSet || {};
      wiz._formDataSelectedSet[ds.key] = _buildSelectedSet({ [ds.key]: cur })[ds.key] || {};
      self._recalcCanNext(wiz);
    });
  },

  onWizardInput(e) {
    var ds = e.currentTarget.dataset;
    var self = this;
    this._updateWizardCard(ds.msgid, ds.wi, function (wiz) {
      wiz._formData[ds.key] = e.detail.value;
      self._recalcCanNext(wiz);
    });
  },

  onWizardDate(e) {
    var ds = e.currentTarget.dataset;
    var self = this;
    this._updateWizardCard(ds.msgid, ds.wi, function (wiz) {
      wiz._formData[ds.key] = e.detail.value;
      self._recalcCanNext(wiz);
    });
  },

  onWizardPrev(e) {
    var ds = e.currentTarget.dataset;
    var self = this;
    this._updateWizardCard(ds.msgid, ds.wi, function (wiz) {
      if (wiz._currentStep > 0) wiz._currentStep--;
      self._recalcCanNext(wiz);
    });
  },

  onWizardNext(e) {
    var ds = e.currentTarget.dataset;
    var self = this;
    this._updateWizardCard(ds.msgid, ds.wi, function (wiz) {
      if (!wiz._canNext) return;
      if (wiz._currentStep === wiz.steps.length - 1) {
        wiz._submitted = true;
        var cmd = wiz.submitCommand || '';
        var formData = wiz._formData;
        var text = cmd;
        var paramParts = [];
        Object.keys(formData).forEach(function (k) {
          var v = formData[k];
          if (Array.isArray(v)) {
            paramParts.push(k + '=' + v.join(','));
          } else {
            paramParts.push(k + '=' + v);
          }
        });
        if (paramParts.length > 0) text += ' ' + paramParts.join(' ');
        self.setData({ inputText: '' });
        self._send(text);
      } else {
        wiz._currentStep++;
        self._recalcCanNext(wiz);
      }
    });
  },

  onSegmentTap(e) {
    const { type, orderno } = e.currentTarget.dataset;
    if (type === 'order' && orderno) this._send('查询订单 ' + orderno);
  },

  _appendMsg(msg) {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const entry = { ...msg, id };
    if (msg.imageUrl) entry.imageUrl = msg.imageUrl;
    const messages = [...this.data.messages, entry];
    if (messages.length > MAX_MESSAGES) messages.shift();
    var MAX_VISIBLE = 30;
    var visibleMessages = messages.length > MAX_VISIBLE ? messages.slice(messages.length - MAX_VISIBLE) : messages;
    this.setData({ messages, visibleMessages });
    this._scrollToBottom();
    return id;
  },

  _updateMsg(id, rawText) {
    const parsed = parseChatReply(rawText);
    var stepWizardCards = (parsed.stepWizardCards || []).map(function (w) {
      const formData = w.prefilledData ? Object.assign({}, w.prefilledData) : {};
      return Object.assign({}, w, {
        _currentStep: 0,
        _formData: formData,
        // 预计算 _formDataSelectedSet，避免 WXML class 绑定里用 (arr || []).indexOf()（method call 编译报错）
        _formDataSelectedSet: _buildSelectedSet(formData),
        _canNext: false,
        _submitted: false,
      });
    });
    stepWizardCards.forEach(function (wiz) {
      var firstStep = wiz.steps && wiz.steps[0];
      if (firstStep) {
        wiz._canNext = firstStep.fields.every(function (f) {
          if (!f.required) return true;
          var val = wiz._formData[f.key];
          if (f.inputType === 'multi_select') return Array.isArray(val) && val.length > 0;
          return val !== undefined && val !== null && val !== '';
        });
      }
    });
    const messages = this.data.messages.map(m =>
      m.id === id ? {
        ...m,
        text: parsed.displayText,
        textSegments: buildTextSegments(parsed.displayText),
        // 预计算 _cardType，避免 WXML class 绑定里出现 actions[0].type（bracket-dot 编译报错）
        actionCards: (parsed.actionCards || []).map(function(card) {
          var t = card.actions && card.actions[0] && card.actions[0].type;
          return Object.assign({}, card, {
            _cardType: t === 'mark_urgent' ? 'card-danger'
                     : t === 'send_notification' ? 'card-warning'
                     : 'card-normal'
          });
        }),
        charts: parsed.charts,
        teamStatusCards: parsed.teamStatusCards,
        bundleSplitCards: parsed.bundleSplitCards,
        stepWizardCards: stepWizardCards,
        insightCards: parsed.insightCards || [],
        clarificationHints: parsed.clarificationHints || [],
        loading: false,
      } : m
    );
    var MAX_VISIBLE = 30;
    var visibleMessages = messages.length > MAX_VISIBLE ? messages.slice(messages.length - MAX_VISIBLE) : messages;
    this.setData({ messages, visibleMessages });
  },

  _scrollToBottom() {
    wx.pageScrollTo({ scrollTop: 99999, duration: 150 });
  },

  _loadDynamicSuggestions() {
    var self = this;
    api.intelligence.getMyPendingTaskSummary().then(function (res) {
      var data = res;
      if (!data) return;
      var suggestions = [];
      if (data.overdueOrderCount > 0) {
        suggestions.push({ label: '🚨 ' + data.overdueOrderCount + '个逾期', text: '当前有哪些逾期订单？帮我分析一下' });
      }
      if (data.qualityTaskCount > 0) {
        suggestions.push({ label: '📋 ' + data.qualityTaskCount + '个待质检', text: '有哪些待质检的任务？' });
      }
      if (data.materialShortageCount > 0) {
        suggestions.push({ label: '⚠️ 面料缺口', text: '当前有哪些面料缺口预警？' });
      }
      if (suggestions.length > 0) {
        self.setData({ dynamicSuggestions: suggestions });
      }
    }).catch(function (e) { console.warn('[AI-Assistant] 待办任务加载失败:', e); });
  },

  _abortStream() {
    if (this._streamTask) {
      try { this._streamTask.abort(); } catch (_e) { /* abort may throw if already done */ }
      this._streamTask = null;
    }
  },

  onUnload() {
    this._abortStream();
    if (this._unsubPrivacy) {
      this._unsubPrivacy();
      this._unsubPrivacy = null;
    }
  },
});
