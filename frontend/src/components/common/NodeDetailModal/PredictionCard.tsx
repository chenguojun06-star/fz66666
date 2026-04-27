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
      background: '#fff',
      border: '1px solid #d6e8ff',
      borderLeft: '4px solid #1677ff',
      borderRadius: 6,
      padding: '8px 12px',
      marginBottom: 8,
      fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16 }}></span>
        {predicting ? (
          <span style={{ color: '#0958d9' }}>预测中…</span>
        ) : prediction?.predictedFinishTime ? (
          <div>
            <span style={{ color: '#222' }}>
              预计完工：<b style={{ color: '#1677ff', fontSize: 14 }}>
                {dayjs(prediction.predictedFinishTime).format('MM-DD')}
              </b>
            </span>
            {(prediction.confidence != null) && (
              <span style={{ color: '#555', marginLeft: 4 }}>
                置信 <b style={{ color: prediction.confidence >= 70 ? '#52c41a' : prediction.confidence >= 40 ? '#fa8c16' : '#ff4d4f' }}>
                  {prediction.confidence}%
                </b>
              </span>
            )}
            {prediction.reasons && prediction.reasons.length > 0 && (
              <span style={{ color: '#666', fontSize: 12, marginLeft: 4 }}>
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
