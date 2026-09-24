/**
 * D-529：组合商品（套装）列表页。
 * 组合SKU = 任意两个及以上不同款式的SKU组合；销售走商品仓储「套装出库」，
 * 销售记录挂组合SKU，实际按子SKU出库（每个子SKU一行出库记录）。
 */
import React from 'react';
import { App, Button, Card, Select, Space, Tag } from 'antd';
import { PlusOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import PageStatCards from '@/components/common/PageStatCards';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import RowActions from '@/components/common/RowActions';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import { formatMoney } from '@/utils/format';
import { comboProductApi, type ComboProductVO } from '@/services/warehouse/comboProductApi';
import { useCombinedProductData } from './hooks/useCombinedProductData';
import ComboProductDrawer from './components/ComboProductDrawer';

const statusTag = (status?: string) =>
  status === 'DISABLED'
    ? <Tag color="default" style={{ margin: 0 }}>已停用</Tag>
    : <Tag color="green" style={{ margin: 0 }}>启用中</Tag>;

const CombinedProduct: React.FC = () => {
  const { message, modal } = App.useApp();
  const {
    records, total, page, pageSize, loading,
    searchText, setSearchText, statusValue, setStatusValue, setPage, setPageSize, loadData,
  } = useCombinedProductData();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit' | 'view'>('create');
  const [activeId, setActiveId] = React.useState<number | null>(null);

  const openCreate = () => { setDrawerMode('create'); setActiveId(null); setDrawerOpen(true); };
  const openView = (id: number) => { setDrawerMode('view'); setActiveId(id); setDrawerOpen(true); };

  const toggleStatus = (row: ComboProductVO) => {
    const next = row.status === 'DISABLED' ? 'ENABLED' : 'DISABLED';
    void (async () => {
      try {
        await comboProductApi.setStatus(row.id!, next);
        message.success(next === 'ENABLED' ? '已启用' : '已停用');
        loadData();
      } catch (e) {
        message.error(e instanceof Error ? e.message : '操作失败');
      }
    })();
  };

  const handleDelete = (row: ComboProductVO) => {
    modal.confirm({
      title: `删除组合商品「${row.comboName}」？`,
      content: '删除后不可恢复；已产生的出库记录不受影响（仍按子SKU保留溯源）。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await comboProductApi.remove(row.id!);
          message.success('已删除');
          loadData();
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败');
        }
      },
    });
  };

  const columns = React.useMemo(() => [
    {
      title: '图片',
      key: 'cover',
      width: 64,
      render: (_: unknown, r: ComboProductVO) => (
        <StyleCoverThumb src={r.coverUrl || r.items?.[0]?.styleImage || null} styleNo={r.items?.[0]?.styleNo} size={44} onClick={() => openView(r.id!)} />
      ),
    },
    {
      title: '组合编码',
      dataIndex: 'comboCode',
      key: 'comboCode',
      width: 160,
      render: (v: string, r: ComboProductVO) => (
        <a onClick={() => openView(r.id!)} style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{v}</a>
      ),
    },
    { title: '组合名称', dataIndex: 'comboName', key: 'comboName', width: 200, ellipsis: true },
    { title: '组合款式编码', dataIndex: 'shortCode', key: 'shortCode', width: 120, render: (v: string) => v || '-' },
    { title: '颜色及规格', dataIndex: 'colorSizeDesc', key: 'colorSizeDesc', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '包含商品',
      key: 'items',
      width: 220,
      render: (_: unknown, r: ComboProductVO) => {
        const list = r.items || [];
        if (!list.length) return '-';
        const shown = list.slice(0, 2).map((i) => `${i.styleNo || i.skuCode}${i.color ? ` ${[i.color, i.size].filter(Boolean).join('/')}` : ''}`);
        const rest = list.length - shown.length;
        return (
          <span title={list.map((i) => `${i.skuCode} × ${i.quantity}`).join('\n')}>
            {shown.join(' + ')}{rest > 0 ? ` +${rest}` : ''}
            <span style={{ color: 'var(--color-text-tertiary)' }}>（{list.length}款）</span>
          </span>
        );
      },
    },
    {
      title: '可用库存(套)',
      dataIndex: 'availableStock',
      key: 'availableStock',
      width: 110,
      align: 'right' as const,
      sorter: (a: ComboProductVO, b: ComboProductVO) => (a.availableStock || 0) - (b.availableStock || 0),
      render: (v: number) => (
        <span className="u-fw-600" style={{ color: v > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{v ?? 0}</span>
      ),
    },
    {
      title: '组合售价',
      dataIndex: 'salePrice',
      key: 'salePrice',
      width: 100,
      align: 'right' as const,
      render: (v: number | null) => (v != null ? formatMoney(v) : '-'),
    },
    {
      title: '成本价',
      dataIndex: 'costPrice',
      key: 'costPrice',
      width: 90,
      align: 'right' as const,
      render: (v: number | null) => (v != null ? formatMoney(v) : '-'),
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: (v: string) => statusTag(v) },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 150,
      render: (v: string) => <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>{v || '-'}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, r: ComboProductVO) => (
        <RowActions
          actions={[
            { key: 'edit', label: '编辑', primary: true, onClick: () => { setDrawerMode('edit'); setActiveId(r.id ?? null); setDrawerOpen(true); } },
            { key: 'status', label: r.status === 'DISABLED' ? '启用' : '停用', onClick: () => toggleStatus(r) },
            { key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(r) },
          ]}
        />
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- actions 依赖当前行，openView/toggleStatus 稳定
  ], [records]);

  const totalStock = records.reduce((sum, r) => sum + (r.availableStock || 0), 0);
  const enabledCount = records.filter((r) => r.status !== 'DISABLED').length;

  return (
    <>
      <Card style={{ marginBottom: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
        <StandardToolbar
          left={
            <StandardSearchBar
              searchValue={searchText}
              onSearchChange={setSearchText}
              searchPlaceholder="搜索组合编码/名称/子商品款号"
              statusValue={statusValue}
              onStatusChange={setStatusValue}
              statusOptions={[
                { label: '全部', value: '' },
                { label: '启用中', value: 'ENABLED' },
                { label: '已停用', value: 'DISABLED' },
              ]}
            />
          }
          right={
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建组合商品</Button>
            </Space>
          }
        />
      </Card>
      <PageStatCards
        cards={[{
          key: 'combo',
          items: [
            { label: '组合商品', value: total, unit: '款', color: 'var(--color-primary)' },
            { label: '启用中', value: enabledCount, unit: '款', color: 'var(--color-success)' },
            { label: '本页可用库存', value: totalStock, unit: '套', color: 'var(--color-orange-600)' },
          ],
        }]}
        activeKey=""
      />
      <Card style={{ marginTop: 12 }}>
        <ResizableTable
          storageKey="warehouse-combined-product"
          size="small"
          columns={columns as never}
          dataSource={records}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          showIndex
          emptyDescription="暂无组合商品，点击右上角「新建组合商品」把两件不同款式搭成套装"
          emptyActionText="新建组合商品"
          onEmptyAction={openCreate}
        />
        <StandardPagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
        />
      </Card>
      <ComboProductDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode={drawerMode}
        comboId={activeId}
        onSaved={loadData}
      />
    </>
  );
};

export default CombinedProduct;
