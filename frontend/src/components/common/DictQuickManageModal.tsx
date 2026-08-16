import { PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { App, Button, Empty, Input, Popconfirm, Spin, Typography } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';
import { notifyDataUpdated } from '@/utils/dataEvents';
import ResizableModal from './ResizableModal';

export interface DictQuickManageModalProps {
  open: boolean;
  dictType: string;
  /** 展示名，如"设计师""商品主题" */
  title: string;
  onClose: () => void;
}

interface DictItem {
  id: number;
  dictType?: string;
  dictCode?: string;
  dictLabel?: string;
  sort?: number;
}

interface DictRow extends DictItem {
  __renaming?: boolean;
}

/**
 * 字典词条快捷维护弹窗
 * 在字段旁直接查看/新增/删除/重命名字典词条，无需跳转系统管理-字典管理页。
 * 任何写操作成功后广播 dict:${dictType} 事件，同页 DictAutoComplete / useDictOptions 即时刷新。
 */
const DictQuickManageModal: React.FC<DictQuickManageModalProps> = ({ open, dictType, title, onClose }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<DictRow[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [renameValue, setRenameValue] = useState('');

  const loadList = useCallback(async () => {
    if (!dictType) return;
    setLoading(true);
    try {
      const res: any = await api.get('/system/dict/list', {
        params: { dictType, page: 1, pageSize: 500 },
      });
      const list: DictItem[] = res?.data?.records || res?.data || res?.records || [];
      setRows([...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));
    } catch {
      message.error('加载词条失败');
    } finally {
      setLoading(false);
    }
  }, [dictType, message]);

  useEffect(() => {
    if (open) {
      setNewLabel('');
      loadList();
    }
  }, [open, loadList]);

  const notifyChanged = useCallback(() => {
    notifyDataUpdated(`dict:${dictType}`);
  }, [dictType]);

  // 新增词条：dictCode 后端会大写规范化，sort 取当前最大值+1
  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;
    if (rows.some((r) => r.dictLabel === label)) {
      message.warning(`"${label}" 已存在`);
      return;
    }
    setSaving(true);
    try {
      await api.post('/system/dict', {
        dictType,
        dictCode: label,
        dictLabel: label,
        sort: (rows[rows.length - 1]?.sort ?? rows.length) + 1,
      });
      message.success(`已添加"${label}"`);
      setNewLabel('');
      await loadList();
      notifyChanged();
    } catch {
      message.error('添加失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: DictRow) => {
    try {
      await api.delete(`/system/dict/${row.id}`);
      message.success(`已删除"${row.dictLabel}"`);
      await loadList();
      notifyChanged();
    } catch {
      message.error('删除失败');
    }
  };

  const startRename = (row: DictRow) => {
    setRows((prev) => prev.map((r) => ({ ...r, __renaming: r.id === row.id })));
    setRenameValue(row.dictLabel ?? '');
  };

  const confirmRename = async (row: DictRow) => {
    const label = renameValue.trim();
    if (!label || label === row.dictLabel) {
      setRows((prev) => prev.map((r) => ({ ...r, __renaming: false })));
      return;
    }
    if (rows.some((r) => r.id !== row.id && r.dictLabel === label)) {
      message.warning(`"${label}" 已存在`);
      return;
    }
    try {
      await api.put(`/system/dict/${row.id}`, { ...row, dictLabel: label });
      message.success('已重命名');
      setRows((prev) => prev.map((r) => ({ ...r, __renaming: false })));
      await loadList();
      notifyChanged();
    } catch {
      message.error('重命名失败');
    }
  };

  return (
    <ResizableModal
      title={`维护${title}选项`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      styles={{ body: { paddingTop: 12 } }}
    >
      {/* 新增 */}
      <Input.Search
        placeholder={`输入新的${title}选项，回车或点添加`}
        value={newLabel}
        onChange={(e) => setNewLabel(e.target.value)}
        onSearch={handleAdd}
        enterButton={
          <Button type="primary" icon={<PlusOutlined />} loading={saving}>
            添加
          </Button>
        }
        style={{ marginBottom: 12 }}
        allowClear
      />

      {/* 词条列表 */}
      <Spin spinning={loading}>
        {rows.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${title}选项，在上方直接添加`} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 320, overflowY: 'auto', gap: 2 }}>
            {rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border-secondary, #f0f0f0)',
                }}
              >
                {row.__renaming ? (
                  <Input
                    size="small"
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onPressEnter={() => confirmRename(row)}
                    onBlur={() => confirmRename(row)}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <Typography.Text
                    style={{ flex: 1, cursor: 'text' }}
                    ellipsis={{ tooltip: row.dictLabel }}
                    onDoubleClick={() => startRename(row)}
                  >
                    {row.dictLabel}
                  </Typography.Text>
                )}
                <Button type="link" size="small" onClick={() => startRename(row)} disabled={row.__renaming}>
                  改名
                </Button>
                <Popconfirm
                  title={`删除"${row.dictLabel}"？`}
                  description="删除后已使用该值的记录不会自动更新"
                  icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => handleDelete(row)}
                >
                  <Button type="link" size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
      </Spin>

      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
        双击词条可改名；变更即时生效并同步到当前表单下拉选项。
      </Typography.Text>
    </ResizableModal>
  );
};

export default DictQuickManageModal;
