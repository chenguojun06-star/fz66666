import { useMemo } from 'react';

export default function SkuMatrix({ matrix, compact, onCellChange, editable }) {
  const { colors, sizes, rows } = useMemo(() => {
    if (!matrix || typeof matrix !== 'object') return { colors: [], sizes: [], rows: [] };
    const colorSet = new Set();
    const sizeSet = new Set();
    const items = Array.isArray(matrix) ? matrix : [];
    items.forEach((item) => {
      if (item.color) colorSet.add(item.color);
      if (item.size) sizeSet.add(item.size);
    });
    const colors = [...colorSet];
    const sizes = [...sizeSet];
    const map = {};
    items.forEach((item) => {
      const key = `${item.color}|${item.size}`;
      map[key] = item;
    });
    return { colors, sizes, rows: items, map };
  }, [matrix]);

  if (!colors.length || !sizes.length) return null;

  return (
    <div className="sku-matrix" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 12 : 13, textAlign: 'center' }}>
        <thead>
          <tr style={{ background: 'var(--color-bg-gray)' }}>
            <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, minWidth: 60 }}>颜色\尺码</th>
            {sizes.map((s) => (
              <th key={s} style={{ padding: '8px 6px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, minWidth: 48 }}>{s}</th>
            ))}
            <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>合计</th>
          </tr>
        </thead>
        <tbody>
          {colors.map((color) => {
            let rowTotal = 0;
            return (
              <tr key={color}>
                <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--color-border-light)', fontWeight: 500, textAlign: 'left' }}>{color}</td>
                {sizes.map((size) => {
                  const key = `${color}|${size}`;
                  const item = rows.find((r) => r.color === color && r.size === size);
                  const qty = item ? Number(item.quantity || item.qty || 0) : 0;
                  rowTotal += qty;
                  return (
                    <td key={size} style={{ padding: '6px', borderBottom: '1px solid var(--color-border-light)' }}>
                      {editable && onCellChange ? (
                        <input
                          type="number"
                          min="0"
                          value={qty || ''}
                          onChange={(e) => onCellChange(color, size, Number(e.target.value) || 0)}
                          style={{ width: 44, textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 2px', fontSize: 13 }}
                        />
                      ) : (
                        <span style={{ color: qty > 0 ? 'var(--color-text-primary)' : 'var(--color-text-disabled)' }}>{qty || '-'}</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--color-border-light)', fontWeight: 700, color: 'var(--color-primary)' }}>{rowTotal}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--color-bg-gray)' }}>
            <td style={{ padding: '8px 6px', fontWeight: 700 }}>合计</td>
            {sizes.map((size) => {
              let colTotal = 0;
              rows.forEach((r) => { if (r.size === size) colTotal += Number(r.quantity || r.qty || 0); });
              return <td key={size} style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--color-primary)' }}>{colTotal}</td>;
            })}
            {(() => {
              let grandTotal = 0;
              rows.forEach((r) => { grandTotal += Number(r.quantity || r.qty || 0); });
              return <td style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--color-primary)' }}>{grandTotal}</td>;
            })()}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
