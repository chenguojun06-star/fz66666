import { useEffect, useMemo, useState } from 'react';
import { Form } from 'antd';
import { Role, User as UserType } from '@/types/system';
import { requestWithPathFallback } from '@/utils/api';
import tenantService from '@/services/tenantService';
import { buildFormRules, buildPermissionsByModule } from '../userListUtils';
import type { useModal } from '@/hooks';

interface UseUserRoleOpsParams {
  user: any;
  isSuperAdmin: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  userModal: ReturnType<typeof useModal<UserType>>;
  message: any;
  openRemarkModal: (title: string, okText: string, okButtonProps: any, onConfirm: (remark: string) => Promise<void>) => void;
}

/**
 * 角色与权限管理子 hook
 * 负责角色选项加载、权限树加载、权限保存
 */
export function useUserRoleOps({ user, isSuperAdmin, form, userModal, message, openRemarkModal }: UseUserRoleOpsParams) {
  const [roleOptions, setRoleOptions] = useState<Role[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);
  const [permTree, setPermTree] = useState<any[]>([]);
  const [permCheckedIds, setPermCheckedIds] = useState<Set<number>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  const formRules = useMemo(() => buildFormRules(!!userModal.data), [userModal.data]);
  const selectedRoleId = Form.useWatch('roleId', form);
  const selectedRoleName = useMemo(() => {
    const rid = String(selectedRoleId || '').trim();
    if (!rid) return '';
    const hit = roleOptions.find((r) => String(r.id) === rid);
    return hit?.roleName || '';
  }, [roleOptions, selectedRoleId]);
  const permissionsByModule = useMemo(() => buildPermissionsByModule(permTree), [permTree]);

  const fetchRoleOptions = async () => {
    setRoleOptionsLoading(true);
    try {
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.listTenantRoles(tenantId);
        const result = response as any;
        if (result.code === 200) {
          setRoleOptions(Array.isArray(result.data) ? result.data : []);
        } else {
          setRoleOptions([]);
        }
      } else {
        const response = await requestWithPathFallback('get', '/system/role/list', '/auth/role/list', undefined, {
          params: { page: 1, pageSize: 1000 },
        });
        const result = response as any;
        if (result.code === 200) {
          setRoleOptions(Array.isArray(result.data?.records) ? result.data.records : []);
        } else {
          setRoleOptions([]);
        }
      }
    } catch {
      setRoleOptions([]);
    } finally {
      setRoleOptionsLoading(false);
    }
  };

  const loadPermTreeAndChecked = async (roleId: string) => {
    const rid = String(roleId || '').trim();
    if (!rid) { setPermTree([]); setPermCheckedIds(new Set()); return; }
    setPermLoading(true);
    try {
      const [treeRes, idsRes] = await Promise.all([
        requestWithPathFallback('get', '/system/permission/tree', '/auth/permission/tree'),
        requestWithPathFallback('get', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`),
      ]);
      const treeResult = treeRes as any;
      const idsResult = idsRes as any;
      if (treeResult.code === 200) { setPermTree(Array.isArray(treeResult.data) ? treeResult.data : []); } else { setPermTree([]); }
      const idList = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setPermCheckedIds(new Set(idList.map((id: any) => Number(id))));
    } catch {
      message.error('加载权限失败');
      setPermTree([]); setPermCheckedIds(new Set());
    } finally {
      setPermLoading(false);
    }
  };

  const savePerms = async () => {
    const rid = String(selectedRoleId || '').trim();
    if (!rid) { message.error('请先选择角色'); return; }
    openRemarkModal('确认保存权限', '确认保存', undefined, async (remark) => {
      setPermSaving(true);
      try {
        const ids = Array.from(permCheckedIds.values());
        const res = await requestWithPathFallback('put', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`, { permissionIds: ids, remark });
        const result = res as any;
        if (result.code === 200) { message.success('权限保存成功'); } else { message.error(result.message || '权限保存失败'); }
      } catch { message.error('权限保存失败'); } finally { setPermSaving(false); }
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRoleOptions(); }, []);

  useEffect(() => {
    if (!userModal.visible) return;
    const rid = String(selectedRoleId || '').trim();
    if (!rid) { setPermTree([]); setPermCheckedIds(new Set()); return; }
    loadPermTreeAndChecked(rid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoleId, userModal.visible]);

  return {
    roleOptions,
    roleOptionsLoading,
    permTree,
    setPermTree,
    permCheckedIds,
    setPermCheckedIds,
    permLoading,
    permSaving,
    formRules,
    selectedRoleId,
    selectedRoleName,
    permissionsByModule,
    fetchRoleOptions,
    loadPermTreeAndChecked,
    savePerms,
  };
}
