/**
 * 性能优化（2026-04-21）：将记录按 30 条一组分块渲染，
 * 避免 srt-table-inner 一次性挂载过多直接子节点（>60 触发 WXML 性能告警）。
 * 表格行的 flex 列宽通过 .srt-chunk { display: contents } 维持原视觉效果。
 */
const CHUNK_SIZE = 30;
const { getFieldValue, formatFieldValue, filterCustomFields } = require('../../utils/api-modules/field-config-helpers');

function buildChunks(records, extColumns) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const slice = records.slice(i, i + CHUNK_SIZE);
    // 预计算扩展字段显示值，避免 WXML 中调用函数
    if (extColumns && extColumns.length > 0) {
      slice.forEach(rec => {
        if (!rec._extDisplay) {
          const display = {};
          extColumns.forEach(f => {
            const val = getFieldValue(rec, f.fieldKey);
            display[f.fieldKey] = formatFieldValue(val, f.fieldType, f.optionsJson);
          });
          rec._extDisplay = display;
        }
      });
    }
    chunks.push({ key: i, items: slice });
  }
  return chunks;
}

Component({
  properties: {
    records: {
      type: Array,
      value: [],
      observer(records) {
        this.setData({ chunks: buildChunks(records, this.data._extColumns) });
      },
    },
    showAmount: {
      type: Boolean,
      value: false,
    },
    /** 扩展字段配置（扫码业务对象的自定义字段） */
    extFields: {
      type: Array,
      value: [],
      observer(val) {
        const fields = filterCustomFields(val);
        this.setData({ _extColumns: fields, chunks: buildChunks(this.data.records, fields) });
      },
    },
  },
  data: {
    chunks: [],
    _extColumns: [],
  },
});
