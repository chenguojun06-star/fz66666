import { App, Form, Input, Button, Select, InputNumber, Image, Space, Tooltip } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { StyleBom } from '@/types/style';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SupplierSelect from '@/components/common/SupplierSelect';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { materialTypeOptions } from './bomColumns';
import type { MaterialType } from './bomColumns';

export const parseSizeUsageMap = (value?: string) => {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
};

export const normalizeUnitText = (value?: string) => String(value || '').trim().toLowerCase();

export const isMeterUnit = (value?: string) => {
  const unit = normalizeUnitText(value);
  return unit === '米' || unit === 'm' || unit === 'meter' || unit === 'meters';
};

export const isKilogramUnit = (value?: string) => {
  const unit = normalizeUnitText(value);
  return unit === 'kg' || unit === '公斤' || unit === '千克' || unit === 'kilogram' || unit === 'kilograms';
};

export const computeAverageMeterUsage = (record: StyleBom, form: FormInstance, activeSizes: string[]) => {
  const row = form.getFieldValue(String(record.id)) || {};
  const rowUsageMap = row.sizeUsageMapObject || parseSizeUsageMap(row.sizeUsageMap || record.patternSizeUsageMap || record.sizeUsageMap);
  const values = activeSizes
    .map((sizeKey) => Number(rowUsageMap?.[sizeKey] ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length) {
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
  }
  return Number(record.usageAmount || 0);
};

export const computeConvertedUsage = (record: StyleBom, form: FormInstance, activeSizes: string[]) => {
  const row = form.getFieldValue(String(record.id)) || {};
  const bomUnit = String(row.unit ?? record.unit ?? '').trim();
  const patternUnit = String(row.unit ?? record.patternUnit ?? '米').trim();
  const conversionRate = Number(row.conversionRate ?? record.conversionRate ?? 1) || 1;
  const meterValue = computeAverageMeterUsage(record, form, activeSizes);
  if (!isKilogramUnit(bomUnit) || !isMeterUnit(patternUnit) || conversionRate <= 0) {
    return { unit: '公斤', value: null as number | null };
  }
  return { unit: '公斤', value: Number((meterValue / conversionRate).toFixed(4)) };
};

export interface BomEditorContext {
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
  calcTotalPrice: (item: Partial<StyleBom>) => number;
  isSupervisorOrAbove: boolean;
  setMaterialKeyword: (v: string) => void;
  setMaterialModalOpen: (v: boolean) => void;
  setMaterialTab: (v: 'select' | 'create') => void;
  setMaterialTargetRowId: (v: string) => void;
  onApplyPickup?: (record: StyleBom) => void;
  activeSizes: string[];
}

export function useBomEditorHelpers(ctx: BomEditorContext) {
  const { form, activeSizes } = ctx;
  const { modal } = App.useApp();

  const canEdit = (record: StyleBom) => !ctx.locked && (ctx.tableEditable || ctx.isEditing(record));

  const renderImageEditor = (record: StyleBom) => {
    if (!canEdit(record)) return undefined;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Form.Item name={ctx.rowName(record.id, 'imageUrls')} hidden noStyle>
          <Input />
        </Form.Item>
        <Form.Item noStyle shouldUpdate>
          {() => {
            const formVal = form.getFieldValue(ctx.rowName(record.id, 'imageUrls'));
            const displayUrls: string[] = (() => {
              try { return JSON.parse(formVal ?? record.imageUrls ?? '[]'); } catch { return []; }
            })();
            return (
              <ImageUploadBox
                size={48}
                value={displayUrls[0] ?? null}
                onChange={(url) => {
                  form.setFieldValue(ctx.rowName(record.id, 'imageUrls'), url ? JSON.stringify([url]) : JSON.stringify([]));
                }}
              />
            );
          }}
        </Form.Item>
      </div>
    );
  };

  const renderMaterialTypeEditor = (text: string, record: StyleBom) => {
    if (canEdit(record)) {
      return (
        <Form.Item name={ctx.rowName(record.id, 'materialType')} style={{ margin: 0 }}>
          <Select
            options={materialTypeOptions as any}
            style={{ width: '100%' }}
          />
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderMaterialCodeEditor = (text: string, record: StyleBom) => {
    if (canEdit(record)) {
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <Form.Item name={ctx.rowName(record.id, 'materialCode')} style={{ margin: 0, flex: 1 }} rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="输入编码或点击选择→" />
          </Form.Item>
          <Button
            size="small"
            onClick={() => {
              ctx.setMaterialTargetRowId(String(record.id));
              ctx.setMaterialTab('select');
              ctx.setMaterialKeyword('');
              ctx.setMaterialModalOpen(true);
              ctx.fetchMaterials(1, '');
            }}
            style={{ flexShrink: 0 }}
          >
            选择
          </Button>
        </div>
      );
    }
    return undefined;
  };

  const renderTextEditor = (fieldName: string, record: StyleBom, required = false) => {
    if (canEdit(record)) {
      return (
        <Form.Item name={ctx.rowName(record.id, fieldName)} style={{ margin: 0 }} rules={required ? [{ required: true, message: '必填' }] : undefined}>
          <Input />
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderDictEditor = (fieldName: string, record: StyleBom, dictType: string, placeholder: string, required = false) => {
    if (canEdit(record)) {
      return (
        <Form.Item name={ctx.rowName(record.id, fieldName)} style={{ margin: 0 }} rules={required ? [{ required: true, message: '必填' }] : undefined}>
          <DictAutoComplete dictType={dictType} placeholder={placeholder} />
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderNumberEditor = (fieldName: string, record: StyleBom, min: number, step: number, prefix?: string, required = false) => {
    if (canEdit(record)) {
      return (
        <Form.Item name={ctx.rowName(record.id, fieldName)} style={{ margin: 0 }} rules={required ? [{ required: true, message: '必填' }] : undefined}>
          <InputNumber min={min} step={step} prefix={prefix} style={{ width: '100%' }} />
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderSupplierEditor = (text: string, record: StyleBom) => {
    if (canEdit(record)) {
      return (
        <>
          <Form.Item name={ctx.rowName(record.id, 'supplierId')} hidden>
            <Input />
          </Form.Item>
          <Form.Item name={ctx.rowName(record.id, 'supplierContactPerson')} hidden>
            <Input />
          </Form.Item>
          <Form.Item name={ctx.rowName(record.id, 'supplierContactPhone')} hidden>
            <Input />
          </Form.Item>
          <Form.Item name={ctx.rowName(record.id, 'supplier')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
            <SupplierSelect
              placeholder="选择供应商"
              onChange={(_, option) => {
                if (option) {
                  form.setFieldsValue({
                    [ctx.rowName(record.id, 'supplierId') as any]: option.id,
                    [ctx.rowName(record.id, 'supplierContactPerson') as any]: option.supplierContactPerson,
                    [ctx.rowName(record.id, 'supplierContactPhone') as any]: option.supplierContactPhone,
                  });
                }
              }}
            />
          </Form.Item>
        </>
      );
    }
    return undefined;
  };

  const renderDevUsageAmountEditor = (text: number, record: StyleBom) => {
    if (canEdit(record)) {
      return (
        <Form.Item name={ctx.rowName(record.id, 'devUsageAmount')} style={{ margin: 0 }}>
          <InputNumber
            min={0}
            step={0.01}
            style={{ width: '100%' }}
            onChange={(val) => {
              if (val != null) {
                form.setFieldValue(ctx.rowName(record.id, 'usageAmount'), val);
              }
            }}
          />
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderConversionRateEditor = (text: number, record: StyleBom) => {
    const value = Number(text ?? 1) || 1;
    if (canEdit(record)) {
      return (
        <Form.Item name={ctx.rowName(record.id, 'conversionRate')} style={{ margin: 0 }} initialValue={value}>
          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderLossRateEditor = (text: number, record: StyleBom) => {
    if (canEdit(record)) {
      return (
        <Form.Item name={ctx.rowName(record.id, 'lossRate')} style={{ margin: 0 }}>
          <InputNumber min={0} max={100} style={{ width: '100%' }} />
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderUnitPriceEditor = (text: number, record: StyleBom) => {
    if (canEdit(record)) {
      return (
        <Form.Item name={ctx.rowName(record.id, 'unitPrice')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
          <InputNumber min={0} step={0.01} prefix="¥" style={{ width: '100%' }} />
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderTotalPriceEditor = (text: number, record: StyleBom) => {
    if (canEdit(record)) {
      const rid = String(record.id);
      return (
        <Form.Item
          noStyle
          shouldUpdate={(prev, next) =>
            JSON.stringify(prev?.[rid]) !== JSON.stringify(next?.[rid])
          }
        >
          {() => {
            const row = form.getFieldValue(rid) || {};
            const base = { ...record, ...row };
            const value = ctx.calcTotalPrice(base);
            return `¥${Number(value || 0).toFixed(2)}`;
          }}
        </Form.Item>
      );
    }
    return undefined;
  };

  const renderConvertedUsageEditor = (record: StyleBom) => {
    if (canEdit(record)) {
      return (
        <Form.Item
          noStyle
          shouldUpdate={(prev, next) =>
            JSON.stringify(prev?.[String(record.id)]) !== JSON.stringify(next?.[String(record.id)])
          }
        >
          {() => {
            const converted = computeConvertedUsage(record, form, activeSizes);
            if (converted.value == null) return '-';
            return `${converted.value}${converted.unit}`;
          }}
        </Form.Item>
      );
    }
    return undefined;
  };

  return {
    modal,
    canEdit,
    renderImageEditor,
    renderMaterialTypeEditor,
    renderMaterialCodeEditor,
    renderTextEditor,
    renderDictEditor,
    renderNumberEditor,
    renderSupplierEditor,
    renderDevUsageAmountEditor,
    renderConversionRateEditor,
    renderLossRateEditor,
    renderUnitPriceEditor,
    renderTotalPriceEditor,
    renderConvertedUsageEditor,
  };
}
