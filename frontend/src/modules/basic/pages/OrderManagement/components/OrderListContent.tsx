import React from 'react';
import { Button, Card, Space } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardPagination from '@/components/common/StandardPagination';
import UniversalCardView from '@/components/common/UniversalCardView';
import { createCardSpecFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import { DEFAULT_PAGE_SIZE_OPTIONS, savePageSize } from '@/utils/pageSizeStore';
import { getStyleCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { getStyleSourceText } from '@/utils/styleSource';
import { StyleInfo, StyleQueryParams } from '@/types/style';

interface Props {
  viewMode: 'table' | 'card';
  setViewMode: (v: 'table' | 'card') => void;
  queryParams: StyleQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<StyleQueryParams>>;
  styles: StyleInfo[];
  total: number;
  loading: boolean;
  columns: any[];
  cardColumns: number;
  openCreate: (style: StyleInfo) => void;
  fetchStyles: () => void;
  onNoDataOrder?: () => void;
}

const OrderListContent: React.FC<Props> = ({
  viewMode, setViewMode, queryParams, setQueryParams,
  styles, total, loading, columns, cardColumns, openCreate, fetchStyles, onNoDataOrder,
}) => {
  return (
    <>
      <Card size="small" className="filter-card mb-sm">
        <StandardToolbar
          left={(
            <StandardSearchBar
              searchValue={String(queryParams.keyword || '')}
              onSearchChange={(value) =>
                setQueryParams((prev) => ({
                  ...prev, page: 1, keyword: value,
                  styleNo: undefined, styleName: undefined, category: undefined,
                }))
              }
              searchPlaceholder="搜索款号/款名/品类"
              showDate={false}
              showStatus={false}
            />
          )}
          right={(
            <Space size={12}>
              {onNoDataOrder && (
                <Button icon={<PlusOutlined />} onClick={onNoDataOrder}>无资料下单</Button>
              )}
              <Button
                icon={viewMode === 'table' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                onClick={() => {
                  const next = viewMode === 'table' ? 'card' : 'table';
                  setViewMode(next);
                  if (next === 'card') setQueryParams((prev) => ({ ...prev, page: 1 }));
                }}
              >
                {viewMode === 'table' ? '卡片视图' : '列表视图'}
              </Button>
              <Button type="primary" onClick={() => fetchStyles()}>刷新</Button>
            </Space>
          )}
        />
      </Card>

      {viewMode === 'table' ? (
        <ResizableTable
          rowKey={(r: any) => String(r.id ?? r.styleNo)}
          columns={columns as any}
          dataSource={styles}
          loading={loading}
          stickyHeader
          scroll={{ x: 'max-content' }}
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total,
            showTotal: (t: number) => `共 ${t} 条`,
            showSizeChanger: true,
            pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
            onChange: (page: number, pageSize: number) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
          }}
        />
      ) : (
        <>
          <UniversalCardView
            dataSource={styles}
            loading={loading}
            columns={cardColumns}
            coverField="cover"
            titleField="styleNo"
            subtitleField="styleName"
            fields={[]}
            fieldGroups={[
              ...createCardSpecFieldGroups<StyleInfo>({
                colorKey: 'orderStyleCardColorLine',
                sizeKey: 'orderStyleCardSizeLine',
                quantityKey: 'orderStyleCardQuantityLine',
                getItems: (record) => getStyleCardSizeQuantityItems(record),
                getFallbackColor: (record) => String(record.color || '').trim(),
                getFallbackSize: (record) => String(record.size || '').trim(),
                getFallbackQuantity: (record) => Number(record.sampleQuantity) || Number((record as any).quantity) || 0,
              }),
              [
                { label: '来源', key: 'developmentSourceType', render: (_v: any, record: any) => getStyleSourceText(record as StyleInfo) },
                { label: '品类', key: 'category', render: (val: any) => val || '-' },
              ],
              [
                { label: '下单', key: 'latestOrderTime', render: (val: any) => val ? dayjs(val).format('MM-DD') : '-' },
                { label: '下单人', key: 'latestOrderCreator', render: (val: any) => val || '-' },
              ],
            ]}
            progressConfig={{ show: false, calculate: () => 0 }}
            actions={(record: any) => [
              { key: 'create', label: '下单', onClick: () => openCreate(record) },
            ]}
          />
          <StandardPagination
            current={queryParams.page}
            pageSize={queryParams.pageSize}
            total={total}
            wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
            showQuickJumper={false}
            onChange={(page, pageSize) => {
              savePageSize(pageSize);
              setQueryParams((prev) => ({ ...prev, page, pageSize }));
            }}
          />
        </>
      )}
    </>
  );
};

export default OrderListContent;
