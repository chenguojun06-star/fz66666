import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Input, Select, Space, Button, Modal, Upload, Image, Progress } from 'antd';
import { CameraOutlined, PictureOutlined, UploadOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { StyleQueryParams } from '@/types/style';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

const DEBOUNCE_MS = 300;

// ─── 以图搜款相关类型 ───────────────────────────────────────────────────
interface ImageSearchMatch {
  id: number;
  styleNo: string;
  styleName: string;
  coverUrl: string;
  similarity: number;
}

interface StyleFilterPanelProps {
  queryParams: Partial<StyleQueryParams>;
  onQueryChange: (params: Partial<StyleQueryParams>) => void;
  onSearch: () => void;
  loading?: boolean;
  extra?: React.ReactNode;
}

/**
 * 款式信息筛选面板
 * 包含款号、款名搜索（300ms 防抖）、以图搜款
 */
const StyleFilterPanel: React.FC<StyleFilterPanelProps> = ({
  queryParams,
  onQueryChange,
  onSearch,
  loading: _loading = false,
  extra
}) => {
  const navigate = useNavigate();
  const [localStyleNo, setLocalStyleNo] = useState(queryParams.styleNo || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestParamsRef = useRef(queryParams);

  // 以图搜款：弹窗状态、加载状态、上传预览、搜索结果
  const [imageSearchModalOpen, setImageSearchModalOpen] = useState(false);
  const [imageSearchLoading, setImageSearchLoading] = useState(false);
  const [imageSearchResults, setImageSearchResults] = useState<ImageSearchMatch[]>([]);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');

  useEffect(() => {
    latestParamsRef.current = queryParams;
  }, [queryParams]);

  useEffect(() => {
    const ext = queryParams.styleNo || '';
    if (ext !== localStyleNo) setLocalStyleNo(ext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams.styleNo]);

  const flushStyleNo = (value: string) => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    onQueryChange({ ...latestParamsRef.current, styleNo: value || undefined });
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);
  const progressNodeOptions = [
    { label: '全部', value: '' },
    { label: '未开始', value: '未开始' },
    { label: '纸样开发中', value: '纸样开发中' },
    { label: '纸样完成', value: '纸样完成' },
    { label: '样衣制作中', value: '样衣制作中' },
    { label: '样衣完成', value: '样衣完成' },
    { label: '开发样报废', value: '开发样报废' },
  ];

  // ─── 以图搜款：上传 + 调用接口 ─────────────────────────────────────
  const handleImageFile = useCallback(async (file: File) => {
    if (!file) return;
    // 本地预览
    const localUrl = URL.createObjectURL(file);
    setImagePreviewUrl(localUrl);
    setImageSearchResults([]);
    setImageSearchLoading(true);

    try {
      // 1. 上传图片到 COS
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      if (uploadRes?.code !== 200 || !uploadRes?.data) {
        console.warn('[StyleFilter] 图片上传失败:', uploadRes?.message);
        return;
      }
      const imageUrl = uploadRes.data as string;

      // 2. 调用以图搜款接口
      const res = await api.post('/intelligence/visual/style-search', {
        imageUrl,
        topK: 10,
      });

      // 兼容两种返回结构：res.data.results[] 或 res.data.styles[]
      const resultList = res?.code === 200 && res?.data
        ? (res.data as any).results || (res.data as any).styles || []
        : [];

      if (Array.isArray(resultList) && resultList.length > 0) {
        const matches: ImageSearchMatch[] = resultList.map((s: any, idx: number) => {
          // similarity 可能是 0-1 或 0-100 或百分比字符串，统一转为 0-100
          let sim: number;
          const raw = s.similarity ?? s.score ?? (1 - idx * 0.05);
          if (typeof raw === 'string') {
            const parsed = parseFloat(raw.replace('%', ''));
            sim = (parsed > 1 ? parsed : parsed * 100);
          } else if (raw <= 1) {
            sim = raw * 100;
          } else {
            sim = raw;
          }
          return {
            id: s.id || idx,
            styleNo: s.styleNo || s.style_no || '',
            styleName: s.styleName || s.style_name || '',
            coverUrl: s.coverUrl || s.imageUrl || s.cover_url || s.main_image || '',
            similarity: sim,
          };
        });
        setImageSearchResults(matches);
      } else {
        setImageSearchResults([]);
      }
    } catch (e) {
      console.warn('[StyleFilter] 以图搜款失败:', e);
      setImageSearchResults([]);
    } finally {
      setImageSearchLoading(false);
    }
  }, []);

  // 关闭弹窗时清理
  const closeImageSearchModal = () => {
    setImageSearchModalOpen(false);
    setImageSearchResults([]);
    setImageSearchLoading(false);
    setImagePreviewUrl('');
  };

  // 点击结果卡片跳转
  const goToStyle = (styleNo: string) => {
    if (!styleNo) return;
    closeImageSearchModal();
    navigate(`/style-info?styleNo=${encodeURIComponent(styleNo)}`);
  };

  return (
    <Card className="filter-card mb-sm">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
        {/* 左侧：搜索条件 */}
        <Space className="style-filter-inline" size={12} wrap>
          <Input
            value={localStyleNo}
            onChange={(e) => {
              const value = e.target.value;
              setLocalStyleNo(value);
              if (!value) {
                flushStyleNo('');
                onSearch();
                return;
              }
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                onQueryChange({ ...latestParamsRef.current, styleNo: value || undefined });
                onSearch();
              }, DEBOUNCE_MS);
            }}
            onPressEnter={() => {
              flushStyleNo(localStyleNo);
              onSearch();
            }}
            placeholder="搜索款号/款名"
            allowClear
            style={{ width: 220 }}
          />
          <Select
            value={queryParams.progressNode || ''}
            onChange={(value) => {
              onQueryChange({ ...queryParams, progressNode: value || undefined });
              onSearch(); // 选择后自动刷新
            }}
            options={progressNodeOptions}
            className="style-filter-status"
            placeholder="进度节点"
            allowClear
            style={{ width: 140 }}
          />
          {/* —— 以图搜款按钮 —— */}
          <Button
            icon={<CameraOutlined />}
            onClick={() => setImageSearchModalOpen(true)}
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
          >
            以图搜款
          </Button>
        </Space>

        {/* 右侧：额外的操作按钮（如新建、切换视图） */}
        {extra && <Space wrap>{extra}</Space>}
      </div>

      {/* ─── 以图搜款弹窗 ───────────────────────────────────────── */}
      <Modal
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <CameraOutlined style={{ color: 'var(--color-primary)' }} />
            以图搜款 · AI 视觉检索
          </span>
        }
        open={imageSearchModalOpen}
        onCancel={closeImageSearchModal}
        footer={null}
        width={760}
        destroyOnClose
        centered
      >
        {/* 未上传：拖拽/粘贴上传区 */}
        {!imagePreviewUrl && !imageSearchLoading && imageSearchResults.length === 0 && (
          <Upload.Dragger
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => { handleImageFile(file); return false; }}
            style={{ padding: '32px 16px' }}
          >
            <p className="ant-upload-drag-icon">
              <PictureOutlined style={{ fontSize: 48, color: 'var(--color-primary)' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽图片到此区域</p>
            <p className="ant-upload-hint">
              也可以用 <kbd style={{ padding: '1px 6px', border: '1px solid var(--color-border-antd)', borderRadius: 4, fontSize: 12 }}>Ctrl</kbd>
              +<kbd style={{ padding: '1px 6px', border: '1px solid var(--color-border-antd)', borderRadius: 4, fontSize: 12 }}>V</kbd> 粘贴图片 · 支持 JPG/PNG/WEBP
            </p>
            <div style={{ marginTop: 12 }}>
              <Button icon={<UploadOutlined />} type="primary">选择图片</Button>
            </div>
          </Upload.Dragger>
        )}

        {/* 加载中：预览 + loading */}
        {imagePreviewUrl && imageSearchLoading && (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <Image src={imagePreviewUrl} alt="search-preview" style={{ maxHeight: 260, borderRadius: 8 }} preview />
            <div style={{ marginTop: 16, fontSize: 14, color: 'var(--color-text-secondary)' }}>
              <SearchOutlined spin style={{ marginRight: 8 }} />
              正在以图搜款，AI 正在匹配视觉相似款式…
            </div>
            <Progress percent={85} status="active" showInfo={false} style={{ marginTop: 16, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }} />
          </div>
        )}

        {/* 结果：3 列网格 */}
        {!imageSearchLoading && imageSearchResults.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                共找到 <strong>{imageSearchResults.length}</strong> 个相似款式 · 按相似度降序
              </span>
              <Button size="small" onClick={() => { setImageSearchResults([]); setImagePreviewUrl(''); }} icon={<CloseOutlined />}>
                重新上传
              </Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
              {imageSearchResults.map((m) => {
                const simPct = Math.min(100, Math.max(0, Math.round(m.similarity)));
                const isHigh = simPct >= 72;
                return (
                  <Card
                    key={m.id}
                    hoverable
                    onClick={() => goToStyle(m.styleNo)}
                    bodyStyle={{ padding: 8 }}
                    style={{ borderColor: isHigh ? 'rgba(34, 197, 94, 0.35)' : undefined, cursor: 'pointer' }}
                  >
                    <div style={{ aspectRatio: '1 / 1', borderRadius: 6, overflow: 'hidden', background: 'var(--color-bg-base)', marginBottom: 8 }}>
                      {m.coverUrl ? (
                        <Image
                          src={getFullAuthedFileUrl(m.coverUrl)}
                          alt={m.styleNo}
                          preview={false}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <PictureOutlined style={{ fontSize: 32, color: 'var(--color-text-quaternary)', display: 'block', margin: '24px auto' }} />
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.styleNo || '—'}
                    </div>
                    {m.styleName && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.styleName}
                      </div>
                    )}
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        padding: '1px 6px', borderRadius: 4,
                        background: isHigh ? 'rgba(34, 197, 94, 0.12)' : 'rgba(14, 165, 233, 0.12)',
                        color: isHigh ? '#15803d' : '#0369a1',
                      }}>
                        {simPct}% 相似
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* 上传后无结果 */}
        {!imageSearchLoading && imagePreviewUrl && imageSearchResults.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <PictureOutlined style={{ fontSize: 40, color: 'var(--color-text-quaternary)' }} />
            <div style={{ marginTop: 12, fontSize: 14, color: 'var(--color-text-secondary)' }}>
              未找到视觉相似的款式
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              可尝试更换更清晰的图片或拍摄更多产品细节
            </div>
            <div style={{ marginTop: 16 }}>
              <Button onClick={() => { setImageSearchResults([]); setImagePreviewUrl(''); }}>重新上传</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default StyleFilterPanel;
