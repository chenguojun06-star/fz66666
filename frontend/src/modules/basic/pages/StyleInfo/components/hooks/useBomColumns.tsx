import { App, Form, Input, Button, Select, InputNumber, Tag, Space, Image, Tooltip } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { StyleBom } from '@/types/style';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SupplierSelect from '@/components/common/SupplierSelect';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { getMaterialTypeLabel } from '@/utils/materialType';

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
  const { modal } = App.useApp();
  const parseSizeUsageMap = (value?: string) => {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
    } catch {
      return {};
    }
  };
  const normalizeUnitText = (value?: string) => String(value || '').trim().toLowerCase();
  const isMeterUnit = (value?: string) => {
    const unit = normalizeUnitText(value);
    return unit === '米' || unit === 'm' || unit === 'meter' || unit === 'meters';
  };
  const isKilogramUnit = (value?: string) => {
    const unit = normalizeUnitText(value);
    return unit === 'kg' || unit === '公斤' || unit === '千克' || unit === 'kilogram' || unit === 'kilograms';
  };
  const isZipperRow = (record: StyleBom) => /拉链/.test(String(record.materialName || ''));
  const computeAverageMeterUsage = (record: StyleBom) => {
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
  const computeConvertedUsage = (record: StyleBom) => {
    const row = form.getFieldValue(String(record.id)) || {};
    const bomUnit = String(row.unit ?? record.unit ?? '').trim();
    const patternUnit = String(row.patternUnit ?? record.patternUnit ?? '米').trim();
    const conversionRate = Number(row.conversionRate ?? record.conversionRate ?? 1) || 1;
    const meterValue = computeAverageMeterUsage(record);
    if (!isKilogramUnit(bomUnit) || !isMeterUnit(patternUnit) || conversionRate <= 0) {
      return { unit: '公斤', value: null as number | null };
    }
    return { unit: '公斤', value: Number((meterValue / conversionRate).toFixed(4)) };
  };

  const columns = [
    {
      title: '图片',
      dataIndex: 'imageUrls',
      key: 'imageUrls',
      width: 100,
      render: (_: any, record: StyleBom) => {
        // 编辑模式：显示上传按钮
        if (!locked && (tableEditable || isEditing(record))) {
          const existingUrls: string[] = (() => {
            try { return JSON.parse(record.imageUrls || '[]'); } catch { return []; }
          })();
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <ImageUploadBox
                size={64}
                value={existingUrls[0] ?? null}
                onChange={(url) => {
                  form.setFieldValue(rowName(record.id, 'imageUrls'), url ? JSON.stringify([url]) : JSON.stringify([]));
                }}
              />
              <Form.Item name={rowName(record.id, 'imageUrls')} hidden noStyle>
                <Input />
              </Form.Item>
            </div>
          );
        }
        // 查看模式
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
        const label = getMaterialTypeLabel(text);
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'materialType')} style={{ margin: 0 }}>
              <Select
                options={materialTypeOptions as any}
                style={{ width: '100%' }}
              />
            </Form.Item>
          );
        }
        return label;
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <div style={{ display: 'flex', gap: 4 }}>
              <Form.Item name={rowName(record.id, 'materialCode')} style={{ margin: 0, flex: 1 }} rules={[{ required: true, message: '必填' }]}>
                <Input placeholder="输入编码或点击选择→" />
              </Form.Item>
              <Button
                size="small"
                onClick={() => {
                  setMaterialTargetRowId(String(record.id));
                  setMaterialTab('select');
                  setMaterialKeyword('');
                  setMaterialModalOpen(true);
                  fetchMaterials(1, '');
                }}
                style={{ flexShrink: 0 }}
              >
                选择
              </Button>
            </div>
          );
        }
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'materialName')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <Input />
            </Form.Item>
          );
        }
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'fabricComposition')} style={{ margin: 0 }}>
              <DictAutoComplete dictType="fabric_composition" placeholder="如：100%棉 / 95%棉5%氨纶" />
            </Form.Item>
          );
        }
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'fabricWeight')} style={{ margin: 0 }}>
              <DictAutoComplete dictType="fabric_weight" placeholder="如：220g" />
            </Form.Item>
          );
        }
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'color')} style={{ margin: 0 }}>
              <DictAutoComplete dictType="color" placeholder="请输入或选择颜色" />
            </Form.Item>
          );
        }
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'specification')} style={{ margin: 0 }}>
              <DictAutoComplete dictType="material_specification" placeholder="请输入或选择规格" />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '开发用量',
      dataIndex: 'devUsageAmount',
      key: 'devUsageAmount',
      width: 100,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'devUsageAmount')} style={{ margin: 0 }}>
              <InputNumber
                min={0}
                step={0.01}
                style={{ width: '100%' }}
                onChange={(val) => {
                  if (val != null) {
                    form.setFieldValue(rowName(record.id, 'usageAmount'), val);
                  }
                }}
              />
            </Form.Item>
          );
        }
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
        if (!locked && (tableEditable || isEditing(record))) {
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
        const rowSpecMap = row.sizeSpecMapObject || parseSizeUsageMap(record.sizeSpecMap);
        const zipperRow = isZipperRow(record);
        if (!activeSizes.length) {
          return '-';
        }
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <div style={{ display: 'grid', gap: zipperRow ? 8 : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeSizes.length}, minmax(108px, 1fr))`, gap: 8 }}>
                {activeSizes.map((sizeKey) => (
                  <div key={sizeKey} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ flex: '0 0 auto', minWidth: 16, fontSize: 12, color: '#595959', textAlign: 'center' }}>{sizeKey}</span>
                    <Form.Item
                      name={[String(record.id), 'sizeUsageMapObject', sizeKey]}
                      style={{ margin: 0, flex: 1 }}
                      initialValue={Number(rowUsageMap?.[sizeKey] ?? record.usageAmount ?? 0)}
                    >
                      <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                ))}
              </div>
              {zipperRow ? (
                <div style={{ padding: '6px 8px', borderRadius: 8, background: '#fafafa' }}>
                  <div style={{ marginBottom: 6, fontSize: 12, color: '#8c8c8c' }}>拉链规格(cm)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeSizes.length}, minmax(108px, 1fr))`, gap: 8 }}>
                    {activeSizes.map((sizeKey) => (
                      <div key={`spec-${sizeKey}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ flex: '0 0 auto', minWidth: 16, fontSize: 12, color: '#595959', textAlign: 'center' }}>{sizeKey}</span>
                        <Form.Item
                          name={[String(record.id), 'sizeSpecMapObject', sizeKey]}
                          style={{ margin: 0, flex: 1 }}
                          initialValue={Number(rowSpecMap?.[sizeKey] ?? 0)}
                        >
                          <InputNumber min={0} step={1} style={{ width: '100%' }} />
                        </Form.Item>
                        <span style={{ flex: '0 0 auto', fontSize: 12, color: '#8c8c8c' }}>cm</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <div style={{ display: 'grid', gap: zipperRow ? 8 : 0 }}>
            <Space size={[4, 4]} wrap>
              {activeSizes.map((sizeKey) => (
                <Tag key={sizeKey} style={{ marginInlineEnd: 0 }}>
                  {sizeKey}:{Number(rowUsageMap?.[sizeKey] ?? record.usageAmount ?? 0)}
                </Tag>
              ))}
            </Space>
            {zipperRow ? (
              <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.8 }}>
                拉链规格：
                {activeSizes.map((sizeKey) => (
                  <span key={`spec-view-${sizeKey}`} style={{ marginLeft: 8 }}>
                    {sizeKey} {Number(rowSpecMap?.[sizeKey] ?? 0)}cm
                  </span>
                ))}
              </div>
            ) : null}
          </div>
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'conversionRate')} style={{ margin: 0 }} initialValue={value}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        if (!canConvertToKg) return '-';
        return value > 0 ? `${value} 米/公斤` : '-';
      }
    },
    {
      title: '公斤数',
      key: 'convertedUsage',
      width: 120,
      render: (_: unknown, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item
              noStyle
              shouldUpdate={(prev, next) =>
                JSON.stringify(prev?.[String(record.id)]) !== JSON.stringify(next?.[String(record.id)])
              }
            >
              {() => {
                const converted = computeConvertedUsage(record);
                if (converted.value == null) return '-';
                return `${converted.value}${converted.unit}`;
              }}
            </Form.Item>
          );
        }
        const converted = computeConvertedUsage(record);
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'lossRate')} style={{ margin: 0 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        return `${text}%`;
      }
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 110,
      editable: true,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'unitPrice')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={0} step={0.01} prefix="¥" style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        return `¥${Number(text || 0).toFixed(2)}`;
      }
    },
    {
      title: '小计',
      dataIndex: 'totalPrice',
      width: 110,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
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
                const value = calcTotalPrice(base);
                return `¥${Number(value || 0).toFixed(2)}`;
              }}
            </Form.Item>
          );
        }

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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'unit')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <DictAutoComplete dictType="material_unit" placeholder="请输入或选择单位" />
            </Form.Item>
          );
        }
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
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <>
              <Form.Item name={rowName(record.id, 'supplierId')} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={rowName(record.id, 'supplierContactPerson')} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={rowName(record.id, 'supplierContactPhone')} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={rowName(record.id, 'supplier')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
                <SupplierSelect
                  placeholder="选择供应商"
                  onChange={(_, option) => {
                    if (option) {
                      form.setFieldsValue({
                        [rowName(record.id, 'supplierId') as any]: option.id,
                        [rowName(record.id, 'supplierContactPerson') as any]: option.supplierContactPerson,
                        [rowName(record.id, 'supplierContactPhone') as any]: option.supplierContactPhone,
                      });
                    }
                  }}
                />
              </Form.Item>
            </>
          );
        }
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
