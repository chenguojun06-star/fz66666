// ProcessKanbanDrawer 常量定义
// 抽离自原 ProcessKanbanDrawer.tsx，保持业务逻辑不变

/** 阶段颜色映射（使用 CSS 变量，符合 P0 铁律：禁止硬编码颜色） */
export const STAGE_COLORS: Record<string, string> = {
  '采购': 'var(--color-info)', '裁剪': 'var(--color-success)', '二次工艺': 'var(--color-accent-purple)',
  '车缝': 'var(--color-warning)', '尾部': '#eb2f96', '入库': 'var(--color-accent-cyan)',
};

/** 缺陷分类列表 */
export const DEFECT_CATEGORIES = [
  { value: 'appearance_integrity', label: '外观完整性问题' },
  { value: 'size_accuracy', label: '尺寸精度问题' },
  { value: 'process_compliance', label: '工艺规范性问题' },
  { value: 'functional_effectiveness', label: '功能有效性问题' },
  { value: 'other', label: '其他问题' },
];

/** 阶段-具体次品问题映射 */
export const STAGE_DEFECT_PROBLEMS: Record<string, { value: string; label: string }[]> = {
  '裁剪': [
    { value: '裁剪偏位', label: '裁剪偏位' },
    { value: '裁边不齐', label: '裁边不齐' },
    { value: '尺寸偏差', label: '尺寸偏差' },
    { value: '面料损伤', label: '面料损伤' },
    { value: '层数不齐', label: '层数不齐' },
    { value: '标记错位', label: '标记错位' },
  ],
  '二次工艺': [
    { value: '印花偏位', label: '印花偏位' },
    { value: '绣花跳针', label: '绣花跳针' },
    { value: '颜色差异', label: '颜色差异' },
    { value: '图案脱落', label: '图案脱落' },
    { value: '浆料渗透', label: '浆料渗透' },
    { value: '烫印起泡', label: '烫印起泡' },
  ],
  '车缝': [
    { value: '断线', label: '断线' },
    { value: '跳针', label: '跳针' },
    { value: '浮线', label: '浮线' },
    { value: '缝位偏移', label: '缝位偏移' },
    { value: '起皱', label: '起皱' },
    { value: '针距不匀', label: '针距不匀' },
    { value: '漏缝', label: '漏缝' },
    { value: '对位不准', label: '对位不准' },
  ],
  '尾部': [
    { value: '线头未剪干净', label: '线头未剪干净' },
    { value: '剪破面料', label: '剪破面料' },
    { value: '漏剪', label: '漏剪' },
    { value: '整烫不平', label: '整烫不平' },
    { value: '粘合衬起泡', label: '粘合衬起泡' },
    { value: '扣子松动', label: '扣子松动' },
    { value: '拉链不顺畅', label: '拉链不顺畅' },
    { value: '包装不良', label: '包装不良' },
  ],
  '入库': [
    { value: '外观瑕疵', label: '外观瑕疵' },
    { value: '尺寸不符', label: '尺寸不符' },
    { value: '色差', label: '色差' },
    { value: '工艺不规范', label: '工艺不规范' },
    { value: '标签错误', label: '标签错误' },
    { value: '包装破损', label: '包装破损' },
  ],
  '采购': [
    { value: '面料瑕疵', label: '面料瑕疵' },
    { value: '色差超标', label: '色差超标' },
    { value: '数量短缺', label: '数量短缺' },
    { value: '规格不符', label: '规格不符' },
    { value: '辅料缺失', label: '辅料缺失' },
  ],
};

/** 工序-具体次品问题映射（优先于阶段映射） */
export const PROCESS_DEFECT_PROBLEMS: Record<string, { value: string; label: string }[]> = {
  '剪线': [
    { value: '线头未剪干净', label: '线头未剪干净' },
    { value: '剪破面料', label: '剪破面料' },
    { value: '漏剪', label: '漏剪' },
  ],
  '整烫': [
    { value: '整烫不平', label: '整烫不平' },
    { value: '烫焦烫黄', label: '烫焦烫黄' },
    { value: '极光印', label: '极光印' },
  ],
  '包装': [
    { value: '包装不良', label: '包装不良' },
    { value: '标签错误', label: '标签错误' },
    { value: '包装破损', label: '包装破损' },
  ],
};
