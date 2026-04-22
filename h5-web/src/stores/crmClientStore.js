import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useCrmClientStore = create(
  persist(
    (set, get) => ({
      token: null,
      customerId: null,
      tenantId: null,
      customer: null,
      user: null,
      isAuthenticated: false,
      currentPage: 'dashboard',

      setAuth: (data) => {
        if (data.token) {
          localStorage.setItem('fashion_token', data.token);
        }
        set({
          token: data.token,
          customerId: data.customerId,
          tenantId: data.tenantId,
          customer: data.customer,
          user: data.user,
          isAuthenticated: true,
        });
      },

      setCustomerId: (id) => set({ customerId: id }),
      setCustomer: (customer) => set({ customer }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
      setCurrentPage: (page) => set({ currentPage: page }),
      logout: () => {
        localStorage.removeItem('fashion_token');
        localStorage.removeItem('fashion_user_info');
        localStorage.removeItem('fashion_tenant_info');
        set({
          token: null,
          customerId: null,
          tenantId: null,
          customer: null,
          user: null,
          isAuthenticated: false,
          currentPage: 'dashboard',
        });
      },
    }),
    {
      name: 'crm-client-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default useCrmClientStore;
