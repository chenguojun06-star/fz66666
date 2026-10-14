import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Space, Spin, Switch, Tag, Typography } from 'antd';
import SideDrawer from '@/components/common/SideDrawer';
import CustomerPreview from './CustomerPreview';
import ListingSetupChecklist from './ListingSetupChecklist';
import { diagnoseListingFromSummary } from '../listingCompliance';
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
/**
 * 表单分区（D-800 重做）
 *
 * <p>用户明确要求：「不要折叠了，就是标题与内容编辑区，工工整整的那种」。
 * 因此这里<b>不用 Card、不用编号圆点、不用图标、不用折叠</b>——
 * 就是一个标题、一行说明、内容，整齐平铺往下排。
 *
 * <p>之前的问题是把「标题」包在一层带边框+圆角+背景的 Card 里，
 * 里面再套 Stat 卡、检查清单、Tab、Collapse，**五层框嵌套**，
 * 内外圆角还不一致（外 12px / 内 6px），所以看着乱。
 * 现在去掉所有装饰，只靠留白和分隔线区分区块。
 */
const Section: React.FC<{
  title: string;
  desc?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, desc, children }) => (
  <section className="shop-edit__block">
    <h3 className="shop-edit__block-heading">{title}</h3>
    {desc ? <div className="shop-edit__block-note">{desc}</div> : null}
    {children}
  </section>
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

  // D-800：顾客端预览需要店铺 slug（门店页 URL 参数），随抽屉一起取一次。
  // 取不到不阻断编辑 —— 只是预览区显示空态，其余功能照常。
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      try {
        const cfg = unwrap<{ slug?: string }>(await shopAdminApi.getConfig());
        if (alive) setShopSlug(cfg?.slug ?? null);
      } catch {
        if (alive) setShopSlug(null);
      }
    })();
    return () => { alive = false; };
  }, [open]);

  // D-800：上架前检查清单数据源。
  // 必做项全部可由本地已有状态判定，不额外发请求；阻断项复用既有体检与违禁词库
  // （diagnoseListingFromSummary 已覆盖款号/标题/主图/售价/库存/违禁词）。
  const setupIssues = useMemo(
    () => diagnoseListingFromSummary({
      styleNo: row?.styleNo,
      styleName: row?.styleName,
      cover,
      minPrice: skus.reduce<number | null>(
        (acc, s) => (s.salesPrice == null ? acc : acc == null ? s.salesPrice : Math.min(acc, s.salesPrice)),
        null,
      ),
      maxPrice: skus.reduce<number | null>(
        (acc, s) => (s.salesPrice == null ? acc : acc == null ? s.salesPrice : Math.max(acc, s.salesPrice)),
        null,
      ),
      totalStock,
      skuCount: skus.length,
    }),
    [row?.styleNo, row?.styleName, cover, skus, totalStock],
  );

  const setupSteps = useMemo(() => {
    const pricedCount = skus.filter((s) => s.salesPrice != null && Number(s.salesPrice) > 0).length;
    return [
      { key: 'cover', label: '主图已上传', done: !!cover, anchor: 'cover', action: '待上传' },
      {
        key: 'price', label: '售价已设置',
        done: pricedCount > 0,
        anchor: 'sku',
        action: pricedCount > 0 ? `${pricedCount}/${skus.length} 个SKU已定价` : '顾客看不到价格',
      },
      {
        key: 'stock', label: '可售库存大于 0',
        done: totalStock > 0,
        anchor: 'sku',
        action: totalStock > 0 ? `共 ${totalStock} 件` : '售罄',
      },
      {
        key: 'title', label: '商品标题已填写',
        done: !!(row?.styleName || '').trim() && !setupIssues.some((i) => i.level === 'block' && i.field === '商品标题'),
        action: '标题是顾客搜索的入口',
      },
    ];
  }, [cover, skus, totalStock, row?.styleName, setupIssues]);

  const setupOptional = useMemo(() => [
    {
      key: 'colorimg', label: '各颜色大图',
      done: colors.length > 0 && coloredCount >= colors.length,
      action: colors.length === 0 ? '未配置颜色' : `${coloredCount}/${colors.length}`,
    },
    { key: 'detail', label: '详情描述', done: !!(desc || '').trim(), action: '提升转化率' },
    { key: 'fabric', label: '面料成分', done: !!(fabric || '').trim(), action: '降低退货率' },
  ], [colors.length, coloredCount, desc, fabric]);

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
              // D-800：保存后自动刷新右侧顾客端预览，让运营立刻看到改动效果，
              // 不用手动点「刷新」再去对照。
              setPreviewKey((k) => k + 1);
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

          {/* D-800：左编辑 / 右预览 分栏。
              预览直接 iframe 线上真实门店页，保证「预览即线上」，
              不另写一套渲染器（否则会出现预览好看、上线不一样）。 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Section title="上架检查" desc="下面这些填齐了顾客才能正常看到并下单。">
              <ListingSetupChecklist
                required={setupSteps}
                optional={setupOptional}
                blockIssues={setupIssues}
                listed={listed}
              />
            </Section>

            <Section
              title="主图"
              desc="店铺列表卡片和详情页兜底大图都用它。合规体检只提示、不拦截上传。各颜色的大图在下面「详情页内容 → 颜色选择」里配。"
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
              title="规格、价格与库存"
              desc="这里调整 SKU 的售价与可售数量，不走出入库台账。库存变动请走「仓库 → 入库 / 出库」。"
            >
              <SkuPriceStockSection skus={skus} setSkus={setSkus} />
            </Section>

            <Section
              title="详情页内容"
              desc="顾客端详情页由下面这些模块组成。勾选＝展示，开关点一下即生效。没有内容的模块会自动跳过。"
            >
              <DetailModuleEditor styleId={row?.id ?? null} ctx={ctx} />
            </Section>
            </Space>
            </div>

            {/* 右侧：顾客端实时预览（窄屏时自动落到下方） */}
            <div
              style={{
                flex: '0 0 auto',
                position: 'sticky',
                top: 8,
                maxWidth: 372,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <CustomerPreview
                slug={shopSlug}
                styleId={row?.id ?? null}
                refreshKey={previewKey}
              />
            </div>
          </div>

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
