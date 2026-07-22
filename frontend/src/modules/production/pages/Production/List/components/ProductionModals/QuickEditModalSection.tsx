import React, { useMemo, useRef } from 'react';
import QuickEditModal from '@/components/common/QuickEditModal';
import ExtFieldsSection, { flattenExtJson } from '@/components/common/SchemaForm/ExtFieldsSection';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import type { FormInstance } from 'antd/es/form';
import { ProductionOrder } from '@/types/production';

interface QuickEditModalSectionProps {
  quickEditModal: {
    visible: boolean;
    data: ProductionOrder | null;
    close: () => void;
    open: (record: ProductionOrder) => void;
  };
  quickEditSaving: boolean;
  onQuickEditSave: (values: Record<string, unknown>, form: FormInstance, record: ProductionOrder | null, close: () => void) => Promise<void>;
  customFields: FieldConfigItem[];
}

const QuickEditModalSection: React.FC<QuickEditModalSectionProps> = ({
  quickEditModal,
  quickEditSaving,
  onQuickEditSave,
  customFields,
}) => {
  const quickEditFormRef = useRef<FormInstance>();

  const quickEditInitialValues = useMemo(() => {
    const data = quickEditModal.data;
    return {
      remarks: (data as any)?.remarks,
      expectedShipDate: (data as any)?.expectedShipDate,
      urgencyLevel: (data as any)?.urgencyLevel || 'normal',
      ...flattenExtJson((data as any)?.extJson),
    };
  }, [quickEditModal.data]);

  return (
    <QuickEditModal
      visible={quickEditModal.visible}
      loading={quickEditSaving}
      initialValues={quickEditInitialValues}
      formRef={quickEditFormRef}
      onSave={(values, form) => onQuickEditSave(values, form, quickEditModal.data, quickEditModal.close)}
      onCancel={() => { quickEditModal.close(); }}
    >
      {customFields.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14, color: '#1f1f1f' }}>扩展字段</div>
          <ExtFieldsSection
            fields={customFields}
            colSpan={24}
          />
        </div>
      )}
    </QuickEditModal>
  );
};

export default QuickEditModalSection;
