import { useCallback, useRef, useState } from 'react';
import { intelligenceApi } from '@/services/production/productionApi';

type TriggerPredictParams = {
  orderId: string;
  orderNo?: string;
  stageName: string;
  currentProgress: number;
};

const normalizeProgress = (value: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

export const usePredictFinishHint = (formatTime: (time: string) => string) => {
  const [predictHintByKey, setPredictHintByKey] = useState<Record<string, string>>({});
  const predictingRef = useRef<Record<string, boolean>>({});

  // 后端通过 orderId 自读扫码记录（不依赖 progress%），key 去掉 progress 避免重复请求
  const buildPredictKey = useCallback((orderId: string, stageName: string) => {
    return `${String(orderId || '').trim()}::${String(stageName || '').trim()}`;
  }, []);

  const getPredictHint = useCallback((orderId: string, stageName: string, _currentProgress?: number) => {
    const key = buildPredictKey(orderId, stageName);
    return predictHintByKey[key] || '';
  }, [buildPredictKey, predictHintByKey]);

  const triggerPredict = useCallback(async ({ orderId, orderNo, stageName, currentProgress }: TriggerPredictParams) => {
    const oid = String(orderId || '').trim();
    const stage = String(stageName || '').trim();
    const progress = normalizeProgress(currentProgress);
    if (!oid || !stage || progress >= 100) return;

    const key = buildPredictKey(oid, stage); // 不含 progress，后端自读扫码记录
    if (predictHintByKey[key] || predictingRef.current[key]) return;

    predictingRef.current[key] = true;
    try {
      const resp = await intelligenceApi.predictFinishTime({
        orderId: oid,
        orderNo: String(orderNo || '').trim() || undefined,
        stageName: stage,
        currentProgress: progress, // 仅降级备用（后端优先读扫码记录）
      });

      const result = resp as any;
      if (Number(result?.code) !== 200) return;

      const predictedFinishTime = String(result?.data?.predictedFinishTime || '').trim();
      const confidence = Number(result?.data?.confidence);
      const timeLabel = formatTime(predictedFinishTime);
      if (!timeLabel) return;

      const confidenceLabel = Number.isFinite(confidence)
        ? `（置信度${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%）`
        : '';

      // 可选：附上件数说明（当后端返回数量时）
      const remaining = result?.data?.remainingQuantity;
      const total = result?.data?.totalQuantity;
      const qtyHint = (remaining != null && total != null && total > 0)
        ? `，剩${remaining}件` : '';

      setPredictHintByKey((prev) => ({
        ...prev,
        [key]: `${timeLabel}${qtyHint}${confidenceLabel}`,
      }));
    } catch {
      // 预测失败不影响主流程
    } finally {
      delete predictingRef.current[key];
    }
  }, [buildPredictKey, formatTime, predictHintByKey]);

  return {
    buildPredictKey,
    getPredictHint,
    triggerPredict,
  };
};
