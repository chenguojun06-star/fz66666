import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import type { StyleBom } from '@/types/style';

export interface BomColumnDeps {
    getMatchedQty: (color: unknown, size: unknown) => number;
    calcBomBudgetQty: (record: StyleBom) => number;
    calcBomTotalPrice: (record: StyleBom) => number;
    calcBomReferenceKg: (record: StyleBom) => number | null;
}

export const getBomColumns = (deps: BomColumnDeps) => {
    const { getMatchedQty, calcBomBudgetQty, calcBomTotalPrice, calcBomReferenceKg } = deps;
    return [
        { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140 },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
        { title: '颜色', dataIndex: 'color', key: 'color', width: 90 },
        { title: '规格', dataIndex: 'specification', key: 'specification', width: 140, ellipsis: true },
        { title: '尺码', dataIndex: 'size', key: 'size', width: 90 },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 90 },
        {
            title: '匹配订单数量', key: 'matchedQty', width: 130, align: 'right' as const,
            render: (_: any, record: StyleBom) => getMatchedQty((record as Record<string, unknown>).color, (record as Record<string, unknown>).size),
        },
        {
            title: '单件用量', key: 'usageAmount', width: 120,
            render: (_: any, record: StyleBom) => {
                const rawMap = (record as Record<string, unknown>).sizeUsageMap as string | undefined;
                if (rawMap) {
                    const matchedQty = getMatchedQty((record as Record<string, unknown>).color, (record as Record<string, unknown>).size);
                    const loss = Number((record as Record<string, unknown>).lossRate) || 0;
                    const divisor = matchedQty * (1 + loss / 100);
                    if (divisor > 0) {
                        const effectiveUnit = calcBomBudgetQty(record) / divisor;
                        return (
                            <span title="已配置码数用量，此处为加权平均值">
                                {Number(effectiveUnit.toFixed(4))}<span style={{ color: 'var(--warning-color, #f7a600)', marginLeft: 2 }}></span>
                            </span>
                        );
                    }
                    return <span style={{ color: 'var(--neutral-text-light)' }}>按配比</span>;
                }
                return <span>{Number((record as Record<string, unknown>).usageAmount) || 0}</span>;
            },
        },
        { title: '损耗率(%)', dataIndex: 'lossRate', key: 'lossRate', width: 110 },
        {
            title: '需求数量(米)', key: 'budgetQty', width: 140,
            render: (_: any, record: StyleBom) => calcBomBudgetQty(record),
        },
        {
            title: '参考公斤数', key: 'referenceKg', width: 120,
            render: (_: any, record: StyleBom) => {
                const kg = calcBomReferenceKg(record);
                return kg == null ? '-' : `${kg} kg`;
            },
        },
        {
            title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 140, ellipsis: true,
            render: (_: unknown, record: StyleBom) => (
                <SupplierNameTooltip
                    name={record.supplier}
                    contactPerson={record.supplierContactPerson}
                    contactPhone={record.supplierContactPhone}
                />
            ),
        },
        { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100 },
        {
            title: '总价', key: 'totalPrice', width: 100,
            render: (_: any, record: StyleBom) => calcBomTotalPrice(record),
        },
    ];
};
