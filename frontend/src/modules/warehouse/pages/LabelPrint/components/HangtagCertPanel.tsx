import React from 'react';
import { Card, Checkbox, Input, InputNumber, Radio, Table, Tag, Space, Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { StyleCoverThumb } from '@/components/StyleAssets';
import type { CertificateSectionState } from '@/utils/certificateLabelPrintTemplate';
import type { HangtagSkuRow } from '../hangtagCert';
import type { OrderInfo } from '../types';

interface Props {
  selectedOrder: OrderInfo | null;
  hangCert: CertificateSectionState;
  setHangCert: (v: CertificateSectionState) => void;
  certW: number;
  setCertW: (v: number) => void;
  certH: number;
  setCertH: (v: number) => void;
  hangSkuRows: HangtagSkuRow[];
  setHangSkuRows: (v: HangtagSkuRow[]) => void;
  previewHtml: string;
  printing: boolean;
  onPrint: () => void;
}

/**
 * D-230：吊牌设置面板 —— 采用订单管理「合格证」版式。
 * 左侧：纸张尺寸 / 标题 / 多行标签值（可勾选可编辑）/ 条码
 * 右侧：实时预览（单页）
 * 底部：颜色 × 尺码 打印行，逐行设置打印张数
 */
const HangtagCertPanel: React.FC<Props> = ({
  selectedOrder,
  hangCert,
  setHangCert,
  certW,
  setCertW,
  certH,
  setCertH,
  hangSkuRows,
  setHangSkuRows,
  previewHtml,
  printing,
  onPrint,
}) => {
  const updateRow = (key: string, patch: Partial<CertificateSectionState['rows'][number]>) => {
    setHangCert({
      ...hangCert,
      rows: hangCert.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    });
  };

  const updatePrintCount = (key: string, val: number | null) => {
    setHangSkuRows(
      hangSkuRows.map((r) => (r.key === key ? { ...r, printCount: Math.max(0, val ?? 0) } : r))
    );
  };

  const totalSheets = hangSkuRows.reduce((s, r) => s + r.printCount, 0);

  return (
    <>
      {/* D-230b：吊牌顶部显示款式图 + 基础信息，让用户知道在打哪个款 */}
      {selectedOrder && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <StyleCoverThumb
              src={selectedOrder.cover || null}
              styleNo={selectedOrder.styleNo}
              color={selectedOrder.colors?.[0]}
              size={72}
              borderRadius={6}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                {selectedOrder.styleName || selectedOrder.styleNo}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                款号：{selectedOrder.styleNo || '-'} · 订单号：{selectedOrder.orderNo || '-'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {(selectedOrder.colors?.length ? `颜色：${selectedOrder.colors.join(' / ')}` : '') || '- '}
                {selectedOrder.colors?.length && selectedOrder.sizes?.length ? ' · ' : ''}
                {selectedOrder.sizes?.length ? `尺码：${selectedOrder.sizes.join(' / ')}` : ''}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card
        size="small"
        title="吊牌设置（合格证版式）"
        style={{ marginBottom: 12 }}
        extra={
          <Space size="small">
            <Radio.Group
              value={certW <= certH ? 'portrait' : 'landscape'}
              onChange={(e) => {
                if (e.target.value === 'portrait') { setCertW(70); setCertH(100); }
                else { setCertW(100); setCertH(70); }
              }}
              size="small"
            >
              <Radio.Button value="portrait">竖版</Radio.Button>
              <Radio.Button value="landscape">横版</Radio.Button>
            </Radio.Group>
          </Space>
        }
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>宽</span>
          <InputNumber min={20} max={200} value={certW} onChange={(v) => setCertW(Number(v) || 70)} suffix="mm" style={{ width: 104 }} size="small" />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>高</span>
          <InputNumber min={30} max={400} value={certH} onChange={(v) => setCertH(Number(v) || 100)} suffix="mm" style={{ width: 104 }} size="small" />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* 字段配置 */}
          <div style={{ flex: '1 1 460px', minWidth: 360 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <Checkbox
                checked={!!hangCert.titleText}
                onChange={(e) =>
                  setHangCert({ ...hangCert, titleText: e.target.checked ? hangCert.titleText || '合格证' : '' })
                }
              >
                标题
              </Checkbox>
              <Input
                size="small"
                style={{ width: 150 }}
                value={hangCert.titleText}
                onChange={(e) => setHangCert({ ...hangCert, titleText: e.target.value })}
                placeholder="合格证"
                maxLength={10}
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 4 }}>字号</span>
              <InputNumber
                size="small"
                min={0.5}
                max={2}
                step={0.05}
                value={hangCert.fontScale}
                onChange={(v) => setHangCert({ ...hangCert, fontScale: Number(v) || 1 })}
                style={{ width: 72 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {hangCert.rows.map((row) => (
                <div key={row.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Checkbox
                    checked={row.show}
                    onChange={(e) => updateRow(row.key, { show: e.target.checked })}
                  />
                  <Input
                    size="small"
                    value={row.labelText}
                    onChange={(e) => updateRow(row.key, { labelText: e.target.value })}
                    style={{ width: 92, flexShrink: 0 }}
                    maxLength={8}
                    placeholder="标签"
                  />
                  <Input
                    size="small"
                    value={row.valueText}
                    onChange={(e) =>
                      updateRow(row.key, {
                        valueText: e.target.value,
                        show: e.target.checked ? row.show : !!e.target.value.trim(),
                      })
                    }
                    placeholder={
                      row.key === 'guige'
                        ? '留空自动带码数'
                        : row.key === 'yanse'
                          ? '留空自动带颜色'
                          : '内容'
                    }
                    maxLength={60}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Checkbox
                checked={hangCert.showBarcode}
                onChange={(e) => setHangCert({ ...hangCert, showBarcode: e.target.checked })}
              >
                条形码（CODE128 可扫码）
              </Checkbox>
              <Input
                size="small"
                value={hangCert.barcodeTemplate}
                onChange={(e) => setHangCert({ ...hangCert, barcodeTemplate: e.target.value })}
                style={{ width: 220 }}
                placeholder="{款号}{颜色}{码数}"
                maxLength={40}
              />
              <Checkbox
                checked={hangCert.showBarcodeText !== false}
                onChange={(e) => setHangCert({ ...hangCert, showBarcodeText: e.target.checked })}
              >
                条码下方显示商品编码
              </Checkbox>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              勾选才打印；规格/颜色留空自动带该行的码数/颜色；条码码值支持 {'{款号}'} {'{颜色}'} {'{码数}'} {'{序号}'}
            </div>
          </div>

          {/* 实时预览 */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
              预览（首张效果 · {certW}×{certH}mm）
            </div>
            {/* D-230b：预览放大到 4.5 倍，允许滚动，不再缩成一小块 */}
            <div style={{ maxWidth: '100%', overflow: 'auto' }}>
              <iframe
                title="吊牌预览"
                srcDoc={previewHtml}
                style={{
                  width: Math.round(certW * 4.5),
                  height: Math.round(certH * 4.5),
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  background: '#fff',
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 颜色 × 尺码 打印行 */}
      <Card
        size="small"
        title="打印明细（颜色 × 尺码）"
        extra={
          <Space size="small">
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>合计 {totalSheets} 张</span>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              loading={printing}
              disabled={totalSheets === 0}
              onClick={onPrint}
            >
              打印吊牌
            </Button>
          </Space>
        }
      >
        {hangSkuRows.length === 0 ? (
          <span style={{ color: 'var(--color-text-tertiary)' }}>该订单暂无颜色尺码数据</span>
        ) : (
          <Table
            dataSource={hangSkuRows}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ y: 320 }}
            columns={[
              {
                title: '颜色',
                dataIndex: 'color',
                width: 120,
                render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
              },
              {
                title: '尺码',
                dataIndex: 'size',
                width: 110,
                render: (v: string) => <Tag>{v || '-'}</Tag>,
              },
              {
                title: '商品编码',
                dataIndex: 'sku',
                render: (v: string) => (
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-family-mono, monospace)' }}>{v}</span>
                ),
              },
              {
                title: '打印张数',
                dataIndex: 'printCount',
                width: 130,
                align: 'right' as const,
                render: (_: unknown, r: HangtagSkuRow) => (
                  <InputNumber
                    min={0}
                    max={99999}
                    value={r.printCount}
                    style={{ width: 100 }}
                    onChange={(v) => updatePrintCount(r.key, v)}
                  />
                ),
              },
            ]}
          />
        )}
        {selectedOrder && hangSkuRows.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            款号 {selectedOrder.styleNo} · 共 {hangSkuRows.length} 个颜色尺码组合，设置张数后点击右上角「打印」
          </div>
        )}
      </Card>
    </>
  );
};

export default HangtagCertPanel;
