/**
 * 性能优化（2026-04-21）：将记录按 30 条一组分块渲染，
 * 避免 srt-table-inner 一次性挂载过多直接子节点（>60 触发 WXML 性能告警）。
 * 表格行的 flex 列宽通过 .srt-chunk { display: contents } 维持原视觉效果。
 */
const CHUNK_SIZE = 30;

function buildChunks(records) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    chunks.push({
      key: i,
      items: records.slice(i, i + CHUNK_SIZE),
    });
  }
  return chunks;
}

Component({
  properties: {
    records: {
      type: Array,
      value: [],
      observer(records) {
        this.setData({ chunks: buildChunks(records) });
      },
    },
    showAmount: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    chunks: [],
  },
});
