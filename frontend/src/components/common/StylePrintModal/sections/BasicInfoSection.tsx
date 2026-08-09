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

/**
 * 解析 extJson 为对象。与 StyleFeatureSection.tsx 中保持一致。
 * 兼容三种返回形态：字符串 / 对象 / null。
 */
function parseExtJson(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return (typeof raw === 'object') ? raw as Record<string, unknown> : {};
}

/** 价格格式化：¥12.34 / 空 */
function formatPrice(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `¥${n.toFixed(2)}` : '';
}

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
      <div style={{ display: 'flex', gap: 20, padding: 16, border: '0.5px solid var(--color-zinc-300)', background: 'var(--color-bg-base)', borderRadius: 8, breakInside: 'avoid' }}>
        {/* 左侧：图片 + 二维码（纵向排列） */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: 100 }}>
          {resolvedCover ? (
            <Image src={getFullAuthedFileUrl(resolvedCover)} alt={styleNo}
              style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border-antd)' }} preview={{ cover: <span>预览</span> }} />
          ) : (
            <div style={{ width: 90, height: 90, borderRadius: 6, border: '1px dashed var(--color-text-quaternary)', background: 'var(--color-bg-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gray-label)', fontSize: 12 }}>无图片</div>
          )}
          {/* 二维码 */}
          <div style={{ width: 90, height: 90, padding: 4, border: '1px solid var(--color-border-antd)', borderRadius: 6, background: 'var(--color-bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {qrPngDataUrl
              ? <img src={qrPngDataUrl} alt="QR" style={{ width: 80, height: 80, display: 'block' }} />
              : <QRCode value={qrValue} size={80} />}
            {user?.tenantLogo || user?.logo ? <img src={(user?.tenantLogo || user?.logo) as string} alt="logo" style={{ position: 'absolute', width: 20, height: 20, borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', objectFit: 'contain', background: 'var(--color-bg-base)' }} /> : null}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-gray-label)', textAlign: 'center' }}>扫码查看详情</div>
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

            // 款式信息（与样衣详情页 BasicInfoSection 对齐：款号/SKC/款名/品类/季节/销售渠道）
            if (options.styleInfoBlock) {
              allFields.push({ label: '款号', value: styleNo || empty });
              allFields.push({ label: 'SKC', value: (data.productionSheet as any)?.skc || empty });
              allFields.push({ label: '款名', value: styleName || empty });
              allFields.push({ label: '品类', value: toCategoryCn(category || (data.productionSheet as any)?.category) || empty });
              if (mode === 'sample') {
                allFields.push({ label: '季节', value: toSeasonCn(season || (data.productionSheet as any)?.season) || empty });
                // 销售渠道：与样衣详情页 BasicInfoSection 一致，归属款号信息区
                allFields.push({ label: '销售渠道', value: (data.productionSheet as any)?.salesChannel || empty });
                if ((data.productionSheet as any)?.uCode) {
                  allFields.push({ label: 'U码', value: (data.productionSheet as any).uCode });
                }
              }
            }

            // 客户信息（与样衣详情页 CustomerInfoSection 对齐：
            //   客户 / 跟单员 / 设计师 / 板类 / 打板价 / 吊牌价 / 销售价）
            if (options.customerInfoBlock && mode === 'sample') {
              const prodSheet = data.productionSheet as any;
              allFields.push({ label: '客户', value: prodSheet?.customerName || prodSheet?.customer || empty });
              allFields.push({ label: '跟单员', value: prodSheet?.orderType || empty });
              allFields.push({ label: '设计师', value: prodSheet?.sampleNo || empty });
              // 板类：从原"版次信息"区块移到"客户信息"区块，与详情页 CustomerInfoSection 一致
              allFields.push({ label: '板类', value: translatePlateType(prodSheet?.plateType) });
              allFields.push({ label: '打板价', value: formatPrice(prodSheet?.price) });
              allFields.push({ label: '吊牌价', value: formatPrice(prodSheet?.tagPrice) });
              allFields.push({ label: '销售价', value: formatPrice(prodSheet?.salesPrice) });
            }

            // 下单信息（大货模式）
            if (options.customerInfoBlock && mode !== 'sample') {
              const prodSheet = data.productionSheet as any;
              allFields.push({ label: '订单号', value: orderNo || empty });
              allFields.push({ label: '销售渠道', value: prodSheet?.salesChannel || empty });
              allFields.push({ label: '下单人员', value: orderCreatorName || (extraInfo as any)?.下单人员 || empty });
              allFields.push({ label: '跟单员', value: prodSheet?.orderType || empty });
            }

            // 版次信息（样衣模式：仅保留纸样师/车板师；板类已移到客户信息区块，与详情页 CustomerInfoSection 一致）
            if (options.patternInfoBlock) {
              if (mode === 'sample') {
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

            // 面料成分 + 款式特征（AI识别）+ 是否套里 + 备注
            if (options.styleInfoBlock) {
              allFields.push({ label: '面料成分', value: fabricVal || empty });
              // 款式特征（AI识别）：与样衣详情页 StyleFeatureSection 一致，从 extJson 解析
              // 仅在样衣模式下显示，避免大货模式信息过载
              if (mode === 'sample') {
                const ext = parseExtJson((data.productionSheet as any)?.extJson);
                const feat = (k: string) => {
                  const v = ext[k];
                  return typeof v === 'string' ? v.trim() : '';
                };
                const fabricFeat = feat('fabric');
                // 面料特征：若 extJson.fabric 有值且与面料成分不同则显示，避免重复
                if (fabricFeat && fabricFeat !== fabricVal) {
                  allFields.push({ label: '面料', value: fabricFeat });
                }
                const sleeveType = feat('sleeveType');
                if (sleeveType) allFields.push({ label: '袖型', value: sleeveType });
                const neckline = feat('neckline');
                if (neckline) allFields.push({ label: '领型', value: neckline });
                const version = feat('version');
                if (version) allFields.push({ label: '版型', value: version });
                const pattern = feat('pattern');
                if (pattern) allFields.push({ label: '图案', value: pattern });
                const craftStyle = feat('craftStyle');
                if (craftStyle) allFields.push({ label: '工艺风格', value: craftStyle });
              }
              // 是否套里：从 BOM 物料中检测 lining 类型（自动联动 BOM，无需新字段）
              const hasLining = Array.isArray(data.bom) && data.bom.some((m: any) =>
                getMaterialTypeCategory((m as any)?.materialType) === 'lining'
              );
              allFields.push({ label: '是否套里', value: hasLining ? '是' : '否' });
            }
            if (options.remarkBlock) {
              // 备注链路说明：样衣详情页 TimeRemarkSection 的 remark 字段保存时被删除（见 utils.ts:231），
              // 实际未持久化到后端 StyleInfo 表（后端只有 description 字段，被生产制单占用）。
              // 此处保留读取 description 作为兼容兜底，等后端补齐 remark 字段后改为读 remark。
              allFields.push({ label: '备注', value: (data.productionSheet as any)?.remark || (data.productionSheet as any)?.description || empty });
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

      <div style={{ textAlign: 'right', marginTop: 8, color: 'var(--color-gray-label)', fontSize: 12 }}>
        打印时间：{formatDateTime(new Date())}
      </div>
    </div>
  );
};

export default BasicInfoSection;
