import React from 'react';
import { Card, Button, Space, InputNumber, Collapse, Popconfirm, Slider, Switch, Input, Select, Dropdown } from 'antd';
import { PrinterOutlined, SettingOutlined, SaveOutlined, BookOutlined, DeleteOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import type { PrintType } from '../types';
import type { HangSettings, BarSettings, WashSettings } from '../constants';
import type { OrderInfo } from '../types';

interface PrintSettingsPanelProps {
  selectedOrder: OrderInfo;
  printType: PrintType;
  printCount: number;
  setPrintCount: React.Dispatch<React.SetStateAction<number>>;
  printing: boolean;
  ptLabel: string;
  onPrint: () => void;
  onOpenSaveTemplate: () => void;
  templates: any[];
  onSetDefaultTemplate: (id: number) => void;
  onDeleteTemplate: (id: number) => void;
  onLoadTemplate: (tpl: any) => void;
  hang: HangSettings;
  setHang: React.Dispatch<React.SetStateAction<HangSettings>>;
  bar: BarSettings;
  setBar: React.Dispatch<React.SetStateAction<BarSettings>>;
  wash: WashSettings;
  setWash: React.Dispatch<React.SetStateAction<WashSettings>>;
  resetSettings: () => void;
}

const sizePresets: Record<PrintType, { w: number; h: number; label: string }[]> = {
  hangtag: [{ w: 100, h: 70, label: '100×70' }, { w: 90, h: 60, label: '90×60' }, { w: 110, h: 80, label: '110×80' }, { w: 80, h: 50, label: '80×50' }],
  barcode: [{ w: 40, h: 20, label: '40×20' }, { w: 50, h: 25, label: '50×25' }, { w: 60, h: 30, label: '60×30' }],
  washlabel: [{ w: 30, h: 80, label: '30×80' }, { w: 40, h: 60, label: '40×60' }, { w: 50, h: 80, label: '50×80' }, { w: 60, h: 90, label: '60×90' }],
};

const PrintSettingsPanel: React.FC<PrintSettingsPanelProps> = ({
  selectedOrder,
  printType,
  printCount,
  setPrintCount,
  printing,
  ptLabel,
  onPrint,
  onOpenSaveTemplate,
  templates,
  onSetDefaultTemplate,
  onDeleteTemplate,
  onLoadTemplate,
  hang,
  setHang,
  bar,
  setBar,
  wash,
  setWash,
  resetSettings,
}) => {
  const toggleRow = <T,>(
    label: string,
    field: string,
    checked: boolean,
    setter: (updater: (prev: T) => T) => void
  ) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <Switch size="small" checked={checked} onChange={v => setter(prev => ({ ...prev, [field]: v }))} />
    </div>
  );

  return (
    <>
      <Card title="打印设置" size="small" style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>打印数量</div>
          <InputNumber min={1} max={999} value={printCount} onChange={v => setPrintCount(v || 1)} style={{ width: '100%' }} />
        </div>
        <Button type="primary" icon={<PrinterOutlined />} loading={printing} onClick={() => void onPrint()} block>
          打印{ptLabel} ({printCount}张)
        </Button>
        <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
          <Button size="small" icon={<SaveOutlined />} style={{ flex: 1 }} onClick={onOpenSaveTemplate}>保存模板</Button>
          {templates.length > 0 && (
            <Dropdown menu={{ items: templates.map(tpl => ({
              key: tpl.id,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span>{tpl.templateName}{tpl.isDefault ? <StarFilled style={{ marginLeft: 4 }} /> : null}</span>
                  <Space size={2}>
                    <Button type="link" size="small" icon={<StarOutlined />} onClick={e => { e.stopPropagation(); onSetDefaultTemplate(tpl.id); }} />
                    <Popconfirm title="确定删除此模板吗？" onConfirm={() => onDeleteTemplate(tpl.id)} okText="确定" cancelText="取消">
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
                    </Popconfirm>
                  </Space>
                </div>
              ),
              onClick: () => onLoadTemplate(tpl),
            })) }} trigger={['click']}>
              <Button size="small" icon={<BookOutlined />} style={{ flex: 1 }}>加载模板</Button>
            </Dropdown>
          )}
        </div>
      </Card>

      <Collapse size="small" ghost items={[{
        key: 'settings', label: <span><SettingOutlined style={{ marginRight: 6 }} />{ptLabel}自定义</span>,
        children: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>尺寸 (mm)</div>
              <Space wrap size={4} style={{ marginBottom: 4 }}>
                {sizePresets[printType].map(p => (
                  <Button key={p.label} size="small"
                    type={printType === 'hangtag' ? (hang.w === p.w && hang.h === p.h ? 'primary' : 'default')
                        : printType === 'barcode' ? (bar.w === p.w && bar.h === p.h ? 'primary' : 'default')
                        : (wash.w === p.w && wash.h === p.h ? 'primary' : 'default')}
                    onClick={() => {
                      if (printType === 'hangtag') setHang(h => ({ ...h, w: p.w, h: p.h }));
                      else if (printType === 'barcode') setBar(b => ({ ...b, w: p.w, h: p.h }));
                      else setWash(w => ({ ...w, w: p.w, h: p.h }));
                    }}>{p.label}</Button>
                ))}
              </Space>
              <Space.Compact>
                <InputNumber size="small" min={20} max={200}
                  value={printType === 'hangtag' ? hang.w : printType === 'barcode' ? bar.w : wash.w}
                  onChange={v => { if (printType === 'hangtag') setHang(h => ({ ...h, w: v || 100 })); else if (printType === 'barcode') setBar(b => ({ ...b, w: v || 40 })); else setWash(w => ({ ...w, w: v || 90 })); }}
                  style={{ width: 68 }} placeholder="宽" />
                <InputNumber size="small" min={10} max={200}
                  value={printType === 'hangtag' ? hang.h : printType === 'barcode' ? bar.h : wash.h}
                  onChange={v => { if (printType === 'hangtag') setHang(h => ({ ...h, h: v || 70 })); else if (printType === 'barcode') setBar(b => ({ ...b, h: v || 20 })); else setWash(w => ({ ...w, h: v || 40 })); }}
                  style={{ width: 68 }} placeholder="高" />
              </Space.Compact>
            </div>

            {printType === 'barcode' && (<>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>码类型</div>
                <Select
                  value={bar.codeType}
                  onChange={v => setBar(b => ({ ...b, codeType: v }))}
                  style={{ width: '100%' }}
                  options={[
                    { label: '二维码 (QR)', value: 'qr' },
                    { label: '条形码 (Code128)', value: 'barcode128' },
                  ]}
                />
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>编码字号: {bar.codeSz}pt</div>
                <Slider min={5} max={14} step={0.5} value={bar.codeSz} onChange={v => setBar(b => ({ ...b, codeSz: v }))} />
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>文字字号: {bar.textSz}pt</div>
                <Slider min={4} max={10} step={0.5} value={bar.textSz} onChange={v => setBar(b => ({ ...b, textSz: v }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 14 }}>显示款式名</span><Switch size="small" checked={bar.showName} onChange={v => setBar(b => ({ ...b, showName: v }))} /></div>
            </>)}

            {printType === 'washlabel' && (<>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>距剪口偏移（内容从此处开始打印）</div>
                <InputNumber size="small" min={0} max={Math.max(0, wash.h - 10)} value={wash.topOffsetMm}
                  onChange={v => setWash(w => ({ ...w, topOffsetMm: v ?? 0 }))} suffix="mm" style={{ width: '100%' }} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>字体大小: {Math.round((wash.fontScale ?? 1) * 100)}%（拖动直接生效）</div>
                <Slider min={0.5} max={1.6} step={0.05} value={wash.fontScale ?? 1}
                  onChange={v => setWash(w => ({ ...w, fontScale: v }))} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>行距/上下间距: {Math.round((wash.lineHeightScale ?? 1) * 100)}%</div>
                <Slider min={0.7} max={1.8} step={0.05} value={wash.lineHeightScale ?? 1}
                  onChange={v => setWash(w => ({ ...w, lineHeightScale: v }))} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>成份-洗涤间隔（0=紧凑）</div>
                <InputNumber size="small" min={0} max={50} step={1} value={wash.sectionGapMm ?? 0}
                  onChange={v => setWash(w => ({ ...w, sectionGapMm: v ?? 0 }))} suffix="mm" style={{ width: '100%' }} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>码数（只打印你输入的内容）</div>
                <Input size="small" value={wash.sizeText} placeholder="如 S / M / L，留空不显示"
                  onChange={e => setWash(w => ({ ...w, sizeText: e.target.value }))} maxLength={30} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>款号（留空=使用订单款号）</div>
                <Input size="small" value={wash.styleNoText} placeholder="留空自动使用订单款号"
                  onChange={e => setWash(w => ({ ...w, styleNoText: e.target.value }))} maxLength={50} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>制造区域（只打印你输入的内容）</div>
                <Input size="small" value={wash.manufacturingText} placeholder="如 MADE IN CHINA，留空不显示"
                  onChange={e => setWash(w => ({ ...w, manufacturingText: e.target.value }))} maxLength={30} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>日期（只打印你输入的内容）</div>
                <Input size="small" value={wash.dateText} placeholder="如：20260605，留空不显示"
                  onChange={e => setWash(w => ({ ...w, dateText: e.target.value }))} maxLength={20} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text-quaternary)', margin: '6px 0 4px', fontWeight: 600 }}>显示内容</div>
              <Space orientation="vertical" style={{ width: '100%' }} size={2}>
                {toggleRow('码数', 'showSize', wash.showSize, setWash)}
                {toggleRow('款号', 'showStyleNo', wash.showStyleNo, setWash)}
                {toggleRow('面料成分', 'showComposition', wash.showComposition, setWash)}
                {toggleRow('洗涤图标', 'showCareIcons', wash.showCareIcons, setWash)}
                {toggleRow('洗涤文字', 'showWashInstructions', wash.showWashInstructions, setWash)}
                {toggleRow('制造区域', 'showManufacturing', wash.showManufacturing, setWash)}
                {toggleRow('日期', 'showDate', wash.showDate, setWash)}
              </Space>
            </>)}

            <Popconfirm title="确定恢复默认设置吗？" onConfirm={resetSettings} okText="确定" cancelText="取消">
              <Button size="small" type="link" danger style={{ marginTop: 6, padding: 0 }}>恢复默认</Button>
            </Popconfirm>
          </div>
        ),
      }]} />
    </>
  );
};

export default PrintSettingsPanel;
