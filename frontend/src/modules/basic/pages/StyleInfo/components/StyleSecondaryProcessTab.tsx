import React, { useState, useEffect } from 'react';
import { Alert, App, Button, Form, Image, Input, InputNumber, Popover, Select, Space, Tag, Tooltip, Upload } from 'antd';
import { CameraOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import StyleStageControlBar from './StyleStageControlBar';
import api, { toNumberSafe, type ApiResult, isApiSuccess } from '@/utils/api';
import { downloadFile, getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime } from '@/utils/datetime';
import { useAuth } from '@/utils/AuthContext';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

/** 新建行临时 key */
const NEW_ROW_KEY = '__new__';

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

/** 新建行（未保存）专用图片上传 —— 先传 COS 拿 URL，保存时一并提交 */
const NewRowImageUpload: React.FC<{
  value: string[];
  onChange: (urls: string[]) => void;
}> = ({ value, onChange }) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = React.useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any;
      if (res.code === 200 && res.data) {
        onChange([...value, res.data]);
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
      {value.length > 0 && (
        <Image.PreviewGroup>
          {value.slice(0, 2).map((url, i) => (
            <Image key={i} src={getFullAuthedFileUrl(url)} width={28} height={28}
              style={{ borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
              styles={{ root: { display: 'inline-block', flexShrink: 0 } }}
            />
          ))}
        </Image.PreviewGroup>
      )}
      {value.length > 2 && <span style={{ fontSize: 10, color: '#999' }}>+{value.length - 2}</span>}
      <Upload showUploadList={false} accept="image/*"
        beforeUpload={(file) => { void handleUpload(file as unknown as File); return false; }}
        disabled={uploading}>
        <Tooltip title={uploading ? '上传中…' : '上传工艺图片'} mouseEnterDelay={0.5}>
          <CameraOutlined style={{ fontSize: 13, color: uploading ? '#1677ff' : '#bbb', cursor: uploading ? 'wait' : 'pointer', flexShrink: 0 }} />
        </Tooltip>
      </Upload>
    </div>
  );
};

/** 新建行（未保存）专用附件上传 —— 先传 COS 拿 URL，保存时一并提交 */
const NewRowAttachmentUpload: React.FC<{
  value: AttachmentFile[];
  onChange: (files: AttachmentFile[]) => void;
}> = ({ value, onChange }) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = React.useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any;
      if (res.code === 200 && res.data) {
        onChange([...value, { name: file.name, url: res.data }]);
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
      {value.length === 0 && <div style={{ color: '#999', fontSize: 12, padding: '4px 0' }}>暂无附件</div>}
      {value.map((f, i) => (
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
      <Upload showUploadList={false}
        beforeUpload={(file) => { void handleUpload(file as unknown as File); return false; }}
        disabled={uploading}>
        <Button size="small" icon={<PaperClipOutlined />} loading={uploading} style={{ marginTop: 6, width: '100%' }}>
          上传附件
        </Button>
      </Upload>
    </div>
  );

  return (
    <Popover content={popoverContent} title="附件" trigger="click" placement="bottomRight">
      <div style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 4px' }}
        onClick={(e) => e.stopPropagation()}>
        <PaperClipOutlined style={{ fontSize: 14, color: value.length > 0 ? '#1677ff' : '#bbb' }} />
        {value.length > 0 && <span style={{ fontSize: 12, color: '#1677ff' }}>{value.length}</span>}
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
  const { isMobile } = useViewport();
  const { user } = useAuth();
  const [dataSource, setDataSource] = useState<SecondaryProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingExtraValues, setEditingExtraValues] = useState<Record<string, any>>({});
  const [form] = Form.useForm();
  const currentOperatorName = String(user?.name || user?.username || secondaryAssignee || '').trim();

  const isEditing = (record: SecondaryProcess) => String(record.id) === editingKey;

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
      const res = await api.get(`/style/secondary-process/list?styleId=${styleId}`, {
        validateStatus: (status: number) => status < 500,
      });
      if (res && isApiSuccess(res)) {
        setDataSource(res?.data || []);
      } else {
        setDataSource([]);
      }
    } catch {
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
    } catch {
      message.error('操作失败');
    }
  };

  // 新建（插入临时行，进入内联编辑）
  const handleAdd = () => {
    if (editingKey) {
      message.warning('请先保存或取消当前编辑');
      return;
    }
    const newRow: SecondaryProcess = {
      id: NEW_ROW_KEY,
      processType: '二次工艺',
      status: 'pending',
      quantity: sampleQuantity || 0,
    };
    setDataSource(prev => [newRow, ...prev]);
    setEditingKey(NEW_ROW_KEY);
    form.setFieldsValue({
      processType: '二次工艺',
      status: 'pending',
      quantity: sampleQuantity || 0,
      processName: undefined,
      description: undefined,
      unitPrice: undefined,
      totalPrice: undefined,
      factoryName: undefined,
      remark: undefined,
    });
    setEditingExtraValues({
      factoryId: undefined,
      factoryContactPerson: undefined,
      factoryContactPhone: undefined,
      assignee: currentOperatorName || undefined,
      completedTime: undefined,
      pendingImages: [],
      pendingAttachments: [],
    });
  };

  // 编辑已有行（内联）
  const handleEdit = (record: SecondaryProcess) => {
    if (editingKey) {
      message.warning('请先保存或取消当前编辑');
      return;
    }
    setEditingKey(String(record.id));
    form.setFieldsValue({
      processType: record.processType || '二次工艺',
      processName: record.processName,
      description: record.description,
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      totalPrice: record.quantity && record.unitPrice
        ? toNumberSafe(record.quantity) * toNumberSafe(record.unitPrice)
        : 0,
      factoryName: record.factoryName,
      status: record.status || 'pending',
      remark: record.remark,
    });
    setEditingExtraValues({
      factoryId: record.factoryId,
      factoryContactPerson: record.factoryContactPerson,
      factoryContactPhone: record.factoryContactPhone,
      assignee: record.assignee || currentOperatorName,
      completedTime: record.completedTime,
    });
  };

  // 取消内联编辑
  const handleCancel = () => {
    if (editingKey === NEW_ROW_KEY) {
      setDataSource(prev => prev.filter(r => String(r.id) !== NEW_ROW_KEY));
    }
    setEditingKey(null);
    form.resetFields();
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
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '删除失败，请重试');
        }
      }
    });
  };

  // 保存（内联）
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const normalizedStatus = String(values.status || 'pending').trim().toLowerCase();
      const assignee = String(editingExtraValues.assignee || currentOperatorName || '').trim() || undefined;
      const completedTime = normalizedStatus === 'completed'
        ? String(editingExtraValues.completedTime || '').trim() || getCurrentDateTimeText()
        : null;
      const data = {
        ...values,
        ...editingExtraValues,
        styleId,
        assignee,
        completedTime,
      };

      if (editingKey && editingKey !== NEW_ROW_KEY) {
        await api.put(`/style/secondary-process/${editingKey}`, data);
        message.success('更新成功');
      } else {
        // 新建行：将 pending 数组转成正式字段，去掉临时 key
        const { pendingImages, pendingAttachments, ...restData } = data as any;
        const postData = {
          ...restData,
          processType: restData.processType || form.getFieldValue('processType') || '二次工艺',
          images: JSON.stringify(pendingImages || []),
          attachments: JSON.stringify(pendingAttachments || []),
        };
        await api.post('/style/secondary-process', postData);
        message.success('新建成功');
      }

      setEditingKey(null);
      fetchData();
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        message.error('请检查表单输入');
      } else {
        message.error(error instanceof Error ? error.message : '保存失败，请重试');
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

  // 表格列定义（支持内联编辑）
  const columns: ColumnsType<SecondaryProcess> = [
    {
      title: '图片',
      key: 'images',
      width: 80,
      align: 'center' as const,
      render: (_: any, record: SecondaryProcess) => {
        if (isEditing(record) && String(record.id) === NEW_ROW_KEY) {
          const pendingImgs = (editingExtraValues.pendingImages as string[]) || [];
          return (
            <NewRowImageUpload
              value={pendingImgs}
              onChange={(urls) => setEditingExtraValues(prev => ({ ...prev, pendingImages: urls }))}
            />
          );
        }
        return <ProcessImageCell record={record} readOnly={readOnly} />;
      },
    },
    {
      title: '工艺名称',
      dataIndex: 'processName',
      key: 'processName',
      width: 150,
      ellipsis: true,
      render: (text: string, record: SecondaryProcess) => isEditing(record) ? (
        <Form.Item name="processName" style={{ margin: 0 }} rules={[{ required: true, message: '请输入工艺名称' }]}>
          <DictAutoComplete
            dictType="process_name"
            autoCollect
            placeholder="工艺名称"
            style={{ width: '100%' }}
          />
        </Form.Item>
      ) : (text || '-'),
    },
    {
      title: '工艺描述',
      dataIndex: 'description',
      key: 'description',
      width: 160,
      ellipsis: true,
      render: (text: string, record: SecondaryProcess) => isEditing(record) ? (
        <Form.Item name="description" style={{ margin: 0 }}>
          <DictAutoComplete
            dictType="process_description"
            autoCollect
            placeholder="工艺描述"
            style={{ width: '100%' }}
          />
        </Form.Item>
      ) : (text || '-'),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'right',
      render: (value: number, record: SecondaryProcess) => isEditing(record) ? (
        <Form.Item name="quantity" style={{ margin: 0 }} rules={[{ required: true, message: '请输入' }]}>
          <InputNumber min={0} style={{ width: '100%' }} onChange={calculateTotalPrice} />
        </Form.Item>
      ) : toNumberSafe(value).toLocaleString(),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 110,
      align: 'right',
      render: (value: number, record: SecondaryProcess) => isEditing(record) ? (
        <Form.Item name="unitPrice" style={{ margin: 0 }} rules={[{ required: true, message: '请输入' }]}>
          <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} onChange={calculateTotalPrice} />
        </Form.Item>
      ) : `¥${toNumberSafe(value).toFixed(2)}`,
    },
    {
      title: '总价',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      width: 110,
      align: 'right',
      render: (value: number, record: SecondaryProcess) => {
        if (isEditing(record)) {
          return (
            <Form.Item name="totalPrice" style={{ margin: 0 }}>
              <InputNumber disabled precision={2} prefix="¥" style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        const total = record.totalPrice !== undefined
          ? toNumberSafe(record.totalPrice)
          : toNumberSafe(record.quantity || 0) * toNumberSafe(record.unitPrice || 0);
        return (
          <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
            ¥{total.toFixed(2)}
          </span>
        );
      },
    },
    {
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 140,
      ellipsis: true,
      render: (text: string, record: SecondaryProcess) => isEditing(record) ? (
        <Form.Item name="factoryName" style={{ margin: 0 }}>
          <SupplierSelect
            placeholder="选择加工厂"
            onChange={(_value: any, option: any) => {
              if (option) {
                setEditingExtraValues(prev => ({
                  ...prev,
                  factoryId: option.id,
                  factoryContactPerson: option.supplierContactPerson,
                  factoryContactPhone: option.supplierContactPhone,
                }));
              }
            }}
          />
        </Form.Item>
      ) : (text || '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: string, record: SecondaryProcess) => {
        if (isEditing(record)) {
          return (
            <Form.Item name="status" style={{ margin: 0 }} rules={[{ required: true, message: '请选择' }]}>
              <Select placeholder="状态" style={{ width: '100%' }}>
                {statusOptions.map(opt => (
                  <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                ))}
              </Select>
            </Form.Item>
          );
        }
        const option = statusOptions.find(opt => opt.value === value);
        return option ? <Tag color={option.color}>{option.label}</Tag> : <Tag>{value || '-'}</Tag>;
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      ellipsis: true,
      render: (text: string, record: SecondaryProcess) => isEditing(record) ? (
        <Form.Item name="remark" style={{ margin: 0 }}>
          <Input placeholder="备注" />
        </Form.Item>
      ) : (text || '-'),
    },
    {
      title: '附件',
      key: 'attachments',
      width: 60,
      align: 'center' as const,
      render: (_: any, record: SecondaryProcess) => {
        if (isEditing(record) && String(record.id) === NEW_ROW_KEY) {
          const pendingAtts = (editingExtraValues.pendingAttachments as AttachmentFile[]) || [];
          return (
            <NewRowAttachmentUpload
              value={pendingAtts}
              onChange={(files) => setEditingExtraValues(prev => ({ ...prev, pendingAttachments: files }))}
            />
          );
        }
        return <ProcessAttachmentCell record={record} readOnly={readOnly} />;
      },
    },
    {
      title: '领取人',
      dataIndex: 'assignee',
      key: 'assignee',
      width: 100,
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'completedTime',
      key: 'completedTime',
      width: 140,
      render: (text: string) => formatDateTime(text) || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (text: string) => formatDateTime(text) || '-',
    },
    ...(!readOnly ? [{
      title: '操作',
      key: 'action',
      width: 140,
      fixed: isMobile ? undefined : 'right' as const,
      render: (_: any, record: SecondaryProcess) => {
        if (isEditing(record)) {
          return (
            <Space>
              <Button type="link" size="small" onClick={handleSave} style={{ padding: '0 4px' }}>
                保存
              </Button>
              <Button type="link" size="small" onClick={handleCancel} style={{ padding: '0 4px' }}>
                取消
              </Button>
            </Space>
          );
        }
        return (
          <RowActions
            actions={[
              { key: 'edit', label: '编辑', onClick: () => handleEdit(record) },
              { key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(record) },
            ]}
          />
        );
      },
    }] : []),
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
                无二次工艺
              </Button>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              disabled={notStarted || !!editingKey}
              title={
                notStarted ? '请先点击「开始二次工艺」再操作'
                  : editingKey ? '请先保存或取消当前编辑'
                    : undefined
              }
            >
              新建工艺
            </Button>
          </Space>
        </div>
      )}

      {/* 简化视图：无数据提示 */}
      {simpleView && dataSource.length === 0 && (
        <Alert title="无二次工艺记录" type="info" showIcon style={{ marginBottom: 16 }} />
      )}

      {/* 包裹 Form，实现内联编辑 */}
      <Form form={form} component={false}>
        <ResizableTable
          storageKey="style-secondary-process"
          columns={columns}
          dataSource={dataSource}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1540 }}
          size="middle"
        />
      </Form>
    </div>
  );
};

export default StyleSecondaryProcessTab;
