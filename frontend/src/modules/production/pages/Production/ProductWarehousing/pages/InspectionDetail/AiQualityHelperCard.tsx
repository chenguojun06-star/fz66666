import React from 'react';
import { Card } from 'antd';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import type { QualityAiSuggestionResult } from '@/services/production/productionApi';
import { getDefectCategoryLabel } from '../../utils';

interface Props {
  aiSuggestion: QualityAiSuggestionResult | null;
  aiLoading: boolean;
  actualDefectSet: Set<string>;
}

const AiQualityHelperCard: React.FC<Props> = ({ aiSuggestion, aiLoading, actualDefectSet }) => {
  return (
    <Card
      size="small"
      style={{ background: '#fff', border: '1px solid #d6e4ff' }}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <XiaoyunCloudAvatar size={18} active />
          <span style={{ fontWeight: 600, color: '#1677ff' }}>智能质检助手</span>
          {aiSuggestion?.historicalDefectRate !== undefined && (
            <span style={{
              fontSize: 11, fontWeight: 400, padding: '1px 7px',
              borderRadius: 10, background:
                aiSuggestion.historicalDefectRate > 0.05 ? '#fff1f0'
                  : aiSuggestion.historicalDefectRate > 0.02 ? '#fff7e6' : '#f6ffed',
              color: aiSuggestion.historicalDefectRate > 0.05 ? '#ff4d4f'
                : aiSuggestion.historicalDefectRate > 0.02 ? '#fa8c16' : '#52c41a',
            }}>
              历史次品率 {(aiSuggestion.historicalDefectRate * 100).toFixed(1)}%
            </span>
          )}
        </span>
      }
      loading={aiLoading}
    >
      {!aiSuggestion && !aiLoading && (
        <div style={{ color: '#aaa', textAlign: 'center', padding: '16px 0', fontSize: 12 }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}></div>
          AI正在分析订单数据，请稍后…
        </div>
      )}
      {aiSuggestion && (
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>
          {aiSuggestion.urgentTip && (
            <div style={{
              padding: '6px 12px', background: '#fff7e6',
              border: '1px solid #ffd591', borderRadius: 6,
              marginBottom: 10, color: '#d46b08', fontWeight: 600, fontSize: 14,
            }}>
              {aiSuggestion.urgentTip}
            </div>
          )}
          <div style={{ fontWeight: 600, color: '#333', marginBottom: 8, fontSize: 14 }}>质检要点</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {aiSuggestion.checkpoints.map((cp, i) => {
              const isRed = cp.startsWith('🔴');
              const isYellow = cp.startsWith('🟡');
              return (
                <div key={i} style={{
                  padding: '6px 10px',
                  background: isRed ? '#fff1f0' : isYellow ? '#fffbe6' : '#f6ffed',
                  borderLeft: `3px solid ${isRed ? '#ff4d4f' : isYellow ? '#faad14' : '#52c41a'}`,
                  borderRadius: '0 4px 4px 0',
                  color: '#333', fontSize: 14,
                }}>
                  {cp}
                </div>
              );
            })}
          </div>
          {aiSuggestion.defectSuggestions && Object.keys(aiSuggestion.defectSuggestions).length > 0 && (
            <>
              <div style={{ fontWeight: 600, color: '#333', marginTop: 12, marginBottom: 8, fontSize: 14 }}>
                缺陷处理建议
                {actualDefectSet.size === 0 && (
                  <span style={{ fontWeight: 400, fontSize: 12, color: '#aaa', marginLeft: 6 }}>（本批暂无次品）</span>
                )}
                {actualDefectSet.size > 0 && (
                  <span style={{ fontWeight: 400, fontSize: 12, color: '#f5222d', marginLeft: 6 }}> 本批已发现 {actualDefectSet.size} 类缺陷</span>
                )}
              </div>
              {Object.entries(aiSuggestion.defectSuggestions)
                .sort(([aKey], [bKey]) => (actualDefectSet.has(bKey) ? 1 : 0) - (actualDefectSet.has(aKey) ? 1 : 0))
                .map(([defect, advice]) => {
                  const isActual = actualDefectSet.has(defect);
                  return (
                    <div key={defect} style={{
                      marginBottom: 6, padding: '6px 10px',
                      background: isActual ? '#fff2f0' : '#fafafa',
                      borderLeft: `3px solid ${isActual ? '#ff4d4f' : '#e8e8e8'}`,
                      borderRadius: '0 4px 4px 0',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {isActual && (
                          <span style={{ background: '#ff4d4f', color: '#fff', fontSize: 11, padding: '1px 5px', borderRadius: 2, flexShrink: 0 }}>本批已发现</span>
                        )}
                        <span style={{ fontWeight: 600, color: isActual ? '#cf1322' : '#595959', fontSize: 13 }}>
                          {getDefectCategoryLabel(defect)}
                        </span>
                      </div>
                      <div style={{ color: '#555', fontSize: 13, lineHeight: 1.6 }}>{advice}</div>
                    </div>
                  );
                })}
            </>
          )}
        </div>
      )}
    </Card>
  );
};

export default AiQualityHelperCard;
