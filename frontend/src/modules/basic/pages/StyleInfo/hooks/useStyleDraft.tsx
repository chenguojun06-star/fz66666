import { useState, useEffect } from 'react';
import { App } from 'antd';
import type { FormInstance } from 'antd';
import { useFormDraft } from '@/hooks/useFormDraft';

interface UseStyleDraftOptions {
  isNewPage: boolean;
  form: FormInstance;
  setCurrentStyle: React.Dispatch<React.SetStateAction<any>>;
  sizeColorConfig: Record<string, unknown> | undefined | { sizes?: string[]; colors?: string[]; quantities?: number[]; commonSizes?: string[]; commonColors?: string[]; matrixRows?: any[] };
}

export function useStyleDraft({ isNewPage, form, setCurrentStyle, sizeColorConfig }: UseStyleDraftOptions) {
  const { modal } = App.useApp();
  const styleDraft = useFormDraft('style-create', { debounceMs: 300 });
  const [draftChecked, setDraftChecked] = useState(false);

  useEffect(() => {
    if (!isNewPage || draftChecked) return;

    const draftInfo = styleDraft.getDraftInfo();
    if (draftInfo.hasDraft) {
      modal.confirm({
        title: '发现未保存的草稿',
        content: (
          <div>
            <p>检测到您有未保存的款号草稿（{draftInfo.timeDescription}），是否恢复？</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 8 }}>
              选择"恢复草稿"将恢复之前未保存的款号内容，选择"新建款号"将清空草稿并重新开始。
            </p>
          </div>
        ),
        okText: '恢复草稿',
        cancelText: '新建款号',
        onOk: () => {
          const draftData = styleDraft.loadDraft() as {
            formValues?: Record<string, unknown>;
            sizeColorConfig?: Record<string, unknown>;
          } | null;
          if (draftData) {
            if (draftData.formValues) {
              form.setFieldsValue(draftData.formValues);
            }
            if (draftData.sizeColorConfig) {
              setCurrentStyle((prev: any) => prev ? {
                ...prev,
                sizeColorConfig: JSON.stringify(draftData.sizeColorConfig),
              } as any : null);
            }
          }
          setDraftChecked(true);
        },
        onCancel: () => {
          styleDraft.clearDraft();
          setDraftChecked(true);
        },
      });
    } else {
      setDraftChecked(true);
    }
  }, [isNewPage, draftChecked, styleDraft, form, modal, setCurrentStyle]);

  useEffect(() => {
    if (!isNewPage || !draftChecked) return;
    const allValues = form.getFieldsValue(true);
    styleDraft.saveDraftDebounced({
      formValues: allValues,
      sizeColorConfig,
    });
  }, [form, sizeColorConfig, isNewPage, draftChecked, styleDraft]);

  const clearDraft = () => {
    if (isNewPage) {
      styleDraft.clearDraft();
    }
  };

  return {
    draftChecked,
    clearDraft,
  };
}
