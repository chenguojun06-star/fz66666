import { useState, useCallback } from 'react';
import type { CuttingCreateTaskState } from '../hooks';

export interface TemplateImportApi {
  templateStyleNo: string;
  setTemplateStyleNo: (v: string) => void;
  templateLoading: boolean;
  handleImportTemplate: () => Promise<void>;
}

export function useTemplateImport(createTask: CuttingCreateTaskState): TemplateImportApi {
  const [templateStyleNo, setTemplateStyleNo] = useState<string>('');
  const [templateLoading, setTemplateLoading] = useState(false);

  const handleImportTemplate = useCallback(async () => {
    const sn = templateStyleNo.trim();
    if (!sn) return;
    setTemplateLoading(true);
    try {
      await createTask.importFromTemplate(sn);
    } finally {
      setTemplateLoading(false);
    }
  }, [templateStyleNo, createTask]);

  return {
    templateStyleNo,
    setTemplateStyleNo,
    templateLoading,
    handleImportTemplate,
  };
}
