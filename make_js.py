with open("miniprogram/components/ai-assistant/index.js", "w") as f:
    f.write("""const api = require('../../utils/api.js');
const bellTaskLoader = require('./bellTaskLoader.js');
const bellTaskActions = require('./bellTaskActions.js');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: true
    }
  },
  data: {
    isOpen: false,
    inputValue: '',
    messages: [], // will be injected on attached
    isLoading: false,
    scrollTo: '',

    // --- Task Integration ---
    currentTab: 'chat', // 'chat' or 'tasks'
    totalTasks: 0,
    qualityTasks: [],
    cuttingTasks: [],
    warehouseTasks: [],
    purchaseTasks: [],
    taskLoading: false
  },
  lifetimes: {
    attached() {
      let userName = '';
      try {
        const userInfo = wx.getStorageSync('userInfo') || {};
        if (userInfo.realName) userName = userInfo.realName;
        else if (userInfo.username) userName = userInfo.username;
        else if (userInfo.nickname) userName = userInfo.nickname;
      } catch (err) {
        console.error('get user info error', err);
      }

      const greeting = userName ? `Hi 👋 ${userName}，我是小云～ 有什么可以帮您的？\\n可以直接点下面的快捷问题，或者问我任何关于订单、工厂、库存的问题哦！` : `Hi 👋 我是小云～ 有什么可以帮您的？\\n可以直接点下面的快捷问题，或者问我任何关于订单、工厂、库存的问题哦！`;

      this.setData({
        messages: [{
          id: Date.now(),
          role: 'ai',
          content: greeting
        }]
      });
    }
  },
  ready() {
    this.boundLoadTasks = this.loadTasks.bind(this);
    getApp().globalEventBus.on('tasksUpdated', this.boundLoadTasks);
  },
  pageLifetimes: {
    show() {
      this.loadTasks();
    }
  },
  detached() {
    if (this.boundLoadTasks) {
      getApp().globalEventBus.off('tasksUpdated', this.boundLoadTasks);
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
        const result = await bellTaskLoader.loadAllTasks();
        this.setData({
          qualityTasks: result.qualityTasks || [],
          cuttingTasks: result.cuttingTasks || [],
          warehouseTasks: result.warehouseTasks || [],
          purchaseTasks: result.purchaseTasks || [],
          totalTasks: result.totalTasks || 0
        });
      } catch (err) {
        console.error('[AiAssistant] loadTasks error', err);
      } finally {
        this.setData({ taskLoading: false });
      }
    },

    // Delegation of Task clicks
    handleQualityApprove(e) { bellTaskActions.handleQualityApprove(e, this); },
    handleQualityReject(e) { bellTaskActions.handleQualityReject(e, this); },
    handleCuttingConfirm(e) { bellTaskActions.handleCuttingConfirm(e, this); },
    handleWarehouseInbound(e) { bellTaskActions.handleWarehouseInbound(e, this); },
    handlePurchaseTask(e) { bellTaskActions.handlePurchaseTask(e, this); },

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
        isLoading: true
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
          isLoading: false
        });
        this.scrollToBottom();
      } catch (err) {
        console.error('AI chat error:', err);
        const errMsg = { id: Date.now(), role: 'ai', content: '网络错误，请稍后再试。' };
        this.setData({
          messages: [...this.data.messages, errMsg],
          isLoading: false
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
      } catch (err) {}

      const greeting = userName ? `Hi 👋 ${userName}，我是小云～ 有什么可以帮您的？\\n可以直接点下面的快捷问题，或者问我任何关于订单、工厂、库存的问题哦！` : `Hi 👋 我是小云～ 有什么可以帮您的？\\n可以直接点下面的快捷问题，或者问我任何关于订单、工厂、库存的问题哦！`;

      this.setData({
        messages: [{
          id: Date.now(),
          role: 'ai',
          content: greeting
        }],
        inputValue: ''
      });
    },
    scrollToBottom() {
      setTimeout(() => {
        const len = this.data.messages.length;
        if (len > 0) {
          this.setData({ scrollTo: `msg-${this.data.messages[len - 1].id}` });
        }
      }, 100);
    }
  }
});
""")
