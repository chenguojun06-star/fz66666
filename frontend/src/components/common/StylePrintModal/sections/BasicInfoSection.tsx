/**
 * 基本信息区块（图片 + 二维码 + 字段表）
 * 提取自 index.tsx
 * 字段合并为一张连续表格，按 options.*Block 控制显示
 */
import React from 'react';
import { Image, QRCode } from 'antd';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { toCategoryCn } from '@/utils/styleCategory';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { parseWashLabelParts } from '@/utils/washLabel';
import { toSeasonCn, PrintOptions, PrintData } from '../types';
import { translatePlateType } from '../helpers';

interface BasicInfoSectionProps {
  options: PrintOptions;
  resolvedCover: string | null;
  qrPngDataUrl: string;
  qrValue: string;
  data: PrintData;
  styleNo: string;
  styleName: string;
  category?: string;
  season?: string;
  mode: 'sample' | 'order' | 'production';
  orderNo?: string;
  orderCreatorName: string;
  extraInfo: Record<string, any>;
  user: any;
}

const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
  options, resolvedCover, qrPngDataUrl, qrValue, data,
  styleNo, styleName, category, season, mode,
  orderNo, orderCreatorName, extraInfo, user,
}) => {
  if (!options.basicInfo) return null;

  return (
    <div className="print-section">
      {/* 主体：左列（图片+二维码） + 右列（信息） */}
      <div style={{ display: 'flex', gap: 20, padding: 16, border: '0.5px solid #d0d0d0', background: 'var(--color-bg-base)', borderRadius: 8, breakInside: 'avoid' }}>
        {/* 左侧：图片 + 二维码（纵向排列） */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: 100 }}>
          {resolvedCover ? (
            <Image src={getFullAuthedFileUrl(resolvedCover)} alt={styleNo}
              style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid #e0e0e0' }} preview={{ cover: <span>预览</span> }} />
          ) : (
            <div style={{ width: 90, height: 90, borderRadius: 6, border: '1px dashed #ccc', background: 'var(--color-bg-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>无图片</div>
          )}
          {/* 二维码 */}
          <div style={{ width: 90, height: 90, padding: 4, border: '1px solid #e0e0e0', borderRadius: 6, background: 'var(--color-bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {qrPngDataUrl
              ? <img src={qrPngDataUrl} alt="QR" style={{ width: 80, height: 80, display: 'block' }} />
              : <QRCode value={qrValue} size={80} />}
            {user?.tenantLogo || user?.logo ? <img src={(user?.tenantLogo || user?.logo) as string} alt="logo" style={{ position: 'absolute', width: 20, height: 20, borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', objectFit: 'contain', background: 'var(--color-bg-base)' }} /> : null}
          </div>
          <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>扫码查看详情</div>
        </div>

        {/* 右侧：字段信息 */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(() => {
            const empty = '';
            // 面料成分：优先读 fabricComposition（单字符串），
            // 为空时从 fabricCompositionParts（JSON）解析拼接，兼容旧数据
            const prodSheet = data.productionSheet as any;
            let fabricVal = prodSheet?.fabricComposition;
            if (!fabricVal && prodSheet?.fabricCompositionParts) {
              const parts = parseWashLabelParts(prodSheet.fabricCompositionParts);
              if (parts.length === 1) {
                fabricVal = parts[0].materials;
              } else if (parts.length > 1) {
                fabricVal = parts
                  .filter(p => p.materials)
                  .map(p => `${p.part}:${p.materials}`)
                  .join('; ');
              }
            }

            // 所有字段合并到一个数组，渲染成一张连续表格
            const allFields: { label: string; value: React.ReactNode }[] = [];

            // 款式信息
            if (options.styleInfoBlock) {
              allFields.push({ label: '款号', value: styleNo || empty });
              allFields.push({ label: 'SKC', value: (data.productionSheet as any)?.skc || empty });
              allFields.push({ label: '款名', value: styleName || empty });
              allFields.push({ label: '品类', value: toCategoryCn(category || (data.productionSheet as any)?.category) || empty });
              if (mode === 'sample') {
                allFields.push({ label: '季节', value: toSeasonCn(season || (data.productionSheet as any)?.season) || empty });
                if ((data.productionSheet as any)?.uCode) {
                  allFields.push({ label: 'U码', value: (data.productionSheet as any).uCode });
                }
              }
            }

            // 客户与销售渠道信息（样衣模式）
            if (options.customerInfoBlock && mode === 'sample') {
              const prodSheet = data.productionSheet as any;
              allFields.push({ label: '销售渠道', value: prodSheet?.salesChannel || empty });
              allFields.push({ label: '跟单员', value: prodSheet?.orderType || empty });
              allFields.push({ label: '设计师', value: prodSheet?.sampleNo || empty });
              allFields.push({ label: '打板价', value: prodSheet?.price ? `¥${Number(prodSheet.price).toFixed(2)}` : empty });
            }

            // 下单信息（大货模式）
            if (options.customerInfoBlock && mode !== 'sample') {
              const prodSheet = data.productionSheet as any;
              allFields.push({ label: '订单号', value: orderNo || empty });
              allFields.push({ label: '销售渠道', value: prodSheet?.salesChannel || empty });
              allFields.push({ label: '下单人员', value: orderCreatorName || (extraInfo as any)?.下单人员 || empty });
              allFields.push({ label: '跟单员', value: prodSheet?.orderType || empty });
            }

            // 纸样/加工信息
            if (options.patternInfoBlock) {
              if (mode === 'sample') {
                allFields.push({ label: '板类', value: translatePlateType((data.productionSheet as any)?.plateType) });
                allFields.push({ label: '纸样师', value: (data.productionSheet as any)?.sampleSupplier || empty });
                allFields.push({ label: '车板师', value: (data.productionSheet as any)?.plateWorker || empty });
              } else {
                const factoryName = (data.productionSheet as any)?.factoryName || (extraInfo as any)?.加工厂 || empty;
                allFields.push({ label: '加工厂', value: factoryName });
                allFields.push({ label: '设计师', value: (data.productionSheet as any)?.sampleNo || empty });
                allFields.push({ label: '板类', value: translatePlateType((data.productionSheet as any)?.plateType) });
              }
            }

            // 时间信息
            if (options.timeInfoBlock) {
              if (mode === 'sample') {
                allFields.push({ label: '创建时间', value: (data.productionSheet as any)?.createTime ? formatDateTime((data.productionSheet as any).createTime) : empty });
                allFields.push({ label: '交板日期', value: (data.productionSheet as any)?.deliveryDate ? formatDateTime((data.productionSheet as any).deliveryDate) : empty });
                allFields.push({ label: '完成时间', value: (data.productionSheet as any)?.completedTime ? formatDateTime((data.productionSheet as any).completedTime) : empty });
              } else {
                allFields.push({ label: '交期', value: (extraInfo as any)?.交期 ? formatDateTime((extraInfo as any).交期) : empty });
                allFields.push({ label: '创建时间', value: (data.productionSheet as any)?.createTime ? formatDateTime((data.productionSheet as any).createTime) : empty });
                allFields.push({ label: '完成时间', value: (data.productionSheet as any)?.completedTime ? formatDateTime((data.productionSheet as any).completedTime) : empty });
              }
            }

            // 面料和备注
            if (options.styleInfoBlock) {
              allFields.push({ label: '面料成分', value: fabricVal || empty });
              // 是否套里：从 BOM 物料中检测 lining 类型（自动联动 BOM，无需新字段）
              const hasLining = Array.isArray(data.bom) && data.bom.some((m: any) =>
                getMaterialTypeCategory((m as any)?.materialType) === 'lining'
              );
              allFields.push({ label: '是否套里', value: hasLining ? '是' : '否' });
            }
            if (options.remarkBlock) {
              allFields.push({ label: '备注', value: (data.productionSheet as any)?.description || empty });
            }

            // 所有字段合并成一张连续表格
            const rows: { label: string; value: React.ReactNode }[][] = [];
            for (let i = 0; i < allFields.length; i += 2) {
              rows.push(allFields.slice(i, i + 2));
            }

            return (
              <table className="pt" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '38%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '38%' }} />
                </colgroup>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((f, fi) => (
                        <React.Fragment key={fi}>
                          <td className="label-cell" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</td>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</td>
                        </React.Fragment>
                      ))}
                      {row.length === 1 && (
                        <>
                          <td className="label-cell"></td>
                          <td></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      <div style={{ textAlign: 'right', marginTop: 8, color: '#999', fontSize: 12 }}>
        打印时间：{formatDateTime(new Date())}
      </div>
    </div>
  );
};

export default BasicInfoSection;
