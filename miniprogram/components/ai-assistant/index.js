const api = require('../../utils/api.js');
const bellTaskLoader = require('./bellTaskLoader.js');
const bellTaskActions = require('./bellTaskActions.js');

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
    ballOut: false,
    inputValue: '',
    messages: [],
    isLoading: false,
    loadingText: '',
    scrollTo: '',
    pendingImage: '',
    uploading: false,

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

        const hour = new Date().getHours();
        let timeTag = '';
        if (hour >= 5 && hour < 9) timeTag = '早安 ☀️，';
        else if (hour >= 12 && hour < 14) timeTag = '饭点了，';
        else if (hour >= 18 && hour < 22) timeTag = '下班前来一把，';
        else if (hour >= 22 || hour < 5) timeTag = '这么晚还在 🌙，';
        const name = userName || '你';
        const mgrGreetings = [
          `嗨 ${name}！${timeTag}我是小云 ☁️\n订单、日报、工厂风险——有什么我来搞，点下面快捷或直接说 👇`,
          `${name} 来了！${timeTag}小云已就位 ☁️ 数据随时查，订单工厂财务都行 📊`,
          `嘿 ${name}！${timeTag}我是小云，库存财务订单随便问 😎\n快捷按钮或直接说都行 👇`,
        ];
        const wkrGreetings = [
          `嗨 ${name}！${timeTag}我是小云 ☁️\n今天的任务、扫码记录随便问 👀`,
          `${name} 辛苦了！${timeTag}有啥要查的跟我说一声 🫡`,
          `${name}！${timeTag}小云在这，今天任务帮你盯着呢 💼`,
        ];
        const pool = isManager ? mgrGreetings : wkrGreetings;
        const greeting = pool[Math.floor(Math.random() * pool.length)];

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
      setTimeout(() => this.loadTasks(), 0);
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
    handleRepairTask(e) {
      const task = e.currentTarget.dataset.item;
      if (!task) return;
      this.setData({ isOpen: false });
      bellTaskActions.handleRepairTask(task);
    },
    handleOverdueOrder(e) {
      const task = e.currentTarget.dataset.item;
      if (!task) return;
      this.setData({ isOpen: false });
      bellTaskActions.handleOverdueOrder(task);
    },
    onApproveUser(e) {
      bellTaskActions.onApproveUser(this, e);
    },
    onApproveRegistration(e) {
      bellTaskActions.onApproveRegistration(this, e);
    },
    handleReminderTask(e) {
      const task = e.currentTarget.dataset.item;
      if (!task) return;
      this.setData({ isOpen: false });
      bellTaskActions.handleReminderTask(task);
    },

    onBallTap() {
      if (!this.data.ballOut) {
        // 第一下：球滑出来
        this.setData({ ballOut: true });
        // 3秒无操作自动缩回
        clearTimeout(this._peekTimer);
        this._peekTimer = setTimeout(() => {
          if (!this.data.isOpen) {
            this.setData({ ballOut: false });
          }
        }, 3000);
      } else {
        // 已滑出 → 打开 chat
        clearTimeout(this._peekTimer);
        this.toggleChat();
      }
    },
    toggleChat() {
      const opening = !this.data.isOpen;
      this.setData({ isOpen: opening });
      if (opening) {
        this.scrollToBottom();
      } else {
        // chat 关闭 → 1.5s 后球自动缩回
        setTimeout(() => {
          this.setData({ ballOut: false });
        }, 1500);
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
      var text = this.data.inputValue.trim();
      var hasImage = !!this.data.pendingImage;
      if ((!text && !hasImage) || this.data.isLoading) return;

      this.setData({ inputValue: '' });
      var tempPath = hasImage ? this.data.pendingImage : '';

      // show user message
      var userMsg = {
        id: Date.now(),
        role: 'user',
        content: hasImage ? (text || '发送了一张图片') : text,
      };
      if (hasImage) userMsg.imageUrl = tempPath;
      const loadingPool = ['查一下... 🔍', '翻翻台账，稍等 📋', '算一下... 🧮', '手速拉满 💨', '数据飞来 ⚡'];
      const loadingText = loadingPool[Math.floor(Math.random() * loadingPool.length)];
      if (hasImage) this.setData({ pendingImage: '', uploading: true });
      this.setData({
        messages: [].concat(this.data.messages, [userMsg]),
        isLoading: !hasImage,
        loadingText,
      });
      this.scrollToBottom();

      var imageUrl = '';
      try {
        // step 1: upload image if present
        if (tempPath) {
          imageUrl = await api.common.uploadImage(tempPath);
          this.setData({ uploading: false, isLoading: true, loadingText });
        }

        // step 2: call AI
        var aiResponse = '嗯...这把我问住了 😅 换个方式说说看？';
        if (this.data.isManager) {
          var mgrParams = { text: text || (imageUrl ? '分析这张图片' : text) };
          if (imageUrl) mgrParams.imageUrl = imageUrl;
          try {
            var mgrRes = await api.intelligence.naturalLanguageExecute(mgrParams);
            aiResponse = (mgrRes && (mgrRes.message || mgrRes.reply || mgrRes.content)) || '操作完成';
          } catch (nlErr) {
            // NL命令执行失败（如非指令类问题），降级为对话模式
            console.warn('[XiaoYun] NL exec failed, fallback to chat:', nlErr && nlErr.errMsg);
            var fallbackParams = { question: text || (imageUrl ? '请看这张图片' : text), context: 'manager_assistant' };
            if (imageUrl) fallbackParams.imageUrl = imageUrl;
            var fbRes = await api.intelligence.aiAdvisorChat(fallbackParams);
            if (typeof fbRes === 'string') aiResponse = fbRes;
            else if (fbRes && fbRes.answer) aiResponse = fbRes.answer;
            else if (fbRes && fbRes.content) aiResponse = fbRes.content;
            else if (fbRes && fbRes.reply) aiResponse = fbRes.reply;
          }
        } else {
          var wkrParams = { question: text || (imageUrl ? '请看这张图片' : text) };
          if (imageUrl) wkrParams.imageUrl = imageUrl;
          var wkrRes = await api.intelligence.aiAdvisorChat(wkrParams);
          if (typeof wkrRes === 'string') aiResponse = wkrRes;
          else if (wkrRes && wkrRes.answer) aiResponse = wkrRes.answer;
          else if (wkrRes && wkrRes.content) aiResponse = wkrRes.content;
          else if (wkrRes && wkrRes.reply) aiResponse = wkrRes.reply;
        }

        // step 3: parse recommend pills
        var recommendPills = [];
        if (aiResponse.includes('【推荐追问】：')) {
          var parts = aiResponse.split('【推荐追问】：');
          aiResponse = parts[0].trim();
          if (parts[1]) {
            recommendPills = parts[1].split('|').map(function (p) { return p.trim(); }).filter(function (p) { return !!p; });
          }
        }

        var aiMsg = { id: Date.now(), role: 'ai', content: aiResponse, recommendPills: recommendPills };
        this.setData({ messages: [].concat(this.data.messages, [aiMsg]), isLoading: false });
        this.scrollToBottom();
      } catch (err) {
        console.error('[XiaoYun] sendMessage error:', err);
        if (tempPath && !imageUrl) {
          wx.showToast({ title: '图片上传失败', icon: 'none' });
          this.setData({ uploading: false });
        }
        const funnyErrs = ['网络开小差了 🌐 稍后再试？', '出了点小故障 😅 要不等会再来？', '信号抖了一下，再发一次吧 🔧'];
        var errContent = (err && err.errMsg && err.errMsg !== 'undefined') ? err.errMsg : funnyErrs[Math.floor(Math.random() * funnyErrs.length)];
        var errMsg = { id: Date.now(), role: 'ai', content: errContent };
        this.setData({ messages: [].concat(this.data.messages, [errMsg]), isLoading: false });
        this.scrollToBottom();
      }
    },

    chooseImage() {
      if (this.data.isLoading || this.data.uploading) return;
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        success: (res) => {
          var path = (res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath) || '';
          if (path) this.setData({ pendingImage: path });
        },
        fail: (err) => {
          console.warn('[XiaoYun] chooseImage fail:', err);
          if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
            wx.showToast({ title: '无法打开相机/相册，请检查权限', icon: 'none' });
          }
        },
      });
    },

    removePendingImage() {
      this.setData({ pendingImage: '' });
    },

    previewImage(e) {
      var src = e.currentTarget.dataset.src;
      if (src) wx.previewImage({ current: src, urls: [src] });
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

      const freshPhrases = [
        '记录清啦 👌 继续聊吧，我随时在！',
        '好，重头来 😄 刚才的全忘了，有话直说！',
        '清空完毕 ✨ 小云已归位～',
        '一键清零 🧹 准备好接新问题了',
      ];
      const freshGreeting = freshPhrases[Math.floor(Math.random() * freshPhrases.length)];
      const greeting = userName ? `嗨 ${userName}！${freshGreeting}` : freshGreeting;

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
