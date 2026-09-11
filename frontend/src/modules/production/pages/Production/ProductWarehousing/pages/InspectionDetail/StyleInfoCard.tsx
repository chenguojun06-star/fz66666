import React from 'react';
import { Card, Descriptions } from 'antd';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import type { QualityBriefingData } from './types';

interface StyleInfoCardProps {
  order: QualityBriefingData['order'];
  style: QualityBriefingData['style'];
}

const StyleInfoCard: React.FC<StyleInfoCardProps> = ({ order, style }) => {
  // D-360j：款式图用 StyleCoverThumb——封面字段为空时按款号自动兜底拉图，保证弹窗顶部款式图一定显示
  const coverSrc = style?.cover || (order as any)?.styleCover || (style as any)?.styleCover || undefined;
  return (
    <Card title="款式信息">
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <StyleCoverThumb
          src={coverSrc}
          styleId={(order as any)?.styleId}
          styleNo={order.styleNo}
          color={(order as any)?.color}
          size={220}
          borderRadius={8}
        />
      </div>
      <Descriptions column={1}>
        <Descriptions.Item label="款号">{order.styleNo}</Descriptions.Item>
        <Descriptions.Item label="款名">{order.styleName}</Descriptions.Item>
        <Descriptions.Item label="订单数量">{order.orderQuantity}</Descriptions.Item>
        <Descriptions.Item label="工厂">{order.factoryName || '-'}</Descriptions.Item>
        <Descriptions.Item label="跟单员">{order.merchandiser || '-'}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default StyleInfoCard;
