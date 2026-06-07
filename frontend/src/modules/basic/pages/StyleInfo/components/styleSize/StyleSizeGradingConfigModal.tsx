import React, { useMemo } from 'react';
import { Button, InputNumber, Select, Tag, Divider, Table, Tooltip, Input, Alert } from 'antd';
import { DeleteOutlined, PlusOutlined, CheckCircleFilled, BulbOutlined } from '@ant-design/icons';
import Drawer from 'antd/es/drawer';
import { GradingZone, MatrixRow } from './shared';
import { toNumberSafe } from '@/utils/api';
import { GRADING_PRESETS, matchPresetSteps, inferCategory } from './gradingPresets';

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

/** 计算放码预览值 */
const computePreview = (
  baseValue: number,
  baseIndex: number,
  sizeColumns: string[],
  zones: GradingZone[],
): Record<string, number> => {
  const result: Record<string, number> = {};
  result[sizeColumns[baseIndex]] = baseValue;

  for (let i = 0; i < sizeColumns.length; i++) {
    if (i === baseIndex) continue;
    const sizeName = sizeColumns[i];
    let step = 0;
    for (const zone of zones) {
      if ((zone.frontSizes || []).includes(sizeName)) { step = toNumberSafe(zone.frontStep); break; }
      if ((zone.backSizes || []).includes(sizeName)) { step = toNumberSafe(zone.backStep); break; }
      for (const col of zone.sizeStepColumns || []) {
        if ((col.sizes || []).includes(sizeName)) { step = toNumberSafe(col.step); break; }
      }
    }
    const distance = Math.abs(i - baseIndex);
    result[sizeName] = Number((i < baseIndex ? baseValue - step * distance : baseValue + step * distance).toFixed(2));
  }
  return result;
};

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
  const baseIndex = gradingDraftBaseSize ? sizeColumns.indexOf(gradingDraftBaseSize) : -1;

  // 实时预览数据
  const previewData = useMemo(() => {
    if (baseIndex < 0 || baseSizeValue === null) return [];
    const preview = computePreview(toNumberSafe(baseSizeValue), baseIndex, sizeColumns, gradingDraftZones);
    return rows
      .filter((row) => {
        if (gradingTargetRowKey === 'batch') return true;
        return row.key === gradingTargetRowKey;
      })
      .slice(0, 8) // 最多预览8行
      .map((row) => {
        const rowBaseValue = toNumberSafe(row.cells[gradingDraftBaseSize]?.value);
        const rowPreview = computePreview(rowBaseValue, baseIndex, sizeColumns, gradingDraftZones);
        const result: Record<string, any> = {
          key: row.key,
          partName: row.partName || '未命名',
          baseValue: rowBaseValue,
        };
        sizeColumns.forEach((sn) => {
          result[sn] = rowPreview[sn];
        });
        return result;
      });
  }, [baseIndex, baseSizeValue, gradingDraftBaseSize, gradingDraftZones, gradingTargetRowKey, rows, sizeColumns]);

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

  // 预览表格列
  const previewColumns = [
    { title: '部位', dataIndex: 'partName', width: 80, fixed: 'left' as const },
    { title: '基准值', dataIndex: 'baseValue', width: 70, align: 'center' as const },
    ...sizeColumns.map((sn) => ({
      title: sn,
      dataIndex: sn,
      width: 60,
      align: 'center' as const,
      render: (val: number, record: Record<string, any>) => {
        const isBase = sn === gradingDraftBaseSize;
        return (
          <span style={{
            fontWeight: isBase ? 700 : 400,
            color: isBase ? 'var(--color-primary, #1677ff)' : undefined,
          }}>
            {val ?? '-'}
          </span>
        );
      },
    })),
  ];

  return (
    <Drawer
      open={open}
      title={gradingTargetRowKey === 'batch' ? `批量配置跳码区 (${selectedRowCount}个部位)` : '配置跳码区'}
      onClose={onCancel}
      size={Math.min(720, typeof window !== 'undefined' ? window.innerWidth * 0.55 : 720)}
      styles={{ body: { padding: '16px 20px', overflow: 'auto' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={onSubmit} disabled={!gradingDraftBaseSize}>
            保存并带出
          </Button>
        </div>
      }
    >
      {/* 行业预设模板 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
          <BulbOutlined style={{ color: '#faad14' }} />
          快速应用行业预设
        </div>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 8 }}>
          选择服装品类，系统自动根据行业标准推荐各部位跳码量
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GRADING_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              size="small"
              onClick={() => {
                // 获取当前涉及的部位名
                const targetRows = gradingTargetRowKey === 'batch'
                  ? rows.filter((r) => gradingDraftZones.some((z) => (z.partKeys || []).includes(r.key)))
                  : rows.filter((r) => r.key === gradingTargetRowKey);
                const partNames = targetRows.map((r) => r.partName);
                const matchedSteps = matchPresetSteps(partNames, preset.key);
                const matchedCount = Object.keys(matchedSteps).length;
                if (matchedCount === 0) return;

                // 将匹配的跳码量应用到对应的跳码区
                setGradingDraftZones((prev) => prev.map((zone) => {
                  const zonePartKeys = zone.partKeys || [];
                  let updatedFrontStep = zone.frontStep || 0;
                  let updatedBackStep = zone.backStep || 0;

                  // 取所有匹配部位的跳码量平均值
                  const steps: number[] = [];
                  for (const pk of zonePartKeys) {
                    const row = rows.find((r) => r.key === pk);
                    if (row && matchedSteps[row.partName] !== undefined) {
                      steps.push(matchedSteps[row.partName]);
                    }
                  }
                  if (steps.length > 0) {
                    const avgStep = Number((steps.reduce((a, b) => a + b, 0) / steps.length).toFixed(2));
                    updatedFrontStep = avgStep;
                    updatedBackStep = avgStep;
                  }

                  return { ...zone, frontStep: updatedFrontStep, backStep: updatedBackStep };
                }));
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Alert
          type="info"
          showIcon={false}
          style={{ marginTop: 8, fontSize: 12, padding: '6px 10px' }}
          message="行业标准参考：胸围每码+2cm、肩宽+1cm、衣长+1cm、腰围+1.5cm、裤长+1.2cm、领围+0.5cm。具体数值请根据实际版型调整。"
        />
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* 基准码选择 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>1. 选择基准码（样版码）</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Select
            value={gradingDraftBaseSize || undefined}
            allowClear
            placeholder="选择基准码"
            options={sizeColumns.map((size) => ({ value: size, label: size }))}
            onChange={(value) => {
              const newBaseSize = String(value || '');
              setGradingDraftBaseSize(newBaseSize);
              const newBaseIndex = newBaseSize ? sizeColumns.indexOf(newBaseSize) : -1;
              const newFrontSizes = newBaseIndex > 0 ? sizeColumns.slice(0, newBaseIndex) : [];
              const newBackSizes = newBaseIndex >= 0 ? sizeColumns.slice(newBaseIndex + 1) : [...sizeColumns];
              setGradingDraftZones((prev) => prev.map((zone) => ({
                ...zone,
                frontSizes: newFrontSizes,
                backSizes: newBackSizes,
              })));
            }}
            style={{ width: 140 }}
          />
          {gradingDraftBaseSize && baseSizeValue !== null && (
            <Tag color="blue" style={{ fontSize: 14, padding: '2px 10px' }}>
              基准尺寸: {baseSizeValue}
            </Tag>
          )}
        </div>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginTop: 6 }}>
          基准码为放码的参考基准，其他码数相对于基准码递增/递减
        </div>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* 跳码区配置 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>2. 配置跳码区</div>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 12 }}>
          前区 = 比基准码小的码数，后区 = 比基准码大的码数。点击码数标签可切换选中状态。
        </div>

        {gradingDraftZones.map((zone, zoneIndex) => {
          const sizeStepColumns = zone.sizeStepColumns || [];
          return (
            <div
              key={zone.key}
              style={{
                border: '1px solid var(--color-border, #e2e8f0)',
                borderRadius: 10,
                marginBottom: 12,
                overflow: 'hidden',
              }}
            >
              {/* 跳码区头部 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: 'var(--color-bg-page, #f5f7fa)',
                borderBottom: '1px solid var(--color-border, #e2e8f0)',
              }}>
                <Tag color="blue">区{zoneIndex + 1}</Tag>
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
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => setGradingDraftZones((prev) => prev.filter((item) => item.key !== zone.key))}
                  disabled={gradingDraftZones.length <= 1}
                />
              </div>

              {/* 前区 + 后区 两列布局 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                {/* 前区 */}
                <div style={{ padding: '12px 14px', borderRight: '1px solid var(--color-border, #e2e8f0)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                    前区（小码方向 ↓）
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {sizeColumns.map((size) => {
                      const checked = (zone.frontSizes || []).includes(size);
                      return (
                        <Tag
                          key={`front-${zone.key}-${size}`}
                          style={{
                            margin: 0,
                            cursor: 'pointer',
                            userSelect: 'none',
                            opacity: checked ? 1 : 0.45,
                            background: checked ? '#e6f4ff' : undefined,
                            borderColor: checked ? '#1677ff' : undefined,
                            color: checked ? '#1677ff' : undefined,
                            fontWeight: checked ? 600 : 400,
                          }}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>每码跳码</span>
                    <InputNumber
                      value={zone.frontStep}
                      min={0}
                      step={0.1}
                      controls={false}
                      style={{ width: 90 }}
                      onChange={(value) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, frontStep: Number(value || 0) } : item)))}
                    />
                  </div>
                </div>

                {/* 后区 */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                    后区（大码方向 ↑）
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {sizeColumns.map((size) => {
                      const checked = (zone.backSizes || []).includes(size);
                      return (
                        <Tag
                          key={`back-${zone.key}-${size}`}
                          style={{
                            margin: 0,
                            cursor: 'pointer',
                            userSelect: 'none',
                            opacity: checked ? 1 : 0.45,
                            background: checked ? '#f6ffed' : undefined,
                            borderColor: checked ? '#52c41a' : undefined,
                            color: checked ? '#52c41a' : undefined,
                            fontWeight: checked ? 600 : 400,
                          }}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>每码跳码</span>
                    <InputNumber
                      value={zone.backStep}
                      min={0}
                      step={0.1}
                      controls={false}
                      style={{ width: 90 }}
                      onChange={(value) => setGradingDraftZones((prev) => prev.map((item) => (item.key === zone.key ? { ...item, backStep: Number(value || 0) } : item)))}
                    />
                  </div>
                </div>
              </div>

              {/* 自定义跳码列 */}
              {sizeStepColumns.length > 0 && (
                <div style={{ borderTop: '1px solid var(--color-border, #e2e8f0)', padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                    自定义跳码段
                  </div>
                  {sizeStepColumns.map((col, colIndex) => (
                    <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', minWidth: 40 }}>段{colIndex + 1}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, flex: 1 }}>
                        {sizeColumns.map((size) => {
                          const checked = col.sizes.includes(size);
                          return (
                            <Tag
                              key={`dynamic-${zone.key}-${col.key}-${size}`}
                              style={{
                                margin: 0,
                                cursor: 'pointer',
                                userSelect: 'none',
                                opacity: checked ? 1 : 0.45,
                                background: checked ? '#fff7e6' : undefined,
                                borderColor: checked ? '#fa8c16' : undefined,
                                color: checked ? '#fa8c16' : undefined,
                                fontWeight: checked ? 600 : 400,
                              }}
                              onClick={() => toggleSizeInColumn(zone.key, col.key, size)}
                            >
                              {size}
                            </Tag>
                          );
                        })}
                      </div>
                      <InputNumber
                        value={col.step}
                        min={0}
                        step={0.1}
                        controls={false}
                        style={{ width: 80 }}
                        onChange={(value) => updateSizeStepColumn(zone.key, col.key, { step: Number(value || 0) })}
                      />
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => removeSizeStepColumn(zone.key, col.key)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 添加自定义列 */}
              <div style={{ borderTop: '1px solid var(--color-border, #e2e8f0)', padding: '8px 14px' }}>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  size="small"
                  onClick={() => addSizeStepColumn(zone.key)}
                >
                  添加自定义跳码段
                </Button>
              </div>
            </div>
          );
        })}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => {
            const newBaseIndex = gradingDraftBaseSize ? sizeColumns.indexOf(gradingDraftBaseSize) : -1;
            const frontSizes = newBaseIndex > 0 ? sizeColumns.slice(0, newBaseIndex) : [];
            const backSizes = newBaseIndex >= 0 ? sizeColumns.slice(newBaseIndex + 1) : [...sizeColumns];
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

      {/* 实时预览 */}
      {baseIndex >= 0 && previewData.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircleFilled style={{ color: '#52c41a' }} />
              实时预览
            </div>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13, marginBottom: 8 }}>
              以下为根据当前跳码配置自动计算的放码结果，蓝色加粗为基准码
            </div>
            <Table
              dataSource={previewData}
              columns={previewColumns}
              pagination={false}
              size="small"
              bordered
              scroll={{ x: 'max-content' }}
              style={{ fontSize: 13 }}
            />
          </div>
        </>
      )}
    </Drawer>
  );
};

export default StyleSizeGradingConfigModal;
