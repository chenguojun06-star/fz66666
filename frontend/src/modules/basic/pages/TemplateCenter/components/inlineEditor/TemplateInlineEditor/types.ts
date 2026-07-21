import type { TemplateLibrary } from '@/types/style';

export interface StyleNoOption {
  value: string;
  label: string;
}

export interface TemplateInlineEditorProps {
  row: TemplateLibrary;
  onSaved: () => Promise<void> | void;
  onCancel?: () => void;
  readOnly?: boolean;
  compact?: boolean;
  maintenanceMode?: boolean;
  allowSourceStyleSelection?: boolean;
  styleNoOptions?: StyleNoOption[];
  styleNoLoading?: boolean;
  onStyleNoSearch?: (keyword: string) => void;
  onStyleNoDropdownOpen?: (open: boolean) => void;
}
