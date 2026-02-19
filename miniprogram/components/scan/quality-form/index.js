/**
 * 质检表单组件
 *
 * 功能：
 * 1. 录入质检数据
 * 2. 合格数/次品数输入
 * 3. 数据验证
 */
Component({
  properties: {
    // 扫描记录信息
    scanInfo: {
      type: Object,
      value: null,
    },
    // 是否显示
    visible: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    qualifiedQuantity: '',
    defectQuantity: '',
    remark: '',
    loading: false,
  },

  methods: {
    /**
     * 合格数输入
     */
    onQualifiedInput(e) {
      this.setData({ qualifiedQuantity: e.detail.value });
    },

    /**
     * 次品数输入
     */
    onDefectInput(e) {
      this.setData({ defectQuantity: e.detail.value });
    },

    /**
     * 备注输入
     */
    onRemarkInput(e) {
      this.setData({ remark: e.detail.value });
    },

    /**
     * 提交质检数据
     */
    async onSubmit() {
      const { qualifiedQuantity, defectQuantity, remark } = this.data;

      // 验证数据
      if (!qualifiedQuantity && !defectQuantity) {
        wx.showToast({
          title: '请输入合格数或次品数',
          icon: 'none',
        });
        return;
      }

      const qualified = parseInt(qualifiedQuantity) || 0;
      const defect = parseInt(defectQuantity) || 0;

      if (qualified < 0 || defect < 0) {
        wx.showToast({
          title: '数量不能为负数',
          icon: 'none',
        });
        return;
      }

      // 触发提交事件
      this.triggerEvent('submit', {
        qualifiedQuantity: qualified,
        defectQuantity: defect,
        remark: remark,
      });

      // 重置表单
      this.resetForm();
    },

    /**
     * 取消
     */
    onCancel() {
      this.triggerEvent('cancel');
      this.resetForm();
    },

    /**
     * 重置表单
     */
    resetForm() {
      this.setData({
        qualifiedQuantity: '',
        defectQuantity: '',
        remark: '',
        loading: false,
      });
    },
  },
});
