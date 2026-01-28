import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  message,
  Space,
  Tag,
  Alert,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

interface LoanModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

interface StyleInfo {
  id: string;
  styleNo: string;
  styleName: string;
  sampleStatus?: string;
}

interface Factory {
  id: string;
  factoryName: string;
}

const LoanModal: React.FC<LoanModalProps> = ({ visible, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleInfo | null>(null);

  // 加载样衣列表（只显示已完成的样衣）
  const loadStyles = async () => {
    try {
      // TODO: 后端API开发中，暂时使用模拟数据
      // const response = await api.get('/style/style-info/list', {
      //   params: { page: 1, pageSize: 1000, sampleStatus: '样衣完成' }
      // });
      // if (response.code === 200) {
      //   setStyles(response.data.records || []);
      // }

      // 模拟数据
      await new Promise(resolve => setTimeout(resolve, 200));
      setStyles([
        { id: '1', styleNo: 'ST001', styleName: '春季衬衫', sampleStatus: '样衣完成' },
        { id: '2', styleNo: 'ST002', styleName: '夏季连衣裙', sampleStatus: '样衣完成' },
        { id: '3', styleNo: 'ST003', styleName: '秋季外套', sampleStatus: '样衣完成' },
      ]);
    } catch (error) {
      console.error('加载样衣列表失败:', error);
      setStyles([
        { id: '1', styleNo: 'ST001', styleName: '春季衬衫', sampleStatus: '样衣完成' },
        { id: '2', styleNo: 'ST002', styleName: '夏季连衣裙', sampleStatus: '样衣完成' },
        { id: '3', styleNo: 'ST003', styleName: '秋季外套', sampleStatus: '样衣完成' },
      ]);
    }
  };

  // 加载工厂列表
  const loadFactories = async () => {
    try {
      const response = await api.get('/system/factory/list', {
        params: { page: 1, pageSize: 1000 }
      });
      if (response.code === 200) {
        setFactories(response.data.records || []);
      }
    } catch (error) {
      console.error('加载工厂列表失败:', error);
      // 模拟数据
      setFactories([
        { id: 'F001', factoryName: '华美制衣厂' },
        { id: 'F002', factoryName: '锦绣服装厂' },
      ]);
    }
  };

  useEffect(() => {
    if (visible) {
      loadStyles();
      loadFactories();
      form.resetFields();
      // 默认借出1件，预计7天后归还
      form.setFieldsValue({
        loanQuantity: 1,
        expectedReturnDate: dayjs().add(7, 'day'),
      });
    }
  }, [visible, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const params = {
        styleNo: values.styleNo,
        sampleCode: values.sampleCode,
        factoryId: values.factoryId,
        loanQuantity: values.loanQuantity,
        loanReason: values.loanReason,
        expectedReturnDate: values.expectedReturnDate.format('YYYY-MM-DD'),
        remark: values.remark,
      };

      const response = await api.post('/warehouse/sample-loan/create', params);

      if (response.code === 200) {
        message.success('样衣借出成功');
        onSuccess();
      } else {
        message.error(response.message || '借出失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请完善表单信息');
      } else {
        message.error(error.message || '借出失败');
      }
    } finally {
      setLoading(false);
    }
  };

  // 款号选择变化
  const handleStyleChange = (styleNo: string) => {
    const style = styles.find(s => s.styleNo === styleNo);
    setSelectedStyle(style || null);
    form.setFieldValue('sampleCode', '001'); // 默认编号001
  };

  return (
    <ResizableModal
      title="📤 借出样衣"
      visible={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={loading}
      width="60vw"
      okText="确认借出"
      cancelText="取消"
    >
      <Alert
        message="💡 温馨提示"
        description="借出样衣前请确认：1）样衣已完成制作 2）样衣状态完好 3）已与工厂确认归还日期"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        {/* 款号选择 */}
        <Form.Item
          label="款号"
          name="styleNo"
          rules={[{ required: true, message: '请选择款号' }]}
        >
          <Select
            placeholder="请选择款号"
            showSearch
            optionFilterProp="children"
            onChange={handleStyleChange}
            suffixIcon={<SearchOutlined />}
          >
            {styles.map(s => (
              <Option key={s.styleNo} value={s.styleNo}>
                <Space>
                  <strong>{s.styleNo}</strong>
                  <span>{s.styleName}</span>
                  <Tag color="green" style={{ fontSize: 12 }}>已完成</Tag>
                </Space>
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* 选中样衣信息展示 */}
        {selectedStyle && (
          <div style={{
            padding: 12,
            background: '#f0f2f5',
            borderRadius: 4,
            marginBottom: 16,
          }}>
            <Space>
              <span>📋 款式名称：<strong>{selectedStyle.styleName}</strong></span>
              <Tag color="blue">{selectedStyle.sampleStatus}</Tag>
            </Space>
          </div>
        )}

        {/* 样衣编号 */}
        <Form.Item
          label="样衣编号"
          name="sampleCode"
          rules={[{ required: true, message: '请输入样衣编号' }]}
          tooltip="同一款可能有多件样衣，通过编号区分（如：001、002）"
        >
          <Input placeholder="请输入样衣编号（如：001）" maxLength={10} />
        </Form.Item>

        {/* 借出工厂 */}
        <Form.Item
          label="借出工厂"
          name="factoryId"
          rules={[{ required: true, message: '请选择借出工厂' }]}
        >
          <Select
            placeholder="请选择借出工厂"
            showSearch
            optionFilterProp="children"
          >
            {factories.map(f => (
              <Option key={f.id} value={f.id}>{f.factoryName}</Option>
            ))}
          </Select>
        </Form.Item>

        {/* 借出数量和借出原因 */}
        <Space size={16} style={{ width: '100%' }}>
          <Form.Item
            label="借出数量"
            name="loanQuantity"
            rules={[{ required: true, message: '请输入借出数量' }]}
            style={{ flex: 1 }}
          >
            <InputNumber
              min={1}
              max={10}
              style={{ width: '100%' }}
              placeholder="请输入数量"
            />
          </Form.Item>

          <Form.Item
            label="借出原因"
            name="loanReason"
            rules={[{ required: true, message: '请选择借出原因' }]}
            style={{ flex: 2 }}
          >
            <Select placeholder="请选择借出原因">
              <Option value="打样参考">打样参考</Option>
              <Option value="工艺参考">工艺参考</Option>
              <Option value="尺寸对比">尺寸对比</Option>
              <Option value="色差对比">色差对比</Option>
              <Option value="客户确认">客户确认</Option>
              <Option value="其他">其他</Option>
            </Select>
          </Form.Item>
        </Space>

        {/* 预计归还日期 */}
        <Form.Item
          label="预计归还日期"
          name="expectedReturnDate"
          rules={[{ required: true, message: '请选择预计归还日期' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            disabledDate={(current) => current && current < dayjs().startOf('day')}
            placeholder="请选择预计归还日期"
          />
        </Form.Item>

        {/* 备注 */}
        <Form.Item
          label="备注"
          name="remark"
        >
          <TextArea
            rows={3}
            placeholder="请输入备注信息（选填）"
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default LoanModal;
