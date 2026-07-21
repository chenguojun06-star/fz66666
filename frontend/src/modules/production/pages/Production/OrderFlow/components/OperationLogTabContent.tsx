import React from 'react';
import { Button, Empty, Input, Timeline, Image } from 'antd';
import { HistoryOutlined, UserOutlined } from '@ant-design/icons';
import { displayDate } from '@/utils/display';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { OrderRemark } from '@/services/system/remarkApi';

interface OperationLogTabContentProps {
  remarks: OrderRemark[];
  remarksLoading: boolean;
  newRemark: string;
  setNewRemark: (v: string) => void;
  handleAddRemark: () => void;
}

const SYSTEM_ACTIONS = ['开始编辑', '完成编辑', '取消编辑', '从BOM生成采购', '录入采购'];

const OperationLogTabContent: React.FC<OperationLogTabContentProps> = ({
  remarks,
  remarksLoading,
  newRemark,
  setNewRemark,
  handleAddRemark,
}) => {
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Input.TextArea
          value={newRemark}
          onChange={(e) => setNewRemark(e.target.value)}
          placeholder="添加备注..."
          rows={2}
          maxLength={500}
          showCount
          style={{ flex: 1 }}
        />
        <Button type="primary" onClick={handleAddRemark} disabled={!newRemark.trim()}>
          添加
        </Button>
      </div>
      {remarksLoading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>加载中...</div>
      ) : remarks.length > 0 ? (
        <Timeline
          items={remarks.map((r) => {
            const isSystem = r.authorRole && SYSTEM_ACTIONS.includes(r.authorRole);
            const images = r.imageUrls
              ? (() => {
                  try {
                    return JSON.parse(r.imageUrls);
                  } catch {
                    return [];
                  }
                })()
              : [];
            return {
              color: isSystem ? 'blue' : 'green',
              content: (
                <div key={r.id} style={{ paddingBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {isSystem && <HistoryOutlined style={{ color: 'var(--color-primary)' }} />}
                    <strong>{r.authorRole || r.authorName || '系统'}</strong>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      {r.authorName && (
                        <>
                          <UserOutlined /> {r.authorName}
                        </>
                      )}
                    </span>
                    <span style={{ color: 'var(--color-text-quaternary)', fontSize: 12 }}>
                      {displayDate(r.createTime, 'datetime')}
                    </span>
                  </div>
                  <div
                    style={{
                      marginLeft: isSystem ? 20 : 0,
                      color: isSystem ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                    }}
                  >
                    {r.content}
                  </div>
                  {images.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <Image.PreviewGroup>
                        {images.map((url: string, idx: number) => (
                          <Image
                            key={idx}
                            src={getFullAuthedFileUrl(url)}
                            style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                            preview={{ cover: '预览' }}
                          />
                        ))}
                      </Image.PreviewGroup>
                    </div>
                  )}
                </div>
              ),
            };
          })}
        />
      ) : (
        <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  );
};

export default OperationLogTabContent;
