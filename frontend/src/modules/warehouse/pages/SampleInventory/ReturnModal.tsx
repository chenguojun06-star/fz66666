import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  InputNumber,
  DatePicker,
  Select,
  message,
  Space,
  Tag,
  Alert,
  Descriptions,
} from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

interface ReturnModalProps {
  visible: boolean;
  record: any;
  onCancel: () => void;
  onSuccess: () => void;
}

const ReturnModal: React.FC<ReturnModalProps> = ({ visible, record, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    if (visible && record) {
      form.resetFields();

      // 检查是否逾期
      const today = dayjs();
      const expectedDate = dayjs(record.expectedReturnDate);
      const overdue = today.isAfter(expectedDate);
      setIsOverdue(overdue);

      // 默认值
      form.setFieldsValue({
        returnQuantity: record.loanQuantity,
        actualReturnDate: dayjs(),
        returnStatus: '完好',
      });
    }
  }, [visible, record, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const params = {
        id: record.id,
        returnQuantity: values.returnQuantity,
        actualReturnDate: values.actualReturnDate.format('YYYY-MM-DD'),
        returnStatus: values.returnStatus,
        returnRemark: values.returnRemark,
      };

      const response = await api.post('/warehouse/sample-loan/return', params);

      if (response.code === 200) {
        message.success('样衣归还成功');
        onSuccess();
      } else {
        message.error(response.message || '归还失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请完善表单信息');
      } else {
        message.error(error.message || '归还失败');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!record) return null;

  return (
    <ResizableModal
      title="📥 归还样衣"
      visible={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      width="60vw"
      okText="确认归还"
      cancelText="取消"
    >
      {/* 逾期警告 */}
      {isOverdue && (
        <Alert
          message="⚠️ 逾期归还"
          description={`该样衣已逾期 ${record.overdueDays} 天，请及时归还并说明逾期原因`}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 借出信息 */}
      <Descriptions
        title="借出信息"
        bordered
        size="small"
        column={2}
        style={{ marginBottom: 24 }}
      >
        <Descriptions.Item label="借出单号">{record.loanNo}</Descriptions.Item>
        <Descriptions.Item label="款号">
          <Space>
            <strong>{record.styleNo}</strong>
            <span>{record.styleName}</span>
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="样衣编号">{record.styleNo}-{record.sampleCode}</Descriptions.Item>
        <Descriptions.Item label="借出工厂">{record.factoryName}</Descriptions.Item>
        <Descriptions.Item label="借出数量">
          <Tag color="blue">{record.loanQuantity} 件</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="借出原因">{record.loanReason}</Descriptions.Item>
        <Descriptions.Item label="借出日期">{record.loanDate}</Descriptions.Item>
        <Descriptions.Item label="预计归还">
          <span style={{ color: isOverdue ? '#ff4d4f' : undefined }}>
            {record.expectedReturnDate}
          </span>
        </Descriptions.Item>
      </Descriptions>

      {/* 归还表单 */}
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        {/* 归还数量和归还状态 */}
        <Space size={16} style={{ width: '100%' }}>
          <Form.Item
            label="归还数量"
            name="returnQuantity"
            rules={[
              { required: true, message: '请输入归还数量' },
              {
                validator: (_, value) => {
                  if (value > record.loanQuantity) {
                    return Promise.reject('归还数量不能超过借出数量');
                  }
                  return Promise.resolve();
                },
              },
            ]}
            style={{ flex: 1 }}
          >
            <InputNumber
              min={1}
              max={record.loanQuantity}
              style={{ width: '100%' }}
              placeholder="请输入归还数量"
              addonAfter="件"
            />
          </Form.Item>

          <Form.Item
            label="归还状态"
            name="returnStatus"
            rules={[{ required: true, message: '请选择归还状态' }]}
            style={{ flex: 2 }}
          >
            <Select placeholder="请选择归还状态">
              <Option value="完好">
                <Tag color="success">完好</Tag>
                <span style={{ marginLeft: 8 }}>样衣完好无损</span>
              </Option>
              <Option value="破损">
                <Tag color="warning">破损</Tag>
                <span style={{ marginLeft: 8 }}>样衣有破损但可修复</span>
              </Option>
              <Option value="遗失">
                <Tag color="error">遗失</Tag>
                <span style={{ marginLeft: 8 }}>样衣遗失无法归还</span>
              </Option>
            </Select>
          </Form.Item>
        </Space>

        {/* 实际归还日期 */}
        <Form.Item
          label="实际归还日期"
          name="actualReturnDate"
          rules={[{ required: true, message: '请选择实际归还日期' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            placeholder="请选择实际归还日期"
          />
        </Form.Item>

        {/* 归还备注 */}
        <Form.Item
          label={isOverdue ? '逾期原因及归还备注' : '归还备注'}
          name="returnRemark"
          rules={isOverdue ? [{ required: true, message: '逾期归还必须填写原因' }] : []}
        >
          <TextArea
            rows={4}
            placeholder={isOverdue ? '请说明逾期原因及归还情况...' : '请输入归还备注（选填）'}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default ReturnModal;
