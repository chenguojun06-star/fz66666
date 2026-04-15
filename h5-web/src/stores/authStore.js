import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create()(
  persist(
    (set, get) => ({
      token: '',
      user: null,
      tenantId: '',
      tenantName: '',
      setAuth: (token, user, tenant = null) => {
        const state = {
          token,
          user,
          tenantId: tenant?.tenantId || tenant?.id || user?.tenantId || '',
          tenantName: tenant?.tenantName || tenant?.name || user?.tenantName || '',
        };
        set(state);
        if (token) localStorage.setItem('fashion_token', String(token));
        if (user) localStorage.setItem('fashion_user_info', JSON.stringify(user));
        const t = state.tenantId;
        const tn = state.tenantName;
        if (t) localStorage.setItem('fashion_tenant_info', JSON.stringify({ tenantId: t, tenantName: tn }));
      },
      setTenant: (tenant) => {
        const state = {
          tenantId: tenant?.tenantId || tenant?.id || '',
          tenantName: tenant?.tenantName || tenant?.name || '',
        };
        set(state);
        localStorage.setItem('fashion_tenant_info', JSON.stringify(state));
      },
      clearAuth: () => {
        set({ token: '', user: null, tenantId: '', tenantName: '' });
        localStorage.removeItem('fashion_token');
        localStorage.removeItem('fashion_user_info');
        localStorage.removeItem('fashion_tenant_info');
      },
    }),
    {
      name: 'fashion-h5-auth',
    }
  )
);
