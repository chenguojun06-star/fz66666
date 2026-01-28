import React from 'react';
import { Input, InputProps } from 'antd';
import { useAutoCollectDict } from '@/hooks/useAutoCollectDict';

interface AutoCollectInputProps extends InputProps {
  dictType?: string; // 词典类型
  autoCollect?: boolean; // 是否启用自动收录，默认 true
  collectOnBlur?: boolean; // 是否在失焦时收录，默认 true
  collectOnChange?: boolean; // 是否在输入时收录（防抖），默认 false
}

/**
 * 自动收录词典的输入框组件
 * 在用户输入新词汇时自动添加到词典系统
 */
const AutoCollectInput: React.FC<AutoCollectInputProps> = ({
  dictType,
  autoCollect = true,
  collectOnBlur = true,
  collectOnChange = false,
  onBlur,
  onChange,
  ...inputProps
}) => {
  const { collectWord } = useAutoCollectDict({
    dictType: dictType || 'custom',
    enabled: autoCollect && Boolean(dictType),
    silent: true,
    debounceMs: 1000
  });

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (collectOnBlur && dictType) {
      collectWord(e.target.value);
    }
    onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (collectOnChange && dictType) {
      collectWord(e.target.value);
    }
    onChange?.(e);
  };

  return (
    <Input
      {...inputProps}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
};

export default AutoCollectInput;
