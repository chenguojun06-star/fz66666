import React, { useCallback, useRef, useState } from 'react';
import { Alert, Button, InputNumber, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { EditableSku } from '../types';
import { parseSpreadsheetText, applySpreadsheetRows } from '../spreadsheetPaste';

const { Text } = Typography;

interface Props {
  skus: EditableSku[];
  setSkus: React.Dispatch<React.SetStateAction<EditableSku[]>>;
}

/**
 * SKU 售价 / 库存编辑区（D-768，D-800 增强批量录入）。
 *
 * <h3>D-800 新增：批量能力</h3>
 * 调研（Saleor / Vendure / WooCommerce 源码）后确认，本项目<b>不做「自动生成 SKU」</b> ——
 * Saleor/Bagisto 都靠 `join('-')` 拼 SKU，但真实编码是
 * `BR24XQ0098E草绿色L(170/84A)`（无分隔符），拼接必错，且违反 CLAUDE.md 铁律 13。
 * 改为提供运营真正缺的：
 *   ① Excel 批量粘贴（清洗 ¥1,234.50 / 1.234,50 等 Excel 显示格式）
 *   ② 批量设置售价 / 库存（应对「这 5 个码都涨到 279」）
 *   ③ Enter 下移到下一行（录入不离开键盘）
 */
const SkuPriceStockSection: React.FC<Props> = ({ skus, setSkus }) => {
  const [bulkPrice, setBulkPrice] = useState<number | null>(null);
  const [bulkStock, setBulkStock] = useState<number | null>(null);
  // 粘贴锚点：用户点某个单元格后再粘贴，从该行开始写
  const [pasteAnchor, setPasteAnchor] = useState(0);
  // D-800：Enter 下移需拿到 antd Table 实例反查 DOM（antd 的 ref 是 Reference 而非 DOM）
  const tableRef = useRef<any>(null);

  const patch = (skuId: number, field: 'salesPrice' | 'stockQuantity', value: number | null) => {
    setSkus((prev) => prev.map((s) => (s.skuId === skuId ? { ...s, [field]: value, dirty: true } : s)));
  };

  /** 按表格内下标 patch（粘贴走这条，因为粘贴不拿 skuId） */
  const patchByIndex = useCallback((idx: number, field: 'salesPrice' | 'stockQuantity', value: number) => {
    setSkus((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value, dirty: true } : s)));
  }, [setSkus]);

  const handlePaste = useCallback(() => {
    void navigator.clipboard.readText().then((text) => {
      const rows = parseSpreadsheetText(text);
      if (rows.length === 0) {
        message.warning('剪贴板是空的');
        return;
      }
      if (pasteAnchor + rows.length > skus.length) {
        message.warning(
          `从第 ${pasteAnchor + 1} 行起只能粘贴 ${Math.max(0, skus.length - pasteAnchor)} 行，` +
          `实际粘了 ${rows.length} 行`,
        );
        return;
      }
      const r = applySpreadsheetRows(
        pasteAnchor,
        [{ col: 'salesPrice', numeric: true }, { col: 'stockQuantity', numeric: true }],
        rows,
        (rowIdx, col, value) => patchByIndex(rowIdx, col as 'salesPrice' | 'stockQuantity', Number(value)),
      );
      if (r.invalidRows.length > 0) {
        message.warning(`已写入 ${r.applied} 处，${r.invalidRows.length} 行无法识别（已跳过，未填 0）`);
      } else {
        message.success(`已批量写入 ${r.applied} 处`);
      }
    }).catch(() => {
      message.error('读取剪贴板失败，请确认浏览器已授权剪贴板访问');
    });
  }, [pasteAnchor, skus.length, patchByIndex]);

  const applyBulk = (field: 'salesPrice' | 'stockQuantity', value: number | null) => {
    if (value == null) {
      message.warning('请先填写数值');
      return;
    }
    setSkus((prev) => prev.map((s) => ({ ...s, [field]: value, dirty: true })));
    message.success(`已为全部 ${skus.length} 个 SKU 设置${field === 'salesPrice' ? '售价' : '库存'} ${value}`);
  };

  const columns: ColumnsType<EditableSku> = [
    {
      title: '颜色',
      dataIndex: 'color',
      width: 110,
      render: (v: string, _r, i) => (
        <Space size={4}>
          <Tag>{v}</Tag>
          {pasteAnchor === i && <Tag color="blue">粘贴起点</Tag>}
        </Space>
      ),
    },
    { title: '尺码', dataIndex: 'size', width: 110 },
    {
      title: 'SKU编码',
      dataIndex: 'skuCode',
      width: 190,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: '售价（¥）',
      dataIndex: 'salesPrice',
      width: 150,
      render: (v: number | null, r) => (
        <InputNumber
          min={0}
          precision={2}
          style={{ width: 128 }}
          value={v ?? undefined}
          placeholder="未设置"
          onFocus={() => setPasteAnchor(skus.findIndex((s) => s.skuId === r.skuId))}
          onPressEnter={() => {
            // D-800：Enter 跳到下一行同一列，批量录入不用离开键盘
            const i = skus.findIndex((s) => s.skuId === r.skuId);
            if (i < 0) return;
            const next: HTMLInputElement | undefined = tableRef.current
              ?.querySelector('tbody tr:nth-child(' + (i + 2) + ') td:nth-child(4) input');
            next?.focus();
            next?.select();
          }}
          onChange={(nv) => patch(r.skuId, 'salesPrice', nv ?? null)}
        />
      ),
    },
    {
      title: '可售库存',
      dataIndex: 'stockQuantity',
      width: 140,
      render: (v: number | null, r) => (
        <InputNumber
          min={0}
          precision={0}
          style={{ width: 118 }}
          value={v ?? undefined}
          onChange={(nv) => patch(r.skuId, 'stockQuantity', nv ?? 0)}
        />
      ),
    },
    {
      title: '本次改动',
      width: 100,
      render: (_, r) => (r.dirty ? <Tag color="orange">待保存</Tag> : <Text type="secondary">—</Text>),
    },
  ];

  const noPrice = skus.filter((s) => s.salesPrice == null || Number(s.salesPrice) <= 0).length;
  const dirtyCount = skus.filter((s) => s.dirty).length;

  return (
    <div className="shop-edit__block">
      {/* D-513：「手工改库存不走台账」的说明已上提到分区副标题；
          这里只保留「异常态」提醒（有 SKU 没售价 → 顾客无法下单），异常才用 Alert 强调 */}
      {noPrice > 0 ? (
        <Alert
          type="info"
          showIcon
          className="shop-listing__alert"
          message={`有 ${noPrice} 个 SKU 没有售价`}
          description="没有售价的 SKU 在店铺里显示 ¥—，并且顾客无法下单。请先补齐售价。"
        />
      ) : null}

      <Space size={8} wrap style={{ marginBottom: 8 }}>
        <Tooltip title="把 Excel 里的两列（售价、库存）复制后，从「粘贴起点」行开始批量填入。支持 ¥1,234.50、1.234,50 等 Excel 显示格式">
          <Button icon={<CopyOutlined />} onClick={handlePaste} disabled={skus.length === 0}>
            从 Excel 粘贴
          </Button>
        </Tooltip>
        <InputNumber
          min={0}
          precision={2}
          style={{ width: 120 }}
          placeholder="统一售价"
          value={bulkPrice ?? undefined}
          onChange={(v) => setBulkPrice(v ?? null)}
        />
        <Button
          icon={<ThunderboltOutlined />}
          onClick={() => applyBulk('salesPrice', bulkPrice)}
          disabled={bulkPrice == null || skus.length === 0}
        >
          全部设为该售价
        </Button>
        <InputNumber
          min={0}
          precision={0}
          style={{ width: 110 }}
          placeholder="统一库存"
          value={bulkStock ?? undefined}
          onChange={(v) => setBulkStock(v ?? null)}
        />
        <Button
          icon={<ThunderboltOutlined />}
          onClick={() => applyBulk('stockQuantity', bulkStock)}
          disabled={bulkStock == null || skus.length === 0}
        >
          全部设为该库存
        </Button>
      </Space>

      <Table<EditableSku>
        ref={tableRef}
        rowKey="skuId"
        size="small"
        columns={columns}
        dataSource={skus}
        pagination={false}
        scroll={{ y: 320 }}
        locale={{ emptyText: '该款式还没有 SKU，请先在「款式资料」维护颜色尺码' }}
      />
      <Text type="secondary" className="shop-listing__hint">
        共 {skus.length} 个 SKU{skus.length ? `（售价 + 库存）` : ''}
        {dirtyCount ? `，本次有 ${dirtyCount} 行改动待保存` : ''}
        {skus.length > 0 && '　·　点任意售价框会把该行设为「粘贴起点」；售价框内按 Enter 跳到下一行'}
      </Text>
    </div>
  );
};

export default SkuPriceStockSection;