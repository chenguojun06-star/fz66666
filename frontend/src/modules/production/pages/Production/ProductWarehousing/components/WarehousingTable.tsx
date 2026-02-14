import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tag } from 'antd';
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
  isOrderFrozen: (orderId: string) => boolean;
  isMobile?: boolean;
}

const WarehousingTable: React.FC<WarehousingTableProps> = ({
  loading,
  dataSource,
  total,
  queryParams,
  setQueryParams,
  isOrderFrozen,
  isMobile,
}) => {
  const navigate = useNavigate();

  /** 跳转到统一质检入库内部页面 */
  const goToDetail = (record: WarehousingType, tab = 'records') => {
    const orderId = String((record as any)?.orderId || '').trim();
    if (!orderId) return;
    const warehousingNo = String(record.warehousingNo || '').trim();
    const params = new URLSearchParams({ tab });
    if (warehousingNo && tab === 'records') params.set('warehousingNo', warehousingNo);
    navigate(`/production/warehousing/inspect/${orderId}?${params.toString()}`);
  };
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
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => goToDetail(record, 'inspect')}>
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
      title: '菲号',
      dataIndex: 'cuttingBundleQrCode',
      key: 'cuttingBundleQrCode',
      width: 200,
      ellipsis: true,
      render: (v: unknown) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        const core = text.split('|')[0] || text;
        return <span title={text}>{core}</span>;
      },
    },
    {
      title: '裁剪数',
      dataIndex: 'cuttingQuantity',
      key: 'cuttingQuantity',
      width: 80,
      align: 'right' as const,
      render: (v: unknown) => v ?? '-',
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: unknown) => v || '-',
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      render: (v: unknown) => v || '-',
    },
    {
      title: '质检数',
      dataIndex: 'warehousingQuantity',
      key: 'warehousingQuantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '合格数',
      dataIndex: 'qualifiedQuantity',
      key: 'qualifiedQuantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '不合格数',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 90,
      align: 'right' as const,
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
      key: 'qualityOperatorName',
      width: 120,
      render: (_: any, record: any) => {
        // 优先使用 qualityOperatorName，其次 receiverName，再次 warehousingOperatorName
        const name = String(record?.qualityOperatorName || record?.receiverName || record?.warehousingOperatorName || '').trim();
        return name || '-';
      },
    },
    {
      title: '质检时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 150,
      render: (value: unknown) => formatDateTime(value),
    },

    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: WarehousingType) => {
        const orderId = String((record as any)?.orderId || '').trim();
        const frozen = isOrderFrozen(orderId);

        // 判断是否已入库：有仓库信息或有入库结束时间
        const hasWarehouse = Boolean(record.warehouse?.trim());
        const hasWarehousingEndTime = Boolean(record.warehousingEndTime?.trim());
        const isWarehoused = hasWarehouse || hasWarehousingEndTime;

        return (
          <RowActions
            actions={[
              {
                key: 'inspect',
                label: '质检',
                title: frozen ? '质检（订单已关单）' : '质检查看',
                disabled: frozen,
                onClick: () => goToDetail(record, 'inspect'),
                primary: true,
              },
              {
                key: 'complete',
                label: '入库',
                title: isWarehoused ? '已入库' : (frozen ? '入库（订单已关单）' : '入库'),
                disabled: frozen || !orderId || isWarehoused,
                onClick: () => goToDetail(record, 'warehousing'),
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
            goToDetail(record as WarehousingType, 'inspect');
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
