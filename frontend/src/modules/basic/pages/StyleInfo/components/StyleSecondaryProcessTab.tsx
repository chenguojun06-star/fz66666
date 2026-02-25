import React, { useState, useEffect } from 'react';
import { Alert, App, Button, Col, Form, Input, InputNumber, Row, Select, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import StyleStageControlBar from './StyleStageControlBar';
import api, { toNumberSafe } from '@/utils/api';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime } from '@/utils/datetime';
import { useModal } from '@/hooks';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

interface SecondaryProcess {
  id?: number | string;
  styleId?: number | string;
  processType?: string;
  processName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  factoryName?: string; // 保留向后兼容
  factoryId?: string; // 工厂ID（关联t_factory）
  factoryContactPerson?: string; // 工厂联系人
  factoryContactPhone?: string; // 工厂联系电话
  assignee?: string;
  completedTime?: string;
  status?: string;
  createdAt?: string;
  remark?: string;
}

interface Props {
  styleId: number | string;
  styleNo?: string;
  readOnly?: boolean;
  secondaryAssignee?: string;
  secondaryStartTime?: string;
  secondaryCompletedTime?: string;
  sampleQuantity?: number; // 样板数量，用于自动填充工艺数量
  onRefresh?: () => void; // 刷新父组件的回调
  simpleView?: boolean; // 简化视图：隐藏领取人信息、操作按钮
}

const StyleSecondaryProcessTab: React.FC<Props> = ({
  styleId,
  styleNo,
  readOnly = false,
  secondaryAssignee,
  secondaryStartTime,
  secondaryCompletedTime,
  sampleQuantity = 0, // 默认为 0
  onRefresh,
  simpleView = false,
}) => {
  const { message, modal } = App.useApp();
  const { isMobile, modalWidth } = useViewport();
  const processModal = useModal<SecondaryProcess>();
  const [dataSource, setDataSource] = useState<SecondaryProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // 工艺类型选项
  const _processTypeOptions = [
    { value: 'embroidery', label: '刺绣' },
    { value: 'printing', label: '印花' },
    { value: 'washing', label: '水洗' },
    { value: 'dyeing', label: '染色' },
    { value: 'ironing', label: '烫印' },
    { value: 'pleating', label: '打褶' },
    { value: 'beading', label: '钉珠' },
    { value: 'other', label: '其他' },
  ];

  // 状态选项
  const statusOptions = [
    { value: 'pending', label: '待处理', color: 'default' },
    { value: 'processing', label: '处理中', color: 'processing' },
    { value: 'completed', label: '已完成', color: 'success' },
    { value: 'cancelled', label: '已取消', color: 'error' },
  ];

  // 获取列表
  const fetchData = async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      // 使用特殊配置抑制404错误日志
      const res = await api.get(`/style/secondary-process/list?styleId=${styleId}`, {
        validateStatus: (status: number) => status < 500, // 不抛出4xx错误
      });
      if (res && (res as any).code === 200) {
        setDataSource((res as any).data || []);
      } else {
        // 后端API暂未实现，使用空数据
        setDataSource([]);
      }
    } catch (error) {
      // 静默处理错误（后端API暂未实现）
      setDataSource([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [styleId]);

  // 无二次工艺处理
  const handleSkipSecondary = async () => {
    try {
      await api.post(`/style/info/${styleId}/secondary/skip`);
      message.success('已标记为无二次工艺');
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 新建
  const handleAdd = () => {
    processModal.open(null);
    form.resetFields();
    form.setFieldsValue({
      processType: '二次工艺', // 默认工艺类型为"二次工艺"
      status: 'pending',
      quantity: sampleQuantity || 0 // 自动填充样板数量
    });
  };

  // 编辑
  const handleEdit = (record: SecondaryProcess) => {
    processModal.open(record);
    form.setFieldsValue({
      ...record,
      totalPrice: record.quantity && record.unitPrice
        ? toNumberSafe(record.quantity) * toNumberSafe(record.unitPrice)
        : 0
    });
  };

  // 查看
  const handleView = (record: SecondaryProcess) => {
    processModal.open(record);
    form.setFieldsValue(record);
  };

  // 删除
  const handleDelete = (record: SecondaryProcess) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除工艺"${record.processName}"吗？`,
      onOk: async () => {
        try {
          await api.delete(`/style/secondary-process/${record.id}`);
          message.success('删除成功');
          fetchData();
        } catch (error) {
          message.warning('后端API暂未实现，请等待开发完成');
        }
      }
    });
  };

  // 保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        styleId
      };

      if (processModal.data?.id) {
        await api.put(`/style/secondary-process/${processModal.data.id}`, data);
        message.success('更新成功');
      } else {
        await api.post('/style/secondary-process', data);
        message.success('新建成功');
      }

      processModal.close();
      fetchData();
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单输入');
      } else {
        message.warning('后端API暂未实现，请等待开发完成');
      }
    }
  };

  // 计算总价
  const calculateTotalPrice = () => {
    const quantity = form.getFieldValue('quantity') || 0;
    const unitPrice = form.getFieldValue('unitPrice') || 0;
    const total = toNumberSafe(quantity) * toNumberSafe(unitPrice);
    form.setFieldValue('totalPrice', Number(total.toFixed(2)));
  };

  // 表格列定义
  const columns: ColumnsType<SecondaryProcess> = [
    {
      title: '工艺类型',
      dataIndex: 'processType',
      key: 'processType',
      width: 100,
      render: (value: string) => value || '二次工艺'
    },
    {
      title: '工艺名称',
      dataIndex: 'processName',
      key: 'processName',
      width: 140,
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right',
      render: (value: number) => toNumberSafe(value).toLocaleString()
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 90,
      align: 'right',
      render: (value: number) => `¥${toNumberSafe(value).toFixed(2)}`
    },
    {
      title: '总价',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      width: 100,
      align: 'right',
      render: (value: number, record: SecondaryProcess) => {
        const total = record.totalPrice !== undefined
          ? toNumberSafe(record.totalPrice)
          : toNumberSafe(record.quantity || 0) * toNumberSafe(record.unitPrice || 0);
        return (
          <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
            ¥{total.toFixed(2)}
          </span>
        );
      }
    },
    {
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (value: string) => {
        const option = statusOptions.find(opt => opt.value === value);
        return option ? (
          <Tag color={option.color}>{option.label}</Tag>
        ) : <Tag>{value || '-'}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (text: string) => formatDateTime(text)
    },
    ...(!readOnly ? [{
      title: '操作',
      key: 'action',
      width: 120,
      fixed: isMobile ? undefined : 'right' as const,
      render: (_: any, record: SecondaryProcess) => (
        <RowActions
          actions={[
            {
              key: 'view',
              label: '查看',
              onClick: () => handleView(record)
            },
            {
              key: 'edit',
              label: '编辑',
              onClick: () => handleEdit(record)
            },
            {
              key: 'delete',
              label: '删除',
              danger: true,
              onClick: () => handleDelete(record)
            }
          ]}
        />
      )
    }] : [])
  ];

  return (
    <div style={{ padding: '0 4px' }}>
      {/* 统一状态控制栏 */}
      {!simpleView && (
        <StyleStageControlBar
          stageName="二次工艺"
          styleId={styleId}
          apiPath="secondary"
          status={secondaryCompletedTime ? 'COMPLETED' : secondaryStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
          assignee={secondaryAssignee}
          startTime={secondaryStartTime}
          completedTime={secondaryCompletedTime}
          readOnly={readOnly}
          onRefresh={onRefresh || (() => {})}
          extraInfo={
            <span style={{ color: 'var(--text-secondary)' }}>
              款号：<span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{styleNo || '-'}</span>
            </span>
          }
        />
      )}

      {/* 操作按钮 */}
      {!readOnly && !simpleView && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div />
          <Space>
            {!secondaryCompletedTime && (
              <Button onClick={handleSkipSecondary}>
                标记无二次工艺
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新建工艺
            </Button>
          </Space>
        </div>
      )}

      {/* 简化视图：无数据提示 */}
      {simpleView && dataSource.length === 0 && (
        <Alert message="无二次工艺" type="info" showIcon style={{ marginBottom: 16 }} />
      )}

      {/* 数据表格 */}
      <ResizableTable
        storageKey="style-secondary-process"
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 900 }}
        size="middle"
      />

      {/* 新建/编辑弹窗 */}
      <ResizableModal
        title={processModal.data?.id ? '编辑二次工艺' : '新建二次工艺'}
        open={processModal.visible}
        onOk={handleSave}
        onCancel={() => processModal.close()}
        width={modalWidth}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="工艺类型"
                name="processType"
                rules={[{ required: true, message: '请输入工艺类型' }]}
                tooltip="默认为'二次工艺'，可自定义如：刺绣、印花、水洗、染色、烫印、打褶、钉珠等"
              >
                <DictAutoComplete
                  dictType="二次工艺类型"
                  autoCollect
                  placeholder="输入工艺类型，如：二次工艺、刺绣、印花"
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="工艺名称"
                name="processName"
                rules={[{ required: true, message: '请输入工艺名称' }]}
                tooltip="具体的工艺描述"
              >
                <Input placeholder="请输入工艺名称，如：胸前刺绣、背部印花" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                label="数量"
                name="quantity"
                rules={[{ required: true, message: '请输入数量' }]}
                tooltip="新建时自动填充为样板数量，可手动修改"
              >
                <InputNumber
                  placeholder="请输入数量"
                  min={0}
                  style={{ width: '100%' }}
                  onChange={calculateTotalPrice}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8}>
              <Form.Item
                label="单价"
                name="unitPrice"
                rules={[{ required: true, message: '请输入单价' }]}
              >
                <InputNumber
                  placeholder="请输入单价"
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  prefix="¥"
                  onChange={calculateTotalPrice}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8}>
              <Form.Item
                label="总价"
                name="totalPrice"
              >
                <InputNumber
                  placeholder="自动计算"
                  disabled
                  precision={2}
                  style={{ width: '100%' }}
                  prefix="¥"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="factoryId" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="factoryContactPerson" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="factoryContactPhone" hidden>
                <Input />
              </Form.Item>
              <Form.Item
                label="加工厂"
                name="factoryName"
              >
                <SupplierSelect
                  placeholder="选择加工厂"
                  onChange={(value, option) => {
                    if (option) {
                      form.setFieldsValue({
                        factoryId: option.id,
                        factoryContactPerson: option.supplierContactPerson,
                        factoryContactPhone: option.supplierContactPhone,
                      });
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                label="领取人"
                name="assignee"
              >
                <Input placeholder="请输入领取人姓名" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8}>
              <Form.Item
                label="完成时间"
                name="completedTime"
              >
                <Input placeholder="例如：2026-01-28 14:30:00" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8}>
              <Form.Item
                label="状态"
                name="status"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select placeholder="请选择状态">
                  {statusOptions.map(opt => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item
                label="备注"
                name="remark"
              >
                <Input.TextArea
                  placeholder="请输入备注信息，如工艺要求、注意事项等"
                  rows={3}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </ResizableModal>
    </div>
  );
};

export default StyleSecondaryProcessTab;
