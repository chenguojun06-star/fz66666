import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EyeOutlined,
  FontSizeOutlined,
  InboxOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import RichTextField from './RichTextField';
import type { DetailBlock } from '../types';
import './index.css';

const { Text, Paragraph } = Typography;

export interface DetailCanvasEditorProps {
  open: boolean;
  /** 图 + 文交错的内容块，顺序即顾客看到的顺序 */
  blocks: DetailBlock[];
  onChange: (blocks: DetailBlock[]) => void;
  onClose: () => void;
}

/** 平台硬上限：淘宝/天猫「电脑版描述最多支持发布 20 个有内容的描述模块」 */
const MAX_BLOCKS = 20;
/** 平台建议规格：宽 750–1242px，高 ≤1546px */
const MIN_W = 750;
const MAX_W = 1242;
const MAX_H = 1546;

/**
 * D-808：详情描述画布（图 + 文交错）。
 *
 * <p><b>形态</b>：淘宝/拼多多的详情不是「一串图」也不是「图 + 一段文字」，
 * 而是**图和文字按运营排好的顺序交错**：卖点图 → 一段话 → 细节图 → 一段话。
 * 顾客一路往下滑就看完，中间没有区块标题把内容切开。
 *
 * <p><b>为什么按「块」而不是按「图」计上限</b>：平台的限制对象是「描述模块」，
 * 不是图片数量。按图算会导致「20 张图 + 5 段文字」这种实际超限的组合被放行，
 * 上架时平台才拒，而系统这边毫无提示。
 */
const DetailCanvasEditor: React.FC<DetailCanvasEditorProps> = ({ open, blocks, onChange, onClose }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const list = useMemo(
    () => blocks.filter((b) => (b.type === 'image' ? !!b.url : !!(b as { content?: string }).content)),
    [blocks],
  );
  const full = list.length >= MAX_BLOCKS;
  const remain = MAX_BLOCKS - list.length;
  const imgCount = list.filter((b) => b.type === 'image').length;
  const txtCount = list.length - imgCount;

  /** 只提示不拦截：传满 20 块才被拦等于让运营白传一遍（D-778 既定约定） */
  const checkSize = useCallback(async (file: File) => {
    try {
      const dim = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = URL.createObjectURL(file);
      });
      if (!dim.w || !dim.h) return true;
      const bad: string[] = [];
      if (dim.w < MIN_W || dim.w > MAX_W) bad.push(`宽度 ${dim.w}px（建议 ${MIN_W}–${MAX_W}px）`);
      if (dim.h > MAX_H) bad.push(`高度 ${dim.h}px（不能超过 ${MAX_H}px）`);
      if (bad.length) {
        message.warning(`「${file.name}」规格不合适：${bad.join('，')}。仍可上传，但顾客端可能显示模糊。`);
      }
    } catch {
      // 读不到尺寸不是错误，不该因此拦住上传
    }
    return true;
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const incoming = Array.from(files).filter((f) => /^image\/(png|jpeg)$/.test(f.type));
      const rejected = incoming.length === 0 ? Array.from(files).length : 0;
      if (rejected) {
        message.warning('只支持 png / jpg 格式的图片');
      }
      if (!incoming.length) return;
      if (remain <= 0) {
        message.warning(`详情描述最多 ${MAX_BLOCKS} 个内容块，已达上限`);
        return;
      }
      const use = incoming.slice(0, remain);
      if (use.length < incoming.length) {
        message.warning(`只能再放 ${remain} 块，超出的已跳过`);
      }
      setUploading(true);
      const added: DetailBlock[] = [];
      try {
        for (const file of use) {
          await checkSize(file);
          const formData = new FormData();
          formData.append('file', file);
          const res = await api.post<{ code: number; data: string; message?: string }>(
            '/common/upload',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } },
          );
          if (res.code !== 200 || !res.data) throw new Error(res.message || '上传失败');
          added.push({ type: 'image', url: res.data });
        }
        if (added.length) onChange([...list, ...added]);
      } catch (e: unknown) {
        // 已成功的部分照常保留：整批回滚等于让运营重传
        if (added.length) onChange([...list, ...added]);
        message.error(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [remain, list, onChange, checkSize],
  );

  const move = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    },
    [list, onChange],
  );

  const remove = useCallback(
    (index: number) => {
      onChange(list.filter((_, i) => i !== index));
    },
    [list, onChange],
  );

  const addText = useCallback(() => {
    if (remain <= 0) {
      message.warning(`详情描述最多 ${MAX_BLOCKS} 个内容块，已达上限`);
      return;
    }
    onChange([...list, { type: 'text', content: '' }]);
  }, [remain, list, onChange]);

  const updateText = useCallback(
    (index: number, content: string) => {
      const next = [...list];
      const cur = next[index];
      if (cur.type === 'text') next[index] = { type: 'text', content };
      onChange(next);
    },
    [list, onChange],
  );

  return (
    <>
      <ResizableModal
        open={open}
        title="详情描述（PC 端 / 手机端同一份内容）"
        onCancel={onClose}
        footer={null}
        width="92vw"
        contentPadding={0}
        destroyOnClose
      >
        <div className="deic">
          <div className="deic__bar">
            <Space size={16} wrap>
              <Space size={8}>
                <Text className="deic__bar-label">页面模板</Text>
                {/* 只列真实存在的模板：编造「简约版/大促版」这类后端没有的选项，
                    选了却存不下去是纯骗人 */}
                <Select
                  defaultValue="default"
                  style={{ width: 184 }}
                  options={[{ value: 'default', label: '默认宝贝详情页' }]}
                />
              </Space>
              <Tag color={full ? 'error' : 'default'}>
                {list.length} / {MAX_BLOCKS} 块
              </Tag>
              <Tag>{imgCount} 图</Tag>
              <Tag>{txtCount} 段文字</Tag>
              <Text type="secondary" className="deic__spec">
                单图建议宽 {MIN_W}–{MAX_W}px、高 ≤{MAX_H}px，支持 png/jpg
              </Text>
            </Space>
            <Space size={8}>
              <Button icon={<FontSizeOutlined />} onClick={addText} disabled={full}>
                添加文字段落
              </Button>
              <Popconfirm
                title="批量删除"
                description={`将清空当前 ${list.length} 个内容块（${imgCount} 图 / ${txtCount} 段文字），不可撤销。`}
                okText="确认清空"
                cancelText="再想想"
                okButtonProps={{ danger: true }}
                disabled={!list.length}
                onConfirm={() => onChange([])}
              >
                <Button icon={<DeleteOutlined />} danger disabled={!list.length}>
                  批量删除
                </Button>
              </Popconfirm>
            </Space>
          </div>

          <div className="deic__canvas">
            {!list.length && (
              <div className="deic__empty">
                <InboxOutlined />
                <div className="deic__empty-title">还没有详情内容</div>
                <div className="deic__empty-hint">
                  按「卖点图 → 一段话 → 细节图 → 一段话」的顺序往下排。
                  顾客在详情页一路往下滑就看完，中间不会有区块标题把内容切开。
                </div>
              </div>
            )}

            {list.map((b, i) => (
              <div key={`${b.type}-${i}`} className="deic__item">
                <div className="deic__item-bar">
                  <Space size={8}>
                    <Tag color="blue">第 {i + 1} 块</Tag>
                    {b.type === 'image' ? <Tag color="cyan">图片</Tag> : <Tag color="purple">文字</Tag>}
                    {i === 0 && <Tag color="orange">详情页第一屏</Tag>}
                  </Space>
                  <Space size={4}>
                    <Tooltip title="上移">
                      <Button
                        size="middle"
                        type="text"
                        aria-label="上移"
                        icon={<ArrowUpOutlined />}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      />
                    </Tooltip>
                    <Tooltip title="下移">
                      <Button
                        size="middle"
                        type="text"
                        aria-label="下移"
                        icon={<ArrowDownOutlined />}
                        disabled={i === list.length - 1}
                        onClick={() => move(i, 1)}
                      />
                    </Tooltip>
                    {b.type === 'image' && (
                      <Tooltip title="查看大图">
                        <Button
                          size="middle"
                          type="text"
                          aria-label="查看大图"
                          icon={<EyeOutlined />}
                          onClick={() => setPreview(b.url)}
                        />
                      </Tooltip>
                    )}
                    <Popconfirm
                      title={b.type === 'image' ? '删除这张图片' : '删除这段文字'}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove(i)}
                    >
                      <Button
                        size="middle"
                        type="text"
                        danger
                        aria-label={b.type === 'image' ? '删除这张图片' : '删除这段文字'}
                        icon={<DeleteOutlined />}
                      />
                    </Popconfirm>
                  </Space>
                </div>

                {b.type === 'image' ? (
                  <img className="deic__img" src={b.url} alt={`第 ${i + 1} 块的图片`} />
                ) : (
                  <div className="deic__text-body">
                    <Paragraph type="secondary" className="deic__text-hint">
                      这段文字会显示在顾客端第 {i + 1} 块的位置，夹在图片之间
                    </Paragraph>
                    <RichTextField
                      value={b.content}
                      onChange={(html) => updateText(i, html)}
                      placeholder="例如：面料 92% 棉 / 8% 氨纶，透气不易变形"
                      ariaLabel={`第 ${i + 1} 块文字`}
                    />
                  </div>
                )}
              </div>
            ))}

            <div className="deic__add-row">
              <Upload
                multiple
                accept="image/png,image/jpeg"
                showUploadList={false}
                beforeUpload={(_f, fileList) => {
                  uploadFiles(fileList as unknown as File[]);
                  return false;
                }}
                disabled={uploading || full}
              >
                <div className={`deic__add${full ? ' is-full' : ''}`}>
                  <PictureOutlined />
                  <span className="deic__add-title">{uploading ? '上传中…' : '上传详情图'}</span>
                  <span className="deic__add-hint">{full ? `已达上限 ${MAX_BLOCKS} 块` : `还可放 ${remain} 块`}</span>
                </div>
              </Upload>
              <div
                className={`deic__add${full ? ' is-full' : ''}`}
                onClick={() => {
                  if (!full) addText();
                }}
                role="button"
              >
                <FontSizeOutlined />
                <span className="deic__add-title">添加文字段落</span>
                <span className="deic__add-hint">图文交错的一段说明</span>
              </div>
            </div>
          </div>
        </div>
      </ResizableModal>

      {preview && (
        <div className="deic__viewer" onClick={() => setPreview(null)}>
          <img src={preview} alt="详情图预览" />
          <div className="deic__viewer-hint">点击任意处关闭</div>
        </div>
      )}
    </>
  );
};

export default DetailCanvasEditor;