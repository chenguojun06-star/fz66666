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
        <div className="u-mb-12">
          <div className="u-fw-600 u-mb-4">分析结果</div>
          <div className="u-ws-pre-wrap" style={{ lineHeight: 1.6 }}>{analysisResult.report}</div>
        </div>
      )}
      {analysisResult.recommendation && (
        <div className="u-br-6" style={{ padding: 10, background: 'var(--color-bg-container)', border: '1px solid var(--color-border-light)' }}>
          <span className="u-fw-600">建议：</span>
          {analysisResult.recommendation}
        </div>
      )}
      {analysisResult.severity && analysisResult.severity !== 'NONE' && (
        <div className="u-mt-8">
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
