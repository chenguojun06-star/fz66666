import React, { useState, useEffect } from 'react';
import { Card, Tabs, Spin, message } from 'antd';
import type { StyleAttachment } from '@/types/style';
import StyleAttachmentTab from '@/modules/basic/pages/StyleInfo/components/StyleAttachmentTab';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';
import api from '@/utils/api';

interface Props {
  styleId: string | number;
  styleNo?: string;
}

const StylePatternSimpleTab: React.FC<Props> = ({ styleId, styleNo }) => {
  const [patternFiles, setPatternFiles] = useState<StyleAttachment[]>([]);
  const [gradingFiles, setGradingFiles] = useState<StyleAttachment[]>([]);
  const [productionReq, setProductionReq] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 调试：打印styleId
  React.useEffect(() => {
    console.log('StylePatternSimpleTab - styleId:', styleId, 'styleNo:', styleNo);
  }, [styleId, styleNo]);

  // 加载生产制单
  useEffect(() => {
    const fetchProductionReq = async () => {
      if (!styleId) return;
      setLoading(true);
      try {
        const res = await api.get(`/style/info/${styleId}`);
        if (res.code === 200 && res.data) {
          const rows = res.data.productionRequirement || '';
          setProductionReq(rows);
        }
      } catch (error) {
        console.error('加载生产制单失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProductionReq();
  }, [styleId]);

  return (
    <div style={{ padding: '0 8px' }}>
      <Tabs
        items={[
          {
            key: 'pattern',
            label: `📐 原始纸样 (${patternFiles.length})`,
            children: (
              <Card size="small" style={{ marginBottom: 16 }}>
                <StyleAttachmentTab
                  styleId={styleId}
                  bizType="pattern"
                  uploadText="上传原始纸样"
                  readOnly={true}
                  onListChange={setPatternFiles}
                />
              </Card>
            ),
          },
          {
            key: 'grading',
            label: `📐 放码纸样 (${gradingFiles.length})`,
            children: (
              <Card size="small" style={{ marginBottom: 16 }}>
                <StyleAttachmentTab
                  styleId={styleId}
                  bizType="pattern_grading"
                  uploadText="上传放码纸样"
                  readOnly={true}
                  onListChange={setGradingFiles}
                />
              </Card>
            ),
          },
          {
            key: 'size',
            label: '📏 尺寸表',
            children: (
              <Card size="small" style={{ marginBottom: 16 }}>
                <StyleSizeTab styleId={styleId} readOnly={true} />
              </Card>
            ),
          },
          {
            key: 'production',
            label: '📋 生产制单',
            children: (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Spin spinning={loading}>
                  {productionReq ? (
                    <div style={{ 
                      whiteSpace: 'pre-wrap', 
                      fontSize: '14px', 
                      lineHeight: '1.8',
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px'
                    }}>
                      {productionReq}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#999' }}>
                      暂无生产制单内容
                    </div>
                  )}
                </Spin>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default StylePatternSimpleTab;
