Component({
  properties: {
    placeholder: { type: String, value: '搜索订单号/款号' },
    value: { type: String, value: '' },
    showScan: { type: Boolean, value: true },
  },
  methods: {
    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value });
    },
    onConfirm(e) {
      this.triggerEvent('confirm', { value: e.detail.value });
    },
    onClear() {
      this.triggerEvent('input', { value: '' });
      this.triggerEvent('clear');
    },
    onScan() {
      this.triggerEvent('scan');
    },
  },
});
