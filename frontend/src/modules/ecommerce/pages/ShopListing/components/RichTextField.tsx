import { useCallback, useEffect, useRef } from 'react';
import { Tooltip } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  FontSizeOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons';
import './index.css';

export interface RichTextFieldProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * D-809：文字块的富文本编辑器（无第三方依赖）。
 *
 * <p><b>为什么不引第三方编辑器库</b>：本项目 detail 页的白名单是
 * p/div/span/strong/em/b/i/u/ul/ol/li/h1–h6/br/img，而主流编辑器库
 * 默认产出一堆白名单外的标签（font/span style/figure…）——
 * 引库就等于把 C 端渲染层和后台编辑器的内容模型长期绑死在第三方版本上。
 * 这里只提供白名单内的排版能力，够用且可控。
 *
 * <p><b>contentEditable 的两个坑（都处理了）</b>：
 * ① 每次外部值变化都 set innerHTML 会把光标弹回开头 —— 只在内容真的不同时才写；
 * ② 工具栏按钮的 mousedown 会让编辑器失焦、光标丢失 —— 用 preventDefault 拦住。
 *
 * <p><b>安全</b>：这里只负责采集，服务端入库前还会再过一遍白名单清洗
 * （{@code ShopDetailBlockHelper#sanitizeRichText}），两道一起用。
 */
const RichTextField: React.FC<RichTextFieldProps> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  // 初始为哨兵而不是 value —— 用 value 初始化会让首屏「value === lastEmitted」
  // 直接 return，编辑器永远不回填已有内容（打开已保存的详情块时看到的是空白）。
  const lastEmitted = useRef<string | null>(null);

  // 只在「外部值」与「我上次发出的值」不同的时候才写 DOM，
  // 否则用户每敲一个字 React 重渲染都会把光标重置到开头。
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    if (el.innerHTML === value) return;
    el.innerHTML = value || '';
    lastEmitted.current = value;
  }, [value]);

  const emit = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const html = el.innerHTML;
    // 浏览器会把空内容表示成 <br> 或空 div，全当空处理
    const isEmpty = !html || html === '<br>' || html === '<div><br></div>' || html === '<p><br></p>';
    const out = isEmpty ? '' : html;
    lastEmitted.current = out;
    onChange(out);
  }, [onChange]);

  /**
   * execCommand 是废弃 API，但仍是 contentEditable 唯一无依赖的排版入口。
   * 这里做防御：部分环境（jsdom、某些嵌入式 webview）根本没实现它，
   * 直接调用会抛 ReferenceError，连带把「输入后同步内容」这一步一起打断 ——
   * 用户表现为「打了字但内容没保存」。
   */
  const safeExec = useCallback((cmd: string, arg?: string) => {
    try {
      if (typeof document.execCommand !== 'function') return false;
      document.execCommand(cmd, false, arg);
      return true;
    } catch {
      return false;
    }
  }, []);

  /** 工具栏按钮：拦住 mousedown，否则编辑器失焦、光标丢失 */
  const exec = useCallback(
    (cmd: string, arg?: string) => {
      boxRef.current?.focus();
      safeExec(cmd, arg);
      emit();
    },
    [emit, safeExec],
  );

  const btns: Array<{ key: string; cmd: string; arg?: string; icon: React.ReactNode; title: string }> = [
    { key: 'bold', cmd: 'bold', icon: <BoldOutlined />, title: '加粗' },
    { key: 'italic', cmd: 'italic', icon: <ItalicOutlined />, title: '斜体' },
    { key: 'underline', cmd: 'underline', icon: <UnderlineOutlined />, title: '下划线' },
    { key: 'h3', cmd: 'formatBlock', arg: 'h3', icon: <FontSizeOutlined />, title: '小标题' },
    { key: 'p', cmd: 'formatBlock', arg: 'p', icon: <ColumnWidthOutlined />, title: '正文段落' },
    { key: 'ul', cmd: 'insertUnorderedList', icon: <UnorderedListOutlined />, title: '无序列表' },
    { key: 'ol', cmd: 'insertOrderedList', icon: <OrderedListOutlined />, title: '有序列表' },
  ];

  return (
    <div className="rtf">
      <div className="rtf__bar" role="toolbar" aria-label={ariaLabel ? `${ariaLabel} 格式工具` : '格式工具'}>
        {btns.map((b) => (
          <Tooltip key={b.key} title={b.title}>
            <button
              type="button"
              className="rtf__btn"
              aria-label={b.title}
              // 关键：阻止默认行为，否则点按钮时编辑器先失焦，格式会作用在错误的位置
              onMouseDown={(e) => {
                e.preventDefault();
                exec(b.cmd, b.arg);
              }}
            >
              {b.icon}
            </button>
          </Tooltip>
        ))}
      </div>
      <div
        ref={boxRef}
        className="rtf__body"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // 粘贴一律按纯文本处理：从 Word/网页粘进来会带来一堆
          // 白名单外的行内样式与 class，在顾客端会被整段转义成乱码
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          safeExec('insertText', text);
          emit();
        }}
      />
    </div>
  );
};

export default RichTextField;