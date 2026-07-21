import React from 'react';
import { Button, Input, InputNumber, Popconfirm, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import {
  buildMaterialTypeOptions,
  EMPTY_TEXT,
  formatCellValue,
  formatNumber,
  formatSpecWidthValue,
  normalizeText,
  parseNumericMap,
  pickNumericValue,
  stringifyNumericMap,
} from './helpers';
import type { BomEditableRow } from './types';

export interface BomColumnRenderProps {
  readOnly: boolean;
  compact: boolean;
  updateRow: (index: number, updates: Partial<BomEditableRow>) => void;
  deleteRow: (index: number) => void;
}

const renderPlainText = (text: string, compact: boolean) => (
  <div
    title={text !== EMPTY_TEXT ? text : undefined}
    style={{
      fontSize: compact ? 12 : undefined,
      lineHeight: 1.4,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
    }}
  >
    {text}
  </div>
);

const renderTextCell = (
  key: keyof BomEditableRow,
  record: BomEditableRow,
  index: number,
  props: BomColumnRenderProps,
  extraUpdates?: (nextValue: string) => Partial<BomEditableRow>,
) => {
  const { readOnly, compact, updateRow } = props;
  const currentValue = record[key];
  if (readOnly) {
    return renderPlainText(formatCellValue(String(key), currentValue), compact);
  }
  if (key === 'materialType') {
    return (
      <Select
        value={normalizeText(currentValue) || undefined}
        options={buildMaterialTypeOptions(currentValue)}
        onChange={(nextValue) =>
          updateRow(index, {
            [key]: nextValue,
            ...(extraUpdates ? extraUpdates(String(nextValue || '')) : {}),
          })
        }
        style={{ width: '100%' }}
      />
    );
  }
  return (
    <Input
      value={normalizeText(currentValue)}
      onChange={(event) => {
        const nextValue = event.target.value;
        updateRow(index, { [key]: nextValue, ...(extraUpdates ? extraUpdates(nextValue) : {}) });
      }}
      style={{ border: 'none', fontSize: compact ? 12 : undefined }}
    />
  );
};

const renderNumberCell = (
  record: BomEditableRow,
  index: number,
  keys: Array<keyof BomEditableRow>,
  props: BomColumnRenderProps,
  precision = 4,
) => {
  const { readOnly, compact, updateRow } = props;
  const currentValue = pickNumericValue(...keys.map((key) => record[key]));
  if (readOnly) {
    return renderPlainText(formatNumber(currentValue, precision), compact);
  }
  return (
    <InputNumber
      min={0}
      precision={precision}
      controls={false}
      value={currentValue}
      onChange={(nextValue) => {
        const numericValue = nextValue ?? 0;
        updateRow(
          index,
          keys.reduce((acc, key) => ({ ...acc, [key]: numericValue }), {} as Partial<BomEditableRow>),
        );
      }}
      style={{ width: '100%' }}
    />
  );
};

const renderSizeUsageCell = (record: BomEditableRow, index: number, props: BomColumnRenderProps) => {
  const { readOnly, compact, updateRow } = props;
  const usageMap = parseNumericMap(record.patternSizeUsageMap || record.sizeUsageMap);
  const sizeKeys = Object.keys(usageMap);

  if (!compact || sizeKeys.length === 0) {
    return renderTextCell('sizeUsageMap', record, index, props);
  }

  if (readOnly) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {sizeKeys.map((sizeKey) => (
          <span key={sizeKey} style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>
            {sizeKey}:{formatNumber(usageMap[sizeKey] ?? 0, 4)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {sizeKeys.map((sizeKey) => (
        <div key={sizeKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: 'var(--neutral-text-secondary)' }}>{sizeKey}</span>
          <InputNumber
            min={0}
            step={0.01}
            controls={false}
            value={usageMap[sizeKey] ?? 0}
            onChange={(nextValue) => {
              const nextMap = { ...usageMap, [sizeKey]: Number(nextValue ?? 0) };
              const nextJson = stringifyNumericMap(nextMap);
              updateRow(index, { sizeUsageMap: nextJson, patternSizeUsageMap: nextJson });
            }}
            style={{ width: 92 }}
          />
        </div>
      ))}
    </div>
  );
};

const renderSpecWidthCell = (record: BomEditableRow, index: number, props: BomColumnRenderProps) => {
  const { readOnly, compact, updateRow } = props;
  if (!compact) {
    return renderTextCell('specification', record, index, props, (nextValue) => ({ spec: nextValue }));
  }

  if (readOnly) {
    return renderPlainText(formatSpecWidthValue(record.specification, record.fabricWidth), compact);
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <Input
        value={normalizeText(record.specification)}
        placeholder="规格"
        onChange={(event) => {
          const nextValue = event.target.value;
          updateRow(index, { specification: nextValue, spec: nextValue });
        }}
        style={{ border: 'none', fontSize: compact ? 12 : undefined }}
      />
      <Input
        value={normalizeText(record.fabricWidth)}
        placeholder="门幅"
        onChange={(event) => updateRow(index, { fabricWidth: event.target.value })}
        style={{ border: 'none', fontSize: compact ? 12 : undefined }}
      />
    </div>
  );
};

export const buildBomColumns = (props: BomColumnRenderProps): ColumnsType<BomEditableRow> => {
  const { compact, readOnly, deleteRow } = props;
  return [
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      width: 140,
      render: (_: unknown, record, index) => renderTextCell('materialCode', record, index ?? 0, props),
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      width: compact ? 138 : 160,
      render: (_: unknown, record, index) => renderTextCell('materialName', record, index ?? 0, props),
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      width: compact ? 104 : 120,
      render: (_: unknown, record, index) => renderTextCell('materialType', record, index ?? 0, props),
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      width: 160,
      render: (_: unknown, record, index) => renderTextCell('fabricComposition', record, index ?? 0, props),
    },
    {
      title: compact ? '规格/幅宽' : '规格',
      dataIndex: 'specification',
      width: compact ? 120 : 140,
      render: (_: unknown, record, index) => renderSpecWidthCell(record, index ?? 0, props),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: compact ? 92 : 110,
      render: (_: unknown, record, index) => renderTextCell('color', record, index ?? 0, props),
    },
    ...(!compact
      ? [
          {
            title: '门幅',
            dataIndex: 'fabricWidth',
            width: 110,
            render: (_: unknown, record: BomEditableRow, index: number) =>
              renderTextCell('fabricWidth', record, index ?? 0, props),
          },
        ]
      : []),
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      width: 110,
      render: (_: unknown, record, index) => renderTextCell('fabricWeight', record, index ?? 0, props),
    },
    ...(!compact
      ? [
          {
            title: '尺码',
            dataIndex: 'size',
            width: 90,
            render: (_: unknown, record: BomEditableRow, index: number) =>
              renderTextCell('size', record, index ?? 0, props),
          },
        ]
      : []),
    {
      title: '单件用量',
      dataIndex: 'usageAmount',
      width: 100,
      render: (_: unknown, record, index) =>
        renderNumberCell(record, index ?? 0, ['usageAmount', 'quantity', 'dosage'], props),
    },
    {
      title: compact ? '尺码用量' : '各码用量',
      dataIndex: 'sizeUsageMap',
      width: compact ? 260 : 180,
      render: (_: unknown, record, index) => renderSizeUsageCell(record, index ?? 0, props),
    },
    ...(!compact
      ? [
          {
            title: '各码规格',
            dataIndex: 'sizeSpecMap',
            width: 180,
            render: (_: unknown, record: BomEditableRow, index: number) =>
              renderTextCell('sizeSpecMap', record, index ?? 0, props),
          },
        ]
      : []),
    {
      title: '单位',
      dataIndex: 'unit',
      width: compact ? 72 : 90,
      render: (_: unknown, record, index) => renderTextCell('unit', record, index ?? 0, props),
    },
    {
      title: '纸样单位',
      dataIndex: 'patternUnit',
      width: 100,
      render: (_: unknown, record, index) => renderTextCell('patternUnit', record, index ?? 0, props),
    },
    {
      title: '换算率',
      dataIndex: 'conversionRate',
      width: 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['conversionRate'], props),
    },
    {
      title: '损耗率',
      dataIndex: 'lossRate',
      width: 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['lossRate'], props),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: compact ? 88 : 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['unitPrice'], props, 2),
    },
    {
      title: '金额',
      dataIndex: 'totalPrice',
      width: 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['totalPrice'], props, 2),
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      width: 160,
      render: (_: unknown, record, index) =>
        readOnly ? (
          <SupplierNameTooltip
            name={record.supplier}
            contactPerson={record.supplierContactPerson}
            contactPhone={record.supplierContactPhone}
          />
        ) : (
          renderTextCell('supplier', record, index ?? 0, props)
        ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: compact ? 120 : 160,
      render: (_: unknown, record, index) => renderTextCell('remark', record, index ?? 0, props),
    },
    {
      title: '操作',
      key: 'action',
      width: compact ? 60 : 72,
      render: (_: unknown, __: BomEditableRow, index?: number) =>
        readOnly ? null : (
          <Popconfirm
            title="确认删除该物料行？"
            onConfirm={() => deleteRow(index ?? 0)}
            okButtonProps={{ danger: true }}
            okText="删除"
            cancelText="取消"
          >
            <Button danger type="link">
              删除
            </Button>
          </Popconfirm>
        ),
    },
  ];
};
