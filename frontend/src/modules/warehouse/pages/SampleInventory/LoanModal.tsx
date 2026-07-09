import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, DatePicker, Select, Radio, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { SampleStock } from './types';
import api from '@/utils/api';
import { formatDateTimeSecond } from '@/utils/datetime';
import dayjs from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { message } from '@/utils/antdStatic';
import { factoryApi } from '@/services/system/factoryApi';

interface LoanModalProps {
  visible: boolean;
  stock?: SampleStock;
  onCancel: () => void;
  onSuccess: () => void;
}

const LoanModal: React.FC<LoanModalProps> = ({ visible, stock, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const [factoryOptions, setFactoryOptions] = useState<{ label: string; value: string }[]>([]);

  const lendToType = Form.useWatch('lendToType', form);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '重试提交' });
  };

  useEffect(() => {
    if (visible && stock) {
      form.resetFields();
      form.setFieldValue('lendToType', 'person');
    }
  }, [visible, stock, form]);

  useEffect(() => {
    if (visible) {
      factoryApi.list({ page: 1, pageSize: 500, status: 'active' }).then(res => {
        const records = res?.data?.records || [];
        setFactoryOptions(records.map((f: any) => ({
          label: f.factoryName || f.name || f.id,
          value: f.id,
        })));
      }).catch((err) => { console.error('工厂列表加载失败:', err); });
    }
  }, [visible]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const payload: Record<string, any> = {
        sampleStockId: stock?.id,
        borrower: values.borrower,
        quantity: values.quantity,
        expectedReturnDate: values.expectedReturnDate ? formatDateTimeSecond(values.expectedReturnDate) : undefined,
        remark: values.remark,
        lendToType: values.lendToType,
      };

      if (values.lendToType === 'factory') {
        payload.lendToFactoryId = values.lendToFactoryId;
        const factoryOpt = factoryOptions.find(f => f.value === values.lendToFactoryId);
        payload.lendToFactoryName = factoryOpt?.label || '';
        payload.lendTo = values.lendToContact || '';
      } else {
        payload.lendTo = values.lendTo || '';
        payload.lendToId = values.lendToId || '';
      }

      const res = await api.post('/stock/sample/loan', payload);
      if (res.code === 200) {
        message.success('借出成功');
        if (showSmartErrorNotice) setSmartError(null);
        onSuccess();
      } else {
        reportSmartError('样衣借出失败', res.message || '请检查输入后重试', 'SAMPLE_LOAN_SUBMIT_FAILED');
        message.error(res.message || '借出失败');
      }
    } catch (error) {
      console.error(error);
      reportSmartError('样衣借出失败', (error as Error)?.message || '网络异常或服务不可用，请稍后重试', 'SAMPLE_LOAN_SUBMIT_EXCEPTION');
      message.error((error as Error)?.message || '借出失败');
    } finally {
      setLoading(false);
    }
  };

  const available = stock ? (stock.quantity - stock.loanedQuantity) : 0;

  return (
    <ResizableModal
      title={`借出样衣 - ${stock?.styleNo} (${stock?.color}/${stock?.size})`}
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      width="40vw" maskClosable={false}
    >
      {showSmartErrorNotice && smartError ? (
        <div style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void handleOk();
            }}
          />
        </div>
      ) : null}

      <Form form={form} layout="vertical" onFinish={handleOk}>
        <Form.Item
          name="borrower"
          label="操作人（借出人）"
          rules={[{ required: true, message: '请输入借出人' }]}
        >
          <Input placeholder="谁操作的借出" />
        </Form.Item>

        <Form.Item name="lendToType" label="借给谁" rules={[{ required: true, message: '请选择借入类型' }]}>
          <Radio.Group>
            <Radio value="person">个人</Radio>
            <Radio value="factory">工厂</Radio>
            <Radio value="customer">客户</Radio>
          </Radio.Group>
        </Form.Item>

        {lendToType === 'factory' ? (
          <>
            <Form.Item
              name="lendToFactoryId"
              label="借入工厂"
              rules={[{ required: true, message: '请选择借入工厂' }]}
            >
              <Select
                placeholder="选择工厂"
                allowClear
                showSearch
                optionFilterProp="label"
                options={factoryOptions}
              />
            </Form.Item>
            <Form.Item name="lendToContact" label="工厂联系人">
              <Input placeholder="工厂对接人姓名（选填）" />
            </Form.Item>
          </>
        ) : (
          <Form.Item
            name="lendTo"
            label="借入人"
            rules={[{ required: true, message: '请输入借入人姓名' }]}
          >
            <Input placeholder="借给谁" />
          </Form.Item>
        )}

        <Form.Item
          name="quantity"
          label={`借出数量 (可用: ${available})`}
          rules={[{ required: true, message: '请输入数量' }]}
          initialValue={1}
        >
          <InputNumber min={1} max={available} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="expectedReturnDate"
          label="预计归还时间"
          initialValue={dayjs().add(7, 'day')}
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="remark"
          label="借出原因/备注"
        >
          <Input.TextArea rows={2} />
        </Form.Item>
        {(stock?.warehouseAreaName || stock?.location) && (
          <div style={{ background: '#f5f7fa', padding: '10px 12px', borderRadius: 6, marginBottom: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              出库仓库：{stock.warehouseAreaName || '-'}
              {stock?.location ? ` | 库位：${stock.location}` : ''}
            </Typography.Text>
          </div>
        )}
      </Form>
    </ResizableModal>
  );
};

export default LoanModal;
