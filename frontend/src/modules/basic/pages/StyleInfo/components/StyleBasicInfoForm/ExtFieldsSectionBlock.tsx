import React from 'react';
import ExtFieldsSection from '@/components/common/SchemaForm/ExtFieldsSection';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { SECTION_BOX_STYLE_COMPACT } from './constants';
import SectionBox from './SectionBox';

interface ExtFieldsSectionBlockProps {
  customFields: FieldConfigItem[];
  editLocked: boolean;
}

/**
 * 区6：扩展字段（仅当存在自定义字段时渲染）
 */
const ExtFieldsSectionBlock: React.FC<ExtFieldsSectionBlockProps> = ({
  customFields,
  editLocked,
}) => {
  if (customFields.length === 0) return null;

  return (
    <SectionBox title="扩展字段" boxStyle={SECTION_BOX_STYLE_COMPACT}>
      <ExtFieldsSection
        fields={customFields}
        disabled={editLocked}
        colSpan={8}
      />
    </SectionBox>
  );
};

export default ExtFieldsSectionBlock;
