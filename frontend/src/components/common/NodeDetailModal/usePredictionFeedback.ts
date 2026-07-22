import { useEffect, useState, useRef, MutableRefObject } from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ScanRecord, NodeStats } from './types';

interface UsePredictionFeedbackParams {
  visible: boolean;
  orderId?: string;
  nodeName: string;
  isPatternProduction?: boolean;
  nodeStats?: NodeStats;
  filteredScanRecords: ScanRecord[];
  orderSummaryOrderNo?: string;
}

export interface PredictionState {
  predictedFinishTime?: string;
  confidence?: number;
  reasons?: string[];
  suggestions?: string[];
  predictionId?: string;
}

export function usePredictionFeedback(params: UsePredictionFeedbackParams): {
  prediction: PredictionState | null;
  predicting: boolean;
  feedbackSentKeyRef: MutableRefObject<string>;
} {
  const {
    visible,
    orderId,
    nodeName,
    isPatternProduction = false,
    nodeStats,
    filteredScanRecords,
    orderSummaryOrderNo,
  } = params;

  const [prediction, setPrediction] = useState<PredictionState | null>(null);
  const [predicting, setPredicting] = useState(false);
  const feedbackSentKeyRef = useRef<string>('');

  useEffect(() => {
    if (!visible || !orderId || isPatternProduction) return;
    let cancelled = false;
    setPredicting(true);
    intelligenceApi.predictFinishTime({ orderId, stageName: nodeName })
      .then((res: any) => {
        if (!cancelled && res.code === 200 && res.data) {
          setPrediction(res.data);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPredicting(false); });
    return () => { cancelled = true; };
  }, [visible, orderId, nodeName, isPatternProduction]);

  useEffect(() => {
    if (!orderId || !visible || isPatternProduction) return;
    if ((nodeStats?.percent ?? 0) < 100) return;
    if (filteredScanRecords.length === 0) return;

    const key = `${orderId}::${nodeName}`;
    if (feedbackSentKeyRef.current === key) return;
    feedbackSentKeyRef.current = key;

    const maxScanTime = filteredScanRecords.reduce((latest, r) => {
      const t = String((r as any).scanTime || '');
      return t > latest ? t : latest;
    }, '');

    if (!maxScanTime) return;

    intelligenceApi.feedback({
      predictionId: prediction?.predictionId,
      orderId,
      orderNo: orderSummaryOrderNo,
      stageName: nodeName,
      predictedFinishTime: prediction?.predictedFinishTime,
      actualFinishTime: maxScanTime,
      actualResult: 'completed',
    }).catch(() => {});
  }, [orderId, nodeName, visible, isPatternProduction, nodeStats?.percent, filteredScanRecords, prediction, orderSummaryOrderNo]);

  useEffect(() => {
    if (!visible) {
      setPrediction(null);
      feedbackSentKeyRef.current = '';
    }
  }, [visible]);

  return {
    prediction,
    predicting,
    feedbackSentKeyRef,
  };
}
