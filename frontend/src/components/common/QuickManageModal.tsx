import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Input, Popconfirm, Spin, Tag, Tooltip } from 'antd';
import { QuestionCircleOutlined, SaveOutlined, SyncOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import factoryApi from '@/services/system/factoryApi';
import { customerApi } from '@/services/crm/customerApi';
import { notifyDataUpdated } from '@/utils/dataEvents';
import CircleIconButton from '@/components/common/CircleIconButton';
import StandardModal from './StandardModal';

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

const emptyDraft: EditDraft = { name: '', contact: '', phone: '', address: '' };

const MODE_META: Record<QuickManageMode, { defaultTitle: string; nameLabel: string; unit: string; hasContact: boolean; searchPlaceholder: string }> = {
  dict: { defaultTitle: '选项', nameLabel: '选项名称', unit: '个选项', hasContact: false, searchPlaceholder: '搜索选项名称' },
  customer: { defaultTitle: '客户', nameLabel: '公司名称', unit: '个客户', hasContact: true, searchPlaceholder: '搜索公司名称/联系人/电话' },
  supplier: { defaultTitle: '供应商', nameLabel: '供应商名称', unit: '个供应商', hasContact: true, searchPlaceholder: '搜索供应商名称/联系人/电话' },
};

/** 右侧编辑表单字段布局（label宽 + 控件） */
const FIELD_LABEL_STYLE: React.CSSProperties = {
  width: 76, flexShrink: 0, fontSize: 13, color: 'var(--color-text-secondary, #595959)', paddingTop: 5,
};
const FIELD_ROW_STYLE: React.CSSProperties = { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' };

/**
 * 通用维护弹窗（左右宽屏布局：左侧目录 + 右侧编辑区）
 * - 左侧：搜索框 + 目录列表（点击选中）+ 新增入口
 * - 右侧：选中项的编辑表单（名称/联系人/电话/地址），保存/删除即时生效
 * - 每次操作广播数据事件（dict:{type} / customer / supplier），当前表单下拉即时刷新
 * - 支持：字典词条 / CRM客户 / 物料供应商（含地址）
 */
const QuickManageModal: React.FC<QuickManageModalProps> = ({ open, mode, onClose, dictType, title }) => {
  const { message } = App.useApp();
  const meta = MODE_META[mode];
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ManageRow[]>([]);
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(emptyDraft);

  const notifyChanged = useCallback(() => {
    notifyDataUpdated(mode === 'dict' ? `dict:${dictType}` : mode);
  }, [mode, dictType]);

  const loadList = useCallback(async (): Promise<ManageRow[]> => {
    if (mode === 'dict' && !dictType) return [];
    setLoading(true);
    let result: ManageRow[] = [];
    try {
      if (mode === 'dict') {
        const res: any = await api.get('/system/dict/list', { params: { dictType, page: 1, pageSize: 500 } });
        const list: any[] = res?.data?.records || res?.data || [];
        result = [...list]
          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
          .map((r) => ({ id: String(r.id), name: r.dictLabel ?? '' }));
      } else if (mode === 'customer') {
        const res = await customerApi.list({ page: 1, pageSize: 500 });
        const list = res?.data?.records || [];
        result = list.map((c) => ({
          id: String(c.id),
          name: c.companyName,
          contact: c.contactPerson,
          phone: c.contactPhone,
          address: c.address,
        }));
      } else {
        const res = await factoryApi.list({ pageSize: 1000, supplierType: 'MATERIAL', status: 'active' });
        const list = res?.data?.records || [];
        result = list.map((f) => ({
          id: String(f.id),
          name: f.factoryName,
          contact: f.contactPerson,
          phone: f.contactPhone,
          address: f.address,
        }));
      }
      setRows(result);
    } catch {
      message.error('加载列表失败');
    } finally {
      setLoading(false);
    }
    return result;
  }, [mode, dictType, message]);

  useEffect(() => {
    if (open) {
      setKeyword(''); setSelectedId(null); setCreating(false); setDraft(emptyDraft);
      loadList();
    }
  }, [open, loadList]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) =>
      [r.name, r.contact, r.phone, r.address].some((v) => v && v.toLowerCase().includes(kw))
    );
  }, [rows, keyword]);

  const selectedRow = rows.find((r) => r.id === selectedId) || null;

  const selectRow = (row: ManageRow) => {
    setCreating(false);
    setSelectedId(row.id);
    setDraft({ name: row.name, contact: row.contact, phone: row.phone, address: row.address });
  };

  const startCreate = () => {
    setSelectedId(null);
    setCreating(true);
    setDraft(emptyDraft);
  };

  /** 保存：creating 走创建，否则走更新 */
  const handleSave = async () => {
    const name = draft.name.trim();
    if (!name) {
      message.warning(`请填写${meta.nameLabel}`);
      return;
    }
    if (rows.some((r) => r.id !== selectedId && r.name === name)) {
      message.warning(`"${name}" 已存在`);
      return;
    }
    setSaving(true);
    try {
      if (creating) {
        if (mode === 'dict') {
          await api.post('/system/dict', { dictType, dictCode: name, dictLabel: name, sort: rows.length + 1 });
        } else if (mode === 'customer') {
          await customerApi.create({
            companyName: name,
            contactPerson: draft.contact?.trim() || undefined,
            contactPhone: draft.phone?.trim() || undefined,
            address: draft.address?.trim() || undefined,
            status: 'ACTIVE',
            customerLevel: 'NORMAL',
          } as any);
        } else {
          await factoryApi.create({
            factoryName: name,
            contactPerson: draft.contact?.trim() || undefined,
            contactPhone: draft.phone?.trim() || undefined,
            address: draft.address?.trim() || undefined,
            supplierType: 'MATERIAL',
            factoryType: 'EXTERNAL',
            status: 'active',
          } as any);
        }
        message.success(`已添加"${name}"`);
        setCreating(false);
        const newList = await loadList();
        // 自动选中新加的条目（按名称匹配），右侧直接进入编辑态
        const created = newList.find((r) => r.name === name);
        if (created) {
          setSelectedId(created.id);
          setDraft({ name: created.name, contact: created.contact, phone: created.phone, address: created.address });
        }
      } else if (selectedRow) {
        if (mode === 'dict') {
          await api.put(`/system/dict/${selectedRow.id}`, {
            id: Number(selectedRow.id), dictType, dictLabel: name, dictCode: name,
          });
        } else if (mode === 'customer') {
          await customerApi.update(selectedRow.id, {
            companyName: name,
            contactPerson: draft.contact?.trim() || undefined,
            contactPhone: draft.phone?.trim() || undefined,
            address: draft.address?.trim() || undefined,
          });
        } else {
          await factoryApi.update(selectedRow.id, {
            factoryName: name,
            contactPerson: draft.contact?.trim() || undefined,
            contactPhone: draft.phone?.trim() || undefined,
            address: draft.address?.trim() || undefined,
          } as any);
        }
        message.success('已保存');
        await loadList();
      }
      notifyChanged();
    } catch {
      message.error(creating ? '添加失败' : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    try {
      if (mode === 'dict') {
        await api.delete(`/system/dict/${selectedRow.id}`);
      } else if (mode === 'customer') {
        await customerApi.delete(selectedRow.id);
      } else {
        await factoryApi.delete(selectedRow.id);
      }
      message.success(`已删除"${selectedRow.name}"`);
      setSelectedId(null);
      setDraft(emptyDraft);
      await loadList();
      notifyChanged();
    } catch {
      message.error('删除失败');
    }
  };

  const fieldInput = (field: keyof EditDraft, placeholder: string, maxLength = 100, textarea = false) =>
    textarea ? (
      <Input.TextArea
        value={draft[field]}
        onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={2}
      />
    ) : (
      <Input
        value={draft[field]}
        onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
        onPressEnter={handleSave}
        placeholder={placeholder}
        maxLength={maxLength}
        allowClear
      />
    );

  return (
    <StandardModal
      title={`维护${title ?? meta.defaultTitle}`}
      open={open}
      onCancel={onClose}
      footer={null}
      size="md"
      minHeight={300}
      styles={{ body: { paddingTop: 12 } }}
    >
      <div style={{ display: 'flex', gap: 16, height: '54vh', minHeight: 260 }}>
        {/* ===== 左侧：目录 ===== */}
        <div
          style={{
            width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid var(--color-border-light)', paddingRight: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <Input.Search
              placeholder={meta.searchPlaceholder}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
              size="small"
              style={{ flex: 1 }}
            />
            <Tooltip title="刷新列表">
              <Button size="small" icon={<SyncOutlined />} onClick={loadList} loading={loading} />
            </Tooltip>
            <CircleIconButton size={24} type="add" title={`新增${meta.defaultTitle}`} onClick={startCreate} />
          </div>
          <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            共 <Tag color="blue" style={{ marginInlineEnd: 0 }}>{rows.length}</Tag> {meta.unit}，点击左侧条目在右侧编辑
          </div>
          <Spin spinning={loading}>
            <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', marginLeft: -4 }}>
              {filtered.length === 0 && !loading ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" style={{ marginTop: 24 }} />
              ) : (
                filtered.map((row) => {
                  const active = !creating && row.id === selectedId;
                  return (
                    <div
                      key={row.id}
                      onClick={() => selectRow(row)}
                      style={{
                        padding: '8px 10px', borderRadius: 6, marginBottom: 4, cursor: 'pointer',
                        background: active ? 'var(--color-primary-bg)' : 'transparent',
                        boxShadow: active ? 'inset 0 0 0 1px var(--color-primary-border)' : 'none',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-bg-subtle)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.name}
                      </div>
                      {meta.hasContact && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[row.contact, row.phone].filter(Boolean).join(' · ') || '—'}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Spin>
        </div>

        {/* ===== 右侧：编辑区 ===== */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {creating ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>新增{meta.defaultTitle}</div>
              <div style={FIELD_ROW_STYLE}>
                <span style={FIELD_LABEL_STYLE}>{meta.nameLabel}</span>
                {fieldInput('name', `请输入${meta.nameLabel}`, 100)}
              </div>
              {meta.hasContact && (
                <>
                  <div style={FIELD_ROW_STYLE}>
                    <span style={FIELD_LABEL_STYLE}>联系人</span>
                    {fieldInput('contact', '请输入联系人（选填）', 50)}
                  </div>
                  <div style={FIELD_ROW_STYLE}>
                    <span style={FIELD_LABEL_STYLE}>联系电话</span>
                    {fieldInput('phone', '请输入联系电话（选填）', 30)}
                  </div>
                  <div style={FIELD_ROW_STYLE}>
                    <span style={FIELD_LABEL_STYLE}>地址</span>
                    {fieldInput('address', '请输入地址（选填）', 200, true)}
                  </div>
                </>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave}>添加并生效</Button>
                <Button onClick={() => { setCreating(false); setDraft(emptyDraft); }}>取消</Button>
              </div>
              <div style={{ marginTop: 16, padding: '6px 10px', background: 'var(--color-bg-subtle, rgba(0,0,0,0.03))', borderRadius: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                添加后立即生效，并同步到当前表单的下拉选项。
              </div>
            </>
          ) : selectedRow ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  编辑：{selectedRow.name}
                </span>
                <Popconfirm
                  title={`删除"${selectedRow.name}"？`}
                  description={mode === 'dict' ? '删除后已使用该值的记录不会自动更新' : '删除后不可恢复，请谨慎操作'}
                  icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={handleDelete}
                >
                  <CircleIconButton size={24} type="remove" title="删除此项" />
                </Popconfirm>
              </div>
              <div style={FIELD_ROW_STYLE}>
                <span style={FIELD_LABEL_STYLE}>{meta.nameLabel}</span>
                {fieldInput('name', `请输入${meta.nameLabel}`, 100)}
              </div>
              {meta.hasContact && (
                <>
                  <div style={FIELD_ROW_STYLE}>
                    <span style={FIELD_LABEL_STYLE}>联系人</span>
                    {fieldInput('contact', '请输入联系人', 50)}
                  </div>
                  <div style={FIELD_ROW_STYLE}>
                    <span style={FIELD_LABEL_STYLE}>联系电话</span>
                    {fieldInput('phone', '请输入联系电话', 30)}
                  </div>
                  <div style={FIELD_ROW_STYLE}>
                    <span style={FIELD_LABEL_STYLE}>地址</span>
                    {fieldInput('address', '请输入地址', 200, true)}
                  </div>
                </>
              )}
              <div style={{ marginTop: 8 }}>
                <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存</Button>
              </div>
              <div style={{ marginTop: 16, padding: '6px 10px', background: 'var(--color-bg-subtle, rgba(0,0,0,0.03))', borderRadius: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                左侧点击其他条目可切换；保存即时生效，并同步到当前表单的下拉选项。
              </div>
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={`点击左侧条目进行编辑，或点左上方 + 号新增${meta.defaultTitle}`}
              style={{ marginTop: 60 }}
            />
          )}
        </div>
      </div>
    </StandardModal>
  );
};

export default QuickManageModal;
