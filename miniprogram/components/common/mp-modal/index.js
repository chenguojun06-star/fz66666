// 通用弹窗组件 mp-modal
Component({
  properties: {
    /** 是否显示弹窗 */
    visible: {
      type: Boolean,
      value: false
    },
    /** 弹窗标题 */
    title: {
      type: String,
      value: ''
    },
    /**
     * 弹窗尺寸
     * - normal: 最大高度 80vh（默认）
     * - large:  最大高度 88vh（复杂表单/多tab）
     */
    size: {
      type: String,
      value: 'normal'
    },
    /** 是否显示右上角 × 关闭按钮 */
    showClose: {
      type: Boolean,
      value: true
    },
    /** 是否支持点击遮罩关闭 */
    maskClosable: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    /** 关闭按钮 / 遮罩 事件 */
    onClose() {
      this.triggerEvent('close');
    },
    onMaskTap() {
      if (this.data.maskClosable) {
        this.triggerEvent('close');
      }
    },
    /** 阻止内容区冒泡到遮罩 */
    stopProp() {}
  }
});
