import React from 'react';
import { Card } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import DisplayStatusTag from '@/components/common/DisplayStatusTag';
import { toNumberSafe } from '@/utils/api';
import { displayDate } from '@/utils/display';
import type { CuttingBundle, CuttingTask } from '@/types/production';

interface CuttingBundlesContentProps {
  cuttingTasks: CuttingTask[];
  cuttingBundles: CuttingBundle[];
}

/**
 * 裁剪明细 Tab 内容：当存在 cuttingBundles 时显示。
 *
 * 包含：
 * - 裁剪任务卡片（仅当 cuttingTasks 非空）
 * - 裁剪明细表格（cuttingBundles）
 */
export const CuttingBundlesContent: React.FC<CuttingBundlesContentProps> = ({
  cuttingTasks,
  cuttingBundles,
}) => {
  const taskReceiverName = cuttingTasks?.[0]?.receiverName || '';

  return (
    <div>
      {cuttingTasks && cuttingTasks.length > 0 && (
        <Card size="small" title="裁剪任务" style={{ marginBottom: 12 }}>
          <ResizableTable
            storageKey="order-flow-cutting-tasks"
            size="small"
            dataSource={cuttingTasks}
            rowKey={(r: any) => r.id || `${r.bedNo || ''}-${r.createTime || ''}`}
            emptyDescription="暂无裁剪任务"
            columns={[
              { title: '床号', dataIndex: 'bedNo', key: 'bedNo', width: 100, render: (v: any) => (v ? `第${v}床` : '-') },
              { title: '裁片数', dataIndex: 'cuttingQuantity', key: 'cuttingQuantity', width: 100, align: 'right' as const, render: (v: any) => toNumberSafe(v) },
              { title: '扎数', dataIndex: 'cuttingBundleCount', key: 'cuttingBundleCount', width: 80, align: 'right' as const, render: (v: any) => toNumberSafe(v) },
              { title: '操作人', dataIndex: 'receiverName', key: 'receiverName', width: 120, render: (v: any) => v || '-' },
              { title: '完成时间', dataIndex: 'bundledTime', key: 'bundledTime', width: 170, render: (v: any, record: any) => displayDate(v ?? record?.createTime, 'datetime') },
              { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: any) => <DisplayStatusTag status={v} variant="task" /> },
            ]}
            pagination={false}
            scroll={{ x: 670 }}
          />
        </Card>
      )}
      <ResizableTable
        storageKey="order-flow-cutting"
        size="small"
        dataSource={cuttingBundles}
        rowKey={(r: any) => r.id}
        emptyDescription="暂无裁剪明细"
        columns={[
          {
            title: '床号',
            dataIndex: 'bedNo',
            key: 'bedNo',
            width: 90,
            render: (v: any, record: any) => {
              if (!v) return '-';
              const sub = record.bedSubNo;
              return sub != null ? `${v}-${sub}` : String(v);
            },
          },
          { title: '扎号', dataIndex: 'bundleNo', key: 'bundleNo', width: 80 },
          { title: '标签号', dataIndex: 'bundleLabel', key: 'bundleLabel', width: 120, render: (v: any) => v || '-' },
          { title: '颜色', dataIndex: 'color', key: 'color', width: 100, render: (v: any) => String(v || '').trim() || '-' },
          { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
          { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const, render: (v: any) => toNumberSafe(v) },
          { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: any) => <DisplayStatusTag status={v} variant="bundle" /> },
          { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 170, render: (v: any) => displayDate(v, 'datetime') },
          {
            title: '操作人',
            key: 'operatorDisplay',
            width: 120,
            render: (_: any, record: any) => {
              const opName = record.operatorName || record.creatorName;
              if (taskReceiverName && (!opName || opName === '系统管理员')) return taskReceiverName;
              return opName || '-';
            },
          },
        ]}
        pagination={false}
        scroll={{ x: 1020 }}
      />
    </div>
  );
};

interface CuttingSizeItemsContentProps {
  cuttingSizeItems: any[];
}

/**
 * 裁剪明细 Tab 内容：仅有 cuttingSizeItems（无 cuttingBundles）时显示。
 */
export const CuttingSizeItemsContent: React.FC<CuttingSizeItemsContentProps> = ({ cuttingSizeItems }) => (
  <ResizableTable
    storageKey="order-flow-cutting"
    size="small"
    columns={[
      { title: '颜色', dataIndex: 'color', key: 'color', width: 140, render: (v: any) => String(v || '').trim() || '-' },
      { title: '尺码', dataIndex: 'size', key: 'size', width: 100 },
      { title: '裁剪数量', dataIndex: 'quantity', key: 'quantity', width: 120, align: 'right' as const },
    ]}
    dataSource={cuttingSizeItems}
    rowKey={(r: any) => `${r.color || ''}-${r.size}`}
    pagination={false}
    scroll={{ x: 360 }}
    emptyDescription="暂无裁剪明细"
  />
);
