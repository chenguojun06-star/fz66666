import React from 'react';
import { Button, Collapse, Space, Tag, InputNumber } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { BatchSelectBundleRow, CuttingBundleRow } from '../../../types';
import { isBundleBlockedForWarehousing, getQualityStatusConfig } from '../../../utils';
import BatchSummary from './BatchSummary';

interface BatchSelectionPanelProps {
    bundles: CuttingBundleRow[];
    batchSelectRows: BatchSelectBundleRow[];
    batchSelectedBundleQrs: string[];
    batchSelectableQrs: string[];
    batchQtyByQr: Record<string, number>;
    summary: any;
    hasBlocked: boolean;
    bundleRepairRemainingByQr: Record<string, number>;
    onSelectAll: () => void;
    onSelectInvert: () => void;
    onSelectClear: () => void;
    onSelectionChange: (keys: React.Key[], rows: BatchSelectBundleRow[]) => void;
    setBatchQtyByQr: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    setBatchSelectedBundleQrs: React.Dispatch<React.SetStateAction<string[]>>;
}

const BatchSelectionPanel: React.FC<BatchSelectionPanelProps> = ({
    bundles,
    batchSelectRows,
    batchSelectedBundleQrs,
    batchSelectableQrs,
    batchQtyByQr,
    summary,
    hasBlocked,
    bundleRepairRemainingByQr,
    onSelectAll,
    onSelectInvert,
    onSelectClear,
    onSelectionChange,
    setBatchQtyByQr,
    setBatchSelectedBundleQrs,
}) => {
    return (
        <>
            <div className="wh-line" style={{ alignItems: 'flex-start' }}>
                <div className="wh-label">批量选择</div>
                <div className="wh-control" style={{ flex: 1 }}>
                    <Collapse
                        size="small"
                        items={[
                            {
                                key: 'batch-select',
                                label: (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            点击展开批量多选
                                        </div>
                                        <Tag color={batchSelectedBundleQrs.length ? 'blue' : 'default'}>
                                            已选 {batchSelectedBundleQrs.length}
                                        </Tag>
                                        <Tag color={batchSelectedBundleQrs.length ? 'geekblue' : 'default'}>
                                            数量 {batchSelectedBundleQrs.length ? summary.totalQty : 0}
                                        </Tag>
                                    </div>
                                ),
                                children: (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <Space wrap>
                                            <Button onClick={onSelectAll} disabled={!batchSelectableQrs.length}>
                                                全选
                                            </Button>
                                            <Button onClick={onSelectInvert} disabled={!batchSelectableQrs.length}>
                                                反选
                                            </Button>
                                            <Button onClick={onSelectClear} disabled={!batchSelectedBundleQrs.length}>
                                                清空已选
                                            </Button>
                                        </Space>

                                        <BatchSummary summary={summary} hasBlocked={hasBlocked} selectedCount={batchSelectedBundleQrs.length} />

                                        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                                            <ResizableTable<BatchSelectBundleRow>
                                                storageKey="batch-selection"
                                                size="small"
                                                rowKey="qr"
                                                pagination={false}
                                                dataSource={batchSelectRows}
                                                rowSelection={{
                                                    selectedRowKeys: batchSelectedBundleQrs,
                                                    onChange: (keys, rows) => onSelectionChange(keys, rows as BatchSelectBundleRow[]),
                                                    getCheckboxProps: (record) => ({ disabled: !!record.disabled }),
                                                }}
                                                columns={[
                                                    {
                                                        title: '菲号',
                                                        dataIndex: 'qr',
                                                        width: 220,
                                                        ellipsis: true,
                                                    },
                                                    {
                                                        title: '扎号',
                                                        dataIndex: 'bundleNo',
                                                        width: 80,
                                                        render: (v: unknown) => (v ? String(v) : '-'),
                                                    },
                                                    {
                                                        title: '颜色',
                                                        dataIndex: 'color',
                                                        width: 100,
                                                        render: (v: unknown) => (String(v || '').trim() ? String(v) : '-'),
                                                    },
                                                    {
                                                        title: '码数',
                                                        dataIndex: 'size',
                                                        width: 100,
                                                        render: (v: unknown) => (String(v || '').trim() ? String(v) : '-'),
                                                    },
                                                    {
                                                        title: '数量',
                                                        dataIndex: 'quantity',
                                                        width: 80,
                                                        render: (v: unknown) => String(Number(v || 0) || 0),
                                                    },
                                                    {
                                                        title: '状态',
                                                        dataIndex: 'statusText',
                                                        width: 140,
                                                        ellipsis: true,
                                                        render: (v: any, record: BatchSelectBundleRow) => {
                                                            const rawText = String(v || '').trim();
                                                            const key = rawText.toLowerCase();
                                                            const mapped = (key === 'qualified' || key === 'unqualified')
                                                                ? getQualityStatusConfig(key as any)
                                                                : undefined;
                                                            const text = mapped?.text || rawText || '-';

                                                            if (record.disabled) return <Tag color="default">{text}</Tag>;
                                                            return <Tag color="success">{text}</Tag>;
                                                        },
                                                    },
                                                ]}
                                            />
                                        </div>
                                    </div>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>

            {batchSelectedBundleQrs.length ? (
                <div className="wh-line" style={{ alignItems: 'flex-start' }}>
                    <div className="wh-label">批量菲号</div>
                    <div className="wh-control" style={{ flex: 1 }}>
                        <Collapse
                            size="small"
                            items={[
                                {
                                    key: 'batch-list',
                                    label: (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                点击展开查看已选菲号
                                            </div>
                                            <Tag color={batchSelectedBundleQrs.length ? 'blue' : 'default'}>
                                                已选 {batchSelectedBundleQrs.length}
                                            </Tag>
                                            <Tag color={batchSelectedBundleQrs.length ? 'geekblue' : 'default'}>
                                                数量 {batchSelectedBundleQrs.length ? summary.totalQty : 0}
                                            </Tag>
                                        </div>
                                    ),
                                    children: (
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8,
                                                maxHeight: 400,
                                                overflowY: 'auto',
                                                paddingRight: 8,
                                                border: '1px solid rgba(0,0,0,0.06)',

                                                padding: 8,
                                            }}
                                        >
                                            {batchSelectedBundleQrs.map((qr) => {
                                                const b = bundles.find((x) => String(x.qrCode || '').trim() === qr);
                                                const rawStatus = String((b as any)?.status || '').trim();
                                                const isBlocked = isBundleBlockedForWarehousing(rawStatus);
                                                const remaining = isBlocked ? bundleRepairRemainingByQr[qr] : undefined;
                                                const maxQty = isBlocked
                                                    ? Math.max(0, Number(remaining === undefined ? 0 : remaining) || 0)
                                                    : Math.max(0, Number(b?.quantity || 0) || 0);
                                                const currentQty = Math.max(0, Math.min(maxQty, Number(batchQtyByQr[qr] || 0) || 0));
                                                return (
                                                    <div key={qr} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                        <div style={{ flex: 1, minWidth: 240 }}>
                                                            {`菲号：${qr}`}
                                                            {b?.bundleNo ? `｜扎号：${b.bundleNo}` : ''}
                                                            {b?.color ? `｜颜色：${b.color}` : ''}
                                                            {b?.size ? `｜码数：${b.size}` : ''}
                                                            {isBlocked ? `｜可入库：${maxQty}` : ''}
                                                        </div>
                                                        <div style={{ width: 140 }}>
                                                            <InputNumber
                                                                style={{ width: '100%' }}
                                                                min={1}
                                                                max={maxQty || undefined}
                                                                value={currentQty || undefined}
                                                                onChange={(v) => {
                                                                    const next = Math.max(0, Math.min(maxQty, Number(v || 0) || 0));
                                                                    setBatchQtyByQr((prev) => ({ ...prev, [qr]: next }));
                                                                }}
                                                            />
                                                        </div>
                                                        <Button
                                                            danger
                                                            onClick={() => {
                                                                setBatchSelectedBundleQrs((prev) => prev.filter((x) => x !== qr));
                                                                setBatchQtyByQr((prev) => {
                                                                    const next = { ...prev };
                                                                    delete next[qr];
                                                                    return next;
                                                                });
                                                            }}
                                                        >
                                                            移除
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </div>
                </div>
            ) : null}
        </>
    );
};

export default BatchSelectionPanel;
