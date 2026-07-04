import React, { useMemo } from 'react';
import { Typography } from 'antd';
import type { TemplateConfig } from '../PrintTemplateDesigner/types';

const { Text } = Typography;

interface PrintPreviewProps {
  template: TemplateConfig;
  data: Record<string, string | number>;
}

const PrintPreview: React.FC<PrintPreviewProps> = ({ template, data }) => {
  // mm to px 转换（96 DPI 标准，缩放到 50% 以适应预览区域）
  const scale = 3.78 * 0.5;
  const previewWidth = template.width * scale;
  const previewHeight = template.height * scale;

  const renderedFields = useMemo(() => {
    return template.fields.map((field) => {
      // 提取字段 ID（去除后缀时间戳）
      const fieldKey = field.id.split('-')[0];
      const value = data[fieldKey] || '';

      return {
        ...field,
        value,
        displayText: `${field.label}: ${value}`,
      };
    });
  }, [template.fields, data]);

  return (
    <div className="print-preview-wrapper">
      <div
        className="print-preview-canvas"
        style={{
          width: previewWidth,
          height: previewHeight,
          minWidth: previewWidth,
          minHeight: previewHeight,
        }}
      >
        {renderedFields.map((field) => (
          <div
            key={field.id}
            className="preview-field"
            style={{
              left: field.x * scale,
              top: field.y * scale,
              fontSize: field.fontSize * 0.5,
              textAlign: field.align,
              fontWeight: field.bold ? 700 : 400,
              width: field.width ? field.width * scale : 'auto',
            }}
          >
            <Text>{field.displayText}</Text>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrintPreview;