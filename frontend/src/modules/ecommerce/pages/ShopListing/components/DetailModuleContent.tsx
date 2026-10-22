import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Select, Space, Tag, Typography, Upload, message } from 'antd';
import {
  DeleteOutlined, LeftOutlined, PictureOutlined, PlusOutlined, RightOutlined, StarFilled,
} from '@ant-design/icons';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import DetailPageEditor from './detail-page-editor/DetailPageEditor';
import SizeChartEditor from './SizeChartEditor';
import api from '@/utils/api';
import type { DetailBlock, ListingContent } from '../types';

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
  /** D-812：款式真实 SKU 的尺码列表 —— 尺码表行名从这里带出，运营只填量体数字 */
  sizes: string[];
  /* 只读回显 */
  styleName: string;
  styleNo: string;
}

/* ────────────────────────── 轮播图 + 视频 ────────────────────────── */

const GalleryContent: React.FC<{ ctx: ModuleContentCtx }> = ({ ctx }) => {
  const { content, setContent } = ctx;
  const [uploadingVideo, setUploadingVideo] = useState(false);
  /** D-808：详情描述整条画布（图 + 文交错） */
  const [canvasOpen, setCanvasOpen] = useState(false);
  /** D-837：轮播图批量上传（点击/拖拽/Ctrl+V 三方式，与详情长图编辑器同款） */
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const patch = (p: Partial<ListingContent>) => setContent({ ...content, ...p });

  const galleryLen = Math.min(content.gallery.length, 5);

  /** 批量上传：原生 multiple input（antd beforeUpload 逐张触发不可靠），拖拽/粘贴共用这里 */
  const doUpload = async (files: File[]) => {
    if (!files.length) return;
    const room = 5 - content.gallery.length;
    if (room <= 0) {
      message.warning('轮播图最多 5 张，已达上限');
      return;
    }
    const ok = files.filter((f) => f.type.startsWith('image/'));
    if (!ok.length) {
      message.warning('请选择图片文件');
      return;
    }
    const take = ok.slice(0, room);
    if (take.length < ok.length) message.warning(`最多还能加 ${room} 张，已只取前 ${room} 张`);
    setUploading(true);
    const urls: string[] = [];
    for (const f of take) {
      try {
        const fd = new FormData();
        fd.append('file', f);
        const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', fd);
        if (res.code !== 200 || !res.data) throw new Error(res.message || '上传失败');
        urls.push(res.data);
      } catch (e) {
        message.warning(`「${f.name}」上传失败：${e instanceof Error ? e.message : '未知错误'}`);
      }
    }
    setUploading(false);
    if (urls.length) setContent({ ...content, gallery: [...content.gallery, ...urls] });
  };

  // Ctrl+V 粘贴截图批量加图；焦点在输入框里时让位给正常文本粘贴
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!imgs.length) return;
      e.preventDefault();
      void doUpload(imgs);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [doUpload]);

  // D-808：纵向详情流只看 blocks，与 gallery（顶部轮播回落）**各管一件事**。
  // 不从 gallery 派生 —— 派生会让运营改详情流时把轮播图也一起搬走。
  const blocks: DetailBlock[] = content.blocks ?? [];

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
      <div className="shop-edit__field-label">顶部轮播回落图</div>
      <Text type="secondary" className="shop-listing__hint">
        <b>只有没设主图时才会用到这里。</b>设了主图（5 张那组）后这一组不再出现在顾客端 ——
        改它看不到变化不是坏了，是它已经让位给主图。
      </Text>
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, borderRadius: 8,
          outline: dropActive ? '2px dashed var(--color-primary, #1677ff)' : '2px dashed transparent',
          outlineOffset: 6, transition: 'outline-color .15s',
        }}
        onDragOver={(e) => {
          if (uploading || !Array.from(e.dataTransfer.types).includes('Files')) return;
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDropActive(false);
        }}
        onDrop={(e) => {
          setDropActive(false);
          if (uploading) return;
          const fs = Array.from(e.dataTransfer.files ?? []);
          if (!fs.length) return;
          e.preventDefault();
          void doUpload(fs);
        }}
      >
        {content.gallery.slice(0, 5).map((url, i) => (
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
                disabled={i === Math.min(content.gallery.length, 5) - 1}
                onClick={() => moveImage(i, 1)}
              />
            </Space>
          </div>
        ))}
        {/* D-837：单张「加图」改批量三方式（点击/拖拽/粘贴），一次导入多张 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="批量上传轮播图"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            e.target.value = '';
            void doUpload(fs);
          }}
        />
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 92, height: 92, borderRadius: 6, border: '1px dashed var(--color-border, #d9d9d9)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              cursor: uploading || galleryLen >= 5 ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-secondary, #666)', background: 'var(--color-bg-subtle, #fafafa)',
            }}
            onClick={() => { if (!uploading && galleryLen < 5) fileInputRef.current?.click(); }}
            aria-label="批量加图"
          >
            <PlusOutlined />
            <span style={{ fontSize: 12 }}>{uploading ? '上传中…' : galleryLen >= 5 ? '已满 5 张' : '批量加图'}</span>
          </div>
        </div>
      </div>
      <Text type="secondary" className="shop-listing__hint" style={{ display: 'block', marginTop: 4 }}>
        点击「批量加图」、把图片<b>拖到上面</b>、或 <b>Ctrl+V 粘贴</b>截图，均可一次导入多张（最多 5 张）
      </Text>


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

      {/* D-803/D-835：详情长图逐页编辑器。挂在根节点内避免被外层 overflow 裁掉；
          D-835 起对齐竞品「批量编辑图片」：每张图一个页面，文字/尺码表/形状以覆盖元素编辑，
          保存时烘焙成最终图片。 */}
      <div className="shop-listing__detail-canvas-entry">
        <Button type="primary" size="middle" icon={<PictureOutlined />} onClick={() => setCanvasOpen(true)}>
          编辑详情长图（图文编辑器）
        </Button>
        <Text type="secondary" className="shop-listing__hint">
          像做图工具一样逐页编辑：每张详情图一个页面，可添加文字、尺码表、形状并自由排版，
          保存时自动合成进图片。PC 端与手机端用同一份内容。
          <b>编辑保存后，顾客端以这里的长图为准，「详情页内容」里的「款式详情（图文介绍）」正文不再展示。</b>
        </Text>
      </div>

      <DetailPageEditor
        open={canvasOpen}
        blocks={blocks}
        sizeChart={content.sizeChart ?? null}
        sizes={ctx.sizes}
        onChange={(next) => patch({ blocks: next })}
        onClose={() => setCanvasOpen(false)}
      />
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
        placeholder="展示在商品标题下方，例如店铺名或品牌名"
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
        一条一行，顾客端在价格下方逐条展示。建议写「材质 + 工艺 + 版型」这类具体卖点。
        {/*
          D-800：补 Amazon 官方口径。
          Amazon 卖家中心明确要求「至少 4 条卖点（Product Feature Bullets）」，
          且每条 10-255 字符、用句式片段不写句末标点。
          之前只写「最多 8 条」，运营看不出写几条才算合格 —— 现在直接给下限。
        */}
        <b style={{ color: 'var(--color-warning)' }}>建议 4-8 条</b>（亚马逊等平台要求至少 4 条）。
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
      <div className="shop-edit__field-label">尺码表（手工录入）</div>
      <SizeChartEditor
        value={content.sizeChart ?? null}
        sizes={ctx.sizes}
        onChange={(v) => setContent({ ...content, sizeChart: v })}
      />
      <Text type="secondary" className="shop-listing__hint">
        尺码名已按款式真实 SKU 带出，只需填量体数字。全部留空则不覆盖，
        顾客端按颜色 × 尺码矩阵<b>自动生成</b>。
      </Text>

      <div className="shop-edit__field-label" style={{ marginTop: 14 }}>款式详情（图文介绍）</div>
      {(content.blocks ?? []).length > 0 ? (
        <Alert
          type="info"
          showIcon
          message="款式详情已由「编辑详情长图」接管，顾客端不再展示下面的图文正文"
          description="你在「图片轮播」页签用图文编辑器排好的长图就是顾客看到的款式详情。此处正文原样保留，但暂不展示；把长图页面全部删空保存后，这段正文会恢复展示。要改图文请回「图片轮播」页签打开图文编辑器。"
        />
      ) : (
        <TextArea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="顾客端「款式详情」正文。可直接粘贴带图片的图文（支持 HTML）"
          maxLength={20000}
          showCount
          autoSize={{ minRows: 4, maxRows: 12 }}
        />
      )}
      <div className="shop-edit__field-label" style={{ marginTop: 14 }}>商品说明</div>
      <TextArea
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="展示在款式详情下方，例如版型说明、发货时效、售后承诺"
        maxLength={500}
        showCount
        autoSize={{ minRows: 3, maxRows: 8 }}
      />
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
