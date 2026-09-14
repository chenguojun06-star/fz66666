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
    <div className="u-mb-16 u-p-12 u-br-8" style={{ background: 'var(--color-bg-subtle)' }}>
      <div className="u-d-flex u-gap-16 u-ai-start">
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
            <div className="u-br-8 u-d-flex u-ai-center u-jc-center u-fs-14" style={{ width: 96, height: 96, background: 'var(--color-bg-subtle)', color: 'var(--color-text-tertiary)' }}>
              暂无图片
            </div>
          )}
        </div>
        <div className="u-flex-1" style={{ minWidth: 0 }}>
          <Row gutter={[12, 8]}>
            <Col span={8}>
              <div className="u-fs-14" style={{ color: 'var(--neutral-text-secondary)' }}>款号</div>
              <div>{styleNo || '-'}</div>
            </Col>
            <Col span={8}>
              <div className="u-fs-14" style={{ color: 'var(--neutral-text-secondary)' }}>款式名称</div>
              <div>{styleName || '-'}</div>
            </Col>
            <Col span={8}>
              <div className="u-fs-14" style={{ color: 'var(--neutral-text-secondary)' }}>样衣完成时间</div>
              <div>{sampleCompletedTime || '-'}</div>
            </Col>
            <Col span={16}>
              <div className="u-fs-14 u-mb-4" style={{ color: 'var(--neutral-text-secondary)' }}>开发颜色 / 尺码</div>
              <div className="u-d-flex u-gap-8 u-fwrap-wrap">
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
