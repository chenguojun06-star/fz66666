import React, { useState } from 'react';
import { Typography, Divider, Alert } from 'antd';
import { ExperimentOutlined, LineChartOutlined } from '@ant-design/icons';
import VisualAIPanel from '@/modules/intelligence/components/VisualAIPanel';
import ForecastPanel from '@/modules/intelligence/components/ForecastPanel';

const { Text } = Typography;

interface Props {
  styleId?: string | number;
  styleNo?: string;
  coverImageUrl?: string;
}

/**
 * 样衣开发 - AI辅助 Tab
 * - 视觉AI质检：上传样衣图片，AI检测色差/瑕疵/款式识别
 * - 面料用量预测：基于款号预测面料需求，辅助BOM采购决策
 */
const StyleAIToolsTab: React.FC<Props> = ({ styleNo, coverImageUrl: _coverImageUrl }) => {
  const [_activeSection] = useState<'visual' | 'forecast'>('visual');

  return (
    <div style={{ padding: '8px 0' }}>
      {/* ---- 视觉AI质检 ---- */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            padding: '6px 0',
          }}
        >
          <ExperimentOutlined style={{ color: '#00e5ff', fontSize: 16 }} />
          <Text strong style={{ fontSize: 14, color: '#262626' }}>
            样衣图片 AI 质检
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            — 上传样衣图片，检测色差、工艺缺陷、款式特征
          </Text>
        </div>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12, fontSize: 12 }}
          message={
            styleNo
              ? `当前款号：${styleNo}｜粘贴图片地址（COS/CDN链接均可）后点击「开始分析」`
              : '粘贴样衣图片地址即可进行AI质检，支持 COS / CDN 外链'
          }
        />
        <VisualAIPanel />
      </div>

      <Divider style={{ margin: '24px 0' }}>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>面料预测</span>
      </Divider>

      {/* ---- 面料用量预测 ---- */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            padding: '6px 0',
          }}
        >
          <LineChartOutlined style={{ color: '#a78bfa', fontSize: 16 }} />
          <Text strong style={{ fontSize: 14, color: '#262626' }}>
            面料用量预测
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            — 基于历史订单推算面料需求，辅助 BOM 采购决策
          </Text>
        </div>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12, fontSize: 12 }}
          message={
            styleNo
              ? `预测类型选「面料需求」，主体 ID 填入款号 ${styleNo}，选择预测周期后点击开始`
              : '预测类型选「面料需求」，主体 ID 填入款号，选择预测周期后开始预测'
          }
        />
        <ForecastPanel />
      </div>
    </div>
  );
};

export default StyleAIToolsTab;
