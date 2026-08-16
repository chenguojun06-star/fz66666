import { ReloadOutlined, SearchOutlined, ThunderboltOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Space, Tooltip, Upload } from 'antd';
import { useMemo } from 'react';
import { useCoverImageUpload } from './useCoverImageUpload';
import PreviewImage from './PreviewImage';
import ThumbnailList from './ThumbnailList';
import SearchResultCard from './SearchResultCard';
import type { CoverImageUploadProps } from './types';

/**
 * 图片资产（嵌入式，合并进"基础信息"区左侧栏）
 * 主图 180px + 缩略图横排 48px + 上传/智能识别/搜相似/刷新操作
 * 无独立边框与标题，视觉上属于基础信息区的一部分
 */
const CoverImageUpload: React.FC<CoverImageUploadProps> = (props) => {
  const {
    currentIndex,
    setCurrentIndex,
    hoverIndex,
    setHoverIndex,
    previewHovered,
    setPreviewHovered,
    searching,
    searchResult,
    searchExpanded,
    setSearchExpanded,
    parsing,
    displayImages,
    currentImage,
    runStyleSearchByImage,
    handleDelete,
    handleSetCover,
    handleParseClick,
    handleUploadFiles,
    uploading,
    fetchImages,
  } = useCoverImageUpload(props);
  const { enabled, isNewMode = false } = props;

  // 主图角标：仅主图显示一次资产类型（缩略图不再重复显示）
  const assetMeta = useMemo(() => {
    const coverFileUrl = displayImages[0]?.fileUrl;
    if (!isNewMode && coverFileUrl && currentImage?.fileUrl === coverFileUrl) {
      return { label: '主图', color: 'var(--color-primary)' };
    }
    return { label: '图片', color: 'rgba(0,0,0,0.55)' };
  }, [displayImages, currentImage, isNewMode]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 8,
        minWidth: 0,
        width: '100%',
      }}
    >
      {/* 主图（唯一大图预览入口） */}
      <PreviewImage
        record={currentImage}
        assetMeta={assetMeta}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
        total={displayImages.length}
        previewHovered={previewHovered}
        setPreviewHovered={setPreviewHovered}
        size={180}
      />

      {/* 缩略图横排 */}
      <ThumbnailList
        images={displayImages}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
        hoverIndex={hoverIndex}
        setHoverIndex={setHoverIndex}
        handleSetCover={handleSetCover}
        handleDelete={handleDelete}
        enabled={enabled}
        isNewMode={isNewMode}
        thumbSize={48}
      />

      {/* 操作按钮行 */}
      <Space size={4} wrap>
        <Upload
          accept="image/*"
          multiple
          showUploadList={false}
          beforeUpload={(file) => {
            handleUploadFiles([file]);
            return false;
          }}
        >
          <Button size="small" icon={<UploadOutlined />} loading={uploading} type="primary" ghost>
            上传图片
          </Button>
        </Upload>
        <Tooltip title="AI 智能识别当前主图填充款式信息">
          <Button size="small" icon={<ThunderboltOutlined />} onClick={handleParseClick} loading={parsing} disabled={!currentImage}>
            智能识别
          </Button>
        </Tooltip>
        <Tooltip title="以图搜款，查找相似款式">
          <Button
            size="small"
            icon={<SearchOutlined />}
            onClick={runStyleSearchByImage}
            loading={searching}
            disabled={!currentImage}
          >
            搜相似
          </Button>
        </Tooltip>
        {!isNewMode && (
          <Tooltip title="刷新图片列表">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchImages()} />
          </Tooltip>
        )}
      </Space>

      {/* 以图搜款结果（折叠） */}
      <SearchResultCard
        searchResult={searchResult}
        searchExpanded={searchExpanded}
        setSearchExpanded={setSearchExpanded}
      />
    </div>
  );
};

export default CoverImageUpload;
