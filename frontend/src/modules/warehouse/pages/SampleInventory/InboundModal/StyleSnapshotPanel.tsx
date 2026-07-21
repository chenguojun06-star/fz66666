import React from 'react';
import { Row, Col, Image, Tag } from 'antd';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { StyleSnapshot } from './types';

interface StyleSnapshotPanelProps {
  snapshot: StyleSnapshot;
}

const StyleSnapshotPanel: React.FC<StyleSnapshotPanelProps> = ({ snapshot }) => {
  const { styleNo, styleName, sampleCompletedTime, cover, colors, sizes } = snapshot;
  return (
    <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: 'var(--color-bg-subtle)' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 96, minWidth: 96 }}>
          {cover ? (
            <Image
              src={getFullAuthedFileUrl(cover)}
              alt={styleName || styleNo || '样衣'}
              width={96}
              height={96}
              style={{ objectFit: 'cover', borderRadius: 8 }}
            />
          ) : (
            <div style={{ width: 96, height: 96, borderRadius: 8, background: '#f3f4f6', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
              暂无图片
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Row gutter={[12, 8]}>
            <Col span={8}>
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 14 }}>款号</div>
              <div>{styleNo || '-'}</div>
            </Col>
            <Col span={8}>
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 14 }}>款式名称</div>
              <div>{styleName || '-'}</div>
            </Col>
            <Col span={8}>
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 14 }}>样衣完成时间</div>
              <div>{sampleCompletedTime || '-'}</div>
            </Col>
            <Col span={16}>
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 14, marginBottom: 4 }}>开发颜色 / 尺码</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(colors.length ? colors : ['无颜色配置']).map((item) => (
                  <Tag key={`color-${item}`}>{item}</Tag>
                ))}
                {(sizes.length ? sizes : ['无尺码配置']).map((item) => (
                  <Tag key={`size-${item}`} color="blue">{item}</Tag>
                ))}
              </div>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
};

export default StyleSnapshotPanel;
