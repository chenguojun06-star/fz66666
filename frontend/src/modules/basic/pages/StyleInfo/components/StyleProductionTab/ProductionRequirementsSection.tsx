import React, { useRef, useState } from 'react';
import { Button, Image, Input, Space, Tooltip } from 'antd';
import { DeleteOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

interface Props {
  productionReqLocked: boolean;
  productionReqSaving: boolean;
  allRequirements: string;
  /** 制单图片 URL 列表（bizType=workorder，与打印同源） */
  sheetImages: string[];
  sheetImageMax: number;
  sheetUploading: boolean;
  onUploadSheetFiles: (files: File[]) => void;
  onRemoveSheetImage: (url: string) => void;
  onProductionReqSave: () => void;
  onDownloadWorkorder: () => void;
  onPrintWorkorder: () => void;
  onOpenOcr: () => void;
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const CARD = 64;

const ProductionRequirementsSection: React.FC<Props> = ({
  productionReqLocked,
  productionReqSaving,
  allRequirements,
  sheetImages,
  sheetImageMax,
  sheetUploading,
  onUploadSheetFiles,
  onRemoveSheetImage,
  onProductionReqSave,
  onDownloadWorkorder,
  onPrintWorkorder,
  onOpenOcr,
  onTextChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const canEdit = !productionReqLocked;
  const previewSrcs = sheetImages.map((u) => getFullAuthedFileUrl(u));

  const pickFiles = (files: FileList | null) => {
    const imgs = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (imgs.length > 0) onUploadSheetFiles(imgs);
  };

  return (
    <div style={{
      border: '1px solid var(--color-border, var(--color-border))',
      borderRadius: 6,
      padding: '16px',
      marginBottom: 16,
      background: 'var(--color-bg-card, var(--color-bg-base))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: 0.5,
            paddingLeft: 10,
            borderLeft: '3px solid var(--color-primary)',
          }}>生产要求</span>
        </div>
        <Space size={8} wrap>
          {!productionReqLocked && (
            <Button
              type="primary"
              loading={productionReqSaving}
              onClick={onProductionReqSave}
            >
              保存生产要求
            </Button>
          )}
          <Button onClick={onDownloadWorkorder}>
            下载制单
          </Button>
          <Button onClick={onPrintWorkorder}>
            打印制单
          </Button>
          {!productionReqLocked && (
            <Button onClick={onOpenOcr}>
              AI识别工艺单
            </Button>
          )}
        </Space>
      </div>

      {/* 制单图片：一排方形卡片 + ➕ 上传卡（点击选择/拖拽/粘贴截图，即时保存并随打印输出） */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          marginBottom: 10, padding: 6, borderRadius: 6,
          outline: dragOver ? '2px dashed var(--color-primary)' : 'none',
          outlineOffset: 2,
        }}
        onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDragOver(false);
          pickFiles(e.dataTransfer.files);
        }}
      >
        {previewSrcs.length > 0 && (
          <Image.PreviewGroup
            preview={{ open: previewOpen, onOpenChange: setPreviewOpen, current: previewIndex }}
            items={previewSrcs}
          >
            <Image src={previewSrcs[0]} style={{ display: 'none' }} preview={false} />
          </Image.PreviewGroup>
        )}
        {sheetImages.map((url, idx) => (
          <div key={url} style={{ position: 'relative', width: CARD, height: CARD, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border-light, rgba(0,0,0,0.1))' }}>
            <img src={getFullAuthedFileUrl(url)} alt={`制单图${idx + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {canEdit && (
              <div
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', opacity: 0, transition: 'opacity .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
              >
                <Tooltip title="预览大图">
                  <EyeOutlined style={{ color: '#fff', fontSize: 14 }} onClick={() => { setPreviewIndex(idx); setPreviewOpen(true); }} />
                </Tooltip>
                <Tooltip title="删除">
                  <DeleteOutlined style={{ color: '#fff', fontSize: 14 }} onClick={() => onRemoveSheetImage(url)} />
                </Tooltip>
              </div>
            )}
          </div>
        ))}
        {canEdit && sheetImages.length < sheetImageMax && (
          <div
            style={{
              width: CARD, height: CARD, borderRadius: 6, cursor: 'pointer',
              border: '1px dashed rgba(0,0,0,0.25)', background: 'rgba(0,0,0,0.02)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              color: 'rgba(0,0,0,0.45)', fontSize: 11,
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <PlusOutlined style={{ fontSize: 18 }} />
            <span>{sheetUploading ? '上传中…' : `${sheetImages.length}/${sheetImageMax}`}</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary, rgba(0,0,0,0.45))', marginLeft: 4 }}>
          制单图片随「打印/下载制单」一并输出；支持点击上传、拖拽到此处、在下方文本框直接粘贴截图
        </span>
      </div>

      <Input.TextArea
        id="productionRequirements"
        value={allRequirements}
        onChange={onTextChange}
        disabled={productionReqLocked}
        placeholder="请输入生产要求，每行填写一条内容&#10;例如：&#10;1. 面料预缩水处理&#10;2. 缝制线迹密度12针/3cm&#10;3. 领型对称偏差≤0.3cm"
        autoSize={{ minRows: 12 }}
        onPaste={(e) => {
          if (!canEdit) return;
          const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
          if (files.length > 0) {
            e.preventDefault();
            onUploadSheetFiles(files);
          }
        }}
        style={{
          fontFamily: "'PingFang SC', 'Microsoft YaHei', monospace",
          fontSize: 14,
          lineHeight: '2',
          padding: '14px 16px',
          borderRadius: 6,
          minHeight: 320,
        }}
      />
    </div>
  );
};

export default ProductionRequirementsSection;
