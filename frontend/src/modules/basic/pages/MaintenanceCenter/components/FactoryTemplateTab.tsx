import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, Select, Space, Tag, Dropdown, message } from 'antd';
import { PlusOutlined, CopyOutlined, SearchOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import api from '@/utils/api';
import type { TemplateLibrary } from '@/types/style';
import { typeLabel, typeColor } from '../../TemplateCenter/utils/templateUtils';
import TemplateInlineEditor from '../../TemplateCenter/components/inlineEditor/TemplateInlineEditor';
import TemplateViewContent from '../../TemplateCenter/components/TemplateViewContent';
import './FactoryTemplateTab.css';

const FACTORY_TEMPLATE_TYPES = [
  { value: '', label: '全部类型' },
  { value: 'process', label: '工序模板' },
  { value: 'size', label: '尺寸模板' },
  { value: 'bom', label: 'BOM模板' },
];

const FACTORY_TEMPLATE_TYPE_OPTIONS = [
  { value: 'process', label: '工序模板' },
  { value: 'size', label: '尺寸模板' },
  { value: 'bom', label: 'BOM模板' },
];

const COPY_TEMPLATE_TYPES = [
  { value: 'process', label: '工序模板' },
  { value: 'size', label: '尺寸模板' },
  { value: 'bom', label: 'BOM模板' },
  { value: 'process_price', label: '工序单价模板' },
];

const FactoryTemplateTab: React.FC = () => {
  const { modal } = App.useApp();

  const [data, setData] = useState<TemplateLibrary[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [templateType, setTemplateType] = useState('');
  const [keyword, setKeyword] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TemplateLibrary | null>(null);
  const [createType, setCreateType] = useState<string>('process');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingRow, setViewingRow] = useState<TemplateLibrary | null>(null);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm] = Form.useForm();
  const [copyLoading, setCopyLoading] = useState(false);
  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);

  const fetchList = useCallback(async (pg?: number) => {
    setLoading(true);
    try {
      const p = pg ?? page;
      const params: Record<string, unknown> = { page: p, pageSize, isFactoryTemplate: true };
      if (templateType) params.templateType = templateType;
      if (keyword) params.keyword = keyword;
      const res = await api.get<any>('/template-library/list', { params });
      const d = res?.data ?? res;
      setData(d?.records ?? []);
      setTotal(Number(d?.total ?? 0));
      setPage(p);
    } catch {
      message.error('加载模板列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, templateType, keyword]);

  useEffect(() => { fetchList(1); }, [templateType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateBlank = (type: string) => {
    setCreateType(type);
    const newTpl: Partial<TemplateLibrary> = {
      templateType: type,
      templateName: '',
      templateKey: `factory_${type}_${Date.now()}`,
      sourceStyleNo: '',
      locked: 0,
      templateContent: getDefaultContent(type),
    };
    setEditingRow(newTpl as TemplateLibrary);
    setEditOpen(true);
  };

  const handleEdit = async (row: TemplateLibrary) => {
    if (Number(row.locked) === 1) {
      message.error('模板已锁定，如需修改请先退回');
      return;
    }
    try {
      const res = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
      if (res?.code === 200 && res.data) {
        setEditingRow(res.data);
        setEditOpen(true);
      }
    } catch {
      setEditingRow(row);
      setEditOpen(true);
    }
  };

  const handleView = (row: TemplateLibrary) => {
    setViewingRow(row);
    setViewOpen(true);
  };

  const handleDelete = (row: TemplateLibrary) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除模板「${row.templateName || row.templateKey}」吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/template-library/${row.id}`);
          message.success('删除成功');
          fetchList();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleLock = async (row: TemplateLibrary) => {
    try {
      await api.post(`/template-library/${row.id}/lock`);
      message.success('锁定成功');
      fetchList();
    } catch {
      message.error('锁定失败');
    }
  };

  const handleRollback = async (row: TemplateLibrary) => {
    try {
      await api.post(`/template-library/${row.id}/rollback`, { reason: '工厂模板退回编辑' });
      message.success('退回成功');
      fetchList();
    } catch {
      message.error('退回失败');
    }
  };

  const fetchStyleNoOptions = async (searchText: string) => {
    setStyleNoLoading(true);
    try {
      const res = await api.get<any>('/template-library/process-price-style-options', {
        params: { keyword: searchText || undefined },
      });
      const list = res?.data ?? res ?? [];
      setStyleNoOptions(
        Array.isArray(list)
          ? list.map((item: any) => ({
              value: item.styleNo || item.value,
              label: item.styleNo || item.label,
            }))
          : []
      );
    } catch {
      setStyleNoOptions([]);
    } finally {
      setStyleNoLoading(false);
    }
  };

  const handleCopyFromStyle = () => {
    copyForm.resetFields();
    setCopyOpen(true);
    fetchStyleNoOptions('');
  };

  const handleCopySubmit = async () => {
    try {
      const values = await copyForm.validateFields();
      setCopyLoading(true);
      await api.post('/template-library/create-from-style', {
        sourceStyleNo: values.sourceStyleNo,
        templateTypes: values.templateTypes,
        isFactoryTemplate: true,
      });
      message.success('从款式复制模板成功');
      setCopyOpen(false);
      fetchList(1);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '复制失败');
    } finally {
      setCopyLoading(false);
    }
  };

  const columns = useMemo(() => [
    {
      title: '模板名称',
      dataIndex: 'templateName',
      key: 'templateName',
      width: 200,
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: '类型',
      dataIndex: 'templateType',
      key: 'templateType',
      width: 100,
      render: (type: string) => <Tag color={typeColor(type)}>{typeLabel(type)}</Tag>,
    },
    {
      title: '来源款号',
      dataIndex: 'sourceStyleNo',
      key: 'sourceStyleNo',
      width: 120,
      render: (text: string) => text || <Tag>工厂自建</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'locked',
      key: 'locked',
      width: 80,
      render: (locked: number) => Number(locked) === 1
        ? <Tag color="green">已锁定</Tag>
        : <Tag color="orange">编辑中</Tag>,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 100,
      render: (text: string) => text || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 160,
      render: (text: string) => text || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, row: TemplateLibrary) => {
        const isLocked = Number(row.locked) === 1;
        const actions: RowAction[] = [
          { key: 'view', label: '查看', onClick: () => handleView(row) },
        ];
        if (!isLocked) {
          actions.push({ key: 'edit', label: '编辑', onClick: () => handleEdit(row) });
        }
        if (isLocked) {
          actions.push({ key: 'rollback', label: '退回', onClick: () => handleRollback(row) });
        } else {
          actions.push({ key: 'lock', label: '锁定', onClick: () => handleLock(row) });
        }
        actions.push({ key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(row) });
        return <RowActions actions={actions} maxInline={2} />;
      },
    },
  ], []);

  const createMenuItems = useMemo(() => FACTORY_TEMPLATE_TYPE_OPTIONS.map(opt => ({
    key: opt.value,
    label: <span><PlusOutlined style={{ marginRight: 8 }} />{opt.label}</span>,
    onClick: () => handleCreateBlank(opt.value),
  })), []);

  return (
    <div className="factory-template-tab">
      <div className="factory-template-tab__toolbar">
        <Space>
          <Select
            value={templateType}
            onChange={setTemplateType}
            options={FACTORY_TEMPLATE_TYPES}
            style={{ width: 130 }}
          />
          <Input.Search
            placeholder="搜索模板名称"
            allowClear
            enterButton={<SearchOutlined />}
            style={{ width: 240 }}
            onSearch={(val) => { setKeyword(val); fetchList(1); }}
          />
        </Space>
        <Space>
          <Dropdown menu={{ items: createMenuItems }}>
            <Button type="primary" icon={<PlusOutlined />}>空白创建</Button>
          </Dropdown>
          <Button icon={<CopyOutlined />} onClick={handleCopyFromStyle}>从款式复制</Button>
        </Space>
      </div>

      <ResizableTable
        rowKey="id"
        dataSource={data}
        columns={columns}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个模板`,
          onChange: (p, ps) => { setPageSize(ps); fetchList(p); },
        }}
        scroll={{ x: 960 }}
      />

      <ResizableModal
        title={editingRow?.id ? `编辑模板 — ${editingRow.templateName || ''}` : `创建${typeLabel(createType)}`}
        open={editOpen}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        onCancel={() => { setEditOpen(false); setEditingRow(null); }}
        footer={null}
        destroyOnHidden
      >
        {editingRow && (
          <TemplateInlineEditor
            row={editingRow}
            onSaved={async () => {
              setEditOpen(false);
              setEditingRow(null);
              fetchList(1);
            }}
            onCancel={() => { setEditOpen(false); setEditingRow(null); }}
          />
        )}
      </ResizableModal>

      <ResizableModal
        title={`查看模板 — ${viewingRow?.templateName || ''}`}
        open={viewOpen}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        onCancel={() => { setViewOpen(false); setViewingRow(null); }}
        footer={null}
        destroyOnHidden
      >
        {viewingRow && (
          <TemplateViewContent
            activeRow={viewingRow as unknown as Record<string, unknown>}
            viewObj={(() => { try { return JSON.parse(viewingRow.templateContent || '{}'); } catch { return {}; } })()}
            viewContent={viewingRow.templateContent || '{}'}
          />
        )}
      </ResizableModal>

      <ResizableModal
        title="从款式复制模板"
        open={copyOpen}
        width="40vw"
        onCancel={() => setCopyOpen(false)}
        onOk={handleCopySubmit}
        okText="复制创建"
        confirmLoading={copyLoading}
      >
        <Form form={copyForm} layout="vertical">
          <Form.Item
            name="sourceStyleNo"
            label="来源款号"
            rules={[{ required: true, message: '请选择款号' }]}
          >
            <Select
              showSearch
              allowClear
              loading={styleNoLoading}
              placeholder="搜索/选择款号"
              optionFilterProp="label"
              options={styleNoOptions}
              onSearch={(val) => fetchStyleNoOptions(val)}
              onDropdownVisibleChange={(open) => { if (open && styleNoOptions.length === 0) fetchStyleNoOptions(''); }}
            />
          </Form.Item>
          <Form.Item
            name="templateTypes"
            label="复制类型"
            rules={[{ required: true, message: '请选择至少一种类型' }]}
            initialValue={['process', 'size', 'bom']}
          >
            <Select
              mode="multiple"
              options={COPY_TEMPLATE_TYPES}
              placeholder="选择要复制的模板类型"
            />
          </Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};

function getDefaultContent(type: string): string {
  switch (type) {
    case 'process':
      return JSON.stringify({
        steps: [
          { processCode: '01', processName: '', progressStage: '', unitPrice: 0 },
        ],
      });
    case 'size':
      return JSON.stringify({
        sizes: ['S', 'M', 'L', 'XL'],
        parts: [{ partName: '', measureMethod: '', tolerance: 0.5, values: {} }],
      });
    case 'bom':
      return JSON.stringify({
        rows: [
          { codePrefix: '', materialType: '', materialName: '', color: '', specification: '', unit: '', usageAmount: 0, lossRate: 0, unitPrice: 0, supplier: '' },
        ],
      });
    default:
      return '{}';
  }
}

export default FactoryTemplateTab;
