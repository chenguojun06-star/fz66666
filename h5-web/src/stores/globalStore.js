import { create } from 'zustand';
import { eventBus } from '@/utils/eventBus';

const SCAN_DATA_KEY = 'h5_scan_data';

function loadPersistedScanData() {
  try {
    const raw = sessionStorage.getItem(SCAN_DATA_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function persistScanData(data) {
  try {
    sessionStorage.setItem(SCAN_DATA_KEY, JSON.stringify({
      qualityData: data.qualityData,
      rescanData: data.rescanData,
      scanResultData: data.scanResultData,
      patternScanData: data.patternScanData,
    }));
  } catch (e) { console.warn('persistScanData:', e.message); }
}

const persisted = loadPersistedScanData();

const useGlobalStore = create((set, get) => ({
  qualityData: persisted.qualityData || null,
  rescanData: persisted.rescanData || null,
  scanResultData: persisted.scanResultData || null,
  patternScanData: persisted.patternScanData || null,
  factoryId: '',
  role: '',
  isTenantOwner: false,
  privacyResolve: null,

  setQualityData: (data) => { set({ qualityData: data }); persistScanData(get()); },
  setRescanData: (data) => { set({ rescanData: data }); persistScanData(get()); },
  setScanResultData: (data) => { set({ scanResultData: data }); persistScanData(get()); },
  setPatternScanData: (data) => { set({ patternScanData: data }); persistScanData(get()); },
  setFactoryId: (id) => set({ factoryId: id }),
  setRole: (role) => set({ role }),
  setIsTenantOwner: (v) => set({ isTenantOwner: v }),

  clearScanResultData: () => { set({ scanResultData: null }); persistScanData(get()); },
  clearQualityData: () => { set({ qualityData: null }); persistScanData(get()); },
  clearRescanData: () => { set({ rescanData: null }); persistScanData(get()); },
  clearPatternScanData: () => { set({ patternScanData: null }); persistScanData(get()); },
  clearAllScanData: () => {
    set({ scanResultData: null, qualityData: null, rescanData: null, patternScanData: null });
    sessionStorage.removeItem(SCAN_DATA_KEY);
  },

  emitRefresh: () => eventBus.emit('DATA_REFRESH'),
}));

export { useGlobalStore };
