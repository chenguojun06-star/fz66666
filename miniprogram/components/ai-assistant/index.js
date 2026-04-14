const api = require('../../utils/api.js');
const bellTaskLoader = require('./bellTaskLoader.js');
const bellTaskActions = require('./bellTaskActions.js');

var TOOL_NAMES = {
  tool_query_production_progress: '生产进度', tool_order_edit: '订单编辑',
  tool_query_warehouse_stock: '库存查询', tool_finished_product_stock: '成品库存',
  tool_deep_analysis: '深度分析', tool_knowledge_search: '知识搜索',
  tool_material_receive: '物料收货', tool_finished_outbound: '成品出库',
  tool_quality_inbound: '质检入库', tool_finance_workflow: '财务审批',
  tool_smart_report: '智能报表', tool_delay_trend: '延期趋势',
  tool_root_cause_analysis: '根因分析', tool_whatif: '假设模拟',
  tool_action_executor: '执行操作', tool_procurement: '采购管理',
};

function describeTool(name) {
  return TOOL_NAMES[name] || (name || '').replace(/^tool_/, '').replace(/_/g, '');
}

function parseAiCards(text) {
  var cards = [];
  var actions = [];
  var acMatch = text.match(/【ACTIONS】([\s\S]*?)【\/ACTIONS】/);
  if (acMatch) {
    text = text.replace(acMatch[0], '');
    try {
      var acData = JSON.parse(acMatch[1]);
      if (Array.isArray(acData)) actions = acData;
      else if (acData && acData.actions) actions = acData.actions;
    } catch (_e) {
      acMatch[1].split('\n').forEach(function (line) {
        var m = line.match(/[-*]\s*(.+)/);
        if (m) actions.push({ label: m[1].trim(), type: 'navigate' });
      });
    }
  }
  return { text: text.trim(), cards: cards, actions: actions };
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
    pendingImage: '',
    uploading: false,
    currentTab: 'chat',
    totalTasks: 0,
    qualityTasks: [], cuttingTasks: [], warehouseTasks: [],
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

        const greetingSuffix = isManager
          ? '可以直接点下面的快捷问题，或者问我订单、工厂、日报、库存、财务等任何管理问题！'
          : '可以问我您的生产任务、扫码记录或负责的订单进度哦！';
        const greeting = userName
          ? 'Hi ' + userName + '，我是小云～ 有什么可以帮您的？\n' + greetingSuffix
          : 'Hi 我是小云～ 有什么可以帮您的？\n' + greetingSuffix;

        const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
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
        } catch (_e) {}

        var conversationId = 'mp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        var savedMessages = [];
        try {
          savedMessages = wx.getStorageSync('ai_chat_history') || [];
          if (!Array.isArray(savedMessages) || savedMessages.length === 0) savedMessages = [];
        } catch (_e) {}

        var initMsgs = savedMessages.length > 0 ? savedMessages : [{
          id: Date.now(), role: 'ai', content: greeting,
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
      setTimeout(() => this.loadTasks(), 0);
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
      } catch (_e) {}
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
      try { wx.setStorageSync('ai_trigger_position', { x: snapX, y: this.data.triggerY, edge }); } catch (_e) {}
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
      }).catch(function () {});
    },

    _saveChatHistory() {
      try {
        var msgs = this.data.messages.slice(-20);
        wx.setStorageSync('ai_chat_history', msgs);
      } catch (_e) {}
    },

    _abortStream() {
      if (this._streamTask) {
        try { this._streamTask.abort(); } catch (_e) {}
        this._streamTask = null;
      }
    },

    async loadTasks() {
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
      var hasImage = !!this.data.pendingImage;
      if ((!text && !hasImage) || this.data.isLoading) return;

      this.setData({ inputValue: '' });
      var tempPath = hasImage ? this.data.pendingImage : '';

      var userMsg = {
        id: Date.now(), role: 'user',
        content: hasImage ? (text || '发送了一张图片') : text,
      };
      if (hasImage) userMsg.imageUrl = tempPath;
      if (hasImage) this.setData({ pendingImage: '', uploading: true });
      this._setMessages([].concat(this.data.messages, [userMsg]), { isLoading: !hasImage, streamingText: '', streamingTool: '' });
      this.scrollToBottom();

      var imageUrl = '';
      try {
        if (tempPath) {
          imageUrl = await api.common.uploadImage(tempPath);
          this.setData({ uploading: false, isLoading: true });
        }

        var chatContext = this.data.isManager ? 'manager_assistant' : 'worker_assistant';
        var streamPayload = {
          question: text || (imageUrl ? '请看这张图片' : text),
          pageContext: chatContext,
          conversationId: this.data.conversationId,
        };
        if (imageUrl) streamPayload.imageUrl = imageUrl;

        var self = this;
        var accumulatedText = '';
        var streamStarted = false;
        var streamFailed = false;
        var pendingFollowUpActions = null;

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
                self.setData({ streamingText: accumulatedText, streamingTool: '' });
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
            var aiMsg = {
              id: aiMsgId, role: 'ai', content: parsed.text,
              recommendPills: recommendPills,
              actions: actions,
            };
            self._setMessages([].concat(self.data.messages, [aiMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
            self.scrollToBottom();
            self._saveChatHistory();
          },
          async function (err) {
            console.warn('[XiaoYun] SSE failed, fallback to sync:', err);
            self._streamTask = null;
            if (streamStarted && accumulatedText) {
              var aiMsg = { id: aiMsgId, role: 'ai', content: accumulatedText };
              self._setMessages([].concat(self.data.messages, [aiMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
              self.scrollToBottom();
              self._saveChatHistory();
              return;
            }
            try {
              var chatParams = { question: text || (imageUrl ? '请看这张图片' : text), context: chatContext };
              if (imageUrl) chatParams.imageUrl = imageUrl;
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
              var aiMsg = {
                id: aiMsgId, role: 'ai', content: parsed.text,
                recommendPills: recommendPills.length > 0 ? recommendPills : null,
                actions: actions,
              };
              self._setMessages([].concat(self.data.messages, [aiMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
              self.scrollToBottom();
              self._saveChatHistory();
            } catch (syncErr) {
              var errMsg = { id: aiMsgId, role: 'ai', content: 'AI暂时无法响应，请稍后再试。' };
              self._setMessages([].concat(self.data.messages, [errMsg]), { isLoading: false, streamingText: '', streamingTool: '' });
              self.scrollToBottom();
            }
          }
        );
        this._streamTask = requestTask;

      } catch (err) {
        console.error('[XiaoYun] sendMessage error:', err);
        if (tempPath && !imageUrl) {
          wx.showToast({ title: '图片上传失败', icon: 'none' });
          this.setData({ uploading: false });
        }
        var errContent = (err && err.errMsg && err.errMsg !== 'undefined') ? err.errMsg : 'AI暂时无法响应，请稍后再试。';
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

    chooseImage() {
      if (this.data.isLoading || this.data.uploading) return;
      var self = this;
      wx.chooseMedia({
        count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
        success: (res) => {
          var path = (res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath) || '';
          if (path) self.setData({ pendingImage: path });
        },
        fail: (err) => {
          if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
            wx.showModal({
              title: '相机/相册权限', content: '需要相机或相册权限才能上传图片，请在设置中允许',
              confirmText: '去设置', cancelText: '取消',
              success: function (modalRes) { if (modalRes.confirm) wx.openSetting(); },
            });
          }
        },
      });
    },
    removePendingImage() { this.setData({ pendingImage: '' }); },
    previewImage(e) { var src = e.currentTarget.dataset.src; if (src) wx.previewImage({ current: src, urls: [src] }); },

    clearMessages() {
      let userName = '';
      try {
        const userInfo = wx.getStorageSync('userInfo') || {};
        if (userInfo.realName) userName = userInfo.realName;
        else if (userInfo.username) userName = userInfo.username;
        else if (userInfo.nickname) userName = userInfo.nickname;
      } catch (err) {}
      const greeting = userName ? 'Hi ' + userName + '，我是小云～ 有什么可以帮您的？' : 'Hi 我是小云～ 有什么可以帮您的？';
      var newConvId = 'mp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      this._setMessages([{ id: Date.now(), role: 'ai', content: greeting }], { inputValue: '', conversationId: newConvId });
      try { wx.removeStorageSync('ai_chat_history'); } catch (_e) {}
    },
    scrollToBottom() {
      setTimeout(() => {
        const len = this.data.messages.length;
        if (len > 0) this.setData({ scrollTo: 'msg-' + this.data.messages[len - 1].id });
      }, 100);
    },
  },
});
