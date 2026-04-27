import { useMemo } from 'react';
import { InputNumber, Modal, Select } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { toNumberSafe } from '@/utils/api';

const PROGRESS_STAGES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

interface StyleProcessRow {
  id: string | number;
  processCode: string;
  processName: string;
  progressStage: string;
  machineType: string;
  difficulty?: string;
  standardTime: number;
  price: number;
  sortOrder: number;
  sizePrices?: Record<string, number>;
  sizePriceTouched?: Record<string, boolean>;
}

export default function useProcessPriceColumns(
  editMode: boolean,
  sizes: string[],
  data: StyleProcessRow[],
  updateField: (id: string | number, field: keyof StyleProcessRow, value: any) => void,
  updateSizePrice: (id: string | number, size: string, value: number) => void,
  handleRemoveSize: (size: string) => void,
  handleDelete: (id: string | number) => void,
) {
  return useMemo(() => {
    const editable = editMode;
    const baseColumns = [
      {
        title: '排序',
        dataIndex: 'sortOrder',
        width: 60,
        align: 'center' as const,
        render: (_: any, __: StyleProcessRow, index: number) => index + 1,
      },
      {
        title: '工序编码',
        dataIndex: 'processCode',
        width: 88,
        ellipsis: true,
      },
      {
        title: '工序名称',
        dataIndex: 'processName',
        width: 150,
        ellipsis: true,
        render: (value: string, record: StyleProcessRow) => editable
          ? (
              <DictAutoComplete
                dictType="process_name"
                autoCollect
                size="small"
                value={value}
                onChange={(nextValue) => updateField(record.id, 'processName', nextValue as string)}
              />
            )
          : (value || '-'),
      },
      {
        title: '进度节点',
        dataIndex: 'progressStage',
        width: 110,
        render: (value: string, record: StyleProcessRow) => editable
          ? (
              <Select
                size="small"
                value={value || '车缝'}
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'progressStage', nextValue)}
                options={PROGRESS_STAGES.map((stage) => ({ value: stage, label: stage }))}
              />
            )
          : (value || '车缝'),
      },
      {
        title: '机器类型',
        dataIndex: 'machineType',
        width: 110,
        ellipsis: true,
        render: (value: string, record: StyleProcessRow) => editable
          ? (
              <DictAutoComplete
                dictType="machine_type"
                autoCollect
                size="small"
                value={value}
                placeholder="请选择或输入机器类型"
                onChange={(nextValue) => updateField(record.id, 'machineType', nextValue as string)}
              />
            )
          : (value || '-'),
      },
      {
        title: '工序难度',
        dataIndex: 'difficulty',
        width: 90,
        render: (value: string, record: StyleProcessRow) => editable
          ? (
              <Select
                size="small"
                value={value || undefined}
                allowClear
                placeholder="选择"
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'difficulty', nextValue)}
                options={[
                  { value: '易', label: '易' },
                  { value: '中', label: '中' },
                  { value: '难', label: '难' },
                ]}
              />
            )
          : (value || '-'),
      },
      {
        title: '标准工时(秒)',
        dataIndex: 'standardTime',
        width: 110,
        render: (value: number, record: StyleProcessRow) => editable
          ? (
              <InputNumber
                size="small"
                value={value}
                min={0}
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'standardTime', toNumberSafe(nextValue))}
              />
            )
          : value,
      },
      {
        title: '工价(元)',
        dataIndex: 'price',
        width: 110,
        render: (value: number, record: StyleProcessRow) => editable
          ? (
              <InputNumber
                size="small"
                value={value}
                min={0}
                step={0.01}
                prefix="¥"
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'price', nextValue)}
              />
            )
          : `¥${toNumberSafe(value)}`,
      },
    ];

    const sizeColumns = sizes.map((size) => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span>{size}码</span>
          {editable && (
            <DeleteOutlined
              style={{ color: 'var(--color-danger)', cursor: 'pointer', fontSize: 10 }}
              onClick={(event) => {
                event.stopPropagation();
                Modal.confirm({
                  width: '30vw',
                  title: `确定删除"${size}"码？`,
                  content: '删除后该尺码单价数据将被清除',
                  onOk: () => handleRemoveSize(size),
                });
              }}
            />
          )}
        </div>
      ),
      dataIndex: `size_${size}`,
      width: 90,
      render: (_: any, record: StyleProcessRow) => {
        const price = record.sizePrices?.[size] ?? record.price ?? 0;
        return editable
          ? (
              <InputNumber
                size="small"
                value={price}
                min={0}
                step={0.01}
                prefix="¥"
                style={{ width: '100%' }}
                onChange={(nextValue) => updateSizePrice(record.id, size, toNumberSafe(nextValue))}
              />
            )
          : `¥${toNumberSafe(price)}`;
      },
    }));

    const actionColumn = {
      title: '操作',
      dataIndex: 'action',
      width: 80,
      resizable: false,
      render: (_: any, record: StyleProcessRow) => editable
        ? (
            <RowActions
              maxInline={1}
              actions={[
                {
                  key: 'delete',
                  label: '删除',
                  danger: true,
                  onClick: () => Modal.confirm({
                    width: '30vw',
                    title: '确定删除?',
                    onOk: () => handleDelete(record.id),
                  }),
                },
              ]}
            />
          )
        : null,
    };

    return [...baseColumns, ...sizeColumns, actionColumn];
  }, [editMode, sizes, data, updateField, updateSizePrice, handleRemoveSize, handleDelete]);
}
