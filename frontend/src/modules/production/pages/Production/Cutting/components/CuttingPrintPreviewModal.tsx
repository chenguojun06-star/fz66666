import React from 'react';
import { Button } from 'antd';
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

  const orderNo = String(print.printBundles[0]?.productionOrderNo || '').trim() || '-';
  const styleNo = String(print.printBundles[0]?.styleNo || '').trim() || '-';

  // 按颜色+码数分组统计
  const groupedMap = new Map<string, { color: string; size: string; bundleCount: number; totalQty: number }>();
  for (const b of print.printBundles) {
    const color = String(b.color || '').trim() || '-';
    const size = String(b.size || '').trim() || '-';
    const key = `${color}|||${size}`;
    if (!groupedMap.has(key)) groupedMap.set(key, { color, size, bundleCount: 0, totalQty: 0 });
    const g = groupedMap.get(key)!;
    g.bundleCount++;
    g.totalQty += Number(b.quantity || 0);
  }
  const rows = [...groupedMap.values()];
  const totalBundles = print.printBundles.length;
  const totalQty = rows.reduce((s, r) => s + r.totalQty, 0);

  return (
    <ResizableModal
      open={print.printPreviewOpen}
      title={`裁剪汇总打印（${totalBundles} 扎 · ${totalQty} 件）`}
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
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600}
    >
      {/* 汇总信息栏 */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--primary-color)',
          color: '#fff',
          marginBottom: '8px',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: 600,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <span>订单号：{orderNo}</span>
        <span>款号：{styleNo}</span>
        <span>共 {totalBundles} 扎 · 共 {totalQty} 件</span>
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
          <div style={{ fontWeight: 600, marginBottom: '4px' }}> 本次拆菲新生成的子菲号</div>
          <div>{highlightedBundles.map((item) => String(item.bundleLabel || item.bundleNo || '-')).join('、')}</div>
        </div>
      )}

      {/* 汇总表格 */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px',
        }}
      >
        <thead>
          <tr style={{ background: 'var(--color-bg-subtle)' }}>
            {(['颜色', '码数', '扎数', '数量合计'] as const).map((col) => (
              <th
                key={col}
                style={{
                  border: '1px solid var(--neutral-border)',
                  padding: '8px 12px',
                  textAlign: 'center',
                  fontWeight: 600,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : 'var(--color-bg-subtle)' }}>
              <td style={{ border: '1px solid var(--neutral-border)', padding: '7px 12px', textAlign: 'center' }}>{r.color}</td>
              <td style={{ border: '1px solid var(--neutral-border)', padding: '7px 12px', textAlign: 'center' }}>{r.size}</td>
              <td style={{ border: '1px solid var(--neutral-border)', padding: '7px 12px', textAlign: 'center' }}>{r.bundleCount}</td>
              <td style={{ border: '1px solid var(--neutral-border)', padding: '7px 12px', textAlign: 'center', fontWeight: 600 }}>{r.totalQty}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--color-bg-subtle)', fontWeight: 700 }}>
            <td colSpan={2} style={{ border: '1px solid var(--neutral-border)', padding: '8px 12px', textAlign: 'center' }}>合计</td>
            <td style={{ border: '1px solid var(--neutral-border)', padding: '8px 12px', textAlign: 'center' }}>{totalBundles}</td>
            <td style={{ border: '1px solid var(--neutral-border)', padding: '8px 12px', textAlign: 'center' }}>{totalQty}</td>
          </tr>
        </tfoot>
      </table>
    </ResizableModal>
  );
};

export default CuttingPrintPreviewModal;
