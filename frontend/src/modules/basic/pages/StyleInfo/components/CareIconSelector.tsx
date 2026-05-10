import React from 'react';
import { Tooltip } from 'antd';
import { CARE_ICONS, CARE_CATEGORIES } from '@/utils/careIcons';

interface Props {
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}

const CareIconSelector: React.FC<Props> = ({ value, onChange, disabled }) => {
  const selectedSet = new Set(value);

  const toggle = (code: string) => {
    if (disabled) return;
    if (selectedSet.has(code)) {
      onChange(value.filter(c => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  return (
    <div>
      {CARE_CATEGORIES.map(cat => (
        <div key={cat.key} style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-secondary, #666)',
            marginBottom: 8,
            paddingBottom: 4,
            borderBottom: '1px solid var(--color-border-light, #f0f0f0)',
          }}>
            {cat.label}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cat.codes.map(code => {
              const icon = CARE_ICONS[code];
              if (!icon) return null;
              const isSelected = selectedSet.has(code);
              return (
                <Tooltip key={code} title={icon.label}>
                  <div
                    onClick={() => toggle(code)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: isSelected
                        ? '2px solid var(--color-primary, #1677ff)'
                        : '2px solid var(--color-border-light, #f0f0f0)',
                      background: isSelected
                        ? 'var(--color-primary-bg, #e6f4ff)'
                        : 'var(--color-bg-container, #fafafa)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                      minWidth: 72,
                      userSelect: 'none',
                    }}
                  >
                    <div
                      dangerouslySetInnerHTML={{ __html: icon.svg }}
                      style={{
                        width: 28,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 4,
                      }}
                    />
                    <span style={{
                      fontSize: 11,
                      color: isSelected
                        ? 'var(--color-primary, #1677ff)'
                        : 'var(--color-text-tertiary, #8c8c8c)',
                      textAlign: 'center',
                      lineHeight: 1.3,
                      fontWeight: isSelected ? 600 : 400,
                    }}>
                      {icon.label}
                    </span>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CareIconSelector;
