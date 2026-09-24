/**
 * D-529：组合商品侧滑抽屉 —— 新建/编辑/详情三态（D-438 模式：编辑在当前抽屉内完成）。
 * 分区：基础信息 / 包含商品 / 图片 / 其它信息；子商品至少 2 个不同 SKU。
 */
import React from 'react';
import { App as AntApp, Button, Checkbox, Descriptions, Input, InputNumber, Spin, Tag } from 'antd';
import SideDrawer from '@/components/common/SideDrawer';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { comboProductApi, type ComboProductVO } from '@/services/warehouse/comboProductApi';
import type { ComboItemRow } from './ComboItemTable';
import ComboItemTable from './ComboItemTable';
import ComboItemPicker, { type PickedSkuRow } from './ComboItemPicker';
import { formatMoney } from '@/utils/format';

export interface ComboProductDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit' | 'view';
  comboId: number | null;
  onSaved: () => void;
}

const SECTIONS = [
  { key: 'base', label: '基础信息' },
  { key: 'items', label: '包含商品' },
  { key: 'images', label: '图片' },
  { key: 'misc', label: '其它信息' },
];

interface FormState {
  comboCode: string;
  comboName: string;
  shortCode: string;
  colorSizeDesc: string;
  category: string;
  tags: string;
  autoSale: boolean;
  autoCost: boolean;
  salePrice: number | null;
  costPrice: number | null;
  coverUrl: string | null;
  remark: string;
}

const EMPTY_FORM: FormState = {
  comboCode: '', comboName: '', shortCode: '', colorSizeDesc: '', category: '', tags: '',
  autoSale: true, autoCost: true, salePrice: null, costPrice: null, coverUrl: null, remark: '',
};

const ComboProductDrawer: React.FC<ComboProductDrawerProps> = ({ open, onClose, mode, comboId, onSaved }) => {
  const { message } = AntApp.useApp();
  const [editing, setEditing] = React.useState(mode === 'create' || mode === 'edit');
  const [detail, setDetail] = React.useState<ComboProductVO | null>(null);
  const [items, setItems] = React.useState<ComboItemRow[]>([]);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const colorSizeTouchedRef = React.useRef(false);

  const setField = React.useCallback((key: keyof FormState, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadDetail = React.useCallback(async (id: number) => {
    setLoading(true);
    try {
      const vo = await comboProductApi.detail(id);
      setDetail(vo);
      setItems(vo.items || []);
      return vo;
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载组合商品失败');
      return null;
    } finally {
      setLoading(false);
    }
  }, [message]);

  React.useEffect(() => {
    if (!open) return;
    colorSizeTouchedRef.current = false;
    if (mode === 'create') {
      setEditing(true);
      setDetail(null);
      setItems([]);
      setForm(EMPTY_FORM);
      return;
    }
    setEditing(mode === 'edit');
    if (comboId != null) {
      void loadDetail(comboId).then((vo) => {
        if (vo) {
          setForm({
            comboCode: vo.comboCode || '', comboName: vo.comboName || '', shortCode: vo.shortCode || '',
            colorSizeDesc: vo.colorSizeDesc || '', category: vo.category || '', tags: vo.tags || '',
            autoSale: vo.autoSalePrice !== 0, autoCost: vo.autoCostPrice !== 0,
            salePrice: vo.salePrice ?? null, costPrice: vo.costPrice ?? null,
            coverUrl: vo.coverUrl || null, remark: vo.remark || '',
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/mode/comboId 变化时重置抽屉
  }, [open, mode, comboId]);

  // 颜色及规格自动建议：用户没手动填过时随子商品联动
  React.useEffect(() => {
    if (!editing || colorSizeTouchedRef.current) return;
    const suggest = items.map((i) => [i.color, i.size].filter(Boolean).join('/')).filter(Boolean).join(' + ');
    setForm((prev) => (prev.colorSizeDesc === suggest ? prev : { ...prev, colorSizeDesc: suggest }));
  }, [items, editing]);

  const computedSale = React.useMemo(
    () => items.reduce((sum, i) => sum + (i.quantity || 0) * Number(i.salesPrice || 0), 0),
    [items]);
  const computedCost = React.useMemo(
    () => items.reduce((sum, i) => sum + (i.quantity || 0) * Number(i.costPrice || 0), 0),
    [items]);
  const totalQty = React.useMemo(() => items.reduce((sum, i) => sum + (i.quantity || 0), 0), [items]);

  const handlePick = React.useCallback((row: PickedSkuRow) => {
    setItems((prev) => {
      if (prev.some((i) => i.skuCode === row.sku)) return prev;
      return [...prev, {
        skuCode: row.sku,
        styleId: row.styleId != null ? Number(row.styleId) : undefined,
        styleNo: row.styleNo,
        styleName: row.styleName,
        color: row.color,
        size: row.size,
        quantity: 1,
        availableQty: row.availableQty,
        salesPrice: row.salesPrice ?? null,
        costPrice: row.costPrice ?? null,
        styleImage: row.styleImage || null,
      }];
    });
  }, []);

  const handleSave = async () => {
    if (!form.comboName.trim()) { message.warning('请填写组合商品名称'); return; }
    if (items.length < 2) { message.warning('组合商品至少需要2个不同的子商品'); return; }
    setSaving(true);
    try {
      const payload = {
        id: detail?.id,
        comboCode: form.comboCode.trim() || undefined,
        comboName: form.comboName.trim(),
        shortCode: form.shortCode.trim() || undefined,
        colorSizeDesc: form.colorSizeDesc.trim() || undefined,
        category: form.category.trim() || undefined,
        tags: form.tags.trim() || undefined,
        autoSalePrice: form.autoSale ? 1 : 0,
        autoCostPrice: form.autoCost ? 1 : 0,
        salePrice: form.autoSale ? computedSale : form.salePrice,
        costPrice: form.autoCost ? computedCost : form.costPrice,
        coverUrl: form.coverUrl || undefined,
        remark: form.remark.trim() || undefined,
        items: items.map((i) => ({ skuCode: i.skuCode, quantity: i.quantity })),
      };
      if (mode === 'create') {
        await comboProductApi.create(payload);
        message.success('组合商品已创建');
        onSaved();
        onClose();
      } else {
        const vo = await comboProductApi.update(payload);
        message.success('组合商品已保存');
        setDetail(vo);
        setItems(vo.items || []);
        setEditing(false);
        onSaved();
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const scrollTo = (key: string) => {
    document.getElementById(`combo-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderField = (label: string, node: React.ReactNode, required?: boolean) => (
    <div className="u-d-flex u-ai-start u-gap-8 u-mb-10">
      <span style={{ width: 96, flexShrink: 0, color: 'var(--color-text-secondary)' }} className="u-fs-13">
        {required ? <span style={{ color: 'var(--color-danger)' }}>*</span> : null}{label}
      </span>
      <div className="u-flex-1">{node}</div>
    </div>
  );

  const renderViewRow = (label: string, value: React.ReactNode) => (
    <div className="u-d-flex u-ai-start u-gap-8 u-mb-8">
      <span style={{ width: 96, flexShrink: 0, color: 'var(--color-text-tertiary)' }} className="u-fs-13">{label}</span>
      <span className="u-fs-13 u-flex-1">{value ?? '-'}</span>
    </div>
  );

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title={mode === 'create' ? '创建组合商品' : `组合商品 - ${detail?.comboName || ''}`}
      width="85%"
      maskClosable={false}
      footer={
        editing ? (
          <>
            <Button onClick={() => (mode === 'create' ? onClose() : setEditing(false))} disabled={saving}>取消</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>关闭</Button>
            <Button type="primary" onClick={() => setEditing(true)}>编辑</Button>
          </>
        )
      }
    >
      <Spin spinning={loading}>
        <div className="u-d-flex u-gap-16">
          <nav style={{ width: 108, flexShrink: 0 }}>
            <div style={{ position: 'sticky', top: 8 }} className="u-d-flex u-fd-column u-gap-8">
              {SECTIONS.map((s) => (
                <Button key={s.key} type="text" size="small" style={{ justifyContent: 'flex-start' }} onClick={() => scrollTo(s.key)}>
                  {s.label}
                </Button>
              ))}
            </div>
          </nav>
          <div className="u-flex-1" style={{ minWidth: 0 }}>
            <section id="combo-sec-base" style={{ scrollMarginTop: 8 }} className="u-mb-24">
              <div className="u-fw-600 u-mb-10">基础信息</div>
              {editing ? (
                <>
                  {renderField('组合商品名称', <Input value={form.comboName} maxLength={100} showCount placeholder="如：春季卫衣+牛仔裤套装" onChange={(e) => setField('comboName', e.target.value)} />, true)}
                  <div className="u-d-flex u-gap-12">
                    <div className="u-flex-1">
                      {renderField('组合商品编码', <Input value={form.comboCode} maxLength={64} placeholder={mode === 'create' ? '留空自动生成（如 ZH202609240001）' : ''} onChange={(e) => setField('comboCode', e.target.value)} />)}
                    </div>
                    <div className="u-flex-1">
                      {renderField('组合款式编码', <Input value={form.shortCode} maxLength={64} placeholder="选填" onChange={(e) => setField('shortCode', e.target.value)} />)}
                    </div>
                  </div>
                  {renderField('颜色及规格', <Input value={form.colorSizeDesc} maxLength={200} placeholder="随子商品自动建议，可修改" onChange={(e) => { colorSizeTouchedRef.current = true; setField('colorSizeDesc', e.target.value); }} />)}
                  <div className="u-d-flex u-gap-12">
                    <div className="u-flex-1">
                      {renderField('商品分类', <Input value={form.category} maxLength={100} placeholder="选填" onChange={(e) => setField('category', e.target.value)} />)}
                    </div>
                    <div className="u-flex-1">
                      {renderField('商品标签', <Input value={form.tags} maxLength={255} placeholder="选填，逗号分隔" onChange={(e) => setField('tags', e.target.value)} />)}
                    </div>
                  </div>
                  <div className="u-d-flex u-gap-12">
                    <div className="u-flex-1">
                      {renderField('组合基本售价', (
                        <div className="u-d-flex u-ai-center u-gap-8">
                          <Checkbox checked={form.autoSale} onChange={(e) => setField('autoSale', e.target.checked)}>自动计算</Checkbox>
                          <InputNumber style={{ width: 160 }} min={0} precision={2} disabled={form.autoSale} value={form.autoSale ? computedSale : form.salePrice} onChange={(v) => setField('salePrice', v)} placeholder={form.autoSale ? '按子商品售价求和' : '手动填写'} />
                        </div>
                      ))}
                    </div>
                    <div className="u-flex-1">
                      {renderField('组合成本价', (
                        <div className="u-d-flex u-ai-center u-gap-8">
                          <Checkbox checked={form.autoCost} onChange={(e) => setField('autoCost', e.target.checked)}>自动计算</Checkbox>
                          <InputNumber style={{ width: 160 }} min={0} precision={2} disabled={form.autoCost} value={form.autoCost ? computedCost : form.costPrice} onChange={(v) => setField('costPrice', v)} placeholder={form.autoCost ? '按子商品成本求和' : '手动填写'} />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="组合商品编码"><span style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{detail?.comboCode || '-'}</span></Descriptions.Item>
                  <Descriptions.Item label="组合款式编码">{detail?.shortCode || '-'}</Descriptions.Item>
                  <Descriptions.Item label="组合商品名称">{detail?.comboName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="颜色及规格">{detail?.colorSizeDesc || '-'}</Descriptions.Item>
                  <Descriptions.Item label="商品分类">{detail?.category || '-'}</Descriptions.Item>
                  <Descriptions.Item label="商品标签">{detail?.tags || '-'}</Descriptions.Item>
                  <Descriptions.Item label="组合基本售价">{detail?.salePrice != null ? formatMoney(detail.salePrice) : '-'}</Descriptions.Item>
                  <Descriptions.Item label="组合成本价">{detail?.costPrice != null ? formatMoney(detail.costPrice) : '-'}</Descriptions.Item>
                </Descriptions>
              )}
            </section>

            <section id="combo-sec-items" style={{ scrollMarginTop: 8 }} className="u-mb-24">
              <div className="u-d-flex u-ai-center u-gap-12 u-mb-10 u-fwrap-wrap">
                <span className="u-fw-600">包含商品</span>
                {detail && !editing && (
                  <Tag color={detail.availableStock > 0 ? 'green' : 'red'} style={{ margin: 0 }}>可用库存 {detail.availableStock} 套</Tag>
                )}
                {editing && (
                  <ComboItemPicker excludeSkuCodes={items.map((i) => i.skuCode)} onPick={handlePick} />
                )}
              </div>
              <ComboItemTable
                items={items}
                editing={editing}
                onQtyChange={(idx, qty) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: qty || 1 } : it)))}
                onRemove={(idx) => setItems((prev) => prev.filter((_, i) => i !== idx))}
              />
              <div className="u-d-flex u-jc-end u-gap-16 u-mt-8 u-fw-600">
                <span>数量合计: {totalQty} 件</span>
                <span>售价合计: {formatMoney(form.autoSale ? computedSale : (form.salePrice ?? 0))}</span>
                <span>成本合计: {formatMoney(form.autoCost ? computedCost : (form.costPrice ?? 0))}</span>
              </div>
            </section>

            <section id="combo-sec-images" style={{ scrollMarginTop: 8 }} className="u-mb-24">
              <div className="u-fw-600 u-mb-10">图片</div>
              {editing ? (
                <ImageUploadBox value={form.coverUrl} onChange={(url) => setField('coverUrl', url)} size={96} label="组合图片" />
              ) : (
                <ImageUploadBox value={detail?.coverUrl || null} disabled size={96} label="组合图片" />
              )}
            </section>

            <section id="combo-sec-misc" style={{ scrollMarginTop: 8 }} className="u-mb-24">
              <div className="u-fw-600 u-mb-10">其它信息</div>
              {editing ? (
                <Input.TextArea rows={3} maxLength={500} showCount value={form.remark} placeholder="备注（选填）" onChange={(e) => setField('remark', e.target.value)} />
              ) : (
                renderViewRow('备注', detail?.remark || '-')
              )}
            </section>
          </div>
        </div>
      </Spin>
    </SideDrawer>
  );
};

export default ComboProductDrawer;
