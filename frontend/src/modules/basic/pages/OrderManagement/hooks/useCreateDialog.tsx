import React from 'react';
import type { FormInstance } from 'antd';
import type { HookAPI as ModalHookAPI } from 'antd/es/modal/useModal';
import type { StyleInfo } from '@/types/style';
import type { OrderLine } from '../types';
import type { useFormDraft } from '@/hooks/useFormDraft';

interface UseCreateDialogParams {
  form: FormInstance;
  modal: ModalHookAPI;
  orderDraft: ReturnType<typeof useFormDraft>;
  openCreateInternal: (style: StyleInfo) => void;
  closeDialogInternal: () => void;
  setOrderLines: (lines: OrderLine[]) => void;
  setFactoryMode: (mode: 'INTERNAL' | 'EXTERNAL') => void;
}

/**
 * 创建订单弹窗 + 草稿恢复 Hook
 * 从 index.tsx 抽离：openCreate（含草稿恢复确认）+ closeDialog（含草稿落盘）
 * 仅做结构拆分，不修改业务逻辑
 */
export function useCreateDialog({
  form,
  modal,
  orderDraft,
  openCreateInternal,
  closeDialogInternal,
  setOrderLines,
  setFactoryMode,
}: UseCreateDialogParams) {
  const openCreate = (style: StyleInfo) => {
    const draftInfo = orderDraft.getDraftInfo();
    if (draftInfo.hasDraft) {
      modal.confirm({
        title: '发现未保存的草稿',
        content: (
          <div>
            <p>检测到您有未保存的订单草稿（{draftInfo.timeDescription}），是否恢复？</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 8 }}>
              选择"恢复草稿"将恢复之前未提交的订单内容，选择"新建订单"将清空草稿并重新开始。
            </p>
          </div>
        ),
        okText: '恢复草稿',
        cancelText: '新建订单',
        onOk: () => {
          openCreateInternal(style);
          setTimeout(() => {
            const draftData = orderDraft.loadDraft() as { formValues?: Record<string, unknown>; orderLines?: OrderLine[]; factoryMode?: 'INTERNAL' | 'EXTERNAL' } | null;
            if (draftData) {
              if (draftData.formValues) {
                form.setFieldsValue(draftData.formValues);
              }
              if (draftData.orderLines) {
                setOrderLines(draftData.orderLines);
              }
              if (draftData.factoryMode) {
                setFactoryMode(draftData.factoryMode);
              }
            }
          }, 0);
        },
        onCancel: () => {
          orderDraft.clearDraft();
          openCreateInternal(style);
        },
      });
    } else {
      openCreateInternal(style);
    }
  };

  const closeDialog = () => {
    orderDraft.flushSaveDraft();
    closeDialogInternal();
  };

  return { openCreate, closeDialog };
}
