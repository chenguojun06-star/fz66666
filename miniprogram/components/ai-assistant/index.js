const api = require('../../utils/api.js');
const bellTaskLoader = require('./bellTaskLoader.js');
const bellTaskActions = require('./bellTaskActions.js');

// 简单markdown转html，供rich-text渲染
function mdToHtml(text) {
  if (!text) return '';
  var t = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  var lines = t.split('\n');
  var result = [];
  var inList = false;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var trimmed = l.trim();
    if (trimmed.match(/^[-*]\s/)) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push('<li>' + trimmed.replace(/^[-*]\s/, '') + '</li>');
    } else if (trimmed.match(/^\d+[\.\\)]\s/)) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push('<li>' + trimmed.replace(/^\d+[\.\\)]\s/, '') + '</li>');
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      if (l) result.push('<p>' + (trimmed || '') + '</p>');
    }
  }
  if (inList) result.push('</ul>');
  return result.join('');
}

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

function parseAiCards(text) {
  var actions = [];
  var insightCards = [];
  var clarificationHints = [];
  var charts = [];
  var stepWizardCards = [];

  function safeParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }
  function validateCard(item) {
    return item && typeof item === 'object' && item.title;
  }

  var acMatch = text.match(/【ACTIONS】([\s\S]*?)【\/ACTIONS】/);
  if (acMatch) {
    text = text.replace(acMatch[0], '');
    var acData = safeParse(acMatch[1]);
    if (Array.isArray(acData)) actions = acData.filter(validateCard);
    else if (acData && acData.actions) actions = acData.actions;
  }

  var insightRe = /【INSIGHT_CARDS】([\s\S]*?)【\/INSIGHT_CARDS】/g;
  var m;
  while ((m = insightRe.exec(text)) !== null) {
    var ip = safeParse(m[1]);
    if (Array.isArray(ip)) insightCards = insightCards.concat(ip.filter(validateCard));
    else if (validateCard(ip)) insightCards.push(ip);
  }
  text = text.replace(/【INSIGHT_CARDS】[\s\S]*?【\/INSIGHT_CARDS】/g, '');

  var clarifRe = /【CLARIFICATION】([\s\S]*?)【\/CLARIFICATION】/g;
  while ((m = clarifRe.exec(text)) !== null) {
    var clp = safeParse(m[1]);
    if (Array.isArray(clp)) clarificationHints = clarificationHints.concat(clp.filter(function(x) { return typeof x === 'string'; }));
  }
  text = text.replace(/【CLARIFICATION】[\s\S]*?【\/CLARIFICATION】/g, '');

  var chartRe = /【CHART】([\s\S]*?)【\/CHART】/g;
  while ((m = chartRe.exec(text)) !== null) {
    var cp = safeParse(m[1]);
    if (Array.isArray(cp)) charts = charts.concat(cp.filter(validateCard));
    else if (validateCard(cp)) charts.push(cp);
  }
  text = text.replace(/【CHART】[\s\S]*?【\/CHART】/g, '');

  var wizRe = /【STEP_WIZARD】([\s\S]*?)【\/STEP_WIZARD】/g;
  while ((m = wizRe.exec(text)) !== null) {
    var wp = safeParse(m[1]);
    if (Array.isArray(wp)) stepWizardCards = stepWizardCards.concat(wp);
    else if (wp) stepWizardCards.push(wp);
  }
  text = text.replace(/【STEP_WIZARD】[\s\S]*?【\/STEP_WIZARD】/g, '');

  text = text.replace(/【TEAM_STATUS】[\s\S]*?【\/TEAM_STATUS】/g, '');
  text = text.replace(/【BUNDLE_SPLIT】[\s\S]*?【\/BUNDLE_SPLIT】/g, '');
  text = text.replace(/```ACTIONS_JSON\s*\n[\s\S]*?\n```/g, '');

  return { text: text.trim(), actions: actions, insightCards: insightCards, clarificationHints: clarificationHints, charts: charts, stepWizardCards: stepWizardCards };
}

Component({
  properties: {
    visible: { type: Boolean, value: true },
    noticeCount: { type: Number, value: 0 },
  },
  data: {
    isOpen: false,
    inputValue: '',
    messages: [],
    visibleMessages: [],
    isLoading: false,
    streamingText: '',
    streamingTool: '',
    scrollTo: '',
    currentTab: 'chat',
    totalTasks: 0,
    qualityTasks: [], cuttingTasks: [],
    purchaseTasks: [], repairTasks: [], overdueOrders: [],
    overdueSummary: null, pendingUsers: [], pendingRegistrations: [],
    timeoutReminders: [], isAdmin: false, isTenantOwner: false,
    isManager: false, taskLoading: false,
    triggerX: 0, triggerY: 110, edgeSide: 'right',
    isDragging: false, dragStartX: 0, dragStartY: 0,
    dragStartTriggerX: 0, dragStartTriggerY: 0,
    screenWidth: 375, screenHeight: 667,
    pageSuggestions: [],
    conversationId: '',
    dynamicSuggestions: [],
  },
  lifetimes: {
    attached() {
      setTimeout(() => {
        if (!this.data) return;
        let userName = '';
        let isManager = false;
        try {
          const userInfo = wx.getStorageSync('user_info') || wx.getStorageSync('userInfo') || {};
          if (userInfo.realName) userName = userInfo.realName;
          else if (userInfo.username) userName = userInfo.username;
          else if (userInfo.nickname) userName = userInfo.nickname;
          const role = String(userInfo.role || userInfo.roleCode || '').toLowerCase();
          isManager = userInfo.isTenantOwner === true ||
            ['admin', 'super_admin', 'manager', 'supervisor',
              'tenant_admin', 'tenant_manager', 'merchandiser'].some(r => role.includes(r));
        } catch (err) { console.error('get user info error', err); }

        const greeting = userName
          ? 'Hi ' + userName + '，这里是小云帮助中心。'
          : 'Hi，这里是小云帮助中心。';

        const sysInfo = wx.getWindowInfo();
        const sw = sysInfo.windowWidth || 375;
        const sh = sysInfo.windowHeight || 667;
        let tx = sw - 20; let ty = 110; let edge = 'right';
        try {
          const saved = wx.getStorageSync('ai_trigger_position');
          if (saved) {
            edge = saved.edge || 'right';
            tx = edge === 'left' ? -30 : sw - 20;
            ty = Math.max(40, Math.min(saved.y != null ? saved.y : ty, sh - 60));
          }
        } catch (_e) { /* ignore invalid saved trigger position */ }

        var conversationId = 'mp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        var savedMessages = [];
        try {
          savedMessages = wx.getStorageSync('ai_chat_history') || [];
          if (!Array.isArray(savedMessages) || savedMessages.length === 0) savedMessages = [];
        } catch (_e) { /* ignore unreadable chat history */ }

        var initMsgs = savedMessages.length > 0 ? savedMessages : [{
          id: Date.now(), role: 'ai', content: greeting, richContent: mdToHtml(greeting),
        }];
        this._setMessages(initMsgs, {
          isManager, triggerX: tx, triggerY: ty, edgeSide: edge,
          conversationId: conversationId,
        });
        this._screenWidth = sw;
        this._screenHeight = sh;
        this._loadDynamicSuggestions();
      }, 0);
    },
  },
  ready() {
    this.boundLoadTasks = this.loadTasks.bind(this);
    const app = getApp();
    if (app && app.eventBus) {
      app.eventBus.on('tasksUpdated', this.boundLoadTasks);
    }
  },
  pageLifetimes: {
    show() {
      var now = Date.now();
      if (!this._lastLoadTime || now - this._lastLoadTime > 30000) {
        this._lastLoadTime = now;
        setTimeout(() => this.loadTasks(), 0);
      }
      this._refreshPageSuggestions();
      this._loadDynamicSuggestions();
      // 修复：tabBar页面常驻不销毁，attached()只执行一次。
      // 用户在其他页面拖动按钮后，当前页面实例不会感知到 storage 变化。
      // 每次页面 show 时主动同步一次位置，确保所有页面保持一致。
      try {
        const saved = wx.getStorageSync('ai_trigger_position');
        if (saved) {
          const sw = this._screenWidth || 375;
          const sh = this._screenHeight || 667;
          const edge = saved.edge || 'right';
          const tx = edge === 'left' ? -30 : sw - 20;
          const ty = Math.max(40, Math.min(saved.y != null ? saved.y : this.data.triggerY, sh - 60));
          if (ty !== this.data.triggerY || edge !== this.data.edgeSide) {
            this.setData({ triggerX: tx, triggerY: ty, edgeSide: edge });
          }
        }
      } catch (_e) { /* ignore invalid stored trigger position on show */ }
    },
  },
  detached() {
    this._cancelIdleSnap();
    this._abortStream();
    const app = getApp();
    if (this.boundLoadTasks && app && app.eventBus) {
      app.eventBus.off('tasksUpdated', this.boundLoadTasks);
    }
  },

  methods: {
    _setMessages(msgs, extra) {
      var MAX_VISIBLE = 30;
      var visible = msgs.length > MAX_VISIBLE ? msgs.slice(msgs.length - MAX_VISIBLE) : msgs;
      var data = { messages: msgs, visibleMessages: visible };
      if (extra) Object.assign(data, extra);
      this.setData(data);
    },

    switchTab(e) {
      this.setData({ currentTab: e.currentTarget.dataset.tab });
    },

    onTriggerTouchStart(e) {
      const touch = e.touches[0];
      this._touchStartTime = Date.now();
      this._isDragging = false;
      this._dragStartX = touch.clientX;
      this._dragStartY = touch.clientY;
      this._dragStartTriggerX = this.data.triggerX;
      this._dragStartTriggerY = this.data.triggerY;
    },
    onTriggerTouchMove(e) {
      const touch = e.touches[0];
      const dx = touch.clientX - this._dragStartX;
      const dy = touch.clientY - this._dragStartY;
      if (!this._isDragging && Math.abs(dx) + Math.abs(dy) < 5) return;
      const sw = this._screenWidth;
      const sh = this._screenHeight;
      let nx = this._dragStartTriggerX + dx;
      let ny = this._dragStartTriggerY + dy;
      nx = Math.max(-30, Math.min(nx, sw - 20));
      ny = Math.max(40, Math.min(ny, sh - 60));
      this.setData({ triggerX: nx, triggerY: ny });
      this._isDragging = true;
    },
    onTriggerTouchEnd() {
      if (!this._isDragging) {
        const willOpen = !this.data.isOpen;
        this._cancelIdleSnap();
        this.setData({ isOpen: willOpen });
        if (willOpen) { this._snapToVisible(); this.scrollToBottom(); }
        else { this._startIdleSnap(); }
        return;
      }
      const sw = this._screenWidth;
      const midX = this.data.triggerX + 25;
      const edge = midX < sw / 2 ? 'left' : 'right';
      const snapX = edge === 'left' ? -30 : sw - 20;
      this.setData({ triggerX: snapX, edgeSide: edge });
      this._isDragging = false;
      try { wx.setStorageSync('ai_trigger_position', { x: snapX, y: this.data.triggerY, edge }); } catch (_e) { /* ignore storage write failure */ }
      if (!this.data.isOpen) this._startIdleSnap();
    },
    _snapToVisible() {
      const sw = this.data.screenWidth;
      const snapX = this.data.edgeSide === 'left' ? 0 : sw - 50;
      this.setData({ triggerX: snapX });
    },
    _cancelIdleSnap() {
      if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
    },
    _startIdleSnap() {
      this._cancelIdleSnap();
      const sw = this.data.screenWidth;
      const snapX = this.data.edgeSide === 'left' ? -30 : sw - 20;
      this._idleTimer = setTimeout(() => { this.setData({ triggerX: snapX }); this._idleTimer = null; }, 3000);
    },

    _refreshPageSuggestions() {
      try {
        const pages = getCurrentPages();
        const currentPage = pages.length > 0 ? pages[pages.length - 1] : null;
        const route = currentPage ? (currentPage.route || '') : '';
        let suggestions = [];
        if (route.includes('scan')) {
          suggestions = [
            { icon: 'icon-search', label: '扫码问题', question: '扫码提示重复怎么处理？' },
            { icon: 'icon-package', label: '菲号查询', question: '帮我查一下当前菲号的扫码记录' },
            { icon: 'icon-stats', label: '工序进展', question: '当前工序完成了多少件？' },
          ];
        } else if (route.includes('payroll')) {
          suggestions = [
            { icon: 'icon-stats', label: '工资明细', question: '帮我查一下我这个月的工资明细' },
            { icon: 'icon-search', label: '计件汇总', question: '我最近一周的计件数据是多少？' },
          ];
        } else if (route.includes('warehouse') || route.includes('finished')) {
          suggestions = [
            { icon: 'icon-package', label: '库存查询', question: '当前库存有多少？有没有低库存预警？' },
            { icon: 'icon-search', label: '入库记录', question: '帮我查一下最近的入库记录' },
          ];
        } else if (route.includes('order')) {
          suggestions = [
            { icon: 'icon-package', label: '订单进度', question: '帮我查一下订单的生产进度' },
            { icon: 'icon-alert', label: '逾期订单', question: '有没有逾期的订单？' },
          ];
        } else if (route.includes('bundle-split')) {
          suggestions = [
            { icon: 'icon-search', label: '分菲查询', question: '当前分菲号的拆分明细是什么？' },
          ];
        }
        this.setData({ pageSuggestions: suggestions });
      } catch (err) {
        this.setData({ pageSuggestions: [] });
      }
    },

    _loadDynamicSuggestions() {
      // 未登录或 token 不存在时跳过，避免触发 401 请求
      if (!(wx.getStorageSync('auth_token') || '')) return;
      var self = this;
      api.intelligence.getMyPendingTaskSummary().then(function (res) {
        var data = res && res.data ? res.data : res;
        if (!data) return;
        var suggestions = [];
        if (data.overdueOrderCount > 0) {
          suggestions.push({ icon: 'icon-alert', label: '🚨 ' + data.overdueOrderCount + '个逾期', question: '当前有哪些逾期订单？帮我分析一下' });
        }
        if (data.qualityTaskCount > 0) {
          suggestions.push({ icon: 'icon-clipboard', label: '📋 ' + data.qualityTaskCount + '个待质检', question: '有哪些待质检的任务？' });
        }
        if (data.materialShortageCount > 0) {
          suggestions.push({ icon: 'icon-alert', label: '⚠️ 面料缺口', question: '当前有哪些面料缺口预警？' });
        }
        if (suggestions.length > 0) {
          self.setData({ dynamicSuggestions: suggestions });
        }
      }).catch(function (e) { console.warn('[XiaoYun] 待办任务加载失败:', e); });
    },

    _saveChatHistory() {
      try {
        var msgs = this.data.messages.slice(-20);
        wx.setStorageSync('ai_chat_history', msgs);
      } catch (_e) { /* ignore chat history save failure */ }
    },

    _abortStream() {
      if (this._streamTask) {
        try { this._streamTask.abort(); } catch (_e) { /* ignore abort failure */ }
        this._streamTask = null;
      }
    },

    async loadTasks() {
      // 未登录或 token 不存在时跳过，避免在登录前触发 8 个并发 401 请求
      if (!(wx.getStorageSync('auth_token') || '')) return;
      if (this.data.taskLoading) return;
      this.setData({ taskLoading: true });
      try {
        const mockCtx = {
          data: { loading: false },
          setData: (newData) => {
            if (newData.totalCount !== undefined) {
              this.setData({
                qualityTasks: newData.qualityTasks || [],
                cuttingTasks: newData.cuttingTasks || [],
                purchaseTasks: newData.procurementTasks || [],
                repairTasks: newData.repairTasks || [],
                overdueOrders: newData.overdueOrders || [],
                overdueSummary: newData.overdueSummary || null,
                pendingUsers: newData.pendingUsers || [],
                pendingRegistrations: newData.pendingRegistrations || [],
                timeoutReminders: newData.timeoutReminders || [],
                isAdmin: newData.isAdmin || false,
                isTenantOwner: newData.isTenantOwner || false,
                totalTasks: newData.totalCount || 0,
              });
            }
          },
        };
        await bellTaskLoader.loadAllTasks(mockCtx);
      } catch (err) { console.error('[AiAssistant] loadTasks error', err); }
      finally { this.setData({ taskLoading: false }); }
    },

    handleQualityTask(e) { const t = e.currentTarget.dataset.item; if (!t) return; this.setData({ isOpen: false }); bellTaskActions.handleQualityTask(t); },
    handleCuttingTask(e) { const t = e.currentTarget.dataset.item; if (!t) return; this.setData({ isOpen: false }); bellTaskActions.handleCuttingTask(t); },
    handleWarehouseTask(e) { const t = e.currentTarget.dataset.item; if (!t) return; this.setData({ isOpen: false }); bellTaskActions.handleProcurementTask(t); },
    handlePurchaseTask(e) { const t = e.currentTarget.dataset.item; if (!t) return; this.setData({ isOpen: false }); bellTaskActions.handleProcurementTask(t); },
    handleRepairTask(e) { const t = e.currentTarget.dataset.item; if (!t) return; this.setData({ isOpen: false }); bellTaskActions.handleRepairTask(t); },
    handleOverdueOrder(e) { const t = e.currentTarget.dataset.item; if (!t) return; this.setData({ isOpen: false }); bellTaskActions.handleOverdueOrder(t); },
    onApproveUser(e) { bellTaskActions.onApproveUser(this, e); },
    onApproveRegistration(e) { bellTaskActions.onApproveRegistration(this, e); },
    handleReminderTask(e) { const t = e.currentTarget.dataset.item; if (!t) return; this.setData({ isOpen: false }); bellTaskActions.handleReminderTask(t); },

    toggleChat() {
      const willOpen = !this.data.isOpen;
      this._cancelIdleSnap();
      this.setData({ isOpen: willOpen });
      if (willOpen) { this._snapToVisible(); this._refreshPageSuggestions(); this.scrollToBottom(); }
      else { this._startIdleSnap(); }
    },
    autoAsk(e) {
      const question = e.currentTarget.dataset.question;
      if (question) { this.setData({ inputValue: question }, () => { this.sendMessage(); }); }
    },
    onInput(e) { this.setData({ inputValue: e.detail.value }); },

    async sendMessage() {
      var text = this.data.inputValue.trim();
      if (!text || this.data.isLoading) return;

      this.setData({ inputValue: '' });

      var userMsg = {
        id: Date.now(), role: 'user',
        content: text,
      };
      this._setMessages([].concat(this.data.messages, [userMsg]), { isLoading: true, streamingText: '', streamingTool: '' });
      this.scrollToBottom();

      try {
        var chatContext = this.data.isManager ? 'manager_assistant' : 'worker_assistant';
        var streamPayload = {
          question: text,
          pageContext: chatContext,
          conversationId: this.data.conversationId,
        };

        var self = this;
        var accumulatedText = '';
        var streamStarted = false;
        var pendingFollowUpActions = null;
        var _streamPendingUpdate = false;
        var _streamUpdateTimer = null;

        var aiMsgId = Date.now() + 1;

        var requestTask = api.intelligence.aiAdvisorChatStream(
          streamPayload,
          function (event) {
            streamStarted = true;
            if (event.type === 'thinking') {
              self.setData({ streamingTool: '小云正在整理思路…' });
            } else if (event.type === 'tool_call') {
              var toolName = describeTool(String(event.data.tool || ''));
              self.setData({ streamingTool: '正在处理：' + toolName + '…' });
            } else if (event.type === 'tool_result') {
              var tn = describeTool(String(event.data.tool || ''));
              if (event.data.success) {
                self.setData({ streamingTool: tn + ' 已完成，继续整理…' });
              } else {
                self.setData({ streamingTool: tn + ' 未成功，重新组织…' });
              }
            } else if (event.type === 'answer') {
              var content = String(event.data.content || '');
              if (content) {
                accumulatedText += content;
                if (!_streamPendingUpdate) {
                  _streamPendingUpdate = true;
                  _streamUpdateTimer = setTimeout(function () {
                    _streamPendingUpdate = false;
                    _streamUpdateTimer = null;
                    // 只更新文字，不频繁setData streamingTool减少渲染抖动
                    if (self.data.streamingTool) {
                      self.setData({ streamingText: accumulatedText, streamingTool: '' });
                    } else {
                      self.setData({ streamingText: accumulatedText });
                    }
                  }, 200);
                }
              }
            } else if (event.type === 'follow_up_actions') {
              if (event.data && event.data.actions) {
                pendingFollowUpActions = event.data.actions;
              }
            }
          },
          function () {
            self._streamTask = null;
            var parsed = parseAiCards(accumulatedText || '抱歉，我现在无法回答这个问题。');
            var recommendPills = [];
            if (parsed.text.includes('【推荐追问】：')) {
              var parts = parsed.text.split('【推荐追问】：');
              parsed.text = parts[0].trim();
              if (parts[1]) recommendPills = parts[1].split('|').map(function (p) { return p.trim(); }).filter(function (p) { return !!p; });
            }
            var actions = parsed.actions && parsed.actions.length > 0 ? parsed.actions : null;
            if (!actions && pendingFollowUpActions && pendingFollowUpActions.length > 0) {
              actions = pendingFollowUpActions.map(function (a) {
                return {
                  label: a.label || a.command || '',
                  type: a.actionType ? String(a.actionType).toLowerCase() : 'navigate',
                  description: a.dataSummary || '',
                  command: a.command || '',
                  urgency: a.icon === 'alert' ? 'high' : 'medium',
                  buttonText: a.actionType === 'EXECUTE' ? '执行' : a.actionType === 'ASK' ? '追问' : '查看',
                };
              });
            }
            var completedAiMsg = {
              id: aiMsgId, role: 'ai', content: parsed.text,
              richContent: mdToHtml(parsed.text),
              recommendPills: recommendPills,
              actions: actions,
              insightCards: parsed.insightCards || [],
              clarificationHints: parsed.clarificationHints || [],
            };
            self._setMessages([].concat(self.data.messages, [completedAiMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
            self.scrollToBottom();
            self._saveChatHistory();
          },
          async function (err) {
            console.warn('[XiaoYun] SSE failed, fallback to sync:', err);
            self._streamTask = null;
            if (streamStarted && accumulatedText) {
              var streamFallbackMsg = { id: aiMsgId, role: 'ai', content: accumulatedText, richContent: mdToHtml(accumulatedText) };
              self._setMessages([].concat(self.data.messages, [streamFallbackMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
              self.scrollToBottom();
              self._saveChatHistory();
              return;
            }
            try {
              var chatParams = { question: text, context: chatContext };
              var chatRes = await api.intelligence.aiAdvisorChat(chatParams);
              var aiResponse = '';
              var syncActions = null;
              var syncSuggestions = [];
              if (chatRes && typeof chatRes === 'object') {
                aiResponse = chatRes.displayAnswer || chatRes.answer || chatRes.content || chatRes.reply || chatRes.message || '';
                if (chatRes.followUpActions && chatRes.followUpActions.length > 0) {
                  syncActions = chatRes.followUpActions.map(function (a) {
                    return {
                      label: a.label || a.command || '',
                      type: a.actionType ? String(a.actionType).toLowerCase() : 'navigate',
                      description: a.dataSummary || '',
                      command: a.command || '',
                      urgency: a.icon === 'alert' ? 'high' : 'medium',
                      buttonText: a.actionType === 'EXECUTE' ? '执行' : a.actionType === 'ASK' ? '追问' : '查看',
                    };
                  });
                }
                if (chatRes.suggestions && chatRes.suggestions.length > 0) {
                  syncSuggestions = chatRes.suggestions;
                }
              } else if (typeof chatRes === 'string') {
                aiResponse = chatRes;
              }
              if (!aiResponse) aiResponse = '抱歉，我现在无法回答这个问题。';

              var parsed = parseAiCards(aiResponse);
              var recommendPills = syncSuggestions.length > 0 ? syncSuggestions : [];
              if (parsed.text.includes('【推荐追问】：')) {
                var parts = parsed.text.split('【推荐追问】：');
                parsed.text = parts[0].trim();
                if (parts[1]) {
                  var extraPills = parts[1].split('|').map(function (p) { return p.trim(); }).filter(function (p) { return !!p; });
                  recommendPills = recommendPills.concat(extraPills);
                }
              }
              var actions = parsed.actions && parsed.actions.length > 0 ? parsed.actions : syncActions;
              var syncAiMsg = {
                id: aiMsgId, role: 'ai', content: parsed.text,
                richContent: mdToHtml(parsed.text),
                recommendPills: recommendPills.length > 0 ? recommendPills : null,
                actions: actions,
                insightCards: parsed.insightCards || [],
                clarificationHints: parsed.clarificationHints || [],
              };
              self._setMessages([].concat(self.data.messages, [syncAiMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
              self.scrollToBottom();
              self._saveChatHistory();
            } catch (syncErr) {
              var errMsg = { id: aiMsgId, role: 'ai', content: '服务暂时无法响应，请稍后再试。', richContent: '服务暂时无法响应，请稍后再试。' };
              self._setMessages([].concat(self.data.messages, [errMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
              self.scrollToBottom();
            }
          }
        );
        this._streamTask = requestTask;

      } catch (err) {
        console.error('[XiaoYun] sendMessage error:', err);
        var errContent = (err && err.errMsg && err.errMsg !== 'undefined') ? err.errMsg : '服务暂时无法响应，请稍后再试。';
        var errMsg = { id: Date.now(), role: 'ai', content: errContent };
        this._setMessages([].concat(this.data.messages, [errMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
        this.scrollToBottom();
      }
    },

    onActionTap(e) {
      var action = e.currentTarget.dataset.action;
      if (!action) return;
      if (action.type === 'execute' || action.type === 'urge_order' || action.type === 'mark_urgent') {
        this.setData({ inputValue: action.label || action.command || '', isOpen: true });
      } else if (action.actionCommand && action.actionCommand !== 'IGNORE') {
        this.setData({ inputValue: action.actionCommand }, () => { this.sendMessage(); });
      } else if (action.command) {
        this.setData({ inputValue: action.command }, () => { this.sendMessage(); });
      }
    },

    clearMessages() {
      let userName = '';
      try {
        const userInfo = wx.getStorageSync('userInfo') || {};
        if (userInfo.realName) userName = userInfo.realName;
        else if (userInfo.username) userName = userInfo.username;
        else if (userInfo.nickname) userName = userInfo.nickname;
      } catch (err) {
        /* ignore greeting name read failure */
      }
      const greeting = userName ? 'Hi ' + userName + '，这里是小云帮助中心。' : 'Hi，这里是小云帮助中心。';
      var newConvId = 'mp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      this._setMessages([{ id: Date.now(), role: 'ai', content: greeting }], { inputValue: '', conversationId: newConvId });
      try { wx.removeStorageSync('ai_chat_history'); } catch (_e) { /* ignore storage cleanup failure */ }
    },
    scrollToBottom() {
      setTimeout(() => {
        const len = this.data.messages.length;
        if (len > 0) this.setData({ scrollTo: 'msg-' + this.data.messages[len - 1].id });
      }, 100);
    },
  },
});
