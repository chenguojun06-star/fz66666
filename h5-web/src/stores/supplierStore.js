import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAuthStore } from './authStore';

const SUPPLIER_TOKEN_KEY = 'supplier_token';

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
          localStorage.setItem(SUPPLIER_TOKEN_KEY, data.token);
          useAuthStore.getState().setAuth(data.token, { id: data.user?.id, username: data.user?.username, role: 'supplier' }, { id: data.tenantId });
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
        localStorage.removeItem(SUPPLIER_TOKEN_KEY);
        useAuthStore.getState().clearAuth();
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
