import React from 'react';
import { Button } from 'antd';
import { BulbOutlined, SearchOutlined } from '@ant-design/icons';
import type { CoverImageUploadProps } from './types';
import { useCoverImageUpload } from './useCoverImageUpload';
import { resolveAssetMeta, computeParseStatusText, computeParseStatusColor } from './helpers';
import PreviewImage from './PreviewImage';
import ThumbnailList from './ThumbnailList';
import SearchResultCard from './SearchResultCard';

/**
 * 封面图片上传组件
 * 支持新建时本地预览和编辑时直接上传
 *
 * 业务逻辑见 useCoverImageUpload；UI 区块见 PreviewImage / ThumbnailList / SearchResultCard
 */
const CoverImageUpload: React.FC<CoverImageUploadProps> = (props) => {
  const {
    styleId,
    isNewMode = false,
    enabled,
    coverUrl,
  } = props;

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
    autoParseError,
    parseSuccessConfidence,
    displayImages,
    currentImage,
    runStyleSearchByImage,
    handleDelete,
    handleSetCover,
    handleParseClick,
  } = useCoverImageUpload(props);

  const currentAssetMeta = resolveAssetMeta(currentImage, currentIndex, coverUrl, isNewMode, currentIndex);
  const parseStatusText = computeParseStatusText(parsing, parseSuccessConfidence, autoParseError);
  const parseStatusColor = computeParseStatusColor(parsing, parseSuccessConfidence, autoParseError);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        marginBottom: 8,
        fontWeight: 600,
        fontSize: 14,
        color: '#1f2937',
        paddingLeft: 12,
        borderLeft: '3px solid var(--color-primary)',
        lineHeight: 1.4,
      }}>图片资产</div>

      {/* 大图预览：保持干净，只在左上角显示资产类型徽标 */}
      <PreviewImage
        currentImage={currentImage}
        coverUrl={coverUrl}
        isNewMode={isNewMode}
        styleId={styleId}
        enabled={enabled}
        displayImages={displayImages}
        currentIndex={currentIndex}
        previewHovered={previewHovered}
        setPreviewHovered={setPreviewHovered}
        setCurrentIndex={setCurrentIndex}
        currentAssetMetaLabel={currentAssetMeta.label}
      />

      {/* 操作按钮：直接放图片下方，能点到就行 */}
      {currentImage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 12 }}>
          <Button type="link" size="small" loading={parsing} icon={!parsing ? <BulbOutlined /> : undefined} onClick={handleParseClick} style={{ padding: 0, height: 'auto' }}>智能识别</Button>
          <Button type="link" size="small" loading={searching} icon={!searching ? <SearchOutlined /> : undefined} onClick={runStyleSearchByImage} style={{ padding: 0, height: 'auto' }}>搜相似</Button>
          {parseStatusText && (
            <span style={{ color: parseStatusColor }}>{parseStatusText}</span>
          )}
        </div>
      )}

      {/* 缩略图列表：hover 时显示设为主图/删除 */}
      <ThumbnailList
        displayImages={displayImages}
        currentIndex={currentIndex}
        hoverIndex={hoverIndex}
        setHoverIndex={setHoverIndex}
        setCurrentIndex={setCurrentIndex}
        isNewMode={isNewMode}
        enabled={enabled}
        coverUrl={coverUrl}
        onSetCover={handleSetCover}
        onDelete={handleDelete}
      />

      {displayImages.length > 0 && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>
          共 {displayImages.length} 张{isNewMode ? '（保存时上传）' : ''}
        </div>
      )}

      {/* 以图搜款结果：可折叠卡片 */}
      <SearchResultCard
        searchResult={searchResult}
        searchExpanded={searchExpanded}
        setSearchExpanded={setSearchExpanded}
      />

      {/* 自动识别错误提示已合并到上方状态卡片，不再重复显示 */}
    </div>
  );
};

export default CoverImageUpload;
