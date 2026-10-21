import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  InboxOutlined,
  PictureOutlined,
  CommentOutlined,
} from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
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
 * D-831：专业详情文案模板。
 *
 * <p><b>为什么内置模板</b>：绝大多数中小商家写不出详情文案，
 * 对着空编辑框只能上传几张图了事（线上 11 个已上架款 9 个详情近空白，D-813 已证实）。
 * 模板按服装详情页的行业惯例分段（卖点 → 面料工艺 → 版型尺码 → 模特参考 →
 * 洗涤保养 → 发货售后），一键插入的是**可直接上线的内容**，
 * 商家在其基础上改成自己的卖点即可，比「教他怎么写」现实得多。
 *
 * <p><b>只用白名单标签</b>：p/strong/ul/li —— 顾客端 richHtml 白名单
 * （p/div/span/strong/em/b/i/u/ul/ol/li/h1–h6/br/img）能原样渲染，
 * 服务端清洗后不会丢内容。
 */
const TEXT_TEMPLATES: Array<{ key: string; label: string; html: string }> = [
  {
    key: 'points',
    label: '核心卖点',
    html:
      '<p><strong>为什么值得入手</strong></p>' +
      '<ul>' +
      '<li>面料亲肤透气，上身轻盈不闷热</li>' +
      '<li>版型修身不紧绷，遮肉显瘦显气质</li>' +
      '<li>经典百搭款，通勤、约会、日常都能穿</li>' +
      '</ul>',
  },
  {
    key: 'fabric',
    label: '面料与工艺',
    html:
      '<p><strong>面料与工艺</strong></p>' +
      '<p>精选高支面料，手感细腻、垂顺有光泽；走线平整细密，里衬收边干净利落，细节经得起细看。</p>',
  },
  {
    key: 'size',
    label: '版型与尺码建议',
    html:
      '<p><strong>版型与尺码建议</strong></p>' +
      '<p>正常体型按平时尺码拿即可，喜欢宽松感建议拍大一码；拿不准可对照下方尺码表量一下，或联系客服帮您推荐。</p>',
  },
  {
    key: 'model',
    label: '模特实拍参考',
    html:
      '<p><strong>模特实拍参考</strong></p>' +
      '<p>模特身高 168cm / 体重 50kg，试穿尺码 M，上身效果如图，供您参考。</p>',
  },
  {
    key: 'wash',
    label: '洗涤与保养',
    html:
      '<p><strong>洗涤与保养</strong></p>' +
      '<ul>' +
      '<li>建议 30℃ 以下水温单独手洗</li>' +
      '<li>不可漂白，中性洗涤剂效果更好</li>' +
      '<li>阴凉处平铺晾干，避免暴晒</li>' +
      '<li>深浅色分开存放，避免串色</li>' +
      '</ul>',
  },
  {
    key: 'service',
    label: '发货与售后',
    html:
      '<p><strong>发货与售后</strong></p>' +
      '<p>付款后 48 小时内发货；支持 7 天无理由退换（不影响二次销售），质量问题运费全免，请放心购买。</p>',
  },
];

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
 *
 * <p><b>D-831 修复「添加文字段落没反应」</b>：此前渲染列表把**没有内容的文字块**
 * 过滤掉了 —— 点「添加文字段落」确实追加了空块，但它被过滤器吞掉、界面上永远
 * 不出现，看起来就是「点了没反应」。文字块（含空块）现在一律渲染成可编辑区，
 * 图片块仍然过滤掉没有 url 的坏数据。空文字块在顾客端本来就会被跳过
 * （C 端渲染时 `blk.content` 为空不输出），所以放开渲染没有副作用。
 */
const DetailCanvasEditor: React.FC<DetailCanvasEditorProps> = ({ open, blocks, onChange, onClose }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // 只剔除没有 url 的图片坏数据；文字块无论有没有内容都保留（否则新建的空段落不可见）
  const list = useMemo(
    () => blocks.filter((b) => (b.type === 'image' ? !!b.url : true)),
    [blocks],
  );
  const full = list.length >= MAX_BLOCKS;
  const remain = MAX_BLOCKS - list.length;
  const imgCount = list.filter((b) => b.type === 'image').length;
  const txtCount = list.length - imgCount;
  const captionCount = list.filter((b) => b.type === 'text' && b.caption).length;

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

  /** D-810：给某张图加说明 —— 插到该图正下方并标记为图注，
   *  一步完成「图 + 紧贴的说明」，不必手动挪位置再切样式。 */
  const addCaptionFor = useCallback(
    (index: number) => {
      if (remain <= 0) {
        message.warning(`详情描述最多 ${MAX_BLOCKS} 个内容块，已达上限`);
        return;
      }
      const next = [...list];
      next.splice(index + 1, 0, { type: 'text', content: '', caption: true });
      onChange(next);
    },
    [remain, list, onChange],
  );

  const toggleCaption = useCallback(
    (index: number) => {
      const next = [...list];
      const cur = next[index];
      if (cur.type === 'text') next[index] = { ...cur, caption: !cur.caption };
      onChange(next);
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

  /** D-831：插入专业文案模板段落（插入后仍可自由编辑） */
  const insertTemplate = useCallback(
    (key: string) => {
      const tpl = TEXT_TEMPLATES.find((t) => t.key === key);
      if (!tpl) return;
      if (remain <= 0) {
        message.warning(`详情描述最多 ${MAX_BLOCKS} 个内容块，已达上限`);
        return;
      }
      onChange([...list, { type: 'text', content: tpl.html }]);
      message.success(`已插入「${tpl.label}」模板，内容可直接修改`);
    },
    [remain, list, onChange],
  );

  const templateMenu: MenuProps = {
    items: TEXT_TEMPLATES.map((t) => ({ key: t.key, label: t.label })),
    onClick: ({ key }) => insertTemplate(key),
  };

  const updateText = useCallback(
    (index: number, content: string) => {
      const next = [...list];
      const cur = next[index];
      // 用展开写法而不是整个对象重建：否则会把 caption 标记抹掉
      if (cur.type === 'text') next[index] = { ...cur, content };
      onChange(next);
    },
    [list, onChange],
  );

  return (
    <>
      <SideDrawer
        open={open}
        onClose={onClose}
        title="详情描述（PC 端 / 手机端同一份内容）"
        width="85%"
        footerExtra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            图和文字按你排的顺序从上到下连成一条（淘宝详情页的形态）。PC 端与手机端用同一份内容。
          </Text>
        }
      >
        <div className="deic" style={{ flex: 1, minHeight: 0 }}>
          <div className="deic__bar">
            <Space size={16} wrap>
              <Space size={8}>
                {/* D-831：原来这里是只有一个假选项的「页面模板」下拉（选了也存不下去）。
                    换成真正有用的专业文案模板：一键插入服装详情页惯用段落。 */}
                <Dropdown trigger={['click']} menu={templateMenu} disabled={full}>
                  <Button icon={<FileTextOutlined />}>插入文案模板</Button>
                </Dropdown>
                <Text type="secondary" className="deic__spec">
                  卖点 / 面料工艺 / 尺码建议 / 洗涤保养等，一键插入后可改
                </Text>
              </Space>
              <Tag color={full ? 'error' : 'default'}>
                {list.length} / {MAX_BLOCKS} 块
              </Tag>
              <Tag>{imgCount} 图</Tag>
              <Tag>{txtCount} 段文字</Tag>
              {captionCount > 0 && <Tag color="gold">{captionCount} 条图注</Tag>}
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
                  不知道写什么，点上方「插入文案模板」或下面的模板按钮，一键生成专业文案再改。
                </div>
                <Space size={8} wrap style={{ marginTop: 16, justifyContent: 'center' }}>
                  {TEXT_TEMPLATES.map((t) => (
                    <Button key={t.key} size="small" onClick={() => insertTemplate(t.key)}>
                      {t.label}
                    </Button>
                  ))}
                </Space>
              </div>
            )}

            {list.map((b, i) => (
              <div key={`${b.type}-${i}`} className="deic__item">
                <div className="deic__item-bar">
                  <Space size={8}>
                    <Tag color="blue">第 {i + 1} 块</Tag>
                    {b.type === 'image' ? (
                      <Tag color="cyan">图片</Tag>
                    ) : b.caption ? (
                      <Tag color="gold">图注</Tag>
                    ) : (
                      <Tag color="purple">文字</Tag>
                    )}
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
                      <Tooltip title="给这张图加说明">
                        <Button
                          size="middle"
                          type="text"
                          aria-label="给这张图加说明"
                          icon={<CommentOutlined />}
                          disabled={remain <= 0}
                          onClick={() => addCaptionFor(i)}
                        />
                      </Tooltip>
                    )}
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
                    <div className="deic__text-actions">
                      <Switch
                        size="small"
                        checked={!!b.caption}
                        onChange={() => toggleCaption(i)}
                      />
                      <Text type="secondary" className="deic__text-hint">
                        作为上一张图的说明（紧贴图片显示，不单独占一段）
                      </Text>
                    </div>
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
                beforeUpload={(file, fileList) => {
                  // antd 对批量选择会逐个调 beforeUpload，只在首个文件时整批处理，避免重复上传
                  if (fileList.indexOf(file) === 0) {
                    uploadFiles(fileList as unknown as File[]);
                  }
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
      </SideDrawer>

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
