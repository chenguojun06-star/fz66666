import React, { useEffect, useState, useCallback } from 'react';
import { Card, Statistic, Row, Col } from 'antd';
import { ShoppingCartOutlined, AppstoreOutlined, UserOutlined, DollarOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';

import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardPagination from '@/components/common/StandardPagination';
import StandardToolbar from '@/components/common/StandardToolbar';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { DEFAULT_PAGE_SIZE_OPTIONS, readPageSize, savePageSize } from '@/utils/pageSizeStore';
import { toCategoryCn } from '@/utils/styleCategory';
import dayjs from 'dayjs';

const OrderAnalysisTab: React.FC = () => {
  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1,
    pageSize: readPageSize(20),
    onlyCompleted: true,
    pushedToOrderOnly: true,
    keyword: '',
  });
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: StyleInfo[]; total: number } }>(
        '/style/info/list',
        { params: queryParams },
      );
      if (res.code === 200) {
        setStyles(res.data?.records || []);
        setTotal(res.data?.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 统计汇总
  const totalOrderCount = styles.reduce((s, r) => s + (r.orderCount || 0), 0);
  const totalOrderQty = styles.reduce((s, r) => s + (r.totalOrderQuantity || 0), 0);
  const orderedStyleCount = styles.filter(r => (r.orderCount || 0) > 0).length;
  const totalOrderAmount = styles.reduce((s, r) => s + (r.price || 0) * (r.totalOrderQuantity || 0), 0);

  const columns = [
    {
      title: '图片',
      dataIndex: 'cover',
      key: 'cover',
      width: 72,
      render: (_: unknown, record: StyleInfo) => (
        <StyleCoverThumb styleId={(record as any).id} styleNo={record.styleNo} src={(record as any).cover || null} />
      ),
    },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140, ellipsis: true },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', width: 140, ellipsis: true },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (v: string) => toCategoryCn(v) || v || '-',
    },
    {
      title: '单价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      align: 'right' as const,
      render: (v: number) => (v != null && v > 0) ? `¥${v}` : '-',
    },
    {
      title: '下单次数',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 100,
      align: 'right' as const,
      sorter: (a: StyleInfo, b: StyleInfo) => (a.orderCount || 0) - (b.orderCount || 0),
      defaultSortOrder: 'descend' as const,
      render: (v: number) => v || 0,
    },
    {
      title: '下单总数量',
      dataIndex: 'totalOrderQuantity',
      key: 'totalOrderQuantity',
      width: 110,
      align: 'right' as const,
      sorter: (a: StyleInfo, b: StyleInfo) => (a.totalOrderQuantity || 0) - (b.totalOrderQuantity || 0),
      render: (v: number) => v || 0,
    },
    {
      title: '下单总金额',
      key: 'totalOrderAmount',
      width: 120,
      align: 'right' as const,
      sorter: (a: StyleInfo, b: StyleInfo) =>
        (a.price || 0) * (a.totalOrderQuantity || 0) - (b.price || 0) * (b.totalOrderQuantity || 0),
      render: (_: unknown, r: StyleInfo) => {
        const amt = (r.price || 0) * (r.totalOrderQuantity || 0);
        return amt > 0 ? `¥${amt.toFixed(2)}` : '-';
      },
    },
    {
      title: '报废数量',
      dataIndex: 'scrapQuantity',
      key: 'scrapQuantity',
      width: 100,
      align: 'right' as const,
      sorter: (a: StyleInfo, b: StyleInfo) => (a.scrapQuantity || 0) - (b.scrapQuantity || 0),
      render: (v: number) => v || 0,
    },
    {
      title: '报废金额',
      key: 'scrapAmount',
      width: 120,
      align: 'right' as const,
      sorter: (a: StyleInfo, b: StyleInfo) =>
        (a.price || 0) * (a.scrapQuantity || 0) - (b.price || 0) * (b.scrapQuantity || 0),
      render: (_: unknown, r: StyleInfo) => {
        const amt = (r.price || 0) * (r.scrapQuantity || 0);
        return amt > 0 ? `¥${amt.toFixed(2)}` : '-';
      },
    },
    {
      title: '首次下单',
      dataIndex: 'firstOrderTime',
      key: 'firstOrderTime',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '最近下单',
      dataIndex: 'latestOrderTime',
      key: 'latestOrderTime',
      width: 160,
      sorter: (a: StyleInfo, b: StyleInfo) => {
        const ta = a.latestOrderTime ? dayjs(a.latestOrderTime).valueOf() : 0;
        const tb = b.latestOrderTime ? dayjs(b.latestOrderTime).valueOf() : 0;
        return ta - tb;
      },
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '最近下单人',
      dataIndex: 'latestOrderCreator',
      key: 'latestOrderCreator',
      width: 120,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
  ];

  return (
    <div>
      {/* 汇总统计 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="本页下单总次数"
              value={totalOrderCount}
              prefix={<ShoppingCartOutlined />}
              suffix="次"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="本页下单总件数"
              value={totalOrderQty}
              prefix={<AppstoreOutlined />}
              suffix="件"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="本页下单总金额"
              value={totalOrderAmount}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="本页已下单款式数"
              value={orderedStyleCount}
              prefix={<UserOutlined />}
              suffix="款"
            />
          </Card>
        </Col>
      </Row>

      {/* 搜索 + 表格 */}
      <Card size="small" className="filter-card mb-sm">
        <StandardToolbar
          left={
            <StandardSearchBar
              searchValue={String(queryParams.keyword || '')}
              onSearchChange={(value) =>
                setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }))
              }
              searchPlaceholder="搜索款号/款名"
            />
          }
        />
      </Card>

      <ResizableTable
        rowKey={(r) => (r as StyleInfo).styleNo}
        loading={loading}
        dataSource={styles}
        columns={columns as any}
        stickyHeader
        scroll={{ x: 'max-content' }}
        size="middle"
        pagination={false}
      />

      <StandardPagination
        current={queryParams.page}
        pageSize={queryParams.pageSize}
        total={total}
        pageSizeOptions={[...DEFAULT_PAGE_SIZE_OPTIONS]}
        onChange={(page, pageSize) => {
          if (pageSize !== queryParams.pageSize) savePageSize(pageSize);
          setQueryParams((prev) => ({ ...prev, page, pageSize }));
        }}
      />
    </div>
  );
};

export default OrderAnalysisTab;
