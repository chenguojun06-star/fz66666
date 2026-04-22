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

      setAuth: (data) => set({
        token: data.token,
        customerId: data.customerId,
        tenantId: data.tenantId,
        customer: data.customer,
        user: data.user,
        isAuthenticated: true,
      }),

      setCustomerId: (id) => set({ customerId: id }),
      setCustomer: (customer) => set({ customer }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
      setCurrentPage: (page) => set({ currentPage: page }),
      logout: () => set({ 
        token: null, 
        customerId: null, 
        tenantId: null,
        customer: null, 
        user: null,
        isAuthenticated: false, 
        currentPage: 'dashboard' 
      }),
    }),
    {
      name: 'crm-client-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default useCrmClientStore;
