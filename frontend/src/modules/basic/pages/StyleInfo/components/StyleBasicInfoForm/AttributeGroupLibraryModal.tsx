import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Input, Modal, Space, Spin, Tabs, Tag } from 'antd';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import api from '@/utils/api';
import { clearApiCache } from '@/utils/api/core';

type GroupType = 'color' | 'size';
type ApplyMode = 'replace' | 'append';

interface AttributeGroup {
  id: number;
  dictCode: string;
  name: string;
  values: string[];
}

interface AttributeGroupLibraryModalProps {
  open: boolean;
  onClose: () => void;
  /** 应用组合到表单：mode=replace 覆盖现有值，append 追加并去重 */
  onApply: (groupType: GroupType, values: string[], mode: ApplyMode) => void;
}

interface EditorState {
  editingId: number | null;
  editingDictCode: string;
  name: string;
  values: string[];
  saving: boolean;
}

/** 存储复用 t_dict：dictType=color_group/size_group，dictLabel=组合名，dictValue=JSON 数组 */
const GROUP_DICT_TYPE: Record<GroupType, string> = { color: 'color_group', size: 'size_group' };
const GROUP_TAB_LABEL: Record<GroupType, string> = { color: '颜色组合', size: '码数组合' };
const ITEM_LABEL: Record<GroupType, string> = { color: '颜色', size: '码数' };
const MAX_ITEMS = 30;
const MAX_NAME_LENGTH = 50;
const MAX_VALUE_JSON_LENGTH = 1000;
/** 与后端 DictOrchestrator.isValidDictLabel 保持一致（组合名称字符集） */
const NAME_INVALID_CHARS_REGEX = /[^\u4e00-\u9fa5a-zA-Z0-9\-_/()（） #.]/;

const parseGroupValues = (dictValue?: string | null): string[] => {
  if (!dictValue) return [];
  try {
    const parsed = JSON.parse(dictValue);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v ?? '').trim()).filter(Boolean);
    }
  } catch {
    // 非 JSON 走分隔符兼容逻辑
  }
  return String(dictValue)
    .split(/[,，、]/)
    .map((v) => v.trim())
    .filter(Boolean);
};

/**
 * 基础属性库弹窗
 * 维护"一套颜色 / 一套码数"的常用组合，点击"使用"一键填入表单。
 * 数据存储复用系统字典（t_dict），无独立后端接口。
 */
const AttributeGroupLibraryModal: React.FC<AttributeGroupLibraryModalProps> = ({ open, onClose, onApply }) => {
  const { message, modal } = App.useApp();

  const [activeType, setActiveType] = useState<GroupType>('color');
  const [groups, setGroups] = useState<Record<GroupType, AttributeGroup[]>>({ color: [], size: [] });
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [itemDraft, setItemDraft] = useState('');

  const loadGroups = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const tasks = (['color', 'size'] as GroupType[]).map(async (type) => {
          const res: any = await api.get('/system/dict/list', {
            params: { dictType: GROUP_DICT_TYPE[type], page: 1, pageSize: 200 },
          });
          const records: any[] = res?.data?.records || [];
          const items: AttributeGroup[] = records
            .filter((r) => r && r.dictLabel)
            .map((r) => ({
              id: Number(r.id),
              dictCode: String(r.dictCode || ''),
              name: String(r.dictLabel || ''),
              values: parseGroupValues(r.dictValue),
            }));
          return [type, items] as const;
        });
        const entries = await Promise.all(tasks);
        setGroups({ color: entries[0][1], size: entries[1][1] });
      } catch (error: any) {
        message.error(error?.message || '加载属性组合失败');
      } finally {
        setLoading(false);
      }
    },
    [message]
  );

  useEffect(() => {
    if (open) {
      setEditor(null);
      setItemDraft('');
      loadGroups();
    }
  }, [open, loadGroups]);

  const handleClose = () => {
    setEditor(null);
    setItemDraft('');
    onClose();
  };

  const openEditor = (group?: AttributeGroup) => {
    setEditor({
      editingId: group?.id ?? null,
      editingDictCode: group?.dictCode || '',
      name: group?.name || '',
      values: group ? [...group.values] : [],
      saving: false,
    });
    setItemDraft('');
  };

  const addItem = () => {
    if (!editor) return;
    const value = itemDraft.trim();
    if (!value) return;
    if (value.length > MAX_NAME_LENGTH) {
      message.warning(`单个${ITEM_LABEL[activeType]}不能超过 ${MAX_NAME_LENGTH} 个字符`);
      return;
    }
    if (editor.values.includes(value)) {
      setItemDraft('');
      return;
    }
    if (editor.values.length >= MAX_ITEMS) {
      message.warning(`单个组合最多 ${MAX_ITEMS} 个${ITEM_LABEL[activeType]}`);
      return;
    }
    setEditor({ ...editor, values: [...editor.values, value] });
    setItemDraft('');
  };

  const removeItem = (value: string) => {
    if (!editor) return;
    setEditor({ ...editor, values: editor.values.filter((v) => v !== value) });
  };

  const handleSave = async () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      message.warning('请输入组合名称');
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      message.warning(`组合名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
      return;
    }
    if (NAME_INVALID_CHARS_REGEX.test(name)) {
      message.warning('组合名称仅支持中文、字母、数字及常见分隔符（- _ / ( ) 空格 # .）');
      return;
    }
    if (!editor.values.length) {
      message.warning(`请至少添加一个${ITEM_LABEL[activeType]}`);
      return;
    }
    if (JSON.stringify(editor.values).length > MAX_VALUE_JSON_LENGTH) {
      message.warning('组合内容过长，请删减部分成员');
      return;
    }

    setEditor({ ...editor, saving: true });
    try {
      const dictType = GROUP_DICT_TYPE[activeType];
      const dictValue = JSON.stringify(editor.values);
      if (editor.editingId) {
        await api.put(`/system/dict/${editor.editingId}`, {
          dictType,
          dictCode: editor.editingDictCode,
          dictLabel: name,
          dictValue,
          sort: 0,
          status: 'ENABLED',
        });
      } else {
        await api.post('/system/dict', {
          dictType,
          dictCode: `${activeType.toUpperCase()}_GROUP_${Date.now()}`,
          dictLabel: name,
          dictValue,
          sort: 0,
          status: 'ENABLED',
        });
      }
      // 字典 GET 有前端缓存，写入后必须清缓存再刷新
      clearApiCache('/system/dict/list');
      message.success('保存成功');
      setEditor(null);
      loadGroups(false);
    } catch (error: any) {
      message.error(error?.message || '保存失败');
      setEditor((prev) => (prev ? { ...prev, saving: false } : prev));
    }
  };

  const handleDelete = (group: AttributeGroup) => {
    modal.confirm({
      title: '删除组合',
      content: `确定删除${GROUP_TAB_LABEL[activeType]}"${group.name}"吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/system/dict/${group.id}`);
          clearApiCache('/system/dict/list');
          message.success('删除成功');
          loadGroups(false);
        } catch (error: any) {
          message.error(error?.message || '删除失败');
        }
      },
    });
  };

  const handleApply = (group: AttributeGroup, mode: ApplyMode) => {
    if (!group.values.length) {
      message.warning('该组合没有可用成员，请先编辑补充');
      return;
    }
    onApply(activeType, group.values, mode);
    if (mode === 'replace') {
      message.success(`已应用${GROUP_TAB_LABEL[activeType]}"${group.name}"`);
      handleClose();
    } else {
      message.success(`已追加${ITEM_LABEL[activeType]}"${group.name}"`);
    }
  };

  const renderGroupCard = (group: AttributeGroup) => {
    const previewValues = group.values.slice(0, 10);
    const restCount = group.values.length - previewValues.length;
    return (
      <div
        key={group.id}
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{group.name}</span>
          <Space size={4} wrap>
            <Button type="primary" size="small" onClick={() => handleApply(group, 'replace')}>
              使用
            </Button>
            <Button size="small" onClick={() => handleApply(group, 'append')}>
              追加
            </Button>
            <Button size="small" onClick={() => openEditor(group)}>
              编辑
            </Button>
            <Button size="small" danger onClick={() => handleDelete(group)}>
              删除
            </Button>
          </Space>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {previewValues.map((value) => (
            <Tag key={value} style={{ margin: 0 }}>
              {value}
            </Tag>
          ))}
          {restCount > 0 ? <Tag style={{ margin: 0 }}>等 {group.values.length} 项</Tag> : null}
          {!group.values.length ? (
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>(空组合，请编辑补充成员)</span>
          ) : null}
        </div>
      </div>
    );
  };

  const renderEditor = () => {
    if (!editor) return null;
    return (
      <div style={{ display: 'grid', gap: 12, paddingTop: 4 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>组合名称</span>
          <Input
            value={editor.name}
            onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            placeholder={`如：${activeType === 'color' ? '夏季女装配色' : '女装标准码'}`}
            maxLength={MAX_NAME_LENGTH}
          />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>
            {ITEM_LABEL[activeType]}成员（{editor.values.length} 个，按添加顺序应用）
          </span>
          <Space.Compact>
            <DictAutoComplete
              dictType={activeType}
              autoCollect={false}
              value={itemDraft}
              onChange={(value) => setItemDraft(String(value || ''))}
              onSelect={(value) => setItemDraft(String(value || ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addItem();
                }
              }}
              style={{ flex: 1, minWidth: 200 }}
              placeholder={`输入或选择${ITEM_LABEL[activeType]}后回车`}
            />
            <Button onClick={addItem}>添加</Button>
          </Space.Compact>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {editor.values.map((value) => (
              <Tag key={value} closable onClose={(e) => { e.preventDefault(); removeItem(value); }} style={{ margin: 0 }}>
                {value}
              </Tag>
            ))}
            {!editor.values.length ? (
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>尚未添加成员</span>
            ) : null}
          </div>
        </div>
        <Space>
          <Button onClick={() => setEditor(null)}>取消</Button>
          <Button type="primary" loading={editor.saving} onClick={handleSave}>
            保存
          </Button>
        </Space>
      </div>
    );
  };

  const currentGroups = groups[activeType];

  return (
    <Modal
      title="基础属性库"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={680}
      destroyOnHidden
    >
      <div style={{ marginBottom: 12, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        维护常用的成套{ITEM_LABEL.color}/{ITEM_LABEL.size}组合，点击「使用」一键填入，「追加」在现有基础上叠加。
      </div>
      <Tabs
        activeKey={activeType}
        onChange={(key) => {
          setActiveType(key as GroupType);
          setEditor(null);
          setItemDraft('');
        }}
        items={[
          { key: 'color', label: GROUP_TAB_LABEL.color },
          { key: 'size', label: GROUP_TAB_LABEL.size },
        ]}
      />
      {loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <Spin />
        </div>
      ) : editor ? (
        renderEditor()
      ) : (
        <div style={{ display: 'grid', gap: 10, maxHeight: 420, overflowY: 'auto', padding: '4px 2px' }}>
          {currentGroups.length ? (
            <>
              <Button type="dashed" block onClick={() => openEditor()}>
                + 新增{GROUP_TAB_LABEL[activeType]}
              </Button>
              {currentGroups.map(renderGroupCard)}
            </>
          ) : (
            <Empty description={`暂无${GROUP_TAB_LABEL[activeType]}`}>
              <Button type="primary" onClick={() => openEditor()}>
                新增{GROUP_TAB_LABEL[activeType]}
              </Button>
            </Empty>
          )}
        </div>
      )}
    </Modal>
  );
};

export default AttributeGroupLibraryModal;
