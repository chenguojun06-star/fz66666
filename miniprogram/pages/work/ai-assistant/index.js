const api = require('../../../utils/api');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { parseChatReply } = require('./chat-parser');
const { toast } = require('../../../utils/uiHelper');
const { eventBus } = require('../../../utils/eventBus');

// 工厂工人快捷提问
const WORKER_PROMPTS = [
  { label: '今日做了多少件', text: '我今天做了多少件？', cmd: false },
  { label: '本周工资估算', text: '本周工资大概是多少？', cmd: false },
  { label: '查询订单进度', text: '我负责的订单进度怎么样？', cmd: false },
  { label: '哪些订单快要逾期', text: '哪些订单快要逾期了？', cmd: false },
];

// 管理员/跟单员快捷指令（查询 + 操作两类）
const MANAGER_PROMPTS = [
  { label: '查逾期订单', text: '当前有哪些逾期或高风险订单？', cmd: false },
  { label: '暂停订单', text: '暂停订单 ', cmd: true },
  { label: '加急订单', text: '加急订单 ', cmd: true },
  { label: '修改货期', text: '修改订单 ', cmd: true },
  { label: '催工厂', text: '催促工厂跟进订单 ', cmd: true },
  { label: '审批通过', text: '审批通过订单 ', cmd: true },
  { label: '驳回', text: '驳回订单 ', cmd: true },
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
    inputText: '',
    sending: false,
    quickPrompts: WORKER_PROMPTS,
    conversationId: '',
    isManager: false,
    pendingImage: '',     // 待发送的本地图片临时路径
    uploading: false,     // 图片上传中
  },

  onLoad() {
    // 隐私合规：监听隐私弹窗事件
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', (resolve) => {
        try {
          var dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') dialog.showDialog(resolve);
        } catch (_) {}
      });
    }
    const isManager = isAdminOrSupervisor();
    const conversationId = 'mp_' + Date.now();
    const welcomeId = conversationId + '_w';
    const welcomeText = isManager
      ? '你好！我是小云\n可以帮你查逾期订单、分析风险，也可以直接下指令操作系统——如「暂停订单PO2026001」「催工厂跟进PO2026002」，我来帮你执行。'
      : '你好！我是你的 AI 助手\n可以帮你查产量、估工资、看订单进度，有什么想问的尽管说～';
    this.setData({
      conversationId,
      isManager,
      quickPrompts: isManager ? MANAGER_PROMPTS : WORKER_PROMPTS,
      messages: [{ id: welcomeId, role: 'ai', text: welcomeText }],
    });
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
    const hasImage = !!this.data.pendingImage;
    if ((!text && !hasImage) || this.data.sending) return;
    this.setData({ inputText: '' });
    if (hasImage) {
      this._sendWithImage(text);
    } else {
      this._send(text);
    }
  },

  /** 选择图片（拍照/相册） */
  chooseImage() {
    if (this.data.sending || this.data.uploading) {
      console.warn('[AI-Assistant] chooseImage blocked: sending=', this.data.sending, 'uploading=', this.data.uploading);
      return;
    }
    var self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const path = (res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath) || '';
        if (path) self.setData({ pendingImage: path });
      },
      fail: (err) => {
        console.warn('[AI-Assistant] chooseImage fail:', err);
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

  /** 移除待发送图片 */
  removePendingImage() {
    this.setData({ pendingImage: '' });
  },

  /** 预览图片 */
  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    if (src) wx.previewImage({ current: src, urls: [src] });
  },

  /** 发送图片（可附带文字） */
  async _sendWithImage(text) {
    const tempPath = this.data.pendingImage;
    this.setData({ pendingImage: '', uploading: true });

    // 先显示用户消息（含本地图片预览）
    this._appendMsg({ role: 'user', text: text || '', imageUrl: tempPath });

    // 上传图片到 COS
    let imageUrl = '';
    try {
      imageUrl = await api.common.uploadImage(tempPath);
    } catch (err) {
      toast.error('图片上传失败');
      this.setData({ uploading: false });
      return;
    }
    this.setData({ uploading: false });

    // 发送到 AI（带图片 URL）
    const loadingId = this._appendMsg({ role: 'ai', text: '', loading: true });
    this.setData({ sending: true });

    try {
      let reply;
      const payload = {
        message: text || '请看这张图片',
        imageUrl: imageUrl,
        conversationId: this.data.conversationId,
        context: 'worker_assistant',
      };
      if (this.data.isManager) {
        try {
          const res = await api.intelligence.naturalLanguageExecute({
            text: text || '分析这张图片',
            imageUrl: imageUrl,
            conversationId: this.data.conversationId,
          });
          reply = (res && (res.message || res.reply || res.content)) || '操作完成';
        } catch (nlErr) {
          // NL指令失败，降级为对话模式
          console.warn('[AI-Page] NL exec failed, fallback to chat:', nlErr && nlErr.errMsg);
          const fbRes = await api.intelligence.aiAdvisorChat(payload);
          reply = (fbRes && (fbRes.reply || fbRes.content || fbRes.message)) || '（无回应）';
        }
      } else {
        const res = await api.intelligence.aiAdvisorChat(payload);
        reply = (res && (res.reply || res.content || res.message)) || '（无回应）';
      }
      this._updateMsg(loadingId, reply);
    } catch (err) {
      const msg = (err && err.message) ? err.message : '网络异常，请稍后再试';
      this._updateMsg(loadingId, msg);
    } finally {
      this.setData({ sending: false });
      this._scrollToBottom();
    }
  },

  async _send(text) {
    this._appendMsg({ role: 'user', text });
    const loadingId = this._appendMsg({ role: 'ai', text: '', loading: true });
    this.setData({ sending: true });

    try {
      let reply;
      if (this.data.isManager) {
        // 管理员走指令执行通道（LLM解析意图 → ExecutionEngine）
        try {
          const res = await api.intelligence.naturalLanguageExecute({
            text: text,
            conversationId: this.data.conversationId,
          });
          const msg = (res && (res.message || res.reply || res.content)) || '操作完成';
          reply = msg;
        } catch (nlErr) {
          // NL指令失败（如普通问答），降级为对话模式
          console.warn('[AI-Page] NL exec failed, fallback to chat:', nlErr && nlErr.errMsg);
          const fbRes = await api.intelligence.aiAdvisorChat({
            message: text,
            conversationId: this.data.conversationId,
            context: 'manager_assistant',
          });
          reply = (fbRes && (fbRes.reply || fbRes.content || fbRes.message)) || '（无回应）';
        }
      } else {
        // 工厂工人走查询通道
        const res = await api.intelligence.aiAdvisorChat({
          message: text,
          conversationId: this.data.conversationId,
          context: 'worker_assistant',
        });
        reply = (res && (res.reply || res.content || res.message)) || '（无回应）';
      }
      this._updateMsg(loadingId, reply);
    } catch (err) {
      console.error('[AI-Page] send error:', err);
      const errText = (err && err.errMsg && err.errMsg !== 'undefined') ? err.errMsg : (err && err.message && err.message !== 'undefined') ? err.message : '';
      const msg = errText || 'AI暂时无法响应，请稍后再试。';
      this._updateMsg(loadingId, msg);
    } finally {
      this.setData({ sending: false });
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
    this.setData({ messages });
    this._scrollToBottom();
    return id;
  },

  _updateMsg(id, rawText) {
    const parsed = parseChatReply(rawText);
    const messages = this.data.messages.map(m =>
      m.id === id ? {
        ...m,
        text: parsed.displayText,
        textSegments: buildTextSegments(parsed.displayText),
        actionCards: parsed.actionCards,
        charts: parsed.charts,
        teamStatusCards: parsed.teamStatusCards,
        bundleSplitCards: parsed.bundleSplitCards,
        loading: false,
      } : m
    );
    this.setData({ messages });
  },

  _scrollToBottom() {
    wx.pageScrollTo({ scrollTop: 99999, duration: 150 });
  },

  onUnload() {
    if (this._unsubPrivacy) {
      this._unsubPrivacy();
      this._unsubPrivacy = null;
    }
  },
});
