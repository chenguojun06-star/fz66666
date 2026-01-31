import React, { useState, useCallback } from 'react';
import { Card, Row, Col, message, Tabs } from 'antd';
import type { StyleAttachment } from '@/types/style';
import StyleAttachmentTab from '@/modules/basic/pages/StyleInfo/components/StyleAttachmentTab';
import StyleSizeTab from '@/modules/basic/pages/StyleInfo/components/StyleSizeTab';
import StyleProductionTab from '@/modules/basic/pages/StyleInfo/components/StyleProductionTab';

interface Props {
  styleId: string | number;
  styleNo?: string;
}

const StylePatternSimpleTab: React.FC<Props> = ({ styleId, styleNo }) => {
  const [patternFiles, setPatternFiles] = useState<StyleAttachment[]>([]);
  const [gradingFiles, setGradingFiles] = useState<StyleAttachment[]>([]);

  // 调试：打印styleId
  React.useEffect(() => {
    console.log('StylePatternSimpleTab - styleId:', styleId, 'styleNo:', styleNo);
  }, [styleId, styleNo]);

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
                <StyleProductionTab styleId={styleId} readOnly={true} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default StylePatternSimpleTab;

export default StylePatternSimpleTab;
