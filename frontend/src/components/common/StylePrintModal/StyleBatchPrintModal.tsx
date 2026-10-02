/**
 * 批量打印配置抽屉（D-611 / D-611b）
 *
 * 列表勾选多单后统一弹出：勾选区块（与单一打印完全同一套 PrintOptionsSelector）勾一次，
 * 作用于全部选中单据；第一单实时预览（勾选联动，所见即每一单的样子）。
 * 两种打印方式：
 * - 逐单连打（主）：每单独立打印任务依次送出，页脚页码=本单 第X页/共Y页，不混编；
 * - 合并为一份（次）：一次确认整批送出，页码整批连续。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Space, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { BrandLoader } from '@/components/common/loading';

import SideDrawer from '@/components/common/SideDrawer';
import { useUser } from '@/utils/AuthContext';

import { DEFAULT_PRINT_OPTIONS, PrintOptions } from './types';
import PrintOptionsSelector from './sections/PrintOptionsSelector';
import StyleBatchPrintPreview from './StyleBatchPrintPreview';
import {
  BATCH_PRINT_MAX,
  prepareBatchDocs,
  runBatchStylePrint,
  runBatchStylePrintSequential,
  StyleBatchPrintItem,
} from './batchStylePrintService';

/** 从 localStorage 取打印人信息（与 useStylePrintData.handlePrint 同口径） */
function resolvePrinterInfo(): string {
  try {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const printerName = userInfo.name || userInfo.username || '未知用户';
    const printerAccount = userInfo.username || '';
    return printerAccount ? `打印人: ${printerName} (${printerAccount})` : `打印人: ${printerName}`;
  } catch {
    return '打印人: 未知用户';
  }
}

const StyleBatchPrintModal: React.FC<StyleBatchPrintModalProps> = ({ open, onClose, items }) => {
  const { message } = App.useApp();
  const { user } = useUser();

  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [fontScale, setFontScale] = useState<number>(1);
  const [busy, setBusy] = useState<null | { mode: 'sequential' | 'merged'; text: string }>(null);
  const [result, setResult] = useState<{ okCount: number; failed: string[] } | null>(null);
  const abortRef = React.useRef(false);

  // 每次打开重置为默认勾选与初始状态
  useEffect(() => {
    if (open) {
      setOptions(DEFAULT_PRINT_OPTIONS);
      setFontScale(1);
      setBusy(null);
      setResult(null);
      abortRef.current = false;
    }
  }, [open]);

  const mode = items[0]?.mode ?? 'sample';
  const overLimit = items.length > BATCH_PRINT_MAX;
  const validate = () => {
    if (!items.length) return false;
    if (!Object.values(options).some(v => v)) { message.warning('请至少选择一项打印内容'); return false; }
    if (overLimit) { message.error(`单批最多 ${BATCH_PRINT_MAX} 单，请减少勾选`); return false; }
    return true;
  };

  const prepare = async () => {
    abortRef.current = false;
    setResult(null);
    setBusy({ mode: 'sequential', text: '正在准备单据…' });
    const res = await prepareBatchDocs({
      items, options, user, printerInfo: resolvePrinterInfo(),
      onProgress: (done, total, current) => setBusy({ mode: 'sequential', text: `正在准备 ${done}/${total} 单${current ? `（${current}）` : ''}` }),
    });
    return res;
  };

  const summarize = (okCount: number, failed: string[], total: number, how: string) => {
    if (okCount === 0) message.error(`全部单据准备失败，未打印（${failed.join('、')}）`);
    else if (failed.length > 0) message.warning(`${how}成功 ${okCount}/${total} 单；失败：${failed.join('、')}`);
    else message.success(`${how}成功 ${okCount} 单`);
    setResult({ okCount, failed });
  };

  // 逐单连打：上一个打印窗口关闭后自动送出下一单，页码=本单 第X页/共Y页
  const handleSequential = async () => {
    if (!validate()) return;
    try {
      const { docs, failed, total } = await prepare();
      if (docs.length === 0) { summarize(0, failed, total, '逐单连打'); return; }
      const { printedCount } = await runBatchStylePrintSequential({
        docs, fontScale, tenantName: user?.tenantName,
        onDocStart: (i, t, styleNo) => setBusy({ mode: 'sequential', text: `正在打印第 ${i}/${t} 单：${styleNo}，请在打印窗口确认` }),
        isAborted: () => abortRef.current,
      });
      summarize(printedCount, [...failed], total, `逐单连打（确认 ${printedCount} 单）`);
    } catch (e) {
      console.error('[批量打印] 逐单连打失败:', e);
      message.error('逐单连打失败，请重试');
    } finally { setBusy(null); }
  };

  // 合并为一份：一次确认整批送出，页码整批连续
  const handleMerged = async () => {
    if (!validate()) return;
    try {
      abortRef.current = false;
      setResult(null);
      setBusy({ mode: 'merged', text: '正在准备单据…' });
      const res = await runBatchStylePrint({
        items, options, fontScale, tenantName: user?.tenantName, user, printerInfo: resolvePrinterInfo(),
        onProgress: (done, total, current) => setBusy({ mode: 'merged', text: `正在准备 ${done}/${total} 单${current ? `（${current}）` : ''}` }),
      });
      summarize(res.okCount, res.failed, res.total, '合并打印');
    } catch (e) {
      console.error('[批量打印] 合并打印失败:', e);
      message.error('合并打印失败，请重试');
    } finally { setBusy(null); }
  };

  const handleClose = () => {
    abortRef.current = true; // 中断尚未送出的逐单连打
    onClose();
  };

  const failedTags = useMemo(() => (result?.failed || []).map(f => (
    <Tag key={f} color="error">{f}</Tag>
  )), [result]);

  return (
    <SideDrawer
      open={open}
      title={<Space><PrinterOutlined />批量打印（{items.length} 单）</Space>}
      onClose={handleClose}
      width="75%"
      footer={
        <Space>
          <Button onClick={handleClose}>{result ? '关闭' : '取消'}</Button>
          <Button
            type="primary" icon={<PrinterOutlined />}
            loading={busy?.mode === 'sequential'}
            disabled={!items.length || overLimit || !!busy}
            onClick={() => void handleSequential()}
          >
            逐单连打 {items.length} 单（每单独立页码）
          </Button>
          <Button
            icon={<PrinterOutlined />}
            loading={busy?.mode === 'merged'}
            disabled={!items.length || overLimit || !!busy}
            onClick={() => void handleMerged()}
          >
            合并为一份（页码整批连续）
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--status-processing-bg)', borderRadius: 8, border: '1px solid var(--status-processing-border)' }}>
        <div style={{ fontWeight: 600, color: 'var(--color-primary-darker)' }}>
          已选 {items.length} 单，所有单据按下方统一勾选生成、与单独打印完全同款
        </div>
        {overLimit && (
          <div style={{ marginTop: 8, color: 'var(--color-danger, #ff4d4f)' }}>
            单批最多 {BATCH_PRINT_MAX} 单，当前 {items.length} 单，请减少勾选后重试
          </div>
        )}
      </div>

      {/* 统一勾选：与单一打印同一套选项组件 */}
      <PrintOptionsSelector
        options={options}
        onOptionsChange={setOptions}
        mode={mode}
        labelPrintMode={false}
        labelSize="40x70"
        onLabelSizeChange={() => undefined}
        labelCount={1}
        onLabelCountChange={() => undefined}
        labelPrinting={false}
        onLabelPrint={() => undefined}
        labelItems={[]}
        fontScale={fontScale}
        onFontScaleChange={setFontScale}
      />

      {/* 第一单实时预览：操作的人据此决定哪些信息显示/不显示 */}
      <StyleBatchPrintPreview open={open} item={items[0]} options={options} />

      {busy && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BrandLoader size={20} />
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{busy.text}</div>
        </div>
      )}

      {result && result.failed.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>失败 {result.failed.length} 单（未打印）：</div>
          {failedTags}
        </div>
      )}
    </SideDrawer>
  );
};

interface StyleBatchPrintModalProps {
  open: boolean;
  onClose: () => void;
  items: StyleBatchPrintItem[];
}

export default StyleBatchPrintModal;
