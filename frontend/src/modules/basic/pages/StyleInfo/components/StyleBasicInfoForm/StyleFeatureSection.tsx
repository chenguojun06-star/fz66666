import React from 'react';
import { Form, Input } from 'antd';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';
import { STYLE_FEATURE_KEY, resolveStyleFeature, isFailedParseText } from './styleFeature';

interface StyleFeatureSectionProps extends SectionFormContextProps {
  isNewPage: boolean;
}

/**
 * 款式特征：单一整体文本框。
 *
 * 原为面料/袖型/领型/版型/图案/工艺风格 6 个分散输入框，用户反馈阅读割裂、
 * 且"填了保存不进去"。D-261 合并为一个框，值存 extJson.styleFeature。
 * 历史款式（旧 6 字段）由 resolveStyleFeature 自动合并成一段预填，不丢数据。
 *
 * D-391：若存量值本身是 AI 识别失败残留（"识别【无法确认…】｜原始分析：…"），
 * 不再把垃圾文本回填进表单，显示"未识别"占位，避免一坨乱码挡住人工填写。
 */
const StyleFeatureSection: React.FC<StyleFeatureSectionProps> = ({
  _form,
  currentStyle,
  editLocked,
  isFieldLocked: _isFieldLocked,
}) => {
  // 历史数据兜底：新字段为空时，把旧 6 字段拼成一段文本作为初始值
  const resolved = resolveStyleFeature(currentStyle?.extJson);
  const isFailedStored = isFailedParseText(resolved);
  const initialText = isFailedStored ? '' : resolved;

  return (
    <SectionBox title="款式特征">
      <Form.Item
        name={['extJson', STYLE_FEATURE_KEY]}
        initialValue={initialText}
        style={{ marginBottom: 4 }}
      >
        <Input.TextArea
          id="feature-styleFeature"
          rows={5}
          placeholder={isFailedStored
            ? 'AI 未识别到有效款式特征（历史识别失败残留已清除），可手动填写或重新上传清晰图片识别'
            : '填写整体款式特征（面料/袖型/领型/版型/图案/工艺/难度等），或上传封面图后由 AI 自动识别填充'}
          disabled={editLocked}
          showCount
          maxLength={1000}
        />
      </Form.Item>
    </SectionBox>
  );
};

export default StyleFeatureSection;
