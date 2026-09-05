// D-302：共享尺寸表组件（只读查看）
// 行=部位 / 列=尺码（标准码序 XXS→5XL→F），横滚。
// 透视算法与 scan-result D-185 / order-detail D-252 同款；无款式资料或无尺寸数据时不渲染。
const api = require('../../utils/api.js');

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
        const spec = self._buildSpec(Array.isArray(list) ? list : (list.records || []));
        self.setData({ spec: spec });
      }).catch(function (_err) {
        self.setData({ spec: null });
      });
    },

    /** 尺寸表透视：行=部位、列=尺码，尺码按标准码序排序 */
    _buildSpec: function (rawList) {
      if (!Array.isArray(rawList) || rawList.length === 0) return null;
      const sizeSeen = {};
      const sizeCols = [];
      rawList.forEach(function (it) {
        const sz = (it && (it.sizeName || it.baseSize)) || '';
        if (sz && !sizeSeen[sz]) { sizeSeen[sz] = true; sizeCols.push(sz); }
      });
      if (sizeCols.length === 0) return null;
      const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL', 'F', 'OS'];
      sizeCols.sort(function (a, b) {
        const ia = sizeOrder.indexOf(String(a).toUpperCase());
        const ib = sizeOrder.indexOf(String(b).toUpperCase());
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return String(a).localeCompare(String(b));
      });
      const partSeen = {};
      const parts = [];
      rawList.forEach(function (it) {
        const p = (it && (it.partName || it.part)) || '';
        if (p && !partSeen[p]) { partSeen[p] = true; parts.push(p); }
      });
      const valueMap = {};
      rawList.forEach(function (it) {
        const p = (it && (it.partName || it.part)) || '';
        const sz = (it && (it.sizeName || it.baseSize)) || '';
        if (p && sz) {
          valueMap[p + '|' + sz] = it.standardValue != null ? it.standardValue : (it.value != null ? it.value : '-');
        }
      });
      const rows = parts.map(function (p) {
        return {
          part: p,
          values: sizeCols.map(function (sz) { return valueMap[p + '|' + sz] || '-'; }),
        };
      });
      return { sizeCols: sizeCols, rows: rows };
    },
  },
});
