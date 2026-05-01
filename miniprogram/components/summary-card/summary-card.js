Component({
  properties: {
    title: { type: String, value: '' },
    items: { type: Array,  value: [] },   // [{ label, value, highlight? }]
  },
  data: {
    rows: [],
  },
  observers: {
    'items': function(items) {
      const rows = [];
      for (let i = 0; i < items.length; i += 2) {
        rows.push(items.slice(i, i + 2));
      }
      this.setData({ rows });
    },
  },
});
