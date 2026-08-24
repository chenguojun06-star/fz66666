import React, { useState } from 'react';
import { Button, Dropdown, Select, Space, Spin, Tag, Tooltip, Upload, message } from 'antd';
import { DownOutlined, ReloadOutlined, RobotOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import type { TemplateLibrary } from '@/types/style';
import StyleBomAddRowsDropdown from './StyleBomAddRowsDropdown';
import api from '@/utils/api';
import ResizableModal from '@/components/common/ResizableModal';
import type { SamplePurchaseStatus } from '../hooks/useStyleBomActions';

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
  bomTemplateId?: string;
  bomTemplates: TemplateLibrary[];
  onBomTemplateIdChange: (value?: string) => void;
  onTemplateOpenChange: (open: boolean) => void;
  onApplyTemplate: (mode: 'overwrite' | 'append') => void;
  onCheckStock: () => void;
  onGeneratePurchase: () => void;
  onAddToPurchaseCart: () => void;
  onToggleEdit: () => void;
  onCancelEdit: () => void;
  onAddRows: (count: number) => void;
  styleId: string | number;
  purchaseStatus?: SamplePurchaseStatus;
  onBomRecognized: (items: AiBomRecognizedItem[]) => void;
}

const toolbarStyle = {
  marginBottom: 16,
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
} as const;

const StyleBomToolbar: React.FC<StyleBomToolbarProps> = ({
  dataLength,
  locked,
  loading,
  checkingStock,
  tableEditable,
  templateLoading,
  editingKey,
  bomTemplateId,
  bomTemplates,
  onBomTemplateIdChange,
  onTemplateOpenChange,
  onApplyTemplate,
  onCheckStock,
  onGeneratePurchase,
  onAddToPurchaseCart,
  onToggleEdit,
  onCancelEdit,
  onAddRows,
  styleId,
  purchaseStatus,
  onBomRecognized,
}) => {
  const hasEditingRow = Boolean(editingKey);
  const templateOptions = bomTemplates.map((template) => ({
    value: String(template.id || ''),
    label: template.sourceStyleNo ? `${template.templateName}（${template.sourceStyleNo}）` : template.templateName,
  }));

  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFile, setOcrFile] = useState<any>(null);

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
    <div style={toolbarStyle}>
      <Space wrap>
        <Button onClick={onCheckStock} disabled={!dataLength || loading} loading={checkingStock}>
          检查库存
        </Button>
        {purchaseStatus?.generated ? (
          <Space size={4}>
            <Tooltip title={`该款式已生成过样衣采购（共 ${purchaseStatus.count} 条，待采购 ${purchaseStatus.pendingCount} 条）。点击将删除旧的【待采购】记录并重新生成，已领取/已完成的不受影响`}>
              <Button
                icon={<ReloadOutlined />}
                onClick={onGeneratePurchase}
                disabled={locked || !dataLength || loading}
                loading={loading}
              >
                重新生成采购单
              </Button>
            </Tooltip>
            <Tag color="success" style={{ marginInlineEnd: 0 }}>已生成采购 {purchaseStatus.count} 条</Tag>
          </Space>
        ) : (
          <Button
            type="primary"
            onClick={onGeneratePurchase}
            disabled={locked || !dataLength || loading}
            loading={loading}
          >
            生成采购单
          </Button>
        )}
        <Tooltip title="放入采购车草稿，可与其它款式合并下单后统一确认；单款式采购直接点「生成采购单」更快">
          <Button
            icon={<ShoppingCartOutlined />}
            onClick={onAddToPurchaseCart}
            disabled={locked || !dataLength || loading}
            loading={loading}
          >
            加入采购车
          </Button>
        </Tooltip>
        <Button
          type={tableEditable ? 'primary' : 'default'}
          onClick={onToggleEdit}
          disabled={locked || loading || templateLoading || hasEditingRow || (!tableEditable && !dataLength)}
          loading={loading}
        >
          {tableEditable ? '保存' : '编辑'}
        </Button>
        {tableEditable ? <Button onClick={onCancelEdit} disabled={loading}>取消</Button> : null}

        {!tableEditable && !locked && (
          <Button
            icon={<RobotOutlined />}
            onClick={() => setOcrModalOpen(true)}
            disabled={loading || templateLoading}
          >
            AI识别BOM
          </Button>
        )}

        <Select
          allowClear
          placeholder="导入物料清单模板"
          value={bomTemplateId}
          style={{ width: 240 }}
          options={templateOptions}
          onChange={(value) => onBomTemplateIdChange(value)}
          disabled={locked || hasEditingRow || loading || templateLoading}
          onOpenChange={onTemplateOpenChange}
        />

        <Dropdown
          disabled={locked || hasEditingRow || loading || templateLoading || !bomTemplateId}
          menu={{
            items: [
              { key: 'overwrite', label: '覆盖导入（清除现有数据）' },
              { key: 'append', label: '追加导入（保留现有数据）' },
            ],
            onClick: ({ key }) => onApplyTemplate(key as 'overwrite' | 'append'),
          }}
        >
          <Button disabled={locked || hasEditingRow || loading || templateLoading || !bomTemplateId}>
            导入模板 <DownOutlined />
          </Button>
        </Dropdown>

        <StyleBomAddRowsDropdown
          onAddRows={onAddRows}
          disabled={locked || hasEditingRow || loading || templateLoading}
        />
      </Space>

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
          <div style={{ padding: '16px 0', outline: 'none' }}>
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
