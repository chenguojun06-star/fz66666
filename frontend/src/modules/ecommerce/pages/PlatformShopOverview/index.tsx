import React from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Row,
  Segmented,
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
import { message } from "@/utils/antdStatic";
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

/** 商品在架状态过滤：undefined=全部 */
type ListedFilter = boolean | undefined;

/**
 * 平台级商城总览（平台超管）。
 *
 * <p>P2 收尾补上了**治理写能力**：一键下架 / 恢复上架。
 * 口径是「发布即上架 + 事后巡检 + 违规下架」——**不做前置审核**：
 * 前置审核会让商家上架变慢，平台还要背审核人力，而主流平台现在也不这么做。
 *
 * <p>两条刻意保留的边界：
 * ① 平台只能改「能不能卖」（在架状态），**不能改商家的商品资料**；
 * ② 下架必须可逆，且必须填原因（原因会随通知发给商家）——
 * 只给下架不给恢复，等于平台能一键把别人的生意做没。
 */
const PlatformShopOverview: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<PlatformShopOverviewData | null>(null);

  // 全站商品（含已下架，平台治理需要看得到被下架的才能恢复）
  const [products, setProducts] = React.useState<PlatformShopProductRow[]>([]);
  const [productTotal, setProductTotal] = React.useState(0);
  const [productPage, setProductPage] = React.useState(1);
  const [productKeyword, setProductKeyword] = React.useState("");
  const [listedFilter, setListedFilter] = React.useState<ListedFilter>(undefined);
  const [productLoading, setProductLoading] = React.useState(false);

  // 下架弹窗
  const [takeTarget, setTakeTarget] = React.useState<PlatformShopProductRow | null>(null);
  const [takeReason, setTakeReason] = React.useState("");
  const [takeSubmitting, setTakeSubmitting] = React.useState(false);
  const [actingId, setActingId] = React.useState<number | null>(null);

  const loadProducts = React.useCallback(
    async (p: number, keyword?: string, listed?: ListedFilter) => {
      setProductLoading(true);
      try {
        const res = unwrapApiData<{ records: PlatformShopProductRow[]; total: number }>(
          await platformShopApi.products({
            page: p,
            pageSize: 20,
            keyword: (keyword ?? productKeyword) || undefined,
            listedOnly: listed === undefined ? undefined : listed,
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

  /** 一键下架：原因必填（商家要知道为什么，否则只会反复重新上架） */
  const submitTakedown = React.useCallback(async () => {
    if (!takeTarget) return;
    const reason = takeReason.trim();
    if (!reason) {
      message.warning("请填写下架原因（会通知商家）");
      return;
    }
    setTakeSubmitting(true);
    try {
      unwrapApiData(
        await platformShopApi.takedown(takeTarget.styleId, reason),
        "下架失败",
      );
      message.success("已下架并通知商家");
      setTakeTarget(null);
      setTakeReason("");
      void loadProducts(productPage);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "下架失败");
    } finally {
      setTakeSubmitting(false);
    }
  }, [takeTarget, takeReason, productPage, loadProducts]);

  const doRelist = React.useCallback(
    async (row: PlatformShopProductRow) => {
      setActingId(row.styleId);
      try {
        unwrapApiData(await platformShopApi.relist(row.styleId), "恢复上架失败");
        message.success("已恢复上架并通知商家");
        void loadProducts(productPage);
      } catch (e) {
        message.error(e instanceof Error ? e.message : "恢复上架失败");
      } finally {
        setActingId(null);
      }
    },
    [productPage, loadProducts],
  );

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
            {row.styleNo || ""} {row.categoryName ? `· ${row.categoryName}` : ""}
          </Text>
        </Space>
      ),
    },
    { title: "所属店铺", dataIndex: "shopName", width: 150 },
    {
      title: "在架状态",
      dataIndex: "shopListed",
      width: 100,
      render: (v: number) =>
        Number(v) === 1 ? <Tag color="green">在架</Tag> : <Tag color="red">已下架</Tag>,
    },
    {
      title: "售价（起）",
      dataIndex: "minPrice",
      width: 110,
      align: "right",
      render: (v: number | null) => (v == null ? "—" : formatMoney(v)),
    },
    { title: "可售", dataIndex: "totalStock", width: 80, align: "right" },
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
    {
      title: "操作",
      width: 110,
      fixed: "right",
      render: (_: unknown, row) =>
        Number(row.shopListed) === 1 ? (
          <Button
            type="link"
            danger
            size="small"
            onClick={() => {
              setTakeTarget(row);
              setTakeReason("");
            }}
          >
            下架
          </Button>
        ) : (
          <Button
            type="link"
            size="small"
            loading={actingId === row.styleId}
            onClick={() => void doRelist(row)}
          >
            恢复上架
          </Button>
        ),
    },
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
        message="平台治理口径：发布即上架 + 事后巡检 + 违规下架（不做前置审核）"
        description={
          <span style={{ fontSize: 12.5 }}>
            前置审核会让商家上架变慢、平台还要背审核人力，主流平台现在也不是「先审后上」。
            平台在这里只能改「能不能卖」（在架状态），<b>不能改商家的商品资料</b>；
            下架必须填原因并会通知商家，也可以随时恢复 —— 治理是双向的。
            资金由各店铺自行收取，平台不参与结算，因此本页不含佣金/分账数据。
          </span>
        }
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
        title="全站商品（含已下架）"
        style={{ marginTop: 16 }}
        extra={
          <Space wrap>
            <Segmented
              value={listedFilter === undefined ? "all" : String(listedFilter)}
              onChange={(v) => {
                const next: ListedFilter =
                  v === "all" ? undefined : v === "true";
                setListedFilter(next);
                void loadProducts(1, undefined, next);
              }}
              options={[
                { value: "all", label: "全部" },
                { value: "true", label: "在架" },
                { value: "false", label: "已下架" },
              ]}
            />
            <Input.Search
              allowClear
              style={{ width: 220 }}
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
          scroll={{ x: 1100 }}
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

      <Modal
        open={!!takeTarget}
        title="下架商品并通知商家"
        okText="确认下架"
        okButtonProps={{ danger: true }}
        confirmLoading={takeSubmitting}
        onOk={() => void submitTakedown()}
        onCancel={() => {
          setTakeTarget(null);
          setTakeReason("");
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <Text>
            {takeTarget?.shopName || "该店铺"} ·{" "}
            {takeTarget?.styleName || takeTarget?.styleNo || "未命名"}
          </Text>
        </div>
        <Input.TextArea
          value={takeReason}
          onChange={(e) => setTakeReason(e.target.value)}
          placeholder="下架原因（必填，会发给商家，例如：详情页含极限词「最」）"
          maxLength={200}
          showCount
          autoSize={{ minRows: 3, maxRows: 5 }}
        />
        <Alert
          style={{ marginTop: 8 }}
          type="warning"
          showIcon
          message="只下架、不改商品资料；商家修改后可自行重新上架，平台也可随时恢复"
        />
      </Modal>
    </div>
  );
};

export default PlatformShopOverview;
