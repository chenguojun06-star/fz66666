/**
 * 可搜索选择器（底部弹层）—— 通用组件
 *
 * 为什么需要它（2026-09-23 用户反馈）：
 *   「这些选着 全部要支持搜索 固定的选着是最麻烦的 要找很久」
 *   微信原生 `<picker mode="selector">` **没有搜索** —— 选项一多（订单/工厂/领料人
 *   常常上百条）用户只能一路滚，极难用。
 *   全仓当时有 **53 个**这种"固定列表"选择器，本组件是统一替代方案。
 *
 * 用法（把原来的 <picker> 换成一行可点的 row，点击时打开本组件）：
 *   <view class="row" bindtap="openPicker" data-key="order">
 *     <text class="row-label">关联订单</text>
 *     <text class="row-value">{{orderNo || '请选择'}}</text>
 *     <text class="row-arrow">›</text>
 *   </view>
 *
 *   <search-picker
 *     visible="{{pickerVisible}}"
 *     title="{{pickerTitle}}"
 *     options="{{pickerOptions}}"
 *     value="{{pickerValue}}"
 *     bind:select="onPickerSelect"
 *     bind:close="onPickerClose"
 *   />
 *
 * options 支持两种写法：
 *   ['北京仓','广州仓']                        ← 纯字符串（最常用）
 *   [{ label: '北京仓', value: 'wh-1' }, ...]  ← 带 value
 *
 * 事件：
 *   bind:select → detail = { label, value }
 *   bind:close  → 关闭（点遮罩 / 关闭按钮 / 选中后都会触发）
 */
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: function (v) {
        if (v) {
          // 每次打开都清空搜索词，避免上次的残留把列表过滤空了
          // D-517：远程模式打开即以空关键字触发一次 search，父级负责拉第一页
          this._setKeyword('', true);
        } else {
          this._clearTimer();
        }
      },
    },
    title: { type: String, value: '请选择' },
    options: {
      type: Array,
      value: [],
      observer: function () {
        this._filter();
      },
    },
    /** 当前已选值（用于高亮打勾） */
    value: { type: String, value: '' },
    placeholder: { type: String, value: '输入关键字搜索' },
    /** D-517：true = 由父级按关键字请求接口（大数据量）；false = 本地过滤已加载数组 */
    remote: { type: Boolean, value: false },
    /** 父级请求中 → 显示加载态，并抑制重复 loadmore */
    loading: { type: Boolean, value: false },
    /** 是否还有下一页（remote 模式分页） */
    hasMore: { type: Boolean, value: false },
    /** 远程搜索防抖毫秒 */
    debounce: { type: Number, value: 300 },
  },

  data: {
    keyword: '',
    filtered: [],
  },

  methods: {
    _clearTimer: function () {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    },

    /**
     * @param {string} kw 关键字
     * @param {boolean} immediate true = 跳过防抖立刻触发（打开弹层时）
     */
    _setKeyword: function (kw, immediate) {
      this._clearTimer();
      var next = kw || '';
      this.setData({ keyword: next });
      if (this.data.remote) {
        var self = this;
        if (immediate) {
          this.triggerEvent('search', { keyword: next });
          return;
        }
        this._timer = setTimeout(function () {
          self._timer = null;
          self.triggerEvent('search', { keyword: next });
        }, Number(self.data.debounce) || 300);
        return;
      }
      this._filter();
    },

    /** 归一化 + 按关键字过滤（label 和 value 都参与匹配） */
    _filter: function () {
      var kw = String(this.data.keyword || '').trim().toLowerCase();
      var opts = this.data.options || [];
      var out = [];
      for (var i = 0; i < opts.length; i++) {
        var o = opts[i];
        var label = (o && typeof o === 'object') ? String(o.label == null ? '' : o.label) : String(o == null ? '' : o);
        var val = (o && typeof o === 'object') ? String(o.value == null ? label : o.value) : label;
        if (!label) continue;
        if (!kw || label.toLowerCase().indexOf(kw) >= 0 || val.toLowerCase().indexOf(kw) >= 0) {
          // _key 保证 wx:key 唯一（同名选项不会互相顶掉）
          out.push({ label: label, value: val, _key: val + '#' + i, _index: i });
        }
      }
      this.setData({ filtered: out });
    },

    onInput: function (e) {
      this._setKeyword(e.detail.value);
    },

    onClearKeyword: function () {
      this._setKeyword('');
    },

    onSelect: function (e) {
      var idx = Number(e.currentTarget.dataset.index);
      var item = this.data.filtered[idx];
      if (!item) return;
      // D-517：回传原始项（raw），父级可直接拿到 id/订单号等附加字段，不必再按名称反查
      var raw = (this.data.options || [])[item._index];
      this.triggerEvent('select', {
        label: item.label,
        value: item.value,
        index: idx,
        item: raw || item,
      });
      this.triggerEvent('close');
    },

    /** D-517：列表滚到底 → 父级追加下一页（仅远程模式） */
    onLoadMore: function () {
      if (!this.data.remote) return;
      if (this.data.loading || !this.data.hasMore) return;
      this.triggerEvent('loadmore', { keyword: this.data.keyword || '' });
    },

    onClose: function () {
      this.triggerEvent('close');
    },

    /** 点面板本体不应关闭（配合遮罩的 bindtap） */
    noop: function () {},
  },
});
