Component({
  properties: {
    icon:      { type: String,  value: 'icon-clipboard' }, // line-icon class name
    iconSize:  { type: String,  value: 'sm' },             // 'sm' | 'md' | 'lg' | ''
    iconEmoji: { type: String,  value: '' },               // emoji; overrides icon/iconSize if set
    // D-740：text/hint 放宽为 null——页面首渲染时 t.xxx 还是 undefined 会刷屏告警；渲染行为不变
    text:      { type: null,  value: '' },
    hint:      { type: null,  value: '' },
    card:      { type: Boolean, value: false },
  },
});
