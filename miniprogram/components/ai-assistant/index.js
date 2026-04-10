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
    inputValue: '',
    messages: [],
    isLoading: false,
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
    triggerX: 0,
    triggerY: 110,
    edgeSide: 'right',
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartTriggerX: 0,
    dragStartTriggerY: 0,
    screenWidth: 375,
    screenHeight: 667,
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
          ? `Hi ${userName}，我是小云～ 有什么可以帮您的？\n${greetingSuffix}`
          : `Hi 我是小云～ 有什么可以帮您的？\n${greetingSuffix}`;

        // --- 屏幕尺寸 & 保存的位置 ---
        // wx.getWindowInfo() 替代已废弃的 wx.getSystemInfoSync()（lib 2.20+）
        const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const sw = sysInfo.windowWidth || 375;
        const sh = sysInfo.windowHeight || 667;
        let tx = sw - 20; // 挂壁探头：20px 露出，30px 藏在屏幕外
        let ty = 110;
        let edge = 'right';
        try {
          const saved = wx.getStorageSync('ai_trigger_position');
          if (saved) {
            // 始终用当前挂壁吸附位，仅保留纵向位置
            edge = saved.edge || 'right';
            tx = edge === 'left' ? -30 : sw - 20;
            ty = Math.max(40, Math.min(saved.y != null ? saved.y : ty, sh - 60));
          }
        } catch (_e) { /* ignore */ }

        this.setData({
          isManager,
          screenWidth: sw,
          screenHeight: sh,
          triggerX: tx,
          triggerY: ty,
          edgeSide: edge,
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
    this._cancelIdleSnap();
    const app = getApp();
    if (this.boundLoadTasks && app && app.eventBus) {
      app.eventBus.off('tasksUpdated', this.boundLoadTasks);
    }
  },
  methods: {
    switchTab(e) {
      this.setData({ currentTab: e.currentTarget.dataset.tab });
    },

    /* ========= 拖拽相关 ========= */
    onTriggerTouchStart(e) {
      const touch = e.touches[0];
      this._touchStartTime = Date.now();
      this.setData({
        isDragging: false,
        dragStartX: touch.clientX,
        dragStartY: touch.clientY,
        dragStartTriggerX: this.data.triggerX,
        dragStartTriggerY: this.data.triggerY,
      });
    },
    onTriggerTouchMove(e) {
      const touch = e.touches[0];
      const dx = touch.clientX - this.data.dragStartX;
      const dy = touch.clientY - this.data.dragStartY;
      if (!this.data.isDragging && Math.abs(dx) + Math.abs(dy) < 5) return;
      const sw = this.data.screenWidth;
      const sh = this.data.screenHeight;
      let nx = this.data.dragStartTriggerX + dx;
      let ny = this.data.dragStartTriggerY + dy;
      nx = Math.max(-30, Math.min(nx, sw - 20));
      ny = Math.max(40, Math.min(ny, sh - 60));
      this.setData({ triggerX: nx, triggerY: ny, isDragging: true });
    },
    onTriggerTouchEnd() {
      if (!this.data.isDragging) {
        // 短触 = 点击，直接在 touchEnd 里处理（比 catchtap 更可靠）
        const willOpen = !this.data.isOpen;
        this._cancelIdleSnap();
        this.setData({ isOpen: willOpen });
        if (willOpen) {
          this._snapToVisible();
          this.scrollToBottom();
        } else {
          this._startIdleSnap();
        }
        return;
      }
      // 拖拽结束 → 吸附到最近的屏幕边缘（挂壁探头）
      const sw = this.data.screenWidth;
      const midX = this.data.triggerX + 25; // 按钮中心
      const edge = midX < sw / 2 ? 'left' : 'right';
      const snapX = edge === 'left' ? -30 : sw - 20;
      this.setData({ triggerX: snapX, edgeSide: edge, isDragging: false });
      try {
        wx.setStorageSync('ai_trigger_position', { x: snapX, y: this.data.triggerY, edge });
      } catch (_e) { /* ignore */ }
      // 拖拽结束后，若面板已关闭则启动空闲吸附倒计时
      if (!this.data.isOpen) this._startIdleSnap();
    },
    /* ===== 挂壁空闲吸附辅助 ===== */
    _snapToVisible() {
      // 将形象拉到完全可见位置（打开面板时调用）
      const sw = this.data.screenWidth;
      const snapX = this.data.edgeSide === 'left' ? 0 : sw - 50;
      this.setData({ triggerX: snapX });
    },
    _cancelIdleSnap() {
      if (this._idleTimer) {
        clearTimeout(this._idleTimer);
        this._idleTimer = null;
      }
    },
    _startIdleSnap() {
      // 3秒无操作后自动缩回边缘（挂壁探头效果）
      this._cancelIdleSnap();
      const sw = this.data.screenWidth;
      const snapX = this.data.edgeSide === 'left' ? -30 : sw - 20;
      this._idleTimer = setTimeout(() => {
        this.setData({ triggerX: snapX });
        this._idleTimer = null;
      }, 3000);
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

    toggleChat() {
      const willOpen = !this.data.isOpen;
      this._cancelIdleSnap();
      this.setData({ isOpen: willOpen });
      if (willOpen) {
        this._snapToVisible();
        this.scrollToBottom();
      } else {
        this._startIdleSnap();
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
      if (hasImage) this.setData({ pendingImage: '', uploading: true });
      this.setData({
        messages: [].concat(this.data.messages, [userMsg]),
        isLoading: !hasImage,
      });
      this.scrollToBottom();

      var imageUrl = '';
      try {
        // step 1: upload image if present
        if (tempPath) {
          imageUrl = await api.common.uploadImage(tempPath);
          this.setData({ uploading: false, isLoading: true });
        }

        // step 2: call AI
        var aiResponse = '抱歉，我现在无法回答这个问题。';
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
        var errContent = (err && err.errMsg && err.errMsg !== 'undefined') ? err.errMsg : 'AI暂时无法响应，请稍后再试。';
        var errMsg = { id: Date.now(), role: 'ai', content: errContent };
        this.setData({ messages: [].concat(this.data.messages, [errMsg]), isLoading: false });
        this.scrollToBottom();
      }
    },

    chooseImage() {
      if (this.data.isLoading || this.data.uploading) {
        console.warn('[XiaoYun] chooseImage blocked: isLoading=', this.data.isLoading, 'uploading=', this.data.uploading);
        return;
      }
      var self = this;
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        success: (res) => {
          var path = (res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath) || '';
          if (path) self.setData({ pendingImage: path });
        },
        fail: (err) => {
          console.warn('[XiaoYun] chooseImage fail:', err);
          if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
            wx.showModal({
              title: '相机/相册权限',
              content: '需要相机或相册权限才能上传图片，请在设置中允许',
              confirmText: '去设置',
              cancelText: '取消',
              success: function (modalRes) {
                if (modalRes.confirm) wx.openSetting();
              }
            });
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

      const greeting = userName ? `Hi ${userName}，我是小云～ 有什么可以帮您的？\n可以直接点下面的快捷问题，或者问我任何关于订单、工厂、库存的问题哦！` : `Hi 我是小云～ 有什么可以帮您的？\n可以直接点下面的快捷问题，或者问我任何关于订单、工厂、库存的问题哦！`;

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
