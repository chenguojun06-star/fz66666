import React from 'react';
import { Button, InputNumber, Select, Tag, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { GradingZone, MatrixRow } from '../shared';
import { SizeStepColumn } from '../helpers';

interface Props {
  zone: GradingZone;
  zoneIndex: number;
  sizeColumns: string[];
  rows: MatrixRow[];
  canDelete: boolean;
  onUpdateZone: (zoneKey: string, updates: Partial<GradingZone>) => void;
  onRemoveZone: (zoneKey: string) => void;
  onToggleFrontSize: (zoneKey: string, size: string) => void;
  onToggleBackSize: (zoneKey: string, size: string) => void;
  onAddSizeStepColumn: (zoneKey: string) => void;
  onRemoveSizeStepColumn: (zoneKey: string, columnKey: string) => void;
  onUpdateSizeStepColumn: (zoneKey: string, columnKey: string, updates: Partial<SizeStepColumn>) => void;
  onToggleSizeInColumn: (zoneKey: string, columnKey: string, size: string) => void;
}

const ZoneCard: React.FC<Props> = ({
  zone,
  zoneIndex,
  sizeColumns,
  rows,
  canDelete,
  onUpdateZone,
  onRemoveZone,
  onToggleFrontSize,
  onToggleBackSize,
  onAddSizeStepColumn,
  onRemoveSizeStepColumn,
  onUpdateSizeStepColumn,
  onToggleSizeInColumn,
}) => {
  const sizeStepColumns = zone.sizeStepColumns || [];

  return (
    <div
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
          onChange={(e) => onUpdateZone(zone.key, { label: e.target.value })}
        />
        <Select
          mode="multiple"
          value={zone.partKeys || []}
          onChange={(values) => onUpdateZone(zone.key, { partKeys: values })}
          options={rows.map((row) => ({ value: row.key, label: row.partName || '未命名' }))}
          placeholder="选择部位"
          style={{ flex: 1, minWidth: 120 }}
          maxTagCount="responsive"
        />
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => onRemoveZone(zone.key)}
          disabled={!canDelete}
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
                    borderColor: checked ? 'var(--color-primary)' : undefined,
                    color: checked ? 'var(--color-primary)' : undefined,
                    fontWeight: checked ? 600 : 400,
                  }}
                  onClick={() => onToggleFrontSize(zone.key, size)}
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
              onChange={(value) => onUpdateZone(zone.key, { frontStep: Number(value || 0) })}
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
                    background: checked ? 'var(--status-success-bg)' : undefined,
                    borderColor: checked ? 'var(--color-success)' : undefined,
                    color: checked ? 'var(--color-success)' : undefined,
                    fontWeight: checked ? 600 : 400,
                  }}
                  onClick={() => onToggleBackSize(zone.key, size)}
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
              onChange={(value) => onUpdateZone(zone.key, { backStep: Number(value || 0) })}
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
                        background: checked ? 'var(--status-warning-bg)' : undefined,
                        borderColor: checked ? 'var(--color-warning)' : undefined,
                        color: checked ? 'var(--color-warning)' : undefined,
                        fontWeight: checked ? 600 : 400,
                      }}
                      onClick={() => onToggleSizeInColumn(zone.key, col.key, size)}
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
                onChange={(value) => onUpdateSizeStepColumn(zone.key, col.key, { step: Number(value || 0) })}
              />
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => onRemoveSizeStepColumn(zone.key, col.key)}
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
          onClick={() => onAddSizeStepColumn(zone.key)}
        >
          添加自定义跳码段
        </Button>
      </div>
    </div>
  );
};

export default ZoneCard;
