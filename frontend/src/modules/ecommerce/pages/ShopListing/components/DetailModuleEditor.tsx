import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Space, Spin, Switch, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, ExclamationCircleOutlined, HolderOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/antdStatic';
import shopAdminApi from '@/services/shop/shopApi';
import { MODULE_CONTENT, type ModuleContentCtx } from './DetailModuleContent';

const { Text } = Typography;

type ModuleItem = {
  moduleKey: string;
  defaultTitle: string;
  canHide: boolean;
  enabled: boolean;
};

/**
 * 每个模块的说明：顾客端看到什么 + 内容从哪来。
 *
 * <p>用户要的是「开关和内容在一起，别人一看就知道对应的是什么」。
 * 所以每个模块都必须有一句**大白话**说明，且没有输入框的模块要说清内容来源 ——
 * 否则商家看到「尺码选择」没有输入框，只会以为系统坏了。
 */
const MODULE_META: Record<string, { desc: string; source?: string }> = {
  gallery: { desc: '顾客端顶部大图轮播。没设主图时才用这里配的图；设了主图就以主图为准。' },
  price: {
    desc: '顾客端展示售价、库存与配送。',
    source: '来自「规格与价格库存」里每个 SKU 的售价与可售数量，实时算出来，不用在这里填。',
  },
  title: { desc: '商品名、货号与品牌。商品名取自款式名称，货号系统生成，这里只填品牌。' },
  promise: {
    desc: '包邮、7 天无理由退换这类承诺标签。',
    source: '来自「店铺设置 → 服务承诺」，全店统一配置；不想对这件商品显示，关掉开关即可。',
  },
  points: { desc: '价格下方的卖点清单，用来给顾客「为什么值得买」的理由。' },
  color: { desc: '顾客点颜色时切换的大图。颜色名来自 SKU，这里只配图。' },
  size: { desc: '尺码按钮。', source: '尺码名来自 SKU，不用在这里填。' },
  quantity: { desc: '购买数量的加减。', source: '固定模块，由顾客自己加减。' },
  params: { desc: '品类、上市季节、面料成分的参数表。' },
  priceNote: { desc: '价格相关的补充说明，例如是否含运费、偏远地区怎么补。' },
  detail: { desc: '尺寸表 + 款式详情图文 + 商品说明。' },
  faq: { desc: '常见问题折叠问答，用来提前回答顾客的犹豫点。' },
  reviews: {
    desc: '已发货顾客的评价。',
    source: '评价来自已发货订单，顾客登录后自动出现，商家不需要填任何东西。',
  },
  wash: { desc: '洗涤保养说明。' },
  recommend: {
    desc: '按顾客浏览偏好推荐的同品类商品。',
    source: '系统按「同品类 + 同季 + 浏览偏好 + 热度」自动算，不需要填内容；没有可推的商品时整块自动隐藏。',
  },
  purchase: { desc: '底部固定的「加入购物车 / 立即购买」。', source: '固定模块。' },
};

/**
 * 详情页模块编辑器：开关 + 上下顺序 + 内容**合一**（D-785）。
 *
 * <p>此前开关在「详情页布局」、内容在「详情内容」「上架与商品说明」三个区，
 * 商家对不上哪个开关管哪段文字（用户原话：「不要开关在这里、内容在那边」）。
 * 现在一个模块一张卡：标题行是开关与排序，展开就是这一块的内容。
 *
 * <p>开关与排序**即时保存**（与上下架开关同一套心智），失败自动回滚并提示，
 * 不再额外挂一个「保存布局」按钮让人以为还有另一处要保存。
 */
export function DetailModuleEditor({
  styleId,
  ctx,
}: {
  styleId: number | null;
  ctx: ModuleContentCtx;
}) {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [defaultOrder, setDefaultOrder] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const [defs, layout] = await Promise.all([
        shopAdminApi.layoutModules(),
        shopAdminApi.getStyleLayout(styleId),
      ]);
      // shopApi 已在 service 层解包，这里拿到的是裸数组；保留 Array.isArray 兜底
      const defArr: Array<{ moduleKey: string; defaultTitle: string; canHide: boolean }> =
        Array.isArray(defs) ? defs : [];
      const layArr: Array<{ moduleKey: string; enabled: number; sortOrder: number }> =
        Array.isArray(layout) ? layout : [];
      const layMap = new Map(layArr.map((l) => [l.moduleKey, l]));
      const merged: ModuleItem[] = defArr.map((d) => ({
        moduleKey: d.moduleKey,
        defaultTitle: d.defaultTitle,
        canHide: d.canHide,
        enabled: layMap.get(d.moduleKey)?.enabled !== 0,
      }));
      merged.sort(
        (a, b) =>
          (layMap.get(a.moduleKey)?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (layMap.get(b.moduleKey)?.sortOrder ?? Number.MAX_SAFE_INTEGER),
      );
      setModules(merged);
      // 接口返回的模块定义本身就是后端默认顺序（DEFAULT_MODULES），
      // 存一份用于「恢复默认」，别让商家把顺序改乱后回不去。
      setDefaultOrder(defArr.map((d) => ({
        moduleKey: d.moduleKey,
        defaultTitle: d.defaultTitle,
        canHide: d.canHide,
        enabled: true,
      })));
      // D-800：**默认全部收起**，只展开第一个有内容输入框的模块。
      //
      // 【为什么改】原来这行是「有内容输入框的模块全部展开」：
      //   merged.filter((m) => !!MODULE_CONTENT[m.moduleKey]).map((m) => m.moduleKey)
      // 16 个模块里 9 个有编辑框 → 一次展开 9 个输入区叠加，
      // 页面从 1 屏拉成十几屏，运营自己都找不到要看的东西。
      // 这也是全项目唯一违反 Shopify 官方设计规范「默认收起」的地方
      // （官方规范：Use tabs for secondary navigation / Tabs should never wrap）。
      //
      // 【现在】默认只开第一个，让商家看到「开关管的是哪段内容」的范式，
      // 其余按需点开。展开状态仍由 openKeys 记住，不影响已展开的用户。
    } catch (e) {
      message.error(e instanceof Error ? e.message : '模块布局加载失败');
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 即时保存布局；失败回滚到服务端状态 */
  const persist = useCallback(
    async (next: ModuleItem[]) => {
      if (!styleId) return;
      const prev = modules;
      setModules(next);
      setSavingKey('__saving__');
      try {
        await shopAdminApi.saveStyleLayout(styleId, {
          modules: next.map((m, i) => ({
            moduleKey: m.moduleKey,
            enabled: m.enabled ? 1 : 0,
            sortOrder: i,
          })),
        });
      } catch (e) {
        setModules(prev);
        message.error(e instanceof Error ? e.message : '保存失败，已恢复原设置');
      } finally {
        setSavingKey(null);
      }
    },
    [styleId, modules],
  );

  const move = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= modules.length) return;
    const next = [...modules];
    [next[idx], next[target]] = [next[target], next[idx]];
    void persist(next);
  };

  const toggle = (key: string, on: boolean) => {
    const target = modules.find((m) => m.moduleKey === key);
    if (target && !target.canHide && !on) {
      message.warning(`「${target.defaultTitle}」是必需信息，隐藏后顾客看不到商品`);
      return;
    }
    void persist(modules.map((m) => (m.moduleKey === key ? { ...m, enabled: on } : m)));
  };

  const filledHint = useMemo(() => {
    const map: Record<string, string | undefined> = {
      gallery: `${ctx.content.gallery.length} 张轮播图`,
      points: `${ctx.content.points.length} 条卖点`,
      faq: `${ctx.content.faq.length} 组问答`,
      color: `${ctx.colors.filter((c) => !!ctx.colorImages[c]).length}/${ctx.colors.length} 色配图`,
      params: ctx.category ? '分类已选' : '未选分类',
      priceNote: ctx.content.priceNote ? '已填' : '未填',
      wash: ctx.wash ? '已填' : '未填',
      title: ctx.content.brand ? ctx.content.brand : '未填品牌',
      detail: ctx.desc ? '已填详情' : '未填详情',
    };
    return map;
  }, [ctx]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <Spin size="small" />
      </div>
    );
  }

  const items = modules.map((m, idx) => {
    const Editor = MODULE_CONTENT[m.moduleKey];
    const meta = MODULE_META[m.moduleKey];
    const hint = filledHint[m.moduleKey];
    return {
      key: m.moduleKey,
      label: (
        <div className="shop-module__head">
          <HolderOutlined className="shop-module__grip" />
          {/* D-800：收起态只显示「模块名 + 状态」，不再每行都带一句说明。
              16 个模块各带说明会把这块撑出一屏；说明文字改为展开后再显示。 */}
          <Space size={6} wrap style={{ flex: 1, minWidth: 0 }}>
            <Text strong>{m.defaultTitle}</Text>
            {meta?.desc || meta?.source ? (
              <Tooltip
                trigger={['hover', 'click']}
                title={
                  <div style={{ maxWidth: 320, lineHeight: 1.7 }}>
                    {meta?.desc ? <div>{meta.desc}</div> : null}
                    {meta?.source ? <div>{meta.source}</div> : null}
                  </div>
                }
              >
                <ExclamationCircleOutlined className="shop-module__hint" aria-label="说明" />
              </Tooltip>
            ) : null}
            {!m.canHide ? <Tag color="blue">必需</Tag> : null}
            {Editor ? (
              <Tag color={hint && !hint.startsWith('未') && !hint.includes('0/') ? 'green' : 'default'}>
                {hint}
              </Tag>
            ) : null}
          </Space>
        </div>
      ),
      extra: (
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            type="text"
            icon={<ArrowUpOutlined />}
            disabled={idx === 0}
            onClick={() => move(idx, -1)}
            aria-label="上移"
          />
          <Button
            size="small"
            type="text"
            icon={<ArrowDownOutlined />}
            disabled={idx === modules.length - 1}
            onClick={() => move(idx, 1)}
            aria-label="下移"
          />
          <Switch
            size="small"
            checked={m.enabled}
            loading={savingKey === m.moduleKey}
            onChange={(v) => toggle(m.moduleKey, v)}
          />
        </Space>
      ),
    };
  });

  return (
    <div className="shop-edit__block">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button
          size="small"
          disabled={loading || savingKey !== null}
          onClick={() => {
            const target = defaultOrder.length ? defaultOrder : modules;
            void persist(target);
            message.success('已恢复为默认顺序');
          }}
        >
          恢复默认顺序
        </Button>
      </div>
      {/* D-800：取消折叠，全部平铺。
          用户明确要求「不要折叠了，就是标题与内容编辑区，工工整整的那种」。
          Collapse 每行都要点开才能看到内容，改一次东西要点两次；
          平铺后每个模块就是「标题行 + 内容区」，从上到下顺序改、顺序看。 */}
      <div className="shop-module-list">
        {items.map((it) => {
          const m = modules.find((x) => x.moduleKey === it.key);
          const Editor = m ? MODULE_CONTENT[m.moduleKey] : null;
          return (
            <div className="shop-module-item" key={it.key}>
              <div className="shop-module-item-head">
                <span className="shop-module-item-name">{it.label}</span>
                <span className="shop-module-item-extra">{it.extra}</span>
              </div>
              {Editor ? (
                <div className="shop-module-item-body">
                  <Editor ctx={ctx} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DetailModuleEditor;
