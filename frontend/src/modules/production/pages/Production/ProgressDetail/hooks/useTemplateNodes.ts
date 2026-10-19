import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ProgressNode } from '../types';
import type { ProductionOrder } from '@/types/production';
import type { TemplateLibrary } from '@/types/style';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { parseProgressNodes } from '../utils';

interface UseTemplateNodesParams {
  setNodes: Dispatch<SetStateAction<ProgressNode[]>>;
  setProgressNodesByStyleNo: Dispatch<SetStateAction<Record<string, ProgressNode[]>>>;
}

export function useTemplateNodes({ setNodes, setProgressNodesByStyleNo }: UseTemplateNodesParams) {
  const fetchTemplateNodes = useCallback(async (templateId: string): Promise<ProgressNode[]> => {
    const tid = String(templateId || '').trim();
    if (!tid) return [];
    try {
      const tpl = await templateLibraryApi.getById(tid) as TemplateLibrary;
      return parseProgressNodes(String(tpl?.templateContent ?? ''));
    } catch {
      // 模板可能不存在或接口失败 —— 进度页允许无模板展示，回退空节点
      return [];
    }
  }, []);

  const ensureNodesFromTemplateIfNeeded = useCallback(async (order: ProductionOrder) => {
    if (!order) return;
    const templateId = String((order as any)?.progressTemplateId || '').trim();
    if (!templateId) return;

    try {
      const templateNodes = await fetchTemplateNodes(templateId);
      if (templateNodes && templateNodes.length > 0) {
        setNodes(templateNodes);
        if (order.styleNo) {
          setProgressNodesByStyleNo(prev => ({
            ...prev,
            [order.styleNo]: templateNodes
          }));
        }
      }
    } catch {
    }
  }, [fetchTemplateNodes, setNodes, setProgressNodesByStyleNo]);

  return useMemo(() => ({ fetchTemplateNodes, ensureNodesFromTemplateIfNeeded }), [fetchTemplateNodes, ensureNodesFromTemplateIfNeeded]);
}
