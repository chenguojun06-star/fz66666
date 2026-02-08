import React from 'react';
import { Button, Tag } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { ProductWarehousing as WarehousingType, WarehousingQueryParams } from '@/types/production';
import { getQualityStatusConfig, getDefectCategoryLabel, getDefectRemarkLabel } from '../utils';

interface WarehousingTableProps {
  loading: boolean;
  dataSource: WarehousingType[];
  total: number;
  queryParams: WarehousingQueryParams;
  setQueryParams: (params: WarehousingQueryParams) => void;
  onViewDetail: (record: WarehousingType) => void;
  onOpenIndependentDetail: (record: WarehousingType) => void;
  onWarehousing: (record: WarehousingType) => void;
  isOrderFrozen: (orderId: string) => boolean;
  isMobile?: boolean;
}

const WarehousingTable: React.FC<WarehousingTableProps> = ({
  loading,
  dataSource,
  total,
  queryParams,
  setQueryParams,
  onViewDetail,
  onOpenIndependentDetail,
  onWarehousing,
  isOrderFrozen,
  isMobile,
}) => {
  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} size={48} borderRadius={6} />
      )
    },
    {
      title: '质检入库号',
      dataIndex: 'warehousingNo',
      key: 'warehousingNo',
      width: 120,
      render: (v: any, record: WarehousingType) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        return (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onViewDetail(record)}>
            {text}
          </Button>
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
      ellipsis: true,
      render: (v: unknown) => (
        <span className="order-no-compact">{String(v || '').trim() || '-'}</span>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      ellipsis: true,
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton
          styleId={record.styleId}
          styleNo={record.styleNo}
          onlyActive
        />
      )
    },
    {
      title: '质检数量',
      dataIndex: 'warehousingQuantity',
      key: 'warehousingQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '合格数量',
      dataIndex: 'qualifiedQuantity',
      key: 'qualifiedQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '不合格数量',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 100,
      render: (v: unknown) => v || '-',
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 90,
      render: (v: unknown) => v || '-',
    },
    {
      title: '仓库',
      dataIndex: 'warehouse',
      key: 'warehouse',
      width: 80,
    },
    {
      title: '质检状态',
      dataIndex: 'qualityStatus',
      key: 'qualityStatus',
      width: 100,
      render: (status: any) => {
        const { text, color } = getQualityStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '菲号',
      dataIndex: 'scanCode',
      key: 'scanCode',
      width: 200,
      ellipsis: true,
      render: (v: unknown) => v || '-',
    },
    {
      title: '次品处理',
      key: 'defectHandling',
      width: 120,
      render: (_: any, record: any) => {
        const unqualified = Number(record?.unqualifiedQuantity || 0);
        if (unqualified <= 0) return '-';

        const category = String(record?.defectCategory || '').trim();
        const remark = String(record?.repairRemark || '').trim();

        return (
          <div style={{ fontSize: 'var(--font-size-sm)' }}>
            {category && <div>类型：{getDefectCategoryLabel(category)}</div>}
            {remark && <div>方式：{remark}</div>}
          </div>
        );
      },
    },
    {
      title: '质检人员',
      dataIndex: 'qualityOperatorName',
      key: 'qualityOperatorName',
      width: 120,
      render: (v: unknown) => v || '-',
    },
    {
      title: '质检时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 150,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '入库开始时间',
      dataIndex: 'warehousingStartTime',
      key: 'warehousingStartTime',
      width: 150,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '入库完成时间',
      dataIndex: 'warehousingEndTime',
      key: 'warehousingEndTime',
      width: 150,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '入库人员',
      dataIndex: 'warehousingOperatorName',
      key: 'warehousingOperatorName',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: WarehousingType) => {
        const orderId = String((record as any)?.orderId || '').trim();
        const frozen = isOrderFrozen(orderId);

        return (
          <RowActions
            actions={[
              {
                key: 'detail',
                label: '详情',
                title: frozen ? '详情（订单已关单）' : '弹窗查看',
                disabled: frozen,
                onClick: () => onOpenIndependentDetail(record),
                primary: true,
              },
              {
                key: 'complete',
                label: '入库',
                title: frozen ? '入库（订单已关单）' : '入库',
                disabled: frozen || !orderId,
                onClick: () => onWarehousing(record),
                primary: true,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <ResizableTable
      storageKey="warehousing-table"
      columns={columns as any}
      dataSource={dataSource as any[]}
      rowKey="id"
      loading={loading}
      scroll={{ x: 'max-content' }}
      rowClassName={() => 'clickable-row'}
      onRow={(record: unknown) => {
        return {
          onClick: (e) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const interactive = target.closest(
              'a,button,input,textarea,select,option,[role="button"],[role="menuitem"],.ant-dropdown-trigger,.ant-btn'
            );
            if (interactive) return;
            onViewDetail(record as WarehousingType);
          },
        };
      }}
      pagination={{
        current: queryParams.page,
        pageSize: queryParams.pageSize,
        total: total,
        showTotal: (total) => `共 ${total} 条`,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
      }}
    />
  );
};

export default WarehousingTable;
