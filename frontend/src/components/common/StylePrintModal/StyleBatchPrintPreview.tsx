/**
 * 批量打印·第一单实时预览（D-611b）
 *
 * 用户要求：批量打印抽屉里要看到「排第一的单」的内容，操作的人据此判断哪些信息显示/不显示。
 * 预览走与正式打印完全相同的共享正文组件（StylePrintDocBody）+ 同一份数据装载服务，
 * 勾选变化时实时联动——所见即每一单将要打出来的样子。
 */
import React, { useEffect, useMemo, useState } from 'react';
import QRCodeLib from 'qrcode';
import { Empty, Spin } from 'antd';

import { useUser } from '@/utils/AuthContext';

import { PrintOptions } from './types';
import { parseSizeColorMatrix } from './printDataTransform';
import { fetchStylePrintData } from './fetchStylePrintData';
import StylePrintDocBody from './StylePrintDocBody';
import { STYLE_PRINT_CONTENT_CSS } from './stylePrintContentCss';
import type { StyleBatchPrintItem } from './batchStylePrintService';

interface StyleBatchPrintPreviewProps {
  open: boolean;
  item: StyleBatchPrintItem | undefined;
  options: PrintOptions;
}

const StyleBatchPrintPreview: React.FC<StyleBatchPrintPreviewProps> = ({ open, item, options }) => {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof fetchStylePrintData>> | null>(null);
  const [qrPngDataUrl, setQrPngDataUrl] = useState('');

  // 打开时装载第一单数据（与正式打印同源）
  useEffect(() => {
    if (!open || !item?.styleId) { setBundle(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const b = await fetchStylePrintData({
          styleId: item.styleId,
          styleNo: item.styleNo,
          styleName: item.styleName,
          mode: item.mode,
          orderId: item.orderId,
          orderNo: item.orderNo,
          cover: item.cover,
          patternProductionId: item.patternProductionId,
        });
        if (cancelled) return;
        setBundle(b);
      } catch {
        if (!cancelled) setBundle(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, item?.styleId, item?.mode, item?.orderId, item?.orderNo, item?.styleNo, item?.cover, item?.patternProductionId, item?.styleName]);

  // 主二维码 dataURL（与正式打印同一算法）
  useEffect(() => {
    let cancelled = false;
    setQrPngDataUrl('');
    if (bundle?.qrValue) {
      QRCodeLib.toDataURL(bundle.qrValue, { width: 640, margin: 2, errorCorrectionLevel: 'H' })
        .then(url => { if (!cancelled) setQrPngDataUrl(url); })
        .catch(() => { if (!cancelled) setQrPngDataUrl(''); });
    }
    return () => { cancelled = true; };
  }, [bundle?.qrValue]);

  const sizeColorMatrix = useMemo(
    () => parseSizeColorMatrix(item?.sizeColorConfig || item?.extraInfo?.sizeColorConfig),
    [item?.sizeColorConfig, item?.extraInfo],
  );

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>
        打印预览（第一单：{item?.styleNo || '-'}，其余单据按同样式生成，勾选实时联动）
      </div>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, background: 'var(--color-bg-base)', minHeight: 120 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="正在装载第一单数据…" /></div>
        ) : bundle ? (
          <>
            <style>{STYLE_PRINT_CONTENT_CSS}</style>
            <div className="style-print-content">
              <StylePrintDocBody
                options={options}
                data={bundle.data}
                sizeColorMatrix={sizeColorMatrix}
                sizeDetails={item?.sizeDetails || []}
                styleNo={item?.styleNo || ''}
                styleName={item?.styleName || ''}
                category={item?.category}
                season={item?.season}
                mode={item?.mode || 'sample'}
                orderNo={item?.orderNo}
                orderCreatorName={bundle.orderCreatorName}
                extraInfo={item?.extraInfo || {}}
                resolvedCover={bundle.resolvedCover}
                qrPngDataUrl={qrPngDataUrl}
                qrValue={bundle.qrValue}
                user={user}
              />
            </div>
          </>
        ) : (
          <Empty description={item?.styleId ? '第一单数据装载失败' : '该单缺少款式ID，无法预览（仍可打印）'} />
        )}
      </div>
    </div>
  );
};

export default StyleBatchPrintPreview;
