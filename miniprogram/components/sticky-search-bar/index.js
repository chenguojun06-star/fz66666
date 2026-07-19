/**
 * 通用 sticky 顶栏组件：搜索 + 扫码 + 筛选器 slot
 *
 * 与样衣开发页面 .sticky-top 样式对齐：
 * - 整体 sticky 吸顶
 * - 搜索框 + 扫码按钮在同一行
 * - 筛选器通过 slot 传入（调用方自定义内容）
 *
 * 用法：
 *   <sticky-search-bar
 *     placeholder="搜索款号/款式名"
 *     value="{{keyword}}"
 *     show-scan="{{true}}"
 *     show-filter="{{true}}"
 *     bind:input="onSearchInput"
 *     bind:confirm="onSearchConfirm"
 *     bind:clear="onSearchClear"
 *     bind:scan="onScan"
 *   >
 *     <view slot="filter" class="stat-tags">...</view>
 *   </sticky-search-bar>
 */
Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true,
  },
  properties: {
    /** 占位提示文字 */
    placeholder: { type: String, value: '搜索' },
    /** 当前搜索关键字（受控） */
    value: { type: String, value: '' },
    /** 是否显示扫码按钮 */
    showScan: { type: Boolean, value: true },
    /** 是否显示筛选器 slot */
    showFilter: { type: Boolean, value: true },
    /** 是否启用 sticky 吸顶。嵌入到已有 sticky 容器内时设为 false */
    sticky: { type: Boolean, value: true },
  },
  methods: {
    onInput: function (e) {
      this.triggerEvent('input', { value: e.detail.value });
    },
    onConfirm: function (e) {
      this.triggerEvent('confirm', { value: e.detail.value });
    },
    onClear: function () {
      this.triggerEvent('input', { value: '' });
      this.triggerEvent('clear');
    },
    onScan: function () {
      this.triggerEvent('scan');
    },
  },
});
