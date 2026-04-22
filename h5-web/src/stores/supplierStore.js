import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useSupplierStore = create(
  persist(
    (set) => ({
      token: null,
      supplierId: null,
      tenantId: null,
      supplier: null,
      user: null,
      isAuthenticated: false,

      setAuth: (data) => {
        if (data.token) {
          localStorage.setItem('fashion_token', data.token);
        }
        set({
          token: data.token,
          supplierId: data.supplierId,
          tenantId: data.tenantId,
          supplier: data.supplier,
          user: data.user,
          isAuthenticated: true,
        });
      },

      logout: () => {
        localStorage.removeItem('fashion_token');
        localStorage.removeItem('fashion_user_info');
        localStorage.removeItem('fashion_tenant_info');
        set({
          token: null, supplierId: null, tenantId: null,
          supplier: null, user: null, isAuthenticated: false,
        });
      },
    }),
    { name: 'supplier-portal-storage', storage: createJSONStorage(() => localStorage) }
  )
);

export default useSupplierStore;
