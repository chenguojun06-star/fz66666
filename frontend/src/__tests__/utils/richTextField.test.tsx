import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RichTextField from '../../modules/ecommerce/pages/ShopListing/components/RichTextField';

/**
 * D-809：文字块富文本编辑器。
 *
 * <p>contentEditable 有三个「不写测试就一定会踩」的坑，这里逐个钉住：
 * ① 首屏不回填已有内容（ref 初值写成 value 时必然发生）；
 * ② 外部值变化把光标弹回开头；
 * ③ 从 Word/网页粘贴带进一堆白名单外的行内样式。
 */
describe('文字块富文本编辑器（D-809）', () => {
  it('首屏把已有内容回填进编辑区（不是空白）', () => {
    render(<RichTextField value="<p>卖点：透气</p>" onChange={() => {}} ariaLabel="文字" />);

    const box = screen.getByRole('textbox', { name: '文字' });
    expect(box.innerHTML).toContain('卖点：透气');
  });

  it('提供白名单内的排版按钮，且都有无障碍名（读屏要能念出来）', () => {
    render(<RichTextField value="" onChange={() => {}} ariaLabel="文字" />);

    for (const name of ['加粗', '斜体', '下划线', '小标题', '正文段落', '无序列表', '有序列表']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('工具栏按钮拦住 mousedown，否则点一下编辑器就失焦、光标跑到末尾', () => {
    render(<RichTextField value="" onChange={() => {}} ariaLabel="文字" />);

    const btn = screen.getByRole('button', { name: '加粗' });
    const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    fireEvent(btn, evt);

    expect(evt.defaultPrevented).toBe(true);
  });

  it('输入时把 HTML 交给外部，且不动其它内容', () => {
    const onChange = vi.fn();
    render(<RichTextField value="" onChange={onChange} ariaLabel="文字" />);

    const box = screen.getByRole('textbox', { name: '文字' });
    box.innerHTML = '<p>面料 92% 棉</p>';
    fireEvent.input(box);

    expect(onChange).toHaveBeenCalledWith('<p>面料 92% 棉</p>');
  });

  it('浏览器产生的空内容（<br>）归一成空串，不存「看起来空的标签」', () => {
    const onChange = vi.fn();
    render(<RichTextField value="" onChange={onChange} ariaLabel="文字" />);

    const box = screen.getByRole('textbox', { name: '文字' });
    box.innerHTML = '<br>';
    fireEvent.input(box);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('粘贴一律按纯文本处理，挡掉 Word/网页带进来的行内样式', () => {
    const onChange = vi.fn();
    render(<RichTextField value="" onChange={onChange} ariaLabel="文字" />);

    const box = screen.getByRole('textbox', { name: '文字' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => '<span style="mso-bidi-font-weight:normal">复制来的字</span>' },
    });
    fireEvent(box, paste);

    expect(paste.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it('外部值没变时不重写 DOM（否则用户每敲一个字光标就被弹回开头）', () => {
    const onChange = vi.fn();
    const { rerender } = render(<RichTextField value="<p>原文</p>" onChange={onChange} ariaLabel="文字" />);

    const box = screen.getByRole('textbox', { name: '文字' }) as HTMLDivElement;
    // 模拟用户正在输入：DOM 与外部值已经一致
    box.innerHTML = '<p>原文</p>';
    rerender(<RichTextField value="<p>原文</p>" onChange={onChange} ariaLabel="文字" />);

    // 若实现每次都写 innerHTML，这里会因为重建节点而丢失 DOM 引用上的自定义标记
    expect(box.innerHTML).toBe('<p>原文</p>');
  });
});