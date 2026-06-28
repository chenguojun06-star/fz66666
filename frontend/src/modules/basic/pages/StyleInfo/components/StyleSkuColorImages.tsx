import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Card, Row, Col, Image, Upload, Button, Modal, Space, message, Empty, Tag, Checkbox, Spin, Tooltip } from 'antd';
import { UploadOutlined, DeleteOutlined, SaveOutlined, PictureOutlined, SyncOutlined, CheckSquareOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { confirmAction } from '@/utils/confirm';

interface ColorImage {
  color: string;
  imageUrl: string | null;
  skuCount: number;
  checked?: boolean;
}

interface StyleSkuColorImagesProps {
  styleId: string;
  styleNo: string;
  onSaved?: () => void;
}

const StyleSkuColorImages: React.FC<StyleSkuColorImagesProps> = ({ styleId, styleNo, onSaved }) => {
  const { message: antMessage } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [colorImages, setColorImages] = useState<ColorImage[]>([]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [uploadingColor, setUploadingColor] = useState<string | null>(null);

  // 获取该款所有颜色和SKU信息
  const fetchColorImages = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      // 获取SKU列表
      const res = await api.post<{ code: number; data: any[] }>('/style/sku/list-by-style', { styleId: Number(styleId) });
      if (res.code === 200 && res.data) {
        // 按颜色分组统计SKU数量
        const colorMap = new Map<string, number>();
        for (const sku of res.data) {
          if (sku.color) {
            colorMap.set(sku.color, (colorMap.get(sku.color) || 0) + 1);
          }
        }
        // 获取已保存的颜色图片
        const imgRes = await api.get<{ code: number; data: Record<string, string> }>(`/style/sku/color-images/${styleNo}`);
        const savedImages = imgRes.code === 200 ? imgRes.data : {};

        // 合并数据
        const colors: ColorImage[] = [];
        for (const [color, count] of colorMap) {
          colors.push({
            color,
            imageUrl: savedImages[color] || null,
            skuCount: count,
          });
        }
        // 按颜色排序
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

  // 上传图片
  const handleUpload = useCallback(async (file: File, color: string) => {
    setUploadingColor(color);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'style-color-image');

    try {
      const res = await api.post<{ code: number; data: string; message?: string }>('/upload', formData);
      if (res.code === 200) {
        const imageUrl = res.data;
        setColorImages(prev => prev.map(c =>
          c.color === color ? { ...c, imageUrl } : c
        ));
        antMessage.success(`${color} 图片上传成功`);
      } else {
        antMessage.error(res.message || '上传失败');
      }
    } catch (err) {
      antMessage.error('上传失败');
    } finally {
      setUploadingColor(null);
    }
  }, [antMessage]);

  // 批量上传（同图片批量应用）
  const handleBatchUpload = useCallback(async (file: File) => {
    if (selectedColors.size === 0) {
      antMessage.warning('请先选择要应用图片的颜色');
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
        setColorImages(prev => prev.map(c =>
          selectedColors.has(c.color) ? { ...c, imageUrl } : c
        ));
        antMessage.success(`已应用到 ${selectedColors.size} 个颜色`);
        // 自动保存
        await saveImages();
      } else {
        antMessage.error(res.message || '上传失败');
      }
    } catch (err) {
      antMessage.error('上传失败');
    } finally {
      setSaving(false);
    }
    return false; // 阻止默认上传
  }, [selectedColors, antMessage]);

  // 保存所有图片
  const saveImages = useCallback(async () => {
    if (colorImages.length === 0) return;
    setSaving(true);
    try {
      const imageMap: Record<string, string> = {};
      for (const c of colorImages) {
        if (c.imageUrl) {
          imageMap[c.color] = c.imageUrl;
        }
      }
      const res = await api.put(`/style/sku/color-images/${styleId}`, imageMap);
      if (res.code === 200) {
        antMessage.success('保存成功');
        onSaved?.();
      } else {
        antMessage.error(res.message || '保存失败');
      }
    } catch (err) {
      antMessage.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [colorImages, styleId, antMessage, onSaved]);

  // 删除单个颜色图片
  const handleDelete = useCallback((color: string) => {
    confirmAction(
      `确认删除 ${color} 的图片？`,
      '删除后需要重新上传',
      async () => {
        setColorImages(prev => prev.map(c =>
          c.color === color ? { ...c, imageUrl: null } : c
        ));
      }
    );
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedColors.size === colorImages.length) {
      setSelectedColors(new Set());
    } else {
      setSelectedColors(new Set(colorImages.map(c => c.color)));
    }
  }, [colorImages, selectedColors.size]);

  // 切换单个选中
  const toggleColor = useCallback((color: string) => {
    setSelectedColors(prev => {
      const next = new Set(prev);
      if (next.has(color)) {
        next.delete(color);
      } else {
        next.add(color);
      }
      return next;
    });
  }, []);

  // 统计
  const stats = useMemo(() => {
    const total = colorImages.length;
    const withImage = colorImages.filter(c => c.imageUrl).length;
    const withoutImage = total - withImage;
    return { total, withImage, withoutImage };
  }, [colorImages]);

  return (
    <div style={{ padding: '8px 0' }}>
      {/* 头部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <span style={{ fontWeight: 600 }}>颜色图片管理</span>
          <Tag color="blue">{stats.withImage} 已配图</Tag>
          <Tag color="orange">{stats.withoutImage} 待配图</Tag>
          <Tag>{stats.total} 个颜色</Tag>
        </Space>
        <Space>
          <Checkbox
            checked={selectedColors.size === stats.total && stats.total > 0}
            indeterminate={selectedColors.size > 0 && selectedColors.size < stats.total}
            onChange={toggleSelectAll}
          >
            全选 ({selectedColors.size})
          </Checkbox>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleBatchUpload}
            disabled={selectedColors.size === 0 || saving}
          >
            <Button icon={<UploadOutlined />} disabled={selectedColors.size === 0}>
              批量应用图片到选中 ({selectedColors.size})
            </Button>
          </Upload>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={saveImages}
            loading={saving}
          >
            保存全部
          </Button>
          <Button icon={<SyncOutlined />} onClick={fetchColorImages} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 说明：仅保留核心操作提示 */}
      <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--color-bg-subtle)', borderRadius: 4, fontSize: 12, color: '#666' }}>
        勾选颜色后可批量应用同一张图片，也可以点击单个颜色上传专属图片。
      </div>

      {/* 颜色图片网格 */}
      <Spin spinning={loading}>
        {colorImages.length === 0 ? (
          <Empty description="该款暂无颜色配置，请在尺码颜色中配置" />
        ) : (
          <Row gutter={[16, 16]}>
            {colorImages.map(item => (
              <Col key={item.color} span={6}>
                <Card
                  size="small"
                  hoverable
                  style={{
                    border: selectedColors.has(item.color) ? '2px solid var(--color-info)' : '1px solid var(--color-border-light)',
                    position: 'relative',
                  }}
                  cover={
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-container)', position: 'relative' }}>
                      <Checkbox
                        checked={selectedColors.has(item.color)}
                        onChange={() => toggleColor(item.color)}
                        style={{ position: 'absolute', top: 8, left: 8 }}
                      />
                      {uploadingColor === item.color ? (
                        <Spin tip="上传中..." />
                      ) : item.imageUrl ? (
                        <Image
                          src={getFullAuthedFileUrl(item.imageUrl)}
                          alt={item.color}
                          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                          preview={{ mask: <span>点击预览</span> }}
                          onClick={() => {
                            setPreviewImage(getFullAuthedFileUrl(item.imageUrl!));
                            setPreviewVisible(true);
                          }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#ccc' }}>
                          <PictureOutlined style={{ fontSize: 48 }} />
                          <div style={{ marginTop: 8 }}>未上传</div>
                        </div>
                      )}
                    </div>
                  }
                  actions={[
                    <Tooltip title="上传/更换图片" key="upload">
                      <Upload
                        accept="image/*"
                        showUploadList={false}
                        beforeUpload={(file) => {
                          handleUpload(file, item.color);
                          return false;
                        }}
                        disabled={uploadingColor === item.color}
                      >
                          <Button type="text" icon={<UploadOutlined />} loading={uploadingColor === item.color}>
                          </Button>
                      </Upload>
                    </Tooltip>,
                    <Tooltip title="删除图片" key="delete">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(item.color)}
                        disabled={!item.imageUrl}
                      />
                    </Tooltip>,
                  ]}
                >
                  <Card.Meta
                    title={item.color}
                    description={
                      <Space>
                        <Tag>{item.skuCount} SKU</Tag>
                        {item.imageUrl ? (
                          <Tag color="green">已配图</Tag>
                        ) : (
                          <Tag color="red">待配图</Tag>
                        )}
                      </Space>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      {/* 大图预览 */}
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width={600}
        centered
      >
        <img alt="预览" style={{ width: '100%' }} src={previewImage} />
      </Modal>
    </div>
  );
};

export default StyleSkuColorImages;
