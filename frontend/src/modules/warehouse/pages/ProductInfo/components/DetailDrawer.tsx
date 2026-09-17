import React, { useState } from 'react';
import { Button, Drawer, Descriptions, Form, Space, Popconfirm, Table, Tag } from 'antd';
import { EditOutlined, LoginOutlined, PrinterOutlined, SwapOutlined } from '@ant-design/icons';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import { toCategoryCn, toSeasonCn } from '@/utils/styleCategory';
import { formatMoney } from '@/utils/format';
import { StyleInfo } from '@/types/style';
import { SkuRow } from '../types';
import { buildSkuColumns } from '../columns';
import {
  ProductBaseFields,
  ProductAttrFields,
  ProductStatusFields,
  ProductCoverUpload,
} from './ProductInfoForm';
// D-439：颜色规格 / 图片附件直接复用样衣开发（款式资料）同源组件，一套体验
import StyleSkuTab from '@/modules/basic/pages/StyleInfo/components/StyleSkuTab';
import StyleAttachmentTab from '@/modules/basic/pages/StyleInfo/components/StyleAttachmentTab';

interface DetailDrawerProps {
  open: boolean;
  drawerRecord: StyleInfo | null;
  drawerLoading: boolean;
  skuList: SkuRow[];
  skuLoading: boolean;
  onClose: () => void;
  onEdit: (record: StyleInfo) => void;
  onInbound: (record: StyleInfo) => void;
  onPrintTag: (record: StyleInfo) => void;
  onToggleStatus: (record: StyleInfo) => void;
  /** D-438：编辑态融入抽屉——true 时抽屉内容原地切换为表单，不再弹第二个窗口 */
  editing?: boolean;
  form?: any;
  coverUrl?: string | null;
  setCoverUrl?: (v: string | null) => void;
  submitLoading?: boolean;
  isMobile?: boolean;
  onSave?: () => void;
  onCancelEdit?: () => void;
  /** D-439：颜色规格（StyleSkuTab）内部保存后刷新 SKU 列表 */
  onSkuRefresh?: () => void;
}

const SECTIONS = [
  { key: 'base', label: '基础信息' },
  { key: 'images', label: '图片附件' },
  { key: 'attrs', label: '类目属性' },
  { key: 'sku', label: '颜色规格' },
  { key: 'misc', label: '其它设置' },
] as const;

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <div id={id} style={{ marginBottom: 28, scrollMarginTop: 12 }}>
    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--color-border, #e5e5ea)' }}>
      {title}
    </div>
    {children}
  </div>
);

/** D-439：左侧锚点导航（对齐参考稿"编辑商品(款)"分区结构） */
const SectionNav: React.FC<{ active: string; onGo: (key: string) => void }> = ({ active, onGo }) => (
  <div style={{ width: 140, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
    {SECTIONS.map((s) => (
      <div
        key={s.key}
        onClick={() => onGo(s.key)}
        style={{
          padding: '8px 12px',
          marginBottom: 2,
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: active === s.key ? 600 : 400,
          color: active === s.key ? 'var(--color-primary, #2D7FF9)' : 'var(--color-text-secondary, #6e6e73)',
          background: active === s.key ? 'var(--color-primary-bg, #e8f2ff)' : 'transparent',
        }}
      >
        {s.label}
      </div>
    ))}
  </div>
);

const DetailDrawer: React.FC<DetailDrawerProps> = ({
  open,
  drawerRecord,
  drawerLoading,
  skuList,
  skuLoading,
  onClose,
  onEdit,
  onInbound,
  onPrintTag,
  onToggleStatus,
  editing = false,
  form,
  coverUrl,
  setCoverUrl,
  submitLoading = false,
  isMobile = false,
  onSave,
  onCancelEdit,
  onSkuRefresh,
}) => {
  const d = drawerRecord;
  const [activeSection, setActiveSection] = useState('base');

  const goSection = (key: string) => {
    setActiveSection(key);
    const el = document.getElementById(`pinfo-sec-${key}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Drawer
      title={d ? `${editing ? '编辑 - ' : ''}${d.styleNo} — ${d.styleName}` : '商品详情'}
      open={open}
      onClose={onClose}
      styles={{ wrapper: { width: '85%' } }}
      loading={drawerLoading}
      extra={
        d ? (
          editing ? (
            <Space>
              <Button onClick={onCancelEdit}>取消</Button>
              <Button type="primary" loading={submitLoading} onClick={onSave}>保存</Button>
            </Space>
          ) : (
            <Space>
              {/* D-438：编辑直接在本抽屉内完成，不再弹出编辑窗口 */}
              <Button icon={<EditOutlined />} onClick={() => { onEdit(d); }}>编辑</Button>
              <Button icon={<LoginOutlined />} onClick={() => onInbound(d)}>入库</Button>
              <Button icon={<PrinterOutlined />} onClick={() => onPrintTag(d)}>吊牌</Button>
              <Popconfirm
                title={d.status === 'ENABLED' ? '确定停用该成品？' : '确定启用该成品？'}
                onConfirm={() => onToggleStatus(d)}
              >
                <Button icon={<SwapOutlined />}>{d.status === 'ENABLED' ? '停用' : '启用'}</Button>
              </Popconfirm>
            </Space>
          )
        ) : undefined
      }
    >
      {d && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <SectionNav active={activeSection} onGo={goSection} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing && form ? (
              /* ===== 编辑态：五分区表单（对齐参考稿"编辑商品(款)"） ===== */
              <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'} component="div">
                <Section id="pinfo-sec-base" title="基础信息">
                  <ProductBaseFields />
                </Section>
                <Section id="pinfo-sec-images" title="图片附件">
                  <ProductCoverUpload coverUrl={coverUrl ?? null} setCoverUrl={setCoverUrl || (() => {})} editingItem={d} />
                  <div className="u-fw-600 u-fs-13 u-mb-8">款式附件</div>
                  <StyleAttachmentTab styleId={d.id!} styleNo={d.styleNo} />
                </Section>
                <Section id="pinfo-sec-attrs" title="类目属性">
                  <ProductAttrFields />
                </Section>
                <Section id="pinfo-sec-sku" title="颜色规格">
                  <StyleSkuTab styleId={String(d.id)} styleNo={d.styleNo} onRefresh={onSkuRefresh} />
                  <div className="u-fs-12 u-mt-8" style={{ color: 'var(--color-text-tertiary)' }}>
                    颜色规格与样衣开发同源，此处编辑即时保存；「保存」按钮仅提交基础信息与类目属性
                  </div>
                </Section>
                <Section id="pinfo-sec-misc" title="其它设置">
                  <ProductStatusFields />
                </Section>
              </Form>
            ) : (
              /* ===== 查看态：同结构五分区 ===== */
              <>
                <Section id="pinfo-sec-base" title="基础信息">
                  <Descriptions column={3} size="small" bordered>
                    <Descriptions.Item label="款号">{d.styleNo}</Descriptions.Item>
                    <Descriptions.Item label="款名">{d.styleName}</Descriptions.Item>
                    <Descriptions.Item label="品类">{toCategoryCn(d.category)}</Descriptions.Item>
                    <Descriptions.Item label="季节">{toSeasonCn(d.season)}</Descriptions.Item>
                    <Descriptions.Item label="SKC">{String(d.skc ?? '-')}</Descriptions.Item>
                    <Descriptions.Item label="U编码">{String(d.uCode ?? '-')}</Descriptions.Item>
                    <Descriptions.Item label="单价">{d.price != null ? formatMoney(d.price) : '-'}</Descriptions.Item>
                    <Descriptions.Item label="生产周期">{d.cycle ? `${d.cycle}天` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="客户">{String(d.customer ?? '-')}</Descriptions.Item>
                  </Descriptions>
                </Section>

                <Section id="pinfo-sec-images" title="图片附件">
                  {d.cover && (
                    <div className="u-ta-center u-mb-16">
                      <AttachmentThumb
                        styleId={d.id!}
                        cover={d.cover}
                        width="100%"
                        height={200}
                        borderRadius={8}
                        imageStyle={{ objectFit: 'contain' }}
                      />
                    </div>
                  )}
                  <StyleAttachmentTab styleId={d.id!} styleNo={d.styleNo} readOnly />
                </Section>

                <Section id="pinfo-sec-attrs" title="类目属性">
                  <Descriptions column={3} size="small" bordered>
                    <Descriptions.Item label="成分">{String(d.fabricComposition ?? '-')}</Descriptions.Item>
                    <Descriptions.Item label="质量等级">{String(d.qualityGrade ?? '-')}</Descriptions.Item>
                    <Descriptions.Item label="执行标准">{String(d.executeStandard ?? '-')}</Descriptions.Item>
                    <Descriptions.Item label="安全类别">{String(d.safetyCategory ?? '-')}</Descriptions.Item>
                    <Descriptions.Item label="检验员">{String(d.inspector ?? '-')}</Descriptions.Item>
                    <Descriptions.Item label="洗涤说明">{String(d.washInstructions ?? '-')}</Descriptions.Item>
                    <Descriptions.Item label="描述" span={3}>{String(d.description ?? '-')}</Descriptions.Item>
                  </Descriptions>
                </Section>

                <Section id="pinfo-sec-sku" title="颜色规格">
                  {skuLoading ? (
                    <div className="u-ta-center u-p-24" style={{ color: 'var(--color-text-tertiary)' }}>加载中...</div>
                  ) : skuList.length > 0 ? (
                    <Table<SkuRow>
                      columns={buildSkuColumns()}
                      dataSource={skuList}
                      rowKey={(r) => String(r.id || r.skuCode)}
                      size="small"
                      pagination={false}
                      bordered
                      style={{ marginBottom: 8 }}
                    />
                  ) : (
                    <div className="u-ta-center u-p-16 u-br-8" style={{ color: 'var(--color-text-tertiary)', background: 'var(--color-bg-subtle)' }}>
                      暂无商品编码数据，可在「编辑 → 颜色规格」中添加
                    </div>
                  )}
                </Section>

                <Section id="pinfo-sec-misc" title="其它设置">
                  <Descriptions column={3} size="small" bordered>
                    <Descriptions.Item label="商品状态">
                      <span style={{ color: d.status === 'ENABLED' ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: 500 }}>
                        {d.status === 'ENABLED' ? '启用' : d.status === 'DISABLED' ? '停用' : d.status === 'SCRAPPED' ? '已报废' : d.status || '-'}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="下单次数">{d.orderCount != null ? `${d.orderCount}次` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="入库总量">{d.totalWarehousedQuantity != null ? `${d.totalWarehousedQuantity}` : '-'}</Descriptions.Item>
                  </Descriptions>
                </Section>
              </>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
};

export default DetailDrawer;
