import React from 'react';
import { Form, Tag, Space, Image, Tooltip, Button } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { StyleBom } from '@/types/style';
import RowActions from '@/components/common/RowActions';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import {
  parseSizeUsageMap,
  computeConvertedUsage,
  isKilogramUnit,
  isMeterUnit,
  useBomEditorHelpers,
} from './bomCellEditors';
import type { BomEditorContext } from './bomCellEditors';

export type MaterialType = NonNullable<StyleBom['materialType']>;

export const materialTypeOptions = [
  { value: 'fabricA', label: '面料A' },
  { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' },
  { value: 'fabricD', label: '面料D' },
  { value: 'fabricE', label: '面料E' },
  { value: 'liningA', label: '里料A' },
  { value: 'liningB', label: '里料B' },
  { value: 'liningC', label: '里料C' },
  { value: 'liningD', label: '里料D' },
  { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' },
  { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' },
  { value: 'accessoryD', label: '辅料D' },
  { value: 'accessoryE', label: '辅料E' },
] as const satisfies ReadonlyArray<{ value: MaterialType; label: string }>;

interface UseBomColumnsProps {
  locked: boolean;
  tableEditable: boolean;
  editingKey: string;
  data: StyleBom[];
  form: FormInstance;
  isEditing: (record: StyleBom) => boolean;
  rowName: (id: unknown, field: string) => string[];
  save: (key: string) => Promise<void>;
  cancel: () => void;
  edit: (record: StyleBom) => void;
  handleDelete: (id: unknown) => void;
  isTempId: (id: unknown) => boolean;
  fetchMaterials: (page: number, keyword?: string) => Promise<void>;
  materialCreateForm: FormInstance;
  calcTotalPrice: (item: Partial<StyleBom>) => number;
  isSupervisorOrAbove: boolean;
  setMaterialKeyword: (v: string) => void;
  setMaterialModalOpen: (v: boolean) => void;
  setMaterialTab: (v: 'select' | 'create') => void;
  setMaterialTargetRowId: (v: string) => void;
  onApplyPickup?: (record: StyleBom) => void;
  activeSizes?: string[];
}

export function useBomColumns({
  locked,
  tableEditable,
  editingKey,
  data,
  form,
  isEditing,
  rowName,
  save,
  cancel,
  edit,
  handleDelete,
  isTempId,
  fetchMaterials,
  materialCreateForm: _materialCreateForm,
  calcTotalPrice,
  isSupervisorOrAbove,
  setMaterialKeyword,
  setMaterialModalOpen,
  setMaterialTab,
  setMaterialTargetRowId,
  onApplyPickup,
  activeSizes = [],
}: UseBomColumnsProps) {
  const editorCtx: BomEditorContext = {
    locked,
    tableEditable,
    editingKey,
    data,
    form,
    isEditing,
    rowName,
    save,
    cancel,
    edit,
    handleDelete,
    isTempId,
    fetchMaterials,
    calcTotalPrice,
    isSupervisorOrAbove,
    setMaterialKeyword,
    setMaterialModalOpen,
    setMaterialTab,
    setMaterialTargetRowId,
    onApplyPickup,
    activeSizes,
  };
  const {
    modal,
    canEdit,
    renderImageEditor,
    renderMaterialTypeEditor,
    renderMaterialCodeEditor,
    renderTextEditor,
    renderDictEditor,
    renderSupplierEditor,
    renderDevUsageAmountEditor,
    renderConversionRateEditor,
    renderLossRateEditor,
    renderUnitPriceEditor,
    renderTotalPriceEditor,
    renderConvertedUsageEditor,
  } = useBomEditorHelpers(editorCtx);

  const columns = [
    {
      title: '图片',
      dataIndex: 'imageUrls',
      key: 'imageUrls',
      width: 100,
      render: (_: any, record: StyleBom) => {
        const editorResult = renderImageEditor(record);
        if (editorResult) return editorResult;
        const urls: string[] = (() => {
          try { return JSON.parse(record.imageUrls || '[]'); } catch { return []; }
        })();
        if (!urls.length) return null;
        return (
          <Image.PreviewGroup>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {urls.map((url) => (
                <Image
                  key={url}
                  src={getFullAuthedFileUrl(url)}
                  width={40}
                  height={40}
                  style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #eee' }}
                  preview={{ src: getFullAuthedFileUrl(url) }}
                />
              ))}
            </div>
          </Image.PreviewGroup>
        );
      },
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderMaterialTypeEditor(text, record);
        if (editorResult) return editorResult;
        return getMaterialTypeLabel(text);
      }
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderMaterialCodeEditor(text, record);
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 140,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderTextEditor('materialName', record, true);
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      key: 'fabricComposition',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('fabricComposition', record, 'fabric_composition', '如：100%棉 / 95%棉5%氨纶');
        if (editorResult) return editorResult;
        return text || '-';
      }
    },
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      key: 'fabricWeight',
      width: 90,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('fabricWeight', record, 'fabric_weight', '如：220g');
        if (editorResult) return editorResult;
        return text || '-';
      }
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 90,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('color', record, 'color', '请输入或选择颜色');
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '规格/幅宽',
      dataIndex: 'specification',
      key: 'specification',
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('specification', record, 'material_specification', '请输入或选择规格');
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '开发采购用量',
      dataIndex: 'devUsageAmount',
      key: 'devUsageAmount',
      width: 100,
      render: (text: number, record: StyleBom) => {
        const editorResult = renderDevUsageAmountEditor(text, record);
        if (editorResult) return editorResult;
        return text != null ? text : '-';
      }
    },
    {
      title: '单件用量',
      dataIndex: 'usageAmount',
      key: 'usageAmount',
      width: 100,
      render: (text: number, record: StyleBom) => {
        const patternUsage = record.patternSizeUsageMap;
        const hasPatternData = (() => {
          try { return patternUsage ? Object.keys(JSON.parse(patternUsage)).length > 0 : false; } catch { return false; }
        })();
        if (canEdit(record)) {
          return (
            <Form.Item
              noStyle
              shouldUpdate={(prev, curr) => {
                const id = String(record.id);
                return prev?.[id]?.devUsageAmount !== curr?.[id]?.devUsageAmount ||
                  prev?.[id]?.usageAmount !== curr?.[id]?.usageAmount;
              }}
            >
              {() => {
                const liveRow = form.getFieldValue(String(record.id)) || {};
                const liveDevUsage = liveRow.devUsageAmount ?? record.devUsageAmount;
                const liveUsage = liveRow.usageAmount ?? text;
                const liveDisplay = hasPatternData ? liveUsage : (liveDevUsage ?? liveUsage);
                return (
                  <span style={{ color: '#8c8c8c' }}>
                    {liveDisplay != null ? liveDisplay : '-'}
                    {hasPatternData && <span style={{ fontSize: 10, marginLeft: 4, color: '#52c41a' }}>(纸样)</span>}
                  </span>
                );
              }}
            </Form.Item>
          );
        }
        const row = form.getFieldValue(String(record.id)) || {};
        const devUsage = row.devUsageAmount ?? record.devUsageAmount;
        const displayValue = hasPatternData ? text : (devUsage ?? text);
        const sameTypeRows = data.filter(r => r.materialType === record.materialType && typeof r.usageAmount === 'number' && r.usageAmount > 0);
        const anomalyEl = (() => {
          if (sameTypeRows.length < 2 || !displayValue || displayValue <= 0) return null;
          const avg = sameTypeRows.reduce((s, r) => s + r.usageAmount, 0) / sameTypeRows.length;
          const deviation = Math.abs(displayValue - avg) / avg;
          if (deviation <= 0.2) return null;
          const pct = Math.round(deviation * 100);
          const isHigh = displayValue > avg;
          return (
            <span title={`同类面料平均用量 ${avg.toFixed(2)}，偏差 ${pct}%`}
              style={{ marginLeft: 6, color: '#fa8c16', cursor: 'help', fontSize: 12 }}>
              {isHigh ? `+${pct}%` : `-${pct}%`}
            </span>
          );
        })();
        return <span>{displayValue != null ? displayValue : '-'}{anomalyEl}</span>;
      }
    },
    {
      title: '尺码用量',
      dataIndex: 'sizeUsageMap',
      key: 'sizeUsageMap',
      width: Math.max(260, activeSizes.length * 120),
      render: (text: string, record: StyleBom) => {
        const row = form.getFieldValue(String(record.id)) || {};
        const rowUsageMap = row.sizeUsageMapObject || parseSizeUsageMap(row.sizeUsageMap || text);
        const mapKeys = Object.keys(rowUsageMap);
        const extraKeys = mapKeys.filter(k => !activeSizes.includes(k));
        const displaySizes = mapKeys.length > 0 ? [...activeSizes, ...extraKeys] : activeSizes;
        if (!displaySizes.length) {
          return '-';
        }
        return (
          <Space size={[4, 4]} wrap>
            {displaySizes.map((sizeKey) => (
              <Tag key={sizeKey} style={{ marginInlineEnd: 0 }}>
                {sizeKey}:{Number(rowUsageMap?.[sizeKey] ?? record.usageAmount ?? 0)}
              </Tag>
            ))}
          </Space>
        );
      }
    },
    {
      title: (
        <Space size={4}>
          换算
          <Tooltip title="每公斤对应的米数，BOM单位为公斤时参与换算，辅料不换算">
            <QuestionCircleOutlined style={{ color: '#8c8c8c', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'conversionRate',
      key: 'conversionRate',
      width: 120,
      render: (text: number, record: StyleBom) => {
        const value = Number(text ?? 1) || 1;
        const row = form.getFieldValue(String(record.id)) || {};
        const bomUnit = String(row.unit ?? record.unit ?? '').trim();
        const patternUnit = String(row.patternUnit ?? record.patternUnit ?? '米').trim();
        const canConvertToKg = isKilogramUnit(bomUnit) && isMeterUnit(patternUnit);
        const editorResult = renderConversionRateEditor(text, record);
        if (editorResult) return editorResult;
        if (!canConvertToKg) return '-';
        return value > 0 ? `${value} 米/公斤` : '-';
      }
    },
    {
      title: '公斤数',
      key: 'convertedUsage',
      width: 120,
      render: (_: unknown, record: StyleBom) => {
        const editorResult = renderConvertedUsageEditor(record);
        if (editorResult) return editorResult;
        const converted = computeConvertedUsage(record, form, activeSizes);
        if (converted.value == null) return '-';
        return `${converted.value}${converted.unit}`;
      }
    },
    {
      title: '损耗率(%)',
      dataIndex: 'lossRate',
      key: 'lossRate',
      width: 100,
      editable: true,
      render: (text: number, record: StyleBom) => {
        const editorResult = renderLossRateEditor(text, record);
        if (editorResult) return editorResult;
        return `${text}%`;
      }
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 110,
      editable: true,
      render: (text: number, record: StyleBom) => {
        const editorResult = renderUnitPriceEditor(text, record);
        if (editorResult) return editorResult;
        return `¥${Number(text || 0).toFixed(2)}`;
      }
    },
    {
      title: '小计',
      dataIndex: 'totalPrice',
      width: 110,
      render: (text: number, record: StyleBom) => {
        const editorResult = renderTotalPriceEditor(text, record);
        if (editorResult) return editorResult;
        const value = Number.isFinite(Number(text)) ? Number(text) : calcTotalPrice(record);
        return `¥${Number(value || 0).toFixed(2)}`;
      }
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 80,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('unit', record, 'material_unit', '请输入或选择单位', true);
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderSupplierEditor(text, record);
        if (editorResult) return editorResult;
        return (
          <SupplierNameTooltip
            name={text}
            contactPerson={record.supplierContactPerson}
            contactPhone={record.supplierContactPhone}
          />
        );
      }
    },
    {
      title: '库存状态',
      dataIndex: 'stockStatus',
      width: 110,
      render: (status: string, _record: StyleBom) => {
        if (!status) {
          return <Tag color="default">未检查</Tag>;
        }
        const statusConfig: Record<string, { color: string; text: string }> = {
          sufficient: { color: 'success', text: '库存充足' },
          insufficient: { color: 'warning', text: '库存不足' },
          none: { color: 'error', text: '无库存' },
          unchecked: { color: 'default', text: '未检查' },
        };
        const config = statusConfig[status] || { color: 'default', text: '未知' };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '操作',
      dataIndex: 'operation',
      width: 150,
      resizable: false,
      render: (_: unknown, record: StyleBom) => {
        if (locked) {
          return (
            <Space>
              <Tag color="default">已完成</Tag>
              <span style={{ color: 'var(--neutral-text-lighter)' }}>无法操作</span>
            </Space>
          );
        }
        if (tableEditable) {
          return (
            <Button
              size="small"
              danger
              onClick={() => {
                if (isTempId(record.id)) {
                  handleDelete(record.id!);
                } else {
                  modal.confirm({
                    width: '30vw',
                    title: '确定删除?',
                    onOk: () => handleDelete(record.id!),
                  });
                }
              }}
            >
              删除
            </Button>
          );
        }
        if (!isSupervisorOrAbove) {
          return null;
        }
        const editable = isEditing(record);
        return editable ? (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'save',
                label: '保存',
                title: '保存',
                onClick: () => save(String(record.id!)),
                primary: true,
              },
              {
                key: 'cancel',
                label: '取消',
                title: '取消',
                onClick: () => {
                  modal.confirm({
                    width: '30vw',
                    title: '确定取消?',
                    onOk: cancel,
                  });
                },
              },
            ]}
          />
        ) : (
          <RowActions
            maxInline={3}
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: '编辑',
                disabled: editingKey !== '',
                onClick: () => edit(record),
                primary: true,
              },
              {
                key: 'apply_pickup',
                label: '领取',
                title: record.stockStatus === 'sufficient' ? '申请领取面辅料' : '需先检查库存且库存充足才可申请',
                disabled: editingKey !== '' || !onApplyPickup || record.stockStatus !== 'sufficient',
                onClick: () => onApplyPickup?.(record),
              },
              {
                key: 'delete',
                label: '删除',
                title: '删除',
                danger: true,
                disabled: editingKey !== '',
                onClick: () => {
                  if (isTempId(record.id)) {
                    handleDelete(record.id!);
                  } else {
                    modal.confirm({
                      width: '30vw',
                      title: '确定删除?',
                      onOk: () => handleDelete(record.id!),
                    });
                  }
                },
              },
            ]}
          />
        );
      },
    },
  ];

  return columns;
}
