import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import TicketModal from '@/components/common/TicketModal';
import { ticketApi } from '@/services/ticket/ticketApi';
import type { SalesTicketRow, TicketSourceBizType } from '@/services/ticket/ticketApi';
import { formatDateTime } from '@/utils/datetime';

const SOURCE_LABEL: Record<string, string> = {
  POS_SALE: '收银台',
  SHOP_ORDER: '店铺订单',
  OUTSTOCK: '批发出库',
};

/**
 * 全部小票：POS 收银 / C端店铺订单 / 批发出库 三类销售单据的电子小票统一台账，
 * 支持查看小票（打印/下载图片/二维码）与签收状态跟踪。
 */
const TicketList: React.FC = () => {
  const [dataSource, setDataSource] = useState<SalesTicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  /** 查看小票（sourceBizId 定位） */
  const [viewing, setViewing] = useState<{ type: TicketSourceBizType; id: string; no?: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { records, total: t } = await ticketApi.page({
        pageNum: page,
        pageSize,
        keyword: keyword || undefined,
      });
      setDataSource(records);
      setTotal(t);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const columns: ColumnsType<SalesTicketRow> = [
    { title: '小票号', dataIndex: 'ticketNo', width: 140 },
    {
      title: '来源',
      dataIndex: 'sourceBizType',
      width: 100,
      render: (v: string) => <Tag color="blue">{SOURCE_LABEL[v] ?? v}</Tag>,
    },
    { title: '单据号', dataIndex: 'sourceBizNo', width: 180 },
    {
      title: '签收状态',
      dataIndex: 'status',
      width: 100,
      align: 'center',
      render: (v: string) =>
        v === 'SIGNED' ? (
          <Tag color="green">已签收</Tag>
        ) : v === 'VOID' ? (
          <Tag color="red">已作废</Tag>
        ) : (
          <Tag color="orange">待签收</Tag>
        ),
    },
    { title: '签收人', dataIndex: 'signedBy', width: 100, render: (v: string) => v || '-' },
    {
      title: '签收时间',
      dataIndex: 'signedTime',
      width: 160,
      render: (v: string) => (v ? formatDateTime(v) : '-'),
    },
    {
      title: '浏览次数',
      dataIndex: 'viewCount',
      width: 90,
      align: 'right',
      render: (v: number) => Number(v ?? 0),
    },
    {
      title: '开单时间',
      dataIndex: 'createTime',
      width: 160,
      render: (v: string) => (v ? formatDateTime(v) : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      fixed: 'right' as const,
      render: (_: unknown, record: SalesTicketRow) => {
        const actions: RowAction[] = [
          {
            key: 'view',
            label: '查看小票',
            primary: true,
            onClick: () =>
              setViewing({
                type: record.sourceBizType,
                id: record.sourceBizId,
                no: record.sourceBizNo,
              }),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <>
      <Card>
        <StandardSearchBar
          onSearchChange={(val) => {
            setKeyword(val);
            setPage(1);
          }}
          searchPlaceholder="搜索小票号/单据号/签收人"
          showDate={false}
          showStatus={false}
        />
        <ResizableTable<SalesTicketRow>
          columns={columns}
          dataSource={dataSource}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={false}
          emptyDescription="暂无小票，开单后自动生成"
        />
        <StandardPagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
        />
      </Card>

      <TicketModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        sourceBizType={viewing?.type ?? 'POS_SALE'}
        sourceBizId={viewing?.id ?? 0}
        sourceBizNo={viewing?.no}
      />
    </>
  );
};

export default TicketList;
