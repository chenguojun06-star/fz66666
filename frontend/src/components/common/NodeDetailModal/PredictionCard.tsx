import React from 'react';
import dayjs from 'dayjs';
import PredictionFeedbackBar from '@/components/common/PredictionFeedbackBar';

interface PredictionCardProps {
  predicting: boolean;
  prediction: any;
  orderId: string;
  orderNo: string;
  nodeName: string;
  delegateProcessName?: string;
}

const PredictionCard: React.FC<PredictionCardProps> = ({
  predicting, prediction, orderId, orderNo, nodeName, delegateProcessName,
}) => {
  if (!predicting && !prediction) return null;

  return (
    <div style={{
      background: 'var(--color-bg-base)',
      border: '1px solid var(--color-blue-100)',
      borderLeft: '4px solid var(--color-primary)',
      borderRadius: 6,
      padding: '8px 12px',
      marginBottom: 8,
      fontSize: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16 }}></span>
        {predicting ? (
          <span style={{ color: 'var(--color-primary-dark)' }}>预测中…</span>
        ) : prediction?.predictedFinishTime ? (
          <div>
            <span style={{ color: 'var(--color-text-primary)' }}>
              预计完工：<b style={{ color: 'var(--color-primary)', fontSize: 14 }}>
                {dayjs(prediction.predictedFinishTime).format('MM-DD')}
              </b>
            </span>
            {(prediction.confidence != null) && (() => {
              // 后端置信度为0-1小数（0.52=52%），兼容已乘100的旧值
              const conf = prediction.confidence <= 1 ? prediction.confidence * 100 : prediction.confidence;
              return (
                <span style={{ color: 'var(--color-text-secondary)', marginLeft: 4 }}>
                  置信 <b style={{ color: conf >= 70 ? 'var(--color-success)' : conf >= 40 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                    {Math.round(conf)}%
                  </b>
                </span>
              );
            })()}
            {prediction.reasons && prediction.reasons.length > 0 && (
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginLeft: 4 }}>
                · {prediction.reasons[0]}
              </span>
            )}
          </div>
        ) : null}
      </div>
      {!!prediction?.predictedFinishTime && (
        <PredictionFeedbackBar
          predictionId={prediction?.predictionId}
          predictedFinishTime={prediction?.predictedFinishTime}
          orderId={orderId}
          orderNo={orderNo}
          stageName={nodeName}
          processName={delegateProcessName || nodeName || undefined}
        />
      )}
    </div>
  );
};

export default PredictionCard;
