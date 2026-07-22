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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {snapshots.map((s) => {
        const typeInfo = snapshotTypeMap[s.snapshotType] || { text: s.snapshotType, color: 'default' };
        const beforeUrls = parseUrls(s.beforeUrls);
        const afterUrls = parseUrls(s.afterUrls);
        return (
          <div key={s.id} style={{ padding: 12, border: '1px solid var(--color-border-light)', borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>
                <Tag color={typeInfo.color}>{typeInfo.text}</Tag>
                <span style={{ marginLeft: 8 }}>{s.operatorName || '系统'}</span>
              </span>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                {s.createTime ? s.createTime.replace('T', ' ').substring(0, 16) : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {beforeUrls.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>变更前</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {beforeUrls.map((url, idx) => (
                      <Image key={idx} src={getFullAuthedFileUrl(url)} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                    ))}
                  </div>
                </div>
              )}
              {afterUrls.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>变更后</div>
                  <div style={{ display: 'flex', gap: 4 }}>
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
