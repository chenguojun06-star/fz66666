import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { App, Image, Button, Table, Tag, Empty, Spin, Tooltip, Space } from 'antd';
import { UploadOutlined, DeleteOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { confirmAction } from '@/utils/confirm';

interface ColorImage {
  color: string;
  imageUrl: string | null;
  skuCount: number;
}

interface StyleSkuColorImagesProps {
  styleId: string;
  styleNo: string;
  onSaved?: () => void;
  /** 外层已提供标题（如 Modal）时隐藏内部标题行，仅保留统计标签与操作 */
  hideHeader?: boolean;
}

/**
 * 颜色图片管理（一行一颜色）
 * - 表格布局：每行 = 颜色 + 方形上传框（56px）+ 状态 + 行内操作（预览、移除）
 * - 图片格统一用 ImageUploadBox：正方形，支持点击 / 拖拽 / Ctrl+V 粘贴三种上传方式
 *   （与「尺码颜色」矩阵的上传体验保持一致，不再用 antd Upload 的按钮样式）
 * - 行内上传仅应用到该行颜色；勾选多行可批量应用同一张图片
 * - 上传/移除后即时保存，无需手动点保存
 * - 预览：点操作列的眼睛图标开 antd 大图预览（放大/缩小/旋转/关闭）
 */
const StyleSkuColorImages: React.FC<StyleSkuColorImagesProps> = ({ styleId, styleNo, onSaved, hideHeader }) => {
  const { message: antMessage } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [colorImages, setColorImages] = useState<ColorImage[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [preview, setPreview] = useState<{ open: boolean; src: string }>({ open: false, src: '' });
  const batchInputRef = useRef<HTMLInputElement>(null);

  // 获取该款所有颜色和商品编码信息
  const fetchColorImages = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: any[] }>('/style/sku/search', { styleId: Number(styleId) });
      if (res.code === 200 && res.data) {
        const colorMap = new Map<string, number>();
        for (const sku of res.data) {
          if (sku.color) {
            colorMap.set(sku.color, (colorMap.get(sku.color) || 0) + 1);
          }
        }
        const imgRes = await api.get<{ code: number; data: Record<string, string> }>(`/style/sku/color-images/${styleNo}`);
        const savedImages = imgRes.code === 200 ? imgRes.data : {};

        const colors: ColorImage[] = [];
        for (const [color, count] of colorMap) {
          colors.push({
            color,
            imageUrl: savedImages[color] || null,
            skuCount: count,
          });
        }
        colors.sort((a, b) => a.color.localeCompare(b.color, 'zh-CN'));
        setColorImages(colors);
      }
    } catch (err) {
      antMessage.error('获取颜色图片失败');
    } finally {
      setLoading(false);
    }
  }, [styleId, styleNo, antMessage]);

  useEffect(() => { fetchColorImages(); }, [fetchColorImages]);

  // 保存（可传入覆盖 map，用于上传后即时保存新状态）
  const saveImages = useCallback(async (imageMapOverride?: Record<string, string>) => {
    if (colorImages.length === 0 && !imageMapOverride) return false;
    setSaving(true);
    try {
      const imageMap: Record<string, string> = imageMapOverride ?? {};
      if (!imageMapOverride) {
        for (const c of colorImages) {
          if (c.imageUrl) imageMap[c.color] = c.imageUrl;
        }
      }
      const res = await api.put(`/style/sku/color-images/${styleId}`, imageMap);
      if (res.code === 200) {
        onSaved?.();
        return true;
      }
      antMessage.error(res.message || '保存失败');
      return false;
    } catch (err) {
      antMessage.error('保存失败');
      return false;
    } finally {
      setSaving(false);
    }
  }, [colorImages, styleId, antMessage, onSaved]);

  /** 上传到服务器（只负责拿 url，不写状态） */
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'style-color-image');
    const res = await api.post<{ code: number; data: string; message?: string }>('/upload', formData);
    if (res.code !== 200 || !res.data) throw new Error(res.message || '上传失败');
    return res.data;
  }, []);

  /** 把图片写入某个颜色并即时保存 */
  const applyImage = useCallback((color: string, imageUrl: string) => {
    const nextMap: Record<string, string> = {};
    setColorImages(prev => {
      const next = prev.map(c => (c.color === color ? { ...c, imageUrl } : c));
      for (const c of next) {
        if (c.imageUrl) nextMap[c.color] = c.imageUrl;
      }
      return next;
    });
    antMessage.success(`已为「${color}」应用图片`);
    // 即时保存（等待 state 构建完成）
    setTimeout(() => { saveImages(nextMap); }, 0);
  }, [antMessage, saveImages]);

  // 批量上传：同一张图片应用到勾选的多个颜色
  const handleBatchUpload = useCallback(async (file: File) => {
    if (selectedRowKeys.length === 0) {
      antMessage.warning('请先勾选要应用图片的颜色行');
      return false;
    }
    setSaving(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'style-color-image');

    try {
      const res = await api.post<{ code: number; data: string; message?: string }>('/upload', formData);
      if (res.code === 200) {
        const imageUrl = res.data;
        const nextMap: Record<string, string> = {};
        const keySet = new Set(selectedRowKeys.map(String));
        setColorImages(prev => {
          const next = prev.map(c => (keySet.has(c.color) ? { ...c, imageUrl } : c));
          for (const c of next) {
            if (c.imageUrl) nextMap[c.color] = c.imageUrl;
          }
          return next;
        });
        antMessage.success(`已应用到 ${selectedRowKeys.length} 个颜色`);
        setTimeout(() => { saveImages(nextMap); }, 0);
      } else {
        antMessage.error(res.message || '上传失败');
      }
    } catch (err) {
      antMessage.error('上传失败');
    } finally {
      setSaving(false);
    }
    return false;
  }, [selectedRowKeys, antMessage, saveImages]);

  // 移除单个颜色图片（即时保存）
  const handleDelete = useCallback((color: string) => {
    confirmAction(
      `确认移除「${color}」的图片？`,
      '移除后该颜色将显示为待配图',
      async () => {
        const nextMap: Record<string, string> = {};
        setColorImages(prev => {
          const next = prev.map(c => (c.color === color ? { ...c, imageUrl: null } : c));
          for (const c of next) {
            if (c.imageUrl) nextMap[c.color] = c.imageUrl;
          }
          return next;
        });
        antMessage.success(`已移除「${color}」的图片`);
        setTimeout(() => { saveImages(nextMap); }, 0);
        await Promise.resolve();
      }
    );
  }, [antMessage, saveImages]);

  // 统计
  const stats = useMemo(() => {
    const total = colorImages.length;
    const withImage = colorImages.filter(c => c.imageUrl).length;
    return { total, withImage, withoutImage: total - withImage };
  }, [colorImages]);

  const columns = [
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 180,
      render: (color: string, record: ColorImage) => (
        <Space size={8}>
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: 3,
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent-purple, #9254de) 100%)',
              flexShrink: 0,
            }}
          />
          <span className="u-fw-500">{color}</span>
          <Tag style={{ margin: 0 }}>{record.skuCount} 个编码</Tag>
        </Space>
      ),
    },
    {
      title: '图片',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 88,
      render: (_imageUrl: string | null, record: ColorImage) => (
        <ImageUploadBox
          size={56}
          label="上传"
          showClear={false}
          enableDrop
          maxSizeMB={10}
          value={record.imageUrl}
          uploadFn={uploadFile}
          onChange={(url) => { if (url) applyImage(record.color, url); }}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (_: unknown, record: ColorImage) =>
        record.imageUrl ? <Tag color="green" style={{ margin: 0 }}>已配图</Tag> : <Tag color="orange" style={{ margin: 0 }}>待配图</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: ColorImage) =>
        record.imageUrl ? (
          <Space size={4}>
            <Tooltip title="预览大图">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setPreview({ open: true, src: getFullAuthedFileUrl(record.imageUrl as string) })}
              />
            </Tooltip>
            <Tooltip title="移除该颜色的图片">
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.color)} />
            </Tooltip>
          </Space>
        ) : null,
    },
  ];

  return (
    <div className="u-p-8px0">
      {/* 头部操作栏 */}
      <div className="u-d-flex u-jc-between u-ai-center u-mb-12 u-fwrap-wrap u-gap-8">
        <Space size={6} wrap>
          {!hideHeader && <span className="u-fw-600">颜色图片管理</span>}
          <Tag color="blue">{stats.withImage} 已配图</Tag>
          <Tag color="orange">{stats.withoutImage} 待配图</Tag>
          <Tag>{stats.total} 个颜色</Tag>
        </Space>
        <Space size={6}>
          <div
            tabIndex={0}
            className="u-d-inline-flex" style={{ outline: 'none' }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleBatchUpload(f);
            }}
            onPaste={(e) => {
              const f = e.clipboardData.files?.[0];
              if (f) { e.preventDefault(); void handleBatchUpload(f); }
            }}
          >
            <input
              ref={batchInputRef}
              type="file"
              accept="image/*"
              className="u-d-none"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleBatchUpload(f);
                e.currentTarget.value = '';
              }}
            />
            <Tooltip title="先勾选左侧颜色行，可将同一张图片批量应用到这些颜色（支持拖拽/粘贴）">
              <Button
                icon={<UploadOutlined />}
                disabled={selectedRowKeys.length === 0 || saving}
                onClick={() => batchInputRef.current?.click()}
              >
                批量应用图片到勾选 ({selectedRowKeys.length})
              </Button>
            </Tooltip>
          </div>
          <Button icon={<SyncOutlined />} onClick={fetchColorImages} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 说明 */}
      <div className="u-mb-10 u-p-6px10px u-br-4 u-fs-12" style={{ background: 'var(--color-bg-subtle, rgba(0,0,0,0.03))', color: 'var(--color-text-tertiary)' }}>
        一行对应一个颜色：点击该行「图片」列的方形格子即可上传（也支持把图片拖进去、或 Ctrl+V 粘贴）；
        勾选多行后可批量应用同一张图片。操作后自动保存。点操作列的眼睛图标可放大预览。
      </div>

      {/* 颜色图片表格（一行一颜色） */}
      <Spin spinning={loading}>
        {colorImages.length === 0 ? (
          <Empty description="该款暂无颜色配置，请在尺码颜色中配置" />
        ) : (
          <Table
            size="small"
            rowKey="color"
            columns={columns}
            dataSource={colorImages}
            pagination={colorImages.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无颜色" /> }}
          />
        )}
      </Spin>

      {/* 受控大图预览（由操作列眼睛图标触发） */}
      <Image
        style={{ display: 'none' }}
        src={preview.src}
        preview={{
          open: preview.open,
          src: preview.src,
          onOpenChange: (open) => setPreview((p) => ({ ...p, open })),
        }}
      />
    </div>
  );
};

export default StyleSkuColorImages;
