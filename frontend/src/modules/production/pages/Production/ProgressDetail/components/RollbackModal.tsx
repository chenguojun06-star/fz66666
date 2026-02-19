import React from 'react';
import { Form, Input, InputNumber, Segmented, Select, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { CuttingBundle } from '@/types/production';

type RollbackMode = 'step' | 'bundle';

type RollbackStepMeta = {
  nextProgress: number;
  nextProcessName: string;
} | null;

type RollbackModalProps = {
  open: boolean;
  confirmLoading: boolean;
  modalWidth: number | string;
  rollbackForm: any;
  rollbackMode: RollbackMode;
  rollbackStepMeta: RollbackStepMeta;
  rollbackBundlesLoading: boolean;
  rollbackBundles: CuttingBundle[];
  onCancel: () => void;
  onOk: () => void;
  onModeChange: (mode: RollbackMode) => void;
};

const { Text } = Typography;

const RollbackModal: React.FC<RollbackModalProps> = ({
  open,
  confirmLoading,
  modalWidth,
  rollbackForm,
  rollbackMode,
  rollbackStepMeta,
  rollbackBundlesLoading,
  rollbackBundles,
  onCancel,
  onOk,
  onModeChange,
}) => (
  <ResizableModal
    title="回流"
    open={open}
    centered
    onCancel={onCancel}
    onOk={onOk}
    confirmLoading={confirmLoading}
    okText="确认"
    cancelText="取消"
    width={modalWidth}
    scaleWithViewport
  >
    <Form form={rollbackForm} layout="vertical">
      <Form.Item label="回流方式" style={{ marginBottom: 8 }}>
        <Segmented
          value={rollbackMode}
          options={[
            { label: '退回上一步', value: 'step' },
            { label: '按扎号回退入库', value: 'bundle' },
          ]}
          onChange={(v) => onModeChange(v as RollbackMode)}
        />
      </Form.Item>

      {rollbackMode === 'step' ? (
        <>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary">
              目标：{rollbackStepMeta?.nextProcessName ? `退回到「${rollbackStepMeta.nextProcessName}」` : '-'}
            </Text>
          </div>
          <Form.Item label="问题点（必填）" name="stepRemark" rules={[{ required: true, message: '请填写问题点' }]}>
            <Input.TextArea placeholder="请输入问题点（必填）" autoSize={{ minRows: 3, maxRows: 6 }} />
          </Form.Item>
        </>
      ) : (
        <>
          <Form.Item label="选择扎号" name="selectedQr" rules={[{ required: true, message: '请选择扎号' }]}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder={rollbackBundlesLoading ? '加载中...' : '请选择扎号'}
              loading={rollbackBundlesLoading}
              options={rollbackBundles.map((b) => ({
                value: String(b.qrCode || ''),
                label: `扎号 ${b.bundleNo}｜码数 ${String(b.size || '-')}｜颜色 ${String(b.color || '-')}｜数量 ${Number(b.quantity) || 0}`,
              }))}
              onChange={(v) => {
                const code = String(v || '').trim();
                const b = rollbackBundles.find((x) => String(x.qrCode || '').trim() === code);
                rollbackForm.setFieldsValue({
                  scannedQr: code,
                  color: b?.color || '',
                  size: b?.size || '',
                  quantity: Number(b?.quantity) || 0,
                  rollbackQuantity: Number(b?.quantity) || 0,
                });
              }}
            />
          </Form.Item>

          <Form.Item label="扎号二维码（必须扫码）" name="scannedQr" rules={[{ required: true, message: '请扫码输入扎号二维码' }]}>
            <Input placeholder="选择扎号后自动带出" disabled />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Form.Item label="颜色" name="color">
              <Input disabled />
            </Form.Item>
            <Form.Item label="码数" name="size">
              <Input disabled />
            </Form.Item>
            <Form.Item label="扎号数量" name="quantity">
              <InputNumber style={{ width: '100%' }} disabled />
            </Form.Item>
            <Form.Item label="回退数量" name="rollbackQuantity">
              <InputNumber style={{ width: '100%' }} disabled />
            </Form.Item>
          </div>

          <Form.Item label="问题点（必填）" name="remark" rules={[{ required: true, message: '请填写问题点' }]}>
            <Input.TextArea placeholder="请输入问题点（必填）" autoSize={{ minRows: 3, maxRows: 6 }} />
          </Form.Item>
        </>
      )}
    </Form>
  </ResizableModal>
);

export default RollbackModal;
