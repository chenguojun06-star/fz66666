import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create()(
  persist(
    (set) => ({
      token: '',
      user: null,
      tenantId: '',
      tenantName: '',
      setAuth: (token, user, tenant = null) =>
        set({
          token,
          user,
          tenantId: tenant?.tenantId || tenant?.id || user?.tenantId || '',
          tenantName: tenant?.tenantName || tenant?.name || user?.tenantName || '',
        }),
      setTenant: (tenant) =>
        set({
          tenantId: tenant?.tenantId || tenant?.id || '',
          tenantName: tenant?.tenantName || tenant?.name || '',
        }),
      clearAuth: () => set({ token: '', user: null, tenantId: '', tenantName: '' }),
    }),
    {
      name: 'fashion-h5-auth',
    }
  )
);
