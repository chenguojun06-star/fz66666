import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { Alert, App, Button, Checkbox, Input, Space } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { requestWithPathFallback } from '@/utils/api';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';

const EXCLUDED_TOP_MODULE_CODES = new Set(['MENU_TENANT_APP_VIEW']);
const EXCLUDED_SUBGROUP_CODES = new Set(['MENU_TENANT', 'MENU_TENANT_APP']);

type PermissionNode = {
  id?: number | string;
  parentId?: number;
  permissionCode?: string;
  permissionName?: string;
  permissionType?: string;
  children?: PermissionNode[];
};

type PermissionItem = { id: number; name?: string; type?: string };

interface PermissionDialogProps {
  roleModal: ReturnType<typeof useModal<any>>;
  onSaved: () => void;
  openRemarkModal: (title: string, okText: string, okButtonProps: any, onConfirm: (remark: string) => Promise<void>) => void;
}

export interface PermissionDialogHandle {
  open: (role: any) => void;
}

const PermissionDialog = forwardRef<PermissionDialogHandle, PermissionDialogProps>(({ roleModal, onSaved, openRemarkModal }, ref) => {
  const { message } = App.useApp();
  const { isMobile, modalWidth } = useViewport();
  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const [permTree, setPermTree] = useState<PermissionNode[]>([]);
  const [checkedPermIds, setCheckedPermIds] = useState<Set<number>>(new Set());
  const [permKeyword, setPermKeyword] = useState('');
  const [permSaving, setPermSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  const collectSubtreeIds = useCallback((node: PermissionNode | undefined, into: Set<number>) => {
    if (!node) return;
    const id = Number(node.id);
    if (Number.isFinite(id)) into.add(id);
    for (const c of Array.isArray(node.children) ? node.children : []) collectSubtreeIds(c, into);
  }, []);

  const findFirstNode = useCallback((nodes: PermissionNode[], predicate: (n: PermissionNode) => boolean): PermissionNode | null => {
    const stack = Array.isArray(nodes) ? [...nodes] : [];
    while (stack.length) { const n = stack.shift(); if (!n) continue; if (predicate(n)) return n; for (const c of Array.isArray(n.children) ? n.children : []) stack.push(c); }
    return null;
  }, []);

  const getSubtreeIdSetByCodeOrName = useCallback((code: string, name: string) => {
    const hit = findFirstNode(permTree, (n) => String(n.permissionCode || '').trim() === code) || findFirstNode(permTree, (n) => String(n.permissionName || '').trim() === name);
    const set = new Set<number>(); if (hit) collectSubtreeIds(hit, set); return set;
  }, [collectSubtreeIds, findFirstNode, permTree]);

  const allPermissionIds = useMemo(() => {
    const set = new Set<number>(); for (const n of Array.isArray(permTree) ? permTree : []) collectSubtreeIds(n, set); return set;
  }, [collectSubtreeIds, permTree]);

  const templatePresets = useMemo(() => {
    const dashboard = getSubtreeIdSetByCodeOrName('MENU_DASHBOARD', '仪表盘');
    const basic = getSubtreeIdSetByCodeOrName('MENU_BASIC', '基础资料');
    const production = getSubtreeIdSetByCodeOrName('MENU_PRODUCTION', '生产管理');
    const finance = getSubtreeIdSetByCodeOrName('MENU_FINANCE', '财务管理');
    const system = getSubtreeIdSetByCodeOrName('MENU_SYSTEM', '系统设置');
    const union = (...sets: Set<number>[]) => { const next = new Set<number>(); for (const s of sets) for (const v of s) next.add(v); return next; };
    return [
      { key: 'admin', label: '系统管理员(全量)', ids: allPermissionIds },
      { key: 'production', label: '生产人员', ids: union(dashboard, basic, production) },
      { key: 'finance', label: '财务人员', ids: union(dashboard, basic, finance) },
      { key: 'user', label: '普通用户', ids: union(dashboard, basic) },
      { key: 'system', label: '系统设置', ids: union(dashboard, system) },
    ].map((t) => ({ ...t, count: t.ids.size }));
  }, [allPermissionIds, getSubtreeIdSetByCodeOrName]);

  const permissionsByModule = useMemo(() => {
    const kw = String(permKeyword || '').trim().toLowerCase();
    const allModules = (permTree || []).filter((topNode) => !EXCLUDED_TOP_MODULE_CODES.has(String(topNode.permissionCode || '').trim())).map((topNode) => {
      const groups: Array<{ groupId: number; groupName: string; buttons: PermissionItem[] }> = [];
      const directButtons: PermissionItem[] = [];
      for (const child of (topNode.children || [])) {
        const childCode = String(child.permissionCode || '').trim();
        if (EXCLUDED_SUBGROUP_CODES.has(childCode)) continue;
        const cType = String(child.permissionType || '').toLowerCase();
        const childId = Number(child.id);
        if (cType === 'menu') {
          const btns: PermissionItem[] = (child.children || []).map((btn) => ({ id: Number(btn.id), name: btn.permissionName, type: btn.permissionType }));
          groups.push({ groupId: childId, groupName: String(child.permissionName || ''), buttons: btns });
        } else { directButtons.push({ id: childId, name: child.permissionName, type: child.permissionType }); }
      }
      return { moduleId: Number(topNode.id), moduleName: String(topNode.permissionName || ''), groups, directButtons };
    });
    if (!kw) return allModules;
    return allModules.filter(m => m.moduleName.toLowerCase().includes(kw) || m.groups.some(g => g.groupName.toLowerCase().includes(kw) || g.buttons.some(b => String(b.name || '').toLowerCase().includes(kw))) || m.directButtons.some(b => String(b.name || '').toLowerCase().includes(kw)));
  }, [permKeyword, permTree]);

  const open = async (role: any) => {
    try {
      const treeRes = await requestWithPathFallback('get', '/system/permission/tree', '/auth/permission/tree');
      const idsRes = await requestWithPathFallback('get', `/system/role/${role.id}/permission-ids`, `/auth/role/${role.id}/permission-ids`);
      const treeResult = treeRes as any; const idsResult = idsRes as any;
      if (treeResult.code === 200) setPermTree(Array.isArray(treeResult.data) ? treeResult.data : []); else setPermTree([]);
      const idList = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setCheckedPermIds(new Set(idList.map((id: any) => Number(id))));
      setVisible(true);
    } catch { message.error('加载权限失败'); }
  };

  useImperativeHandle(ref, () => ({ open }));

  const close = () => { setVisible(false); setPermTree([]); setCheckedPermIds(new Set()); setPermKeyword(''); };

  const savePerms = async () => {
    if (!roleModal.data?.id) return;
    openRemarkModal('确认授权', '确认授权', undefined, async (remark) => {
      setPermSaving(true);
      try {
        const ids = Array.from(checkedPermIds.values());
        const res = await requestWithPathFallback('put', `/system/role/${roleModal.data.id}/permission-ids`, `/auth/role/${roleModal.data.id}/permission-ids`, { permissionIds: ids, remark });
        const result = res as { code?: number; message?: unknown };
        if (result.code === 200) { message.success('授权成功'); close(); onSaved(); } else { message.error(String(result.message || '授权失败')); }
      } catch { message.error('授权失败'); } finally { setPermSaving(false); }
    });
  };

  const applyTemplate = (ids: Set<number>) => { setPermKeyword(''); setCheckedPermIds(new Set(ids)); };

  return (
    <ResizableModal open={visible} title={roleModal.data ? `为「${roleModal.data.roleName}」授权` : '权限授权'} onCancel={close}
      footer={<div className="modal-footer-actions"><Button onClick={close} disabled={permSaving}>取消</Button><Button type="primary" onClick={savePerms} loading={permSaving}>保存</Button></div>}
      width={modalWidth} initialHeight={modalInitialHeight} minWidth={isMobile ? 320 : 520} scaleWithViewport minHeight={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Alert type="info" showIcon title="角色权限将影响所有使用该角色的人员" description="建议先确定角色边界：新增角色 → 授权 → 分配给人员。" />
        <Space wrap>
          <Input value={permKeyword} onChange={(e) => setPermKeyword(e.target.value)} placeholder="搜索权限名称" style={{ width: 260 }} allowClear />
          <Button onClick={() => setPermKeyword('')} disabled={!String(permKeyword || '').trim()}>清空搜索</Button>
          <span style={{ color: 'var(--neutral-text-secondary)' }}>已选 {checkedPermIds.size} 项</span>
        </Space>
        <Space wrap>
          <Button onClick={() => applyTemplate(allPermissionIds)} disabled={!allPermissionIds.size}>全选</Button>
          <Button onClick={() => applyTemplate(new Set())} disabled={!checkedPermIds.size}>清空</Button>
          {templatePresets.map((t) => (<Button key={t.key} onClick={() => applyTemplate(t.ids)} disabled={!t.count}>{t.label}</Button>))}
        </Space>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {permissionsByModule.map((module) => {
            const allBtnIds = [...module.groups.flatMap(g => [g.groupId, ...g.buttons.map(b => b.id)]), ...module.directButtons.map(b => b.id)];
            return (
              <div key={module.moduleId} style={{ minWidth: 130, maxWidth: 200, border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden', fontSize: 12, flexShrink: 0 }}>
                <div style={{ background: 'var(--primary-color, #1677ff)', padding: '4px 8px' }}>
                  <Checkbox checked={checkedPermIds.has(module.moduleId)} onChange={(e) => { const next = new Set(checkedPermIds); if (e.target.checked) { next.add(module.moduleId); allBtnIds.forEach(id => next.add(id)); } else { next.delete(module.moduleId); allBtnIds.forEach(id => next.delete(id)); } setCheckedPermIds(next); }} style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{module.moduleName}</Checkbox>
                </div>
                {module.groups.map(group => (
                  <div key={group.groupId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ background: checkedPermIds.has(group.groupId) ? '#dbeafe' : '#f0f4ff', padding: '2px 6px', borderBottom: '1px solid #e8eaf0' }}>
                      <Checkbox checked={checkedPermIds.has(group.groupId)} onChange={(e) => { const next = new Set(checkedPermIds); const ids = [group.groupId, ...group.buttons.map(b => b.id)]; if (e.target.checked) ids.forEach(id => next.add(id)); else ids.forEach(id => next.delete(id)); setCheckedPermIds(next); }} style={{ fontSize: 11, fontWeight: 500 }}>{group.groupName}</Checkbox>
                    </div>
                    <div style={{ padding: '2px 4px 4px 16px' }}>
                      {group.buttons.map(btn => (<div key={btn.id} style={{ background: checkedPermIds.has(btn.id) ? '#e6f4ff' : undefined, borderRadius: 2, marginBottom: 1 }}><Checkbox checked={checkedPermIds.has(btn.id)} onChange={(e) => { const next = new Set(checkedPermIds); if (e.target.checked) next.add(btn.id); else next.delete(btn.id); setCheckedPermIds(next); }} style={{ fontSize: 10, width: '100%' }}>{btn.name}</Checkbox></div>))}
                      {group.buttons.length === 0 && <span style={{ color: '#bbb', fontSize: 10 }}>仅菜单权限</span>}
                    </div>
                  </div>
                ))}
                {module.directButtons.length > 0 && (<div style={{ padding: '4px 6px' }}>{module.directButtons.map(btn => (<div key={btn.id} style={{ background: checkedPermIds.has(btn.id) ? '#e6f4ff' : undefined, borderRadius: 2, marginBottom: 1 }}><Checkbox checked={checkedPermIds.has(btn.id)} onChange={(e) => { const next = new Set(checkedPermIds); if (e.target.checked) next.add(btn.id); else next.delete(btn.id); setCheckedPermIds(next); }} style={{ fontSize: 10, width: '100%' }}>{btn.name}</Checkbox></div>))}</div>)}
                {module.groups.length === 0 && module.directButtons.length === 0 && (<div style={{ padding: '4px 8px', color: '#aaa', fontSize: 10 }}>仅页面入口</div>)}
              </div>
            );
          })}
        </div>
      </div>
    </ResizableModal>
  );
});

export default PermissionDialog;
