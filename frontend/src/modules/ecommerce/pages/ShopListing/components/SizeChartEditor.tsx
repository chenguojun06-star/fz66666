import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import './index.css';

const { Text } = Typography;

export interface SizeChartEditorProps {
  /** 结构化 JSON 字符串 {cols,rows}；旧数据可能是竖线文本或 HTML */
  value: string | null;
  /** 款式真实 SKU 尺码，用于带出行名 */
  sizes: string[];
  onChange: (v: string | null) => void;
}

/** 常见服装量体项，运营点选即可，不必自己想单位名 */
const COMMON_COLS = ['胸围', '腰围', '臀围', '肩宽', '衣长', '袖长', '裤长', '腰头', '裤脚'];

type Row = string[];

function parse(v: string | null): { cols: string[]; rows: Row[] } | null {
  if (!v) return null;
  const t = v.trim();
  if (!t.startsWith('{')) return null;
  try {
    const o = JSON.parse(t) as { cols?: unknown; rows?: unknown };
    if (!Array.isArray(o.cols) || !Array.isArray(o.rows)) return null;
    const cols = (o.cols as unknown[]).map((c) => String(c ?? '').trim()).filter(Boolean);
    const rows = (o.rows as unknown[]).map((r) =>
      Array.isArray(r) ? (r as unknown[]).map((c) => String(c ?? '')) : [],
    );
    if (cols.length < 2 || rows.length === 0) return null;
    return { cols, rows };
  } catch {
    return null;
  }
}

/**
 * D-812：手工尺码表（结构化录入）。
 *
 * <p><b>为什么重做成表格</b>：此前这里是一个文本框，让运营手打
 * `衣长|59|60|61` 这种竖线文本；而顾客端那一侧是把它当 HTML 渲染的，
 * 且富文本白名单里**没有 table 标签** —— 结果是竖线文本原样显示、
 * 手写 HTML 表格被转义成乱码。这个功能线上 0 条记录，不是没人填，
 * 是填了也没法用。
 *
 * <p><b>结构真相源是结构化数据</b>，不是放宽 HTML 白名单来兜。
 *
 * <p><b>用真实数据</b>：行名（尺码）直接从款式真实 SKU 带出，
 * 运营只需要填量体数字，不会出现「尺码表里写 M、SKU 里没有 M」。
 */
const SizeChartEditor: React.FC<SizeChartEditorProps> = ({ value, sizes, onChange }) => {
  const parsed = useMemo(() => parse(value), [value]);
  /** 旧格式文本（竖线/HTML）——顾客端渲染不出表格，必须告诉运营 */
  const legacy = !!value && !value.trim().startsWith('{') ? value : null;

  const [cols, setCols] = useState<string[]>(() => parsed?.cols ?? ['尺码', '腰围', '臀围', '裤长']);
  const [rows, setRows] = useState<Row[]>(
    () =>
      parsed?.rows ??
      // 尺码名从真实 SKU 带出：运营只填数字
      (sizes.length ? sizes : []).map((sz) => [sz, '', '', '']),
  );

  /**
   * 外部值变化（切换款式）时重新装载。
   *
   * <p>用 ref 记住「已装载的值」而不是把 sizes 排除在依赖外 ——
   * 排除依赖需要写禁用指令，而禁用指令有基线成本（质量门控只许减不许加）；
   * 改成「值真的变了才重装」既省掉禁用指令，语义也更准：
   * sizes 因为别的原因变动时不会把运营正在填的数字冲掉。
   */
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = value ?? '';
    if (loadedRef.current === key) return;
    loadedRef.current = key;
    const p = parse(value);
    if (p) {
      setCols(p.cols);
      setRows(p.rows);
    } else if (!value) {
      setCols(['尺码', '腰围', '臀围', '裤长']);
      setRows(sizes.map((sz) => [sz, '', '', '']));
    }
  }, [value, sizes]);

  const emit = useCallback(
    (nextCols: string[], nextRows: Row[]) => {
      setCols(nextCols);
      setRows(nextRows);
      // 全空视为「不手工覆盖」→ 交回自动生成的 SKU 矩阵
      const hasValue = nextRows.some((r) => r.slice(1).some((c) => c.trim()));
      onChange(hasValue ? JSON.stringify({ cols: nextCols, rows: nextRows }) : null);
    },
    [onChange],
  );

  const setCell = (r: number, c: number, v: string) => {
    const next = rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row));
    emit(cols, next);
  };

  const addCol = (name: string) => {
    const n = name.trim();
    if (!n) return;
    if (cols.slice(1).includes(n)) return;
    emit([...cols, n], rows.map((r) => [...r, '']));
  };

  const removeCol = (c: number) => {
    if (c === 0) return; // 「尺码」列不能删，删了表就没有主键
    emit(
      cols.filter((_, j) => j !== c),
      rows.map((r) => r.filter((_, j) => j !== c)),
    );
  };

  const addRow = () => {
    const next: Row = cols.map((_, j) => (j === 0 ? '' : ''));
    // 已有的尺码里挑第一个还没出现的，避免重复行
    const used = new Set(rows.map((r) => r[0].trim()));
    const free = sizes.find((s) => !used.has(s));
    next[0] = free ?? '';
    emit(cols, [...rows, next]);
  };

  const removeRow = (r: number) => emit(cols, rows.filter((_, i) => i !== r));

  return (
    <div className="sce">
      {legacy && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="检测到旧格式的尺码表文本"
          description="旧文本在顾客端渲染不出表格（只会被原样显示）。已改为下方结构化录入；保存后旧的竖线文本会被替换。"
        />
      )}

      <Space size={8} wrap style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>量体项：</Text>
        {COMMON_COLS.filter((c) => !cols.slice(1).includes(c)).map((c) => (
          <Button key={c} size="small" icon={<PlusOutlined />} onClick={() => addCol(c)}>
            {c}
          </Button>
        ))}
      </Space>

      <Table
        size="small"
        bordered
        pagination={false}
        scroll={{ x: 'max-content' }}
        rowKey={(_, i) => String(i)}
        dataSource={rows}
        columns={[
          {
            title: (
              <Space size={4}>
                尺码
                <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>（来自 SKU）</Text>
              </Space>
            ),
            dataIndex: 0,
            width: 150,
            render: (_: unknown, __: unknown, r: number) => (
              <Input
                value={rows[r]?.[0] ?? ''}
                placeholder="如 M"
                onChange={(e) => setCell(r, 0, e.target.value)}
              />
            ),
          },
          ...cols.slice(1).map((name, i) => ({
            title: (
              <Space size={2}>
                <span>{name}</span>
                <Tooltip title="删除这一项">
                  <Button
                    size="small"
                    type="text"
                    danger
                    aria-label={`删除量体项 ${name}`}
                    icon={<DeleteOutlined />}
                    onClick={() => removeCol(i + 1)}
                  />
                </Tooltip>
              </Space>
            ),
            key: name,
            width: 140,
            render: (_: unknown, __: unknown, r: number) => (
              <Input
                value={rows[r]?.[i + 1] ?? ''}
                placeholder="cm"
                onChange={(e) => setCell(r, i + 1, e.target.value)}
              />
            ),
          })),
          {
            title: '',
            key: 'op',
            width: 48,
            render: (_: unknown, __: unknown, r: number) => (
              <Button
                size="small"
                type="text"
                danger
                aria-label="删除该行"
                icon={<DeleteOutlined />}
                onClick={() => removeRow(r)}
              />
            ),
          },
        ]}
      />

      <Space style={{ marginTop: 12 }}>
        <Button size="small" icon={<PlusOutlined />} onClick={addRow}>
          加一行
        </Button>
        {sizes.length === 0 && (
          <Tag color="orange">该款式还没有 SKU 尺码，尺码名需手填</Tag>
        )}
      </Space>

      <Text type="secondary" className="deic__spec" style={{ display: 'block', marginTop: 8 }}>
        留空则不手工覆盖，顾客端按 SKU 的颜色 × 尺码矩阵自动生成。
      </Text>
    </div>
  );
};

export default SizeChartEditor;