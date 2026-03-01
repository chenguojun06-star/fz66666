import { useCallback } from 'react';
import { intelligenceApi } from '@/services/production/productionApi';

/**
 * 扫码成功后静默提交反馈闭环数据 — 独立 hook，不阻断主流程
 *
 * 即使没有 predictionId，后端也会新建 orphan 条目，
 * 在下次 IntelligenceLearningJob 运行时纳入样本修正。
 */
export const useScanFeedback = () => {
  const submitScanFeedback = useCallback((params: {
    orderId?: string;
    orderNo?: string;
    stageName?: string;
    processName?: string;
  }) => {
    if (!params.orderId) return;

    // fire-and-forget，永远不阻断，永远不报错
    intelligenceApi.feedback({
      orderId: params.orderId,
      orderNo: params.orderNo,
      stageName: params.stageName,
      processName: params.processName,
      actualFinishTime: new Date().toISOString(),
      acceptedSuggestion: true,
    }).catch(() => {
      // 静默失败 — 反馈数据丢失不影响生产
    });
  }, []);

  return { submitScanFeedback };
};
