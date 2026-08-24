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
import { translatePlateType, translateProductType } from '../helpers';

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
      {/* 打印头部：顶部文字信息（款号+款名）左对齐 */}
      <div style={{ marginBottom: 10, breakInside: 'avoid' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-gray-900)', lineHeight: '24px' }}>
          {mode === 'sample' ? '样衣资料单' : mode === 'order' ? '下单资料单' : '生产制单'}
          <span style={{ marginLeft: 12, fontSize: 13, fontWeight: 500, color: 'var(--color-gray-600)' }}>
            {styleNo}{styleName ? ` · ${styleName}` : ''}
          </span>
        </div>
      </div>
      {/* 主体：左列（图片+二维码） + 右列（信息表格） */}
      <div style={{ display: 'flex', gap: 20, padding: 16, border: '0.5px solid var(--color-zinc-300)', background: 'var(--color-bg-base)', borderRadius: 8, breakInside: 'avoid' }}>
        {/* 左侧：主图（D-085 放大）+ 二维码（图片下方） */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'flex-start', width: 128 }}>
          {resolvedCover ? (
            <Image src={getFullAuthedFileUrl(resolvedCover)} alt={styleNo}
              style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border-antd)' }} preview={{ cover: <span>预览</span> }} />
          ) : (
            <div style={{ width: 120, height: 120, borderRadius: 6, border: '1px dashed var(--color-text-quaternary)', background: 'var(--color-bg-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gray-label)', fontSize: 12 }}>无图片</div>
          )}
          {/* 二维码：主图下方，留足静区保证扫码识别 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 100, height: 100, padding: 3, border: '1px solid var(--color-border-antd)', borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
              {qrPngDataUrl
                ? <img src={qrPngDataUrl} alt="QR" style={{ width: 94, height: 94, display: 'block' }} />
                : <QRCode value={qrValue} size={94} />}
              {user?.tenantLogo || user?.logo ? <img src={(user?.tenantLogo || user?.logo) as string} alt="logo" style={{ position: 'absolute', width: 16, height: 16, borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', objectFit: 'contain', background: '#fff' }} /> : null}
            </div>
            <span style={{ fontSize: 10, color: 'var(--color-gray-label)', textAlign: 'center' }}>扫码查看</span>
          </div>
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

            // 款号信息：款号/SKC/款名/商品分类/季节分类/商品类型/设计师/商品主题/U码
            // （客户/供应商移至"客户信息"区块，勾选名称与内容对齐 D-098）
            if (options.styleInfoBlock) {
              allFields.push({ label: '款号', value: styleNo || empty });
              allFields.push({ label: 'SKC', value: (data.productionSheet as any)?.skc || empty });
              allFields.push({ label: '款名', value: styleName || empty });
              allFields.push({ label: '商品分类', value: toCategoryCn(category || (data.productionSheet as any)?.category) || empty });
              if (mode === 'sample') {
                allFields.push({ label: '季节分类', value: toSeasonCn(season || (data.productionSheet as any)?.season) || empty });
                allFields.push({ label: '商品类型', value: translateProductType((data.productionSheet as any)?.productType) });
                // 设计师：D-058 起为独立字段 designer，旧数据兜底读 sampleNo
                allFields.push({ label: '设计师', value: (data.productionSheet as any)?.designer || (data.productionSheet as any)?.sampleNo || empty });
                allFields.push({ label: '商品品牌', value: (data.productionSheet as any)?.theme || empty });
                if ((data.productionSheet as any)?.uCode) {
                  allFields.push({ label: 'U码', value: (data.productionSheet as any).uCode });
                }
              }
            }

            // 客户信息：客户/供应商/跟单员/销售渠道（名称与内容一致 D-098；
            //   板类/价格移至"版次信息"区块）
            if (options.customerInfoBlock && mode === 'sample') {
              const prodSheet = data.productionSheet as any;
              allFields.push({ label: '客户', value: prodSheet?.customerName || prodSheet?.customer || empty });
              allFields.push({ label: '供应商', value: prodSheet?.supplier || empty });
              allFields.push({ label: '跟单员', value: prodSheet?.orderType || empty });
              allFields.push({ label: '销售渠道', value: prodSheet?.salesChannel || empty });
            }

            // 下单信息（大货模式）
            if (options.customerInfoBlock && mode !== 'sample') {
              const prodSheet = data.productionSheet as any;
              allFields.push({ label: '订单号', value: orderNo || empty });
              allFields.push({ label: '销售渠道', value: prodSheet?.salesChannel || empty });
              allFields.push({ label: '下单人员', value: orderCreatorName || (extraInfo as any)?.下单人员 || empty });
              allFields.push({ label: '跟单员', value: prodSheet?.orderType || empty });
            }

            // 版次信息（样衣模式：板类/纸样师/车板师/打板价/吊牌价/销售价——打板整套信息 D-098；
            //   非样衣模式设计师改读 designer 字段（D-058），旧数据兜底 sampleNo）
            if (options.patternInfoBlock) {
              if (mode === 'sample') {
                const prodSheet = data.productionSheet as any;
                allFields.push({ label: '板类', value: translatePlateType(prodSheet?.plateType) });
                allFields.push({ label: '纸样师', value: prodSheet?.sampleSupplier || empty });
                allFields.push({ label: '车板师', value: prodSheet?.plateWorker || empty });
                allFields.push({ label: '打板价', value: formatPrice(prodSheet?.price) });
                allFields.push({ label: '吊牌价', value: formatPrice(prodSheet?.tagPrice) });
                allFields.push({ label: '销售价', value: formatPrice(prodSheet?.salesPrice) });
              } else {
                const factoryName = (data.productionSheet as any)?.factoryName || (extraInfo as any)?.加工厂 || empty;
                allFields.push({ label: '加工厂', value: factoryName });
                allFields.push({ label: '设计师', value: (data.productionSheet as any)?.designer || (data.productionSheet as any)?.sampleNo || empty });
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

            // 备注信息：面料成分 + 款式特征（AI识别）+ 是否套里 + 备注（D-098 归组：
            //   面料/工艺类辅助信息从"款号信息"移入，勾选名称与内容对齐）
            if (options.remarkBlock) {
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
              // 备注链路说明：D-058 起 remark 已在 BasicInfoSection 维护并随表单提交持久化
              // （utils.ts 已移除 delete remark 旧逻辑）。description 兜底兼容迁移前的历史数据。
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
                          {/* 值单元格允许自动换行：备注/面料成分等长文本不再被省略号截断 */}
                          <td style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{f.value}</td>
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
