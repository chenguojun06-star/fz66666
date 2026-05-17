import { useMemo } from 'react';
import { InputNumber, Modal, Select } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { toNumberSafe } from '@/utils/api';
import { useDictOptions } from '@/hooks/useDictOptions';

const PROGRESS_STAGE_FALLBACK = [
  { label: '采购', value: '采购' },
  { label: '裁剪', value: '裁剪' },
  { label: '二次工艺', value: '二次工艺' },
  { label: '车缝', value: '车缝' },
  { label: '尾部', value: '尾部' },
  { label: '入库', value: '入库' },
];

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
  const { options: progressStageOptions } = useDictOptions('progress_stage', PROGRESS_STAGE_FALLBACK);
  const { options: difficultyOptions } = useDictOptions('process_difficulty', [
    { label: '易', value: 'EASY' },
    { label: '中', value: 'MEDIUM' },
    { label: '难', value: 'HARD' },
  ]);
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
               
                value={value || '车缝'}
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'progressStage', nextValue)}
                options={progressStageOptions}
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
               
                value={value || undefined}
                allowClear
                placeholder="选择"
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'difficulty', nextValue)}
                options={difficultyOptions}
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
              style={{ color: 'var(--color-danger)', cursor: 'pointer', fontSize: 12 }}
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
  }, [editMode, sizes, data, updateField, updateSizePrice, handleRemoveSize, handleDelete, progressStageOptions]);
}
