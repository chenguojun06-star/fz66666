import React from 'react';
import { Button, Input, InputNumber, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { getMaterialTypeLabel } from '@/utils/materialType';
import {
  isBomTableContainer,
  type BomTableContainer,
  type BomTableData,
  type BomTableRow,
} from '../../utils/templateUtils';

interface BomInlineTableProps {
  value: BomTableData | BomTableContainer;
  onChange: (next: BomTableData | BomTableContainer) => void;
  readOnly?: boolean;
  compact?: boolean;
}

type BomEditableRow = BomTableRow & Record<string, unknown>;

type BomEditableTableRow = BomEditableRow & {
  __rowKey: string;
};

const EMPTY_TEXT = '-';

const MATERIAL_TYPE_OPTIONS = [
  'fabricA',
  'fabricB',
  'fabricC',
  'fabricD',
  'fabricE',
  'liningA',
  'liningB',
  'liningC',
  'liningD',
  'liningE',
  'accessoryA',
  'accessoryB',
  'accessoryC',
  'accessoryD',
  'accessoryE',
].map((value) => ({ value, label: getMaterialTypeLabel(value) }));

const normalizeText = (value: unknown) => String(value ?? '').trim();

const pickNumericValue = (...values: unknown[]) => {
  for (const value of values) {
    if (value == null || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return undefined;
};

const formatNumber = (value: unknown, precision = 4) => {
  if (value == null || value === '') return EMPTY_TEXT;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return normalizeText(value) || EMPTY_TEXT;
  }
  const safePrecision = Math.max(0, Math.min(precision, 6));
  return numericValue
    .toFixed(safePrecision)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
};

const formatMapValue = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return EMPTY_TEXT;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return text;
    }
    const entries = Object.entries(parsed)
      .map(([key, item]) => `${key}:${item ?? ''}`)
      .filter((item) => item !== ':');
    return entries.length > 0 ? entries.join(' / ') : EMPTY_TEXT;
  } catch {
    return text;
  }
};

const formatCellValue = (key: string, value: unknown) => {
  if (key === 'materialType') {
    return getMaterialTypeLabel(value);
  }
  if (key === 'sizeUsageMap' || key === 'patternSizeUsageMap' || key === 'sizeSpecMap') {
    return formatMapValue(value);
  }
  return normalizeText(value) || EMPTY_TEXT;
};

const parseNumericMap = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return {} as Record<string, number>;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {} as Record<string, number>;
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, item]) => [key, Number(item)])
        .filter(([, item]) => Number.isFinite(item))
    ) as Record<string, number>;
  } catch {
    return {} as Record<string, number>;
  }
};

const stringifyNumericMap = (map: Record<string, number>) => JSON.stringify(map);

const formatSpecWidthValue = (specification: unknown, fabricWidth: unknown) => {
  const specificationText = normalizeText(specification);
  const fabricWidthText = normalizeText(fabricWidth);
  if (specificationText && fabricWidthText) {
    return `${specificationText} / ${fabricWidthText}`;
  }
  return specificationText || fabricWidthText || EMPTY_TEXT;
};

const buildMaterialTypeOptions = (currentValue: unknown) => {
  const normalizedValue = normalizeText(currentValue);
  if (!normalizedValue || MATERIAL_TYPE_OPTIONS.some((option) => option.value === normalizedValue)) {
    return MATERIAL_TYPE_OPTIONS;
  }
  return [{ value: normalizedValue, label: getMaterialTypeLabel(normalizedValue) }, ...MATERIAL_TYPE_OPTIONS];
};

const BomInlineTable: React.FC<BomInlineTableProps> = ({ value, onChange, readOnly = false, compact = false }) => {
  const rows = isBomTableContainer(value) ? value.rows : value;
  const tableData = rows.map((row, index) => ({
    ...row,
    __rowKey: `bom-row-${index}`,
  })) as BomEditableTableRow[];

  const commitRows = (nextRows: BomTableRow[]) => {
    if (isBomTableContainer(value)) {
      onChange({ ...value, rows: nextRows });
      return;
    }
    onChange(nextRows);
  };

  const updateRow = (index: number, updates: Partial<BomEditableRow>) => {
    const nextRows = [...rows];
    const current = nextRows[index] || {};
    nextRows[index] = { ...current, ...updates };
    commitRows(nextRows);
  };

  const deleteRow = (index: number) => {
    commitRows(rows.filter((_, currentIndex) => currentIndex !== index));
  };

  const addRow = () => {
    commitRows([
      ...rows,
      {
        materialCode: '',
        materialName: '',
        materialType: '',
        fabricComposition: '',
        spec: '',
        specification: '',
        fabricWidth: '',
        fabricWeight: '',
        color: '',
        size: '',
        usageAmount: 0,
        quantity: 0,
        dosage: 0,
        sizeUsageMap: '',
        sizeSpecMap: '',
        unit: '',
        patternUnit: '',
        conversionRate: 0,
        lossRate: 0,
        unitPrice: 0,
        totalPrice: 0,
        supplier: '',
        supplierContactPerson: '',
        supplierContactPhone: '',
        stockStatus: '',
        availableStock: 0,
        requiredPurchase: 0,
        remark: '',
      } as BomEditableRow,
    ]);
  };

  const renderPlainText = (text: string) => (
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
    extraUpdates?: (nextValue: string) => Partial<BomEditableRow>,
  ) => {
    const currentValue = record[key];
    if (readOnly) {
      return renderPlainText(formatCellValue(String(key), currentValue));
    }
    if (key === 'materialType') {
      return (
        <Select
          size="small"
          value={normalizeText(currentValue) || undefined}
          options={buildMaterialTypeOptions(currentValue)}
          onChange={(nextValue) => updateRow(index, { [key]: nextValue, ...(extraUpdates ? extraUpdates(String(nextValue || '')) : {}) })}
          style={{ width: '100%' }}
        />
      );
    }
    return (
      <Input
        size="small"
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
    precision = 4,
  ) => {
    const currentValue = pickNumericValue(...keys.map((key) => record[key]));
    if (readOnly) {
      return renderPlainText(formatNumber(currentValue, precision));
    }
    return (
      <InputNumber
        size="small"
        min={0}
        precision={precision}
        value={currentValue}
        onChange={(nextValue) => {
          const numericValue = nextValue ?? 0;
          updateRow(
            index,
            keys.reduce((acc, key) => ({ ...acc, [key]: numericValue }), {} as Partial<BomEditableRow>)
          );
        }}
        style={{ width: '100%' }}
      />
    );
  };

  const renderSizeUsageCell = (record: BomEditableRow, index: number) => {
    const usageMap = parseNumericMap(record.patternSizeUsageMap || record.sizeUsageMap);
    const sizeKeys = Object.keys(usageMap);

    if (!compact || sizeKeys.length === 0) {
      return renderTextCell('sizeUsageMap', record, index);
    }

    if (readOnly) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sizeKeys.map((sizeKey) => (
            <span key={sizeKey} style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
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
            <span style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>{sizeKey}</span>
            <InputNumber
              size="small"
              min={0}
              step={0.01}
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

  const renderSpecWidthCell = (record: BomEditableRow, index: number) => {
    if (!compact) {
      return renderTextCell('specification', record, index, (nextValue) => ({ spec: nextValue }));
    }

    if (readOnly) {
      return renderPlainText(formatSpecWidthValue(record.specification, record.fabricWidth));
    }

    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <Input
          size="small"
          value={normalizeText(record.specification)}
          placeholder="规格"
          onChange={(event) => {
            const nextValue = event.target.value;
            updateRow(index, { specification: nextValue, spec: nextValue });
          }}
          style={{ border: 'none', fontSize: compact ? 12 : undefined }}
        />
        <Input
          size="small"
          value={normalizeText(record.fabricWidth)}
          placeholder="门幅"
          onChange={(event) => updateRow(index, { fabricWidth: event.target.value })}
          style={{ border: 'none', fontSize: compact ? 12 : undefined }}
        />
      </div>
    );
  };

  const columns: ColumnsType<BomEditableRow> = [
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      width: 140,
      render: (_: unknown, record, index) => renderTextCell('materialCode', record, index ?? 0),
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      width: compact ? 138 : 160,
      render: (_: unknown, record, index) => renderTextCell('materialName', record, index ?? 0),
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      width: compact ? 104 : 120,
      render: (_: unknown, record, index) => renderTextCell('materialType', record, index ?? 0),
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      width: 160,
      render: (_: unknown, record, index) => renderTextCell('fabricComposition', record, index ?? 0),
    },
    {
      title: compact ? '规格/幅宽' : '规格',
      dataIndex: 'specification',
      width: compact ? 120 : 140,
      render: (_: unknown, record, index) => renderSpecWidthCell(record, index ?? 0),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: compact ? 92 : 110,
      render: (_: unknown, record, index) => renderTextCell('color', record, index ?? 0),
    },
    ...(!compact ? [{
      title: '门幅',
      dataIndex: 'fabricWidth',
      width: 110,
      render: (_: unknown, record: BomEditableRow, index: number) => renderTextCell('fabricWidth', record, index ?? 0),
    }] : []),
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      width: 110,
      render: (_: unknown, record, index) => renderTextCell('fabricWeight', record, index ?? 0),
    },
    ...(!compact ? [{
      title: '尺码',
      dataIndex: 'size',
      width: 90,
      render: (_: unknown, record: BomEditableRow, index: number) => renderTextCell('size', record, index ?? 0),
    }] : []),
    {
      title: '单件用量',
      dataIndex: 'usageAmount',
      width: 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['usageAmount', 'quantity', 'dosage']),
    },
    {
      title: compact ? '尺码用量' : '各码用量',
      dataIndex: 'sizeUsageMap',
      width: compact ? 260 : 180,
      render: (_: unknown, record, index) => renderSizeUsageCell(record, index ?? 0),
    },
    ...(!compact ? [{
      title: '各码规格',
      dataIndex: 'sizeSpecMap',
      width: 180,
      render: (_: unknown, record: BomEditableRow, index: number) => renderTextCell('sizeSpecMap', record, index ?? 0),
    }] : []),
    {
      title: '单位',
      dataIndex: 'unit',
      width: compact ? 72 : 90,
      render: (_: unknown, record, index) => renderTextCell('unit', record, index ?? 0),
    },
    {
      title: '纸样单位',
      dataIndex: 'patternUnit',
      width: 100,
      render: (_: unknown, record, index) => renderTextCell('patternUnit', record, index ?? 0),
    },
    {
      title: '换算率',
      dataIndex: 'conversionRate',
      width: 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['conversionRate']),
    },
    {
      title: '损耗率',
      dataIndex: 'lossRate',
      width: 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['lossRate']),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: compact ? 88 : 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['unitPrice'], 2),
    },
    {
      title: '金额',
      dataIndex: 'totalPrice',
      width: 100,
      render: (_: unknown, record, index) => renderNumberCell(record, index ?? 0, ['totalPrice'], 2),
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      width: 160,
      render: (_: unknown, record, index) => (
        readOnly
          ? (
            <SupplierNameTooltip
              name={record.supplier}
              contactPerson={record.supplierContactPerson}
              contactPhone={record.supplierContactPhone}
            />
          )
          : renderTextCell('supplier', record, index ?? 0)
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: compact ? 120 : 160,
      render: (_: unknown, record, index) => renderTextCell('remark', record, index ?? 0),
    },
    {
      title: '操作',
      key: 'action',
      width: compact ? 60 : 72,
      render: (_: unknown, __: BomEditableRow, index?: number) => (
        readOnly ? null : (
          <Button danger type="link" size="small" onClick={() => deleteRow(index ?? 0)}>
            删除
          </Button>
        )
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: compact ? 8 : 12 }}>
        {readOnly ? null : <Button size="small" onClick={addRow}>新增物料</Button>}
      </div>
      <ResizableTable
        storageKey="maintenance-inline-bom-editor"
        size="small"
        bordered
        autoScrollY={false}
        pagination={false}
        scroll={{ x: 'max-content' }}
        rowKey="__rowKey"
        columns={columns}
        dataSource={tableData}
      />
    </div>
  );
};

export default BomInlineTable;
