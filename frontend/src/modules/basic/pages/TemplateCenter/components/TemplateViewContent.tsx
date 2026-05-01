import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { formatProcessDisplayName } from '@/utils/productionStage';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { isSizeTableData, convertStyleSizeListToTable } from '../utils/templateUtils';

type TemplateViewContentProps = {
  activeRow: Record<string, unknown> | null;
  viewObj: unknown;
  viewContent: string;
};

const TemplateViewContent: React.FC<TemplateViewContentProps> = ({ activeRow, viewObj, viewContent }) => {
  const t = String(activeRow?.templateType || '').trim().toLowerCase();

  if (!viewObj || typeof viewObj !== 'object') {
    return (
      <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', background: '#0b1020', color: '#e6edf3', padding: 12 }}>
        {viewContent || ''}
      </pre>
    );
  }

  if (t === 'progress') {
    return <ProgressView obj={viewObj} />;
  }

  if (t === 'process' || t === 'process_price') {
    return <ProcessView obj={viewObj} type={t} />;
  }

  if (t === 'bom') {
    return <BomView obj={viewObj} />;
  }

  if (t === 'size') {
    return <SizeView obj={viewObj} />;
  }

  return (
    <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', background: '#0b1020', color: '#e6edf3', padding: 12 }}>
      {viewContent || ''}
    </pre>
  );
};

const ProgressView: React.FC<{ obj: unknown }> = ({ obj }) => {
  const nodesRaw = Array.isArray((obj as Record<string, unknown>)?.nodes)
    ? ((obj as Record<string, unknown>).nodes as Array<Record<string, unknown>>)
    : [];
  const nodes = nodesRaw.map((n) => {
    const name = String(n?.name ?? '').trim();
    const unitPriceValue = Number(n?.unitPrice);
    const unitPrice = Number.isFinite(unitPriceValue) ? unitPriceValue : undefined;
    return { name, unitPrice };
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <div style={{ border: '1px solid var(--color-border)', padding: 8 }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: 8 }}>进度节点</div>
        <div style={{ maxHeight: 480, overflow: 'auto' }}>
          {nodes.map((n, idx) => (
            <div key={idx} style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: "var(--font-size-sm)" }}>
              {String(n?.name || '-')}
            </div>
          ))}
          {nodes.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无数据</div>}
        </div>
      </div>
      <div style={{ border: '1px solid var(--color-border)', padding: 8 }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: 8 }}>单价工序库</div>
        <div style={{ maxHeight: 480, overflow: 'auto' }}>
          {nodes.filter((n) => n?.unitPrice != null && n.unitPrice !== 0).map((n, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: "var(--font-size-sm)" }}>
              <span>{String(n?.name || '-')}</span>
              <span style={{ fontWeight: 500 }}>¥{Number(n?.unitPrice || 0).toFixed(2)}</span>
            </div>
          ))}
          {nodes.filter((n) => n?.unitPrice != null && n.unitPrice !== 0).length === 0 &&
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无单价数据</div>
          }
        </div>
      </div>
    </div>
  );
};

const getPriceValue = (s: Record<string, unknown>) => {
  const up = Number(s?.unitPrice);
  if (Number.isFinite(up) && up > 0) return up;
  const p = Number(s?.price);
  if (Number.isFinite(p) && p > 0) return p;
  return 0;
};

const ProcessView: React.FC<{ obj: unknown; type: string }> = ({ obj, type }) => {
  const stepsRaw = Array.isArray((obj as Record<string, unknown>)?.steps)
    ? ((obj as Record<string, unknown>).steps as Array<Record<string, unknown>>)
    : (Array.isArray(obj) ? (obj as Array<Record<string, unknown>>) : []);
  const steps = stepsRaw.map((s) => ({
    processName: String(s?.processName ?? '').trim(),
    processCode: s?.processCode == null ? '' : String(s.processCode),
    machineType: s?.machineType == null ? '' : String(s.machineType),
    standardTime: s?.standardTime == null ? '' : String(s.standardTime),
    unitPrice: s?.unitPrice,
    price: s?.price,
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <div style={{ border: '1px solid var(--color-border)', padding: 8 }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: 8 }}>
          {type === 'process_price' ? '工序节点' : '工艺节点'}
        </div>
        <div style={{ maxHeight: 480, overflow: 'auto' }}>
          {steps.map((s, idx) => (
            <div key={idx} style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: "var(--font-size-sm)" }}>
              <div>{formatProcessDisplayName(s?.processCode, s?.processName)}</div>
              {type === 'process' && s?.machineType && <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>机器: {s.machineType}</div>}
              {type === 'process' && s?.standardTime && <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>工时: {s.standardTime}秒</div>}
            </div>
          ))}
          {steps.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无数据</div>}
        </div>
      </div>
      <div style={{ border: '1px solid var(--color-border)', padding: 8 }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: 8 }}>
          {type === 'process_price' ? '单价工序库' : '工价工序库'}
        </div>
        <div style={{ maxHeight: 480, overflow: 'auto' }}>
          {steps.filter((s) => getPriceValue(s as unknown as Record<string, unknown>) > 0).map((s, idx) => {
            const price = getPriceValue(s as unknown as Record<string, unknown>);
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: "var(--font-size-sm)" }}>
                <span>{formatProcessDisplayName(s?.processCode, s?.processName)}</span>
                <span style={{ fontWeight: 500 }}>¥{price.toFixed(2)}</span>
              </div>
            );
          })}
          {steps.filter((s) => getPriceValue(s as unknown as Record<string, unknown>) > 0).length === 0 &&
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无价格数据</div>
          }
        </div>
      </div>
    </div>
  );
};

const BomView: React.FC<{ obj: unknown }> = ({ obj }) => {
  const rows = Array.isArray((obj as Record<string, unknown>)?.rows)
    ? ((obj as Record<string, unknown>).rows as Record<string, unknown>[])
    : (Array.isArray(obj) ? (obj as Record<string, unknown>[]) : []);

  return (
    <ResizableTable
      storageKey="template-bom-preview"
      size="small"
      rowKey={(r: Record<string, unknown>) => String(r?.materialCode || r?.materialName || '')}
      pagination={false}
      scroll={{ x: 'max-content' }}
      columns={[
        { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 140, render: (v: unknown) => getMaterialTypeLabel(v) },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: unknown) => String(v || '-') },
        { title: '颜色', dataIndex: 'color', key: 'color', width: 110, render: (v: unknown) => String(v || '-') },
        { title: '规格', dataIndex: 'specification', key: 'specification', width: 160, ellipsis: true, render: (v: unknown) => String(v || '-') },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 90, render: (v: unknown) => String(v || '-') },
        {
          title: '单件用量', dataIndex: 'usageAmount', key: 'usageAmount', width: 110, align: 'right' as const,
          render: (v: unknown) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : '-'; },
        },
        {
          title: '损耗率(%)', dataIndex: 'lossRate', key: 'lossRate', width: 110, align: 'right' as const,
          render: (v: unknown) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : '-'; },
        },
        {
          title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 110, align: 'right' as const,
          render: (v: unknown) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n.toFixed(2) : '-'; },
        },
        {
          title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 160, ellipsis: true,
          render: (_: unknown, row: Record<string, unknown>) => (
            <SupplierNameTooltip name={row.supplier} contactPerson={row.supplierContactPerson} contactPhone={row.supplierContactPhone} />
          ),
        },
      ]}
      dataSource={rows}
    />
  );
};

const SizeView: React.FC<{ obj: unknown }> = ({ obj }) => {
  const tableData = isSizeTableData(obj)
    ? obj
    : (Array.isArray(obj) ? convertStyleSizeListToTable(obj as Record<string, unknown>[]) : null);

  if (!tableData) {
    return <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无数据</div>;
  }

  const sizes = tableData.sizes.map((s) => String(s || '').trim()).filter(Boolean);
  const parts = tableData.parts as Record<string, unknown>[];

  const baseCols: ColumnsType<Record<string, unknown>> = [
    { title: '部位', dataIndex: 'partName', key: 'partName', width: 160, render: (v: unknown) => String(v || '-') },
    { title: '测量方式', dataIndex: 'measureMethod', key: 'measureMethod', width: 140, render: (v: unknown) => String(v || '-') },
    {
      title: '公差', dataIndex: 'tolerance', key: 'tolerance', width: 100, align: 'right' as const,
      render: (v: unknown) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : '-'; },
    },
  ];

  const sizeCols: ColumnsType<Record<string, unknown>> = sizes.map((sz) => ({
    title: sz,
    dataIndex: ['values', sz],
    key: `size_${sz}`,
    width: 110,
    align: 'right' as const,
    render: (v: unknown) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : '-'; },
  }));

  return (
    <ResizableTable
      storageKey="template-size-preview"
      size="small"
      rowKey={(r: Record<string, unknown>) => String(r?.partName || '')}
      pagination={false}
      scroll={{ x: 'max-content' }}
      columns={[...baseCols, ...sizeCols]}
      dataSource={parts}
    />
  );
};

export default TemplateViewContent;
