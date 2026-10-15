import { useCallback, useMemo, useState } from 'react';
import { Button, Popconfirm, Select, Space, Tag, Tooltip, Typography, Upload, message } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EyeOutlined,
  InboxOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import './index.css';

const { Text } = Typography;

export interface DetailImageCanvasEditorProps {
  open: boolean;
  /** 详情图序列（自上而下的顺序即顾客看到的顺序） */
  images: string[];
  onChange: (urls: string[]) => void;
  onClose: () => void;
}

/** 平台硬上限：淘宝/天猫详情描述最多 20 个有内容的描述模块 */
const MAX_IMAGES = 20;
/** 平台建议规格：宽 750–1242px，高 ≤1546px */
const MIN_W = 750;
const MAX_W = 1242;
const MAX_H = 1546;

/**
 * D-803：详情描述画布。
 *
 * <p><b>为什么要有这个</b>：详情图在顾客端是**一条从上到下连着的整体**，
 * 不是一个个独立图槽 —— 运营要按「先卖点图、再细节图、再尺码图」的顺序
 * 一路往下排。以前这里只有 92px 小方块横排（DetailModuleContent），
 * 既看不出顺序对不对、也看不出整体长度，且挤在 860px 的抽屉窄表单里，
 * 根本谈不上「编辑页面」。
 *
 * <p><b>为什么用接近全屏的弹窗</b>：画布要按 750px 基准宽度显示真实比例，
 * 60vw 装不下（那正是「太小」的老问题）。这里偏离了 Modal 三级尺寸体系，
 * 是有意为之 —— 编辑对象本身就是一整条长页面，容器必须让位给内容。
 */
const DetailImageCanvasEditor: React.FC<DetailImageCanvasEditorProps> = ({
  open,
  images,
  onChange,
  onClose,
}) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const list = useMemo(() => images.filter(Boolean), [images]);
  const full = list.length >= MAX_IMAGES;
  const remain = MAX_IMAGES - list.length;

  /** 逐张校验尺寸并给出提示 —— 只提示不拦截，与项目既有约定一致
   *  （D-778：合规只提示、不限制）。硬拦会让运营传完 20 张才发现白传。 */
  const checkSize = useCallback(async (file: File): Promise<boolean> => {
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
      const incoming = Array.from(files);
      if (!incoming.length) return;
      const room = remain;
      if (room <= 0) {
        message.warning(`最多上传 ${MAX_IMAGES} 张详情图`);
        return;
      }
      const use = incoming.slice(0, room);
      if (use.length < incoming.length) {
        message.warning(`只能再放 ${room} 张，超出的 ${incoming.length - room} 张已跳过`);
      }
      setUploading(true);
      const added: string[] = [];
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
          added.push(res.data);
        }
        // 一次性回写，避免每传一张就触发一次外部 onChange
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
          {/* ── 工具条 ── */}
          <div className="deic__bar">
            <Space size={16} wrap>
              <Space size={8}>
                <Text className="deic__bar-label">页面模板</Text>
                {/* 只有真实存在的模板才列出来 —— 不编造「简约版/大促版」这类
                    后端根本没有的选项，选了却存不下去是纯骗人 */}
                <Select
                  defaultValue="default"
                  style={{ width: 184 }}
                  options={[{ value: 'default', label: '默认宝贝详情页' }]}
                />
              </Space>
              <Tag color={full ? 'error' : 'default'}>
                {list.length} / {MAX_IMAGES} 张
              </Tag>
              <Text type="secondary" className="deic__spec">
                单张建议宽 {MIN_W}–{MAX_W}px、高 ≤{MAX_H}px，支持 png/jpg/jpeg
              </Text>
            </Space>
            <Space size={8}>
              <Popconfirm
                title="批量删除"
                description={`将清空当前 ${list.length} 张详情图，此操作不可撤销。`}
                okText="确认清空"
                cancelText="再想想"
                okButtonProps={{ danger: true }}
                disabled={!list.length}
                onConfirm={() => onChange([])}
              >
                <Button icon={<DeleteOutlined />} danger disabled={!list.length}>
                  批量删除图片
                </Button>
              </Popconfirm>
            </Space>
          </div>

          {/* ── 画布：纵向连续的一条详情流 ── */}
          <div className="deic__canvas">
            {!list.length && (
              <div className="deic__empty">
                <InboxOutlined />
                <div className="deic__empty-title">还没有详情图</div>
                <div className="deic__empty-hint">
                  详情图会按下面的顺序从上到下连成一条，显示在顾客端详情页。
                  请按「卖点 → 细节 → 尺码 → 场景」的阅读顺序上传。
                </div>
              </div>
            )}

            {list.map((url, i) => (
              <div key={`${url}-${i}`} className="deic__item">
                <div className="deic__item-bar">
                  <Space size={8}>
                    <Tag color="blue">第 {i + 1} 张</Tag>
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
                    <Tooltip title="查看大图">
                      <Button
                        size="middle"
                        type="text"
                        aria-label="查看大图"
                        icon={<EyeOutlined />}
                        onClick={() => setPreview(url)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="删除这张详情图"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove(i)}
                    >
                      <Button size="middle" type="text" danger aria-label="删除这张详情图" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
                <img className="deic__img" src={url} alt={`详情图 ${i + 1}`} />
              </div>
            ))}

            {/* 末尾添加位：位置本身就在表达「这是最后一张后面」 */}
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
                <PlusOutlined />
                <span className="deic__add-title">{uploading ? '上传中…' : '上传详情图'}</span>
                <span className="deic__add-hint">
                  {full ? `已达上限 ${MAX_IMAGES} 张` : `还可上传 ${remain} 张`}
                </span>
              </div>
            </Upload>
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

export default DetailImageCanvasEditor;