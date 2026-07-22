import React from 'react';
import { Tag } from 'antd';

interface AIAnalysisContentProps {
  analysisResult: any;
}

const AIAnalysisContent: React.FC<AIAnalysisContentProps> = ({ analysisResult }) => {
  if (!analysisResult) return null;

  return (
    <div>
      {analysisResult.report && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>分析结果</div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{analysisResult.report}</div>
        </div>
      )}
      {analysisResult.recommendation && (
        <div style={{ padding: 10, background: 'var(--color-bg-container)', borderRadius: 6, border: '1px solid var(--color-border-light)' }}>
          <span style={{ fontWeight: 600 }}>建议：</span>
          {analysisResult.recommendation}
        </div>
      )}
      {analysisResult.severity && analysisResult.severity !== 'NONE' && (
        <div style={{ marginTop: 8 }}>
          <Tag color={analysisResult.severity === 'HIGH' || analysisResult.severity === 'CRITICAL' ? 'red' : analysisResult.severity === 'MEDIUM' ? 'orange' : 'blue'}>
            严重程度：{analysisResult.severity}
          </Tag>
          {analysisResult.confidence != null && <Tag>置信度：{analysisResult.confidence}%</Tag>}
        </div>
      )}
    </div>
  );
};

export default AIAnalysisContent;
