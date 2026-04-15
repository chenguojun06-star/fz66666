import { create } from 'zustand';
import { eventBus } from '@/utils/eventBus';

const useGlobalStore = create((set, get) => ({
  qualityData: null,
  rescanData: null,
  scanResultData: null,
  patternScanData: null,
  factoryId: '',
  role: '',
  isTenantOwner: false,
  privacyResolve: null,

  setQualityData: (data) => set({ qualityData: data }),
  setRescanData: (data) => set({ rescanData: data }),
  setScanResultData: (data) => set({ scanResultData: data }),
  setPatternScanData: (data) => set({ patternScanData: data }),
  setFactoryId: (id) => set({ factoryId: id }),
  setRole: (role) => set({ role }),
  setIsTenantOwner: (v) => set({ isTenantOwner: v }),

  emitRefresh: () => eventBus.emit('DATA_REFRESH'),
}));

export { useGlobalStore };
