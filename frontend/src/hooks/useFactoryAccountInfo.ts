import { useMemo } from 'react';
import { useAuth } from '@/utils/AuthContext';

export function isSupervisorOrAboveUser(user: any): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  return (
    role.includes('admin') ||
    role.includes('manager') ||
    role.includes('supervisor') ||
    role.includes('主管') ||
    role.includes('管理员')
  );
}

export function useFactoryAccountInfo() {
  const { user } = useAuth();
  const isFactoryAccount = !!(user as any)?.factoryId;
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const canManageOrderLifecycle = !isFactoryAccount && isSupervisorOrAbove;
  return { isFactoryAccount, isSupervisorOrAbove, canManageOrderLifecycle };
}
