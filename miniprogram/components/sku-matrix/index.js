Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    sizeMatrix: {
      type: Object,
      value: { sizes: [], rows: [] }
    },
    mode: {
      type: String,
      value: 'compact'
    }
  }
});
