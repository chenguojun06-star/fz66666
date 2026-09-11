import React, { useState } from 'react';
import { Button, Dropdown, Spin, Tag, Upload, message } from 'antd';
import { CopyOutlined, DownOutlined, RobotOutlined } from '@ant-design/icons';
import StyleBomAddRowsDropdown from './StyleBomAddRowsDropdown';
import api from '@/utils/api';
import ResizableModal from '@/components/common/ResizableModal';
import type { SamplePurchaseStatus } from '../hooks/useStyleBomActions';
import TabToolbar from '@/components/common/TabToolbar';
import SmartPurchasePreviewModal from '@/modules/production/pages/Production/OrderFlow/components/SmartPurchasePreviewModal';

interface AiBomRecognizedItem {
  id: string;
  materialName: string;
  materialCode?: string;
  materialType?: string;
  color?: string;
  specification?: string;
  unit?: string;
  usageAmount?: number;
  lossRate?: number;
  supplier?: string;
  remark?: string;
}

interface StyleBomToolbarProps {
  dataLength: number;
  locked: boolean;
  loading: boolean;
  checkingStock: boolean;
  tableEditable: boolean;
  templateLoading: boolean;
  editingKey: string;
  onCheckStock: () => void;
  /** 缺料分析弹窗内的「生成全部」（免二次确认，保留重新生成警示） */
  onGenerateConfirmed: () => void;
  /** 缺料分析弹窗内的「仅缺料加入采购车」 */
  onShortageCart: (shortageRows: any[]) => void;
  onAddToPurchaseCart: () => void;
  onToggleEdit: () => void;
  onCancelEdit: () => void;
  onAddRows: (count: number) => void;
  styleId: string | number;
  styleNo?: string;
  purchaseStatus?: SamplePurchaseStatus;
  onBomRecognized: (items: AiBomRecognizedItem[]) => void;
  onOpenCopyBom: () => void;
}

const StyleBomToolbar: React.FC<StyleBomToolbarProps> = ({
  dataLength,
  locked,
  loading,
  checkingStock,
  tableEditable,
  templateLoading,
  editingKey,
  onCheckStock,
  onGenerateConfirmed,
  onShortageCart,
  onAddToPurchaseCart,
  onToggleEdit,
  onCancelEdit,
  onAddRows,
  styleId,
  styleNo,
  purchaseStatus,
  onBomRecognized,
  onOpenCopyBom,
}) => {
  const hasEditingRow = Boolean(editingKey);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFile, setOcrFile] = useState<any>(null);
  // D-360 统一「生成采购」缺料分析弹窗（样衣模式）
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const handleOcrRecognize = async () => {
    if (!ocrFile) {
      message.error('请先上传工艺单/面料清单图片');
      return;
    }
    setOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', ocrFile);

      const res = await api.post(`/style/info/${styleId}/recognize-bom-table`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      if (res.code !== 200) {
        message.error(res.message || 'AI识别失败');
      } else {
        const data = res.data || {};
        let items: AiBomRecognizedItem[] = [];

        if (Array.isArray(data.items) && data.items.length > 0) {
          items = data.items.map((row: any, idx: number) => ({
            id: `ai_${Date.now()}_${idx}`,
            materialName: String(row.materialName || '').trim() || '未识别物料',
            materialCode: String(row.materialCode || '').trim() || undefined,
            materialType: String(row.materialType || '').trim() || undefined,
            color: String(row.color || '').trim() || undefined,
            specification: String(row.specification || '').trim() || undefined,
            unit: String(row.unit || '').trim() || undefined,
            usageAmount: Number(row.usageAmount || 0) || undefined,
            lossRate: Number(row.lossRate || 0) || undefined,
            supplier: String(row.supplier || '').trim() || undefined,
            remark: String(row.remark || '').trim() || undefined,
          })).filter((it) => it.materialName && it.materialName !== '未识别物料');
        }

        if (items.length > 0) {
          onBomRecognized(items);
          setOcrModalOpen(false);
          setOcrFile(null);
          message.success(`识别成功：共解析出 ${items.length} 条物料`);
        } else {
          message.info('未识别出有效物料行，请尝试更清晰的图片');
        }
      }
    } catch (e: unknown) {
      console.error('[AI识别] 请求失败:', e);
      message.error(e instanceof Error ? e.message : 'AI识别失败，请重试');
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div>
    <TabToolbar
      left={
        <>
        <Button onClick={onCheckStock} disabled={!dataLength || loading} loading={checkingStock}>
          检查库存
        </Button>
        <Dropdown
          disabled={locked || !dataLength || loading}
          menu={{
            items: [
              { key: 'analyze', label: '缺料分析生成（推荐）' },
              { key: 'cart', label: '加入采购车（全部物料）' },
            ],
            onClick: ({ key }) => {
              if (key === 'analyze') setAnalysisOpen(true);
              else onAddToPurchaseCart();
            },
          }}
        >
          <Button type="primary" loading={loading}>
            生成采购 <DownOutlined />
          </Button>
        </Dropdown>
        {purchaseStatus?.generated ? (
          <Tag color="success" style={{ marginInlineEnd: 0 }}>已生成 {purchaseStatus.count} 条</Tag>
        ) : null}
        </>
      }
      center={
        <>
        {!tableEditable && !locked && (
          <Button
            icon={<RobotOutlined />}
            onClick={() => setOcrModalOpen(true)}
            disabled={loading || templateLoading}
          >
            AI识别BOM
          </Button>
        )}

        <StyleBomAddRowsDropdown
          onAddRows={onAddRows}
          disabled={locked || hasEditingRow || loading || templateLoading}
        />
        <Button
          icon={<CopyOutlined />}
          onClick={onOpenCopyBom}
          disabled={locked || hasEditingRow || loading || templateLoading}
        >
          拷贝其他款物料
        </Button>
        </>
      }
      right={
        <>
        <Button
          type={tableEditable ? 'primary' : 'default'}
          onClick={onToggleEdit}
          disabled={locked || loading || templateLoading || hasEditingRow || (!tableEditable && !dataLength)}
          loading={loading}
        >
          {tableEditable ? '保存' : '编辑'}
        </Button>
        {tableEditable ? <Button onClick={onCancelEdit} disabled={loading}>取消</Button> : null}
        </>
      }
    >
    </TabToolbar>

      {/* D-360 统一缺料分析弹窗：样衣模式（check-stock 分析 → 生成全部 / 仅缺料加入采购车） */}
      <SmartPurchasePreviewModal
        open={analysisOpen}
        styleId={styleId}
        styleNo={styleNo}
        generating={loading}
        onClose={() => setAnalysisOpen(false)}
        onGenerateAll={() => onGenerateConfirmed()}
        onGenerateShortage={(_reason, shortageRows) => onShortageCart(shortageRows || [])}
      />

      <ResizableModal
        title="AI识别物料清单"
        open={ocrModalOpen}
        onCancel={() => { setOcrModalOpen(false); setOcrFile(null); }}
        onOk={handleOcrRecognize}
        okText="识别"
        confirmLoading={ocrLoading}
        width="40vw"
      >
        <Spin spinning={ocrLoading} tip="正在识别，请稍候...">
          <div
            style={{ padding: '16px 0', outline: 'none' }}
            tabIndex={0}
            onPaste={(e) => {
              const f = e.clipboardData.files?.[0];
              if (f && f.type.startsWith('image/')) { e.preventDefault(); setOcrFile(f); }
            }}
          >
            <Upload.Dragger
              accept="image/*"
              maxCount={1}
              beforeUpload={(file) => {
                setOcrFile(file);
                return false;
              }}
              onRemove={() => setOcrFile(null)}
              fileList={ocrFile ? [{ uid: '-1', name: ocrFile.name, status: 'done', url: '', originFileObj: ocrFile }] : []}
            >
              <p className="ant-upload-drag-icon">
                <RobotOutlined style={{ fontSize: 48, color: 'var(--color-primary)' }} />
              </p>
              <p className="ant-upload-text">点击上传工艺单/面料清单图片</p>
              <p className="ant-upload-hint">
                支持 JPG、PNG 格式，自动解析物料名称、规格、数量
              </p>
            </Upload.Dragger>

            {!ocrLoading && ocrFile && (
              <div style={{ marginTop: 16, padding: 12, background: 'var(--color-success-bg-light, var(--status-success-bg))', borderRadius: 8, border: '1px solid var(--color-success-border, var(--status-success-border))' }}>
                <p style={{ margin: 0, color: 'var(--color-success)', fontWeight: 500 }}>
                  已选择: {ocrFile.name}
                </p>
                <p style={{ margin: '8px 0 0', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                  点击"识别"按钮开始AI分析
                </p>
              </div>
            )}
          </div>
        </Spin>
      </ResizableModal>
    </div>
  );
};

export default StyleBomToolbar;
