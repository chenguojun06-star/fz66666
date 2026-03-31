const api = require('../../utils/api.js');
const bellTaskLoader = require('./bellTaskLoader.js');
const bellTaskActions = require('./bellTaskActions.js');
const { toast } = require('../../utils/uiHelper.js');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: true,
    },
    noticeCount: {
      type: Number,
      value: 0,
    },
  },
  data: {
    isOpen: false,
    inputValue: '',
    messages: [],
    isLoading: false,
    scrollTo: '',

    currentTab: 'chat',
    totalTasks: 0,
    qualityTasks: [],
    cuttingTasks: [],
    warehouseTasks: [],
    purchaseTasks: [],
    repairTasks: [],
    overdueOrders: [],
    overdueSummary: null,
    pendingUsers: [],
    pendingRegistrations: [],
    timeoutReminders: [],
    isAdmin: false,
    isTenantOwner: false,
    isManager: false,
    taskLoading: false,
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
        } catch (err) {
          console.error('get user info error', err);
        }

        const greetingSuffix = isManager
          ? '可以直接点下面的快捷问题，或者问我订单、工厂、日报、库存、财务等任何管理问题！'
          : '可以问我您的生产任务、扫码记录或负责的订单进度哦！';
        const greeting = userName
          ? `Hi 👋 ${userName}，我是小云～ 有什么可以帮您的？\n${greetingSuffix}`
          : `Hi 👋 我是小云～ 有什么可以帮您的？\n${greetingSuffix}`;

        this.setData({
          isManager,
          messages: [{
            id: Date.now(),
            role: 'ai',
            content: greeting,
          }],
        });
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
      this.loadTasks();
    },
  },
  detached() {
    const app = getApp();
    if (this.boundLoadTasks && app && app.eventBus) {
      app.eventBus.off('tasksUpdated', this.boundLoadTasks);
    }
  },
  methods: {
    switchTab(e) {
      this.setData({ currentTab: e.currentTarget.dataset.tab });
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
      } catch (err) {
        console.error('[AiAssistant] loadTasks error', err);
      } finally {
        this.setData({ taskLoading: false });
      }
    },

    handleQualityTask(e) {
      const task = e.currentTarget.dataset.item;
      if (!task) return;
      this.setData({ isOpen: false });
      bellTaskActions.handleQualityTask(task);
    },
    handleCuttingTask(e) {
      const task = e.currentTarget.dataset.item;
      if (!task) return;
      this.setData({ isOpen: false });
      bellTaskActions.handleCuttingTask(task);
    },
    handleWarehouseTask(e) {
      const task = e.currentTarget.dataset.item;
      if (!task) return;
      this.setData({ isOpen: false });
      bellTaskActions.handleProcurementTask(task);
    },
    handlePurchaseTask(e) {
      const task = e.currentTarget.dataset.item;
      if (!task) return;
      this.setData({ isOpen: false });
      bellTaskActions.handleProcurementTask(task);
    },

    toggleChat() {
      this.setData({ isOpen: !this.data.isOpen });
      if (this.data.isOpen) {
        this.scrollToBottom();
      }
    },
    autoAsk(e) {
      const question = e.currentTarget.dataset.question;
      if (question) {
        this.setData({ inputValue: question }, () => {
          this.sendMessage();
        });
      }
    },
    onInput(e) {
      this.setData({ inputValue: e.detail.value });
    },

    async sendMessage() {
      const text = this.data.inputValue.trim();
      if (!text || this.data.isLoading) return;

      const userMsg = { id: Date.now(), role: 'user', content: text };
      this.setData({
        messages: [...this.data.messages, userMsg],
        inputValue: '',
        isLoading: true,
      });
      this.scrollToBottom();

      try {
        const res = await api.intelligence.aiAdvisorChat({ question: text });
        let aiResponse = '抱歉，我现在无法回答这个问题。';
        if (typeof res === 'string') {
          aiResponse = res;
        } else if (res && res.answer) {
          aiResponse = res.answer;
        } else if (res && res.content) {
          aiResponse = res.content;
        }

        let recommendPills = [];
        if (aiResponse.includes('【推荐追问】：')) {
          const parts = aiResponse.split('【推荐追问】：');
          aiResponse = parts[0].trim();
          if (parts[1]) {
            recommendPills = parts[1].split('|').map(p => p.trim()).filter(p => !!p);
          }
        }

        const aiMsg = { id: Date.now(), role: 'ai', content: aiResponse, recommendPills };
        this.setData({
          messages: [...this.data.messages, aiMsg],
          isLoading: false,
        });
        this.scrollToBottom();
      } catch (err) {
        console.error('AI chat error:', err);
        const errMsg = { id: Date.now(), role: 'ai', content: '网络错误，请稍后再试。' };
        this.setData({
          messages: [...this.data.messages, errMsg],
          isLoading: false,
        });
        this.scrollToBottom();
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
        // ignore
      }

      const greeting = userName ? `Hi 👋 ${userName}，我是小云～ 有什么可以帮您的？\n可以直接点下面的快捷问题，或者问我任何关于订单、工厂、库存的问题哦！` : `Hi 👋 我是小云～ 有什么可以帮您的？\n可以直接点下面的快捷问题，或者问我任何关于订单、工厂、库存的问题哦！`;

      this.setData({
        messages: [{
          id: Date.now(),
          role: 'ai',
          content: greeting,
        }],
        inputValue: '',
      });
    },
    scrollToBottom() {
      setTimeout(() => {
        const len = this.data.messages.length;
        if (len > 0) {
          this.setData({ scrollTo: `msg-${this.data.messages[len - 1].id}` });
        }
      }, 100);
    },
  },
});
