const api = require('../../../utils/api');
const { isAdminOrSupervisor } = require('../../../utils/permission');

// 工厂工人快捷提问
const WORKER_PROMPTS = [
  { label: '📊 今日做了多少件', text: '我今天做了多少件？', cmd: false },
  { label: '💰 本周工资估算', text: '本周工资大概是多少？', cmd: false },
  { label: '📦 查询订单进度', text: '我负责的订单进度怎么样？', cmd: false },
  { label: '⏰ 哪些订单快要逾期', text: '哪些订单快要逾期了？', cmd: false },
];

// 管理员/跟单员快捷指令（查询 + 操作两类）
const MANAGER_PROMPTS = [
  { label: '⚠️ 查逾期订单', text: '当前有哪些逾期或高风险订单？', cmd: false },
  { label: '⏸ 暂停订单', text: '暂停订单 ', cmd: true },
  { label: '🚀 加急订单', text: '加急订单 ', cmd: true },
  { label: '📅 修改货期', text: '修改订单 ', cmd: true },
  { label: '📣 催工厂', text: '催促工厂跟进订单 ', cmd: true },
  { label: '✅ 审批通过', text: '审批通过订单 ', cmd: true },
  { label: '❌ 驳回', text: '驳回订单 ', cmd: true },
];

const MAX_MESSAGES = 30;

Page({
  data: {
    messages: [],
    inputText: '',
    sending: false,
    quickPrompts: WORKER_PROMPTS,
    conversationId: '',
    isManager: false,   // 管理员/跟单员角色
  },

  onLoad() {
    const isManager = isAdminOrSupervisor();
    const conversationId = 'mp_' + Date.now();
    const welcomeId = conversationId + '_w';
    const welcomeText = isManager
      ? '你好！我是小云 🤖\n可以帮你查逾期订单、分析风险，也可以直接下指令操作系统——如「暂停订单PO2026001」「催工厂跟进PO2026002」，我来帮你执行。'
      : '你好！我是你的 AI 助手 👋\n可以帮你查产量、估工资、看订单进度，有什么想问的尽管说～';
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
    if (!text || this.data.sending) return;
    this.setData({ inputText: '' });
    this._send(text);
  },

  async _send(text) {
    this._appendMsg({ role: 'user', text });
    const loadingId = this._appendMsg({ role: 'ai', text: '', loading: true });
    this.setData({ sending: true });

    try {
      let reply;
      if (this.data.isManager) {
        // 管理员走指令执行通道（LLM解析意图 → ExecutionEngine）
        const res = await api.intelligence.naturalLanguageExecute({
          naturalLanguageCommand: text,
          conversationId: this.data.conversationId,
        });
        const success = res && res.success;
        const msg = (res && (res.message || res.reply || res.content)) || '操作完成';
        reply = (success ? '✅ ' : '❌ ') + msg;
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
      const msg = (err && err.message) ? err.message : '网络异常，请稍后再试';
      this._updateMsg(loadingId, '⚠️ ' + msg);
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
