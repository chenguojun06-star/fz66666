import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AutoComplete, AutoCompleteProps, Spin, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useAutoCollectDict } from '@/hooks/useAutoCollectDict';
import api from '@/utils/api';
import { subscribeDataUpdated } from '@/utils/dataEvents';
import DictQuickManageModal from './QuickManageModal';

interface DictAutoCompleteProps extends Omit<AutoCompleteProps, 'options'> {
  dictType: string; // 词典类型
  autoCollect?: boolean; // 是否启用自动收录，默认 true
  maxSuggestions?: number; // 最大建议数量，默认 50
  id?: string; // 表单元素 ID，用于 label 的 for 属性
  className?: string; // 自定义样式类
  /** 输入框内是否显示"维护"齿轮图标（弹窗增/删/改词条），默认 true */
  enableQuickManage?: boolean;
  /** 维护弹窗标题，默认取 placeholder，再退化为 dictType */
  quickManageTitle?: string;
  /** 内置兜底选项：字典接口无数据时使用（如商品类型 FINISHED/SEMI_FINISHED） */
  fallbackOptions?: string[];
  /** 齿轮弹窗新增词条成功后的回调（D-264）：宿主可立即把新值应用到表单（如直接加入颜色/码数） */
  onEntryCreated?: (name: string) => void;
}

interface DictOption {
  value: string;
  label: string;
  sort?: number;
}

/**
 * 词典自动完成输入框
 * 功能：
 * 1. 点击/聚焦时自动展开全部词典选项
 * 2. 输入关键词实时过滤匹配项
 * 3. 支持自由输入（不在词典中的值同样接受）
 * 4. 自动收录新词汇
 * 5. 底部显示"字典管理"跳转链接，方便维护选项
 */
const DictAutoComplete: React.FC<DictAutoCompleteProps> = ({
  dictType,
  autoCollect = true,
  maxSuggestions = 50,
  value,
  onChange,
  onBlur,
  onFocus,
  id,
  className,
  enableQuickManage = true,
  quickManageTitle,
  fallbackOptions,
  onEntryCreated,
  ...restProps
}) => {
  const [allItems, setAllItems] = useState<DictOption[]>([]);
  const [options, setOptions] = useState<{ value: string; label?: React.ReactNode }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const loadedRef = useRef(false);

  // 自动收录功能
  const { collectWord } = useAutoCollectDict({
    dictType,
    enabled: autoCollect,
    silent: true,
    debounceMs: 1000
  });

  // 加载全部词典项（组件挂载时加载一次）
  const loadAllItems = useCallback(async () => {
    if (loadedRef.current) return;
    setLoading(true);
    try {
      // 拉取量与展示量(maxSuggestions,默认50)解耦：词条超过50后老词条在下拉中
      // 永远消失无法选用——这里拉全量(上限500)，前端过滤后按 maxSuggestions 展示
      const response = await api.get('/system/dict/list', {
        params: { dictType, page: 1, pageSize: 500 }
      });
      const records: any[] = response.data?.records || response.data || [];
      const items: DictOption[] = records
        .filter((item: any) => item.dictLabel)
        .sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0))
        .map((item: any) => ({ value: item.dictLabel, label: item.dictLabel, sort: item.sort }));
      // 字典接口无数据时用内置兜底选项（保证基础选项始终可选）
      setAllItems(items.length > 0 ? items : (fallbackOptions || []).map((v) => ({ value: v, label: v })));
      loadedRef.current = true;
    } catch {
      setAllItems((fallbackOptions || []).map((v) => ({ value: v, label: v })));
    } finally {
      setLoading(false);
    }
  }, [dictType, fallbackOptions]);

  useEffect(() => {
    loadAllItems();
  }, [loadAllItems]);

  // 字典词条在本页被快捷维护（DictQuickManageModal 增删改名）后即时刷新
  useEffect(() => subscribeDataUpdated(`dict:${dictType}`, () => {
    loadedRef.current = false;
    loadAllItems();
  }), [dictType, loadAllItems]);

  // 构建 AutoComplete 的 options
  // 注意：options 的 label 只能是纯字符串，不能是 JSX 元素。
  // antd 6.x 内部在 selectionchange 事件中会调用 label.nodeName.toLowerCase()，
  // 若 label 是 React 元素会抛出 "nodeName.toLowerCase is not a function"。
  // 原 "字典管理" footer 已迁移到 popupRender，不再放入 options 数组。
  const buildOptions = useCallback((keyword: string) => {
    const filtered = keyword
      ? allItems.filter(item => item.value.includes(keyword))
      : allItems;

    return filtered.slice(0, maxSuggestions).map(item => ({
      value: item.value,
      label: item.value,
    }));
  }, [allItems, maxSuggestions]);

  // 聚焦时展开全部
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setOpen(true);
    setOptions(buildOptions(''));
    onFocus?.(e);
  };

  // 输入时实时过滤
  const handleSearch = (searchText: string) => {
    setOptions(buildOptions(searchText));
  };

  // 失焦时收录新词
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setOpen(false);
    if (autoCollect && value && typeof value === 'string' && value !== '__dict_manage__') {
      collectWord(value);
    }
    onBlur?.(e);
  };

  // 选中时关闭
  const handleSelect = (val: string) => {
    setOpen(false);
    onChange?.(val, { value: val, label: val });
  };

  // "维护"齿轮：仅启用且未禁用时显示；外部显式传入的 suffix 优先
  const { suffix: externalSuffix, disabled, placeholder, ...passProps } = restProps;
  const manageTitle =
    quickManageTitle ?? (typeof placeholder === 'string' && placeholder ? placeholder : dictType);
  const manageSuffix =
    enableQuickManage && !disabled && !externalSuffix ? (
      <Tooltip title={`维护${manageTitle}选项（新增 / 删除 / 改名）`}>
        <SettingOutlined
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setManageOpen(true);
          }}
          style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'pointer' }}
        />
      </Tooltip>
    ) : undefined;

  return (
    <>
      <AutoComplete
        id={id}
        className={className}
        value={value}
        open={open}
        onOpenChange={setOpen}
        options={open ? options : []}
        onChange={onChange}
        onSearch={handleSearch}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSelect={handleSelect}
        placeholder={placeholder || `请选择或输入...`}
        filterOption={false}
        notFoundContent={loading ? <Spin /> : (allItems.length === 0 ? '暂无数据' : '无匹配项')}
        suffix={manageSuffix ?? externalSuffix}
        // disabled 此前只用来隐藏齿轮、没传给输入框，锁定态照样能改（D-264）
        disabled={disabled}
        {...passProps}
      />
      {manageSuffix ? (
        <DictQuickManageModal
          open={manageOpen}
          mode="dict"
          dictType={dictType}
          title={manageTitle}
          onCreated={onEntryCreated}
          onClose={() => setManageOpen(false)}
        />
      ) : null}
    </>
  );
};

export default DictAutoComplete;

