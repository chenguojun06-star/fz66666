import React from 'react';
import { Card } from 'antd';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import type { QualityAiSuggestionResult } from '@/services/production/productionApi';
import { getDefectCategoryLabel } from '../../utils';
import { toPercent } from '@/utils/format';

interface Props {
  aiSuggestion: QualityAiSuggestionResult | null;
  aiLoading: boolean;
  actualDefectSet: Set<string>;
}

const AiQualityHelperCard: React.FC<Props> = ({ aiSuggestion, aiLoading, actualDefectSet }) => {
  return (
    <Card
     
      style={{ background: 'var(--color-bg-base)', border: '1px solid #d6e4ff' }}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <XiaoyunCloudAvatar size={18} active />
          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>智能质检助手</span>
          {aiSuggestion?.historicalDefectRate !== undefined && (
            <span style={{
              fontSize: 14, fontWeight: 400, padding: '1px 7px',
              borderRadius: 10, background:
                aiSuggestion.historicalDefectRate > 0.05 ? '#FFF1F0'
                  : aiSuggestion.historicalDefectRate > 0.02 ? '#FFF7E6' : '#f6ffed',
              color: aiSuggestion.historicalDefectRate > 0.05 ? 'var(--color-danger)'
                : aiSuggestion.historicalDefectRate > 0.02 ? 'var(--color-warning)' : 'var(--color-success)',
            }}>
              历史次品率 {toPercent(aiSuggestion.historicalDefectRate)}
            </span>
          )}
        </span>
      }
      loading={aiLoading}
    >
      {!aiSuggestion && !aiLoading && (
        <div style={{ color: '#aaa', textAlign: 'center', padding: '16px 0', fontSize: 14 }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}></div>
          AI正在分析订单数据，请稍后…
        </div>
      )}
      {aiSuggestion && (
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>
          {aiSuggestion.urgentTip && (
            <div style={{
              padding: '6px 12px', background: '#FFF7E6',
              border: '1px solid #ffd591', borderRadius: 6,
              marginBottom: 10, color: '#d46b08', fontWeight: 600, fontSize: 14,
            }}>
              {aiSuggestion.urgentTip}
            </div>
          )}
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8, fontSize: 14 }}>质检要点</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {aiSuggestion.checkpoints.map((cp, i) => {
              const isRed = cp.startsWith('🔴');
              const isYellow = cp.startsWith('🟡');
              return (
                <div key={i} style={{
                  padding: '6px 10px',
                  background: isRed ? '#FFF1F0' : isYellow ? '#FFFBE6' : '#f6ffed',
                  borderLeft: `3px solid ${isRed ? 'var(--color-danger)' : isYellow ? 'var(--color-warning)' : 'var(--color-success)'}`,
                  borderRadius: '0 4px 4px 0',
                  color: 'var(--color-text-primary)', fontSize: 14,
                }}>
                  {cp}
                </div>
              );
            })}
          </div>
          {aiSuggestion.defectSuggestions && Object.keys(aiSuggestion.defectSuggestions).length > 0 && (
            <>
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 12, marginBottom: 8, fontSize: 14 }}>
                缺陷处理建议
                {actualDefectSet.size === 0 && (
                  <span style={{ fontWeight: 400, fontSize: 14, color: '#aaa', marginLeft: 6 }}>（本批暂无次品）</span>
                )}
                {actualDefectSet.size > 0 && (
                  <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--color-error)', marginLeft: 6 }}> 本批已发现 {actualDefectSet.size} 类缺陷</span>
                )}
              </div>
              {Object.entries(aiSuggestion.defectSuggestions)
                .sort(([aKey], [bKey]) => (actualDefectSet.has(bKey) ? 1 : 0) - (actualDefectSet.has(aKey) ? 1 : 0))
                .map(([defect, advice]) => {
                  const isActual = actualDefectSet.has(defect);
                  return (
                    <div key={defect} style={{
                      marginBottom: 6, padding: '6px 10px',
                      background: isActual ? '#F6FFED' : 'var(--color-bg-container)',
                      borderLeft: `3px solid ${isActual ? 'var(--color-danger)' : '#e8e8e8'}`,
                      borderRadius: '0 4px 4px 0',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {isActual && (
                          <span style={{ background: 'var(--color-danger)', color: 'var(--color-bg-base)', fontSize: 14, padding: '1px 5px', borderRadius: 2, flexShrink: 0 }}>本批已发现</span>
                        )}
                        <span style={{ fontWeight: 600, color: isActual ? 'var(--color-error)' : '#595959', fontSize: 14 }}>
                          {getDefectCategoryLabel(defect)}
                        </span>
                      </div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{advice}</div>
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
