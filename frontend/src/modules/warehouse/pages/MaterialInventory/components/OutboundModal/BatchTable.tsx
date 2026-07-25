import React, { useState } from 'react';
import { Tag, InputNumber, Button, Space, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { MaterialBatchDetail } from '../../hooks/useMaterialInventoryData';

interface BatchTableProps {
  batchDetails: MaterialBatchDetail[];
  handleBatchQtyChange: (_index: number, _val: number | null) => void;
  unit: string;
  selectedBatchNos: string[];
  onSelectChange: (keys: string[]) => void;
  onAutoAllocate: (targetQty: number) => void;
  onClear: () => void;
}

const BatchTable: React.FC<BatchTableProps> = ({
  batchDetails,
  handleBatchQtyChange,
  unit,
  selectedBatchNos,
  onSelectChange,
  onAutoAllocate,
  onClear,
}) => {
  const [targetQty, setTargetQty] = useState<number | null>(null);

  const selectedCount = selectedBatchNos.length;
  const totalOutbound = batchDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
  const totalAvailable = batchDetails.reduce((sum, item) => sum + item.availableQty, 0);

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <Typography.Text strong>批次出库明细</Typography.Text>
        <Space size="small" wrap>
          <InputNumber
            min={0}
            max={totalAvailable || undefined}
            placeholder="目标总量"
            value={targetQty}
            onChange={(v) => setTargetQty(v as number | null)}
            style={{ width: 130 }}
            addonAfter={unit}
            size="small"
          />
          <Button
            size="small"
            type="primary"
            onClick={() => onAutoAllocate(targetQty || 0)}
            disabled={!targetQty || targetQty <= 0}
          >
            按FIFO分配
          </Button>
          <Button size="small" onClick={onClear} disabled={selectedCount === 0}>
            清空选择
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        已选 <Typography.Text strong>{selectedCount}</Typography.Text> 项，
        本次出库合计 <Typography.Text strong style={{ color: 'var(--color-primary)' }}>{totalOutbound} {unit}</Typography.Text>，
        可用库存合计 <Typography.Text type="success">{totalAvailable} {unit}</Typography.Text>
      </div>

      <ResizableTable
        storageKey="material-inventory-batch-out"
        emptyDescription="暂无出库批次数据"
        rowSelection={{
          type: 'checkbox',
          selectedRowKeys: selectedBatchNos,
          onChange: (keys) => onSelectChange(keys as string[]),
          getCheckboxProps: (record: MaterialBatchDetail) => ({
            disabled: record.availableQty <= 0,
          }),
        }}
        columns={[
          {
            title: '批次号',
            dataIndex: 'batchNo',
            key: 'batchNo',
            width: 160,
            render: (text: string) => (
              <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{text}</span>
            ),
          },
          {
            title: '仓库位置',
            dataIndex: 'warehouseLocation',
            key: 'warehouseLocation',
            width: 100,
            align: 'center' as const,
          },
          {
            title: '颜色',
            dataIndex: 'color',
            key: 'color',
            width: 80,
            align: 'center' as const,
            render: (color: string) => color ? <Tag color="blue">{color}</Tag> : '-',
          },
          {
            title: '入库日期',
            dataIndex: 'inboundDate',
            key: 'inboundDate',
            width: 110,
            align: 'center' as const,
          },
          {
            title: '可用库存',
            dataIndex: 'availableQty',
            key: 'availableQty',
            width: 100,
            align: 'center' as const,
            render: (qty: number) => (
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{qty}</span>
            ),
          },
          {
            title: '锁定库存',
            dataIndex: 'lockedQty',
            key: 'lockedQty',
            width: 100,
            align: 'center' as const,
            render: (qty: number) => (
              <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{qty}</span>
            ),
          },
          {
            title: '出库数量',
            dataIndex: 'outboundQty',
            key: 'outboundQty',
            width: 140,
            align: 'center' as const,
            render: (value: number, _record: MaterialBatchDetail, index: number) => {
              const selected = selectedBatchNos.includes(_record.batchNo);
              return (
                <InputNumber
                  min={0}
                  max={_record.availableQty}
                  value={value}
                  onChange={(val) => handleBatchQtyChange(index, val)}
                  style={{ width: '100%' }}
                  placeholder={selected ? '0' : '先勾选批次'}
                  disabled={!selected}
                />
              );
            },
          },
        ]}
        dataSource={batchDetails}
        rowKey="batchNo"
        pagination={false}
        summary={() => (
          <ResizableTable.Summary fixed>
            <ResizableTable.Summary.Row>
              <ResizableTable.Summary.Cell key="label" index={0} colSpan={4} align="right">
                <strong>合计</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell key="available" index={1} align="center">
                <strong style={{ color: 'var(--color-success)' }}>{totalAvailable}</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell key="locked" index={2} />
              <ResizableTable.Summary.Cell key="outbound" index={3} align="center">
                <strong style={{ color: 'var(--color-primary)', fontSize: "var(--font-size-md)" }}>
                  {totalOutbound} {unit}
                </strong>
              </ResizableTable.Summary.Cell>
            </ResizableTable.Summary.Row>
          </ResizableTable.Summary>
        )}
      />
    </div>
  );
};

export default BatchTable;
