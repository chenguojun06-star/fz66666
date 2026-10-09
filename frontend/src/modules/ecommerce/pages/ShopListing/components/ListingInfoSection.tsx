import React from 'react';
import { Input, Space, Switch, Tag, Typography } from 'antd';

const { Text } = Typography;

interface Props {
  listed: boolean;
  /** 上下架即时生效（不进「保存」，改完顾客端立刻变） */
  onToggleListing: (listed: boolean) => void;
  toggling: boolean;
  remark: string;
  setRemark: (v: string) => void;
}

/**
 * 上架信息区（D-768）：店铺上下架开关（即时生效）+ 商品说明（随「保存」提交）。
 *
 * <p>D-513：本区归入抽屉的「④ 上架与商品说明」分区卡片，
 * 原先的「商品名取自款式名称」整块 Alert 已上提为分区副标题，避免长表单被色块切碎。
 */
const ListingInfoSection: React.FC<Props> = ({
  listed, onToggleListing, toggling, remark, setRemark,
}) => (
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

    <div className="shop-listing__block-title shop-listing__block-title--mt">商品说明</div>
    <Input.TextArea
      value={remark}
      onChange={(e) => setRemark(e.target.value)}
      placeholder="展示在店铺商品详情页，例如面料成分、版型说明、洗涤建议、发货时效"
      maxLength={500}
      showCount
      autoSize={{ minRows: 3, maxRows: 8 }}
    />
  </div>
);

export default ListingInfoSection;
