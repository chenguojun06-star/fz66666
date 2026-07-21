import { Tooltip } from 'antd';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import { statusMap } from '@/modules/finance/pages/FinanceCenter/useSettlementData';

// 内部工厂订单表格列定义（静态，无运行时依赖）
export const internalOrderColumns = [
    {
        title: '订单号',
        dataIndex: 'orderNo',
        key: 'orderNo',
        width: 150,
    },
    {
        title: '款号',
        dataIndex: 'styleNo',
        key: 'styleNo',
        width: 120,
    },
    {
        title: '工厂',
        dataIndex: 'factoryName',
        key: 'factoryName',
        width: 220,
        render: (_text: string, record: any) => (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FactoryTypeTag factoryType={record.factoryType} />
                    <span>{record.factoryName || '-'}</span>
                </div>
                {(record.orgPath || record.parentOrgUnitName) &&
                 (record.orgPath || record.parentOrgUnitName) !== record.factoryName ? (
                    <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12 }}>
                        {record.orgPath || record.parentOrgUnitName}
                    </div>
                ) : null}
            </div>
        ),
    },
    {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string) => {
            const info = statusMap[status] || { text: '未知', color: 'var(--neutral-text-secondary)' };
            return (
                <span style={{ padding: '2px 8px', fontSize: 14, backgroundColor: `${info.color}15`, color: info.color, fontWeight: 500 }}>
                    {info.text}
                </span>
            );
        },
    },
    {
        title: '完成时间',
        dataIndex: 'completeTime',
        key: 'completeTime',
        width: 160,
        render: (val: string) => formatDateTime(val),
    },
    {
        title: '颜色',
        dataIndex: 'colors',
        key: 'colors',
        width: 100,
        render: (val: string) => val || '-',
    },
    {
        title: '下单数',
        dataIndex: 'orderQuantity',
        key: 'orderQuantity',
        width: 100,
        align: 'right' as const,
        render: (val: number) => val?.toLocaleString() || '-',
    },
    {
        title: '入库数',
        dataIndex: 'warehousedQuantity',
        key: 'warehousedQuantity',
        width: 100,
        align: 'right' as const,
        render: (val: number) => val?.toLocaleString() || '-',
    },
    {
        title: '次品数',
        dataIndex: 'defectQuantity',
        key: 'defectQuantity',
        width: 100,
        align: 'right' as const,
        render: (val: number) => (
            <span style={{ color: val > 0 ? 'var(--color-danger)' : '#666' }}>
                {val?.toLocaleString() || '-'}
            </span>
        ),
    },
    {
        title: (<Tooltip title="下单时锁定的加工单价"><span>下单锁定单价</span></Tooltip>),
        dataIndex: 'styleFinalPrice',
        key: 'styleFinalPrice',
        width: 150,
        align: 'right' as const,
        render: (val: number) => (
            <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{formatMoney(val)}</span>
        ),
    },
    {
        title: (<Tooltip title="面辅料采购总成本（状态：已收货/已完成）"><span>面辅料成本</span></Tooltip>),
        dataIndex: 'materialCost',
        key: 'materialCost',
        width: 130,
        align: 'right' as const,
        render: (val: number) => formatMoney(val),
    },
    {
        title: (<Tooltip title="生产过程中工序扫码成本总计"><span>生产成本</span></Tooltip>),
        dataIndex: 'productionCost',
        key: 'productionCost',
        width: 120,
        align: 'right' as const,
        render: (val: number) => formatMoney(val),
    },
    {
        title: (<Tooltip title="次品报废损失 = 次品数 × 单件成本"><span>报废损失</span></Tooltip>),
        dataIndex: 'defectLoss',
        key: 'defectLoss',
        width: 120,
        align: 'right' as const,
        render: (val: number) => (
            <span style={{ color: val > 0 ? 'var(--color-danger)' : 'var(--neutral-text-secondary)' }}>
                {val > 0 ? '-' : ''}{formatMoney(val)}
            </span>
        ),
    },
    {
        title: '总金额',
        dataIndex: 'totalAmount',
        key: 'totalAmount',
        width: 130,
        align: 'right' as const,
        render: (val: number) => (
            <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{formatMoney(val)}</span>
        ),
    },
    {
        title: '利润',
        dataIndex: 'profit',
        key: 'profit',
        width: 130,
        align: 'right' as const,
        render: (val: number) => (
            <span style={{ fontWeight: 600, color: val >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {formatMoney(val)}
            </span>
        ),
    },
    {
        title: '利润率',
        dataIndex: 'profitMargin',
        key: 'profitMargin',
        width: 100,
        align: 'right' as const,
        render: (val: number) => (
            <span style={{ fontWeight: 600, color: val >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {val !== null && val !== undefined ? `${val.toFixed(2)}%` : '-'}
            </span>
        ),
    },
];
