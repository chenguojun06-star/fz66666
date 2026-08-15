import React, { useMemo } from 'react';
import { Col, Form, Input, Row } from 'antd';
import type { SectionFormContextProps } from './types';
import SectionBox from './SectionBox';

interface StyleFeatureSectionProps extends SectionFormContextProps {
  isNewPage: boolean;
}

/**
 * 解析 extJson 为对象。兼容三种返回形态：
 * - 字符串（后端某些接口会返回 JSON 字符串）
 * - 对象（前端表单直接持有）
 * - null/undefined（未填写）
 */
function parseExtJson(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return (typeof raw === 'object') ? raw as Record<string, unknown> : {};
}

const FEATURE_FIELDS = ['fabric', 'sleeveType', 'neckline', 'version', 'pattern', 'craftStyle'] as const;

const StyleFeatureSection: React.FC<StyleFeatureSectionProps> = ({
  _form,
  currentStyle,
  editLocked,
  isFieldLocked: _isFieldLocked,
}) => {
  // 判断当前款式是否已填写过任何款式特征字段。
  // 用于在"全空"时显示一句引导说明，避免用户看到标题却一片空白不知所措。
  const hasAnyFeature = useMemo(() => {
    const ext = parseExtJson(currentStyle?.extJson);
    return FEATURE_FIELDS.some((key) => {
      const v = ext[key];
      return typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
    });
  }, [currentStyle?.extJson]);

  return (
    <SectionBox title="款式特征">
      <Row gutter={[16, 8]}>
        <Col xs={24} sm={12}>
          <Form.Item
            name={['extJson', 'fabric']}
            label="面料"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-fabric"
              placeholder="AI识别自动填充"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name={['extJson', 'sleeveType']}
            label="袖型"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-sleeveType"
              placeholder="如：长袖/短袖/无袖"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name={['extJson', 'neckline']}
            label="领型"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-neckline"
              placeholder="如：圆领/V领/翻领"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name={['extJson', 'version']}
            label="版型"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-version"
              placeholder="如：修身/宽松/常规"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name={['extJson', 'pattern']}
            label="图案"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-pattern"
              placeholder="如：纯色/条纹/印花"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name={['extJson', 'craftStyle']}
            label="工艺风格"
            style={{ marginBottom: 8 }}
          >
            <Input
              id="feature-craftStyle"
              placeholder="如：简约/复古/街头"
              disabled={editLocked}
              allowClear
            />
          </Form.Item>
        </Col>
      </Row>
      {!hasAnyFeature ? (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          以上字段在<span style={{ color: 'var(--color-text-secondary)' }}>上传封面图</span>后由 AI 自动识别填充，也可直接手动填写。
        </div>
      ) : null}
    </SectionBox>
  );
};

export default StyleFeatureSection;
