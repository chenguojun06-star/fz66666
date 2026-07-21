import React from 'react';
import { Button, Input, Space } from 'antd';

interface Props {
  productionReqLocked: boolean;
  productionReqSaving: boolean;
  allRequirements: string;
  onProductionReqSave: () => void;
  onDownloadWorkorder: () => void;
  onPrintWorkorder: () => void;
  onOpenOcr: () => void;
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const ProductionRequirementsSection: React.FC<Props> = ({
  productionReqLocked,
  productionReqSaving,
  allRequirements,
  onProductionReqSave,
  onDownloadWorkorder,
  onPrintWorkorder,
  onOpenOcr,
  onTextChange,
}) => {
  return (
    <div style={{
      border: '1px solid var(--color-border, var(--color-border))',
      borderRadius: 6,
      padding: '16px',
      marginBottom: 16,
      background: 'var(--color-bg-card, var(--color-bg-base))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: 0.5,
            paddingLeft: 10,
            borderLeft: '3px solid var(--color-primary)',
          }}>生产要求</span>
        </div>
        <Space size={8} wrap>
          {!productionReqLocked && (
            <Button
              type="primary"
              loading={productionReqSaving}
              onClick={onProductionReqSave}
            >
              保存生产要求
            </Button>
          )}
          <Button onClick={onDownloadWorkorder}>
            下载制单
          </Button>
          <Button onClick={onPrintWorkorder}>
            打印制单
          </Button>
          {!productionReqLocked && (
            <Button onClick={onOpenOcr}>
              AI识别工艺单
            </Button>
          )}
        </Space>
      </div>
      <div style={{ color: 'var(--color-text-tertiary, var(--color-text-secondary))', fontSize: 14, marginBottom: 8 }}>
        相关文件请在"文件管理"标签页统一上传
      </div>
      <Input.TextArea
        id="productionRequirements"
        value={allRequirements}
        onChange={onTextChange}
        disabled={productionReqLocked}
        placeholder="请输入生产要求，每行填写一条内容&#10;例如：&#10;1. 面料预缩水处理&#10;2. 缝制线迹密度12针/3cm&#10;3. 领型对称偏差≤0.3cm"
        autoSize={{ minRows: 12 }}
        style={{
          fontFamily: "'PingFang SC', 'Microsoft YaHei', monospace",
          fontSize: 14,
          lineHeight: '2',
          padding: '14px 16px',
          borderRadius: 6,
          minHeight: 320,
        }}
      />
    </div>
  );
};

export default ProductionRequirementsSection;
