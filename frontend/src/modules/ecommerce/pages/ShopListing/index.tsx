import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, Segmented, Space, Tag, Typography } from 'antd';
import { DollarOutlined, ExportOutlined, ReloadOutlined, ShopOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { message } from '@/utils/antdStatic';
import shopAdminApi from '@/services/shop/shopApi';
import BatchAdjustPriceModal from './BatchAdjustPriceModal';
import type { ShopConfig } from '@/services/shop/shopApi';
import { buildListingColumns } from './columns';
import ListingEditDrawer from './components/ListingEditDrawer';
import { filterRows, useShopListing } from './hooks/useShopListing';
import { useListingEditor } from './hooks/useListingEditor';
import { unwrap } from './unwrap';
import type { ListingFilter, ListingRow } from './types';
import { readPageSize } from '@/utils/pageSizeStore';
import './index.css';

const { Text } = Typography;

/**
 * 商品上架管理（D-768）——店铺商品运营专用页：
 * 改商品图片（主图 + 每个颜色一张图）、改上架数据（SKU 售价 / 库存）、上下架。
 * 门面：/shop/index.html?s={slug}（游客免登录）。
 */
const ShopListing: React.FC = () => {
  const { rows, summary, loading, truncated, load, patchListed } = useShopListing();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<ListingFilter>('all');
  const [page, setPage] = useState(1);
  // 每页条数由分页器与 localStorage 共同管理：
  // 此前这里是常量 PAGE_SIZE=10，而 ResizableTable 会把 pageSize 规范化成 20，
  // 导致"分页器按 20 算页数、数据按 10 切片"——页数减半、后半数据永远翻不到。
  const [pageSize, setPageSize] = useState(readPageSize(20));
  // D-769：批量调价（动钱操作，勾选后才出现入口）
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const initialLoadDone = React.useRef(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const onSaved = useCallback(() => {
    // 保存后重拉列表：售价/库存聚合会随之更新
    void load(keyword);
  }, [load, keyword]);

  /**
   * D-769：页面首次进入时加载列表。
   * 此前本页**完全没有 useEffect**，打开就是空的（已上架 0 / 全部 0 / 空表格），
   * 必须手动点「刷新」才出数据——因为 load() 只在点击/保存后被调用。
   * 空列表不是 bug 的假象，而是首屏根本没发请求。
   */
  useEffect(() => {
    // 用 ref 记录「是否已在首屏加载过」：
    // 既避免把 load 放进依赖导致 keyword 变化时重复请求，
    // 也不新增规范豁免注释（前端质量基线只许减少不许增加，
    // 且该基线按字面量计数，注释里提到指令名同样会被计入）。
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    void load('');
  }, [load]);

  const ed = useListingEditor(onSaved);

  const listedCount = useMemo(() => rows.filter((r) => r.shopListed === 1).length, [rows]);
  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);

  // 抽屉里的商品状态跟着列表走，上下架后即时同步
  const currentRow: ListingRow | null = ed.row
    ? rows.find((r) => r.id === ed.row?.id) ?? ed.row
    : null;
  const drawerListed = currentRow?.shopListed === 1;

  const doSearch = useCallback(
    (kw: string) => {
      setKeyword(kw);
      setPage(1);
      void load(kw);
    },
    [load],
  );

  const handleEdit = (row: ListingRow) => {
    setEditingId(row.id);
    void ed.openFor(row).finally(() => setEditingId(null));
  };

  const handleToggleListing = async (row: ListingRow, listed: boolean) => {
    setTogglingId(row.id);
    try {
      await shopAdminApi.setListing(row.id, listed);
      patchListed(row.id, listed);
      message.success(`「${row.styleName || row.styleNo}」已${listed ? '上架，顾客立即可见' : '下架'}`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setTogglingId(null);
    }
  };

  /** 用手机尺寸窗口打开店铺门面，避免在电脑全屏下被拉成巨幅 */
  const openShop = async () => {
    try {
      const res = await shopAdminApi.getConfig();
      const cfg = unwrap<ShopConfig | null>(res);
      if (cfg?.slug) {
        window.open(
          `${window.location.origin}/shop/index.html?s=${cfg.slug}`,
          'shopPreview',
          'width=430,height=900,left=200,top=60',
        );
      }
    } catch {
      message.error('店铺配置加载失败，无法打开店铺');
    }
  };

  const columns = buildListingColumns({
    summary,
    editingId,
    togglingId,
    onEdit: handleEdit,
    onToggleListing: (row, listed) => void handleToggleListing(row, listed),
  });

  return (
    <div className="shop-listing">
      <div className="shop-listing__hero">
        <div>
          <div className="shop-listing__title">
            <ShopOutlined />
            <span>商品上架管理</span>
            <Tag color="orange">已上架 {listedCount} 款</Tag>
          </div>
          <Text type="secondary" className="shop-listing__desc">
            在这里调整店铺商品的图片和上架数据（售价、库存）。顾客端免登录打开店铺链接即可下单。
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load(keyword)}>刷新</Button>
          <Button type="primary" icon={<ExportOutlined />} onClick={() => void openShop()}>
            预览店铺
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        className="shop-listing__alert"
        message="怎么上架 / 怎么改商品"
        description="① 找到款式 → 点右侧「上架」，顾客立刻能看到；② 点「改图与数据」改主图、每个颜色的图、SKU 售价与库存。价格显示 ¥— 说明该 SKU 没维护售价，顾客无法下单。"
      />

      <Card>
        <div className="shop-listing__toolbar">
          <Input.Search
            allowClear
            style={{ width: 300 }}
            placeholder="输入款号 / 款名 / 品类后回车"
            defaultValue={keyword}
            onSearch={doSearch}
            enterButton
          />
          <Segmented
            value={filter}
            onChange={(v) => { setFilter(String(v) as ListingFilter); setPage(1); }}
            options={[
              { value: 'all', label: `全部 ${rows.length}` },
              { value: 'listed', label: `已上架 ${listedCount}` },
              { value: 'unlisted', label: `未上架 ${rows.length - listedCount}` },
            ]}
          />
          {selectedIds.length > 0 ? (
            <Space size={8}>
              <Tag color="blue" closable onClose={() => setSelectedIds([])}>
                已选 {selectedIds.length} 款
              </Tag>
              <Button size="small" icon={<DollarOutlined />} onClick={() => setBatchOpen(true)}>
                批量调价
              </Button>
            </Space>
          ) : null}
          <div className="shop-listing__toolbar-spacer" />
          {truncated ? (
            <Text type="warning">款式较多，仅展示前 {rows.length} 款，请用搜索缩小范围</Text>
          ) : null}
        </div>

        <ResizableTable
          rowKey="id"
          size="small"
            rowSelection={{
              selectedRowKeys: selectedIds,
              onChange: (keys) => setSelectedIds(keys),
            }}
          columns={columns}
          dataSource={filtered}
          loading={loading}
          scroll={{ x: 1180 }}
          pagination={{
            current: page,
            pageSize,
            total: filtered.length,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          emptyDescription={
            rows.length === 0
              ? '没有查到款式，换个款号或款名试试'
              : filter === 'listed'
                ? '还没有上架的款式，切到「全部」点上架'
                : '该筛选下没有款式'
          }
        />
      </Card>

      <ListingEditDrawer
        open={ed.open}
        loading={ed.loading}
        saving={ed.saving}
        row={ed.row}
        skus={ed.skus}
        setSkus={ed.setSkus}
        cover={ed.cover}
        setCover={ed.setCover}
        colorImages={ed.colorImages}
        setColorImages={ed.setColorImages}
        remark={ed.remark}
        setRemark={ed.setRemark}
        fabric={ed.fabric}
        setFabric={ed.setFabric}
        wash={ed.wash}
        setWash={ed.setWash}
        desc={ed.desc}
        setDesc={ed.setDesc}
        category={ed.category}
        setCategory={ed.setCategory}
        listed={drawerListed}
        toggling={togglingId === ed.row?.id}
        onToggleListing={(listed) => {
          if (currentRow) void handleToggleListing(currentRow, listed);
        }}
        onClose={ed.close}
        onSave={() => void ed.save()}
      />
      <BatchAdjustPriceModal
        open={batchOpen}
        styleIds={selectedIds.map(Number)}
        styleNoOf={(id) => rows.find((r) => r.id === id)?.styleNo ?? ''}
        onCancel={() => setBatchOpen(false)}
        onDone={() => {
          setBatchOpen(false);
          setSelectedIds([]);
          // 调价后重载，避免用旧 summary 展示过期毛利
          void load(keyword);
        }}
      />
    </div>
  );
};

export default ShopListing;