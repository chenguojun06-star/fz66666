import React from 'react';
import { Card, Row, Col, Image, Divider, Space, Button, Collapse, Input, InputNumber, Typography } from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import { formatMoney } from '@/utils/format';
import { compositionFromSections, washTextFromInstructions, getDefaultDateText } from '@/utils/washLabelPrintTemplate';
import { getEffectiveCareIconCodes, CARE_ICONS } from '@/utils/careIcons';
import type { OrderInfo } from '../types';

const { Text } = Typography;

interface OrderDetailCardProps {
  selectedOrder: OrderInfo;
  selectedColor: string;
  setSelectedColor: (c: string) => void;
  selectedSize: string;
  setSelectedSize: (s: string) => void;
  coverBase64: string;
  previewHtml: string;
  ptLabel: string;
  setSelectedOrder: React.Dispatch<React.SetStateAction<OrderInfo | null>>;
  onSaveStyleInfo: () => void;
}

const OrderDetailCard: React.FC<OrderDetailCardProps> = ({
  selectedOrder,
  selectedColor,
  setSelectedColor,
  selectedSize,
  setSelectedSize,
  coverBase64,
  previewHtml,
  ptLabel,
  setSelectedOrder,
  onSaveStyleInfo,
}) => {
  const effectiveCareCodes = getEffectiveCareIconCodes(
    selectedOrder.careIconCodes,
    { washTempCode: selectedOrder.washTempCode, bleachCode: selectedOrder.bleachCode, tumbleDryCode: selectedOrder.tumbleDryCode, ironCode: selectedOrder.ironCode, dryCleanCode: selectedOrder.dryCleanCode },
    selectedOrder.washInstructions,
  );

  return (
    <Card>
      <Row gutter={24}>
        <Col span={7}>
          <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, textAlign: 'center', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-container)' }}>
            {coverBase64 ? (
              <Image src={coverBase64} style={{ maxHeight: 200, objectFit: 'contain' }} />
            ) : (
              <div style={{ color: '#ccc', fontSize: 14 }}>暂无图片</div>
            )}
          </div>
        </Col>
        <Col span={17}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{selectedOrder.styleName || selectedOrder.styleNo}</div>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>款号: <span style={{ color: 'var(--color-info)' }}>{selectedOrder.styleNo}</span></div>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>订单号: {selectedOrder.orderNo}</div>
          <Divider style={{ margin: '10px 0' }} />
          {selectedOrder.colors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>颜色</div>
              <Space wrap>{selectedOrder.colors.map(c => (
                <Button key={c} size="small" type={selectedColor === c ? 'primary' : 'default'} onClick={() => setSelectedColor(c)}>{c}</Button>
              ))}</Space>
            </div>
          )}
          {selectedOrder.sizes.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>尺码</div>
              <Space wrap>{selectedOrder.sizes.map(s => (
                <Button key={s} size="small" type={selectedSize === s ? 'primary' : 'default'} onClick={() => setSelectedSize(s)}>{s}</Button>
              ))}</Space>
            </div>
          )}
          <Divider style={{ margin: '10px 0' }} />

          <Collapse size="small" ghost items={[{
            key: 'edit', label: <span><EditOutlined style={{ marginRight: 6 }} />吊牌信息编辑</span>,
            children: (
              <div style={{ padding: '2px 0' }}>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>成分</div>
                  <Input size="small" value={selectedOrder.fabricComposition} placeholder="如：100%棉"
                    onChange={e => setSelectedOrder(o => o ? { ...o, fabricComposition: e.target.value } : o)} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>质量等级</div>
                  <Input size="small" value={selectedOrder.qualityGrade} placeholder="如：合格品"
                    onChange={e => setSelectedOrder(o => o ? { ...o, qualityGrade: e.target.value } : o)} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>执行标准</div>
                  <Input size="small" value={selectedOrder.executeStandard} placeholder="如：GB/T 2660-2017"
                    onChange={e => setSelectedOrder(o => o ? { ...o, executeStandard: e.target.value } : o)} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>安全类别</div>
                  <Input size="small" value={selectedOrder.safetyCategory} placeholder="如：GB 18401 B类"
                    onChange={e => setSelectedOrder(o => o ? { ...o, safetyCategory: e.target.value } : o)} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>检验员</div>
                  <Input size="small" value={selectedOrder.inspector} placeholder="检验员姓名"
                    onChange={e => setSelectedOrder(o => o ? { ...o, inspector: e.target.value } : o)} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>检验日期</div>
                  <Input size="small" value={selectedOrder.inspectionDate} placeholder="如：2026-05-15"
                    onChange={e => setSelectedOrder(o => o ? { ...o, inspectionDate: e.target.value } : o)} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>价格（元）</div>
                  <InputNumber size="small" min={0} step={0.01} value={selectedOrder.price ?? undefined} placeholder="如：299.00"
                    onChange={v => setSelectedOrder(o => o ? { ...o, price: v ?? 0 } : o)} style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>商品编码（U码）</div>
                  <Input size="small" value={selectedOrder.uCode} placeholder="商品条码"
                    onChange={e => setSelectedOrder(o => o ? { ...o, uCode: e.target.value } : o)} />
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => void onSaveStyleInfo()}>保存到款式资料</Button>
                </div>
              </div>
            ),
          }, {
            key: 'wash-info', label: <span>洗水唛信息（样衣设定）</span>,
            children: (
              <div style={{ padding: '2px 0' }}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>① 面料成分</div>
                  <Text style={{ fontSize: 14 }}>
                    {compositionFromSections(selectedOrder.fabricCompositionParts, selectedOrder.fabricComposition) || '未设定'}
                  </Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>② 洗涤说明</div>
                  <Text style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                    {washTextFromInstructions(selectedOrder.washInstructions, selectedOrder.fabricCompositionParts) || '未设定'}
                  </Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>③ 护理图标</div>
                  {effectiveCareCodes.length > 0 ? (
                    <Space wrap size={6}>
                      {effectiveCareCodes.map(code => {
                        const icon = CARE_ICONS[code];
                        return (
                          <div key={code} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6,
                            border: '1.5px solid var(--color-primary)',
                            background: '#e6f4ff',
                          }}>
                            <span dangerouslySetInnerHTML={{ __html: icon?.svg || '' }} style={{ display: 'inline-block', width: 22, height: 22, flexShrink: 0 }} />
                            <span style={{ fontSize: 14, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{icon?.label || code}</span>
                          </div>
                        );
                      })}
                    </Space>
                  ) : (
                    <Text style={{ fontSize: 14, color: 'var(--color-text-quaternary)' }}>未设定</Text>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>④ 生产制造</div>
                  <Text style={{ fontSize: 14 }}>MADE IN CHINA</Text>
                  <Text style={{ fontSize: 14, color: '#888', marginLeft: 12 }}>{getDefaultDateText()}</Text>
                </div>
              </div>
            ),
          }]} />

          <Divider style={{ margin: '10px 0' }} />
          <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>
            当前打印: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{ptLabel}</span>
            {' | '}SKU: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{selectedOrder.styleNo}-{selectedColor}-{selectedSize}</span>
            {selectedOrder.price ? ` | ${formatMoney(selectedOrder.price)}` : ''}
          </div>
        </Col>
      </Row>

      <Divider style={{ margin: '14px 0' }} />

      <div>
        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>{ptLabel}预览（实时更新）</div>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', background: 'var(--color-bg-base)' }}>
          <iframe srcDoc={previewHtml} style={{ width: '100%', height: 350, border: 'none' }} title="打印预览" />
        </div>
      </div>
    </Card>
  );
};

export default OrderDetailCard;
