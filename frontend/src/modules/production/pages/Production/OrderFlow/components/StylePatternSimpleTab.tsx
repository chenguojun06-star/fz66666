import React, { useState, useEffect } from 'react';
import { Card, Tabs, Spin, message, List, Button, Space, Tag } from 'antd';
import { DownloadOutlined, FileOutlined, ReloadOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { StyleAttachment } from '@/types/style';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';
import StyleSecondaryProcessTab from '@/modules/basic/pages/StyleInfo/components/StyleSecondaryProcessTab';
import api from '@/utils/api';
import { downloadFile } from '@/utils/fileUrl';

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
  }, [styleId, styleNo]);

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

      // 合并两种类型的文件，并过滤掉归档版本
      const allFiles = [...patternList, ...gradingList];
      const activeFiles = allFiles.filter((item: any) => String((item as any)?.status || 'active') === 'active');
      setAllPatternFiles(activeFiles as StyleAttachment[]);
    } catch (error) {
      console.error('加载纸样文件失败:', error);
    }
  };

  useEffect(() => {
    fetchAllPatternFiles();
  }, [styleId]);

  const fetchProductionReq = async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const res = await api.get(`/style/info/${styleId}`);
      if (res.code === 200 && res.data) {
        const rows = res.data.description || '';
        setProductionReq(rows);
      }
    } catch (error) {
      console.error('加载生产制单失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductionReq();
  }, [styleId]);

  const handleRefresh = () => {
    fetchAllPatternFiles();
    fetchProductionReq();
    message.success('已同步最新信息');
  };

  // 下载附件
  const handleDownload = (record: StyleAttachment) => {
    if (!record.fileUrl) {
      message.error('文件路径不存在');
      return;
    }
    downloadFile(record.fileUrl, record.fileName || '文件');
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
      <div style={{ marginBottom: 8, color: 'var(--neutral-text-secondary)', fontSize: "var(--font-size-xs)" }}>
        款号：<span style={{ color: 'var(--neutral-text)', fontWeight: 500 }}>{styleNo || '-'}</span>
      </div>
      <Tabs
        tabBarExtraContent={
          <Button size="small" onClick={handleRefresh}>
            更新
          </Button>
        }
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
                            onClick={() => handleDownload(item)}
                          >
                            下载
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<FileOutlined style={{ fontSize: "var(--font-size-xxl)", color: 'var(--primary-color)' }} />}
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
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--neutral-text-disabled)' }}>
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
                        <ResizableTable
                          storageKey="style-pattern-requirements"
                          size="small"
                          pagination={false}
                          dataSource={lines.map((line, idx) => ({
                            key: idx,
                            index: idx + 1,
                            content: line
                          }))}
                          columns={[
                            {
                              title: '序号',
                              dataIndex: 'index',
                              width: 60,
                              align: 'center'
                            },
                            {
                              title: '生产要求',
                              dataIndex: 'content',
                              render: (text: string) => (
                                <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
                              )
                            }
                          ]}
                          style={{ fontSize: 'var(--font-size-base)' }}
                        />
                      );
                    })()
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--neutral-text-disabled)' }}>
                      暂无生产制单内容
                    </div>
                  )}
                </Spin>
              </Card>
            ),
          },
          {
            key: 'secondary',
            label: '🧵 二次工艺',
            children: (
              <Card size="small" style={{ marginBottom: 16 }}>
                <StyleSecondaryProcessTab styleId={styleId} styleNo={styleNo} readOnly simpleView />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default StylePatternSimpleTab;
