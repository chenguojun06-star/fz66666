import React from 'react';
import { Card, Descriptions, Image } from 'antd';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { QualityBriefingData } from './types';

interface StyleInfoCardProps {
  order: QualityBriefingData['order'];
  style: QualityBriefingData['style'];
}

const StyleInfoCard: React.FC<StyleInfoCardProps> = ({ order, style }) => {
  return (
    <Card title="款式信息">
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        {(style?.cover || order?.styleCover) ? (
          <Image src={getFullAuthedFileUrl(style?.cover || order?.styleCover)} alt={order.styleName}
            width={200} height={240} style={{ objectFit: 'cover', borderRadius: 8 }}
            fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNjY2MiIGZvbnQtc2l6ZT0iMTQiPuaXoOWbvueJhzwvdGV4dD48L3N2Zz4=" />
        ) : (
          <div style={{ width: 200, height: 240, background: 'var(--color-bg-subtle)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', margin: '0 auto' }}>无图片</div>
        )}
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
