Component({
  properties: {
    keyword: {
      type: String,
      value: '',
    },
    results: {
      type: Array,
      value: [],
    },
    hasSearched: {
      type: Boolean,
      value: false,
    },
    placeholder: {
      type: String,
      value: '搜索订单号/款号/工厂/仓库',
    },
  },

  methods: {
    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value });
    },
    onSearch() {
      this.triggerEvent('search');
    },
    onClear() {
      this.triggerEvent('clear');
    },
    onClose() {
      this.triggerEvent('close');
    },
    onItemTap(e) {
      const item = e.currentTarget.dataset.item;
      this.triggerEvent('itemtap', { item });
    },
  },
});
