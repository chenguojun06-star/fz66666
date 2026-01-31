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
        console.log('生产制单API返回:', res);
        if (res.code === 200 && res.data) {
          // 使用description字段，而不是productionRequirement
          const rows = res.data.description || '';
          console.log('生产制单description字段:', rows);
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
                    (() => {
                      // 与打印组件一致：拆分成多行并格式化
                      const lines = productionReq
                        .split(/\r?\n/)
                        .map(l => String(l || '').replace(/^\s*\d+\s*[.、)）-]?\s*/, '').trim())
                        .filter(l => Boolean(l));
                      
                      return (
                        <div style={{ padding: '8px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                            <thead>
                              <tr style={{ background: '#fafafa' }}>
                                <th style={{ border: '1px solid #d9d9d9', padding: '8px', width: 60, textAlign: 'center' }}>序号</th>
                                <th style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'center' }}>生产要求</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((line, idx) => (
                                <tr key={idx}>
                                  <td style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'center' }}>{idx + 1}</td>
                                  <td style={{ border: '1px solid #d9d9d9', padding: '8px', whiteSpace: 'pre-wrap' }}>{line}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()
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
