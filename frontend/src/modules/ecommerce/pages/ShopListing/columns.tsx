import type { ColumnsType } from 'antd/es/table';
import { Button, Popconfirm, Tag, Tooltip, Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import StyleImageCell from '@/components/common/StyleImageCell';
import type { StyleImageMap } from '@/hooks/useStyleCoverImages';
import type { ListingRow, ShopSkuSummary } from './types';
import {
  diagnoseListingFromSummary, summarizeListingIssues, calcStyleProfit, profitLevelOf,
} from './listingCompliance';

const { Text } = Typography;

const price = (v?: number | null) => (v == null ? '—' : `¥${Number(v).toFixed(2)}`);

/**
 * D-843：款式状态（上架列表用）。
 * 对外只有三档粗口径（用户口径：开发中 / 大货生产中 / 已结束），
 * 细分节点（纸样开发中/纸样完成/样衣制作中/样衣生产完成…）只在 Tooltip 里展示，
 * 不再把后端 progressNode 原文直接当状态显示（D-843 修正：之前「纸样完成」这种
 * 开发阶段的细分节点被 fallthrough 原样显示，运营看到以为是独立状态）。
 * 只做展示、不做拦截：开发中的款也允许上架（预售/测款）。
 */
export function resolveStyleStage(row: ListingRow): { text: string; color: string; tip: string } {
  const status = String(row.status ?? '').trim().toUpperCase();
  const sample = String(row.sampleStatus ?? '').trim().toUpperCase();
  const order = String(row.latestOrderStatus ?? '').trim().toLowerCase();
  const node = String(row.progressNode ?? '').trim();
  const orders = row.orderCount ? `（共 ${row.orderCount} 张大货单）` : '';

  // 1. 报废最优先
  if (status === 'SCRAPPED') {
    return { text: '已报废', color: 'error', tip: '该款已报废，不建议上架销售' };
  }
  // 2. 有最新大货订单 → 按订单状态
  if (['pending', 'production', 'delayed', 'paused'].includes(order)) {
    return {
      text: order === 'delayed' ? '大货逾期' : '大货生产中',
      color: order === 'delayed' ? 'error' : 'blue',
      tip: `已下大货订单${orders}，当前订单状态：${order}`,
    };
  }
  if (['completed', 'closed', 'archived'].includes(order)) {
    return { text: '大货已完成', color: 'success', tip: `大货订单已完成/关单${orders}` };
  }
  // 3. 款式停用
  if (status === 'DISABLED') {
    return { text: '已停用', color: 'default', tip: '款式已停用，不再参与经营' };
  }
  // 4. 样衣开发流程真正走完（样衣完成 / 已审核入库），但还没下大货
  if (sample === 'COMPLETED' || sample === 'WAREHOUSE_IN') {
    return {
      text: '开发完成',
      color: 'cyan',
      tip: `样衣开发已完成（${node || '样衣完成'}），尚未下大货，可直接零售/补货`,
    };
  }
  // 5. 其余一律归「开发中」：纸样开发中 / 纸样完成 / 样衣制作中 / 样衣生产完成 / 未开始 / 无
  return {
    text: '开发中',
    color: 'processing',
    tip: `样衣开发阶段：${node || '未开始'}。开发中款式可预售/测款，正式上架请先确认库存`,
  };
}

/** 售价区间：min==max 只显示一个价 */
const priceRange = (s?: ShopSkuSummary) => {
  if (!s || (s.minPrice == null && s.maxPrice == null)) return '未设置';
  if (s.minPrice != null && s.maxPrice != null && Number(s.minPrice) !== Number(s.maxPrice)) {
    return `${price(s.minPrice)} ~ ${price(s.maxPrice)}`;
  }
  return price(s.minPrice ?? s.maxPrice);
};

interface Params {
  summary: Record<string, ShopSkuSummary>;
  /** 款式封面映射（D-800：用统一列工厂，缺图时降级为占位灰块，不裸 <img>） */
  imageMap: StyleImageMap;
  editingId: number | null;
  togglingId: number | null;
  onEdit: (row: ListingRow) => void;
  onToggleListing: (row: ListingRow, listed: boolean) => void;
}

export function buildListingColumns({
  summary, imageMap, editingId, togglingId, onEdit, onToggleListing,
}: Params): ColumnsType<ListingRow> {
  return [
    {
      title: '款式图',
      width: 76,
      render: (_, r) => (
        <StyleImageCell
          styleNo={r.styleNo}
          imageMap={imageMap}
          size={48}
        />
      ),
    },
    { title: '款号', dataIndex: 'styleNo', width: 130 },
    { title: '款名', dataIndex: 'styleName', ellipsis: true },
    {
      // D-843：款式状态列 —— 上架前先看清这款在开发中还是大货生产中，
      // 避免"开发中的款混进在售列表"造成乱套。
      title: '款式状态',
      width: 120,
      render: (_, r) => {
        const stage = resolveStyleStage(r);
        return (
          <Tooltip title={stage.tip}>
            <Tag color={stage.color} style={{ margin: 0 }}>{stage.text}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '店铺售价',
      width: 170,
      render: (_, r) => {
        const text = priceRange(summary[String(r.id)]);
        const unset = text === '未设置';
        return <Text strong={!unset} type={unset ? 'danger' : undefined}>{text}</Text>;
      },
    },
    {
      title: '可售库存',
      width: 100,
      align: 'right',
      render: (_, r) => {
        const s = summary[String(r.id)];
        const v = s?.totalStock;
        if (v == null) return <Text type="secondary">—</Text>;
        return <Text type={v > 0 ? undefined : 'danger'}>{v}</Text>;
      },
    },
    {
      title: '颜色',
      width: 80,
      align: 'center',
      render: (_, r) => {
        const s = summary[String(r.id)];
        return s?.colorCount ? <Tag>{s.colorCount} 色</Tag> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: '店铺状态',
      width: 100,
      render: (_, r) =>
        r.shopListed === 1 ? <Tag color="orange">已上架</Tag> : <Tag>未上架</Tag>,
    },
    {
      title: '上架时间',
      width: 165,
      render: (_, r) =>
        r.shopListed === 1 && r.shopListingTime
          ? (r.shopListingTime || '').replace('T', ' ').slice(0, 19)
          : <Text type="secondary">—</Text>,
    },
    {
      /**
       * D-769「毛利（保守）」列：对标店小秘/聚水潭的售价估算/利润试算。
       *
       * 口径 = 最低售价 − 最高成本，即**最坏情况**。这样结果为正就意味着
       * 所有 SKU 都赚钱；若拿均价算，会出现「算出来赚钱、实际有 SKU 在亏」，
       * 而亏的往往是促销先卖掉的那几个——结论不可靠。
       *
       * 成本未维护时显示「成本未维护」而<b>不显示 0</b>：用 0 冒充成本会让
       * 运营以为在亏钱（或暴利），比不显示更糟。
       */
      title: '毛利(保守)',
      width: 150,
      render: (_, r) => {
        const s = summary[String(r.id)];
        const res = calcStyleProfit({
          minPrice: s?.minPrice,
          minCost: s?.minCost,
          maxCost: s?.maxCost,
          costCoverage: s?.costCoverage,
        });
        if (res.status === 'no_cost') {
          return (
            <Tooltip title="该款 SKU 未维护成本价，无法估算毛利。请先在「改图与数据」里补成本，避免改价时算不清盈亏。">
              <Text type="secondary">成本未维护</Text>
            </Tooltip>
          );
        }
        if (res.status === 'partial_cost') {
          return (
            <Tooltip title={`仅 ${res.coverage}% 的 SKU 维护了成本，成本区间不完整，毛利不可信。请补齐全部 SKU 成本。`}>
              <Text type="warning">成本不完整 {res.coverage}%</Text>
            </Tooltip>
          );
        }
        const lv = profitLevelOf(res.marginRate);
        const tag = lv === 'loss' ? 'error' : lv === 'low' ? 'warning' : 'success';
        const tip = (
          <div style={{ maxWidth: 280 }}>
            <div>保守毛利（最低售价 − 最高成本）</div>
            <div>单件利润：¥{res.profit.toFixed(2)}</div>
            <div>毛利率：{res.marginRate.toFixed(2)}%</div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>
              该口径为最坏情况：为正即所有 SKU 都赚钱。
            </div>
          </div>
        );
        return (
          <Tooltip title={tip}>
            <span>
              <Tag color={tag}>{res.marginRate.toFixed(1)}%</Tag>
              <Text type="secondary" style={{ marginLeft: 4 }}>
                ¥{res.profit.toFixed(0)}
              </Text>
            </span>
          </Tooltip>
        );
      },
    },
    {
      /**
       * D-769「刊登体检」列：对标店小秘/聚水潭的刊登质量诊断。
       * 上架前就把「缺图 / 缺价 / 库存为 0 / 违禁词」摆在列表里，
       * 而不是上架后被平台拒绝、运营还不知道错在哪。
       *
       * 只用 `/shop/admin/sku/summary` 的聚合值，不额外拉 SKU 明细，
       * 因此体检不会给列表带来额外请求；逐 SKU 检查放在编辑抽屉里。
       */
      title: '刊登体检',
      width: 150,
      render: (_, r) => {
        const issues = diagnoseListingFromSummary({
          styleNo: r.styleNo,
          styleName: r.styleName,
          cover: r.cover,
          minPrice: summary[String(r.id)]?.minPrice,
          maxPrice: summary[String(r.id)]?.maxPrice,
          totalStock: summary[String(r.id)]?.totalStock,
          skuCount: summary[String(r.id)]?.skuCount,
        });
        const { canPublish, blockCount, warnCount } = summarizeListingIssues(issues);
        if (issues.length === 0) {
          return <Tag color="success" icon={<CheckCircleOutlined />}>可上架</Tag>;
        }
        const tip = (
          <div style={{ maxWidth: 300 }}>
            {issues.map((i) => (
              <div key={`${i.field}-${i.message}`} style={{ marginBottom: 4 }}>
                <span style={{ color: i.level === 'block' ? 'var(--color-error)' : 'var(--color-warning)' }}>
                  ● {i.level === 'block' ? '必须修' : '建议改'}
                </span>
                <div style={{ fontWeight: 600 }}>{i.field}：{i.message}</div>
                <div style={{ opacity: 0.85 }}>→ {i.action}</div>
              </div>
            ))}
          </div>
        );
        return (
          <Tooltip title={tip}>
            <Tag color={canPublish ? 'warning' : 'error'}>
              {canPublish ? `建议改 ${warnCount} 项` : `待修 ${blockCount} 项`}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      width: 160,
      fixed: 'right',
      render: (_, r) => (
        <div className="shop-listing__actions">
          <Button type="link" size="small" loading={editingId === r.id} onClick={() => onEdit(r)}>
            改图与数据
          </Button>
          {r.shopListed === 1 ? (
            <Popconfirm
              title="确认下架？"
              description="下架后顾客立刻看不到该商品，已产生的订单不受影响。"
              okText="下架"
              cancelText="取消"
              onConfirm={() => onToggleListing(r, false)}
            >
              <Button type="link" size="small" danger loading={togglingId === r.id}>
                下架
              </Button>
            </Popconfirm>
          ) : (
            <Tooltip title="上架后顾客立即可以在店铺里看到并下单">
              <Button
                type="link"
                size="small"
                loading={togglingId === r.id}
                onClick={() => onToggleListing(r, true)}
              >
                上架
              </Button>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];
}