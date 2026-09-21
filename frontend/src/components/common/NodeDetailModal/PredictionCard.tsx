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
      fontSize: 15,
    }}>
      <div className="u-d-flex u-ai-center u-gap-10 u-fwrap-wrap">
        <span className="u-fs-16"></span>
        {predicting ? (
          <span style={{ color: 'var(--color-primary-dark)' }}>预测中…</span>
        ) : prediction?.predictedFinishTime ? (
          <div>
            <span style={{ color: 'var(--color-text-primary)' }}>
              预计完工：<b className="u-fs-14" style={{ color: 'var(--color-primary)' }}>
                {dayjs(prediction.predictedFinishTime).format('MM-DD')}
              </b>
            </span>
            {(prediction.confidence != null) && (() => {
              // 后端置信度为0-1小数（0.52=52%），兼容已乘100的旧值
              const conf = prediction.confidence <= 1 ? prediction.confidence * 100 : prediction.confidence;
              return (
                <span className="u-ml-4" style={{ color: 'var(--color-text-secondary)' }}>
                  置信 <b style={{ color: conf >= 70 ? 'var(--color-success)' : conf >= 40 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                    {Math.round(conf)}%
                  </b>
                </span>
              );
            })()}
            {prediction.reasons && prediction.reasons.length > 0 && (
              <span className="u-fs-14 u-ml-4" style={{ color: 'var(--color-text-secondary)' }}>
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
