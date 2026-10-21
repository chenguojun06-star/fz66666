import React, { useEffect, useMemo, useState } from 'react';
import { Button, Space, Spin, Switch, Tag, Tooltip, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
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
  /** D-800：主图组（最多 5 张，第 1 张与 cover 同步） */
  coverGroup: string[];
  setCoverGroup: React.Dispatch<React.SetStateAction<string[]>>;
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
  title: React.ReactNode;
  desc?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, desc, children }) => (
  <section className="shop-edit__block">
    <h3 className="shop-edit__block-heading">
      {title}
      {desc ? (
        <Tooltip
          trigger={['hover', 'click']}
          title={<div style={{ maxWidth: 340, lineHeight: 1.7 }}>{desc}</div>}
        >
          <ExclamationCircleOutlined className="shop-edit__inline-hint" aria-label="说明" />
        </Tooltip>
      ) : null}
    </h3>
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
  cover, setCover, coverGroup, setCoverGroup, colorImages, setColorImages, remark, setRemark,
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
        const list = await shopAdminApi.categoryOptions();
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
        const cfg = await shopAdminApi.getConfig();
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

  /**
   * D-813：清单项必须检查**顾客端真实能看到的内容**。
   *
   * <p>此前「详情描述」检查的是款式描述文本 desc，而顾客端详情页渲染的是
   * content.blocks（详情长图内容块）。两者毫无关系 ——
   * 结果是「详情页一张图都没有」的款式，只要填了描述文本，
   * 清单就显示「详情描述 ✓」。这是 D-781 同款问题：**提示是假的**。
   * 线上 11 个已上架款里有 9 个详情页接近空白，正是这么来的。
   */
  const detailBlockCount = (content.blocks ?? []).length;
  const coverGroupCount = (row?.coverGroup ?? []).length;

  const setupSteps = useMemo(() => {
    const pricedCount = skus.filter((s) => s.salesPrice != null && Number(s.salesPrice) > 0).length;
    return [
      {
        key: 'cover',
        label: '主图已上传',
        // D-813：设了 5 张主图组才算达标 —— 只有 1 张时顶部轮播会显得很空，
        // 而主图组是淘宝/拼多多提升点击率的第一要素
        done: coverGroupCount >= 5 || !!cover,
        anchor: 'cover',
        action: coverGroupCount >= 5
          ? `${coverGroupCount} 张主图`
          : cover
            ? `只有 1 张主图，建议补到 5 张`
            : '待上传',
      },
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
  }, [cover, coverGroupCount, skus, totalStock, row?.styleName, setupIssues]);

  const setupOptional = useMemo(() => [
    {
      key: 'colorimg', label: '各颜色大图',
      done: colors.length > 0 && coloredCount >= colors.length,
      action: colors.length === 0 ? '未配置颜色' : `${coloredCount}/${colors.length}`,
    },
    {
      key: 'detail',
      label: '详情长图（图+文）',
      // 检查顾客端真正渲染的详情块，不是款式描述文本
      done: detailBlockCount > 0,
      action: detailBlockCount > 0 ? `${detailBlockCount} 块` : '详情页现在没有图',
    },
    {
      key: 'sizechart',
      label: '手工尺码表（腰围/臀围/裤长）',
      // 自动矩阵表只是「尺码×颜色→价格」，不是量体表；没配要说清楚，不能显示成已配
      done: !!(content.sizeChart ?? '').trim(),
      action: (content.sizeChart ?? '').trim() ? '已录入' : '当前是 SKU 矩阵表，不是量体数据',
    },
    { key: 'fabric', label: '面料成分', done: !!(fabric || '').trim(), action: '降低退货率' },
  ], [colors.length, coloredCount, detailBlockCount, content.sizeChart, fabric]);

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
    // D-812：尺码表行名直接取自真实 SKU，运营不用重打尺码名
    sizes: Array.from(new Set(skus.map((s) => s.size).filter(Boolean))),
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
      width="96%"
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
        <Text type="secondary" style={{ fontSize: 12 }}>
          开关键即时生效；文字与图片改动需点「保存内容」
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
              不另写一套渲染器（否则会出现预览好看、上线不一样）。
              D-831：左列改用普通 flex 列（antd Space 的 item 不保证撑满），
              预览列定宽 380 —— 消除编辑区与预览之间的大片空白。 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="上架检查" desc="下面这些填齐了顾客才能正常看到并下单。">
              <div className="shop-edit__form">
                <ListingSetupChecklist
                  required={setupSteps}
                  optional={setupOptional}
                  blockIssues={setupIssues}
                  listed={listed}
                />
              </div>
            </Section>

            <Section
              title="主图"
              desc="店铺列表卡片和详情页兜底大图都用它。各颜色的大图在下面「详情页内容 → 颜色选择」里配。图片不做上传限制：合规体检只是提示，不会拦住上传，也不会阻止上架。"
            >
              <div className="shop-edit__form">
                <CoverColorImagesSection
                  cover={cover}
                  setCover={setCover}
                  coverList={coverGroup}
                  setCoverList={setCoverGroup}
                  colorImages={colorImages}
                  setColorImages={setColorImages}
                  colors={colors}
                  onlyCover
                />
              </div>
            </Section>

            <Section
              title="规格、价格与库存"
              desc="这里调整 SKU 的售价与可售数量，不走出入库台账。库存变动请走「仓库 → 入库 / 出库」。"
            >
              <div className="shop-edit__form">
                <SkuPriceStockSection skus={skus} setSkus={setSkus} />
              </div>
            </Section>

            <Section
              title="详情页内容"
              desc="开关、顺序、内容都在这一块里。顾客端详情页按这里的顺序从上到下展示；勾选＝显示，点开关即时生效。没有内容的模块会自动跳过，所以留空也不会出现空白标题。"
            >
              <div className="shop-edit__form">
                <DetailModuleEditor styleId={row?.id ?? null} ctx={ctx} />
              </div>
            </Section>
            </div>

            {/* 右侧：顾客端实时预览（窄屏时自动落到下方） */}
            <div
              style={{
                flex: '0 0 380px',
                position: 'sticky',
                top: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <CustomerPreview
                slug={shopSlug}
                styleId={row?.id ?? null}
                refreshKey={previewKey}
                width={352}
                height={640}
              />
            </div>
          </div>

        </>
      )}
    </SideDrawer>
  );
};

export default ListingEditDrawer;
