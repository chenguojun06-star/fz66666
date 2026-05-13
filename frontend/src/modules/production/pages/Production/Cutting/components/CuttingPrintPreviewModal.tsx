import React from 'react';
import { Button, InputNumber, Segmented } from 'antd';
import { QRCodeCanvas } from 'qrcode.react';
import ResizableModal from '@/components/common/ResizableModal';
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
  const highlightedSet = new Set((print.highlightedBundleIds || []).map((item) => String(item)));
  const highlightedBundles = print.printBundles.filter((item) => item.id && highlightedSet.has(String(item.id)));

  const totalBundles = print.printBundles.length;
  const totalQty = print.printBundles.reduce((s, b) => s + Number(b.quantity || 0), 0);

  return (
    <ResizableModal
      open={print.printPreviewOpen}
      title={`批量打印（${totalBundles}张）`}
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
      initialHeight={typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.85) : 700}
    >
      {/* 纸张配置 */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--color-bg-subtle)',
          borderRadius: '4px',
          marginBottom: '12px',
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '13px' }}>纸张设置：</span>
        <Segmented
         
          value={print.printConfig.orientation}
          onChange={(v) => print.setOrientation(v as 'horizontal' | 'vertical')}
          options={[
            { label: '横版 7×4cm', value: 'horizontal' },
            { label: '竖版 4×6cm', value: 'vertical' },
          ]}
        />
        <span style={{ fontSize: '13px' }}>
          宽&nbsp;
          <InputNumber
           
            min={2}
            max={30}
            step={0.5}
            value={print.printConfig.paperWidth}
            onChange={(v) => print.setPrintConfig({ ...print.printConfig, paperWidth: v ?? 4 })}
            style={{ width: 70 }}
          />
          &nbsp;cm
        </span>
        <span style={{ fontSize: '13px' }}>
          高&nbsp;
          <InputNumber
           
            min={2}
            max={30}
            step={0.5}
            value={print.printConfig.paperHeight}
            onChange={(v) => print.setPrintConfig({ ...print.printConfig, paperHeight: v ?? 6 })}
            style={{ width: 70 }}
          />
          &nbsp;cm
        </span>
        <span style={{ fontSize: '13px' }}>
          QR大小&nbsp;
          <InputNumber
           
            min={40}
            max={200}
            step={4}
            value={print.printConfig.qrSize}
            onChange={(v) => print.setPrintConfig({ ...print.printConfig, qrSize: v ?? 72 })}
            style={{ width: 70 }}
          />
          &nbsp;px
        </span>
      </div>

      {/* 汇总信息栏 */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--primary-color)',
          color: '#fff',
          marginBottom: '8px',
          borderRadius: '4px',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <span>共 {totalBundles} 张标签</span>
        <span>实际尺寸：{print.printConfig.paperWidth}cm × {print.printConfig.paperHeight}cm</span>
        <span>共 {totalQty} 件</span>
      </div>

      {/* 使用说明 */}
      <div
        style={{
          padding: '8px 14px',
          background: '#f6ffed',
          color: '#389e0d',
          marginBottom: '12px',
          borderRadius: '4px',
          border: '1px solid #b7eb8f',
          fontSize: '12px',
          lineHeight: '1.7',
        }}
      >
        每张标签对应一扎菲号，包含QR码及订单/款号/颜色/码数/数量/扎号信息。
        调整纸张尺寸以匹配标签纸规格，点击"下载/打印"后使用系统打印对话框选择标签打印机。
      </div>

      {/* 拆菲新生成子菲号提示 */}
      {!!highlightedBundles.length && (
        <div
          style={{
            padding: '10px 16px',
            background: '#fff7e6',
            color: '#ad6800',
            marginBottom: '12px',
            borderRadius: '4px',
            border: '1px solid #ffd591',
            fontSize: '13px',
            lineHeight: '1.6',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>⚡ 本次拆菲新生成的子菲号</div>
          <div>{highlightedBundles.map((item) => String(item.bundleLabel || item.bundleNo || '-')).join('、')}</div>
        </div>
      )}

      {/* QR标签预览列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {print.printBundles.map((b, idx) => {
          const isVertical = print.printConfig.orientation === 'vertical';
          const paperRatio = print.printConfig.paperWidth / print.printConfig.paperHeight;
          const previewWidth = isVertical ? 160 : 280;
          const previewHeight = Math.round(previewWidth / paperRatio);
          const qrDisplaySize = Math.min(
            isVertical ? previewWidth - 40 : previewHeight - 20,
            print.printConfig.qrSize
          );

          return (
            <div
              key={b.id || `${b.qrCode || ''}-${idx}`}
              style={{
                width: `${previewWidth}px`,
                height: `${previewHeight}px`,
                margin: '0 auto',
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
                  flexDirection: isVertical ? 'column' : 'row',
                  alignItems: isVertical ? 'center' : undefined,
                  gap: '6px',
                }}
              >
                <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {b.qrCode ? (
                    <QRCodeCanvas value={b.qrCode} size={qrDisplaySize} includeMargin />
                  ) : (
                    <div style={{ width: qrDisplaySize, height: qrDisplaySize, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999' }}>
                      无QR
                    </div>
                  )}
                </div>
                <div
                  style={{
                    flex: isVertical ? '0 0 auto' : '1 1 auto',
                    fontSize: '11px',
                    lineHeight: '1.3',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-around',
                    alignItems: isVertical ? 'center' : undefined,
                    textAlign: isVertical ? 'center' : undefined,
                  }}
                >
                  <div>{`订单：${String(b.productionOrderNo || '').trim() || '-'}`}</div>
                  <div>{`款号：${String(b.styleNo || '').trim() || '-'}`}</div>
                  <div>{`颜色：${String(b.color || '').trim() || '-'}`}</div>
                  <div>{`码数：${String(b.size || '').trim() || '-'}`}</div>
                  <div>{`数量：${Number(b.quantity || 0)}`}</div>
                  <div>{`扎号：${String(b.bundleLabel || '').trim() || Number(b.bundleNo || 0) || '-'}`}</div>
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
