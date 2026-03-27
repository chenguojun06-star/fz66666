import React, { useState, useEffect } from 'react';
import { Alert, App, Button, Col, Form, Image, Input, InputNumber, Popover, Row, Select, Space, Tag, Tooltip, Upload } from 'antd';
import { CameraOutlined, PaperClipOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import StyleStageControlBar from './StyleStageControlBar';
import api, { toNumberSafe } from '@/utils/api';
import { downloadFile, getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime } from '@/utils/datetime';
import { useModal } from '@/hooks';
import { useAuth } from '@/utils/AuthContext';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

const helpTooltipStyles = {
  root: { maxWidth: 320, zIndex: 4000 },
  body: {
    color: 'var(--neutral-text)',
    background: 'var(--component-bg, #ffffff)',
    border: '1px solid var(--neutral-border, #d9d9d9)',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.18)',
  },
} as const;

const renderFieldLabel = (label: string, tooltip?: string) => {
  if (!tooltip) return label;
  return (
    <Space size={4}>
      <span>{label}</span>
      <Tooltip title={tooltip} styles={helpTooltipStyles}>
        <QuestionCircleOutlined style={{ color: 'var(--text-secondary, #8c8c8c)', cursor: 'help' }} />
      </Tooltip>
    </Space>
  );
};

const getCurrentDateTimeText = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

interface SecondaryProcess {
  id?: number | string;
  styleId?: number | string;
  processType?: string;
  processName?: string;
  description?: string;
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
  images?: string;
  attachments?: string;
}

interface Props {
  styleId: number | string;
  styleNo?: string;
  readOnly?: boolean;
  secondaryAssignee?: string;
  secondaryStartTime?: string;
  secondaryCompletedTime?: string;
  sampleQuantity?: number; // 样衣数量，用于自动填充工艺数量
  onRefresh?: () => void; // 刷新父组件的回调
  simpleView?: boolean; // 简化视图：隐藏领取人信息、操作按钮
}

/** 工艺图片上传/预览单元格（行内操作，避免频繁开弹窗） */
const ProcessImageCell: React.FC<{ record: SecondaryProcess; readOnly?: boolean }> = ({ record, readOnly }) => {
  const { message: msg } = App.useApp();
  const [imgs, setImgs] = React.useState<string[]>(() => {
    try { return JSON.parse(record.images || '[]') || []; } catch { return []; }
  });
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    try { setImgs(JSON.parse(record.images || '[]') || []); } catch { setImgs([]); }
  }, [record.images]);

  const handleUpload = async (file: File) => {
    if (!record.id) { msg.warning('请先保存记录再上传图片'); return false; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any;
      if (res.code === 200 && res.data) {
        const newImgs = [...imgs, res.data];
        await api.put(`/style/secondary-process/${record.id}`, { images: JSON.stringify(newImgs) });
        setImgs(newImgs);
        msg.success('图片上传成功');
      } else {
        msg.error(res.message || '上传失败');
      }
    } catch { msg.error('上传失败，请重试'); }
    finally { setUploading(false); }
    return false;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', justifyContent: 'center', minHeight: 24 }}
      onClick={(e) => e.stopPropagation()}>
      {imgs.length > 0 && (
        <Image.PreviewGroup>
          {imgs.slice(0, 2).map((url, i) => (
            <Image key={i} src={getFullAuthedFileUrl(url)} width={28} height={28}
              style={{ borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
              styles={{ root: { display: 'inline-block', flexShrink: 0 } }}
            />
          ))}
        </Image.PreviewGroup>
      )}
      {imgs.length > 2 && <span style={{ fontSize: 10, color: '#999' }}>+{imgs.length - 2}</span>}
      {!readOnly && record.id && (
        <Upload showUploadList={false} accept="image/*"
          beforeUpload={(file) => { void handleUpload(file as unknown as File); return false; }}
          disabled={uploading}>
          <Tooltip title={uploading ? '上传中…' : '上传工艺图片'} mouseEnterDelay={0.5}>
            <CameraOutlined style={{ fontSize: 13, color: uploading ? '#1677ff' : '#bbb', cursor: uploading ? 'wait' : 'pointer', flexShrink: 0 }} />
          </Tooltip>
        </Upload>
      )}
    </div>
  );
};

interface AttachmentFile { name: string; url: string; }

/** 工艺附件上传/查看单元格 */
const ProcessAttachmentCell: React.FC<{ record: SecondaryProcess; readOnly?: boolean }> = ({ record, readOnly }) => {
  const { message: msg } = App.useApp();
  const [files, setFiles] = React.useState<AttachmentFile[]>(() => {
    try { return JSON.parse(record.attachments || '[]') || []; } catch { return []; }
  });
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    try { setFiles(JSON.parse(record.attachments || '[]') || []); } catch { setFiles([]); }
  }, [record.attachments]);

  const handleUpload = async (file: File) => {
    if (!record.id) { msg.warning('请先保存记录再上传附件'); return false; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any;
      if (res.code === 200 && res.data) {
        const newFiles = [...files, { name: file.name, url: res.data }];
        await api.put(`/style/secondary-process/${record.id}`, { attachments: JSON.stringify(newFiles) });
        setFiles(newFiles);
        msg.success('附件上传成功');
      } else {
        msg.error(res.message || '上传失败');
      }
    } catch { msg.error('上传失败，请重试'); }
    finally { setUploading(false); }
    return false;
  };

  const popoverContent = (
    <div style={{ minWidth: 180, maxWidth: 300 }}>
      {files.length === 0 && <div style={{ color: '#999', fontSize: 12, padding: '4px 0' }}>暂无附件</div>}
      {files.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
          <PaperClipOutlined style={{ color: '#1677ff', flexShrink: 0, fontSize: 12 }} />
          <a
            onClick={(e) => { e.preventDefault(); downloadFile(f.url, f.name); }}
            href="#"
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, cursor: 'pointer' }}>
            {f.name}
          </a>
        </div>
      ))}
      {!readOnly && record.id && (
        <Upload showUploadList={false}
          beforeUpload={(file) => { void handleUpload(file as unknown as File); return false; }}
          disabled={uploading}>
          <Button size="small" icon={<PaperClipOutlined />} loading={uploading} style={{ marginTop: 6, width: '100%' }}>
            上传附件
          </Button>
        </Upload>
      )}
    </div>
  );

  return (
    <Popover content={popoverContent} title="附件" trigger="click" placement="bottomRight">
      <div style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 4px' }}
        onClick={(e) => e.stopPropagation()}>
        <PaperClipOutlined style={{ fontSize: 14, color: files.length > 0 ? '#1677ff' : '#bbb' }} />
        {files.length > 0 && <span style={{ fontSize: 12, color: '#1677ff' }}>{files.length}</span>}
      </div>
    </Popover>
  );
};

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
  const { user } = useAuth();
  const processModal = useModal<SecondaryProcess>();
  const [dataSource, setDataSource] = useState<SecondaryProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const currentOperatorName = String(user?.name || user?.username || secondaryAssignee || '').trim();

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

  const notStarted = !secondaryStartTime && !secondaryCompletedTime;

  // 无二次工艺处理
  const handleSkipSecondary = async () => {
    if (notStarted) {
      message.warning('请先点击「开始二次工艺」按钮后再进行操作');
      return;
    }
    try {
      await api.post(`/style/info/${styleId}/stage-action?stage=secondary&action=skip`);
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
      quantity: sampleQuantity || 0,
      assignee: currentOperatorName || undefined,
      completedTime: undefined,
    });
  };

  // 编辑
  const handleEdit = (record: SecondaryProcess) => {
    processModal.open(record);
    form.setFieldsValue({
      ...record,
      assignee: record.assignee || currentOperatorName || undefined,
      totalPrice: record.quantity && record.unitPrice
        ? toNumberSafe(record.quantity) * toNumberSafe(record.unitPrice)
        : 0
    });
  };

  // 查看
  const handleView = (record: SecondaryProcess) => {
    processModal.open(record);
    form.setFieldsValue({
      ...record,
      assignee: record.assignee || currentOperatorName || undefined,
    });
  };

  // 删除
  const handleDelete = (record: SecondaryProcess) => {
    modal.confirm({
      width: '30vw',
      title: '确认删除',
      content: `确定要删除工艺"${record.processName}"吗？`,
      onOk: async () => {
        try {
          await api.delete(`/style/secondary-process/${record.id}`);
          message.success('删除成功');
          fetchData();
        } catch (error: any) {
          message.error(error?.message || '删除失败，请重试');
        }
      }
    });
  };

  // 保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const normalizedStatus = String(values.status || 'pending').trim().toLowerCase();
      const assignee = String(processModal.data?.assignee || values.assignee || currentOperatorName || '').trim() || undefined;
      const completedTime = normalizedStatus === 'completed'
        ? String(processModal.data?.completedTime || values.completedTime || '').trim() || getCurrentDateTimeText()
        : null;
      const data = {
        ...values,
        styleId,
        assignee,
        completedTime,
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
        message.error((error as any)?.message || '保存失败，请重试');
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
      title: '图片',
      key: 'images',
      width: 90,
      align: 'center' as const,
      render: (_: any, record: SecondaryProcess) => (
        <ProcessImageCell record={record} readOnly={readOnly} />
      )
    },
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
      title: '工艺描述',
      dataIndex: 'description',
      key: 'description',
      width: 180,
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
      title: '附件',
      key: 'attachments',
      width: 80,
      align: 'center' as const,
      render: (_: any, record: SecondaryProcess) => (
        <ProcessAttachmentCell record={record} readOnly={readOnly} />
      )
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
          styleNo={styleNo}
          status={secondaryCompletedTime ? 'COMPLETED' : secondaryStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
          assignee={secondaryAssignee}
          startTime={secondaryStartTime}
          completedTime={secondaryCompletedTime}
          readOnly={readOnly}
          onRefresh={onRefresh || (() => {})}
        />
      )}

      {/* 操作按钮 */}
      {!readOnly && !simpleView && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div />
          <Space>
            {!secondaryCompletedTime && (
              <Button
                onClick={handleSkipSecondary}
                disabled={notStarted}
                title={notStarted ? '请先点击「开始二次工艺」再操作' : undefined}
              >
                标记无二次工艺
              </Button>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              disabled={notStarted}
              title={notStarted ? '请先点击「开始二次工艺」再操作' : undefined}
            >
              新建工艺
            </Button>
          </Space>
        </div>
      )}

      {/* 简化视图：无数据提示 */}
      {simpleView && dataSource.length === 0 && (
        <Alert title="无二次工艺" type="info" showIcon style={{ marginBottom: 16 }} />
      )}

      {/* 数据表格 */}
      <ResizableTable
        storageKey="style-secondary-process"
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 1200 }}
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
              >
                <Input disabled />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label={renderFieldLabel('工艺名称', '具体的工艺描述')}
                name="processName"
                rules={[{ required: true, message: '请输入工艺名称' }]}
              >
                <DictAutoComplete
                  dictType="process_name"
                  autoCollect
                  placeholder="请输入或选择工艺名称，如：胸前刺绣、背部印花"
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="工艺描述"
                name="description"
              >
                <DictAutoComplete
                  dictType="process_description"
                  autoCollect
                  placeholder="请输入工艺描述"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                label={renderFieldLabel('数量', '新建时自动填充为样衣数量，可手动修改')}
                name="quantity"
                rules={[{ required: true, message: '请输入数量' }]}
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
              <Form.Item name="assignee" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="completedTime" hidden>
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
                label="状态"
                name="status"
                rules={[{ required: true, message: '请选择状态' }]}
                extra="领取人与完成时间由系统按当前操作人和完成动作自动记录"
              >
                <Select id="status" placeholder="请选择状态">
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
