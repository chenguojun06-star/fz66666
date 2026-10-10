import React, { useState } from 'react';
import { Alert, Button, Input, Select, Space, Tag, Typography, Upload } from 'antd';
import {
  DeleteOutlined, LeftOutlined, PlusOutlined, RightOutlined, StarFilled,
} from '@ant-design/icons';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import api from '@/utils/api';
import { looksLikeProductionContent, PRODUCTION_CONTENT_HINT } from '../listingCompliance';
import type { ListingContent } from '../types';

const { Text } = Typography;
const { TextArea } = Input;

/**
 * 详情页「模块内容」编辑器（每个模块一块，跟开关排在一起）。
 *
 * <p>用户原话：「不要开关在这里，内容在那边」—— 之前开关在「详情页布局」区、
 * 内容在「详情内容」「上架与商品说明」两个区，商家根本对不上哪个开关管哪段文字。
 * 现在规则只有一条：**开关在哪，内容就在哪**。
 *
 * <p>三条纪律（沿用 D-782）：
 * <ol>
 *   <li>统一走 {@link ImageUploadBox} 与 {@code /common/upload}，不另造上传通道；</li>
 *   <li>不做"不合规就拦住上传"，合规只提示；</li>
 *   <li>能自动生成的就别让运营手填（尺码表），这里只提供"想覆盖时再填"的入口。</li>
 * </ol>
 */
export interface ModuleContentCtx {
  content: ListingContent;
  setContent: (c: ListingContent) => void;
  /* 款式级字段（随底部「保存」提交到 t_style_info） */
  category: string;
  setCategory: (v: string) => void;
  categoryOptions: Array<{ value: string; label: string }>;
  fabric: string;
  setFabric: (v: string) => void;
  wash: string;
  setWash: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  remark: string;
  setRemark: (v: string) => void;
  /* 颜色图 */
  colors: string[];
  colorImages: Record<string, string>;
  setColorImages: (v: Record<string, string>) => void;
  /* 只读回显 */
  styleName: string;
  styleNo: string;
}

/* ────────────────────────── 轮播图 + 视频 ────────────────────────── */

const GalleryContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { content, setContent } = ctx;
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const patch = (p: Partial<ListingContent>) => setContent({ ...content, ...p });

  const moveImage = (idx: number, dir: -1 | 1) => {
    const next = [...content.gallery];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    patch({ gallery: next });
  };

  const doUploadVideo = async (file: File) => {
    setUploadingVideo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', fd);
      if (res.code !== 200 || !res.data) throw new Error(res.message || '视频上传失败');
      patch({ videoUrl: res.data });
    } catch {
      // 上传失败由 antd Upload 自行提示，这里不吞错也不重复弹窗
    } finally {
      setUploadingVideo(false);
    }
    return false;
  };

  return (
    <div className="shop-edit__block">
      <div className="shop-edit__field-label">轮播图</div>
      <Text type="secondary" className="shop-listing__hint">
        顾客端详情页第一屏的图片，按从左到右轮流播放。留空时自动回落「主图 + 各颜色图」。
      </Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {content.gallery.map((url, i) => (
          <div key={`${url}-${i}`} style={{ textAlign: 'center' }}>
            <ImageUploadBox value={url} onChange={() => undefined} width={92} height={92} showClear={false} />
            <div style={{ marginTop: 4 }}>
              <Tag color={i === 0 ? 'orange' : 'default'}>{i === 0 ? '第1张' : `第${i + 1}张`}</Tag>
            </div>
            <Space size={2}>
              <Button size="small" type="text" icon={<LeftOutlined />} disabled={i === 0} onClick={() => moveImage(i, -1)} />
              <Button
                size="small"
                type="text"
                icon={<RightOutlined />}
                disabled={i === content.gallery.length - 1}
                onClick={() => moveImage(i, 1)}
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => patch({ gallery: content.gallery.filter((_, k) => k !== i) })}
              />
            </Space>
          </div>
        ))}
        <ImageUploadBox
          value={null}
          onChange={(url) => { if (url) patch({ gallery: [...content.gallery, url] }); }}
          width={92}
          height={92}
          label="加图"
          showClear={false}
        />
      </div>

      <div className="shop-edit__field-label" style={{ marginTop: 14 }}>商品视频</div>
      <Text type="secondary" className="shop-listing__hint">
        服装类目顾客更愿意看视频；建议 30 秒内，只拍正面与细节。视频紧跟在轮播图下方。
      </Text>
      <div style={{ marginTop: 8 }}>
        {content.videoUrl ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <video
              src={content.videoUrl}
              controls
              style={{ width: 220, maxWidth: '100%', borderRadius: 6, background: 'var(--color-bg-subtle)' }}
            />
            <Button size="small" danger onClick={() => patch({ videoUrl: null })}>移除视频</Button>
          </Space>
        ) : (
          <Upload accept="video/mp4,video/quicktime,video/webm" showUploadList={false} beforeUpload={doUploadVideo}>
            <Button loading={uploadingVideo} icon={<PlusOutlined />}>上传视频</Button>
          </Upload>
        )}
      </div>
    </div>
  );
};

/* ────────────────────────────── 标题与货号 ────────────────────────── */

const TitleContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { content, setContent, styleName, styleNo } = ctx;
  return (
    <div className="shop-edit__block">
      <div className="shop-edit__field-label">品牌</div>
      <Input
        value={content.brand ?? ''}
        onChange={(e) => setContent({ ...content, brand: e.target.value || null })}
        placeholder="展示在商品标题下方，例如「门里门外」"
        maxLength={32}
        allowClear
      />
      <div className="shop-edit__field-label" style={{ marginTop: 14 }}>商品名 / 货号</div>
      <Text type="secondary" className="shop-listing__hint">
        自动带出，无需填写：商品名「{styleName || '（未命名）'}」取自款式名称，
        货号「{styleNo || '-'}」由系统生成。要改请去「款式资料」。
      </Text>
    </div>
  );
};

/* ────────────────────────────── 核心卖点 ────────────────────────── */

const PointsContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { content, setContent } = ctx;
  const patch = (p: Partial<ListingContent>) => setContent({ ...content, ...p });
  return (
    <div className="shop-edit__block">
      <Text type="secondary" className="shop-listing__hint">
        一条一行，顾客端在价格下方逐条展示。建议写「材质 + 工艺 + 版型」这类具体卖点，
        最多 8 条。
      </Text>
      <div style={{ marginTop: 8 }}>
        {content.points.map((p, i) => (
          <Space key={i} style={{ display: 'flex', marginBottom: 6, width: '100%' }}>
            <StarFilled style={{ color: 'var(--color-warning, #faad14)', marginTop: 8 }} />
            <Input
              value={p}
              onChange={(e) => {
                const next = [...content.points];
                next[i] = e.target.value;
                patch({ points: next });
              }}
              placeholder={`卖点 ${i + 1}，例如「97% 桑蚕丝，垂坠不易皱」`}
              maxLength={60}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => patch({ points: content.points.filter((_, k) => k !== i) })}
            />
          </Space>
        ))}
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => patch({ points: [...content.points, ''] })}
          disabled={content.points.length >= 8}
        >
          加一条
        </Button>
      </div>
    </div>
  );
};

/* ────────────────────────────── 颜色选择 ────────────────────────── */

const ColorContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { colors, colorImages, setColorImages } = ctx;
  return (
    <div className="shop-edit__block">
      <Text type="secondary" className="shop-listing__hint">
        颜色名来自 SKU（{colors.length ? colors.join('、') : '暂无'}），这里只配每个颜色的图。
        配了图，顾客在详情页点该颜色时大图会跟着换；没配则继续用轮播图。
      </Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {colors.map((c) => (
          <div key={c} style={{ textAlign: 'center' }}>
            <ImageUploadBox
              value={colorImages[c] ?? null}
              onChange={(url) => setColorImages({ ...colorImages, [c]: url ?? '' })}
              width={92}
              height={92}
              showClear
            />
            <div style={{ marginTop: 4 }}>
              <Tag color={colorImages[c] ? 'orange' : 'default'}>{c}</Tag>
            </div>
          </div>
        ))}
        {colors.length === 0 ? (
          <Text type="secondary">该款还没有颜色，先在下面「规格与价格库存」里维护 SKU。</Text>
        ) : null}
      </div>
    </div>
  );
};

/* ────────────────────────────── 商品参数 ────────────────────────── */

const ParamsContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { category, setCategory, categoryOptions, fabric, setFabric } = ctx;
  return (
    <div className="shop-edit__block">
      <div className="shop-edit__field-label">商品分类</div>
      <Select
        style={{ width: '100%' }}
        value={category || undefined}
        onChange={(v) => setCategory(v ?? '')}
        options={categoryOptions}
        placeholder="从词表里选（顾客端与平台商城按这个类目归类）"
        allowClear
        showSearch
        optionFilterProp="label"
      />
      <Text type="secondary" className="shop-listing__hint">
        统一用词表里的类目，平台商城首页才不会中英混杂（老数据里的 WOMAN / 上衣
        会显示成同一个中文类目，不会被丢掉）。
      </Text>

      <div className="shop-edit__field-label" style={{ marginTop: 14 }}>面料成分</div>
      <TextArea
        value={fabric}
        onChange={(e) => setFabric(e.target.value)}
        placeholder="如：97% 桑蚕丝；3% 氨纶。顾客端显示为「商品参数 → 面料成分」"
        maxLength={500}
        showCount
        autoSize={{ minRows: 2, maxRows: 5 }}
      />
      <Text type="secondary" className="shop-listing__hint">
        若该款在「款式资料」里已按部位录了成分明细（如上装 / 里布），顾客端会优先显示那份明细，
        这里的整段文字只在明细为空时显示。
      </Text>
    </div>
  );
};

/* ────────────────────────────── 价格说明 ────────────────────────── */

const PriceNoteContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { content, setContent } = ctx;
  return (
    <div className="shop-edit__block">
      <TextArea
        value={content.priceNote ?? ''}
        onChange={(e) => setContent({ ...content, priceNote: e.target.value || null })}
        placeholder="例如：整套一口价不含运费 / 偏远地区需补运费 / 支持 7 天无理由退换"
        maxLength={200}
        autoSize={{ minRows: 2, maxRows: 5 }}
        showCount
      />
      <Text type="secondary" className="shop-listing__hint">
        顾客端显示在商品参数之后，作为独立的价格说明区块。
      </Text>
    </div>
  );
};

/* ─────────────────────────── 详情介绍（最重的一块） ─────────────────────────── */

const DetailContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { content, setContent, desc, setDesc, remark, setRemark } = ctx;
  return (
    <div className="shop-edit__block">
      <div className="shop-edit__field-label">尺寸表</div>
      <TextArea
        value={content.sizeChart ?? ''}
        onChange={(e) => setContent({ ...content, sizeChart: e.target.value || null })}
        placeholder={'留空即自动生成，无需手填。\n想手工覆盖时按「行」填：\n衣长|59|60|61\n胸围|96|100|104\n肩宽|38|39|40'}
        maxLength={4000}
        autoSize={{ minRows: 3, maxRows: 10 }}
      />
      <Text type="secondary" className="shop-listing__hint">
        默认按 SKU 的颜色 × 尺码矩阵<b>自动生成</b>（运营零录入）。
        只有自动生成的表不对时，才在这里手工覆盖 —— 优先级：这里 &gt; 款式资料里的尺码 &gt; 自动生成。
      </Text>

      <div className="shop-edit__field-label" style={{ marginTop: 14 }}>款式详情（图文介绍）</div>
      <TextArea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="顾客端「款式详情」正文。可直接粘贴带图片的图文（支持 HTML）"
        maxLength={20000}
        showCount
        autoSize={{ minRows: 4, maxRows: 12 }}
      />

      <div className="shop-edit__field-label" style={{ marginTop: 14 }}>商品说明</div>
      <TextArea
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="展示在款式详情下方，例如版型说明、发货时效、售后承诺"
        maxLength={500}
        showCount
        autoSize={{ minRows: 3, maxRows: 8 }}
      />
      {looksLikeProductionContent(remark) || looksLikeProductionContent(desc) ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 8 }}
          message="这段会被顾客端隐藏"
          description={PRODUCTION_CONTENT_HINT}
        />
      ) : null}
    </div>
  );
};

/* ────────────────────────────── 常见问题 ────────────────────────── */

const FaqContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { content, setContent } = ctx;
  const patch = (p: Partial<ListingContent>) => setContent({ ...content, ...p });
  const setFaq = (i: number, p: { q?: string; a?: string }) => {
    patch({ faq: content.faq.map((f, k) => (k === i ? { ...f, ...p } : f)) });
  };
  return (
    <div className="shop-edit__block">
      <Text type="secondary" className="shop-listing__hint">
        顾客犹豫的点写在这里，能直接减少「尺码会偏大吗」这类咨询。最多 12 组。
      </Text>
      <div style={{ marginTop: 8 }}>
        {content.faq.map((f, i) => (
          <div
            key={i}
            style={{ marginBottom: 10, padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
          >
            <Space style={{ width: '100%', marginBottom: 4 }}>
              <Text strong>{`问题 ${i + 1}`}</Text>
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => patch({ faq: content.faq.filter((_, k) => k !== i) })}
              />
            </Space>
            <Input
              value={f.q}
              onChange={(e) => setFaq(i, { q: e.target.value })}
              placeholder="问题，例如「尺码会偏大吗？」"
              maxLength={60}
              style={{ marginBottom: 4 }}
            />
            <TextArea
              value={f.a}
              onChange={(e) => setFaq(i, { a: e.target.value })}
              placeholder="回答"
              autoSize={{ minRows: 2, maxRows: 6 }}
              maxLength={300}
            />
          </div>
        ))}
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => patch({ faq: [...content.faq, { q: '', a: '' }] })}
          disabled={content.faq.length >= 12}
        >
          加一条
        </Button>
      </div>
    </div>
  );
};

/* ────────────────────────────── 洗涤说明 ────────────────────────── */

const WashContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { wash, setWash } = ctx;
  return (
    <div className="shop-edit__block">
      <TextArea
        value={wash}
        onChange={(e) => setWash(e.target.value)}
        placeholder="如：不可漂白；40℃ 以下手洗；阴凉平铺晾干"
        maxLength={500}
        showCount
        autoSize={{ minRows: 2, maxRows: 5 }}
      />
      <Text type="secondary" className="shop-listing__hint">
        顾客端显示为独立区块。留空时会自动从「款式资料」的成分明细里找洗水备注兜底。
      </Text>
    </div>
  );
};

/**
 * 模块 → 内容编辑器。
 *
 * <p>没有内容可填的模块（价格、尺码、数量、服务承诺、评价、推荐）**不在这里登记**，
 * 由 {@link DetailModuleEditor} 显示"内容来自哪里"的说明 —— 宁可讲清楚来源，
 * 也不给一个空输入框让人以为填了会生效。
 */
export const MODULE_CONTENT: Record<string, React.FC<{ ctx: ModuleContentCtx }> | undefined> = {
  gallery: GalleryContent,
  title: TitleContent,
  points: PointsContent,
  color: ColorContent,
  params: ParamsContent,
  priceNote: PriceNoteContent,
  detail: DetailContent,
  faq: FaqContent,
  wash: WashContent,
};

export default MODULE_CONTENT;
