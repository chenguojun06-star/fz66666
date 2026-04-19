import React, { useMemo } from 'react';
import {
  Button,
  Checkbox,
  Dropdown,
  Image,
  Input,
  InputNumber,
  Tag,
  Upload,
} from 'antd';
import {
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { STAGE_ACCENT, STAGE_ACCENT_LIGHT } from '@/utils/stageStyles';
import type { ProcessStepRow, ProcessTableData } from '../../utils/templateUtils';
import { normalizeProcessSteps } from '../../utils/templateUtils';

const STAGE_ORDER = ['采购', '裁剪', '车缝', '二次工艺', '尾部', '入库'];
const EDITOR_FONT_SIZE = 12;

interface ProcessInlineTableProps {
  value: ProcessTableData;
  onChange: (next: ProcessTableData) => void;
  readOnly?: boolean;
  compact?: boolean;
  allowProcessPriceImages: boolean;
  showSizePrices: boolean;
  onShowSizePricesChange: (next: boolean) => void;
  templateSizes: string[];
  newSizeName: string;
  onNewSizeNameChange: (next: string) => void;
  onAddSize: () => void;
  onRemoveSize: (size: string) => void;
  imageUrls: string[];
  imageUploading: boolean;
  onUploadImage: (file: File) => Promise<any>;
  onRemoveImage: (url: string) => void;
}

const ProcessInlineTable: React.FC<ProcessInlineTableProps> = ({
  value,
  onChange,
  readOnly = false,
  compact = false,
  allowProcessPriceImages,
  showSizePrices,
  onShowSizePricesChange,
  templateSizes,
  newSizeName,
  onNewSizeNameChange,
  onAddSize,
  onRemoveSize,
  imageUrls,
  imageUploading,
  onUploadImage,
  onRemoveImage,
}) => {
  const sortedSteps = useMemo(() => {
    return value.steps
      .map((step, index) => ({ ...step, _origIdx: index }))
      .sort((left, right) => {
        const leftStageIndex = STAGE_ORDER.indexOf(left.progressStage || '车缝');
        const rightStageIndex = STAGE_ORDER.indexOf(right.progressStage || '车缝');
        return leftStageIndex - rightStageIndex;
      });
  }, [value.steps]);

  const stageSpanMap = useMemo(() => {
    const map = new Map<number, { rowSpan: number; stage: string; count: number }>();
    let index = 0;
    while (index < sortedSteps.length) {
      const stage = sortedSteps[index].progressStage || '车缝';
      let nextIndex = index + 1;
      while (nextIndex < sortedSteps.length && (sortedSteps[nextIndex].progressStage || '车缝') === stage) {
        nextIndex += 1;
      }
      const count = nextIndex - index;
      map.set(index, { rowSpan: count, stage, count });
      for (let current = index + 1; current < nextIndex; current += 1) {
        map.set(current, { rowSpan: 0, stage, count });
      }
      index = nextIndex;
    }
    return map;
  }, [sortedSteps]);

  const updateStep = (sortedIndex: number, updates: Partial<ProcessStepRow>) => {
    const originalIndex = sortedSteps[sortedIndex]?._origIdx ?? sortedIndex;
    const nextSteps = [...value.steps];
    nextSteps[originalIndex] = { ...nextSteps[originalIndex], ...updates };
    onChange({ ...value, steps: nextSteps });
  };

  const deleteStep = (sortedIndex: number) => {
    const originalIndex = sortedSteps[sortedIndex]?._origIdx ?? sortedIndex;
    const nextSteps = value.steps.filter((_, index) => index !== originalIndex);
    onChange({ ...value, steps: normalizeProcessSteps(nextSteps) });
  };

  const addStepToStage = (stage: string) => {
    const maxCode = value.steps.reduce((max, step) => {
      const parsed = Number.parseInt(String(step.processCode ?? '').trim() || '0', 10);
      return Number.isFinite(parsed) && parsed > max ? parsed : max;
    }, 0);
    const nextCode = String(maxCode + 1).padStart(2, '0');
    const nextStep: ProcessStepRow = {
      processCode: nextCode,
      processName: '',
      progressStage: stage,
      machineType: '',
      difficulty: '',
      standardTime: 0,
      unitPrice: 0,
      sizePrices: templateSizes.reduce((acc, size) => ({ ...acc, [size]: 0 }), {} as Record<string, number>),
    };
    onChange({ ...value, steps: [...value.steps, nextStep] });
  };

  const columns = [
    {
      title: '排序',
      width: compact ? 40 : 44,
      render: (_: unknown, __: ProcessStepRow, index: number) => (
        <span style={{ color: 'var(--neutral-text-disabled)', fontSize: EDITOR_FONT_SIZE }}>
          {index + 1}
        </span>
      ),
    },
    {
      title: '工序编号',
      dataIndex: 'processCode',
      width: compact ? 60 : 72,
      render: (text: string, _: ProcessStepRow, index: number) => (
        <Input
          size="small"
          value={text || ''}
          disabled={readOnly}
          onChange={(event) => updateStep(index, { processCode: event.target.value })}
          style={{ border: 'none', fontSize: EDITOR_FONT_SIZE, padding: 0 }}
        />
      ),
    },
    {
      title: '工序名称',
      dataIndex: 'processName',
      width: compact ? 108 : 120,
      render: (text: string, _: ProcessStepRow, index: number) => (
        <DictAutoComplete
          dictType="process_name"
          autoCollect
          size="small"
          value={text || ''}
          disabled={readOnly}
          onChange={(nextValue) => updateStep(index, { processName: nextValue as string })}
          style={{ border: 'none', fontSize: EDITOR_FONT_SIZE }}
        />
      ),
    },
    {
      title: '进度节点',
      dataIndex: 'progressStage',
      width: compact ? 112 : 130,
      onCell: (_: ProcessStepRow, index?: number) => {
        const info = stageSpanMap.get(index ?? -1);
        return {
          rowSpan: info?.rowSpan ?? 1,
          style: info && info.rowSpan > 0
            ? {
                background: STAGE_ACCENT_LIGHT,
                borderLeft: `3px solid ${STAGE_ACCENT}`,
                verticalAlign: 'middle' as const,
                textAlign: 'center' as const,
              }
            : undefined,
        };
      },
      render: (_: string, record: ProcessStepRow, index: number) => {
        const info = stageSpanMap.get(index);
        if (!info || info.rowSpan === 0) return null;
        const stage = record.progressStage || '车缝';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Tag style={{ background: STAGE_ACCENT, color: '#fff', border: 'none', fontWeight: 600, fontSize: compact ? 12 : 13, marginInlineEnd: 0 }}>
              {stage}
            </Tag>
            <span style={{ fontSize: compact ? 11 : 12, color: '#999' }}>{info.count} 个工序</span>
            {readOnly ? null : (
              <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addStepToStage(stage)} style={{ padding: 0 }}>
                添加
              </Button>
            )}
          </div>
        );
      },
    },
    {
      title: '机器类型',
      dataIndex: 'machineType',
      width: compact ? 108 : 120,
      render: (text: string, _: ProcessStepRow, index: number) => (
        <DictAutoComplete
          dictType="machine_type"
          autoCollect
          size="small"
          value={text || ''}
          disabled={readOnly}
          onChange={(nextValue) => updateStep(index, { machineType: nextValue as string })}
          style={{ border: 'none', fontSize: EDITOR_FONT_SIZE }}
        />
      ),
    },
    {
      title: '工序难度',
      dataIndex: 'difficulty',
      width: compact ? 84 : 96,
      render: (value: string, _: ProcessStepRow, index: number) => (
        <Input
          size="small"
          value={value || ''}
          disabled={readOnly}
          onChange={(event) => updateStep(index, { difficulty: event.target.value })}
          style={{ border: 'none', fontSize: EDITOR_FONT_SIZE }}
        />
      ),
    },
    {
      title: '工时(秒)',
      dataIndex: 'standardTime',
      width: compact ? 84 : 96,
      render: (value: number, _: ProcessStepRow, index: number) => (
        <InputNumber
          size="small"
          min={0}
          disabled={readOnly}
          value={value || 0}
          onChange={(nextValue) => updateStep(index, { standardTime: nextValue || 0 })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '工价(元)',
      dataIndex: 'unitPrice',
      width: compact ? 84 : 96,
      render: (_: unknown, record: ProcessStepRow, index: number) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          disabled={readOnly}
          value={record.unitPrice ?? record.price ?? 0}
          onChange={(nextValue) => updateStep(index, { unitPrice: nextValue || 0 })}
          style={{ width: '100%' }}
        />
      ),
    },
    ...(
      showSizePrices
        ? templateSizes.map((size) => ({
            title: `${size}码`,
            width: compact ? 80 : 88,
            render: (_: unknown, record: ProcessStepRow, index: number) => (
              <InputNumber
                size="small"
                min={0}
                precision={2}
                disabled={readOnly}
                value={record.sizePrices?.[size] ?? record.unitPrice ?? record.price ?? 0}
                onChange={(nextValue) => {
                  const originalIndex = sortedSteps[index]?._origIdx ?? index;
                  const nextSteps = [...value.steps];
                  nextSteps[originalIndex] = {
                    ...nextSteps[originalIndex],
                    sizePrices: {
                      ...(nextSteps[originalIndex].sizePrices || {}),
                      [size]: nextValue || 0,
                    },
                  };
                  onChange({ ...value, steps: nextSteps });
                }}
                style={{ width: '100%' }}
              />
            ),
          }))
        : []
    ),
    {
      title: '操作',
      key: 'action',
      width: compact ? 60 : 72,
      render: (_: unknown, __: ProcessStepRow, index: number) => (
        readOnly ? null : (
          <Button danger type="link" size="small" onClick={() => deleteStep(index)}>
            删除
          </Button>
        )
      ),
    },
  ];

  return (
    <div>
      <div style={compact ? { display: 'grid', gap: 8, marginBottom: 8 } : { marginBottom: 12, padding: '10px 12px', background: '#f9f9f9', borderRadius: 8 }}>
        {allowProcessPriceImages && (!readOnly || imageUrls.length > 0) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: compact ? 0 : 12 }}>
            {compact ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neutral-text-secondary)' }}>参考图</span> : null}
            {!compact ? <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, width: '100%' }}>款号参考图</div> : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {imageUrls.map((url) => (
                <div key={url} style={{ position: 'relative', width: compact ? 44 : 52, height: compact ? 44 : 52 }}>
                  <Image
                    src={getFullAuthedFileUrl(url)}
                    width={compact ? 44 : 52}
                    height={compact ? 44 : 52}
                    style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }}
                    preview
                  />
                  {readOnly ? null : (
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => onRemoveImage(url)}
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        minWidth: 18,
                        width: 18,
                        height: 18,
                        padding: 0,
                        background: '#fff',
                        borderRadius: '50%',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                      }}
                    />
                  )}
                </div>
              ))}
              {imageUrls.length < 4 ? (
                <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => onUploadImage(file as File)}>
                  <Button size="small" icon={<UploadOutlined />} loading={imageUploading} disabled={readOnly}>
                    上传图片
                  </Button>
                </Upload>
              ) : null}
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {readOnly ? (
            showSizePrices ? <Tag style={{ marginInlineEnd: 0 }}>多码单价</Tag> : null
          ) : (
            <Checkbox id="showSizePrices" checked={showSizePrices} onChange={(event) => onShowSizePricesChange(event.target.checked)}>
              显示多码单价
            </Checkbox>
          )}
          {!compact && showSizePrices ? (
            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>
              各尺码单价不同时使用，默认沿用工价。
            </span>
          ) : null}
        </div>
        {showSizePrices ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>尺码</span>
            {templateSizes.map((size) => (
              <Tag key={size} closable={!readOnly} onClose={() => onRemoveSize(size)} style={{ marginInlineEnd: 0 }}>
                {size}
              </Tag>
            ))}
            {readOnly ? null : (
              <>
                <Input
                  size="small"
                  placeholder="添加尺码"
                  value={newSizeName}
                  onChange={(event) => onNewSizeNameChange(event.target.value)}
                  onPressEnter={onAddSize}
                  style={{ width: compact ? 96 : 110 }}
                />
                <Button size="small" type="primary" onClick={onAddSize}>添加</Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <ResizableTable
        storageKey="maintenance-inline-process-editor"
        size="small"
        bordered
        autoScrollY={false}
        pagination={false}
        scroll={{ x: compact ? (showSizePrices ? 760 + templateSizes.length * 80 : 760) : (showSizePrices ? 960 + templateSizes.length * 88 : 960) }}
        rowKey={(record: ProcessStepRow & { _origIdx?: number }) => String(record.processCode || record._origIdx || 0)}
        columns={columns}
        dataSource={sortedSteps}
        footer={() => (readOnly ? null : (
          <Dropdown
            menu={{
              items: STAGE_ORDER.map((stage) => ({ key: stage, label: stage })),
              onClick: ({ key }) => addStepToStage(String(key)),
            }}
          >
            <Button type="dashed" size="small" style={{ width: '100%' }}>
              新增工序 <DownOutlined />
            </Button>
          </Dropdown>
        ))}
      />
    </div>
  );
};

export default ProcessInlineTable;
