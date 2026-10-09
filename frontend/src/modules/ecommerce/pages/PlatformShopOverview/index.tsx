import React from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ReloadOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { unwrapApiData } from "@/utils/api";
import { formatMoney } from "@/utils/format";
import {
  platformShopApi,
  type PlatformShopOrderRow,
  type PlatformShopOverview as PlatformShopOverviewData,
  type PlatformShopRow,
} from "@/services/shop/shopApi";

const { Text } = Typography;

/**
 * 平台级商城总览（P0，**只读**，仅平台超管）。
 *
 * <p>「平台级电商」的第一块可见产出：把各租户的店铺与在架商品汇到平台方视角。
 * 按既定方向，资金各租户直收、平台不抽成，所以本页刻意**不做任何写操作** ——
 * 只有计数、店铺清单与最近订单，避免在权限/资金边界未定型前误开放平台操作能力。
 */
const PlatformShopOverview: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<PlatformShopOverviewData | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = unwrapApiData<PlatformShopOverviewData>(
        await platformShopApi.overview(),
        "加载平台总览失败",
      );
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "加载平台总览失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const shopColumns: ColumnsType<PlatformShopRow> = [
    {
      title: "店铺",
      dataIndex: "shopName",
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.shopName}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            /shop/index.html?s={row.slug}
          </Text>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 90,
      render: (enabled: boolean) =>
        enabled ? <Tag color="green">营业中</Tag> : <Tag>已打烊</Tag>,
    },
    {
      title: "在架商品",
      dataIndex: "productCount",
      width: 100,
      align: "right",
    },
    { title: "租户", dataIndex: "tenantId", width: 90, align: "right" },
  ];

  const orderColumns: ColumnsType<PlatformShopOrderRow> = [
    { title: "订单号", dataIndex: "orderNo", width: 190 },
    {
      title: "店铺",
      dataIndex: "shopName",
      render: (v: string | null) => v || "—",
    },
    { title: "买家", dataIndex: "customerName", width: 110 },
    {
      title: "金额",
      dataIndex: "totalAmount",
      width: 110,
      align: "right",
      render: (v: number) => formatMoney(v),
    },
    { title: "件数", dataIndex: "itemCount", width: 70, align: "right" },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (s: string) => {
        const map: Record<string, { text: string; color: string }> = {
          PENDING_SHIP: { text: "待发货", color: "orange" },
          SHIPPED: { text: "已发货", color: "green" },
          CANCELLED: { text: "已取消", color: "default" },
        };
        const it = map[s] || { text: s, color: "default" };
        return <Tag color={it.color}>{it.text}</Tag>;
      },
    },
    {
      title: "下单时间",
      dataIndex: "createTime",
      width: 160,
      render: (t: string) =>
        t ? String(t).replace("T", " ").slice(0, 16) : "—",
    },
  ];

  const counters = data?.counters;

  return (
    <div style={{ padding: 16 }}>
      <Space
        style={{
          marginBottom: 12,
          width: "100%",
          justifyContent: "space-between",
        }}
      >
        <Text strong style={{ fontSize: 16 }}>
          平台商城总览
        </Text>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          loading={loading}
        >
          刷新
        </Button>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="这是平台方视角的只读总览"
        description="各租户的店铺与在架商品汇总于此。资金由各店铺自行收取，平台不参与结算，因此本页不含佣金/分账数据。"
      />

      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      <Row gutter={12}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="店铺数"
              value={counters?.shopCount ?? 0}
              prefix={<ShopOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="营业中" value={counters?.openShopCount ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="在架商品"
              value={counters?.listedStyleCount ?? 0}
              prefix={<AppstoreOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="注册用户"
              value={counters?.consumerCount ?? 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="订单数"
              value={counters?.orderCount ?? 0}
              prefix={<ShoppingCartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="订单总额"
              value={counters?.orderAmount ?? 0}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="店铺清单"
        style={{ marginTop: 16 }}
        loading={loading}
      >
        <Table<PlatformShopRow>
          rowKey="slug"
          size="small"
          columns={shopColumns}
          dataSource={data?.shops ?? []}
          pagination={false}
          scroll={{ x: 600 }}
        />
      </Card>

      <Card
        size="small"
        title="最近店铺订单（全站）"
        style={{ marginTop: 16 }}
        loading={loading}
      >
        <Table<PlatformShopOrderRow>
          rowKey="orderNo"
          size="small"
          columns={orderColumns}
          dataSource={data?.recentOrders ?? []}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
};

export default PlatformShopOverview;
