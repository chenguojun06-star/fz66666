import React, { useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Space } from 'antd';
import { StyleCoverThumb, StyleAttachmentsButton, PatternSupplementButton } from '@/components/StyleAssets';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import RowActions from '@/components/common/RowActions';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { formatDateTime } from '@/utils/datetime';
import type { CuttingTask } from '@/types/production';
import type { CuttingBundleRow } from './hooks';
import { useCuttingTasks } from './hooks';

type TasksState = ReturnType<typeof useCuttingTasks>;

interface UseTaskColumnsParams {
  tasks: TasksState;
  goToEntry: (task: CuttingTask) => void;
  handleRollbackActive: (task: CuttingTask) => void;
  onOpenRemark: (orderNo: string) => void;
}

/**
 * 裁剪任务列表列定义
 * 从 index.tsx 抽离，保持原渲染逻辑不变
 */
export function useTaskColumns({
  tasks,
  goToEntry,
  handleRollbackActive,
  onOpenRemark,
}: UseTaskColumnsParams) {
  return [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb
          src={record.styleCover || null}
          styleId={record.styleId}
          styleNo={record.styleNo}
          color={record.color} // 传入颜色，优先显示SKU颜色图片
          size={48}
          borderRadius={6}
        />
      )
    },
    {
      title: '订单号',
      dataIndex: 'productionOrderNo',
      key: 'productionOrderNo',
      width: 230,
      render: (v: any, record: CuttingTask) => (
        <a
          onClick={(e) => { e.stopPropagation(); goToEntry(record); }}
          title={String(v || '').trim() || '-'}
          style={{ color: 'var(--primary-color)', cursor: 'pointer' }}
        >
          <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>
        </a>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 200,
      render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
    {
      title: '生产方',
      key: 'factoryName',
      width: 120,
      render: (_: any, record: CuttingTask) => {
        const name = record.factoryName;
        const type = record.factoryType;
        if (!name) return '-';
        return (
          <Space size={4}>
            <FactoryTypeTag factoryType={type} />
            <span>{name}</span>
          </Space>
        );
      },
    },
    { title: '下单人', dataIndex: 'orderCreatorName', key: 'orderCreatorName', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
    {
      title: <SortableColumnTitle
        title="下单时间"
        sortField={tasks.cuttingSortField}
        fieldName="orderTime"
        sortOrder={tasks.cuttingSortOrder}
        onSort={tasks.handleCuttingSort}
        align="left"
      />,
      dataIndex: 'orderTime',
      key: 'orderTime',
      width: 170,
      render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
    },
    { title: '数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 90, align: 'right' as const },
    {
      title: '裁剪数',
      dataIndex: 'cuttingQuantity',
      key: 'cuttingQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '扎数',
      dataIndex: 'cuttingBundleCount',
      key: 'cuttingBundleCount',
      width: 80,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    { title: '裁剪员', dataIndex: 'receiverName', key: 'receiverName', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
    {
      title: <SortableColumnTitle
        title="领取时间"
        sortField={tasks.cuttingSortField}
        fieldName="receivedTime"
        sortOrder={tasks.cuttingSortOrder}
        onSort={tasks.handleCuttingSort}
        align="left"
      />,
      dataIndex: 'receivedTime',
      key: 'receivedTime',
      width: 170,
      render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
    },
    {
      title: <SortableColumnTitle
        title="完成时间"
        sortField={tasks.cuttingSortField}
        fieldName="bundledTime"
        sortOrder={tasks.cuttingSortOrder}
        onSort={tasks.handleCuttingSort}
        align="left"
      />,
      dataIndex: 'bundledTime',
      key: 'bundledTime',
      width: 170,
      render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 150,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: '纸样',
      key: 'attachments',
      width: 130,
      render: (_: any, record: CuttingTask) => (
        <Space size={4}>
          <StyleAttachmentsButton styleId={record.styleId} styleNo={record.styleNo} onlyActive />
          <PatternSupplementButton styleId={record.styleId} styleNo={record.styleNo} />
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: CuttingTask) => {
        const orderNo = String(record.productionOrderNo || '').trim();
        const frozen = tasks.isOrderFrozenById(orderNo);
        const isPending = record.status === 'pending';
        const isReceived = record.status === 'received';
        const isCompleted = record.status === 'completed';
        const canRollback = tasks.isAdmin && !isPending && !isCompleted;
        return (
          <RowActions
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: isCompleted ? '已完成，不可编辑' : frozen ? '编辑（订单已关单/报废/完成）' : '编辑',
                disabled: frozen || isCompleted,
                onClick: () => {
                  tasks.setQuickEditRecord(record);
                  tasks.setQuickEditVisible(true);
                },
              },
              ...(isPending
                ? [{
                    key: 'receive',
                    label: '领取',
                    title: '领取任务',
                    disabled: frozen || tasks.receiveTaskLoading,
                    onClick: () => tasks.handleReceiveTask(record),
                    primary: true,
                  }]
                : []),
              ...(!isPending
                ? [{
                    key: 'entry',
                    label: isReceived ? '生成菲号' : '查看',
                    title: isReceived ? '进入填写数量生成菲号' : '查看详情',
                    disabled: frozen,
                    onClick: () => goToEntry(record),
                    primary: isReceived,
                  }]
                : []),
              ...(canRollback
                ? [{
                    key: 'rollback',
                    label: '退回',
                    title: '退回',
                    disabled: frozen || tasks.rollbackTaskLoading,
                    danger: true,
                    onClick: () => handleRollbackActive(record),
                  }]
                : []),
              {
                key: 'remark',
                label: '备注',
                onClick: () => {
                  onOpenRemark(record.productionOrderNo);
                },
              },
            ]}
          />
        );
      }
    },
  ];
}

export function usePurchaseColumns() {
  return useMemo(
    () =>
      [
        {
          title: '物料类型',
          dataIndex: 'materialType',
          key: 'materialType',
          width: 110,
          render: (v: unknown) => getMaterialTypeLabel(v),
        },
        { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, ellipsis: true },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
        {
          title: '规格',
          dataIndex: 'specifications',
          key: 'specifications',
          width: 180,
          ellipsis: true,
          render: (v: unknown) => String(v || '').trim() || '-',
        },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 90, ellipsis: true },
        {
          title: '实际到料',
          dataIndex: 'arrivedQuantity',
          key: 'arrivedQuantity',
          width: 110,
          align: 'right' as const,
          render: (v: unknown) => Number(v ?? 0) || 0,
        },
      ],
    []
  );
}

export function useBundleColumns(activeTask: CuttingTask | null) {
  return [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb 
          src={activeTask?.styleCover || null} 
          styleId={activeTask?.styleId} 
          styleNo={record.styleNo || activeTask?.styleNo} 
          color={record.color} // 传入颜色，优先显示SKU颜色图片
          size={24} 
          borderRadius={4} 
        />
      )
    },
    {
      title: '订单号',
      dataIndex: 'productionOrderNo',
      key: 'productionOrderNo',
      width: 140,
      render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
    {
      title: '款名',
      key: 'styleName',
      width: 160,
      ellipsis: true,
      render: () => activeTask?.styleName || '-',
    },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 120 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
    { title: '扎号', dataIndex: 'bundleNo', key: 'bundleNo', width: 80 },
    {
      title: '床号',
      dataIndex: 'bedNo',
      key: 'bedNo',
      width: 80,
      render: (value: number | null | undefined, record: CuttingBundleRow) => {
        const display = value
          ? (record.bedSubNo != null ? `${value}-${record.bedSubNo}` : String(value))
          : '-';
        return (
          <span style={{ fontWeight: 600, color: value ? 'var(--color-primary)' : 'var(--neutral-text-secondary)' }}>
            {display}
          </span>
        );
      }
    },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const },
    { title: '二维码内容', dataIndex: 'qrCode', key: 'qrCode', width: 220, ellipsis: true },
    {
      title: '二维码',
      dataIndex: 'qrCode',
      key: 'qrCodeImage',
      width: 92,
      render: (value: string) => (value ? <QRCodeCanvas value={value} size={42} /> : null),
    },
  ];
}
