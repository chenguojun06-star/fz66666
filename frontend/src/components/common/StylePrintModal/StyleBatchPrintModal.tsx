/**
 * 批量打印配置抽屉（D-611）
 *
 * 列表勾选多单后统一弹出：勾选区块（与单一打印完全同一套 PrintOptionsSelector）勾一次，
 * 作用于全部选中单据；确认后逐款装载数据并合并成一份文档、safePrint 一次打印。
 * 单据本身的渲染与单一打印共享同一正文组件（StylePrintDocBody），外观不因批量而变。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Progress, Space, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';

import SideDrawer from '@/components/common/SideDrawer';
import { useUser } from '@/utils/AuthContext';

import { DEFAULT_PRINT_OPTIONS, PrintOptions } from './types';
import PrintOptionsSelector from './sections/PrintOptionsSelector';
import {
  BATCH_PRINT_MAX,
  runBatchStylePrint,
  StyleBatchPrintItem,
} from './batchStylePrintService';

interface StyleBatchPrintModalProps {
  open: boolean;
  onClose: () => void;
  items: StyleBatchPrintItem[];
}

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
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [result, setResult] = useState<{ okCount: number; failed: string[] } | null>(null);

  // 每次打开重置为默认勾选与初始状态
  useEffect(() => {
    if (open) {
      setOptions(DEFAULT_PRINT_OPTIONS);
      setFontScale(1);
      setProgress(null);
      setResult(null);
    }
  }, [open]);

  const mode = items[0]?.mode ?? 'sample';
  const overLimit = items.length > BATCH_PRINT_MAX;

  const handlePrint = async () => {
    if (!items.length) return;
    if (!Object.values(options).some(v => v)) {
      message.warning('请至少选择一项打印内容');
      return;
    }
    setPrinting(true);
    setResult(null);
    setProgress({ done: 0, total: items.length, current: '' });
    try {
      const res = await runBatchStylePrint({
        items,
        options,
        fontScale,
        tenantName: user?.tenantName,
        user,
        printerInfo: resolvePrinterInfo(),
        onProgress: (done, total, current) => setProgress({ done, total, current }),
      });
      if (res.okCount === 0) {
        message.error(`全部单据准备失败，未发送打印（${res.failed.join('、')}）`);
      } else if (res.failed.length > 0) {
        message.warning(`已发送 ${res.okCount}/${res.total} 单到打印机；失败：${res.failed.join('、')}`);
      } else {
        message.success(`已发送 ${res.okCount} 单到打印机（合并为一份，打印机对话框只弹一次）`);
      }
      setResult({ okCount: res.okCount, failed: res.failed });
    } catch (e) {
      console.error('[批量打印] 执行失败:', e);
      message.error('批量打印失败，请重试');
    } finally {
      setPrinting(false);
      setProgress(null);
    }
  };

  const failedTags = useMemo(() => (result?.failed || []).map(f => (
    <Tag key={f} color="error">{f}</Tag>
  )), [result]);

  return (
    <SideDrawer
      open={open}
      title={<Space><PrinterOutlined />批量打印（{items.length} 单）</Space>}
      onClose={onClose}
      width="60%"
      footer={
        <Space>
          <Button onClick={onClose}>{result ? '关闭' : '取消'}</Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => void handlePrint()}
            loading={printing}
            disabled={!items.length || overLimit}
          >
            打印 {items.length} 单
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--status-processing-bg)', borderRadius: 8, border: '1px solid var(--status-processing-border)' }}>
        <div style={{ fontWeight: 600, color: 'var(--color-primary-darker)' }}>
          已选 {items.length} 单，所有单据按下方统一勾选生成，合并为一份一次打印
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

      {progress && (
        <div style={{ marginTop: 16 }}>
          <Progress
            percent={Math.round((progress.done / Math.max(1, progress.total)) * 100)}
            size="small"
            status="active"
          />
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
            正在准备 {progress.done}/{progress.total} 单{progress.current ? `（${progress.current}）` : ''}
          </div>
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

export default StyleBatchPrintModal;
