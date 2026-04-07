import type { ProgressNode } from '../types';
import type { ProductionOrder } from '@/types/production';
import type { TemplateLibrary } from '@/types/style';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { parseProgressNodes } from '../utils';

interface UseTemplateNodesParams {
  setNodes: React.Dispatch<React.SetStateAction<ProgressNode[]>>;
  setProgressNodesByStyleNo: React.Dispatch<React.SetStateAction<Record<string, ProgressNode[]>>>;
}

export function useTemplateNodes({ setNodes, setProgressNodesByStyleNo }: UseTemplateNodesParams) {
  const fetchTemplateNodes = async (templateId: string): Promise<ProgressNode[]> => {
    const tid = String(templateId || '').trim();
    if (!tid) return [];
    const res = await templateLibraryApi.getById(tid);
    const result = res as Record<string, unknown>;
    if (result.code !== 200) return [];
    const tpl = result.data as TemplateLibrary;
    return parseProgressNodes(String(tpl?.templateContent ?? ''));
  };

  const ensureNodesFromTemplateIfNeeded = async (order: ProductionOrder) => {
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
      // Silently ignore template loading errors
    }
  };

  return { fetchTemplateNodes, ensureNodesFromTemplateIfNeeded };
}
