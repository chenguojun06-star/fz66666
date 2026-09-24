/**
 * D-529：添加子商品 —— 远程搜索全库 SKU（款号/款名/商品编码），点选加入组合。
 * 与商品仓储出库抽屉的"搜索款号添加"同一接口，搜索的是真实库存行。
 */
import React from 'react';
import { Select, Tag } from 'antd';
import api from '@/utils/api';

export interface PickedSkuRow {
  sku: string;
  styleId?: string | number;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  availableQty?: number;
  salesPrice?: number | null;
  costPrice?: number | null;
  styleImage?: string | null;
}

interface Props {
  excludeSkuCodes: string[];
  onPick: (row: PickedSkuRow) => void;
  disabled?: boolean;
}

interface OptionItem {
  label: React.ReactNode;
  value: string;
  row: PickedSkuRow;
}

const ComboItemPicker: React.FC<Props> = ({ excludeSkuCodes, onPick, disabled }) => {
  const [searchText, setSearchText] = React.useState('');
  const [options, setOptions] = React.useState<OptionItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const timerRef = React.useRef<number | undefined>(undefined);

  const handleSearch = React.useCallback((text: string) => {
    setSearchText(text);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const kw = text.trim();
    if (!kw) { setOptions([]); return; }
    timerRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.post('/warehouse/finished-inventory/list', { page: 1, pageSize: 50, keyword: kw });
        const data = res?.data || res;
        const recs: PickedSkuRow[] = data?.records || [];
        setOptions(recs
          .filter((r) => r.sku && !excludeSkuCodes.includes(r.sku))
          .map((r) => ({
            value: r.sku,
            row: r,
            label: (
              <span className="u-d-flex u-ai-center u-gap-8">
                <span className="u-fw-600">{r.styleNo}</span>
                <span>{r.styleName || ''}</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>{[r.color, r.size].filter(Boolean).join('/')}</span>
                <Tag style={{ margin: 0 }} color={(r.availableQty || 0) > 0 ? 'green' : 'red'}>可用 {r.availableQty || 0}</Tag>
              </span>
            ),
          })));
      } catch {
        setOptions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [excludeSkuCodes]);

  React.useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  return (
    <Select
      style={{ width: 380 }}
      placeholder="＋ 搜索款号/款名/商品编码添加子商品（可连续添加）"
      showSearch
      allowClear
      value={null}
      disabled={disabled}
      filterOption={false}
      searchValue={searchText || undefined}
      onSearch={handleSearch}
      loading={searching}
      options={options}
      onChange={(_v, opt) => {
        const item = Array.isArray(opt) ? opt[0] : opt;
        if (item && 'row' in item) onPick(item.row as PickedSkuRow);
        setSearchText('');
        setOptions([]);
      }}
      notFoundContent={searching ? '搜索中…' : (searchText ? '无匹配商品' : '输入款号/款名/商品编码搜索')}
    />
  );
};

export default ComboItemPicker;
