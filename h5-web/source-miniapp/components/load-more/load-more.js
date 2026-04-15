Component({
  properties: {
    hasMore: { type: Boolean, value: true },
    loading: { type: Boolean, value: false },
    count:   { type: Number,  value: 0 }   // whole component hidden when 0
  },
  methods: {
    onTap() {
      if (!this.data.loading && this.data.hasMore) {
        this.triggerEvent('loadmore');
      }
    }
  }
});
