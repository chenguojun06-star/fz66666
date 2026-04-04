import React from 'react';
import { Button, Input, InputNumber, Select, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { GradingZone, MatrixRow, createGradingZone } from './shared';

interface Props {
  open: boolean;
  gradingTargetRowKey: string;
  selectedRowCount: number;
  sizeColumns: string[];
  rows: MatrixRow[];
  gradingDraftBaseSize: string;
  gradingDraftZones: GradingZone[];
  setGradingDraftBaseSize: React.Dispatch<React.SetStateAction<string>>;
  setGradingDraftZones: React.Dispatch<React.SetStateAction<GradingZone[]>>;
  onCancel: () => void;
  onSubmit: () => void;
}

const StyleSizeGradingConfigModal: React.FC<Props> = ({
  open,
  gradingTargetRowKey,
  selectedRowCount,
  sizeColumns,
  rows,
  gradingDraftBaseSize,
  gradingDraftZones,
  setGradingDraftBaseSize,
  setGradingDraftZones,
  onCancel,
  onSubmit,
}) => {
  return (
    <ResizableModal
      open={open}
      title={gradingTargetRowKey === 'batch' ? `批量配置跳码区 (${selectedRowCount}个部位)` : '配置跳码区'}
      onCancel={onCancel}
      footer={null}
      width="60vw"
      minWidth={720}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.62 : 520}
      minHeight={420}
      autoFontSize={false}
      scaleWithViewport
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) auto', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 600 }}>样版码</div>
          <Select
            value={gradingDraftBaseSize || undefined}
            allowClear
            options={sizeColumns.map((size) => ({ value: size, label: size }))}
            onChange={(value) => {
              const newBaseSize = String(value || '');
              setGradingDraftBaseSize(newBaseSize);
              const baseIndex = newBaseSize ? sizeColumns.indexOf(newBaseSize) : -1;
              const newFrontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
              const newBackSizes = baseIndex >= 0 ? sizeColumns.slice(baseIndex + 1) : [...sizeColumns];
              setGradingDraftZones((prev) => prev.map((zone) => ({
                ...zone,
                frontSizes: newFrontSizes,
                backSizes: newBackSizes,
              })));
            }}
          />
          <Button type="primary" onClick={onSubmit}>
            保存并带出
          </Button>
        </div>
        <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.7 }}>
          样版码为基准码，跳码值相对于样版码递增/递减。选择样版码后自动分割前后码数。
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 140px 1fr 120px 1fr 120px 40px', gap: 0, background: '#f8fafc', fontWeight: 600, fontSize: 13, alignItems: 'center' }}>
            <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>跳码区</div>
            <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>部位</div>
            <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>码数(前)</div>
            <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>跳码</div>
            <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>码数(后)</div>
            <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>跳码</div>
            <div style={{ padding: '12px' }}>操作</div>
          </div>
          {gradingDraftZones.map((zone, index) => (
            <div key={zone.key} style={{ display: 'grid', gridTemplateColumns: '80px 140px 1fr 120px 1fr 120px 40px', gap: 0, borderTop: '1px solid #e2e8f0', background: '#fff', alignItems: 'center' }}>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                <Input
                  value={zone.label}
                  size="small"
                  placeholder={`${index + 1}`}
                  onChange={(e) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, label: e.target.value } : item)))}
                />
              </div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0' }}>
                <Select
                  mode="multiple"
                  size="small"
                  value={zone.partKeys || []}
                  onChange={(values) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, partKeys: values } : item)))}
                  options={rows.map((row) => ({ value: row.key, label: row.partName || '未命名' }))}
                  placeholder="部位"
                  style={{ width: '100%', height: 32 }}
                  maxTagCount="responsive"
                />
              </div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sizeColumns.map((size) => {
                  const checked = (zone.frontSizes || []).includes(size);
                  return (
                    <Tag
                      key={`front-${zone.key}-${size}`}
                      color={checked ? 'blue' : 'default'}
                      style={{ margin: 0, cursor: 'pointer', userSelect: 'none', opacity: checked ? 1 : 0.5 }}
                      onClick={() => setGradingDraftZones((prev) => prev.map((item) => {
                        if (item.key !== zone.key) return item;
                        const nextSizes = (item.frontSizes || []).includes(size)
                          ? (item.frontSizes || []).filter((currentSize) => currentSize !== size)
                          : [...(item.frontSizes || []), size];
                        return { ...item, frontSizes: nextSizes };
                      }))}
                    >
                      {size}
                    </Tag>
                  );
                })}
              </div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                <InputNumber
                  size="small"
                  value={zone.frontStep}
                  min={0}
                  step={0.1}
                  style={{ width: '100%', height: 32 }}
                  onChange={(value) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, frontStep: Number(value || 0) } : item)))}
                />
              </div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sizeColumns.map((size) => {
                  const checked = (zone.backSizes || []).includes(size);
                  return (
                    <Tag
                      key={`back-${zone.key}-${size}`}
                      color={checked ? 'blue' : 'default'}
                      style={{ margin: 0, cursor: 'pointer', userSelect: 'none', opacity: checked ? 1 : 0.5 }}
                      onClick={() => setGradingDraftZones((prev) => prev.map((item) => {
                        if (item.key !== zone.key) return item;
                        const nextSizes = (item.backSizes || []).includes(size)
                          ? (item.backSizes || []).filter((currentSize) => currentSize !== size)
                          : [...(item.backSizes || []), size];
                        return { ...item, backSizes: nextSizes };
                      }))}
                    >
                      {size}
                    </Tag>
                  );
                })}
              </div>
              <div style={{ padding: '12px', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                <InputNumber
                  size="small"
                  value={zone.backStep}
                  min={0}
                  step={0.1}
                  style={{ width: '100%', height: 32 }}
                  onChange={(value) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, backStep: Number(value || 0) } : item)))}
                />
              </div>
              <div style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Button
                  size="small"
                  danger
                  type="text"
                  onClick={() => setGradingDraftZones((prev) => prev.filter((item) => item.key !== zone.key))}
                  disabled={gradingDraftZones.length <= 1}
                >
                  删
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button
          type="dashed"
          onClick={() => setGradingDraftZones((prev) => [...prev, createGradingZone([], `${prev.length + 1}`, [], [], [...sizeColumns])])}
        >
          新增跳码区
        </Button>
      </div>
    </ResizableModal>
  );
};

export default StyleSizeGradingConfigModal;
