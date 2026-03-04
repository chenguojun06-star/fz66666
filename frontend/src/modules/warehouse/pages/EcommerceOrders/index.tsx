import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Input, Select, Card, Space, Modal, Form, message,
  Row, Col, Statistic, Typography, Steps, Alert, Tooltip, Badge
} from 'antd';
import {
  ApiOutlined, ShoppingCartOutlined, LinkOutlined, CheckCircleOutlined,
  ClockCircleOutlined, CarOutlined, SearchOutlined, ReloadOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

const { Text } = Typography;
const { Option } = Select;

interface EcOrder {
  id: number;
  orderNo: string;
  platform: string;
  sourcePlatformCode: string;
  platformOrderNo: string;
  shopName: string;
  buyerNick: string;
  productName: string;
  quantity: number;
  payAmount: number;
  status: number;           // 0待付 1待发货 2已发货 3完成 4取消
  warehouseStatus: number;  // 0待拣货 1备货中 2已出库
  productionOrderNo: string;
  trackingNo: string;
  expressCompany: string;
  receiverName: string;
  receiverPhone: string;
  createTime: string;
  shipTime: string;
}

const PLATFORM_MAP: Record<string, { name: string; emoji: string; color: string }> = {
  TAOBAO:      { name: '淘宝',     emoji: '🟠', color: 'orange' },
  TMALL:       { name: '天猫',     emoji: '🐱', color: 'red' },
  JD:          { name: '京东',     emoji: '🔴', color: 'volcano' },
  DOUYIN:      { name: '抖音',     emoji: '🎵', color: 'default' },
  PINDUODUO:   { name: '拼多多',   emoji: '🛒', color: 'red' },
  XIAOHONGSHU: { name: '小红书',   emoji: '📕', color: 'magenta' },
  WECHAT_SHOP: { name: '视频号',   emoji: '💚', color: 'green' },
  SHOPIFY:     { name: 'Shopify',  emoji: '🟢', color: 'purple' },
};

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待付款',  color: 'default' },
  1: { label: '待发货',  color: 'orange' },
  2: { label: '已发货',  color: 'blue' },
  3: { label: '已完成',  color: 'green' },
  4: { label: '已取消',  color: 'red' },
  5: { label: '退款中',  color: 'magenta' },
};

const WH_STATUS_MAP: Record<number, { label: string; color: string; icon: React.ReactNode }> = {
  0: { label: '待拣货', color: 'default',  icon: <ClockCircleOutlined /> },
  1: { label: '备货中', color: 'orange',   icon: <ShoppingCartOutlined /> },
  2: { label: '已出库', color: 'green',    icon: <CarOutlined /> },
};

const EcommerceOrders: React.FC = () => {
  const [data, setData] = useState<EcOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [platform, setPlatform] = useState<string>('');
  const [status, setStatus] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');

  // 关联生产订单弹窗
  const [linkVisible, setLinkVisible] = useState(false);
  const [linkTarget, setLinkTarget] = useState<EcOrder | null>(null);
  const [linkForm] = Form.useForm();
  const [linking, setLinking] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      if (platform) params.platform = platform;
      if (status !== undefined) params.status = status;
      if (keyword) params.keyword = keyword;
      const res = await axios.post('/api/ecommerce/orders/list', params);
      const pageData = res.data?.data ?? {};
      setData(pageData.records ?? []);
      setTotal(pageData.total ?? 0);
    } catch {
      message.error('加载电商订单失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, platform, status, keyword]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLink = async () => {
    if (!linkTarget) return;
    try {
      const values = await linkForm.validateFields();
      setLinking(true);
      await axios.post(`/api/ecommerce/orders/${linkTarget.id}/link`, {
        productionOrderNo: values.productionOrderNo,
      });
      message.success('关联成功，仓库出库时将自动回写物流状态');
      setLinkVisible(false);
      fetchData();
    } catch {
      message.error('关联失败');
    } finally {
      setLinking(false);
    }
  };

  const columns: ColumnsType<EcOrder> = [
    {
      title: '平台', dataIndex: 'sourcePlatformCode', width: 90,
      render: (code) => {
        const p = PLATFORM_MAP[code] ?? { name: code, emoji: '🛒', color: 'default' };
        return <Tag color={p.color}>{p.emoji} {p.name}</Tag>;
      },
    },
    {
      title: '平台订单号', dataIndex: 'platformOrderNo', width: 160,
      render: (v, r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: 11, color: '#888' }}>内部: {r.orderNo}</div>
        </div>
      ),
    },
    {
      title: '商品/买家', dataIndex: 'productName', ellipsis: true, width: 160,
      render: (v, r) => (
        <div>
          <div style={{ fontSize: 12 }}>{v || '-'} × {r.quantity}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{r.buyerNick || r.receiverName}</div>
        </div>
      ),
    },
    {
      title: '金额', dataIndex: 'payAmount', width: 80,
      render: (v) => <Text strong style={{ color: '#fa8c16' }}>¥{v ?? '-'}</Text>,
    },
    {
      title: '订单状态', dataIndex: 'status', width: 80,
      render: (v) => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label ?? v}</Tag>,
    },
    {
      title: '仓库状态', dataIndex: 'warehouseStatus', width: 90,
      render: (v) => (
        <Tag color={WH_STATUS_MAP[v]?.color} icon={WH_STATUS_MAP[v]?.icon}>
          {WH_STATUS_MAP[v]?.label ?? v}
        </Tag>
      ),
    },
    {
      title: '关联生产单', dataIndex: 'productionOrderNo', width: 140,
      render: (v) => v
        ? <Tag color="blue" icon={<CheckCircleOutlined />}>{v}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>未关联</Text>,
    },
    {
      title: '物流', dataIndex: 'trackingNo', width: 140,
      render: (v, r) => v
        ? <div><div style={{ fontSize: 11 }}>{r.expressCompany}</div><div style={{ fontSize: 12 }}>{v}</div></div>
        : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>,
    },
    {
      title: '时间', dataIndex: 'createTime', width: 100,
      render: (v) => <span style={{ fontSize: 11 }}>{v?.slice(0, 16)}</span>,
    },
    {
      title: '操作', width: 90, fixed: 'right',
      render: (_, r) => (
        <Button size="small" type="link" icon={<LinkOutlined />}
          disabled={!!r.productionOrderNo}
          onClick={() => { setLinkTarget(r); linkForm.resetFields(); setLinkVisible(true); }}>
          排产关联
        </Button>
      ),
    },
  ];

  const connectedCount = data.filter(d => d.productionOrderNo).length;
  const shippedCount = data.filter(d => d.warehouseStatus === 2).length;

  return (
    <div style={{ padding: 20 }}>
      {/* 数据流说明 */}
      <Alert
        style={{ marginBottom: 16, fontSize: 12 }}
        message="电商订单数据流"
        description={
          <Steps size="small" style={{ marginTop: 8 }}
            items={[
              { title: '平台推送', description: '各平台Webhook推入本系统', icon: <ApiOutlined style={{ color: '#1677ff' }} /> },
              { title: '关联排产', description: '手动或自动关联生产订单', icon: <ShoppingCartOutlined style={{ color: '#fa8c16' }} /> },
              { title: '仓库出库', description: '出库时自动更新为"已出库"', icon: <CarOutlined style={{ color: '#52c41a' }} /> },
              { title: '物流回传', description: '快递单号写回本表 (未来自动推回平台)', icon: <CheckCircleOutlined style={{ color: '#52c41a' }} /> },
            ]}
          />
        }
        type="info" showIcon
      />

      {/* 统计卡 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="本页订单" value={total} suffix="单" /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="已关联排产" value={connectedCount} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="已出库" value={shippedCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}>
          <Card size="small" style={{ cursor: 'pointer' }}
            onClick={() => { window.open('/system/app-store', '_blank'); }}>
            <Statistic title="配置平台对接" value="应用商店 →" valueStyle={{ fontSize: 14, color: '#1677ff' }} />
          </Card>
        </Col>
      </Row>

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select placeholder="全部平台" allowClear value={platform || undefined}
            onChange={(v) => { setPlatform(v ?? ''); setPage(1); }}
            style={{ width: 120 }}>
            {Object.entries(PLATFORM_MAP).map(([code, p]) => (
              <Option key={code} value={code}>{p.emoji} {p.name}</Option>
            ))}
          </Select>
          <Select placeholder="全部状态" allowClear value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            style={{ width: 100 }}>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <Option key={k} value={Number(k)}>{v.label}</Option>
            ))}
          </Select>
          <Input.Search placeholder="订单号/买家昵称/收件人" allowClear
            style={{ width: 220 }} enterButton={<SearchOutlined />}
            onSearch={(v) => { setKeyword(v); setPage(1); }} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        dataSource={data}
        columns={columns}
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true, showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      {/* 关联生产订单弹窗 */}
      <Modal
        title={<span><LinkOutlined /> 关联生产订单</span>}
        open={linkVisible}
        onCancel={() => setLinkVisible(false)}
        onOk={handleLink}
        confirmLoading={linking}
        width={440}
        okText="确认关联"
      >
        {linkTarget && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 12 }}>
            <div>平台订单: <b>{linkTarget.platformOrderNo}</b></div>
            <div>商品: {linkTarget.productName} × {linkTarget.quantity}</div>
            <div>买家: {linkTarget.buyerNick || linkTarget.receiverName}</div>
          </div>
        )}
        <Alert style={{ marginBottom: 12, fontSize: 12 }} type="info" showIcon
          message={'关联后，该生产订单出库时将自动更新此电商订单为【已出库】并回写快递单号'} />
        <Form form={linkForm} layout="vertical" size="small">
          <Form.Item name="productionOrderNo" label="生产订单号"
            rules={[{ required: true, message: '请输入生产订单号' }]}>
            <Input placeholder="如 PO20260301001, 可在生产进度页查看" prefix={<SearchOutlined />} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EcommerceOrders;
