import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card, Select, Button, Table, Switch, Space, Modal, Form, Input, InputNumber,
  Tag, Typography, message, Popconfirm, Tabs, Row, Col, Divider, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  UpOutlined, DownOutlined, SaveOutlined,
} from '@ant-design/icons';
import { fieldConfigApi, BIZ_TYPE_OPTIONS, FIELD_TYPE_OPTIONS } from '@/services/system/fieldConfigApi';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import SchemaTable from '@/components/common/SchemaTable';
import ExtFieldsSection, { flattenExtJson } from '@/components/common/SchemaForm/ExtFieldsSection';

const { Text } = Typography;
const { TabPane } = Tabs;

const FieldConfigPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialBiz = (searchParams.get('bizType') || 'style') as string;
  const [bizType, setBizType] = useState<string>(
    BIZ_TYPE_OPTIONS.some(o => o.value === initialBiz) ? initialBiz : 'style'
  );
  const [rows, setRows] = useState<FieldConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<FieldConfigItem | null>(null);
  const [form] = Form.useForm();
  const [previewForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [dirty, setDirty] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fieldConfigApi.list(bizType, 'pc', true);
      if (res?.code === 200 && Array.isArray(res.data)) {
        setRows(res.data);
        setDirty(false);
      }
    } catch (e) {
      message.error('加载字段配置失败');
    } finally {
      setLoading(false);
    }
  }, [bizType]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleToggleEnabled = (row: FieldConfigItem, enabled: boolean) => {
    const nextRows = rows.map(r =>
      r.fieldKey === row.fieldKey ? { ...r, enabled: enabled ? 1 : 0 } : r
    );
    setRows(nextRows);
    setDirty(true);
  };

  const handleSortChange = (row: FieldConfigItem, delta: number) => {
    const idx = rows.findIndex(r => r.fieldKey === row.fieldKey);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= rows.length) return;
    const next = [...rows];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    next.forEach((r, i) => r.sortOrder = i);
    setRows(next);
    setDirty(true);
  };

  const handleEdit = (row: FieldConfigItem) => {
    setEditing(row);
    const validations = parseValidations(row.validationsJson);
    const options = parseOptions(row.optionsJson);
    form.setFieldsValue({
      label: row.label,
      fieldType: row.fieldType,
      optionsText: options.map(o => o.label).join('\n'),
      required: !!validations.required,
      pcColSpan: row.pcColSpan || 24,
      listWidth: row.sortOrder,
      remark: row.remark || '',
    });
    setEditOpen(true);
  };

  const handleAdd = () => {
    setEditing({
      bizType,
      fieldKey: '',
      label: '',
      fieldType: 'text',
      isSystem: 0,
      enabled: 1,
      sortOrder: rows.length,
      pcColSpan: 24,
    });
    form.resetFields();
    form.setFieldsValue({ fieldType: 'text', required: false, pcColSpan: 24 });
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    try {
      const values = await form.validateFields();
      // 字段键由后端根据字段名自动生成（拼音），用户不需要填写
      const fieldKey = editing?.fieldKey || '';

      const optionsArr = (values.optionsText || '')
        .split('\n')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      const optionsJson = (values.fieldType === 'select' || values.fieldType === 'multiselect') && optionsArr.length > 0
        ? JSON.stringify(optionsArr)
        : null;

      const validationsJson = JSON.stringify({
        required: !!values.required,
      });

      const newField: FieldConfigItem = {
        id: editing?.id,
        bizType,
        fieldKey,
        label: values.label,
        fieldType: values.fieldType,
        optionsJson,
        validationsJson,
        pcWidget: mapTypeToWidget(values.fieldType),
        h5Widget: mapTypeToWidget(values.fieldType),
        mpWidget: mapTypeToWidget(values.fieldType),
        pcColSpan: values.pcColSpan || 24,
        h5ColSpan: 24,
        sortOrder: editing?.sortOrder ?? rows.length,
        isSystem: editing?.isSystem ?? 0,
        enabled: editing?.enabled ?? 1,
        remark: values.remark || null,
      };

      const nextRows = editing?.fieldKey
        ? rows.map(r => r.fieldKey === editing.fieldKey ? newField : r)
        : [...rows, newField];

      setRows(nextRows);
      setDirty(true);
      setEditOpen(false);
      message.success('已更新，点击「保存全部」后生效');
    } catch (e) {
      // 校验失败
    }
  };

  const handleDelete = async (row: FieldConfigItem) => {
    try {
      const res = await fieldConfigApi.delete(bizType, row.fieldKey);
      if (res?.code === 200) {
        message.success('已删除');
        fetchList();
      } else {
        message.error(res?.message || '删除失败');
      }
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const res = await fieldConfigApi.saveBatch({
        bizType,
        platform: 'pc',
        fields: rows.map((r, i) => ({
          ...r,
          sortOrder: r.sortOrder ?? i,
          pcColSpan: r.pcColSpan ?? 24,
          h5ColSpan: r.h5ColSpan ?? 24,
        })),
      });
      if (res?.code === 200) {
        message.success('保存成功，配置已生效');
        setRows(res.data || rows);
        setDirty(false);
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => [
    {
      title: '排序',
      dataIndex: 'sortOrder',
      width: 80,
      fixed: 'left' as const,
      render: (_: any, row: FieldConfigItem) => (
        <Space size={2} direction="vertical">
          <Button
            type="text"
            size="small"
            icon={<UpOutlined />}
            disabled={rows.findIndex(r => r.fieldKey === row.fieldKey) === 0}
            onClick={() => handleSortChange(row, -1)}
          />
          <Button
            type="text"
            size="small"
            icon={<DownOutlined />}
            disabled={rows.findIndex(r => r.fieldKey === row.fieldKey) === rows.length - 1}
            onClick={() => handleSortChange(row, 1)}
          />
        </Space>
      ),
    },
    { title: '字段名', dataIndex: 'label', width: 160, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'fieldType',
      width: 100,
      render: (v: string) => FIELD_TYPE_OPTIONS.find(t => t.value === v)?.label || v,
    },
    {
      title: '系统字段',
      dataIndex: 'isSystem',
      width: 90,
      render: (v: number) => v === 1 ? <Tag color="blue">系统</Tag> : <Tag>自定义</Tag>,
    },
    {
      title: '必填',
      dataIndex: 'validationsJson',
      width: 70,
      render: (v: string | null | undefined) => {
        const p = parseValidations(v);
        return p.required ? <Tag color="red">是</Tag> : <Tag>否</Tag>;
      },
    },
    {
      title: '显示',
      dataIndex: 'enabled',
      width: 70,
      render: (v: number, row: FieldConfigItem) => (
        <Switch
          size="small"
          checked={v !== 0}
          onChange={(checked) => handleToggleEnabled(row, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: any, row: FieldConfigItem) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(row)}>编辑</Button>
          {row.isSystem !== 1 && (
            <Popconfirm title="确认删除该自定义字段？" onConfirm={() => handleDelete(row)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], [rows]);

  const enabledFields = useMemo(() => rows.filter(r => r.enabled !== 0), [rows]);
  const customFields = useMemo(() => rows.filter(r => r.isSystem === 0), [rows]);

  const previewRecord = useMemo(() => {
    const rec: Record<string, unknown> = { id: 1, createTime: new Date().toISOString() };
    enabledFields.forEach(f => {
      if (f.fieldKey in rec) return;
      switch (f.fieldType) {
        case 'text':
        case 'textarea':
          rec[f.fieldKey] = `${f.label}示例值`;
          break;
        case 'number':
          rec[f.fieldKey] = 100;
          break;
        case 'date':
          rec[f.fieldKey] = '2026-07-04';
          break;
        case 'select':
          rec[f.fieldKey] = parseOptions(f.optionsJson)[0]?.label || '选项A';
          break;
        case 'multiselect':
          rec[f.fieldKey] = parseOptions(f.optionsJson).slice(0, 2).map(o => o.label);
          break;
        case 'switch':
          rec[f.fieldKey] = true;
          break;
      }
    });
    return rec;
  }, [enabledFields]);

  return (
    <Card
      title={`字段配置 - ${BIZ_TYPE_OPTIONS.find(o => o.value === bizType)?.label || bizType}`}
      extra={
        <Space>
          <Select
            value={bizType}
            onChange={setBizType}
            options={BIZ_TYPE_OPTIONS}
            style={{ width: 160 }}
          />
          <Button icon={<EyeOutlined />} onClick={() => setActiveTab(activeTab === 'list' ? 'preview' : 'list')}>
            {activeTab === 'list' ? '预览效果' : '返回配置'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增自定义字段
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveAll}
            loading={saving}
            disabled={!dirty}
          >
            保存全部{dirty ? '*' : ''}
          </Button>
        </Space>
      }
    >
      {dirty && (
        <Alert
          type="warning"
          showIcon
          message="有未保存的修改"
          description="调整字段顺序/显隐/编辑后，需点击「保存全部」才会生效到数据库。"
          style={{ marginBottom: 12 }}
        />
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="字段列表" key="list">
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            配置业务对象的字段显示/隐藏/排序/标签。系统字段不可删除，但可调整显示名和显隐。
            共 {rows.length} 个字段（系统 {rows.filter(r => r.isSystem === 1).length} / 自定义 {rows.filter(r => r.isSystem === 0).length}）
          </Text>
          <Table
            rowKey="fieldKey"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={false}
            size="small"
            scroll={{ x: 1000, y: 520 }}
          />
        </TabPane>

        <TabPane tab="列表预览" key="preview">
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            实时预览配置后的列表效果（模拟数据）
          </Text>
          <SchemaTable
            pageKey="field-config-preview"
            bizType={bizType}
            fields={enabledFields}
            defaultHidden={[]}
            dataSource={[previewRecord as any]}
            rowKey="id"
            pagination={false}
            scroll={{ x: 'max-content' }}
            enableColumnSettings={false}
            settingsPosition="none"
          />
        </TabPane>

        <TabPane tab="表单预览" key="form-preview">
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            实时预览配置后的表单效果（扩展字段区）
          </Text>
          <Card size="small" style={{ background: '#fafafa' }}>
            <div style={{ fontWeight: 600, marginBottom: 12, color: '#1f1f1f' }}>
              标准字段（固定）
            </div>
            <div style={{ color: '#8c8c8c', marginBottom: 16 }}>
              （业务表单的标准字段区域，此处省略）
            </div>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ fontWeight: 600, marginBottom: 12, color: '#1f1f1f' }}>
              扩展字段（{customFields.length} 个自定义字段）
            </div>
            <Form form={previewForm} layout="vertical" initialValues={flattenExtJson(previewRecord.extJson as string | undefined)}>
              <ExtFieldsSection
                fields={customFields}
                colSpan={12}
              />
            </Form>
          </Card>
        </TabPane>
      </Tabs>

      <Modal
        title={editing?.fieldKey ? '编辑字段' : '新增自定义字段'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleEditSubmit}
        width={640}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="label" label="字段名" rules={[{ required: true, message: '请输入字段名' }]}>
                <Input placeholder="如 样衣开发费" />
              </Form.Item>
              <Form.Item name="fieldType" label="字段类型" rules={[{ required: true }]}>
                <Select
                  options={FIELD_TYPE_OPTIONS}
                  disabled={editing?.isSystem === 1}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="required" label="是否必填" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="pcColSpan" label="显示宽度">
                <Select
                  options={[
                    { label: '整行', value: 24 },
                    { label: '半行', value: 12 },
                    { label: '三分之一行', value: 8 },
                  ]}
                />
              </Form.Item>
              {editing?.isSystem === 1 && (
                <Form.Item label="字段类型">
                  <Tag color="blue">系统字段，不可改类型</Tag>
                </Form.Item>
              )}
            </Col>
          </Row>

          {(form.getFieldValue('fieldType') === 'select' || form.getFieldValue('fieldType') === 'multiselect') && (
            <Form.Item
              name="optionsText"
              label="下拉选项"
              extra="每行一个选项"
            >
              <Input.TextArea rows={4} placeholder={'选项1\n选项2\n选项3'} />
            </Form.Item>
          )}

          <Form.Item name="remark" label="备注说明">
            <Input.TextArea rows={2} placeholder="可选，字段用途说明" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

function parseValidations(json?: string | null): { required?: boolean; pattern?: string } {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}

function parseOptions(json?: string | null): { label: string; value: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => {
      if (typeof item === 'string') return { label: item, value: item };
      return { label: item.label ?? item.value ?? String(item), value: item.value ?? item.label ?? String(item) };
    });
  } catch { return []; }
}

function mapTypeToWidget(fieldType: string): string {
  switch (fieldType) {
    case 'number': return 'inputnumber';
    case 'date': return 'datepicker';
    case 'select': return 'select';
    case 'multiselect': return 'select';
    case 'switch': return 'switch';
    case 'textarea': return 'textarea';
    default: return 'input';
  }
}

export default FieldConfigPage;
