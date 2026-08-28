import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Input, Modal, Space, Spin, Tabs, Tag, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import CircleIconButton, { TagMinusCloseIcon } from '@/components/common/CircleIconButton';
import api from '@/utils/api';
import { clearApiCache } from '@/utils/api/core';

export type GroupApplyMode = 'replace' | 'append';

/** 单个属性组定义：一组"成套属性组合"（如颜色组合/码数组合） */
export interface AttributeGroupDef {
  /** 组标识（回调时透传给调用方），如 'color' | 'size' */
  key: string;
  /** 成员录入时的字典联想类型（t_dict.dictType），如 'color' */
  itemDictType: string;
  /** 组合存储的字典类型，默认 `${itemDictType}_group`，如 'color_group' */
  groupDictType?: string;
  /** Tab 标题，如 '颜色组合' */
  tabLabel: string;
  /** 成员名称，如 '颜色' */
  itemLabel: string;
}

/** 默认配置：颜色 + 码数（与样衣详情原有行为完全一致） */
export const DEFAULT_ATTRIBUTE_GROUPS: AttributeGroupDef[] = [
  { key: 'color', itemDictType: 'color', tabLabel: '颜色组合', itemLabel: '颜色' },
  { key: 'size', itemDictType: 'size', tabLabel: '码数组合', itemLabel: '码数' },
];

interface AttributeGroup {
  id: number;
  dictCode: string;
  name: string;
  values: string[];
}

interface AttributeGroupLibraryModalProps {
  open: boolean;
  onClose: () => void;
  /** 应用组合到表单：mode=replace 覆盖现有值，append 追加并去重；groupKey 对应 AttributeGroupDef.key */
  onApply: (groupKey: string, values: string[], mode: GroupApplyMode) => void;
  /** 属性组配置，默认颜色+码数两组；可自定义任意成套属性（如工序组/部位组） */
  groups?: AttributeGroupDef[];
  /** 弹窗标题，默认"基础属性库" */
  title?: string;
}

interface EditorState {
  groupKey: string;
  editingId: number | null;
  editingDictCode: string;
  name: string;
  values: string[];
  saving: boolean;
}

const resolveGroupDictType = (def: AttributeGroupDef): string =>
  def.groupDictType || `${def.itemDictType}_group`;

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

const MAX_ITEMS = 30;
const MAX_NAME_LENGTH = 50;
const MAX_VALUE_JSON_LENGTH = 1000;
/** 与后端 DictOrchestrator.isValidDictLabel 保持一致（组合名称字符集） */
const NAME_INVALID_CHARS_REGEX = /[^\u4e00-\u9fa5a-zA-Z0-9\-_/()（） #.]/;

/**
 * 基础属性库弹窗（通用组件）
 * 维护"一套属性值"的常用组合（默认颜色/码数），点击"使用"一键填入表单。
 * 数据存储复用系统字典（t_dict，dictType=xxx_group，dictValue=JSON 数组），无独立后端接口。
 * 任何包含"成套属性录入"的表单均可接入：传 groups 自定义属性组 + onApply 回调即可。
 */
const AttributeGroupLibraryModal: React.FC<AttributeGroupLibraryModalProps> = ({
  open,
  onClose,
  onApply,
  groups = DEFAULT_ATTRIBUTE_GROUPS,
  title = '基础属性库',
}) => {
  const { message, modal } = App.useApp();

  const groupMap = React.useMemo(
    () => Object.fromEntries(groups.map((g) => [g.key, g])),
    [groups]
  );
  const [activeKey, setActiveKey] = useState<string>(groups[0]?.key || 'color');
  const activeType = groupMap[activeKey] || groups[0];
  const [groupsData, setGroupsData] = useState<Record<string, AttributeGroup[]>>({});
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [itemDraft, setItemDraft] = useState('');
  // D-168：左右布局——左侧目录选中项（回退到第一项）
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    // groups 变化时校正激活 Tab（防止越界）
    if (!groupMap[activeKey] && groups.length) {
      setActiveKey(groups[0].key);
    }
  }, [groups, groupMap, activeKey]);

  const loadGroups = useCallback(
    async (showLoading = true) => {
      if (!groups.length) return;
      if (showLoading) setLoading(true);
      try {
        const tasks = groups.map(async (def) => {
          const res: any = await api.get('/system/dict/list', {
            params: { dictType: resolveGroupDictType(def), page: 1, pageSize: 200 },
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
          return [def.key, items] as const;
        });
        const entries = await Promise.all(tasks);
        setGroupsData(Object.fromEntries(entries));
      } catch (error: any) {
        message.error(error?.message || '加载属性组合失败');
      } finally {
        setLoading(false);
      }
    },
    [groups, message]
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
      groupKey: activeType.key,
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
      message.warning(`单个${activeType.itemLabel}不能超过 ${MAX_NAME_LENGTH} 个字符`);
      return;
    }
    if (editor.values.includes(value)) {
      setItemDraft('');
      return;
    }
    if (editor.values.length >= MAX_ITEMS) {
      message.warning(`单个组合最多 ${MAX_ITEMS} 个${activeType.itemLabel}`);
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
      message.warning(`请至少添加一个${activeType.itemLabel}`);
      return;
    }
    if (JSON.stringify(editor.values).length > MAX_VALUE_JSON_LENGTH) {
      message.warning('组合内容过长，请删减部分成员');
      return;
    }

    setEditor({ ...editor, saving: true });
    try {
      const dictType = resolveGroupDictType(activeType);
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
          dictCode: `${activeType.itemDictType.toUpperCase()}_GROUP_${Date.now()}`,
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
      content: `确定删除${activeType.tabLabel}"${group.name}"吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/system/dict/${group.id}`);
          clearApiCache('/system/dict/list');
          message.success('删除成功');
          setSelectedId(null);
          loadGroups(false);
        } catch (error: any) {
          message.error(error?.message || '删除失败');
        }
      },
    });
  };

  const handleApply = (group: AttributeGroup, mode: GroupApplyMode) => {
    if (!group.values.length) {
      message.warning('该组合没有可用成员，请先编辑补充');
      return;
    }
    onApply(activeType.key, group.values, mode);
    if (mode === 'replace') {
      message.success(`已应用${activeType.tabLabel}"${group.name}"`);
      handleClose();
    } else {
      message.success(`已追加${activeType.itemLabel}"${group.name}"`);
    }
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
            placeholder={`如：${activeType.key === 'color' ? '夏季女装配色' : `${activeType.itemLabel}标准组`}`}
            maxLength={MAX_NAME_LENGTH}
          />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>
            {activeType.itemLabel}成员（{editor.values.length} 个，按添加顺序应用）
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <DictAutoComplete
              dictType={activeType.itemDictType}
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
              placeholder={`输入或选择${activeType.itemLabel}后回车`}
            />
            <CircleIconButton type="add" size={24} title={`添加${activeType.itemLabel}`} onClick={addItem} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {editor.values.map((value) => (
              <Tag key={value} closable closeIcon={<TagMinusCloseIcon />} onClose={(e) => { e.preventDefault(); removeItem(value); }} style={{ margin: 0 }}>
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

  const currentGroups = groupsData[activeType.key] || [];
  // D-168：左右布局——左侧组合目录，右侧选中组合的完整内容/编辑器（与人员管理等页面目录风格一致）
  const selectedGroup = currentGroups.find((g) => g.id === selectedId) || currentGroups[0] || null;

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={860}
      destroyOnHidden
    >
      <div style={{ marginBottom: 12, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        维护常用的成套{groups.map((g) => g.itemLabel).join('/')}组合，点击「使用」一键填入，「追加」在现有基础上叠加。
      </div>
      {groups.length > 1 ? (
        <Tabs
          activeKey={activeKey}
          onChange={(key) => {
            setActiveKey(key);
            setEditor(null);
            setItemDraft('');
            setSelectedId(null);
          }}
          items={groups.map((g) => ({ key: g.key, label: g.tabLabel }))}
        />
      ) : null}
      {loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <Spin />
        </div>
      ) : (
        <div style={{ display: 'flex', minHeight: 420, border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {/* 左：组合目录 */}
          <div
            style={{
              width: 220,
              flexShrink: 0,
              borderRight: '1px solid var(--color-border)',
              background: 'var(--color-bg-layout, var(--color-bg-page))',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: 8 }}>
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => openEditor()}>
                新增{activeType.tabLabel}
              </Button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {currentGroups.map((g) => {
                const active = !!selectedGroup && g.id === selectedGroup.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => setSelectedId(g.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: active ? 'var(--color-primary-bg, #e8f2ff)' : 'var(--color-bg-base)',
                      border: active ? '1px solid var(--color-primary)' : '1px solid transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: active ? 'var(--color-primary)' : 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {g.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{g.values.length} 项</span>
                  </div>
                );
              })}
              {!currentGroups.length ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无组合" style={{ padding: '20px 0' }} />
              ) : null}
            </div>
          </div>
          {/* 右：选中组合内容 / 编辑器 */}
          <div style={{ flex: 1, minWidth: 0, padding: 16, overflowY: 'auto', maxHeight: 480 }}>
            {editor ? (
              renderEditor()
            ) : selectedGroup ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{selectedGroup.name}</span>
                  <Space size={6} wrap>
                    <Button type="primary" size="small" onClick={() => handleApply(selectedGroup, 'replace')}>
                      使用
                    </Button>
                    <Button size="small" onClick={() => handleApply(selectedGroup, 'append')}>
                      追加
                    </Button>
                    <Tooltip title="编辑组合">
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(selectedGroup)} />
                    </Tooltip>
                    <Tooltip title="删除组合">
                      <CircleIconButton type="remove" size={22} onClick={() => handleDelete(selectedGroup)} />
                    </Tooltip>
                  </Space>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  共 {selectedGroup.values.length} 项{activeType.itemLabel}（按添加顺序应用）
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedGroup.values.map((value) => (
                    <Tag key={value} style={{ margin: 0, padding: '2px 10px' }}>
                      {value}
                    </Tag>
                  ))}
                  {!selectedGroup.values.length ? (
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>(空组合，请编辑补充成员)</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <Empty description={`暂无${activeType.tabLabel}`} style={{ padding: '60px 0' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
                  新增{activeType.tabLabel}
                </Button>
              </Empty>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AttributeGroupLibraryModal;
