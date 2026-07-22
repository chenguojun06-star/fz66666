import React from 'react';
import { Card, Button, Space, InputNumber, Collapse, Slider, Switch, Input, Select, Dropdown } from 'antd';
import { PrinterOutlined, SettingOutlined, SaveOutlined, BookOutlined, DeleteOutlined, StarOutlined } from '@ant-design/icons';
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
                  <span>{tpl.templateName}{tpl.isDefault ? ' ★' : ''}</span>
                  <Space size={2}>
                    <Button type="link" size="small" icon={<StarOutlined />} onClick={e => { e.stopPropagation(); onSetDefaultTemplate(tpl.id); }} />
                    <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={e => { e.stopPropagation(); onDeleteTemplate(tpl.id); }} />
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

            {printType === 'hangtag' && (<>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>品牌名（留空=使用款名）</div>
                <Input size="small" value={hang.brandName} placeholder={selectedOrder.styleName || selectedOrder.styleNo}
                  onChange={e => setHang(h => ({ ...h, brandName: e.target.value }))} maxLength={20} />
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>标题字号: {hang.titleSz}pt</div>
                <Slider min={8} max={20} step={0.5} value={hang.titleSz} onChange={v => setHang(h => ({ ...h, titleSz: v }))} />
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>信息字号: {hang.infoSz}pt</div>
                <Slider min={5} max={12} step={0.5} value={hang.infoSz} onChange={v => setHang(h => ({ ...h, infoSz: v }))} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text-quaternary)', margin: '6px 0 4px', fontWeight: 600 }}>显示内容</div>
              <Space orientation="vertical" style={{ width: '100%' }} size={2}>
                {toggleRow('款号', 'showStyleNo', hang.showStyleNo, setHang)}
                {toggleRow('颜色尺码', 'showColorSize', hang.showColorSize, setHang)}
                {toggleRow('成分', 'showComposition', hang.showComposition, setHang)}
                {toggleRow('质量等级', 'showQualityGrade', hang.showQualityGrade, setHang)}
                {toggleRow('执行标准', 'showExecuteStandard', hang.showExecuteStandard, setHang)}
                {toggleRow('安全类别', 'showSafetyCategory', hang.showSafetyCategory, setHang)}
                {toggleRow('检验员', 'showInspector', hang.showInspector, setHang)}
                {toggleRow('检验日期', 'showInspectionDate', hang.showInspectionDate, setHang)}
                {toggleRow('价格', 'showPrice', hang.showPrice, setHang)}
                {toggleRow('商品编码', 'showUCode', hang.showUCode, setHang)}
                {toggleRow('订单号', 'showOrderNo', hang.showOrderNo, setHang)}
                {toggleRow('商品图', 'showImage', hang.showImage, setHang)}
                {toggleRow('二维码', 'showQr', hang.showQr, setHang)}
                {toggleRow('条形码', 'showBarcode', hang.showBarcode, setHang)}
              </Space>
            </>)}

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
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>制造地</div>
                <Input size="small" value={wash.manufacturingText} placeholder="MADE IN CHINA"
                  onChange={e => setWash(w => ({ ...w, manufacturingText: e.target.value }))} maxLength={30} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>日期（留空=自动使用今天）</div>
                <Input size="small" value={wash.dateText} placeholder="如：20260605"
                  onChange={e => setWash(w => ({ ...w, dateText: e.target.value }))} maxLength={20} />
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text-quaternary)', margin: '6px 0 4px', fontWeight: 600 }}>显示内容</div>
              <Space orientation="vertical" style={{ width: '100%' }} size={2}>
                {toggleRow('面料成分', 'showComposition', wash.showComposition, setWash)}
                {toggleRow('洗涤说明', 'showWashInstructions', wash.showWashInstructions, setWash)}
                {toggleRow('护理图标', 'showCareIcons', wash.showCareIcons, setWash)}
                {toggleRow('制造地', 'showManufacturing', wash.showManufacturing, setWash)}
                {toggleRow('日期', 'showDate', wash.showDate, setWash)}
              </Space>
            </>)}

            <Button size="small" type="link" danger style={{ marginTop: 6, padding: 0 }} onClick={resetSettings}>恢复默认</Button>
          </div>
        ),
      }]} />
    </>
  );
};

export default PrintSettingsPanel;
