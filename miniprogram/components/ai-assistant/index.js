const api = require('../../utils/api.js');

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
    messages: [
      { id: Date.now(), role: 'ai', content: '您好！我是智能小云，有什么可以帮您的？' }
    ],
    isLoading: false,
    scrollTo: ''
  },
  methods: {
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
        const res = await api.intelligence.aiAdvisorChat({
          question: text
        });

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
