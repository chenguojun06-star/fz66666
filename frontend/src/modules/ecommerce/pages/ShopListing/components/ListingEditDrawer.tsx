import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Select, Space, Spin, Switch, Tag, Typography } from 'antd';
import {
  PictureOutlined,
  TagsOutlined,
  LayoutOutlined,
} from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import CoverColorImagesSection from './CoverColorImagesSection';
import SkuPriceStockSection from './SkuPriceStockSection';
import DetailModuleEditor from './DetailModuleEditor';
import type { ModuleContentCtx } from './DetailModuleContent';
import shopAdminApi from '@/services/shop/shopApi';
import type { ShopCategoryOption } from '@/services/shop/shopApi';
import api from '@/utils/api';
import { unwrap } from '../unwrap';
import type { EditableSku, ListingContent, ListingRow } from '../types';

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
  fabric: string;
  setFabric: (v: string) => void;
  wash: string;
  setWash: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  listed: boolean;
  toggling: boolean;
  onToggleListing: (listed: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}

/** 抽屉分区：统一「序号 + 图标 + 标题 + 一句话说明 + 内容」 */
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

const Stat: React.FC<{ label: string; value: React.ReactNode; warn?: boolean }> = ({ label, value, warn }) => (
  <div className="shop-edit__stat">
    <div className="shop-edit__stat-label">{label}</div>
    <div className={`shop-edit__stat-value${warn ? ' shop-edit__stat-value--warn' : ''}`}>{value}</div>
  </div>
);

/**
 * 店铺商品编辑抽屉（D-785：模块与内容合一）。
 *
 * <p>用户要的是「每一个开关对应的模块，全部和要填的内容放在一起」，
 * 不要再出现「开关在这个区、内容在那个区」。所以现在只有三块：
 * <ol>
 *   <li>① 主图（列表封面 + 合规体检）</li>
 *   <li>② 规格与价格库存（SKU 表格，太重，不适合塞进模块卡片）</li>
 *   <li>③ 详情页模块 —— 开关 / 上下顺序 / 这一块要填的内容，全在一起</li>
 * </ol>
 * 上下架开关提到常驻摘要条：它是整个抽屉最关键的开关，不该藏在最下面。
 */
const ListingEditDrawer: React.FC<Props> = ({
  open, loading, saving, row, skus, setSkus,
  cover, setCover, colorImages, setColorImages, remark, setRemark,
  fabric, setFabric, wash, setWash, desc, setDesc, category, setCategory,
  listed, toggling, onToggleListing, onClose, onSave,
}) => {
  const colors = useMemo(() => {
    const seen: string[] = [];
    skus.forEach((s) => {
      if (s.color && !seen.includes(s.color)) seen.push(s.color);
    });
    return seen;
  }, [skus]);

  const priceRange = useMemo(() => {
    const prices = skus.map((s) => Number(s.salesPrice)).filter((n) => Number.isFinite(n) && n > 0);
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

  // 详情内容（轮播图/视频/品牌/卖点/FAQ/价格说明/尺寸表）
  const [content, setContent] = useState<ListingContent>({
    gallery: [], videoUrl: null, brand: null, sizeChart: null,
    points: [], faq: [], priceNote: null,
  });
  const styleId = row?.id ?? null;

  useEffect(() => {
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

  // 类目词表：随「商品参数」模块一起用，拿到就下拉；拿不到只显示当前值，不让下拉变空
  const [catOptions, setCatOptions] = useState<ShopCategoryOption[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = unwrap<ShopCategoryOption[]>(await shopAdminApi.categoryOptions()) ?? [];
        if (alive) setCatOptions(Array.isArray(list) ? list : []);
      } catch {
        if (alive) setCatOptions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const categorySelectOptions = useMemo(() => {
    const opts = catOptions.map((o) => ({ value: o.category, label: o.name }));
    if (category && !opts.some((o) => o.value === category)) {
      opts.unshift({ value: category, label: category });
    }
    return opts;
  }, [catOptions, category]);

  const ctx: ModuleContentCtx = {
    content,
    setContent,
    category,
    setCategory,
    categoryOptions: categorySelectOptions,
    fabric,
    setFabric,
    wash,
    setWash,
    desc,
    setDesc,
    remark,
    setRemark,
    colors,
    colorImages,
    setColorImages,
    styleName: row?.styleName || '',
    styleNo: row?.styleNo || '',
  };

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
          <Button
            type="primary"
            loading={saving}
            onClick={async () => {
              // 内容与款式字段必须都成功才算保存成功：任一失败就抛出，
              // 绝不能「内容保存失败但照样提示已保存」。
              await saveContent();
              onSave();
            }}
            disabled={loading}
          >
            保存内容
          </Button>
        </>
      }
      footerExtra={
        <Text type="secondary">
          上下架开关、模块开关与顺序即时生效；文字与图片改动点「保存内容」后生效
        </Text>
      }
    >
      {loading ? (
        <div className="shop-listing__loading">
          <Spin />
          <Text type="secondary">加载商品详情…</Text>
        </div>
      ) : (
        <>
          {/* 摘要条：最关键的信息 + 最关键的开关，都不随滚动消失 */}
          <div className="shop-edit__summary">
            <div className="shop-edit__summary-head">
              <span className="shop-edit__summary-name">{row?.styleName || '（未命名款）'}</span>
              <span className="shop-edit__summary-no">{row?.styleNo || '-'}</span>
              <Space size={8} align="center">
                <Switch
                  checked={listed}
                  loading={toggling}
                  checkedChildren="已上架"
                  unCheckedChildren="未上架"
                  onChange={onToggleListing}
                />
                <Tag color={listed ? 'orange' : 'default'}>
                  {listed ? '顾客可见并可下单' : '顾客看不到该商品'}
                </Tag>
              </Space>
            </div>
            <div className="shop-edit__summary-stats">
              <Stat label="店铺售价" value={priceRange ?? '未设置'} warn={!priceRange} />
              <Stat label="可售库存" value={totalStock} warn={totalStock <= 0} />
              <Stat label="主图" value={cover ? '已设置' : '未设置'} warn={!cover} />
              <Stat
                label="颜色图"
                value={colors.length === 0 ? '无颜色' : `${coloredCount}/${colors.length}`}
                warn={colors.length > 0 && coloredCount < colors.length}
              />
              <Stat label="SKU" value={skus.length} />
            </div>
          </div>

          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Section
              index={1}
              icon={<PictureOutlined />}
              title="主图"
              desc="店铺列表卡片和详情页兜底大图都用它。合规体检只提示、不拦截上传。各颜色的大图在下面「详情页模块 → 颜色选择」里配。"
            >
              <CoverColorImagesSection
                cover={cover}
                setCover={setCover}
                colorImages={colorImages}
                setColorImages={setColorImages}
                colors={colors}
                onlyCover
              />
            </Section>

            <Section
              index={2}
              icon={<TagsOutlined />}
              title="规格与价格库存"
              desc="这里调整 SKU 的售价与可售数量，不走出入库台账。库存变动请走「仓库 → 入库 / 出库」。"
            >
              <SkuPriceStockSection skus={skus} setSkus={setSkus} />
            </Section>

            <Section
              index={3}
              icon={<LayoutOutlined />}
              title="详情页模块"
              desc="顾客端详情页由下面这些模块组成。每一块都把「开关、上下顺序、这里要填什么内容」放在一起，勾选＝显示，点开关即时生效；没有内容的模块会自动跳过。"
            >
              <DetailModuleEditor styleId={row?.id ?? null} ctx={ctx} />
            </Section>
          </Space>

          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="图片不做上传限制"
            description="主图的合规体检只是提示：告诉你这样传平台可能不给推荐，但不会拦住上传，也不会阻止上架。"
          />
        </>
      )}
    </SideDrawer>
  );
};

export default ListingEditDrawer;
