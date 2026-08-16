import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Input, Popconfirm, Space, Spin, Table, Tag, Tooltip } from 'antd';
import { PlusOutlined, QuestionCircleOutlined, SyncOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import factoryApi from '@/services/system/factoryApi';
import { customerApi } from '@/services/crm/customerApi';
import { notifyDataUpdated } from '@/utils/dataEvents';
import ResizableModal from './ResizableModal';

export type QuickManageMode = 'dict' | 'customer' | 'supplier';

interface QuickManageModalProps {
  open: boolean;
  mode: QuickManageMode;
  onClose: () => void;
  /** mode=dict 时必填，如 category / product_type / style_theme */
  dictType?: string;
  /** 弹窗标题，默认按 mode 生成 */
  title?: string;
}

/** 统一行模型：dict=词条 / customer=客户 / supplier=供应商 */
interface ManageRow {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
}

interface EditDraft {
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
}

const MODE_META: Record<QuickManageMode, { defaultTitle: string; unit: string; width: number; hasContact: boolean }> = {
  dict: { defaultTitle: '选项维护', unit: '个选项', width: 480, hasContact: false },
  customer: { defaultTitle: '客户维护', unit: '个客户', width: 820, hasContact: true },
  supplier: { defaultTitle: '供应商维护', unit: '个供应商', width: 820, hasContact: true },
};

/**
 * 通用快捷维护弹窗（颜色图片管理同款风格）
 * - 表格布局：一行一条记录 + 行内编辑/删除，顶部快捷添加
 * - 每次操作即时保存并广播数据事件（dict:{type} / customer / supplier），当前表单下拉即时刷新
 * - 支持：字典词条 / CRM客户 / 物料供应商（含地址）
 */
const QuickManageModal: React.FC<QuickManageModalProps> = ({ open, mode, onClose, dictType, title }) => {
  const { message } = App.useApp();
  const meta = MODE_META[mode];
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ManageRow[]>([]);
  const [addName, setAddName] = useState('');
  const [addContact, setAddContact] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ name: '' });

  const notifyChanged = useCallback(() => {
    notifyDataUpdated(mode === 'dict' ? `dict:${dictType}` : mode);
  }, [mode, dictType]);

  const loadList = useCallback(async () => {
    if (mode === 'dict' && !dictType) return;
    setLoading(true);
    try {
      if (mode === 'dict') {
        const res: any = await api.get('/system/dict/list', { params: { dictType, page: 1, pageSize: 500 } });
        const list: any[] = res?.data?.records || res?.data || [];
        setRows(
          [...list]
            .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
            .map((r) => ({ id: String(r.id), name: r.dictLabel ?? '' }))
        );
      } else if (mode === 'customer') {
        const res = await customerApi.list({ page: 1, pageSize: 500 });
        const list = res?.data?.records || [];
        setRows(
          list.map((c) => ({
            id: String(c.id),
            name: c.companyName,
            contact: c.contactPerson,
            phone: c.contactPhone,
            address: c.address,
          }))
        );
      } else {
        const res = await factoryApi.list({ pageSize: 1000, supplierType: 'MATERIAL', status: 'active' });
        const list = res?.data?.records || [];
        setRows(
          list.map((f) => ({
            id: String(f.id),
            name: f.factoryName,
            contact: f.contactPerson,
            phone: f.contactPhone,
            address: f.address,
          }))
        );
      }
    } catch {
      message.error('加载列表失败');
    } finally {
      setLoading(false);
    }
  }, [mode, dictType, message]);

  useEffect(() => {
    if (open) {
      setAddName(''); setAddContact(''); setAddPhone(''); setAddAddress('');
      setEditingId(null);
      loadList();
    }
  }, [open, loadList]);

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return;
    if (rows.some((r) => r.name === name)) {
      message.warning(`"${name}" 已存在`);
      return;
    }
    setSaving(true);
    try {
      if (mode === 'dict') {
        await api.post('/system/dict', {
          dictType,
          dictCode: name,
          dictLabel: name,
          sort: rows.length + 1,
        });
      } else if (mode === 'customer') {
        await customerApi.create({
          companyName: name,
          contactPerson: addContact.trim() || undefined,
          contactPhone: addPhone.trim() || undefined,
          address: addAddress.trim() || undefined,
          status: 'ACTIVE',
          customerLevel: 'NORMAL',
        } as any);
      } else {
        await factoryApi.create({
          factoryName: name,
          contactPerson: addContact.trim() || undefined,
          contactPhone: addPhone.trim() || undefined,
          address: addAddress.trim() || undefined,
          supplierType: 'MATERIAL',
          factoryType: 'EXTERNAL',
          status: 'active',
        } as any);
      }
      message.success(`已添加"${name}"`);
      setAddName(''); setAddContact(''); setAddPhone(''); setAddAddress('');
      await loadList();
      notifyChanged();
    } catch {
      message.error('添加失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ManageRow) => {
    try {
      if (mode === 'dict') {
        await api.delete(`/system/dict/${row.id}`);
      } else if (mode === 'customer') {
        await customerApi.delete(row.id);
      } else {
        await factoryApi.delete(row.id);
      }
      message.success(`已删除"${row.name}"`);
      await loadList();
      notifyChanged();
    } catch {
      message.error('删除失败');
    }
  };

  const startEdit = (row: ManageRow) => {
    setEditingId(row.id);
    setDraft({ name: row.name, contact: row.contact, phone: row.phone, address: row.address });
  };

  const saveEdit = async (row: ManageRow) => {
    const name = draft.name.trim();
    if (!name) return;
    if (rows.some((r) => r.id !== row.id && r.name === name)) {
      message.warning(`"${name}" 已存在`);
      return;
    }
    try {
      if (mode === 'dict') {
        await api.put(`/system/dict/${row.id}`, { id: Number(row.id), dictType, dictLabel: name, dictCode: name });
      } else if (mode === 'customer') {
        await customerApi.update(row.id, {
          companyName: name,
          contactPerson: draft.contact?.trim() || undefined,
          contactPhone: draft.phone?.trim() || undefined,
          address: draft.address?.trim() || undefined,
        });
      } else {
        await factoryApi.update(row.id, {
          factoryName: name,
          contactPerson: draft.contact?.trim() || undefined,
          contactPhone: draft.phone?.trim() || undefined,
          address: draft.address?.trim() || undefined,
        } as any);
      }
      message.success('已保存');
      setEditingId(null);
      await loadList();
      notifyChanged();
    } catch {
      message.error('保存失败');
    }
  };

  const cellInput = (field: keyof EditDraft, placeholder: string, width?: number) => (
    <Input
      size="small"
      value={draft[field]}
      onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
      onPressEnter={() => editingId && saveEdit(rows.find((r) => r.id === editingId)!)}
      placeholder={placeholder}
      style={{ width: width ?? '100%' }}
    />
  );

  const columns = useMemo(() => {
    const cols: any[] = [
      {
        title: mode === 'dict' ? '选项名' : mode === 'customer' ? '公司名称' : '供应商名称',
        dataIndex: 'name',
        key: 'name',
        width: meta.hasContact ? 170 : undefined,
        render: (v: string, record: ManageRow) =>
          editingId === record.id ? cellInput('name', '名称') : <span style={{ fontWeight: 500 }}>{v}</span>,
      },
    ];
    if (meta.hasContact) {
      cols.push(
        {
          title: '联系人',
          dataIndex: 'contact',
          key: 'contact',
          width: 100,
          render: (v: string, record: ManageRow) =>
            editingId === record.id ? cellInput('contact', '联系人') : v || '-',
        },
        {
          title: '联系电话',
          dataIndex: 'phone',
          key: 'phone',
          width: 130,
          render: (v: string, record: ManageRow) =>
            editingId === record.id ? cellInput('phone', '联系电话') : v || '-',
        },
        {
          title: '地址',
          dataIndex: 'address',
          key: 'address',
          ellipsis: true,
          render: (v: string, record: ManageRow) =>
            editingId === record.id ? cellInput('address', '地址') : v || '-',
        }
      );
    }
    cols.push({
      title: '操作',
      key: 'action',
      width: meta.hasContact ? 150 : 120,
      render: (_: unknown, record: ManageRow) =>
        editingId === record.id ? (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => saveEdit(record)}>保存</Button>
            <Button type="link" size="small" onClick={() => setEditingId(null)}>取消</Button>
          </Space>
        ) : (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => startEdit(record)}>编辑</Button>
            <Popconfirm
              title={`删除"${record.name}"？`}
              description={mode === 'dict' ? '删除后已使用该值的记录不会自动更新' : '删除后不可恢复，请谨慎操作'}
              icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => handleDelete(record)}
            >
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </Space>
        ),
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, editingId, draft, rows, meta.hasContact]);

  const hint =
    mode === 'dict'
      ? '输入新选项回车即可添加；点「编辑」可改名。变更即时生效并同步到当前表单下拉选项。'
      : '填写信息点击添加即可新建；点「编辑」可修改联系人/电话/地址。变更即时生效并同步到当前表单下拉选项。';

  return (
    <ResizableModal
      title={`维护${title ?? meta.defaultTitle}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={meta.width}
      styles={{ body: { paddingTop: 12 } }}
    >
      {/* 头部：统计 + 刷新 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space size={6} wrap>
          <Tag color="blue">{rows.length} {meta.unit}</Tag>
        </Space>
        <Button size="small" icon={<SyncOutlined />} onClick={loadList} loading={loading}>刷新</Button>
      </div>

      {/* 快捷添加 */}
      {meta.hasContact ? (
        <Space.Compact style={{ width: '100%', marginBottom: 12 }} block>
          <Input placeholder="名称（必填）" value={addName} onChange={(e) => setAddName(e.target.value)} onPressEnter={handleAdd} maxLength={100} style={{ width: '28%' }} />
          <Input placeholder="联系人" value={addContact} onChange={(e) => setAddContact(e.target.value)} maxLength={50} style={{ width: '16%' }} />
          <Input placeholder="联系电话" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} maxLength={30} style={{ width: '20%' }} />
          <Input placeholder="地址" value={addAddress} onChange={(e) => setAddAddress(e.target.value)} maxLength={200} style={{ width: '26%' }} />
          <Tooltip title="添加后立即生效">
            <Button type="primary" icon={<PlusOutlined />} loading={saving} onClick={handleAdd} style={{ width: '10%' }}>添加</Button>
          </Tooltip>
        </Space.Compact>
      ) : (
        <Input.Search
          placeholder="输入新选项，回车或点添加"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          onSearch={handleAdd}
          enterButton={<Button type="primary" icon={<PlusOutlined />} loading={saving}>添加</Button>}
          style={{ marginBottom: 12 }}
          allowClear
        />
      )}

      {/* 说明条 */}
      <div style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--color-bg-subtle, rgba(0,0,0,0.03))', borderRadius: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        {hint}
      </div>

      {/* 列表表格 */}
      <Spin spinning={loading}>
        {rows.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无数据，在上方直接添加`} />
        ) : (
          <Table
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={rows.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> }}
          />
        )}
      </Spin>
    </ResizableModal>
  );
};

export default QuickManageModal;
