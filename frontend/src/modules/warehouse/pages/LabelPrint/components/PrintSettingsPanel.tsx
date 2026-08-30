import React from 'react';
import { Card, Button, Space, InputNumber, Collapse, Popconfirm, Slider, Switch, Input, Select, Dropdown } from 'antd';
import { PrinterOutlined, SettingOutlined, SaveOutlined, BookOutlined, DeleteOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import type { PrintType } from '../types';
import type { HangSettings, BarSettings } from '../constants';
import type { OrderInfo } from '../types';

/** D-230b：统一表单项布局：标签 + 说明 + 控件，让用户清楚每个输入框是干什么的 */
const Field: React.FC<{ label: string; help?: string; children: React.ReactNode }> = ({ label, help, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 500, marginBottom: 2 }}>{label}</div>
    {help ? <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{help}</div> : null}
    {children}
  </div>
);

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
                {/* D-232：本面板现在只服务条码（吊牌走 HangtagCertPanel、洗水唛走 WashLabelPanel） */}
                {sizePresets[printType].map(p => (
                  <Button key={p.label} size="small"
                    type={printType === 'hangtag' ? (hang.w === p.w && hang.h === p.h ? 'primary' : 'default')
                        : (bar.w === p.w && bar.h === p.h ? 'primary' : 'default')}
                    onClick={() => {
                      if (printType === 'hangtag') setHang(h => ({ ...h, w: p.w, h: p.h }));
                      else setBar(b => ({ ...b, w: p.w, h: p.h }));
                    }}>{p.label}</Button>
                ))}
              </Space>
              <Space.Compact>
                <InputNumber size="small" min={20} max={200}
                  value={printType === 'hangtag' ? hang.w : bar.w}
                  onChange={v => { if (printType === 'hangtag') setHang(h => ({ ...h, w: v || 100 })); else setBar(b => ({ ...b, w: v || 40 })); }}
                  style={{ width: 68 }} placeholder="宽" />
                <InputNumber size="small" min={10} max={200}
                  value={printType === 'hangtag' ? hang.h : bar.h}
                  onChange={v => { if (printType === 'hangtag') setHang(h => ({ ...h, h: v || 70 })); else setBar(b => ({ ...b, h: v || 20 })); }}
                  style={{ width: 68 }} placeholder="高" />
              </Space.Compact>
            </div>

            {printType === 'barcode' && (<>
              <Field label="码类型" help="二维码适合手机 / 扫码枪扫，条形码适合传统扫码枪">
                <Select
                  value={bar.codeType}
                  onChange={v => setBar(b => ({ ...b, codeType: v }))}
                  style={{ width: '100%' }}
                  options={[
                    { label: '二维码 (QR)', value: 'qr' },
                    { label: '条形码 (Code128)', value: 'barcode128' },
                  ]}
                />
              </Field>
              <Field label="编码字号" help={`当前 ${bar.codeSz}pt，条码下方商品编码的字体大小`}>
                <Slider min={5} max={14} step={0.5} value={bar.codeSz} onChange={v => setBar(b => ({ ...b, codeSz: v }))} />
              </Field>
              <Field label="文字字号" help={`当前 ${bar.textSz}pt，款式名等辅助文字的字体大小`}>
                <Slider min={4} max={10} step={0.5} value={bar.textSz} onChange={v => setBar(b => ({ ...b, textSz: v }))} />
              </Field>
              <Field label="显示款式名" help="在条码标签顶部打印款式名称">
                <Switch checked={bar.showName} onChange={v => setBar(b => ({ ...b, showName: v }))} />
              </Field>
            </>)}

            {/* D-232：洗水唛已改用 WashLabelPanel（订单管理同款布局），此处不再有洗水唛设置 */}

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
