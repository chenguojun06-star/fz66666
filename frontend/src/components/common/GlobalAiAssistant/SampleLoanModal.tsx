import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, DatePicker, Select, Radio, Spin, message } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import { formatDateTimeSecond } from '@/utils/datetime';
import dayjs from 'dayjs';
import { useUser } from '@/utils/AuthContext';

interface SampleStockOption {
  id: string;
  styleNo: string;
  styleName?: string;
  color: string;
  size: string;
  quantity: number;
  loanedQuantity: number;
  available: number;
}

interface SampleLoanModalProps {
  visible: boolean;
  prefillData?: Record<string, unknown>;
  onCancel: () => void;
  onSuccess: () => void;
}

const SampleLoanModal: React.FC<SampleLoanModalProps> = ({ visible, prefillData, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sampleOptions, setSampleOptions] = useState<SampleStockOption[]>([]);
  const [factoryOptions, setFactoryOptions] = useState<{ label: string; value: string }[]>([]);
  const { user } = useUser();

  const lendToType = Form.useWatch('lendToType', form);
  const selectedSampleId = Form.useWatch('sampleStockId', form);

  const selectedSample = useMemo(
    () => sampleOptions.find(s => s.id === selectedSampleId),
    [sampleOptions, selectedSampleId]
  );

  useEffect(() => {
    if (visible) {
      form.resetFields();
      form.setFieldValue('lendToType', 'factory');
      form.setFieldValue('borrower', user?.name || user?.username || '');
      form.setFieldValue('quantity', 1);
      form.setFieldValue('expectedReturnDate', dayjs().add(7, 'day'));

      if (prefillData?.factoryId) {
        form.setFieldValue('lendToFactoryId', String(prefillData.factoryId));
      }

      loadFactories();
      searchSamples('');
    }
  }, [visible, prefillData, form, user]);

  const loadFactories = async () => {
    try {
      const res = await api.get('/factory/list', { params: { page: 1, pageSize: 500, status: 'active' } });
      const records = (res as any)?.data?.records || [];
      setFactoryOptions(records.map((f: any) => ({
        label: f.factoryName || f.name || f.id,
        value: f.id,
      })));
    } catch (e) {
      console.error('加载工厂列表失败', e);
    }
  };

  const searchSamples = async (keyword: string) => {
    setSearching(true);
    try {
      const res = await api.get('/stock/sample/list', {
        params: { page: 1, pageSize: 50, keyword: keyword || '' }
      });
      const records = (res as any)?.data?.records || [];
      const options: SampleStockOption[] = records.map((r: any) => ({
        id: r.id,
        styleNo: r.styleNo,
        styleName: r.styleName,
        color: r.color,
        size: r.size,
        quantity: r.quantity || 0,
        loanedQuantity: r.loanedQuantity || 0,
        available: (r.quantity || 0) - (r.loanedQuantity || 0),
      }));
      setSampleOptions(options);
    } catch (e) {
      console.error('搜索样衣失败', e);
    } finally {
      setSearching(false);
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const payload: Record<string, any> = {
        sampleStockId: values.sampleStockId,
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
      }

      const res = await api.post('/stock/sample/loan', payload);
      if ((res as any).code === 200) {
        message.success('借出成功');
        onSuccess();
      } else {
        message.error((res as any).message || '借出失败');
      }
    } catch (error) {
      console.error(error);
      message.error('借出失败，请检查输入后重试');
    } finally {
      setLoading(false);
    }
  };

  const available = selectedSample ? selectedSample.available : 0;

  return (
    <ResizableModal
      title="样衣借调"
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      width="480px"
      maskClosable={false}
    >
      <Form form={form} layout="vertical" onFinish={handleOk}>
        <Form.Item
          name="sampleStockId"
          label="选择样衣"
          rules={[{ required: true, message: '请选择样衣' }]}
        >
          <Select
            showSearch
            placeholder="输入款号搜索样衣"
            filterOption={false}
            onSearch={(val) => searchSamples(val)}
            notFoundContent={searching ? <Spin size="small" /> : null}
            options={sampleOptions.map(s => ({
              label: `${s.styleNo} (${s.color}/${s.size}) - 可用${s.available}件`,
              value: s.id,
            }))}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          name="borrower"
          label="操作人（借出人）"
          rules={[{ required: true, message: '请输入借出人' }]}
        >
          <Input placeholder="谁操作的借出" />
        </Form.Item>

        <Form.Item name="lendToType" label="借给谁" rules={[{ required: true, message: '请选择借入类型' }]}>
          <Radio.Group>
            <Radio value="factory">工厂</Radio>
            <Radio value="person">个人</Radio>
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
          label={`借出数量 ${selectedSample ? `(可用: ${available})` : ''}`}
          rules={[{ required: true, message: '请输入数量' }]}
        >
          <InputNumber min={1} max={available || undefined} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="expectedReturnDate"
          label="预计归还时间"
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="remark" label="借出原因/备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default SampleLoanModal;
