Component({
  properties: {
    icon:      { type: String,  value: 'icon-clipboard' }, // line-icon class name
    iconSize:  { type: String,  value: 'sm' },             // 'sm' | 'md' | 'lg' | ''
    iconEmoji: { type: String,  value: '' },               // emoji; overrides icon/iconSize if set
    text:      { type: String,  value: '' },
    hint:      { type: String,  value: '' },
    card:      { type: Boolean, value: false },
  },
});
