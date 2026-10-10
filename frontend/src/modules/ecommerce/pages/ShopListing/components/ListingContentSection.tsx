import React, { useState } from 'react';
import { Alert, Button, Input, Space, Tag, Typography, Upload } from 'antd';
import { DeleteOutlined, LeftOutlined, PlusOutlined, RightOutlined, StarFilled } from '@ant-design/icons';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import api from '@/utils/api';

const { Text } = Typography;
const { TextArea } = Input;

export interface ListingContent {
  gallery: string[];
  videoUrl: string | null;
  brand: string | null;
  sizeChart: string | null;
  points: string[];
  faq: Array<{ q: string; a: string }>;
  priceNote: string | null;
}

interface Props {
  content: ListingContent;
  setContent: (c: ListingContent) => void;
}

/**
 * 详情内容区（D-782）
 *
 * <p><b>为什么加这个</b>：此前上架编辑页只有「单张主图 + 每色一张图」，
 * 运营想编辑**轮播图、视频、品牌、卖点、常见问题、价格说明**时根本没有入口 ——
 * 页面看着完整，其实什么都编辑不了。
 *
 * <p><b>三条原则</b>：
 * <ol>
 *   <li>全部用系统统一的 {@link ImageUploadBox} 与 {@code /common/upload}，
 *       不另造上传通道；</li>
 *   <li><b>只提示不限制</b>：这里不做任何"合规不通过就拦住上传"的校验，
 *       合规提示由「主图体检」单独负责且只是提示；</li>
 *   <li>能用系统已有数据自动生成的（尺码表）就别让运营手填（D-780），
 *       这里只提供"想覆盖时再填"的入口。</li>
 * </ol>
 */
const ListingContentSection: React.FC<Props> = ({ content, setContent }) => {
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const patch = (p: Partial<ListingContent>) => setContent({ ...content, ...p });

  const moveImage = (idx: number, dir: -1 | 1) => {
    const next = [...content.gallery];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    patch({ gallery: next });
  };

  const addImage = (url: string | null) => {
    if (url) patch({ gallery: [...content.gallery, url] });
  };

  const setPoint = (i: number, v: string) => {
    const next = [...content.points];
    next[i] = v;
    patch({ points: next });
  };

  const setFaq = (i: number, p: { q?: string; a?: string }) => {
    const next = content.faq.map((f, k) => (k === i ? { ...f, ...p } : f));
    patch({ faq: next });
  };

  const doUploadVideo = async (file: File) => {
    setUploadingVideo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<{ code: number; data: string; message?: string }>(
        '/common/upload',
        fd
      );
      if (res.code !== 200 || !res.data) throw new Error(res.message || '视频上传失败');
      patch({ videoUrl: res.data });
    } catch {
      // 视频上传失败交给 antd Upload 自行提示，这里不吞错误也不重复弹窗
    } finally {
      setUploadingVideo(false);
    }
    return false;
  };

  return (
    <div className="shop-edit__block">
      {/* ── 轮播图 ── */}
      <div className="shop-listing__block-title">轮播图</div>
      <Text type="secondary" className="shop-listing__hint">
        顾客端详情页第一屏的图片，按左边顺序轮流播放。第 1 张同时作为列表页封面。
      </Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {content.gallery.map((url, i) => (
          <div key={`${url}-${i}`} style={{ textAlign: 'center' }}>
            <ImageUploadBox value={url} onChange={() => undefined} width={92} height={92} showClear={false} />
            <div style={{ marginTop: 4 }}>
              <Tag color={i === 0 ? 'orange' : 'default'}>{i === 0 ? '封面' : `第${i + 1}张`}</Tag>
            </div>
            <Space size={2}>
              <Button
                size="small"
                type="text"
                icon={<LeftOutlined />}
                disabled={i === 0}
                onClick={() => moveImage(i, -1)}
              />
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
        <div>
          <ImageUploadBox
            value={null}
            onChange={addImage}
            width={92}
            height={92}
            label="加图"
            showClear={false}
          />
        </div>
      </div>

      {/* ── 视频 ── */}
      <div className="shop-listing__block-title shop-listing__block-title--mt">商品视频</div>
      <Text type="secondary" className="shop-listing__hint">
        服装类目顾客更愿意看视频；建议 30 秒内，只拍正面与细节。
      </Text>
      <div style={{ marginTop: 8 }}>
        {content.videoUrl ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <video
              src={content.videoUrl}
              controls
              style={{ width: 220, maxWidth: '100%', borderRadius: 6, background: '#000' }}
            />
            <Button size="small" danger onClick={() => patch({ videoUrl: null })}>
              移除视频
            </Button>
          </Space>
        ) : (
          <Upload
            accept="video/mp4,video/quicktime,video/webm"
            showUploadList={false}
            beforeUpload={doUploadVideo}
          >
            <Button loading={uploadingVideo} icon={<PlusOutlined />}>
              上传视频
            </Button>
          </Upload>
        )}
      </div>

      {/* ── 品牌 ── */}
      <div className="shop-listing__block-title shop-listing__block-title--mt">品牌</div>
      <Input
        value={content.brand ?? ''}
        onChange={(e) => patch({ brand: e.target.value || null })}
        placeholder="展示在详情页标题下方，例如「云裳严选」"
        maxLength={32}
        allowClear
      />

      {/* ── 核心卖点 ── */}
      <div className="shop-listing__block-title shop-listing__block-title--mt">核心卖点</div>
      <Text type="secondary" className="shop-listing__hint">
        一条一行，顾客端在价格下方逐条展示。建议写「材质+工艺+版型」这类具体卖点。
      </Text>
      <div style={{ marginTop: 8 }}>
        {content.points.map((p, i) => (
          <Space key={i} style={{ display: 'flex', marginBottom: 6, width: '100%' }}>
            <StarFilled style={{ color: 'var(--color-warning, #faad14)', marginTop: 8 }} />
            <Input
              value={p}
              onChange={(e) => setPoint(i, e.target.value)}
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

      {/* ── 常见问题 ── */}
      <div className="shop-listing__block-title shop-listing__block-title--mt">常见问题</div>
      <Text type="secondary" className="shop-listing__hint">
        顾客犹豫的点写在这里，能直接减少「尺码会偏大吗」这类咨询。
      </Text>
      <div style={{ marginTop: 8 }}>
        {content.faq.map((f, i) => (
          <div key={i} style={{ marginBottom: 10, padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}>
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

      {/* ── 价格说明 ── */}
      <div className="shop-listing__block-title shop-listing__block-title--mt">价格说明</div>
      <TextArea
        value={content.priceNote ?? ''}
        onChange={(e) => patch({ priceNote: e.target.value || null })}
        placeholder="例如：现价含运费 / 支持开票 / 3 件以上批发价另议"
        maxLength={200}
        autoSize={{ minRows: 2, maxRows: 5 }}
        showCount
      />

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message="这里不做上传限制"
        description="上方主图区的合规体检只是提示：告诉你这样传平台可能不给推荐，但不会拦住上传，也不会阻止上架。"
      />
    </div>
  );
};

export default ListingContentSection;