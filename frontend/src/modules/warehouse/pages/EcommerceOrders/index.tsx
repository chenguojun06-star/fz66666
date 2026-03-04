import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import {
  Tabs, Table, Tag, Button, Input, Select, Card, Space, Modal, Form,
  message, Row, Col, Statistic, Drawer, Descriptions, Divider,
  InputNumber, Typography, Badge, Tooltip, Steps, Alert,
} from 'antd';
import {
  CarOutlined, CheckCircleOutlined, EditOutlined, EyeOutlined,
  LinkOutlined, ReloadOutlined, RiseOutlined, SaveOutlined,
  SearchOutlined, ShoppingCartOutlined, ApiOutlined, ShopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

const { Text } = Typography;
const { Option } = Select;

const PLATFORM_MAP: Record<string, { name: string; emoji: string; color: string }> = {
  TAOBAO:      { name: '淘宝',   emoji: '🟠', color: 'orange' },
  TMALL:       { name: '天猫',   emoji: '🐱', color: 'red' },
  JD:          { name: '京东',   emoji: '🔴', color: 'volcano' },
  DOUYIN:      { name: '抖音',   emoji: '🎵', color: 'default' },
  PINDUODUO:   { name: '拼多多', emoji: '🛒', color: 'red' },
  XIAOHONGSHU: { name: '小红书', emoji: '📕', color: 'magenta' },
  WECHAT_SHOP: { name: '视频号', emoji: '💚', color: 'green' },
  SHOPIFY:     { name: 'Shopify',emoji: '🟢', color: 'purple' },
};
const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待付款', color: 'default' },
  1: { label: '待发货', color: 'orange' },
  2: { label: '已发货', color: 'blue' },
  3: { label: '已完成', color: 'green' },
  4: { label: '已取消', color: 'red' },
  5: { label: '退款中', color: 'magenta' },
};
const WH_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待拣货', color: 'default' },
  1: { label: '备货中', color: 'orange' },
  2: { label: '已出库', color: 'green' },
};

interface EcOrder {
  id: number; orderNo: string; platform: string; sourcePlatformCode: string;
  platformOrderNo: string; shopName: string; buyerNick: string;
  productName: string; skuCode: string; quantity: number;
  unitPrice: number; totalAmount: number; payAmount: number;
  freight: number; discount: number; payType: string;
  payTime: string; shipTime: string; completeTime: string;
  receiverName: string; receiverPhone: string; receiverAddress: string;
  trackingNo: string; expressCompany: string;
  buyerRemark: string; sellerRemark: string;
  status: number; warehouseStatus: number;
  productionOrderNo: string; createTime: string;
}
interface Sku {
  id: number; styleNo: string; skuCode: string;
  color: string; size: string;
  costPrice: number | null; salesPrice: number | null;
  stockQuantity: number;
}

// ─── 订单管理 Tab ─────────────────────────────────────────
const OrdersTab: React.FC = () => {
  const [data, setData] = useState<EcOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<EcOrder | null>(null);
  const [linkTarget, setLinkTarget] = useState<EcOrder | null>(null);
  const [linkForm] = Form.useForm();
  const [linking, setLinking] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      if (filterPlatform) params.platform = filterPlatform;
      if (filterStatus !== undefined) params.status = filterStatus;
      if (keyword) params.keyword = keyword;
      const res = await axios.post('/api/ecommerce/orders/list', params);
      const d = res.data?.data ?? {};
      setData(d.records ?? []);
      setTotal(d.total ?? 0);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  }, [page, pageSize, filterPlatform, filterStatus, keyword]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLink = async () => {
    if (!linkTarget) return;
    try {
      const v = await linkForm.validateFields();
      setLinking(true);
      await axios.post(`/api/ecommerce/orders/${linkTarget.id}/link`, {
        productionOrderNo: v.productionOrderNo,
      });
      message.success('关联成功，出库时自动回写物流状态');
      setLinkTarget(null);
      fetchData();
    } catch { message.error('关联失败'); }
    finally { setLinking(false); }
  };

  const pendingShip  = data.filter(d => d.status === 1).length;
  const shipped      = data.filter(d => d.warehouseStatus === 2).length;
  const linked       = data.filter(d => d.productionOrderNo).length;
  const totalRevenue = data.reduce((s, d) => s + (d.payAmount || 0), 0);

  const columns: ColumnsType<EcOrder> = [
    {
      title: '平台', dataIndex: 'sourcePlatformCode', width: 88,
      render: code => {
        const p = PLATFORM_MAP[code] ?? { name: code, emoji: '🛒', color: 'default' };
        return <Tag color={p.color}>{p.emoji} {p.name}</Tag>;
      },
    },
    {
      title: '订单号', dataIndex: 'platformOrderNo', width: 160,
      render: (v, r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{v || r.orderNo}</div>
          {v && <div style={{ fontSize: 11, color: '#888' }}>内部 {r.orderNo}</div>}
        </div>
      ),
    },
    {
      title: '商品 / 买家', width: 190,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div style={{ fontSize: 12 }}>{r.productName || '-'} <Text type="secondary">×{r.quantity}</Text></div>
          {r.skuCode && <div style={{ fontSize: 11, color: '#52c41a' }}>SKU {r.skuCode}</div>}
          <div style={{ fontSize: 11, color: '#888' }}>{r.buyerNick || r.receiverName}</div>
        </div>
      ),
    },
    {
      title: '金额', width: 130,
      render: (_: unknown, r: EcOrder) => (
        <div>
          {r.unitPrice ? <div style={{ fontSize: 11, color: '#888' }}>单价 ¥{r.unitPrice} × {r.quantity}</div> : null}
          <div style={{ color: '#fa8c16', fontWeight: 600 }}>实付 ¥{r.payAmount ?? '-'}</div>
          {r.freight ? <div style={{ fontSize: 10, color: '#aaa' }}>运费 ¥{r.freight}</div> : null}
        </div>
      ),
    },
    {
      title: '订单状态', dataIndex: 'status', width: 82,
      render: v => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label ?? v}</Tag>,
    },
    {
      title: '仓库状态', dataIndex: 'warehouseStatus', width: 82,
      render: v => <Tag color={WH_MAP[v]?.color}>{WH_MAP[v]?.label ?? v}</Tag>,
    },
    {
      title: '关联生产单', dataIndex: 'productionOrderNo', width: 140,
      render: v => v
        ? <Tag color="blue" icon={<CheckCircleOutlined />}>{v}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>未关联</Text>,
    },
    {
      title: '快递', dataIndex: 'trackingNo', width: 130,
      render: (v, r) => v
        ? <div>
            <div style={{ fontSize: 11, color: '#888' }}>{r.expressCompany}</div>
            <div style={{ fontSize: 12 }}>{v}</div>
          </div>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '下单时间', dataIndex: 'createTime', width: 100,
      render: v => <span style={{ fontSize: 11 }}>{v?.slice(0, 16)}</span>,
    },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_: unknown, r: EcOrder) => (
        <Space size={4}>
          <Tooltip title="查看详情">
            <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setDetail(r)} />
          </Tooltip>
          <Tooltip title={r.productionOrderNo ? '已关联' : '关联排产'}>
            <Button size="small" type="text" icon={<LinkOutlined />}
              disabled={!!r.productionOrderNo}
              onClick={() => { setLinkTarget(r); linkForm.resetFields(); }} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 14 }}>
        {[
          { title: '本页订单', value: total, suffix: '单', color: undefined },
          { title: '待发货',   value: pendingShip, suffix: '单', color: '#fa8c16' },
          { title: '已出库',   value: shipped,     suffix: '单', color: '#52c41a' },
          { title: '已关联排产', value: linked,    suffix: '单', color: '#1677ff' },
        ].map((s, i) => (
          <Col span={6} key={i}>
            <Card size="small" bodyStyle={{ padding: '8px 12px' }}>
              <Statistic title={<span style={{ fontSize: 11 }}>{s.title}</span>}
                value={s.value} suffix={s.suffix}
                valueStyle={{ fontSize: 22, color: s.color }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card size="small" style={{ marginBottom: 8, background: 'rgba(235,47,150,0.04)', border: '1px solid rgba(235,47,150,0.18)' }}
        bodyStyle={{ padding: '8px 14px' }}>
        <span style={{ fontSize: 12, color: '#888' }}>本页实付合计：</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#eb2f96' }}>¥{totalRevenue.toFixed(2)}</span>
      </Card>

      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap>
          <Select placeholder="全部平台" allowClear value={filterPlatform || undefined}
            onChange={v => { setFilterPlatform(v ?? ''); setPage(1); }} style={{ width: 120 }}>
            {Object.entries(PLATFORM_MAP).map(([c, p]) => (
              <Option key={c} value={c}>{p.emoji} {p.name}</Option>
            ))}
          </Select>
          <Select placeholder="全部状态" allowClear value={filterStatus}
            onChange={v => { setFilterStatus(v); setPage(1); }} style={{ width: 100 }}>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <Option key={k} value={Number(k)}>{v.label}</Option>
            ))}
          </Select>
          <Input.Search placeholder="订单号 / 买家 / 收件人" allowClear style={{ width: 220 }}
            enterButton={<SearchOutlined />}
            onSearch={v => { setKeyword(v); setPage(1); }} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </Card>

      <Table rowKey="id" dataSource={data} columns={columns} loading={loading}
        scroll={{ x: 1150 }} size="small"
        pagination={{ current: page, pageSize, total, showSizeChanger: true,
          showTotal: t => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} title="订单详情" width={480}>
        {detail && (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="平台">
                {PLATFORM_MAP[detail.sourcePlatformCode]?.emoji}{' '}
                {PLATFORM_MAP[detail.sourcePlatformCode]?.name || detail.platform}
              </Descriptions.Item>
              <Descriptions.Item label="平台订单号">{detail.platformOrderNo || '-'}</Descriptions.Item>
              <Descriptions.Item label="内部单号" span={2}>{detail.orderNo}</Descriptions.Item>
              <Descriptions.Item label="订单状态">
                <Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="仓库状态">
                <Tag color={WH_MAP[detail.warehouseStatus]?.color}>{WH_MAP[detail.warehouseStatus]?.label}</Tag>
              </Descriptions.Item>
            </Descriptions>
            <Divider style={{ margin: '12px 0' }}>商品 &amp; 金额</Divider>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="商品名" span={2}>{detail.productName || '-'}</Descriptions.Item>
              <Descriptions.Item label="SKU">{detail.skuCode || '-'}</Descriptions.Item>
              <Descriptions.Item label="数量">{detail.quantity} 件</Descriptions.Item>
              <Descriptions.Item label="商品单价">¥{detail.unitPrice ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="订单总额">¥{detail.totalAmount ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="实付金额">
                <Text style={{ color: '#fa8c16', fontWeight: 700 }}>¥{detail.payAmount ?? '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="运费">¥{detail.freight ?? 0}</Descriptions.Item>
              <Descriptions.Item label="优惠">-¥{detail.discount ?? 0}</Descriptions.Item>
              <Descriptions.Item label="支付方式">{detail.payType || '-'}</Descriptions.Item>
            </Descriptions>
            <Divider style={{ margin: '12px 0' }}>收件人</Divider>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="姓名">{detail.receiverName}</Descriptions.Item>
              <Descriptions.Item label="电话">{detail.receiverPhone}</Descriptions.Item>
              <Descriptions.Item label="地址">{detail.receiverAddress}</Descriptions.Item>
            </Descriptions>
            <Divider style={{ margin: '12px 0' }}>物流 &amp; 关联</Divider>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="快递公司">{detail.expressCompany || '-'}</Descriptions.Item>
              <Descriptions.Item label="快递单号">{detail.trackingNo || '-'}</Descriptions.Item>
              <Descriptions.Item label="关联生产单" span={2}>
                {detail.productionOrderNo
                  ? <Tag color="blue" icon={<CheckCircleOutlined />}>{detail.productionOrderNo}</Tag>
                  : <Text type="secondary">未关联（仓库出库后自动回写）</Text>}
              </Descriptions.Item>
            </Descriptions>
            {(detail.buyerRemark || detail.sellerRemark) && (
              <>
                <Divider style={{ margin: '12px 0' }}>备注</Divider>
                <Descriptions size="small" column={1} bordered>
                  {detail.buyerRemark && <Descriptions.Item label="买家备注">{detail.buyerRemark}</Descriptions.Item>}
                  {detail.sellerRemark && <Descriptions.Item label="卖家备注">{detail.sellerRemark}</Descriptions.Item>}
                </Descriptions>
              </>
            )}
            <Divider style={{ margin: '12px 0' }}>时间节点</Divider>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="下单时间">{detail.createTime?.slice(0, 16)}</Descriptions.Item>
              <Descriptions.Item label="付款时间">{detail.payTime?.slice(0, 16) || '-'}</Descriptions.Item>
              <Descriptions.Item label="发货时间">{detail.shipTime?.slice(0, 16) || '-'}</Descriptions.Item>
              <Descriptions.Item label="完成时间">{detail.completeTime?.slice(0, 16) || '-'}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>

      <Modal title={<><LinkOutlined /> 关联生产订单</>}
        open={!!linkTarget} onCancel={() => setLinkTarget(null)}
        onOk={handleLink} confirmLoading={linking} okText="确认关联" width={440}>
        {linkTarget && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 12 }}>
            <div>平台订单: <b>{linkTarget.platformOrderNo}</b></div>
            <div>商品: {linkTarget.productName} × {linkTarget.quantity}</div>
            <div>实付: ¥{linkTarget.payAmount} &nbsp;|&nbsp; 买家: {linkTarget.buyerNick || linkTarget.receiverName}</div>
          </div>
        )}
        <Alert style={{ marginBottom: 12, fontSize: 12 }} type="info" showIcon
          message="关联后，该生产订单从仓库出库时将自动更新此电商订单为【已出库】并写入快递单号" />
        <Form form={linkForm} layout="vertical" size="small">
          <Form.Item name="productionOrderNo" label="生产订单号"
            rules={[{ required: true, message: '请输入生产订单号' }]}>
            <Input placeholder="如 PO20260301001，可在生产进度页查看" prefix={<SearchOutlined />} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// ─── SKU 定价管理 Tab ─────────────────────────────────────
const PricingTab: React.FC = () => {
  const [data, setData] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [styleNo, setStyleNo] = useState('');
  const [editRow, setEditRow] = useState<{ id: number; costPrice: number | null; salesPrice: number | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize: 20 };
      if (styleNo) params.styleNo = styleNo;
      const res = await axios.get('/api/style/sku/list', { params });
      const d = res.data?.data ?? {};
      setData(d.records ?? []);
      setTotal(d.total ?? 0);
    } catch { message.error('加载SKU失败'); }
    finally { setLoading(false); }
  }, [page, styleNo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (row: Sku) => {
    if (!editRow) return;
    setSaving(true);
    try {
      await axios.put(`/api/style/sku/${row.id}`, {
        costPrice: editRow.costPrice,
        salesPrice: editRow.salesPrice,
      });
      message.success('价格已保存');
      setEditRow(null);
      fetchData();
    } catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  const pricingColumns: ColumnsType<Sku> = [
    { title: '款式号', dataIndex: 'styleNo', width: 130, render: v => <Text strong>{v}</Text> },
    { title: '颜色',   dataIndex: 'color',   width: 80 },
    { title: '尺码',   dataIndex: 'size',    width: 70 },
    {
      title: 'SKU编码', dataIndex: 'skuCode', width: 190,
      render: v => <Text style={{ fontSize: 11, color: '#52c41a' }}>{v}</Text>,
    },
    {
      title: '库存', dataIndex: 'stockQuantity', width: 70,
      render: v => <Badge count={v} showZero color={v > 0 ? '#52c41a' : '#aaa'} />,
    },
    {
      title: '成本价 (¥)', dataIndex: 'costPrice', width: 140,
      render: (v, r) => editRow?.id === r.id
        ? <InputNumber size="small" value={editRow.costPrice ?? undefined} min={0} precision={2}
            style={{ width: 110 }}
            onChange={val => setEditRow(prev => prev ? { ...prev, costPrice: val } : null)} />
        : <Text style={{ color: '#888' }}>{v != null ? `¥${v}` : <Text type="secondary">—</Text>}</Text>,
    },
    {
      title: '售价 (¥)', dataIndex: 'salesPrice', width: 140,
      render: (v, r) => editRow?.id === r.id
        ? <InputNumber size="small" value={editRow.salesPrice ?? undefined} min={0} precision={2}
            style={{ width: 110 }}
            onChange={val => setEditRow(prev => prev ? { ...prev, salesPrice: val } : null)} />
        : <Text style={{ color: '#fa8c16', fontWeight: 600 }}>{v != null ? `¥${v}` : <Text type="secondary">—</Text>}</Text>,
    },
    {
      title: '毛利率', width: 80,
      render: (_: unknown, r: Sku) => {
        if (!r.costPrice || !r.salesPrice) return <Text type="secondary">-</Text>;
        const rate = ((r.salesPrice - r.costPrice) / r.salesPrice * 100);
        return <Tag color={rate >= 40 ? 'green' : rate >= 20 ? 'orange' : 'red'}>{rate.toFixed(1)}%</Tag>;
      },
    },
    {
      title: '操作', width: 110, fixed: 'right',
      render: (_: unknown, r: Sku) => editRow?.id === r.id
        ? (
          <Space size={4}>
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving}
              onClick={() => handleSave(r)}>保存</Button>
            <Button size="small" onClick={() => setEditRow(null)}>取消</Button>
          </Space>
        )
        : (
          <Button size="small" icon={<EditOutlined />}
            onClick={() => setEditRow({ id: r.id, costPrice: r.costPrice, salesPrice: r.salesPrice })}>
            定价
          </Button>
        ),
    },
  ];

  return (
    <div>
      <Alert style={{ marginBottom: 14, fontSize: 12 }} type="info" showIcon
        message="此处的【售价】和【成本价】将同步显示在成品仓库的单价列和毛利计算中。点击【定价】按钮直接修改，保存后实时生效。" />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space>
          <Input placeholder="按款式号筛选" allowClear style={{ width: 180 }}
            onChange={e => { if (!e.target.value) { setStyleNo(''); setPage(1); } }}
            onPressEnter={(e) => { setStyleNo((e.target as HTMLInputElement).value); setPage(1); }}
            suffix={<SearchOutlined />} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </Card>
      <Table rowKey="id" dataSource={data} columns={pricingColumns} loading={loading}
        size="small" scroll={{ x: 900 }}
        pagination={{ current: page, pageSize: 20, total,
          showTotal: t => `共 ${t} 个 SKU`,
          onChange: p => setPage(p) }}
      />
    </div>
  );
};

// ─── 主页面 ───────────────────────────────────────────────
const EcommerceOrders: React.FC = () => (
  <Layout>
  <div style={{ padding: 20 }}>
    <Alert style={{ marginBottom: 14, fontSize: 12 }} type="info" showIcon
      message="电商对接全流程"
      description={
        <Steps size="small" style={{ marginTop: 8 }}
          items={[
            { title: '配置平台',  description: '应用商店填写密钥',          icon: <ShopOutlined style={{ color: '#1677ff' }} /> },
            { title: '平台推单',  description: '各平台 Webhook 推入本系统',  icon: <ApiOutlined style={{ color: '#fa8c16' }} /> },
            { title: '关联排产',  description: '订单管理页手动关联生产单',   icon: <ShoppingCartOutlined style={{ color: '#722ed1' }} /> },
            { title: '仓库出库',  description: '出库自动更新仓库状态+快递', icon: <CarOutlined style={{ color: '#13c2c2' }} /> },
            { title: '财务核算',  description: 'SKU定价页设置售价/成本看毛利', icon: <RiseOutlined style={{ color: '#eb2f96' }} /> },
          ]}
        />
      }
    />
    <Tabs defaultActiveKey="orders" type="card"
      items={[
        {
          key: 'orders',
          label: <><ShoppingCartOutlined /> 订单管理</>,
          children: <OrdersTab />,
        },
        {
          key: 'pricing',
          label: <><EditOutlined /> SKU 定价</>,
          children: <PricingTab />,
        },
      ]}
    />
  </div>
  </Layout>
);

export default EcommerceOrders;
