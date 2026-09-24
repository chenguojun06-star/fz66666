/**
 * D-529：套装出库侧滑抽屉。
 * 选择组合商品 → 按套数出库：销售记录挂组合SKU（combo_code 溯源），
 * 实际库存按子SKU逐个扣减，每个子SKU一行出库记录、共用一张出库单号。
 */
import React from 'react';
import { App, Button, Card, Col, Input, InputNumber, Row, Select, Spin, Tag } from 'antd';
import SideDrawer from '@/components/common/SideDrawer';
import ResizableTable from '@/components/common/ResizableTable';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import CustomerInfoSection from './CustomerInfoSection';
import { comboProductApi, type ComboProductVO } from '@/services/warehouse/comboProductApi';
import { formatMoney } from '@/utils/format';
import { useDebouncedValue } from '@/hooks/usePerformance';

export interface ComboOutboundDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 出库成功后回调（刷新库存与出库记录） */
  onSuccess: () => void;
}

const ComboOutboundDrawer: React.FC<ComboOutboundDrawerProps> = ({ open, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [keyword, setKeyword] = React.useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [options, setOptions] = React.useState<ComboProductVO[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [combo, setCombo] = React.useState<ComboProductVO | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [sets, setSets] = React.useState<number>(1);
  const [salePrice, setSalePrice] = React.useState<number | null>(null);
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [shippingAddress, setShippingAddress] = React.useState('');
  const [trackingNo, setTrackingNo] = React.useState('');
  const [expressCompany, setExpressCompany] = React.useState('');
  const [remark, setRemark] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // 打开时重置
  React.useEffect(() => {
    if (!open) return;
    setKeyword(''); setOptions([]); setCombo(null); setSets(1); setSalePrice(null);
    setCustomerName(''); setCustomerPhone(''); setShippingAddress('');
    setTrackingNo(''); setExpressCompany(''); setRemark('');
  }, [open]);

  // 远程搜索启用中的组合商品
  React.useEffect(() => {
    if (!open) return;
    const kw = debouncedKeyword.trim();
    if (!kw) { setOptions([]); return; }
    let cancelled = false;
    setSearching(true);
    comboProductApi.list({ page: 1, pageSize: 20, keyword: kw, status: 'ENABLED' })
      .then((data) => { if (!cancelled) setOptions(data?.records || []); })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedKeyword, open]);

  const pickCombo = async (id: number) => {
    setDetailLoading(true);
    try {
      const vo = await comboProductApi.detail(id);
      setCombo(vo);
      setSets(1);
      setSalePrice(vo.salePrice ?? null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载组合商品失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const stock = combo?.availableStock ?? 0;
  const outOfStock = !!combo && sets > stock;

  const handleSubmit = async () => {
    if (!combo?.id) { message.warning('请先选择组合商品'); return; }
    if (!sets || sets <= 0) { message.warning('出库套数必须大于0'); return; }
    if (outOfStock) { message.warning(`可用库存不足：当前可出 ${stock} 套`); return; }
    if (!customerName.trim()) { message.warning('销售出库必须选择/填写客户'); return; }
    setSubmitting(true);
    try {
      const result = await comboProductApi.outbound({
        comboId: combo.id,
        quantity: sets,
        salesPrice: salePrice,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        trackingNo: trackingNo.trim() || undefined,
        expressCompany: expressCompany.trim() || undefined,
        remark: remark.trim() || undefined,
        outstockType: 'shipment',
      });
      message.success(`套装出库成功：出库单号 ${result?.outstockNo || ''}（${sets} 套，已按子SKU扣减库存）`);
      onSuccess();
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '套装出库失败');
    } finally {
      setSubmitting(false);
    }
  };

  const lineColumns = React.useMemo(() => [
    {
      title: '图片', key: 'img', width: 60,
      render: (_: unknown, r: ComboProductVO['items'][number]) => (
        <StyleCoverThumb src={r.styleImage || null} styleNo={r.styleNo} styleId={r.styleId} size={40} />
      ),
    },
    {
      title: '商品编码', dataIndex: 'skuCode', key: 'skuCode', width: 180,
      render: (v: string) => <span style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{v}</span>,
    },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 110 },
    { title: '颜色及规格', key: 'cs', width: 120, render: (_: unknown, r: ComboProductVO['items'][number]) => [r.color, r.size].filter(Boolean).join('/') || '-' },
    {
      title: '子SKU可用库存', dataIndex: 'availableQty', key: 'availableQty', width: 110, align: 'right' as const,
      render: (v: number | undefined) => (
        <span className="u-fw-600" style={{ color: (v || 0) >= 1 ? 'var(--color-success)' : 'var(--color-danger)' }}>{v ?? 0}</span>
      ),
    },
    { title: '单套数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const },
    {
      title: '本次出库', key: 'outQty', width: 90, align: 'right' as const,
      render: (_: unknown, r: ComboProductVO['items'][number]) => (
        <span className="u-fw-600">{(r.quantity || 0) * (sets || 0)}</span>
      ),
    },
  ], [sets]);

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="套装出库"
      width="85%"
      maskClosable={false}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit} disabled={!combo}>确认出库</Button>
        </>
      }
    >
      <Card style={{ marginBottom: 12 }}>
        <Row gutter={16}>
          <Col span={12}>
            <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>选择组合商品</div>
            <Select
              style={{ width: '100%' }}
              placeholder="搜索组合编码/组合名称"
              showSearch
              allowClear
              value={combo?.id ?? null}
              filterOption={false}
              searchValue={keyword || undefined}
              onSearch={setKeyword}
              loading={searching || detailLoading}
              options={options.map((o) => ({
                value: o.id,
                label: `${o.comboCode} ${o.comboName}（可用 ${o.availableStock} 套）`,
              }))}
              onChange={(v) => { if (v) void pickCombo(v); else setCombo(null); }}
              notFoundContent={searching ? '搜索中…' : (keyword ? '无匹配组合商品' : '输入组合编码/名称搜索')}
            />
          </Col>
          <Col span={6}>
            <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>出库套数</div>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              precision={0}
              value={sets}
              status={outOfStock ? 'error' : undefined}
              onChange={(v) => setSets(v || 1)}
              disabled={!combo}
            />
            {combo && <div className="u-fs-12 u-mt-4" style={{ color: outOfStock ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>可用 {stock} 套{outOfStock ? '，库存不足' : ''}</div>}
          </Col>
          <Col span={6}>
            <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>套装售价（选填）</div>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              value={salePrice}
              onChange={(v) => setSalePrice(v)}
              placeholder="默认按组合基本售价"
              disabled={!combo}
            />
            <div className="u-fs-12 u-mt-4" style={{ color: 'var(--color-text-tertiary)' }}>出库明细单价按套装单价记录，子SKU原价留痕仅供参考</div>
          </Col>
        </Row>
      </Card>

      {combo && (
        <>
          <Card style={{ marginBottom: 12 }}>
            <div className="u-d-flex u-ai-center u-gap-12 u-fwrap-wrap u-mb-8">
              <StyleCoverThumb src={combo.coverUrl || combo.items?.[0]?.styleImage || null} styleNo={combo.items?.[0]?.styleNo} size={56} />
              <div>
                <div className="u-fw-600 u-fs-14">{combo.comboName}</div>
                <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>
                  {combo.comboCode}{combo.colorSizeDesc ? ` · ${combo.colorSizeDesc}` : ''}{combo.salePrice != null ? ` · 套装价 ${formatMoney(combo.salePrice)}` : ''}
                </div>
              </div>
              <Tag color={stock > 0 ? 'green' : 'red'} style={{ marginLeft: 'auto', marginInlineEnd: 0 }}>可用库存 {stock} 套</Tag>
            </div>
            <ResizableTable size="small" columns={lineColumns as never} dataSource={combo.items || []} rowKey="skuCode" pagination={false} emptyDescription="该组合未配置子商品" />
            <div className="u-d-flex u-jc-between u-mt-8 u-fw-600">
              <span>出库件数（子SKU合计）: {combo.items?.reduce((s, i) => s + (i.quantity || 0) * (sets || 0), 0) || 0} 件</span>
              <span>套装金额: {formatMoney((salePrice ?? 0) * (sets || 0))}</span>
            </div>
          </Card>
          <CustomerInfoSection
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
            customerPhone={customerPhone}
            onCustomerPhoneChange={setCustomerPhone}
            shippingAddress={shippingAddress}
            onShippingAddressChange={setShippingAddress}
            variant="card"
          />
          <Card title="发货信息（选填）" style={{ marginTop: 12 }}>
            <Row gutter={16}>
              <Col span={6}>
                <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>快递单号</div>
                <Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="选填" />
              </Col>
              <Col span={6}>
                <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>快递公司</div>
                <Input value={expressCompany} onChange={(e) => setExpressCompany(e.target.value)} placeholder="选填" />
              </Col>
              <Col span={12}>
                <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>备注</div>
                <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="选填" />
              </Col>
            </Row>
          </Card>
          <div className="u-fs-12 u-mt-8" style={{ color: 'var(--color-text-tertiary)' }}>
            销售记录关联组合SKU（{combo.comboCode}）；实际库存按上方子SKU逐个扣减，每个子SKU生成一行出库记录，共用同一张出库单号。
          </div>
        </>
      )}
      {!combo && (
        <Spin spinning={detailLoading}>
          <Card><div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-tertiary)' }}>请先搜索并选择要出库的组合商品（套装）</div></Card>
        </Spin>
      )}
    </SideDrawer>
  );
};

export default ComboOutboundDrawer;
