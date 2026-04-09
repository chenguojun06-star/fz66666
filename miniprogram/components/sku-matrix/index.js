Component({
  properties: {
    sizeMatrix: {
      type: Object,
      value: { sizes: [], rows: [] }
    },
    // 'compact'：紧凑模式（表头显示"码数"，零值显示"-"，无滚动，适合卡片头部）
    // 'full'：完整模式（表头显示"颜色"，横向滚动，适合详情区段）
    mode: {
      type: String,
      value: 'compact'
    }
  }
});
