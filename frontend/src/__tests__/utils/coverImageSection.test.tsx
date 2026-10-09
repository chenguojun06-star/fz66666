import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CoverColorImagesSection from '../../modules/ecommerce/pages/ShopListing/components/CoverColorImagesSection';

/**
 * D-778：主图规范体检必须在「选图的当下」就显示给运营，
 * 而不是上架被平台驳回后才发现。
 *
 * jsdom 不会真的解码图片，所以这里 mock Image 的 onload 与 canvas 像素，
 * 只验证**接线是否正确**：尺寸/体积/格式拿到后，
 * 阻断项与建议项是否真的渲染出来、合格时是否显示通过。
 */

type Mocked = { w: number; h: number; white: number | null; subject: number | null };

let mocked: Mocked = { w: 1000, h: 1000, white: 1, subject: 0.8 };
let headBytes: string | null = '500000';

beforeEach(() => {
  mocked = { w: 1000, h: 1000, white: 1, subject: 0.8 };
  headBytes = '500000';

  // 纯白底 + 主体居中的假像素
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => undefined,
    getImageData: () => {
      const GRID = 96;
      const d = new Uint8ClampedArray(GRID * GRID * 4).fill(255);
      // 中间涂一块非白，模拟「主体占画面 ≥70%」的合规构图
      for (let y = 7; y < 89; y++) {
        for (let x = 7; x < 89; x++) {
          const i = (y * GRID + x) * 4;
          d[i] = 30; d[i + 1] = 40; d[i + 2] = 60;
        }
      }
      return { data: d, width: GRID, height: GRID };
    },
  } as unknown as CanvasRenderingContext2D);

  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = mocked.w;
      naturalHeight = mocked.h;
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    },
  );

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? headBytes : null) },
    })),
  );
});

const props = {
  cover: null as string | null,
  setCover: () => undefined,
  colorImages: {},
  setColorImages: () => undefined,
  colors: ['白色'],
};

describe('主图规范体检接线（D-778）', () => {
  it('没有主图时提示先上传，且不做体检', () => {
    render(<CoverColorImagesSection {...props} />);
    expect(screen.getByText('还没设置主图')).toBeTruthy();
  });

  it('合规主图显示「符合平台规范」', async () => {
    render(<CoverColorImagesSection {...props} cover="/api/file/x/ok.png" />);
    await waitFor(() => expect(screen.getByText('主图符合平台规范')).toBeTruthy());
    // 尺寸既出现在元信息行，也出现在通过提示的描述里
    expect(screen.getAllByText(/1000×1000/).length).toBeGreaterThanOrEqual(1);
  });

  it('低于平台底线尺寸必须显示为阻断项', async () => {
    mocked = { w: 399, h: 832, white: 0, subject: 1 };
    render(<CoverColorImagesSection {...props} cover="/api/file/x/small.png" />);
    await waitFor(() => expect(screen.getByText(/主图不合规/)).toBeTruthy());
    expect(screen.getByText(/短边 399px/)).toBeTruthy();
  });

  it('1×1 占位图必须阻断，且不得弹两条重复提示', async () => {
    mocked = { w: 1, h: 1, white: null, subject: null };
    render(<CoverColorImagesSection {...props} cover="/api/file/x/ph.png" />);
    await waitFor(() => expect(screen.getByText('主图是 1×1 的占位图')).toBeTruthy());
    // D-778：旧的「占位图」提示与新体检命中同一问题时，只能出现一条
    expect(screen.queryByText(/当前主图是一张占位图/)).toBeNull();
  });

  it('超过 3MB 必须阻断', async () => {
    headBytes = String(4 * 1024 * 1024);
    render(<CoverColorImagesSection {...props} cover="/api/file/x/big.png" />);
    await waitFor(() => expect(screen.getByText(/超过平台上限 3MB/)).toBeTruthy());
  });

  it('非 1:1 给建议而不是阻断（不误伤可上架商品）', async () => {
    mocked = { w: 502, h: 845, white: 0, subject: 1 };
    render(<CoverColorImagesSection {...props} cover="/api/file/x/tall.png" />);
    await waitFor(() => expect(screen.getByText(/会影响点击率/)).toBeTruthy());
    expect(screen.queryByText(/主图不合规/)).toBeNull();
    expect(screen.getByText(/不是 1:1/)).toBeTruthy();
  });

  it('拿不到字节数时不得判体积不合格', async () => {
    headBytes = null;
    render(<CoverColorImagesSection {...props} cover="/api/file/x/nolen.png" />);
    await waitFor(() => expect(screen.getByText('主图符合平台规范')).toBeTruthy());
  });

  it('必须显式列出机器判不了的人工检查项', async () => {
    render(<CoverColorImagesSection {...props} cover="/api/file/x/ok.png" />);
    expect(screen.getByText(/机器无法判定/)).toBeTruthy();
    expect(screen.getByText(/联系方式/)).toBeTruthy();
  });
});