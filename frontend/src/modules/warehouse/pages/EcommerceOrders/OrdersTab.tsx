import React, { useMemo } from 'react';
import { Card, Space, Input, Select, Button, Row, Col, Statistic, Tag, Badge } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMoney } from '@/utils/format';
import { getPlatformOptions } from '@/utils/platform';
import { STATUS_MAP } from './helpers';
import type { EcOrder } from './types';
import { useEcommerceOrdersData } from './hooks/useEcommerceOrdersData';
import { buildOrdersColumns } from './columns';
import OrderDetailDrawer from './components/OrderDetailDrawer';
import LinkProductionModal from './components/LinkProductionModal';
import DirectOutboundModal from './components/DirectOutboundModal';

const { Option } = Select;

interface Props {
  onInitReturn?: (order: EcOrder) => void;
}

const OrdersTab: React.FC<Props> = ({ onInitReturn }) => {
  const h = useEcommerceOrdersData();

  const columns = useMemo(
    () => buildOrdersColumns({
      styleImageMap: h.styleImageMap,
      onViewDetail: r => h.setDetail(r),
      onLink: r => h.setLinkTarget(r),
      onOutbound: r => h.setOutboundTarget(r),
      onInitReturn,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [h.styleImageMap, onInitReturn],
  );

  const stats = [
    { title: '本页订单', value: h.total, suffix: '单', color: undefined, key: 'total' },
    { title: '待处理',   value: h.pendingHandle, suffix: '单', color: 'var(--color-danger)', key: 'pending', alert: true },
    { title: '待发货',   value: h.pendingShip, suffix: '单', color: 'var(--color-warning)', key: 'ship' },
    { title: '已出库',   value: h.shipped,     suffix: '单', color: 'var(--color-success)', key: 'out' },
    { title: '已关联排产', value: h.linked,    suffix: '单', color: 'var(--color-primary)', key: 'link' },
  ];

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 14 }}>
        {stats.map((s, i) => (
          <Col span={Math.floor(24 / 5)} key={i}>
            <Card
              styles={{ body: { padding: '8px 12px', cursor: s.key === 'pending' ? 'pointer' : undefined } }}
              style={s.key === 'pending'
                ? (h.isFilteringPending
                    ? { border: '2px solid var(--color-danger)', background: 'rgba(255,77,79,0.06)' }
                    : { border: '1px solid rgba(255,77,79,0.3)', background: 'rgba(255,77,79,0.03)' })
                : undefined}
              onClick={s.key === 'pending'
                ? () => {
                    if (h.isFilteringPending) { h.setFilterLinked(undefined); h.setFilterStatus(undefined); h.setPage(1); }
                    else { h.setFilterLinked(false); h.setFilterStatus(1); h.setPage(1); }
                  }
                : undefined}>
              <Statistic title={
                <span style={{ fontSize: 14 }}>
                  {s.key === 'pending' && <Badge status="error" style={{ marginRight: 4 }} />}
                  {s.title}
                  {s.key === 'pending' && h.isFilteringPending && (
                    <Tag color="red" style={{ marginLeft: 6, fontSize: 10 }}>筛选中</Tag>
                  )}
                </span>}
                value={s.value} suffix={s.suffix}
                styles={{ content: { fontSize: 16, color: s.color } }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card style={{ marginBottom: 8, background: 'rgba(235,47,150,0.04)', border: '1px solid rgba(235,47,150,0.18)' }}
        styles={{ body: { padding: '8px 14px' } }}>
        <span style={{ fontSize: 14, color: '#888' }}>本页实付合计：</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#eb2f96' }}>{formatMoney(h.totalRevenue)}</span>
      </Card>

      <Card style={{ marginBottom: 10 }}>
        <Space wrap>
          <Select id="ecomPlatformFilter" placeholder="全部平台" allowClear value={h.filterPlatform || undefined}
            onChange={v => { h.setFilterPlatform(v ?? ''); h.setPage(1); }} style={{ width: 120 }}
            options={getPlatformOptions()}
          />
          <Select id="ecomStatusFilter" placeholder="全部状态" allowClear value={h.filterStatus}
            onChange={v => { h.setFilterStatus(v); h.setPage(1); }} style={{ width: 100 }}>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <Option key={k} value={Number(k)}>{v.label}</Option>
            ))}
          </Select>
          <Input.Search placeholder="订单号 / 买家 / 收件人" allowClear style={{ width: 220 }}
            enterButton={<SearchOutlined />}
            onSearch={v => { h.setKeyword(v); }} />
          <Button icon={<ReloadOutlined />} onClick={h.fetchData}>刷新</Button>
        </Space>
      </Card>

      <ResizableTable
        rowKey="id"
        dataSource={h.data}
        columns={columns}
        loading={h.loading}
        stickyHeader
        scroll={{ x: 1350 }}
        emptyDescription="暂无订单数据"
        pagination={{ current: h.page, pageSize: h.pageSize, total: h.total, showSizeChanger: true,
          showTotal: t => `共 ${t} 条`,
          onChange: (p, ps) => { h.setPage(p); h.setPageSize(ps); } }}
      />

      <OrderDetailDrawer open={!!h.detail} detail={h.detail} onClose={() => h.setDetail(null)} />

      <LinkProductionModal
        open={!!h.linkTarget} target={h.linkTarget} linking={h.linking}
        form={h.linkForm}
        onOk={h.handleLink} onCancel={() => h.setLinkTarget(null)} />

      <DirectOutboundModal
        open={!!h.outboundTarget} target={h.outboundTarget} outbounding={h.outbounding}
        form={h.outboundForm}
        onOk={h.handleDirectOutbound} onCancel={() => h.setOutboundTarget(null)} />
    </div>
  );
};

export default OrdersTab;
