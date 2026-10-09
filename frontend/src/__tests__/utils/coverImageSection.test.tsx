import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CoverColorImagesSection from '../../modules/ecommerce/pages/ShopListing/components/CoverColorImagesSection';

/**
 * 主图区（D-778 / D-778-b）
 *
 * <p><b>需求变更（用户原话）</b>：「每次编辑这些内容的 就提示 是否合规 这些
 * <b>只做提示 不限制上传</b>」。
 *
 * <p>此前把「短边低于平台底线」做成红色「主图不合规（会影响上架/展示）」，
 * 运营看到的是"系统不让传"，而不是"这样传平台可能不给推荐"。
 * 合规提示与上传限制必须分开：<b>照常上传、照常上架，只把话说清楚</b>。
 *
 * <p>jsdom 不会真的解码图片，所以这里 mock Image 的 onload 与 canvas 像素，
 * 只验证接线是否正确。
 */

type Mocked = { w: number; h: number; white: number | null; subject: number | null };

let mocked: Mocked = { w: 1000, h: 1000, white: 1, subject: 0.8 };
let headBytes: string | null = '500000';

beforeEach(() => {
  mocked = { w: 1000, h: 1000, white: 1, subject: 0.8 };
  headBytes = '500000';

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => undefined,
    getImageData: () => {
      const GRID = 96;
      const d = new Uint8ClampedArray(GRID * GRID * 4).fill(255);
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

describe('主图区：合规只提示、不限制（D-778-b）', () => {
  it('没有主图时提示先上传', () => {
    render(<CoverColorImagesSection {...props} />);
    expect(screen.getByText('还没设置主图')).toBeTruthy();
  });

  it('合规主图不弹任何警告', async () => {
    render(<CoverColorImagesSection {...props} cover="/api/file/x/ok.png" />);
    await waitFor(() => expect(screen.getByText(/1000×1000/)).toBeTruthy());
    expect(screen.queryByText(/主图建议/)).toBeNull();
  });

  it('低于平台底线仍然照常上传，只作为建议提示', async () => {
    mocked = { w: 399, h: 832, white: 0, subject: 1 };
    render(<CoverColorImagesSection {...props} cover="/api/file/x/small.png" />);
    await waitFor(() => expect(screen.getByText(/主图建议/)).toBeTruthy());
    // 关键：不得出现阻断式措辞
    expect(screen.queryByText(/主图不合规/)).toBeNull();
    expect(screen.queryByText(/会影响上架/)).toBeNull();
    // 必须明示「不影响上传」
    expect(screen.getByText(/不影响上传/)).toBeTruthy();
  });

  it('1×1 占位图同样只是提示，不拦截', async () => {
    mocked = { w: 1, h: 1, white: null, subject: null };
    render(<CoverColorImagesSection {...props} cover="/api/file/x/ph.png" />);
    await waitFor(() => expect(screen.getByText('主图是 1×1 的占位图')).toBeTruthy());
    expect(screen.queryByText(/主图不合规/)).toBeNull();
    expect(screen.queryByText(/当前主图是一张占位图/)).toBeNull();
  });

  it('超过 3MB 仍只是提示', async () => {
    headBytes = String(4 * 1024 * 1024);
    render(<CoverColorImagesSection {...props} cover="/api/file/x/big.png" />);
    await waitFor(() => expect(screen.getByText(/超过平台上限 3MB/)).toBeTruthy());
    expect(screen.queryByText(/主图不合规/)).toBeNull();
  });

  it('非 1:1 给建议', async () => {
    mocked = { w: 502, h: 845, white: 0, subject: 1 };
    render(<CoverColorImagesSection {...props} cover="/api/file/x/tall.png" />);
    await waitFor(() => expect(screen.getByText(/不是 1:1/)).toBeTruthy());
  });

  it('拿不到字节数时不得判体积不合格', async () => {
    headBytes = null;
    render(<CoverColorImagesSection {...props} cover="/api/file/x/nolen.png" />);
    await waitFor(() => expect(screen.getByText(/1000×1000/)).toBeTruthy());
    expect(screen.queryByText(/超过平台上限/)).toBeNull();
  });

  it('必须显式列出机器判不了的人工检查项', async () => {
    render(<CoverColorImagesSection {...props} cover="/api/file/x/ok.png" />);
    expect(screen.getByText(/机器无法判定/)).toBeTruthy();
    expect(screen.getByText(/联系方式/)).toBeTruthy();
  });
});