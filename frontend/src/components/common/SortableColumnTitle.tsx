import React from 'react';
import { CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';

interface SortableColumnTitleProps {
    /** 列标题文字 */
    title: string;
    /** 当前排序字段 */
    sortField: string;
    /** 此列对应的字段名 */
    fieldName: string;
    /** 当前排序方向 */
    sortOrder: 'asc' | 'desc';
    /** 点击排序回调 */
    onSort: (field: string, order: 'asc' | 'desc') => void;
    /** 对齐方式，默认 right */
    align?: 'left' | 'center' | 'right';
}

/**
 * 可排序列标题组件
 *
 * 使用示例：
 * ```tsx
 * {
 *   title: <SortableColumnTitle
 *     title="总金额(元)"
 *     sortField={sortField}
 *     fieldName="totalAmount"
 *     sortOrder={sortOrder}
 *     onSort={handleSort}
 *   />,
 *   dataIndex: 'totalAmount',
 *   key: 'totalAmount',
 * }
 * ```
 */
const SortableColumnTitle: React.FC<SortableColumnTitleProps> = ({
    title,
    sortField,
    fieldName,
    sortOrder,
    onSort,
    align = 'right',
}) => {
    const isActive = sortField === fieldName;
    const nextOrder = isActive && sortOrder === 'desc' ? 'asc' : 'desc';

    const handleClick = () => {
        onSort(fieldName, nextOrder);
    };

    const justifyContent = align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end';

    return (
        <div
            style={{
                cursor: 'pointer',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent,
                gap: '4px',
            }}
            onClick={handleClick}
        >
            <span>{title}</span>
            {isActive ? (
                sortOrder === 'desc' ? (
                    <CaretDownOutlined style={{ color: 'var(--color-info)', fontSize: '14px' }} />
                ) : (
                    <CaretUpOutlined style={{ color: 'var(--color-info)', fontSize: '14px' }} />
                )
            ) : (
                <span style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    opacity: 0.3,
                    fontSize: '10px',
                    lineHeight: '6px',
                }}>
                    <CaretUpOutlined style={{ marginBottom: '-2px' }} />
                    <CaretDownOutlined />
                </span>
            )}
        </div>
    );
};

export default SortableColumnTitle;
