import React from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
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
  type PlatformShopProductRow,
  type PlatformShopRow,
} from "@/services/shop/shopApi";

const { Text } = Typography;

/**
 * 平台级商城总览（P0 / P2，**只读**，仅平台超管）。
 *
 * 「平台级电商」的平台方视角：全站店铺、在架商品、注册用户、订单计数与最近订单。
 * 按既定方向，资金各租户直收、平台不抽成，所以本页刻意**不做任何写操作** ——
 * 下架/审核属于会改变租户既有上架行为的动作，需先定策略再开，
 * 避免在权限与治理边界未定型前越权改别人的数据。
 */
const PlatformShopOverview: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<PlatformShopOverviewData | null>(null);

  // P2：全站在架商品（跨租户只读，平台方治理的最低要求）
  const [products, setProducts] = React.useState<PlatformShopProductRow[]>([]);
  const [productTotal, setProductTotal] = React.useState(0);
  const [productPage, setProductPage] = React.useState(1);
  const [productKeyword, setProductKeyword] = React.useState("");
  const [productLoading, setProductLoading] = React.useState(false);

  const loadProducts = React.useCallback(
    async (p: number, keyword?: string) => {
      setProductLoading(true);
      try {
        const res = unwrapApiData<{ records: PlatformShopProductRow[]; total: number }>(
          await platformShopApi.products({
            page: p,
            pageSize: 20,
            keyword: (keyword ?? productKeyword) || undefined,
          }),
          "加载全站商品失败",
        );
        setProducts(res?.records ?? []);
        setProductTotal(res?.total ?? 0);
        setProductPage(p);
      } catch {
        setProducts([]);
        setProductTotal(0);
      } finally {
        setProductLoading(false);
      }
    },
    [productKeyword],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = unwrapApiData<PlatformShopOverviewData>(
        await platformShopApi.overview(),
        "加载平台总览失败",
      );
      setData(res);
      void loadProducts(1);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "加载平台总览失败");
    } finally {
      setLoading(false);
    }
  }, [loadProducts]);

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
      render: (enabled: boolean) => (enabled ? <Tag color="green">营业中</Tag> : <Tag>已打烊</Tag>),
    },
    { title: "在架商品", dataIndex: "productCount", width: 100, align: "right" },
    { title: "租户", dataIndex: "tenantId", width: 90, align: "right" },
  ];

  const orderColumns: ColumnsType<PlatformShopOrderRow> = [
    { title: "订单号", dataIndex: "orderNo", width: 190 },
    { title: "店铺", dataIndex: "shopName", render: (v: string | null) => v || "—" },
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
      render: (t: string) => (t ? String(t).replace("T", " ").slice(0, 16) : "—"),
    },
  ];

  const productColumns: ColumnsType<PlatformShopProductRow> = [
    {
      title: "商品",
      dataIndex: "styleName",
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Text>{row.styleName || row.styleNo || "未命名"}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.styleNo || ""} {row.category ? `· ${row.category}` : ""}
          </Text>
        </Space>
      ),
    },
    { title: "所属店铺", dataIndex: "shopName", width: 170 },
    {
      title: "售价（起）",
      dataIndex: "minPrice",
      width: 110,
      align: "right",
      render: (v: number | null) => (v == null ? "—" : formatMoney(v)),
    },
    { title: "可售", dataIndex: "totalStock", width: 80, align: "right" },
    { title: "颜色", dataIndex: "colorCount", width: 70, align: "right" },
    {
      title: "评分",
      dataIndex: "rating",
      width: 110,
      render: (_: unknown, row) =>
        row.reviewCount ? (
          <Text style={{ color: "var(--color-warning, #faad14)" }}>
            ★{Number(row.rating ?? 0).toFixed(1)} ({row.reviewCount})
          </Text>
        ) : (
          <Text type="secondary">暂无评价</Text>
        ),
    },
    { title: "租户", dataIndex: "tenantId", width: 80, align: "right" },
  ];

  const counters = data?.counters;

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ marginBottom: 12, width: "100%", justifyContent: "space-between" }}>
        <Text strong style={{ fontSize: 16 }}>
          平台商城总览
        </Text>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="这是平台方视角的只读总览"
        description="各租户的店铺与在架商品汇总于此。资金由各店铺自行收取，平台不参与结算，因此本页不含佣金/分账数据；也不提供下架/审核等写操作，避免越权改动租户数据。"
      />

      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

      <Row gutter={12}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="店铺数" value={counters?.shopCount ?? 0} prefix={<ShopOutlined />} />
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
            <Statistic title="订单总额" value={counters?.orderAmount ?? 0} precision={2} prefix="¥" />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="店铺清单" style={{ marginTop: 16 }} loading={loading}>
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
        title="全站在架商品"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Input.Search
              allowClear
              style={{ width: 240 }}
              placeholder="输入款名 / 款号后回车"
              defaultValue={productKeyword}
              onSearch={(v) => {
                setProductKeyword(v);
                void loadProducts(1, v);
              }}
              enterButton
            />
            <Tooltip title="重新拉取">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void loadProducts(productPage)}
              />
            </Tooltip>
          </Space>
        }
      >
        <Table<PlatformShopProductRow>
          rowKey="styleId"
          size="small"
          columns={productColumns}
          dataSource={products}
          loading={productLoading}
          pagination={{
            current: productPage,
            total: productTotal,
            pageSize: 20,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => void loadProducts(p),
          }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Card size="small" title="最近店铺订单（全站）" style={{ marginTop: 16 }} loading={loading}>
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
