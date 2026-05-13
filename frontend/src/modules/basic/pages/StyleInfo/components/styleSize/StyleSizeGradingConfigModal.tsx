import React from 'react';
import { Button, Input, InputNumber, Select, Tag, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { GradingZone, MatrixRow } from './shared';

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

type SizeStepColumn = { key: string; sizes: string[]; step: number };

const createEmptySizeStepColumn = (): SizeStepColumn => ({
  key: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  sizes: [],
  step: 0,
});

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
  const getBaseSizeValue = () => {
    if (!gradingDraftBaseSize) return null;
    const firstRow = rows[0];
    if (!firstRow) return null;
    return firstRow.cells?.[gradingDraftBaseSize]?.value ?? null;
  };

  const baseSizeValue = getBaseSizeValue();

  const addSizeStepColumn = (zoneKey: string) => {
    setGradingDraftZones((prev) => prev.map((zone) => {
      if (zone.key !== zoneKey) return zone;
      const columns = zone.sizeStepColumns || [];
      return { ...zone, sizeStepColumns: [...columns, createEmptySizeStepColumn()] };
    }));
  };

  const removeSizeStepColumn = (zoneKey: string, columnKey: string) => {
    setGradingDraftZones((prev) => prev.map((zone) => {
      if (zone.key !== zoneKey) return zone;
      const columns = (zone.sizeStepColumns || []).filter((col) => col.key !== columnKey);
      return { ...zone, sizeStepColumns: columns };
    }));
  };

  const updateSizeStepColumn = (zoneKey: string, columnKey: string, updates: Partial<SizeStepColumn>) => {
    setGradingDraftZones((prev) => prev.map((zone) => {
      if (zone.key !== zoneKey) return zone;
      const columns = (zone.sizeStepColumns || []).map((col) => (
        col.key === columnKey ? { ...col, ...updates } : col
      ));
      return { ...zone, sizeStepColumns: columns };
    }));
  };

  const toggleSizeInColumn = (zoneKey: string, columnKey: string, size: string) => {
    setGradingDraftZones((prev) => prev.map((zone) => {
      if (zone.key !== zoneKey) return zone;
      const columns = (zone.sizeStepColumns || []).map((col) => {
        if (col.key !== columnKey) return col;
        const sizes = col.sizes.includes(size)
          ? col.sizes.filter((s) => s !== size)
          : [...col.sizes, size];
        return { ...col, sizes };
      });
      return { ...zone, sizeStepColumns: columns };
    }));
  };

  return (
    <ResizableModal
      open={open}
      title={gradingTargetRowKey === 'batch' ? `批量配置跳码区 (${selectedRowCount}个部位)` : '配置跳码区'}
      onCancel={onCancel}
      footer={null}
      width="80vw"
      minWidth={800}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.65 : 520}
      minHeight={420}
      autoFontSize={false}
      scaleWithViewport
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontWeight: 600, width: 80 }}>样版码</div>
          <Select
            value={gradingDraftBaseSize || undefined}
            allowClear
            placeholder="选择基准码"
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
            style={{ width: 120 }}
          />
          {gradingDraftBaseSize && baseSizeValue !== null && (
            <div style={{ color: '#059669', fontWeight: 500 }}>
              基准尺寸: <span style={{ fontSize: 16 }}>{baseSizeValue}</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <Button type="primary" onClick={onSubmit}>
            保存并带出
          </Button>
        </div>
        <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.7 }}>
          样版码为基准码，跳码值相对于样版码递增/递减。点击"添加列"可增加多组"码数+跳码"配置。
        </div>
        {gradingDraftZones.map((zone, zoneIndex) => {
          const sizeStepColumns = zone.sizeStepColumns || [];
          const totalPairs = 2 + sizeStepColumns.length;
          const gridColumns = `50px 100px repeat(${totalPairs}, 1fr 80px) 40px`;
          return (
            <div key={zone.key} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontWeight: 600 }}>跳码区</span>
                <Input
                  value={zone.label}
                 
                  placeholder={`${zoneIndex + 1}`}
                  style={{ width: 60 }}
                  onChange={(e) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, label: e.target.value } : item)))}
                />
                <Select
                  mode="multiple"
                 
                  value={zone.partKeys || []}
                  onChange={(values) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, partKeys: values } : item)))}
                  options={rows.map((row) => ({ value: row.key, label: row.partName || '未命名' }))}
                  placeholder="选择部位"
                  style={{ flex: 1, minWidth: 120 }}
                  maxTagCount="responsive"
                />
                <Tooltip title="添加码数跳码列">
                  <Button
                   
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => addSizeStepColumn(zone.key)}
                  >
                    添加列
                  </Button>
                </Tooltip>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 0, background: '#f1f5f9', fontWeight: 600, fontSize: 12, alignItems: 'center', minWidth: 'fit-content' }}>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>操作</div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>部位</div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>码数(前)</div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>跳码</div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>码数(后)</div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>跳码</div>
                  {sizeStepColumns.map((col, colIndex) => (
                    <React.Fragment key={col.key}>
                      <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>
                        码数{colIndex + 1}
                      </div>
                      <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>
                        跳码{colIndex + 1}
                      </div>
                    </React.Fragment>
                  ))}
                  <div style={{ padding: '10px 12px' }}>删</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 0, background: '#fff', alignItems: 'center', minWidth: 'fit-content' }}>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center' }}>
                    <Button
                     
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => setGradingDraftZones((prev) => prev.filter((item) => item.key !== zone.key))}
                      disabled={gradingDraftZones.length <= 1}
                    />
                  </div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>
                    <Select
                      mode="multiple"
                     
                      value={zone.partKeys || []}
                      onChange={(values) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, partKeys: values } : item)))}
                      options={rows.map((row) => ({ value: row.key, label: row.partName || '未命名' }))}
                      placeholder="部位"
                      style={{ width: '100%' }}
                      maxTagCount="responsive"
                      disabled
                    />
                  </div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {sizeColumns.map((size) => {
                      const checked = (zone.frontSizes || []).includes(size);
                      return (
                        <Tag
                          key={`front-${zone.key}-${size}`}
                          color={checked ? 'default' : 'default'}
                          style={{ margin: 0, cursor: 'pointer', userSelect: 'none', opacity: checked ? 1 : 0.5, fontSize: 11, background: checked ? '#e2e8f0' : undefined }}
                          onClick={() => setGradingDraftZones((prev) => prev.map((item) => {
                            if (item.key !== zone.key) return item;
                            const nextSizes = (item.frontSizes || []).includes(size)
                              ? (item.frontSizes || []).filter((s) => s !== size)
                              : [...(item.frontSizes || []), size];
                            return { ...item, frontSizes: nextSizes };
                          }))}
                        >
                          {size}
                        </Tag>
                      );
                    })}
                  </div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>
                    <InputNumber
                     
                      value={zone.frontStep}
                      min={0}
                      step={0.1}
                      controls={false}
                      style={{ width: '100%' }}
                      onChange={(value) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, frontStep: Number(value || 0) } : item)))}
                    />
                  </div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {sizeColumns.map((size) => {
                      const checked = (zone.backSizes || []).includes(size);
                      return (
                        <Tag
                          key={`back-${zone.key}-${size}`}
                          color={checked ? 'default' : 'default'}
                          style={{ margin: 0, cursor: 'pointer', userSelect: 'none', opacity: checked ? 1 : 0.5, fontSize: 11, background: checked ? '#e2e8f0' : undefined }}
                          onClick={() => setGradingDraftZones((prev) => prev.map((item) => {
                            if (item.key !== zone.key) return item;
                            const nextSizes = (item.backSizes || []).includes(size)
                              ? (item.backSizes || []).filter((s) => s !== size)
                              : [...(item.backSizes || []), size];
                            return { ...item, backSizes: nextSizes };
                          }))}
                        >
                          {size}
                        </Tag>
                      );
                    })}
                  </div>
                  <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>
                    <InputNumber
                     
                      value={zone.backStep}
                      min={0}
                      step={0.1}
                      controls={false}
                      style={{ width: '100%' }}
                      onChange={(value) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, backStep: Number(value || 0) } : item)))}
                    />
                  </div>
                  {sizeStepColumns.map((col) => (
                    <React.Fragment key={col.key}>
                      <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {sizeColumns.map((size) => {
                          const checked = col.sizes.includes(size);
                          return (
                            <Tag
                              key={`dynamic-${zone.key}-${col.key}-${size}`}
                              color={checked ? 'default' : 'default'}
                              style={{ margin: 0, cursor: 'pointer', userSelect: 'none', opacity: checked ? 1 : 0.5, fontSize: 11, background: checked ? '#e2e8f0' : undefined }}
                              onClick={() => toggleSizeInColumn(zone.key, col.key, size)}
                            >
                              {size}
                            </Tag>
                          );
                        })}
                      </div>
                      <div style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <InputNumber
                         
                          value={col.step}
                          min={0}
                          step={0.1}
                          controls={false}
                          style={{ flex: 1 }}
                          onChange={(value) => updateSizeStepColumn(zone.key, col.key, { step: Number(value || 0) })}
                        />
                        <Button
                         
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={() => removeSizeStepColumn(zone.key, col.key)}
                        />
                      </div>
                    </React.Fragment>
                  ))}
                  <div style={{ padding: '10px 12px' }} />
                </div>
              </div>
            </div>
          );
        })}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => {
            const baseIndex = gradingDraftBaseSize ? sizeColumns.indexOf(gradingDraftBaseSize) : -1;
            const frontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
            const backSizes = baseIndex >= 0 ? sizeColumns.slice(baseIndex + 1) : [...sizeColumns];
            setGradingDraftZones((prev) => [...prev, {
              key: `grading-zone-${Date.now()}`,
              label: `${prev.length + 1}`,
              sizes: [],
              step: 0,
              frontSizes,
              frontStep: 0,
              backSizes,
              backStep: 0,
              partKeys: [],
              sizeStepColumns: [],
            }]);
          }}
        >
          新增跳码区
        </Button>
      </div>
    </ResizableModal>
  );
};

export default StyleSizeGradingConfigModal;
