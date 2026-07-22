import { useEffect, useState } from 'react';
import api from '@/utils/api';

export function useStyleProcessDescriptions(styleId: string) {
  const [styleProcessDescriptionMap, setStyleProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  const [secondaryProcessDescriptionMap, setSecondaryProcessDescriptionMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const trimmedStyleId = String(styleId || '').trim();
    if (!trimmedStyleId) {
      setStyleProcessDescriptionMap(new Map());
      setSecondaryProcessDescriptionMap(new Map());
      return;
    }
    (async () => {
      try {
        const [processRes, secondaryRes] = await Promise.all([
          api.get(`/style/process/list?styleId=${trimmedStyleId}`),
          api.get(`/style/secondary-process/list?styleId=${trimmedStyleId}`),
        ]);
        const processRows = Array.isArray((processRes as any)?.data) ? (processRes as any).data : [];
        const secondaryRows = Array.isArray((secondaryRes as any)?.data) ? (secondaryRes as any).data : [];
        const nextProcessMap = new Map<string, string>();
        const nextSecondaryMap = new Map<string, string>();
        processRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextProcessMap.set(name, description);
        });
        secondaryRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextSecondaryMap.set(name, description);
        });
        setStyleProcessDescriptionMap(nextProcessMap);
        setSecondaryProcessDescriptionMap(nextSecondaryMap);
      } catch {
        setStyleProcessDescriptionMap(new Map());
        setSecondaryProcessDescriptionMap(new Map());
      }
    })();
  }, [styleId]);

  return {
    styleProcessDescriptionMap,
    secondaryProcessDescriptionMap,
  };
}
