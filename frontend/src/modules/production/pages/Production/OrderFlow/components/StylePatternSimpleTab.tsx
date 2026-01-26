import React, { useState, useCallback } from 'react';
import { Button, Card, Row, Col, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { StyleAttachment } from '@/types/style';
import StyleAttachmentTab from '@/modules/basic/pages/StyleInfo/components/StyleAttachmentTab';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';
import { buildProductionSheetHtml } from '@/modules/basic/pages/DataCenter';
import api from '@/utils/api';

interface Props {
  styleId: string | number;
  styleNo?: string;
}

const StylePatternSimpleTab: React.FC<Props> = ({ styleId, styleNo }) => {
  const [gradingFiles, setGradingFiles] = useState<StyleAttachment[]>([]);
  const [downloading, setDownloading] = useState(false);

  // 下载放码文件
  const downloadGradingFiles = () => {
    if (gradingFiles.length === 0) {
      message.warning('暂无可下载的放码文件');
      return;
    }

    gradingFiles.forEach((file, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = file.fileUrl;
        link.download = file.fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 500);
    });

    message.success(`开始下载 ${gradingFiles.length} 个文件`);
  };

  // 下载生产制单
  const downloadProductionSheet = useCallback(async () => {
    if (!styleId) {
      message.error('款号ID不存在');
      return;
    }

    setDownloading(true);
    try {
      const res = await api.get<{ code: number; data: any; message?: string }>(
        `/style/info/${styleId}`
      );

      if (res.code !== 200 || !res.data) {
        message.error(res.message || '获取款号信息失败');
        return;
      }

      const styleData = res.data;
      const html = buildProductionSheetHtml(styleData);

      // 创建并下载HTML文件
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `生产制单-${styleNo || styleData.styleNo || styleId}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      message.success('生产制单下载成功');
    } catch (error: any) {
      message.error(error?.message || '下载生产制单失败');
    } finally {
      setDownloading(false);
    }
  }, [styleId, styleNo]);

  return (
    <div style={{ padding: '0 8px' }}>
      {/* 放码文件 */}
      <Card
        title={
          <Row justify="space-between" align="middle">
            <Col>📐 放码纸样 ({gradingFiles.length})</Col>
            <Col>
              <Button
                size="small"
                type="primary"
                icon={<DownloadOutlined />}
                onClick={downloadGradingFiles}
                disabled={gradingFiles.length === 0}
              >
                下载全部
              </Button>
            </Col>
          </Row>
        }
        size="small"
        style={{ marginBottom: 16 }}
      >
        <StyleAttachmentTab
          styleId={styleId}
          bizType="pattern_grading"
          uploadText="上传放码文件"
          readOnly={true}
          onListChange={setGradingFiles}
        />
      </Card>

      {/* 尺寸表 */}
      <Card title="📏 尺寸表" size="small" style={{ marginBottom: 16 }}>
        <StyleSizeTab styleId={styleId} readOnly={true} />
      </Card>

      {/* 生产制单 */}
      <Card
        title={
          <Row justify="space-between" align="middle">
            <Col>📋 生产制单</Col>
            <Col>
              <Button
                size="small"
                type="primary"
                icon={<DownloadOutlined />}
                onClick={downloadProductionSheet}
                loading={downloading}
              >
                下载生产制单
              </Button>
            </Col>
          </Row>
        }
        size="small"
      >
        <div style={{ padding: '12px 0', color: '#666', fontSize: 14 }}>
          点击右上角按钮下载生产制单（HTML格式），包含工艺要求、尺寸表等完整信息
        </div>
      </Card>
    </div>
  );
};

export default StylePatternSimpleTab;
