import { useState, useCallback } from 'react';
import { intelligenceApi as execApi } from '@/services/intelligenceApi';

export function useRepairAction(reload: () => void) {
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<{ autoFixed: number; needManual: number } | null>(null);

  const handleRepair = useCallback(async () => {
    setRepairing(true);
    setRepairResult(null);
    try {
      const res = await execApi.runSelfHealingRepair() as any;
      const d = res?.data ?? res;
      setRepairResult({ autoFixed: Number(d?.autoFixed ?? 0), needManual: Number(d?.needManual ?? 0) });
      reload();
    } catch { setRepairResult({ autoFixed: 0, needManual: -1 }); }
    finally { setRepairing(false); }
  }, [reload]);

  return { repairing, repairResult, handleRepair };
}
