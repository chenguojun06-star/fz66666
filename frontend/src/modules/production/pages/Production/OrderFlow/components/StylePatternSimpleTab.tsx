import React, { useState, useEffect } from 'react';
import { Card, Tabs, Spin, message, List, Button, Space, Tag } from 'antd';
import { DownloadOutlined, FileOutlined } from '@ant-design/icons';
import type { StyleAttachment } from '@/types/style';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';
import api from '@/utils/api';

interface Props {
  styleId: string | number;
  styleNo?: string;
}

const StylePatternSimpleTab: React.FC<Props> = ({ styleId, styleNo }) => {
  const [allPatternFiles, setAllPatternFiles] = useState<StyleAttachment[]>([]);
  const [productionReq, setProductionReq] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 调试：打印styleId
  React.useEffect(() => {
    console.log('StylePatternSimpleTab - styleId:', styleId, 'styleNo:', styleNo);
  }, [styleId, styleNo]);

  // 加载所有纸样文件（包括原始纸样和放码纸样）
  useEffect(() => {
    const fetchAllPatternFiles = async () => {
      if (!styleId) return;
      try {
        // 并行加载两种类型的纸样文件
        const [patternRes, gradingRes] = await Promise.all([
          api.get('/style/attachment/list', { params: { styleId, bizType: 'pattern' } }),
          api.get('/style/attachment/list', { params: { styleId, bizType: 'pattern_grading' } })
        ]);

        const patternList = patternRes.code === 200 && Array.isArray(patternRes.data) ? patternRes.data : [];
        const gradingList = gradingRes.code === 200 && Array.isArray(gradingRes.data) ? gradingRes.data : [];

        // 合并两种类型的文件
        const allFiles = [...patternList, ...gradingList];
        setAllPatternFiles(allFiles);
      } catch (error) {
        console.error('加载纸样文件失败:', error);
      }
    };
    fetchAllPatternFiles();
  }, [styleId]);

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

  // 下载附件
  const handleDownload = (record: StyleAttachment) => {
    if (!record.fileUrl) {
      message.error('文件路径不存在');
      return;
    }
    const link = document.createElement('a');
    link.href = record.fileUrl;
    link.download = record.fileName || '文件';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 获取文件类型标签
  const getFileTypeTag = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const typeMap: Record<string, { color: string; text: string }> = {
      dxf: { color: 'blue', text: 'DXF' },
      plt: { color: 'cyan', text: 'PLT' },
      ets: { color: 'purple', text: 'ETS' },
      pdf: { color: 'red', text: 'PDF' },
      zip: { color: 'orange', text: 'ZIP' },
    };
    const type = typeMap[ext || ''] || { color: 'default', text: ext?.toUpperCase() || 'FILE' };
    return <Tag color={type.color}>{type.text}</Tag>;
  };

  return (
    <div style={{ padding: '0 8px' }}>
      <Tabs
        items={[
          {
            key: 'pattern',
            label: `📐 大货纸样 (${allPatternFiles.length})`,
            children: (
              <Card size="small" style={{ marginBottom: 16 }}>
                {allPatternFiles.length > 0 ? (
                  <List
                    dataSource={allPatternFiles}
                    renderItem={(item) => (
                      <List.Item
                        actions={[
                          <Button
                            key="download"
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleDownload(item)}
                          >
                            下载
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<FileOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                          title={
                            <Space>
                              {item.fileName}
                              {getFileTypeTag(item.fileName || '')}
                              {item.bizType === 'pattern' && <Tag color="green">原始纸样</Tag>}
                              {item.bizType === 'pattern_grading' && <Tag color="purple">放码纸样</Tag>}
                            </Space>
                          }
                          description={`上传者: ${item.uploader || '-'} | 上传时间: ${item.createTime || '-'}`}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#999' }}>
                    暂无纸样文件
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: 'size',
            label: '📏 尺寸表',
            children: (
              <Card size="small" style={{ marginBottom: 16 }}>
                <StyleSizeTab styleId={styleId} readOnly={true} simpleView={true} />
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
