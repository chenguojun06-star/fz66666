import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Image, Upload, Button, Table, Tag, Empty, Spin, Tooltip, Space } from 'antd';
import { UploadOutlined, DeleteOutlined, PictureOutlined, SyncOutlined } from '@ant-design/icons';
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
 * - 表格布局：每行 = 颜色 + 小图（48px）+ 状态 + 行内操作（上传/更换、移除）
 * - 行内上传仅应用到该行颜色；勾选多行可批量应用同一张图片
 * - 上传/移除后即时保存，无需手动点保存
 * - 预览使用 antd 单层预览（工具栏放大/缩小/关闭全局已增强可见性）
 */
const StyleSkuColorImages: React.FC<StyleSkuColorImagesProps> = ({ styleId, styleNo, onSaved, hideHeader }) => {
  const { message: antMessage } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [colorImages, setColorImages] = useState<ColorImage[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [uploadingColor, setUploadingColor] = useState<string | null>(null);

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

  // 行内上传（仅应用到该行颜色，上传后即时保存）
  const handleUpload = useCallback(async (file: File, color: string) => {
    setUploadingColor(color);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'style-color-image');

    try {
      const res = await api.post<{ code: number; data: string; message?: string }>('/upload', formData);
      if (res.code === 200) {
        const imageUrl = res.data;
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
      } else {
        antMessage.error(res.message || '上传失败');
      }
    } catch (err) {
      antMessage.error('上传失败');
    } finally {
      setUploadingColor(null);
    }
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
          <span style={{ fontWeight: 500 }}>{color}</span>
          <Tag style={{ margin: 0 }}>{record.skuCount} 个编码</Tag>
        </Space>
      ),
    },
    {
      title: '图片',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 96,
      render: (imageUrl: string | null) =>
        imageUrl ? (
          <Image
            src={getFullAuthedFileUrl(imageUrl)}
            alt="颜色图"
            width={32}
            height={32}
            style={{ objectFit: 'contain', borderRadius: 6 }}
            preview={{ src: getFullAuthedFileUrl(imageUrl) }}
          />
        ) : (
          <Tooltip title="未上传，点击右侧「上传」按钮为该颜色配图">
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '1px dashed var(--color-border)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-quaternary)',
              }}
            >
              <PictureOutlined style={{ fontSize: 14 }} />
            </span>
          </Tooltip>
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
      width: 160,
      render: (_: unknown, record: ColorImage) => (
        <Space size={4}>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => {
              handleUpload(file, record.color);
              return false;
            }}
            disabled={uploadingColor === record.color}
          >
            <Tooltip title={record.imageUrl ? '更换该颜色的图片' : '为该颜色上传图片'}>
              <Button size="small" icon={<UploadOutlined />} loading={uploadingColor === record.color}>
                {record.imageUrl ? '更换' : '上传'}
              </Button>
            </Tooltip>
          </Upload>
          {record.imageUrl && (
            <Tooltip title="移除该颜色的图片">
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.color)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '8px 0' }}>
      {/* 头部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space size={6} wrap>
          {!hideHeader && <span style={{ fontWeight: 600 }}>颜色图片管理</span>}
          <Tag color="blue">{stats.withImage} 已配图</Tag>
          <Tag color="orange">{stats.withoutImage} 待配图</Tag>
          <Tag>{stats.total} 个颜色</Tag>
        </Space>
        <Space size={6}>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleBatchUpload}
            disabled={selectedRowKeys.length === 0 || saving}
          >
            <Tooltip title="先勾选左侧颜色行，可将同一张图片批量应用到这些颜色">
              <Button icon={<UploadOutlined />} disabled={selectedRowKeys.length === 0}>
                批量应用图片到勾选 ({selectedRowKeys.length})
              </Button>
            </Tooltip>
          </Upload>
          <Button icon={<SyncOutlined />} onClick={fetchColorImages} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 说明 */}
      <div style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--color-bg-subtle, rgba(0,0,0,0.03))', borderRadius: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        一行对应一个颜色：点击行内「上传/更换」为该颜色单独配图；勾选多行后可批量应用同一张图片。操作后自动保存。
        点击图片可放大预览（支持放大/缩小/旋转/关闭）。
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
    </div>
  );
};

export default StyleSkuColorImages;
