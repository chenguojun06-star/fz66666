export function parseValidations(json?: string | null): { required?: boolean; pattern?: string } {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}

export function parseOptions(json?: string | null): { label: string; value: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => {
      if (typeof item === 'string') return { label: item, value: item };
      return { label: item.label ?? item.value ?? String(item), value: item.value ?? item.label ?? String(item) };
    });
  } catch { return []; }
}

export function mapTypeToWidget(fieldType: string): string {
  switch (fieldType) {
    case 'number': return 'inputnumber';
    case 'date': return 'datepicker';
    case 'select': return 'select';
    case 'multiselect': return 'select';
    case 'switch': return 'switch';
    case 'textarea': return 'textarea';
    default: return 'input';
  }
}
