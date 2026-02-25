/**
 * 自定义日期选择器
 * 自己画的底部浮层，点击触发行 → 底部滑出三列滚轮 → 点确定回调
 * 不影响页面布局，不用系统原生 picker
 *
 * 用法：<date-picker value="{{date}}" bindchange="onDateChange" />
 * 事件：change → e.detail.value  格式 "YYYY-MM-DD"
 */
Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    value:       { type: String,  value: '' },
    placeholder: { type: String,  value: '请选择日期' },
    minYear:     { type: Number,  value: 2020 },
    maxYear:     { type: Number,  value: 2035 },
    clearable:   { type: Boolean, value: true },
  },

  data: {
    visible:      false,
    years:        [],
    months:       ['01','02','03','04','05','06','07','08','09','10','11','12'],
    days:         [],
    indices:      [0, 0, 0],
    displayValue: '',
    pendingValue: '',
  },

  lifetimes: {
    attached() { this._buildYears(); },
  },

  observers: {
    'value, minYear, maxYear'(val) {
      if (!this.data.years.length) this._buildYears();
      this._syncFromValue(val);
    },
  },

  methods: {
    _buildYears() {
      const years = [];
      for (let y = this.properties.minYear; y <= this.properties.maxYear; y++) years.push(String(y));
      this.setData({ years });
    },

    _daysInMonth(year, month) {
      return new Date(Number(year), Number(month), 0).getDate();
    },

    _buildDays(year, month) {
      const n = this._daysInMonth(year, month);
      const days = [];
      for (let d = 1; d <= n; d++) days.push(String(d).padStart(2, '0'));
      return days;
    },

    _syncFromValue(val) {
      const { years, months } = this.data;
      if (!years.length) return;
      const now = new Date();
      let year, month, day;
      if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        [year, month, day] = val.split('-');
      } else {
        year  = String(now.getFullYear());
        month = String(now.getMonth() + 1).padStart(2, '0');
        day   = String(now.getDate()).padStart(2, '0');
      }
      let yi = years.indexOf(year);
      if (yi < 0) yi = years.indexOf(String(now.getFullYear()));
      if (yi < 0) yi = 0;
      let mi = months.indexOf(month);
      if (mi < 0) mi = now.getMonth();
      const days = this._buildDays(years[yi], months[mi]);
      let di = days.indexOf(day);
      if (di < 0) di = 0;
      this.setData({ days, indices: [yi, mi, di], displayValue: val || '', pendingValue: val || (years[yi] + '-' + months[mi] + '-' + days[di]) });
    },

    onOpen() {
      if (!this.data.years.length) this._buildYears();
      if (!this.data.displayValue) {
        const n = new Date();
        this._syncFromValue(n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0'));
      }
      this.setData({ visible: true });
    },

    onCancel() { this.setData({ visible: false }); },

    onPickerChange(e) {
      const idx = e.detail.value;
      const { years, months } = this.data;
      const year = years[idx[0]], month = months[idx[1]];
      const days = this._buildDays(year, month);
      let di = idx[2];
      if (di >= days.length) di = days.length - 1;
      this.setData({ indices: [idx[0], idx[1], di], days, pendingValue: year + '-' + month + '-' + days[di] });
    },

    onConfirm() {
      const v = this.data.pendingValue;
      this.setData({ displayValue: v, visible: false });
      this.triggerEvent('change', { value: v });
    },

    onClear() {
      this.setData({ displayValue: '', pendingValue: '', visible: false });
      this.triggerEvent('change', { value: '' });
    },
  },
});
