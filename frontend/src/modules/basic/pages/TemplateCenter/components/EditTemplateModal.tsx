import React, { useCallback, useState } from 'react';
import { App } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { TemplateLibrary } from '@/types/style';
import TemplateInlineEditor from './inlineEditor/TemplateInlineEditor';
import api from '@/utils/api';

interface EditTemplateModalProps {
  styleNoOptions: Array<{ value: string; label: string }>;
  styleNoLoading: boolean;
  modalWidth: string | number;
  onFetchList: (opts?: { page?: number }) => void;
  onStyleNoSearch: (keyword: string) => void;
  onStyleNoDropdownOpen: (open: boolean) => void;
}

export interface EditTemplateModalRef {
  openEdit: (row: TemplateLibrary) => Promise<void>;
}

const EditTemplateModal = React.forwardRef<EditTemplateModalRef, EditTemplateModalProps>(
  (
    {
      styleNoOptions,
      styleNoLoading,
      modalWidth,
      onFetchList,
      onStyleNoSearch,
      onStyleNoDropdownOpen,
    },
    ref
  ) => {
    const { message } = App.useApp();
    const [editOpen, setEditOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<TemplateLibrary | null>(null);

    const isLocked = (row?: TemplateLibrary | null) => {
      const locked = Number(row?.locked);
      return Number.isFinite(locked) && locked === 1;
    };

    const openEdit = useCallback(async (row: TemplateLibrary) => {
      let latestRow = row;
      if (row?.id) {
        try {
          const response = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
          if (response.code === 200 && response.data) {
            latestRow = response.data;
          }
        } catch {
          // ignore refresh failure and continue with current row data
        }
      }

      if (isLocked(latestRow)) {
        message.error('模板已锁定，如需修改请先退回');
        return;
      }

      setEditingRow(latestRow);
      setEditOpen(true);
    }, [message]);

    React.useImperativeHandle(ref, () => ({ openEdit }), [openEdit]);

    return (
      <ResizableModal
        title={editingRow?.templateName || '编辑模板'}
        open={editOpen}
        centered
        width={modalWidth}
        footer={null}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        onCancel={() => {
          setEditOpen(false);
          setEditingRow(null);
        }}
      >
        {editingRow ? (
          <TemplateInlineEditor
            row={editingRow}
            allowSourceStyleSelection
            styleNoOptions={styleNoOptions}
            styleNoLoading={styleNoLoading}
            onStyleNoSearch={onStyleNoSearch}
            onStyleNoDropdownOpen={onStyleNoDropdownOpen}
            onSaved={async () => {
              setEditOpen(false);
              setEditingRow(null);
              onFetchList({ page: 1 });
            }}
          />
        ) : null}
      </ResizableModal>
    );
  }
);

EditTemplateModal.displayName = 'EditTemplateModal';

export default EditTemplateModal;
