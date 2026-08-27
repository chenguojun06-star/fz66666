/**
 * 洗水唛分区配置面板（共享组件）
 *
 * 分区（从上到下）：码数 → 款号 → 面料成份 → 洗涤方法（上排图标/下排文字）→ 制造区域
 * 每个分区由用户自行决定是否显示；内容全部用户输入，只显示输入的内容。
 * 顶部"距剪口偏移"控制内容从剪口下方多少 mm 开始打印（默认 30mm）。
 * 右侧实时预览打印效果（与实际打印 HTML 完全一致）。
 */
import { useMemo } from 'react';
import { Checkbox, Input, InputNumber, Slider, Space, Tooltip } from 'antd';
import { CARE_CATEGORIES, CARE_ICONS } from '@/utils/careIcons';
import { buildWashLabelPrintHtml, estimateAdaptedFontSize } from '@/utils/washLabelPrintTemplate';

export interface WashLabelSectionState {
  showSize: boolean;
  sizeText: string;
  showStyleNo: boolean;
  styleNoText: string;
  showComposition: boolean;
  compositionText: string;
  showWash: boolean;
  washText: string;
  careIconCodes: string[];
  showManufacturing: boolean;
  manufacturingText: string;
  /** 距剪口偏移（mm），内容从此处开始打印 */
  topOffsetMm: number;
  /** 全局字体缩放（0.5~1.6，默认 1）：用户自由调整所有分区字号，拖动直接生效 */
  fontScale: number;
  /** 行距/上下间距缩放（0.7~1.8，默认 1）：用户自由调整行与行之间、各分区上下之间的距离 */
  lineHeightScale: number;
  /** 上部（码数/款号/成份）与洗涤区之间的间隔（mm，0~50）：0=紧凑；用户自选距离 */
  sectionGapMm: number;
  /** 是否显示日期：勾选显示（默认填充当天，可编辑），不勾选不显示 */
  showDate: boolean;
  /** 日期文本（如 2026-08-27） */
  dateText: string;
}

/** 今天日期（yyyy-MM-dd）：勾选日期时作为默认值（打印入口空值回落共用） */
export function todayText(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 从款式/订单数据构建默认分区状态（用户可在面板中自由修改） */
export function buildDefaultSections(defaults: {
  sizeText?: string;
  styleNoText?: string;
  compositionText?: string;
  washText?: string;
  careIconCodes?: string[];
  manufacturingText?: string;
  topOffsetMm?: number;
  fontScale?: number;
  lineHeightScale?: number;
  sectionGapMm?: number;
  showDate?: boolean;
  dateText?: string;
}): WashLabelSectionState {
  return {
    showSize: Boolean(defaults.sizeText?.trim()),
    sizeText: defaults.sizeText ?? '',
    showStyleNo: Boolean(defaults.styleNoText?.trim()),
    styleNoText: defaults.styleNoText ?? '',
    showComposition: Boolean(defaults.compositionText?.trim()),
    compositionText: defaults.compositionText ?? '',
    showWash: Boolean((defaults.washText ?? '').trim() || (defaults.careIconCodes ?? []).length > 0),
    washText: defaults.washText ?? '',
    careIconCodes: defaults.careIconCodes ?? [],
    showManufacturing: Boolean(defaults.manufacturingText?.trim()),
    manufacturingText: defaults.manufacturingText ?? '',
    topOffsetMm: defaults.topOffsetMm ?? 30,
    fontScale: defaults.fontScale ?? 1,
    lineHeightScale: defaults.lineHeightScale ?? 1,
    sectionGapMm: defaults.sectionGapMm ?? 0,
    showDate: defaults.showDate ?? false,
    dateText: defaults.dateText ?? '',
  };
}

interface Props {
  value: WashLabelSectionState;
  onChange: (v: WashLabelSectionState) => void;
  /** 纸张宽度 mm（预览用） */
  width: number;
  /** 纸张高度 mm（预览用） */
  height: number;
  /** 预览用的码数（批量多码场景下取选中行码数；不传则用 value.sizeText） */
  previewSizeText?: string;
}

const sectionLabelStyle: React.CSSProperties = {
  width: 76,
  flexShrink: 0,
  fontSize: 14,
};

export default function WashLabelSectionConfigPanel({ value, onChange, width, height, previewSizeText }: Props) {
  const patch = (p: Partial<WashLabelSectionState>) => onChange({ ...value, ...p });

  const previewData = useMemo(() => {
    const previewSize = previewSizeText !== undefined ? previewSizeText : value.sizeText;
    return {
      width,
      height,
      sizeText: value.showSize ? previewSize : '',
      styleNo: value.showStyleNo ? value.styleNoText : '',
      compositionText: value.showComposition ? value.compositionText : '',
      washInstructionsText: value.showWash ? value.washText : '',
      careIconCodes: value.showWash ? value.careIconCodes : [],
      manufacturingText: value.showManufacturing ? value.manufacturingText : '',
      dateText: value.showDate ? (value.dateText || todayText()) : '',
      topOffsetMm: value.topOffsetMm,
      fontScale: value.fontScale,
      lineHeightScale: value.lineHeightScale,
      sectionGapMm: value.sectionGapMm,
    };
  }, [value, width, height, previewSizeText]);

  const previewHtml = useMemo(() => buildWashLabelPrintHtml(previewData), [previewData]);
  /** 最终打印字号：字号滑块直接生效，内容稍多时仅做轻微防溢出微调 */
  const adaptedFs = useMemo(() => estimateAdaptedFontSize(previewData), [previewData]);
  /** 用户期望字号（= 理想字号×字号缩放），用于判断是否被防溢出轻微调小了 */
  const expectedFs = Math.round(Math.min(Math.max(width * 0.25, 7), 13) * (value.fontScale ?? 1) * 10) / 10;
  const isShrunk = adaptedFs < expectedFs - 0.01;

  /** 图标点击：已选则取消，未选则追加 */
  const toggleIcon = (code: string) => {
    const has = value.careIconCodes.includes(code);
    patch({ careIconCodes: has ? value.careIconCodes.filter(c => c !== code) : [...value.careIconCodes, code] });
  };

  const iconCellStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 4, cursor: 'pointer', padding: 3,
    border: '1px solid var(--color-border-antd)',
    background: 'var(--color-bg-base)',
  };
  const iconCellActiveStyle: React.CSSProperties = {
    ...iconCellStyle,
    border: '1.5px solid var(--color-primary)',
    background: 'var(--status-processing-bg)',
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* 左：分区配置 */}
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>距剪口偏移</span>
          <InputNumber
            min={0} max={Math.max(0, height - 10)} value={value.topOffsetMm}
            onChange={v => patch({ topOffsetMm: v ?? 0 })} suffix="mm" style={{ width: 110 }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>内容从剪口下方此处开始打印</span>
        </div>

        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>字体大小</span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Slider
              min={0.5} max={1.6} step={0.05} value={value.fontScale}
              onChange={v => patch({ fontScale: v })} style={{ flex: 1, margin: 0 }}
              tooltip={{ formatter: (v) => `${Math.round((v ?? 1) * 100)}%` }}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 52, flexShrink: 0 }}>
              {Math.round(value.fontScale * 100)}%
            </span>
          </div>
        </div>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', width: 76, flexShrink: 0 }}>行距/上下间距</span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Slider
              min={0.7} max={1.8} step={0.05} value={value.lineHeightScale}
              onChange={v => patch({ lineHeightScale: v })} style={{ flex: 1, margin: 0 }}
              tooltip={{ formatter: (v) => `${Math.round((v ?? 1) * 100)}%` }}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 52, flexShrink: 0 }}>
              {Math.round(value.lineHeightScale * 100)}%
            </span>
          </div>
        </div>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', width: 76, flexShrink: 0 }}>成份-洗涤间隔</span>
          <InputNumber
            min={0} max={50} step={1} value={value.sectionGapMm}
            onChange={v => patch({ sectionGapMm: v ?? 0 })} suffix="mm" style={{ width: 110 }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>上部成份与洗涤图标之间的距离，0=紧凑</span>
        </div>
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          当前打印字号 <span style={{ color: 'var(--color-text-secondary)' }}>{adaptedFs}pt</span>
          {isShrunk
            ? '（内容稍多已轻微调小以保证完整显示，可调小偏移或行距，或精简文字）'
            : '（字号与行距可随时拖动上方滑块调整）'}
        </div>

        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Checkbox
            checked={value.showSize}
            onChange={e => patch({ showSize: e.target.checked })}
            style={sectionLabelStyle}
          >
            码数
          </Checkbox>
          {value.showSize && (
            <Input
              value={value.sizeText}
              onChange={e => patch({ sizeText: e.target.value })}
              placeholder="输入码数，如 S / M / L"
              maxLength={30} style={{ flex: 1 }}
            />
          )}
        </div>

        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Checkbox
            checked={value.showStyleNo}
            onChange={e => patch({ showStyleNo: e.target.checked })}
            style={sectionLabelStyle}
          >
            款号
          </Checkbox>
          {value.showStyleNo && (
            <Input
              value={value.styleNoText}
              onChange={e => patch({ styleNoText: e.target.value })}
              placeholder="输入款号"
              maxLength={50} style={{ flex: 1 }}
            />
          )}
        </div>

        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Checkbox
            checked={value.showComposition}
            onChange={e => patch({ showComposition: e.target.checked })}
            style={sectionLabelStyle}
          >
            面料成份
          </Checkbox>
          {value.showComposition && (
            <Input.TextArea
              value={value.compositionText}
              onChange={e => patch({ compositionText: e.target.value })}
              placeholder="输入面料成份，如 面料：100%棉"
              rows={3} style={{ flex: 1 }} maxLength={200}
            />
          )}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Checkbox
              checked={value.showWash}
              onChange={e => patch({ showWash: e.target.checked })}
              style={sectionLabelStyle}
            >
              洗涤方法
            </Checkbox>
            {value.showWash && (
              <Input.TextArea
                value={value.washText}
                onChange={e => patch({ washText: e.target.value })}
                placeholder="输入洗涤说明文字（显示在图标下方）"
                rows={3} style={{ flex: 1 }} maxLength={200}
              />
            )}
          </div>
          {value.showWash && (
            <div style={{ marginLeft: 84, marginTop: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
                洗涤图标（点击选择/取消，显示在文字上方一排）：
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CARE_CATEGORIES.map(cat => (
                  <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)', width: 44, flexShrink: 0 }}>{cat.label}</span>
                    <Space wrap size={4}>
                      {cat.codes.map(code => {
                        const icon = CARE_ICONS[code];
                        const active = value.careIconCodes.includes(code);
                        return (
                          <Tooltip key={code} title={icon?.label || code}>
                            <span
                              style={active ? iconCellActiveStyle : iconCellStyle}
                              onClick={() => toggleIcon(code)}
                              dangerouslySetInnerHTML={{ __html: icon?.svg || '' }}
                            />
                          </Tooltip>
                        );
                      })}
                    </Space>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Checkbox
            checked={value.showManufacturing}
            onChange={e => patch({ showManufacturing: e.target.checked })}
            style={sectionLabelStyle}
          >
            制造区域
          </Checkbox>
          {value.showManufacturing && (
            <Input
              value={value.manufacturingText}
              onChange={e => patch({ manufacturingText: e.target.value })}
              placeholder="输入制造信息，如 MADE IN CHINA"
              maxLength={60} style={{ flex: 1 }}
            />
          )}
        </div>

        <div style={{ marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Checkbox
            checked={value.showDate}
            onChange={e => {
              const checked = e.target.checked;
              patch({ showDate: checked, dateText: checked && !value.dateText ? todayText() : value.dateText });
            }}
            style={sectionLabelStyle}
          >
            日期
          </Checkbox>
          {value.showDate && (
            <Input
              value={value.dateText || todayText()}
              onChange={e => patch({ dateText: e.target.value })}
              placeholder="打印当天日期，可自行修改"
              maxLength={20} style={{ flex: 1 }}
            />
          )}
        </div>
      </div>

      {/* 右：实时预览（与打印 HTML 一致） */}
      <div style={{ flexShrink: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>打印预览</div>
        <iframe
          title="洗水唛预览"
          srcDoc={previewHtml}
          style={{
            width: 140, height: Math.min(420, Math.round(140 * height / width)),
            border: '1px solid var(--color-border-antd)', borderRadius: 4,
            background: '#fff',
          }}
        />
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          {width}×{height}mm · 偏移{value.topOffsetMm}mm · 字号{adaptedFs}pt · 行距{Math.round(value.lineHeightScale * 100)}%
        </div>
      </div>
    </div>
  );
}
