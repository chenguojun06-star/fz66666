// D-302：共享尺寸表组件（只读查看）
// 行=部位 / 列=尺码（标准码序 XXS→5XL→F），横滚。
// 透视算法与 scan-result D-185 / order-detail D-252 同款；无款式资料或无尺寸数据时不渲染。
const api = require('../../utils/api.js');
// D-304：透视与码数排序统一走共享工具（数字码从小到大 + 度量方式列）
const { buildSizeSpec } = require('../../utils/sizeTableHelper.js');

Component({
  properties: {
    // 款式ID：有值才加载尺寸表
    styleId: {
      type: String,
      value: '',
      observer: function (val) {
        this._load(val);
      },
    },
  },

  data: {
    spec: null,
  },

  methods: {
    _load: function (styleId) {
      if (!styleId) return;
      // 同一 styleId 只拉一次（组件实例级缓存）
      if (this._loadedFor === styleId && this.data.spec) return;
      this._loadedFor = styleId;
      const self = this;
      api.style.listSizes({ styleId: styleId }).then(function (res) {
        const list = (res && res.data) || res || [];
        const spec = buildSizeSpec(Array.isArray(list) ? list : (list.records || []));
        self.setData({ spec: spec });
      }).catch(function (_err) {
        self.setData({ spec: null });
      });
    },
  },
});
