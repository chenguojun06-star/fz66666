import React from 'react';
import { Button, Dropdown, Input, InputNumber, Popconfirm, Select, Space, Switch, Upload } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined, EyeOutlined, LockFilled, PictureOutlined, SwapOutlined, UnlockOutlined,
} from '@ant-design/icons';
import SizeTablePropEditor from './SizeTablePropEditor';
import type { EditorElement, EditorPage, ShapeElement, SizeTableElement, TextElement } from './types';

/**
 * D-835：右侧属性面板（对齐竞品）。
 * <ul>
 *   <li>选中底图：替换图片 / 透明度 / 模糊 / 批量应用到全部页面；</li>
 *   <li>选中元素：按类型给属性 + 图层（置顶/上移/下移/置底）/ 锁定 / 删除；</li>
 *   <li>未选中：操作提示 + 当前页信息。</li>
 * </ul>
 * 画布上点空白 = 取消选择；点底图本身（img）= 选中页面，出现「图片」面板。
 */
export interface EditorRightPanelProps {
  page: EditorPage | undefined;
  pageIndex: number;
  /** elementId | 'bg' | null */
  sel: string | null;
  uploading: boolean;
  onUploadBg: (file: File) => void;
  onPatchBg: (patch: Partial<Pick<EditorPage, 'bgOpacity' | 'bgBlur'>>) => void;
  onBatchApplyBg: () => void;
  onPatchEl: (id: string, patch: Partial<EditorElement>) => void;
  onReorderEl: (action: 'top' | 'up' | 'down' | 'bottom') => void;
  onToggleLock: (id: string) => void;
  onDeleteEl: (id: string) => void;
}

const LayerMenu = (onReorder: EditorRightPanelProps['onReorderEl']): MenuProps => ({
  items: [
    { key: 'top', label: '置于顶层' },
    { key: 'up', label: '上移一层' },
    { key: 'down', label: '下移一层' },
    { key: 'bottom', label: '置于底层' },
  ],
  onClick: ({ key }) => onReorder(key as 'top' | 'up' | 'down' | 'bottom'),
});

const EditorRightPanel: React.FC<EditorRightPanelProps> = ({
  page, pageIndex, sel, uploading, onUploadBg, onPatchBg, onBatchApplyBg,
  onPatchEl, onReorderEl, onToggleLock, onDeleteEl,
}) => {
  if (!page) {
    return <div className="dpe-right"><div className="dpe-right__empty">先在左侧添加页面</div></div>;
  }

  const el = sel && sel !== 'bg' ? page.elements.find((e) => e.id === sel) ?? null : null;

  const layerRow = (target: EditorElement) => (
    <Space className="dpe-prop__layer" wrap>
      <Dropdown menu={LayerMenu(onReorderEl)} trigger={['click']}>
        <Button size="small">图层 ▾</Button>
      </Dropdown>
      <Button
        size="small"
        icon={target.locked ? <LockFilled /> : <UnlockOutlined />}
        onClick={() => onToggleLock(target.id)}
        aria-label={target.locked ? '解锁元素' : '锁定元素'}
      >
        {target.locked ? '已锁' : '未锁'}
      </Button>
      <Popconfirm title="删除这个元素？" onConfirm={() => onDeleteEl(target.id)}>
        <Button size="small" danger icon={<DeleteOutlined />} disabled={target.locked} aria-label="删除元素">
          删除
        </Button>
      </Popconfirm>
    </Space>
  );

  return (
    <div className="dpe-right" aria-label="属性面板">
      {/* ── 未选中 ── */}
      {!sel && (
        <div className="dpe-right__empty">
          <EyeOutlined style={{ fontSize: 28 }} />
          <p>点画布里的文字 / 表格 / 形状可编辑属性；点底图本身可调透明度、模糊或替换图片。</p>
          <p className="dpe-right__meta">当前：第 {pageIndex + 1} 页 · {page.elements.length} 个元素</p>
        </div>
      )}

      {/* ── 页面底图（竞品「图片」面板）── */}
      {sel === 'bg' && (
        <>
          <div className="dpe-right__title">图片</div>
          <div className="dpe-right__sec-title">图片操作</div>
          <Upload
            accept="image/png,image/jpeg"
            showUploadList={false}
            beforeUpload={(f) => {
              onUploadBg(f);
              return false;
            }}
            disabled={uploading}
          >
            <Button block icon={<PictureOutlined />} loading={uploading} aria-label="替换图片">
              替换图片
            </Button>
          </Upload>
          <div className="dpe-prop__field">
            <span>透明度</span>
            <InputNumber min={0} max={100} value={page.bgOpacity} onChange={(v) => onPatchBg({ bgOpacity: Number(v) ?? 100 })} aria-label="底图透明度" />
          </div>
          <div className="dpe-prop__field">
            <span>模糊</span>
            <InputNumber min={0} max={20} value={page.bgBlur} onChange={(v) => onPatchBg({ bgBlur: Number(v) ?? 0 })} aria-label="底图模糊" />
          </div>
          <div className="dpe-right__sec-title">编辑</div>
          <Button block icon={<SwapOutlined />} onClick={onBatchApplyBg} aria-label="批量应用到全部页面">
            批量应用到全部页面
          </Button>
          <p className="dpe-right__hint">把本页的透明度、模糊设置套到所有页（可撤销）。</p>
        </>
      )}

      {/* ── 文字元素 ── */}
      {el && el.kind === 'text' && (
        <>
          <div className="dpe-right__title">文字</div>
          <Input.TextArea
            value={el.content}
            rows={4}
            maxLength={500}
            onChange={(e) => onPatchEl(el.id, { content: e.target.value } as Partial<TextElement>)}
            aria-label="文字内容"
          />
          <div className="dpe-prop__field">
            <span>字号</span>
            <InputNumber min={12} max={200} value={el.fontSize} onChange={(v) => onPatchEl(el.id, { fontSize: Number(v) || 28 } as Partial<TextElement>)} />
          </div>
          <div className="dpe-prop__field">
            <span>颜色</span>
            <input
              type="color"
              className="dpe-prop__color"
              value={el.color}
              onChange={(e) => onPatchEl(el.id, { color: e.target.value } as Partial<TextElement>)}
              aria-label="文字颜色"
            />
          </div>
          <div className="dpe-prop__field">
            <span>加粗</span>
            <Switch checked={!!el.bold} onChange={(v) => onPatchEl(el.id, { bold: v } as Partial<TextElement>)} aria-label="文字加粗" />
          </div>
          <div className="dpe-prop__field">
            <span>对齐</span>
            <Select
              size="small"
              style={{ width: 96 }}
              value={el.align ?? 'center'}
              onChange={(v) => onPatchEl(el.id, { align: v } as Partial<TextElement>)}
              options={[{ value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }, { value: 'right', label: '右对齐' }]}
            />
          </div>
          <div className="dpe-prop__field">
            <span>透明度</span>
            <InputNumber min={0} max={100} value={el.opacity} onChange={(v) => onPatchEl(el.id, { opacity: Number(v) ?? 100 })} />
          </div>
          <div className="dpe-prop__field">
            <span>宽度</span>
            <InputNumber min={40} max={2000} value={el.w} onChange={(v) => onPatchEl(el.id, { w: Number(v) || el.w })} />
          </div>
          {layerRow(el)}
        </>
      )}

      {/* ── 形状元素 ── */}
      {el && el.kind === 'shape' && (
        <>
          <div className="dpe-right__title">形状</div>
          <div className="dpe-prop__field">
            <span>类型</span>
            <Select
              size="small"
              style={{ width: 96 }}
              value={el.shape}
              onChange={(v) => onPatchEl(el.id, { shape: v } as Partial<ShapeElement>)}
              options={[{ value: 'rect', label: '矩形' }, { value: 'circle', label: '圆形' }, { value: 'line', label: '直线' }]}
            />
          </div>
          <div className="dpe-prop__field">
            <span>颜色</span>
            <input type="color" className="dpe-prop__color" value={el.color} onChange={(e) => onPatchEl(el.id, { color: e.target.value } as Partial<ShapeElement>)} aria-label="形状颜色" />
          </div>
          <div className="dpe-prop__field">
            <span>宽</span>
            <InputNumber min={8} max={2000} value={el.w} onChange={(v) => onPatchEl(el.id, { w: Number(v) || el.w })} />
          </div>
          <div className="dpe-prop__field">
            <span>高</span>
            <InputNumber min={2} max={2000} value={el.h} onChange={(v) => onPatchEl(el.id, { h: Number(v) || el.h } as Partial<ShapeElement>)} />
          </div>
          <div className="dpe-prop__field">
            <span>透明度</span>
            <InputNumber min={0} max={100} value={el.opacity} onChange={(v) => onPatchEl(el.id, { opacity: Number(v) ?? 100 })} />
          </div>
          {layerRow(el)}
        </>
      )}

      {/* ── 尺码表元素 ── */}
      {el && el.kind === 'sizeTable' && (
        <>
          <div className="dpe-right__title">尺码表</div>
          <SizeTablePropEditor
            value={el as SizeTableElement}
            onChange={(patch) => onPatchEl(el.id, patch as Partial<EditorElement>)}
          />
          <div className="dpe-prop__field">
            <span>透明度</span>
            <InputNumber min={0} max={100} value={el.opacity} onChange={(v) => onPatchEl(el.id, { opacity: Number(v) ?? 100 })} />
          </div>
          <div className="dpe-prop__field">
            <span>宽度</span>
            <InputNumber min={120} max={2000} value={el.w} onChange={(v) => onPatchEl(el.id, { w: Number(v) || el.w })} />
          </div>
          {layerRow(el)}
        </>
      )}
    </div>
  );
};

export default EditorRightPanel;
