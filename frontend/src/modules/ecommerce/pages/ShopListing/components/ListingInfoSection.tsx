import React from 'react';
import { Alert, Input, Space, Switch, Tag, Typography } from 'antd';

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
 */
const ListingInfoSection: React.FC<Props> = ({
  listed, onToggleListing, toggling, remark, setRemark,
}) => (
  <div className="shop-listing__section">
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

    <Alert
      type="info"
      showIcon
      className="shop-listing__alert"
      message="商品名取自「款式名称」"
      description="店铺里显示的商品名就是款式的款式名称，如需修改请去「款式资料」。"
    />
  </div>
);

export default ListingInfoSection;