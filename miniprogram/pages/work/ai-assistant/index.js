const api = require('../../../utils/api');

const QUICK_PROMPTS = [
  { label: '📊 今日做了多少件', text: '我今天做了多少件？' },
  { label: '💰 本周工资估算', text: '本周工资大概是多少？' },
  { label: '📦 查询订单进度', text: '我负责的订单进度怎么样？' },
  { label: '⏰ 哪些订单快要逾期', text: '哪些订单快要逾期了？' },
];

const MAX_MESSAGES = 30;

Page({
  data: {
    messages: [],        // { id, role: 'user'|'ai', text, loading? }
    inputText: '',
    sending: false,
    quickPrompts: QUICK_PROMPTS,
    conversationId: '',
  },

  onLoad() {
    // 合并初始 setData 为一次调用，避免热重载时 "Expected updated data" 错误
    const conversationId = 'mp_' + Date.now();
    const welcomeId = conversationId + '_w';
    this.setData({
      conversationId,
      messages: [{
        id: welcomeId,
        role: 'ai',
        text: '你好！我是你的 AI 助手 👋\n可以帮你查产量、估工资、看订单进度，有什么想问的尽管说～',
      }],
    });
  },

  onInputChange(e) {
    this.setData({ inputText: e.detail.value });
  },

  onQuickPrompt(e) {
    const { text } = e.currentTarget.dataset;
    this.setData({ inputText: text });
    this._send(text);
  },

  onSend() {
    const text = String(this.data.inputText || '').trim();
    if (!text || this.data.sending) return;
    this.setData({ inputText: '' });
    this._send(text);
  },

  async _send(text) {
    this._appendMsg({ role: 'user', text });
    const loadingId = this._appendMsg({ role: 'ai', text: '', loading: true });
    this.setData({ sending: true });

    try {
      const res = await api.intelligence.aiAdvisorChat({
        message: text,
        conversationId: this.data.conversationId,
        context: 'worker_assistant',
      });
      const reply = (res && (res.reply || res.content || res.message)) || '（无回应）';
      this._updateMsg(loadingId, reply);
    } catch (_) {
      this._updateMsg(loadingId, '⚠️ 网络异常，请稍后再试');
    } finally {
      this.setData({ sending: false });
      this._scrollToBottom();
    }
  },

  _appendMsg(msg) {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const messages = [...this.data.messages, { ...msg, id }];
    if (messages.length > MAX_MESSAGES) messages.shift();
    this.setData({ messages });
    this._scrollToBottom();
    return id;
  },

  _updateMsg(id, text) {
    const messages = this.data.messages.map(m =>
      m.id === id ? { ...m, text, loading: false } : m
    );
    this.setData({ messages });
  },

  _scrollToBottom() {
    wx.pageScrollTo({ scrollTop: 99999, duration: 150 });
  },
});
