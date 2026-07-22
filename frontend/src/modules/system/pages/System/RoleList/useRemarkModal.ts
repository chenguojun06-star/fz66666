import { useState } from 'react';
import { message } from 'antd';
import type { ButtonProps } from 'antd';
import type { RemarkModalState } from './helpers';

export function useRemarkModal() {
  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);

  const openRemarkModal = (title: string, okText: string, okButtonProps: ButtonProps | undefined, onConfirm: (remark: string) => Promise<void>) => {
    setRemarkModalState({ open: true, title, okText, okDanger: okButtonProps?.danger === true, onConfirm });
  };

  const handleRemarkConfirm = async (remark: string) => {
    if (!remarkModalState) return;
    setRemarkLoading(true);
    try { await remarkModalState.onConfirm(remark); setRemarkModalState(null); } catch (e) { console.error('[RoleList] 备注确认失败:', e); message.error('操作失败'); } finally { setRemarkLoading(false); }
  };

  return {
    remarkModalState,
    setRemarkModalState,
    remarkLoading,
    openRemarkModal,
    handleRemarkConfirm,
  };
}
