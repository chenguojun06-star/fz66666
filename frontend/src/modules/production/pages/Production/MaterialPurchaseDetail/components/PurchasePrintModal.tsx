import React, { useMemo } from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import { parseProductionOrderLines, sortSizeNames, toNumberSafe } from '@/utils/api';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { getStatusConfig } from '../../MaterialPurchase/utils';
import type { MaterialPurchase } from '@/types/production';

const { Text } = Typography;

interface PurchasePrintModalProps {
  open: boolean;
  onClose: () => void;
  order?: any | null;
  purchaseList: MaterialPurchase[];
  orderNo?: string;
  styleNo?: string;
  styleName?: string;
  styleCover?: string | null;
  color?: string;
  materialArrivalRate: number;
}

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? `¥${n.toFixed(2)}` : '-';
};

/**
 * 专业采购单打印：订单头（款图+下单明细颜色矩阵）+ 物料信息表 + 合计
 */
const PurchasePrintModal: React.FC<PurchasePrintModalProps> = ({
  open, onClose, order, purchaseList,
  orderNo: orderNoProp, styleNo: styleNoProp, styleName: styleNameProp,
  styleCover: styleCoverProp, color: colorProp, materialArrivalRate,
}) => {
  const orderNo = String(orderNoProp ?? order?.orderNo ?? order?.productionOrderNo ?? '').trim();
  const styleNo = String(styleNoProp ?? order?.styleNo ?? '').trim();
  const styleName = String(styleNameProp ?? order?.styleName ?? '').trim();
  const styleCover = (styleCoverProp ?? order?.styleCover ?? null) as string | null;
  const color = String(colorProp ?? order?.color ?? '').trim();

  // 下单明细颜色×尺码矩阵
  const matrix = useMemo(() => {
    const lines = parseProductionOrderLines(order).filter((l) => String(l.size || '').trim());
    if (!lines.length) return null;
    const colors = Array.from(new Set(lines.map((l) => String(l.color || '').trim()).filter(Boolean)));
    const sizes = sortSizeNames(Array.from(new Set(lines.map((l) => String(l.size || '').trim()))));
    const cell = (c: string, s: string) =>
      lines.reduce((sum, l) => (String(l.color || '').trim() === c && String(l.size || '').trim() === s ? sum + toNumberSafe(l.quantity) : sum), 0);
    return { colors, sizes, cell };
  }, [order]);

  // 数量做小数归一：0.9+0.88 这类样衣数量在 JS 浮点下会产生 2.6799999... 长尾巴，统一保留2位小数
  const num = (v: unknown, d = 2) => { const n = Number(v); return Number.isFinite(n) ? Number(n.toFixed(d)) : 0; };
  const totalPurchase = num(purchaseList.reduce((s, p) => s + (Number(p.purchaseQuantity) || 0), 0));
  const totalArrived = num(purchaseList.reduce((s, p) => s + (Number(p.arrivedQuantity) || 0), 0));
  const totalAmount = purchaseList.reduce((s, p) => s + (Number(p.purchaseQuantity || 0) * Number(p.unitPrice || 0)), 0);
  const suppliers = Array.from(new Set(purchaseList.map((p) => String(p.supplierName || '').trim()).filter(Boolean))).join('、');
  const createDate = purchaseList.find((p) => p.createTime)?.createTime || '';

  const buildHtml = () => {
    const statusLabel = (p: MaterialPurchase) => getStatusConfig(p.status as any).text;
    const rowsHtml = purchaseList
      .map((p, i) => {
        const qty = Number(p.purchaseQuantity || 0);
        const arrived = Number(p.arrivedQuantity || 0);
        const price = Number(p.unitPrice || 0);
        return `<tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${getMaterialTypeLabel(p.materialType)}</td>
          <td>${p.materialCode || ''}</td>
          <td>${p.materialName || ''}</td>
          <td style="text-align:center">${String(p.color || '').trim() || '-'}</td>
          <td style="text-align:center">${String(p.specifications || '').trim() || '-'}</td>
          <td style="text-align:center">${p.unit || ''}</td>
          <td style="text-align:right">${qty}</td>
          <td style="text-align:right">${arrived}</td>
          <td style="text-align:right">${Number.isFinite(price) ? price.toFixed(2) : '-'}</td>
          <td style="text-align:right">${money(qty * price)}</td>
          <td>${p.supplierName || ''}</td>
          <td style="text-align:center">${statusLabel(p)}</td>
        </tr>`;
      })
      .join('');

    // 下单明细颜色矩阵
    let matrixHtml = '';
    if (matrix) {
      const thead = `<th style="background:#f5f5f5">颜色 \\ 尺码</th>${matrix.sizes.map((s) => `<th style="background:#f5f5f5;text-align:center">${s}</th>`).join('')}<th style="background:#f5f5f5;text-align:center">合计</th>`;
      const tbody = matrix.colors.length
        ? matrix.colors.map((c) => {
            const total = matrix.sizes.reduce((s, sz) => s + matrix.cell(c, sz), 0);
            return `<tr><td>${c}</td>${matrix.sizes.map((sz) => { const v = matrix.cell(c, sz); return `<td style="text-align:center">${v > 0 ? v : '-'}</td>`; }).join('')}<td style="text-align:center;font-weight:600">${total}</td></tr>`;
          }).join('')
        : `<tr><td>${color || '-'}</td>${matrix.sizes.map((sz) => { const v = matrix.cell('', sz); return `<td style="text-align:center">${v > 0 ? v : '-'}</td>`; }).join('')}<td style="text-align:center;font-weight:600">${matrix.sizes.reduce((s, sz) => s + matrix.cell('', sz), 0)}</td></tr>`;
      matrixHtml = `
        <h3 style="font-size:14px;margin:18px 0 8px;">下单明细</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px">
          <thead><tr>${thead}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>`;
    }

    const orderNoHtml = orderNo ? `<td style="padding:3px 10px"><b>订单号：</b>${orderNo}</td>` : '';

    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>采购单 ${orderNo || styleNo}</title>
<style>
  body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1f1f1f;padding:24px;font-size:13px}
  h1{text-align:center;font-size:20px;letter-spacing:8px;margin:0 0 16px;font-weight:600}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{border:1px solid #d9d9d9;padding:5px 8px}
  .info td{border:none;padding:3px 10px}
  .header{border:1px solid #d9d9d9;border-radius:4px;margin-bottom:12px}
  .cover-wrap{padding:10px}
  .cover{width:96px;height:128px;object-fit:cover;border:1px solid #eee}
  .foot{margin-top:14px;font-size:12px;color:#595959}
  .foot td{border:none;padding:2px 0}
  @media print{body{padding:0} h1{margin-top:0}}
</style></head>
<body>
  <h1>采 购 单</h1>
  <table class="info">
    <tr>
      <td style="padding:3px 10px"><b>采购单号：</b>${purchaseList.find((p) => p.purchaseNo)?.purchaseNo || '-'}</td>
      ${orderNoHtml}
      <td style="padding:3px 10px"><b>日期：</b>${createDate ? createDate.slice(0, 10) : ''}</td>
    </tr>
  </table>
  <div class="header" style="display:flex">
    <div class="cover-wrap">${styleCover ? `<img class="cover" src="${styleCover}" />` : '<div class="cover" style="background:#fafafa"></div>'}</div>
    <div style="flex:1;padding:10px 10px 10px 4px">
      <table class="info">
        <tr><td><b>款号：</b>${styleNo || '-'}</td><td><b>款名：</b>${styleName || '-'}</td></tr>
        <tr><td><b>颜色：</b>${color || '-'}</td><td><b>工厂：</b>${order?.factoryName || purchaseList.find((p) => p.factoryName)?.factoryName || '-'}</td></tr>
        <tr><td><b>物料到货率：</b>${materialArrivalRate}%</td><td><b>供应商：</b>${suppliers || '-'}</td></tr>
      </table>
    </div>
  </div>
  ${matrixHtml}
  <h3 style="font-size:14px;margin:14px 0 8px;">物料信息表（共 ${purchaseList.length} 项）</h3>
  <table>
    <thead><tr style="background:#f5f5f5">
      <th style="text-align:center">序号</th><th>物料类型</th><th>物料编码</th><th>物料名称</th>
      <th style="text-align:center">颜色</th><th style="text-align:center">规格</th><th style="text-align:center">单位</th>
      <th style="text-align:right">采购数量</th><th style="text-align:right">到货数量</th>
      <th style="text-align:right">单价</th><th style="text-align:right">金额</th><th>供应商</th><th style="text-align:center">状态</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr style="background:#fafafa;font-weight:600">
        <td colspan="7" style="text-align:right">合计</td>
        <td style="text-align:right">${totalPurchase}</td>
        <td style="text-align:right">${totalArrived}</td>
        <td style="text-align:right"></td>
        <td style="text-align:right">${money(totalAmount)}</td>
        <td></td><td></td>
      </tr>
    </tfoot>
  </table>
  <table class="foot">
    <tr><td>采购单数：${purchaseList.length} 个 · 采购总量：${totalPurchase} · 到货总量：${totalArrived} · 合计金额：${money(totalAmount)}</td></tr>
    <tr><td>备注：该采购单由系统根据物料清单自动生成，供应商与单价以实际协商为准。</td></tr>
  </table>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildHtml());
    w.document.close();
  };

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="打印采购单"
      width={960}
      footer={(
        <Space wrap>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} disabled={!purchaseList.length}>
            打印采购单
          </Button>
        </Space>
      )}
      styles={{ body: { padding: 16, overflowY: 'auto' } }}
    >
      {/* 屏幕预览：与打印内容一致的工整布局 */}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '16px 20px' }}>
        <Text style={{ display: 'block', textAlign: 'center', fontSize: 18, letterSpacing: 6, fontWeight: 600, marginBottom: 12 }}>
          采 购 单
        </Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', marginBottom: 8 }}>
          <span><b>采购单号：</b>{purchaseList.find((p) => p.purchaseNo)?.purchaseNo || '-'}</span>
          {orderNo && <span><b>订单号：</b>{orderNo}</span>}
          <span><b>日期：</b>{createDate ? createDate.slice(0, 10) : '-'}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: 10, background: 'var(--color-bg-subtle)', borderRadius: 4, marginBottom: 8 }}>
          <div style={{ width: 80, height: 106, flexShrink: 0, background: '#fafafa', border: '1px solid var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
            {styleCover ? <img src={styleCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 16px', fontSize: 13 }}>
            <span><b>款号：</b>{styleNo || '-'}</span>
            <span><b>款名：</b>{styleName || '-'}</span>
            <span><b>颜色：</b>{color || '-'}</span>
            <span><b>工厂：</b>{order?.factoryName || purchaseList.find((p) => p.factoryName)?.factoryName || '-'}</span>
            <span><b>到货率：</b>{materialArrivalRate}%</span>
            <span><b>供应商：</b>{suppliers || '-'}</span>
          </div>
        </div>

        {matrix && (
          <div style={{ marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>下单明细</Text>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-subtle)' }}>
                  <th style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'left' }}>颜色 \ 尺码</th>
                  {matrix.sizes.map((s) => <th key={s} style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center' }}>{s}</th>)}
                  <th style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center' }}>合计</th>
                </tr>
              </thead>
              <tbody>
                {matrix.colors.map((c) => {
                  const total = matrix.sizes.reduce((s, sz) => s + matrix.cell(c, sz), 0);
                  return (
                    <tr key={c}>
                      <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px' }}>{c}</td>
                      {matrix.sizes.map((sz) => { const v = matrix.cell(c, sz); return <td key={sz} style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center' }}>{v > 0 ? v : '-'}</td>; })}
                      <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center', fontWeight: 600 }}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>物料信息表（共 {purchaseList.length} 项）</Text>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-subtle)' }}>
              {['序号', '物料类型', '物料编码', '物料名称', '颜色', '规格', '单位', '采购数量', '到货数量', '单价', '金额', '供应商', '状态'].map((t) => (
                <th key={t} style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: t.includes('数量') || t === '单价' || t === '金额' || t === '序号' ? 'center' : 'left' }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {purchaseList.map((p, i) => {
              const qty = Number(p.purchaseQuantity || 0);
              const price = Number(p.unitPrice || 0);
              const cfg = getStatusConfig(p.status as any);
              return (
                <tr key={p.id || i}>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px' }}>{getMaterialTypeLabel(p.materialType)}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px' }}>{p.materialCode || '-'}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px' }}>{p.materialName || '-'}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center' }}>{String(p.color || '').trim() || '-'}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center' }}>{String(p.specifications || '').trim() || '-'}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center' }}>{p.unit || '-'}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'right' }}>{qty}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'right' }}>{Number(p.arrivedQuantity || 0)}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'right' }}>{Number.isFinite(price) ? price.toFixed(2) : '-'}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'right' }}>{money(qty * price)}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px' }}>{p.supplierName || '-'}</td>
                  <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'center' }}>
                    <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.text}</Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--color-bg-subtle)', fontWeight: 600 }}>
              <td colSpan={7} style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'right' }}>合计</td>
              <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'right' }}>{totalPurchase}</td>
              <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'right' }}>{totalArrived}</td>
              <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px' }}></td>
              <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px', textAlign: 'right' }}>{money(totalAmount)}</td>
              <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px' }}></td>
              <td style={{ border: '1px solid var(--color-border)', padding: '4px 8px' }}></td>
            </tr>
          </tfoot>
        </table>

        <Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
          采购单数：{purchaseList.length} 个 · 采购总量：{totalPurchase} · 到货总量：{totalArrived} · 合计金额：{money(totalAmount)}
        </Text>
      </div>
    </SideDrawer>
  );
};

export default PurchasePrintModal;
