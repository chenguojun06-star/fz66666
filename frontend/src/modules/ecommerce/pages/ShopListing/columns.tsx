import type { ColumnsType } from 'antd/es/table';
import { Button, Popconfirm, Tag, Tooltip, Typography } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { ListingRow, ShopSkuSummary } from './types';

const { Text } = Typography;

const price = (v?: number | null) => (v == null ? '—' : `¥${Number(v).toFixed(2)}`);

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
  editingId: number | null;
  togglingId: number | null;
  onEdit: (row: ListingRow) => void;
  onToggleListing: (row: ListingRow, listed: boolean) => void;
}

export function buildListingColumns({
  summary, editingId, togglingId, onEdit, onToggleListing,
}: Params): ColumnsType<ListingRow> {
  return [
    {
      title: '主图',
      width: 76,
      render: (_, r) =>
        r.cover ? (
          <img src={getFullAuthedFileUrl(r.cover)} alt="" className="shop-listing__thumb" />
        ) : (
          <div className="shop-listing__thumb shop-listing__thumb--empty">
            <PictureOutlined />
          </div>
        ),
    },
    { title: '款号', dataIndex: 'styleNo', width: 130 },
    { title: '款名', dataIndex: 'styleName', ellipsis: true },
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