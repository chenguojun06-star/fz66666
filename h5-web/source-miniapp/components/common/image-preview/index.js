Component({
  properties: {
    src: { type: String, value: '' },
    mode: { type: String, value: 'aspectFill' },
    preview: { type: Boolean, value: true },
    placeholder: { type: String, value: '' }
  },
  data: {
    error: false,
    loaded: false,
    hasSrc: false,
  },
  lifetimes: {
    attached() {
      this.setData({ hasSrc: !!this.properties.src });
    }
  },
  observers: {
    'src': function (src) {
      this.setData({ hasSrc: !!src, error: false, loaded: false });
    }
  },
  methods: {
    onError() {
      this.setData({ error: true });
    },
    onLoad() {
      this.setData({ loaded: true });
    },
    onTap() {
      const { src, preview } = this.properties;
      if (!preview || !src) return;
      try {
        wx.previewImage({ current: src, urls: [src] });
      } catch (e) {
        // ignore
      }
    }
  }
});
