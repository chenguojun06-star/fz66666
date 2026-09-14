import React from 'react';
import { Empty, Tag, Image } from 'antd';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { parseUrls, snapshotTypeMap } from './utils';
import type { OrderImageSnapshot } from './utils';

interface ImageHistoryContentProps {
  snapshots: OrderImageSnapshot[];
}

const ImageHistoryContent: React.FC<ImageHistoryContentProps> = ({ snapshots }) => {
  if (snapshots.length === 0) {
    return <Empty description="暂无更新记录" />;
  }

  return (
    <div className="u-d-flex u-fd-column u-gap-12">
      {snapshots.map((s) => {
        const typeInfo = snapshotTypeMap[s.snapshotType] || { text: s.snapshotType, color: 'default' };
        const beforeUrls = parseUrls(s.beforeUrls);
        const afterUrls = parseUrls(s.afterUrls);
        return (
          <div key={s.id} className="u-p-12 u-br-6" style={{ border: '1px solid var(--color-border-light)' }}>
            <div className="u-d-flex u-jc-between u-mb-8">
              <span>
                <Tag color={typeInfo.color}>{typeInfo.text}</Tag>
                <span className="u-ml-8">{s.operatorName || '系统'}</span>
              </span>
              <span className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>
                {s.createTime ? s.createTime.replace('T', ' ').substring(0, 16) : ''}
              </span>
            </div>
            <div className="u-d-flex u-gap-16">
              {beforeUrls.length > 0 && (
                <div>
                  <div className="u-fs-14 u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}>变更前</div>
                  <div className="u-d-flex u-gap-4">
                    {beforeUrls.map((url, idx) => (
                      <Image key={idx} src={getFullAuthedFileUrl(url)} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                    ))}
                  </div>
                </div>
              )}
              {afterUrls.length > 0 && (
                <div>
                  <div className="u-fs-14 u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}>变更后</div>
                  <div className="u-d-flex u-gap-4">
                    {afterUrls.map((url, idx) => (
                      <Image key={idx} src={getFullAuthedFileUrl(url)} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ImageHistoryContent;
