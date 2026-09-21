import React from 'react';
import { Button, Space, Image, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FormInstance } from 'antd/es/form';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import RowActions from '@/components/common/RowActions';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatMoney } from '@/utils/format';
import { formatMaterialSpecWidth, getMaterialTypeCategory } from '@/utils/materialType';
import type { UserInfo } from '@/utils/AuthContext';
import type { MaterialInventory } from '../types';

interface UseMaterialInventoryColumnsProps {
  user: UserInfo | null;
  openInstructionFromRecord: (record: MaterialInventory) => void;
  handleInbound: (record: MaterialInventory) => void;
  rollForm: FormInstance;
  rollModal: { open: (data: { inboundId: string; materialCode: string; materialName: string }) => void };
  handleOutbound: (record: MaterialInventory) => void;
  handleToggleDisabled: (record: MaterialInventory) => void;
  handleViewDetail: (record: MaterialInventory) => void;
  handleEditSafetyStock: (record: MaterialInventory) => void;
  onPickStock?: (record: MaterialInventory) => void;
}

const compactInfoRowStyle: React.CSSProperties = {
  display: 'flex',
  fontSize: 15,
  lineHeight: '22px',
  minHeight: '22px',
};

const compactInfoLabelStyle: React.CSSProperties = {
  color: 'var(--neutral-text-disabled)',
  width: '72px',
  textAlign: 'right',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const normalizeUnit = (value?: string) => String(value || '').trim().toLowerCase();
const _isMeterUnit = (value?: string) => {
  const unit = normalizeUnit(value);
  return unit === '米' || unit === 'm' || unit === 'meter' || unit === 'meters';
};
const _isKilogramUnit = (value?: string) => {
  const unit = normalizeUnit(value);
  return unit === 'kg' || unit === '公斤' || unit === '千克' || unit === 'kilogram' || unit === 'kilograms';
};

export function useMaterialInventoryColumns({
  user,
  openInstructionFromRecord,
  handleInbound,
  rollForm,
  rollModal,
  handleOutbound,
  handleToggleDisabled,
  handleViewDetail,
  handleEditSafetyStock,
  onPickStock,
}: UseMaterialInventoryColumnsProps): ColumnsType<MaterialInventory> {
  return [
    {
      title: '图片',
      key: 'image',
      width: 72,
      align: 'center',
      render: (_, record) => (
        <div className="u-br-4 u-ov-hidden u-d-flex u-ai-center u-jc-center" style={{ width: 48, minHeight: 28, background: 'var(--color-bg-subtle)' }}>
          {record.materialImage ? (
            <Image
              src={getFullAuthedFileUrl(record.materialImage)}
              alt="物料"
              width={48}
              style={{ height: 'auto', display: 'block' }}
              preview={false}
            />
          ) : (
            <span className="u-fs-14 u-d-flex u-ai-center" style={{ color: 'var(--color-text-quaternary)', height: 48 }}>无图</span>
          )}
        </div>
      ),
    },
    {
      title: '物料信息',
      key: 'materialInfo',
      width: 280,
      render: (_, record) => (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <div className="u-d-flex u-fs-14" style={{ lineHeight: '22px', height: '22px' }}>
            <span className="u-ta-right u-fshrink-0" style={{ color: 'var(--neutral-text-disabled)', width: '60px' }}>编号：</span>
            <span className="u-fw-600" style={{ marginLeft: '8px' }}>{record.materialCode || '-'}</span>
          </div>
          <div className="u-d-flex u-fs-14" style={{ lineHeight: '22px', height: '22px' }}>
            <span className="u-ta-right u-fshrink-0" style={{ color: 'var(--neutral-text-disabled)', width: '60px' }}>名称：</span>
            <span className="u-fw-600" style={{ marginLeft: '8px' }}>{record.materialName || '-'}</span>
            {record.disabled === 1 && <Tag style={{ marginLeft: 6 }} color="default">已停用</Tag>}
          </div>
          <div className="u-d-flex u-fs-14 u-ai-center" style={{ lineHeight: '22px', height: '22px' }}>
            <span className="u-ta-right u-fshrink-0" style={{ color: 'var(--neutral-text-disabled)', width: '60px' }}>分类：</span>
            <span style={{ margin: '0 0 0 8px' }}>
              <MaterialTypeTag value={record.materialType} />
            </span>
          </div>
          <div className="u-d-flex u-fs-14" style={{ lineHeight: '22px', height: '22px' }}>
            <span className="u-ta-right u-fshrink-0" style={{ color: 'var(--neutral-text-disabled)', width: '60px' }}>颜色：</span>
            <span className="u-fw-600" style={{ marginLeft: '8px' }}>{record.color || '-'}</span>
          </div>
        </Space>
      ),
    },
    {
      title: '面料属性',
      key: 'fabricProperties',
      width: 200,
      render: (_, record) => {
        if (getMaterialTypeCategory(record.materialType) !== 'fabric') {
          return (
            <div className="u-ta-center u-fs-var--font-size-xs" style={{ color: 'var(--neutral-text-disabled)' }}>
              -
            </div>
          );
        }

        return (
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <div style={compactInfoRowStyle}>
              <span style={compactInfoLabelStyle}>规格/幅宽：</span>
              <span className="u-fw-600" style={{ marginLeft: '8px' }}>{formatMaterialSpecWidth(record.specification, record.fabricWidth)}</span>
            </div>
            <div style={compactInfoRowStyle}>
              <span style={compactInfoLabelStyle}>克重：</span>
              <span className="u-fw-600" style={{ marginLeft: '8px' }}>{record.fabricWeight || '-'}</span>
            </div>
            <div style={compactInfoRowStyle}>
              <span style={compactInfoLabelStyle}>成分：</span>
              <span className="u-fw-600" style={{ marginLeft: '8px' }} title={record.fabricComposition || '-'}>
                {record.fabricComposition || '-'}
              </span>
            </div>
            <div style={compactInfoRowStyle}>
              <span style={compactInfoLabelStyle}>单位：</span>
              <span className="u-fw-600" style={{ marginLeft: '8px' }}>{record.unit || '-'}</span>
            </div>
          </Space>
        );
      },
    },
    {
      title: '库存状态',
      key: 'stock',
      width: 260,
      render: (_, record) => {
        const availableQty = record.availableQty ?? 0;
        const inTransitQty = record.inTransitQty ?? 0;
        const lockedQty = record.lockedQty ?? 0;
        const safetyStock = record.safetyStock ?? 0;
        const isLow = availableQty < safetyStock;
        const suggestQty = Math.max(0, safetyStock * 2 - availableQty - inTransitQty);
        return (
          /* D-474：原来是 4 格网格 + 2 行小字 + 1 行警示共 8 项堆在一起，
             "领/出"两个操作还混在数据标签里（"可用库存 领""出库 出"），分不清哪个是数哪个是按钮。
             改为主数据一行（可用库存突出）+ 操作按钮独立 + 次要信息一行小字。 */
          <div style={{ width: '100%' }}>
            {/* 主数据：可用库存（大号突出，低于安全库存标红）+ 右侧操作 */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
              {/* D-474：「可用 X 米」必须一行——之前用 flex 在 antd td 里被破坏成多行，
                  改用 whiteSpace:nowrap + 纯文本 strong，浏览器无论如何都不换行 */}
              <div style={{ whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>可用 </span>
                <span style={{
                  fontSize: 17, fontWeight: 600,
                  color: isLow ? 'var(--color-error)' : 'var(--color-success)',
                }}>
                  {availableQty.toLocaleString()}
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}> {record.unit}</span>
              </div>
              {isLow && <Tag color="error" style={{ marginTop: -2, alignSelf: 'flex-start' }}>低于安全库存</Tag>}
              {/* D-474：领取/出库按钮——纯文字蓝色，不带图标 */}
              <Space size={4}>
                {onPickStock && (
                  <Button type="link" size="small" style={{ padding: 0 }}
                    onClick={() => onPickStock?.(record)}>领取</Button>
                )}
                <Button type="link" size="small" style={{ padding: 0 }}
                  onClick={() => handleOutbound(record)}>出库</Button>
              </Space>
            </div>

            {/* 次要信息：在途 / 锁定 / 安全库存 一行说完 */}
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              在途 {inTransitQty.toLocaleString()}
              <span style={{ margin: '0 4px', opacity: 0.45 }}>·</span>
              锁定 {lockedQty.toLocaleString()}
              <span style={{ margin: '0 4px', opacity: 0.45 }}>·</span>
              安全 {safetyStock.toLocaleString()} {record.unit}
            </div>

            {/* 库位 */}
            <div style={{ fontSize: 13, color: 'var(--color-text-quaternary)', marginTop: 2 }}>
              库位：{record.warehouseLocation || '-'}
            </div>

            {/* 低库存：建议补货 */}
            {isLow && (
              <div style={{
                marginTop: 4, background: 'var(--status-warning-bg)',
                border: '1px solid var(--status-warning-border)', borderRadius: 4,
                padding: '2px 6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)',
              }}>
                建议补货 <strong>{suggestQty.toLocaleString()}</strong> {record.unit}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '金额信息',
      key: 'price',
      width: 180,
      render: (_, record) => (
        // D-470：垂直间距统一为 4（原为 10），与其余列保持一致
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <div>
            <div className="u-fs-var--font-size-sm u-mb-4 u-fw-500" style={{ color: 'var(--neutral-text-disabled)' }}>单价</div>
            <div className="u-fw-700" style={{ fontSize: "var(--font-size-lg)", color: 'var(--neutral-text)' }}>
              {canViewPrice(user) ? formatMoney(record.unitPrice ?? 0) : '***'}
            </div>
            <div className="u-fs-var--font-size-xs u-mt-2" style={{ color: 'var(--neutral-text-disabled)' }}>/{record.unit}</div>
          </div>
          <div style={{
            paddingTop: 8,
            borderTop: '1px solid var(--color-border-light)'
          }}>
            <div className="u-fs-var--font-size-sm u-mb-4 u-fw-500" style={{ color: 'var(--neutral-text-disabled)' }}>库存总值</div>
            <div className="u-fw-700" style={{ fontSize: "var(--font-size-lg)", color: 'var(--neutral-text)' }}>
              {canViewPrice(user) ? `¥${Number(record.totalValue ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : '***'}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '供应商',
      key: 'supplier',
      width: 150,
      render: (_, record) => (
        <div className="u-fs-14 u-fw-500">
          <SupplierNameTooltip
            name={record.supplierName}
            contactPerson={(record as any).supplierContactPerson}
            contactPhone={(record as any).supplierContactPhone}
          />
        </div>
      ),
    },
    {
      title: '出入库记录',
      key: 'records',
      width: 200,
      render: (_, record) => (
        // D-470：垂直间距统一为 4（原为 6），与其余列保持一致
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <div style={{ padding: '4px 8px', background: 'var(--color-bg-container)' }}>
            <div className="u-fs-var--font-size-xs u-mb-2" style={{ color: 'var(--neutral-text-secondary)' }}> 最后入库</div>
            <div className="u-fs-var--font-size-xs" style={{ color: 'var(--neutral-text-secondary)' }}>{record.lastInboundDate}</div>
            {record.lastInboundBy && (
              <div className="u-fs-var--font-size-xs" style={{ color: 'var(--neutral-text-disabled)' }}>操作人: {record.lastInboundBy}</div>
            )}
          </div>
          <div style={{ padding: '4px 8px', background: 'var(--color-bg-container)' }}>
            <div className="u-fs-var--font-size-xs u-mb-2" style={{ color: 'var(--neutral-text-secondary)' }}> 最后出库</div>
            <div className="u-fs-var--font-size-xs" style={{ color: 'var(--neutral-text-secondary)' }}>{record.lastOutboundDate}</div>
            {record.lastOutboundBy && (
              <div className="u-fs-var--font-size-xs" style={{ color: 'var(--neutral-text-disabled)' }}>操作人: {record.lastOutboundBy}</div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: '备注',
      key: 'remark',
      width: 200,
      render: (_, record) => (
        <div className="u-fs-var--font-size-sm" style={{ color: 'var(--neutral-text-secondary)', lineHeight: 1.5 }}>
          {record.remark || '-'}
        </div>
      ),
    },
    {
      title: '操作',
      width: 180,
      render: (_, record) => {
        // D-117：已停用物料禁止库存变动类操作，仅保留 启用/详情
        const isDisabledMaterial = record.disabled === 1;
        const disabledHint = '物料已停用，请先启用';
        return (
          <RowActions
            revealOnHover
            actions={[
              {
                key: 'instruction',
                label: '采购指令',
                disabled: isDisabledMaterial,
                title: isDisabledMaterial ? disabledHint : undefined,
                onClick: () => openInstructionFromRecord(record)
              },
              {
                key: 'inbound',
                label: '入库',
                primary: true,
                disabled: isDisabledMaterial,
                title: isDisabledMaterial ? disabledHint : undefined,
                onClick: () => handleInbound(record)
              },
              {
                key: 'rollLabel',
                label: '料卷标签',
                disabled: isDisabledMaterial,
                title: isDisabledMaterial ? disabledHint : undefined,
                onClick: () => {
                  rollModal.open({ inboundId: '', materialCode: record.materialCode, materialName: record.materialName });
                  requestAnimationFrame(() => {
                    rollForm.setFieldsValue({ rollCount: 1, quantityPerRoll: undefined, unit: '件' });
                  });
                }
              },
              {
                key: 'outbound',
                label: '出库',
                disabled: isDisabledMaterial,
                title: isDisabledMaterial ? disabledHint : undefined,
                onClick: () => handleOutbound(record)
              },
              {
                key: 'toggleDisabled',
                label: record.disabled === 1 ? '启用' : '停用',
                danger: record.disabled !== 1,
                onClick: () => handleToggleDisabled(record)
              },
              {
                key: 'detail',
                label: '详情',
                onClick: () => handleViewDetail(record)
              },
              {
                key: 'safetyStock',
                label: '安全库存',
                disabled: isDisabledMaterial,
                title: isDisabledMaterial ? disabledHint : undefined,
                onClick: () => handleEditSafetyStock(record)
              }
            ]}
          />
        );
      },
    },
  ];
}
