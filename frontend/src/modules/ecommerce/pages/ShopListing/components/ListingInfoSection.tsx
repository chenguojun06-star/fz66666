import React from 'react';
import { Alert, Input, Select, Space, Switch, Tag, Typography } from 'antd';
import shopAdminApi from '@/services/shop/shopApi';
import type { ShopCategoryOption } from '@/services/shop/shopApi';
import { unwrap } from '../unwrap';
import { looksLikeProductionContent, PRODUCTION_CONTENT_HINT } from '../listingCompliance';

const { Text } = Typography;

interface Props {
  listed: boolean;
  /** 上下架即时生效（不进「保存」，改完顾客端立刻变） */
  onToggleListing: (listed: boolean) => void;
  toggling: boolean;
  remark: string;
  setRemark: (v: string) => void;
  /* 详情页三块内容：顾客端「商品参数 / 洗涤说明 / 款式详情」的数据源。
     此前这三块顾客端有渲染、上架页却没有入口，商家只能去「款式资料」那个
     给生产车间用的几十字段大表单里填 —— 用户反馈「根本就不能做每一个模块的信息」。 */
  fabric: string;
  setFabric: (v: string) => void;
  wash: string;
  setWash: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  /* 商品分类：库里是自由文本，老数据有 WOMAN/上衣/SKIRT 混着存。
     这里给同一份中文词表下拉，让新数据不再继续混。 */
  category: string;
  setCategory: (v: string) => void;
}

/**
 * 上架信息区（D-768）：店铺上下架开关（即时生效）+ 商品说明（随「保存」提交）。
 *
 * <p>D-513：本区归入抽屉的「④ 上架与商品说明」分区卡片，
 * 原先的「商品名取自款式名称」整块 Alert 已上提为分区副标题，避免长表单被色块切碎。
 */
const ListingInfoSection: React.FC<Props> = ({
  listed, onToggleListing, toggling, remark, setRemark,
  fabric, setFabric, wash, setWash, desc, setDesc, category, setCategory,
}) => {
  // D-781：边写边提示，别等保存后才发现顾客端看不到
  const isProcessContent = looksLikeProductionContent(remark);

  // 类目词表（一次性拉取；拿不到就只显示当前值，不让下拉变空）
  const [catOptions, setCatOptions] = React.useState<ShopCategoryOption[]>([]);
  React.useEffect(() => {
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

  // 当前值不在词表里时补一个选项：老数据里的自定义类目不能因为下拉没有就被抹掉
  const catSelectOptions = React.useMemo(() => {
    const opts = catOptions.map((o) => ({ value: o.category, label: o.name }));
    if (category && !opts.some((o) => o.value === category)) {
      opts.unshift({ value: category, label: category });
    }
    return opts;
  }, [catOptions, category]);
  return (
  <div className="shop-edit__block">
    <div className="shop-listing__block-title">店铺状态</div>
    <Space size={10} align="center">
      <Switch
        checked={listed}
        loading={toggling}
        checkedChildren="已上架"
        unCheckedChildren="未上架"
        onChange={onToggleListing}
      />
      <Tag color={listed ? 'orange' : 'default'}>{listed ? '顾客可见并可下单' : '顾客看不到该商品'}</Tag>
    </Space>
    <Text type="secondary" className="shop-listing__hint">
      开关即时生效（不需要点保存）
    </Text>

    <div className="shop-listing__block-title shop-listing__block-title--mt">商品分类</div>
    <Select
      style={{ width: '100%' }}
      value={category || undefined}
      onChange={(v) => setCategory(v ?? '')}
      options={catSelectOptions}
      placeholder="从词表里选（顾客端与平台商城按这个类目归类）"
      allowClear
      showSearch
      optionFilterProp="label"
    />
    <Text type="secondary" className="shop-listing__hint">
      统一用词表里的类目，平台商城首页的类目才不会中英混杂（老数据里的
      WOMAN / 上衣 会显示成同一个中文类目，不会被丢掉）。
    </Text>

    <div className="shop-listing__block-title shop-listing__block-title--mt">商品说明</div>
    <Input.TextArea
      value={remark}
      onChange={(e) => setRemark(e.target.value)}
      placeholder="展示在店铺商品详情页，例如面料成分、版型说明、洗涤建议、发货时效"
      maxLength={500}
      showCount
      autoSize={{ minRows: 3, maxRows: 8 }}
    />
    {isProcessContent ? (
      <Alert
        type="warning"
        showIcon
        style={{ marginTop: 8 }}
        message="这段会被顾客端隐藏"
        description={PRODUCTION_CONTENT_HINT}
      />
    ) : null}

    {/* 详情页三块内容：填了就显示，留空则整块跳过（不渲染空标题） */}
    <div className="shop-listing__block-title shop-listing__block-title--mt">
      详情页内容
      <Text type="secondary" className="shop-listing__hint" style={{ marginLeft: 8 }}>
        填了才显示，留空则顾客端整块跳过
      </Text>
    </div>

    <div className="shop-edit__field-label">面料成分</div>
    <Input.TextArea
      value={fabric}
      onChange={(e) => setFabric(e.target.value)}
      placeholder="如：97% 桑蚕丝；3% 氨纶。显示在顾客端「商品参数」"
      maxLength={500}
      showCount
      autoSize={{ minRows: 2, maxRows: 5 }}
    />
    <Text type="secondary" className="shop-listing__hint">
      若该款在「款式资料」里已按部位录了成分明细（如上装 / 里布），
      顾客端会优先显示那份明细，这里的整段文字只在明细为空时显示。
    </Text>

    <div className="shop-edit__field-label">洗涤说明</div>
    <Input.TextArea
      value={wash}
      onChange={(e) => setWash(e.target.value)}
      placeholder="如：不可漂白；40℃ 以下手洗。显示在顾客端「洗涤说明」"
      maxLength={500}
      showCount
      autoSize={{ minRows: 2, maxRows: 5 }}
    />

    <div className="shop-edit__field-label">款式详情（图文介绍）</div>
    <Input.TextArea
      value={desc}
      onChange={(e) => setDesc(e.target.value)}
      placeholder="顾客端「款式详情」正文。可直接粘贴带图片的图文（支持 HTML）"
      maxLength={20000}
      showCount
      autoSize={{ minRows: 4, maxRows: 12 }}
    />
  </div>
  );
};

export default ListingInfoSection;
