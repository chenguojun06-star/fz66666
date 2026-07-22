import React from 'react';
import { Button, Checkbox, Dropdown, Input, Tag } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { STAGE_ORDER } from '@/utils/productionStage';
import { useProcessInlineTableData } from './useProcessInlineTableData';
import { buildProcessColumns } from './columns';
import ProcessImageUploader from './ProcessImageUploader';
import type { ProcessInlineTableProps } from './types';

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
  const { sortedSteps, stageSpanMap, updateStep, deleteStep, addStepToStage } = useProcessInlineTableData({
    value,
    onChange,
    templateSizes,
  });

  const columns = buildProcessColumns({
    readOnly,
    compact,
    showSizePrices,
    templateSizes,
    sortedSteps,
    stageSpanMap,
    value,
    onChange,
    updateStep,
    deleteStep,
    addStepToStage,
  });

  return (
    <div>
      <div style={compact ? { display: 'grid', gap: 8, marginBottom: 8 } : { marginBottom: 12, padding: '10px 12px', background: 'var(--color-bg-container)', borderRadius: 8 }}>
        {allowProcessPriceImages && (!readOnly || imageUrls.length > 0) ? (
          <ProcessImageUploader
            imageUrls={imageUrls}
            imageUploading={imageUploading}
            readOnly={readOnly}
            compact={compact}
            onUploadImage={onUploadImage}
            onRemoveImage={onRemoveImage}
          />
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
            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 14 }}>
              各尺码单价不同时使用，默认沿用工价。
            </span>
          ) : null}
        </div>
        {showSizePrices ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 14 }}>尺码</span>
            {templateSizes.map((size) => (
              <Tag key={size} closable={!readOnly} onClose={() => onRemoveSize(size)} style={{ marginInlineEnd: 0 }}>
                {size}
              </Tag>
            ))}
            {readOnly ? null : (
              <>
                <Input
                  placeholder="添加尺码"
                  value={newSizeName}
                  onChange={(event) => onNewSizeNameChange(event.target.value)}
                  onPressEnter={onAddSize}
                  style={{ width: compact ? 96 : 120 }}
                />
                <Button type="primary" onClick={onAddSize}>添加</Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <ResizableTable
        storageKey="maintenance-inline-process-editor"
        bordered
        pagination={false}
        reorderableColumns={false}
        scroll={{ x: compact ? (showSizePrices ? 760 + templateSizes.length * 80 : 760) : (showSizePrices ? 960 + templateSizes.length * 95 : 960) }}
        rowKey={(record) => String(record.processCode || record._origIdx || 0)}
        columns={columns}
        dataSource={sortedSteps}
        emptyDescription="暂无工序数据"
        footer={() => (readOnly ? null : (
          <Dropdown
            menu={{
              items: STAGE_ORDER.map((stage) => ({ key: stage, label: stage })),
              onClick: ({ key }) => addStepToStage(String(key)),
            }}
          >
            <Button type="dashed" style={{ width: '100%' }}>
              新增工序 <DownOutlined />
            </Button>
          </Dropdown>
        ))}
      />
    </div>
  );
};

export default ProcessInlineTable;
