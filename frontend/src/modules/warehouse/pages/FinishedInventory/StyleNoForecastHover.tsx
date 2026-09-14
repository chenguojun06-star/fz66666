import React, { useState, useCallback } from 'react';
import { Tooltip } from 'antd';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { SalesForecastResponse, SizeCurveResponse } from '@/services/intelligence/intelligenceTypes';

export function StyleNoForecastHover({ styleNo }: { styleNo: string }) {
  const [forecast, setForecast] = useState<SalesForecastResponse | null>(null);
  const [sizeCurve, setSizeCurve] = useState<SizeCurveResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchForecast = useCallback(async () => {
    if (!styleNo || forecast) return;
    setLoading(true);
    try {
      const [fRes, sRes] = await Promise.all([
        intelligenceApi.getSalesForecast(styleNo),
        intelligenceApi.getSizeCurve(styleNo),
      ]);
      setForecast((fRes as any)?.data ?? fRes);
      setSizeCurve((sRes as any)?.data ?? sRes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [styleNo, forecast]);

  const sizeEntries = sizeCurve?.sizeCurve ? Object.entries(sizeCurve.sizeCurve) : [];

  return (
    <Tooltip
      title={
        loading ? (
          '加载中...'
        ) : forecast ? (
          <div className="u-fs-14 u-lh-18" style={{ minWidth: 160 }}>
            <div className="u-fw-600 u-mb-4">销量预测（{forecast.horizonMonths}个月）</div>
            <div>预测: <b>{forecast.predictedQty}</b> 件</div>
            <div>乐观: {forecast.optimistic} / 悲观: {forecast.pessimistic}</div>
            <div>置信度: {forecast.confidence}%</div>
            {sizeEntries.length > 0 && (
              <>
                <div className="u-fw-600 u-mt-6 u-mb-4">尺码曲线</div>
                {sizeEntries.map(([size, pct]) => (
                  <div key={size} className="u-d-flex u-jc-between">
                    <span>{size}</span>
                    <span>{pct}%</span>
                  </div>
                ))}
                <div className="u-mt-2" style={{ color: 'var(--color-text-tertiary)' }}>样本 {sizeCurve!.sampleCount} 条，置信 {sizeCurve!.confidence}%</div>
              </>
            )}
          </div>
        ) : (
          '悬停查看预测'
        )
      }
      onOpenChange={(open) => {
        if (open) fetchForecast();
      }}
    >
      <span className="u-fw-600 u-cur-pointer" style={{ color: 'var(--primary-color)' }}>
        {styleNo}
      </span>
    </Tooltip>
  );
}
