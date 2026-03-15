import React from 'react';
import { Button, InputNumber, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { QRCodeCanvas } from 'qrcode.react';
import type { CuttingPrintState } from '../hooks';
import type { CuttingBundleRow } from '../hooks';

interface Props {
  modalWidth: string | number;
  print: CuttingPrintState;
  bundles: {
    selectedBundles: CuttingBundleRow[];
    clearBundleSelection: () => void;
  };
}

const CuttingPrintPreviewModal: React.FC<Props> = ({ modalWidth, print, bundles }) => {
  return (
    <ResizableModal
      open={print.printPreviewOpen}
      title={`批量打印（${print.printBundles.length}张）`}
      width={modalWidth}
      centered
      onCancel={() => print.setPrintPreviewOpen(false)}
      footer={[
        <Button key="clear" onClick={bundles.clearBundleSelection} disabled={!bundles.selectedBundles.length}>
          清除勾选
        </Button>,
        <Button key="cancel" onClick={() => print.setPrintPreviewOpen(false)}>
          关闭
        </Button>,
        <Button key="print" type="primary" onClick={print.triggerPrint} disabled={!print.printBundles.length}>
          下载/打印
        </Button>,
      ]}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>打印纸规格</span>
        <Select
          value={print.printConfig.paperSize}
          style={{ width: 150 }}
          options={[
            { label: '7cm × 4cm', value: '7x4' },
            { label: '10cm × 5cm', value: '10x5' },
          ]}
          onChange={(v) => print.setPrintConfig((p) => ({ ...p, paperSize: v as '7x4' | '10x5' }))}
        />
        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginLeft: 16 }}>二维码大小</span>
        <InputNumber
          min={60}
          max={150}
          value={print.printConfig.qrSize}
          onChange={(v) => print.setPrintConfig((p) => ({ ...p, qrSize: Math.max(60, Number(v) || 84) }))}
          suffix="px"
          style={{ width: 120 }}
        />
        <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)', marginLeft: 16 }}>💡 每页打印一张菲号标签</span>
      </div>

      <div
        style={{
          padding: '12px 16px',
          background: 'var(--primary-color)',
          color: '#fff',
          marginBottom: '8px',
          borderRadius: '4px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        共 {print.printBundles.length} 张菲号标签，实际尺寸：{print.printConfig.paperSize === '7x4' ? '7cm × 4cm' : '10cm × 5cm'}（一页一张，居中显示）
      </div>
      <div
        style={{
          padding: '10px 16px',
          background: '#d4edda',
          color: '#155724',
          marginBottom: '16px',
          borderRadius: '4px',
          border: '1px solid #28a745',
          fontSize: '13px',
          lineHeight: '1.6',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>✅ 使用说明：</div>
        <div>• 点击"下载/打印"后直接选择打印机或"另存为PDF"即可</div>
        <div>• 标签已按固定尺寸设置，无需手动调整纸张大小</div>
        <div>• 每张标签独占一页，居中显示，方便裁剪</div>
        <div>• 建议使用专用标签打印机或A4纸打印后裁剪</div>
      </div>
      <div
        style={{
          maxHeight: 'calc(85vh - 310px)',
          overflowY: 'auto',
          padding: '16px',
          background: 'var(--color-bg-subtle)',
        }}
      >
        {print.printBundles.map((b, idx) => {
          const paperRatio = print.printConfig.paperSize === '7x4' ? (70 / 40) : (100 / 50);
          const previewWidth = 280;
          const previewHeight = previewWidth / paperRatio;

          return (
            <div
              key={b.id || `${b.qrCode || ''}-${idx}`}
              style={{
                width: `${previewWidth}px`,
                height: `${previewHeight}px`,
                margin: '0 auto 16px',
                background: 'var(--neutral-white)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '8px',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  border: '1px solid #000',
                  padding: '6px',
                  display: 'flex',
                  gap: '6px',
                }}
              >
                <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
                  {b.qrCode ? <QRCodeCanvas value={b.qrCode} size={Math.min(previewHeight - 20, print.printConfig.qrSize)} includeMargin /> : null}
                </div>
                <div
                  style={{
                    flex: '1 1 auto',
                    fontSize: '11px',
                    lineHeight: '1.3',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-around',
                  }}
                >
                  <div>{`订单：${String(b.productionOrderNo || '').trim() || '-'}`}</div>
                  <div>{`款号：${String(b.styleNo || '').trim() || '-'}`}</div>
                  <div>{`颜色：${String(b.color || '').trim() || '-'}`}</div>
                  <div>{`码数：${String(b.size || '').trim() || '-'}`}</div>
                  <div>{`数量：${Number(b.quantity || 0)}`}</div>
                  <div>{`扎号：${Number(b.bundleNo || 0) || '-'}`}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ResizableModal>
  );
};

export default CuttingPrintPreviewModal;
