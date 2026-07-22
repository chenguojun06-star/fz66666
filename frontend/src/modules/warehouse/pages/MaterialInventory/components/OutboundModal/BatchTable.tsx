import React from 'react';
import { Tag, InputNumber } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { MaterialBatchDetail } from '../../hooks/useMaterialInventoryData';

interface BatchTableProps {
  batchDetails: MaterialBatchDetail[];
  handleBatchQtyChange: (_index: number, _val: number | null) => void;
  unit: string;
}

const BatchTable: React.FC<BatchTableProps> = ({ batchDetails, handleBatchQtyChange, unit }) => {
  return (
    <div>
      <div style={{
        fontSize: "var(--font-size-base)",
        fontWeight: 600,
        marginBottom: 12,
        color: 'var(--neutral-text)'
      }}>
         请选择需要出库的批次，并输入数量：
      </div>
      <ResizableTable
        storageKey="material-inventory-batch-out"
        emptyDescription="暂无出库批次数据"
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
            width: 120,
            align: 'center' as const,
            render: (value: number, _record: MaterialBatchDetail, index: number) => (
              <InputNumber
                min={0}
                max={_record.availableQty}
                value={value}
                onChange={(val) => handleBatchQtyChange(index, val)}
                style={{ width: '100%' }}
                placeholder="0"
              />
            ),
          },
        ]}
        dataSource={batchDetails}
        rowKey="batchNo"
        pagination={false}
       
        bordered
        summary={() => {
          const totalOutbound = batchDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
          const totalAvailable = batchDetails.reduce((sum, item) => sum + item.availableQty, 0);
          return (
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
          );
        }}
      />
    </div>
  );
};

export default BatchTable;
