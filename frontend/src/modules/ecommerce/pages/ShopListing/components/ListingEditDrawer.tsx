import React, { useMemo } from 'react';
import { Button, Card, Space, Spin, Tag, Typography } from 'antd';
import {
  PictureOutlined,
  TagsOutlined,
  LayoutOutlined,
  ShopOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import CoverColorImagesSection from './CoverColorImagesSection';
import SkuPriceStockSection from './SkuPriceStockSection';
import ListingInfoSection from './ListingInfoSection';
import LayoutEditorSection from './LayoutEditorSection';
import ListingContentSection, { type ListingContent } from './ListingContentSection';
import api from '@/utils/api';
import type { EditableSku, ListingRow } from '../types';

const { Text } = Typography;

interface Props {
  open: boolean;
  loading: boolean;
  saving: boolean;
  row: ListingRow | null;
  skus: EditableSku[];
  setSkus: React.Dispatch<React.SetStateAction<EditableSku[]>>;
  cover: string | null;
  setCover: (v: string | null) => void;
  colorImages: Record<string, string>;
  setColorImages: (v: Record<string, string>) => void;
  remark: string;
  setRemark: (v: string) => void;
  listed: boolean;
  toggling: boolean;
  onToggleListing: (listed: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}

/**
 * 抽屉分区：统一「序号 + 图标 + 标题 + 一句话说明 + 内容」。
 *
 * <p>D-513：此前是一个没有分区标题的长滚动（还夹着两块大色块 Alert 把结构切碎），
 * 用户从上到下读不出「有几块、每块干什么」。现在统一成编号卡片：
 * 说明文字从 Alert 降级为分区副标题（异常态才用 Alert 强调）。
 */
const Section: React.FC<{
  index: number;
  icon: React.ReactNode;
  title: string;
  desc: React.ReactNode;
  children: React.ReactNode;
}> = ({ index, icon, title, desc, children }) => (
  <Card
    className="shop-edit__section"
    size="small"
    title={
      <span className="shop-edit__section-title">
        <span className="shop-edit__section-index">{index}</span>
        <span className="shop-edit__section-icon">{icon}</span>
        {title}
      </span>
    }
  >
    <div className="shop-edit__section-desc">{desc}</div>
    {children}
  </Card>
);

/** 摘要条里的小指标 */
const Stat: React.FC<{ label: string; value: React.ReactNode; warn?: boolean }> = ({ label, value, warn }) => (
  <div className="shop-edit__stat">
    <div className="shop-edit__stat-label">{label}</div>
    <div className={`shop-edit__stat-value${warn ? ' shop-edit__stat-value--warn' : ''}`}>{value}</div>
  </div>
);

/**
 * 店铺商品编辑抽屉（D-768 / D-513 布局重构）。
 *
 * 结构：顶部「商品摘要条」（不随滚动消失，一眼看到款号/售价/库存/图片是否齐全）
 *      → 四个编号分区（图片 / 规格价格库存 / 详情页布局 / 上架说明）
 *      → 底部统一保存。
 */
const ListingEditDrawer: React.FC<Props> = ({
  open, loading, saving, row, skus, setSkus,
  cover, setCover, colorImages, setColorImages, remark, setRemark,
  listed, toggling, onToggleListing, onClose, onSave,
}) => {
  const colors = useMemo(() => {
    const seen: string[] = [];
    skus.forEach((s) => {
      if (s.color && !seen.includes(s.color)) seen.push(s.color);
    });
    return seen;
  }, [skus]);

  // 摘要指标：售价区间 / 可售库存合计 / 图片齐全度 —— 不用滚动就能判断"这个商品能不能上架"
  const priceRange = useMemo(() => {
    const prices = skus
      .map((s) => Number(s.salesPrice))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (prices.length === 0) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `¥${min.toFixed(2)}` : `¥${min.toFixed(2)} ~ ¥${max.toFixed(2)}`;
  }, [skus]);

  const totalStock = useMemo(
    () => skus.reduce((sum, s) => sum + (Number(s.stockQuantity) || 0), 0),
    [skus],
  );

  const coloredCount = useMemo(
    () => colors.filter((c) => !!colorImages[c]).length,
    [colors, colorImages],
  );

  const missingColorImages = colors.length > 0 && coloredCount < colors.length;

  // D-782：详情内容（轮播图/视频/品牌/卖点/FAQ/价格说明）
  // 打开抽屉时按款式拉一次；保存时随「保存」一起提交。
  const [content, setContent] = React.useState<ListingContent>({
    gallery: [], videoUrl: null, brand: null, sizeChart: null,
    points: [], faq: [], priceNote: null,
  });
  const styleId = row?.id ?? null;
  React.useEffect(() => {
    if (!open || !styleId) return;
    let cancelled = false;
    api
      .get<{ code: number; data: ListingContent }>(`/shop/admin/content/${styleId}`)
      .then((res) => {
        if (cancelled || res.code !== 200 || !res.data) return;
        setContent({
          gallery: res.data.gallery ?? [],
          videoUrl: res.data.videoUrl ?? null,
          brand: res.data.brand ?? null,
          sizeChart: res.data.sizeChart ?? null,
          points: res.data.points ?? [],
          faq: res.data.faq ?? [],
          priceNote: res.data.priceNote ?? null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, styleId]);

  const saveContent = React.useCallback(async () => {
    if (!styleId) return;
    await api.post(`/shop/admin/content/${styleId}`, content as unknown as Record<string, unknown>);
  }, [styleId, content]);

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      width="85%"
      title={row ? `店铺商品 · ${row.styleName || row.styleNo || ''}` : '店铺商品'}
      footer={
        <>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" loading={saving} onClick={() => { void saveContent().finally(() => onSave()); }} disabled={loading}>
            保存图片、价格与库存
          </Button>
        </>
      }
      footerExtra={<Text type="secondary">上下架开关即时生效；其余改动点「保存」后生效</Text>}
    >
      {loading ? (
        <div className="shop-listing__loading">
          <Spin />
          <Text type="secondary">加载商品详情…</Text>
        </div>
      ) : (
        <>
          {/* 顶部摘要条：不随滚动消失，随时知道自己在改哪个商品、还差什么 */}
          <div className="shop-edit__summary">
            <div className="shop-edit__summary-head">
              <span className="shop-edit__summary-name">{row?.styleName || '（未命名款）'}</span>
              <span className="shop-edit__summary-no">{row?.styleNo || '-'}</span>
              <Tag color={listed ? 'orange' : 'default'}>{listed ? '已上架' : '未上架'}</Tag>
            </div>
            <div className="shop-edit__summary-stats">
              <Stat label="店铺售价" value={priceRange ?? '未设置'} warn={!priceRange} />
              <Stat label="可售库存" value={totalStock} warn={totalStock <= 0} />
              <Stat label="主图" value={cover ? '已设置' : '未设置'} warn={!cover} />
              <Stat
                label="颜色图"
                value={colors.length === 0 ? '无颜色' : `${coloredCount}/${colors.length}`}
                warn={missingColorImages}
              />
              <Stat label="SKU" value={skus.length} />
            </div>
          </div>

          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Section
              index={1}
              icon={<PictureOutlined />}
              title="商品图片"
              desc="主图决定店铺列表卡片与详情页的默认大图；给每个颜色单独配图后，顾客在详情页切换颜色时会换成对应的图。"
            >
              <CoverColorImagesSection
                cover={cover}
                setCover={setCover}
                colorImages={colorImages}
                setColorImages={setColorImages}
                colors={colors}
              />
            </Section>

            <Section
              index={2}
              icon={<TagsOutlined />}
              title="规格与价格库存"
              desc="这里只调整 SKU 的售价与可售数量，不走出入库台账（会留一条操作日志）。正规的库存变动请走「仓库 → 入库 / 出库」。"
            >
              <SkuPriceStockSection skus={skus} setSkus={setSkus} />
            </Section>

            <Section
              index={3}
              icon={<FileTextOutlined />}
              title="详情内容"
              desc="轮播图、商品视频、品牌、核心卖点、常见问题、价格说明——顾客端详情页的内容都在这里填，可留空不填。"
            >
              <ListingContentSection content={content} setContent={setContent} />
            </Section>

            <Section
              index={4}
              icon={<LayoutOutlined />}
              title="详情页布局"
              desc="顾客端详情页按这里的顺序从上到下展示：勾选＝显示，用 ↑↓ 调整顺序；没有资料的模块会自动跳过。"
            >
              <LayoutEditorSection styleId={row?.id ?? null} />
            </Section>

            <Section
              index={5}
              icon={<ShopOutlined />}
              title="上架与商品说明"
              desc="上下架开关即时生效（不用点保存）；商品名取自「款式名称」，如需修改请去「款式资料」。"
            >
              <ListingInfoSection
                listed={listed}
                toggling={toggling}
                onToggleListing={onToggleListing}
                remark={remark}
                setRemark={setRemark}
              />
            </Section>
          </Space>
        </>
      )}
    </SideDrawer>
  );
};

export default ListingEditDrawer;
