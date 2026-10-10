import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CapacityLedgerTab from '../../modules/production/pages/Production/ExternalFactory/components/CapacityLedgerTab';


/**
 * 外发工厂产能台账（D-779）
 *
 * 这张表存在的全部意义，是让运营知道**订单该外推给谁**。
 * 最危险的做法是：未配置产能的工厂显示成 0 负荷，
 * 界面看上去「所有工厂都很闲」，运营就会把订单推给一家根本没填产能的厂。
 * 所以下面重点盯「不知道 ≠ 很闲」。
 */

const mockApi = vi.hoisted(() => ({ getCapacityLedger: vi.fn() }));

vi.mock('@/services/production/productionApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/production/productionApi')>();
  return { ...actual, productionOrderApi: { ...actual.productionOrderApi, ...mockApi } };
});

type Row = Record<string, unknown>;

const base: Row = {
  factoryId: 'F1',
  factoryName: '外部甲厂',
  factoryType: 'EXTERNAL',
  dailyCapacity: 100,
  realDailyOutput: 0,
  effectiveDailyCapacity: 100,
  capacitySource: 'configured',
  inProgressQuantity: 1000,
  inProgressOrders: 8,
  capacity30d: 3000,
  loadRate: 33.3,
  freeCapacity30d: 2000,
  status: 'AVAILABLE',
  qualityScore: 92,
  completionRate: 88,
  overallScore: 90,
  supplierTier: 'S',
};

beforeEach(() => {
  mockApi.getCapacityLedger.mockReset();
});

describe('外发工厂产能台账（D-779）', () => {
  it('有余量的工厂显示为可承接，并给出余量数字', async () => {
    mockApi.getCapacityLedger.mockResolvedValue({ data: [base] });
    render(<CapacityLedgerTab />);
    await waitFor(() => expect(screen.getByText('有余量')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('33.3%')).toBeTruthy());
    // 2000 同时出现在表格余量列与顶部汇总，属于预期
    await waitFor(() => expect(screen.getAllByText('2000').length).toBeGreaterThanOrEqual(1));
  });

  it('未配置产能必须显示「未配置」而不是 0', async () => {
    mockApi.getCapacityLedger.mockResolvedValue({
      data: [
        {
          ...base,
          factoryId: 'F2',
          factoryName: '外部乙厂',
          dailyCapacity: null,
          effectiveDailyCapacity: 0,
          capacitySource: 'none',
          capacity30d: 0,
          loadRate: null,
          freeCapacity30d: null,
          status: 'UNCONFIGURED',
        },
      ],
    });
    render(<CapacityLedgerTab />);
    // ⚠️ 所有断言都要包在 waitFor 里：表格是异步填的，
    // 先等到「未配置产能」标签出现，再取其他节点，中间仍可能发生一次重渲染
    // （这正是 CI 偶发失败、本地却一直通过的原因）。
    await waitFor(() => expect(screen.getByText('未配置产能')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText('未配置').length).toBeGreaterThan(0));
    // 负荷率与余量都应是「—」而不是 0%
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2));
  });

  it('未配置产能的数量必须被单独提示出来', async () => {
    mockApi.getCapacityLedger.mockResolvedValue({
      data: [
        base,
        {
          ...base,
          factoryId: 'F3',
          factoryName: '外部丙厂',
          dailyCapacity: null,
          effectiveDailyCapacity: 0,
          capacitySource: 'none',
          capacity30d: 0,
          loadRate: null,
          freeCapacity30d: null,
          status: 'UNCONFIGURED',
        },
      ],
    });
    render(<CapacityLedgerTab />);
    await waitFor(() =>
      expect(screen.getByText(/有 1 家外发工厂未配置日产能/)).toBeTruthy(),
    );
  });

  it('超载工厂负荷率标红，余量显示负数', async () => {
    mockApi.getCapacityLedger.mockResolvedValue({
      data: [
        {
          ...base,
          factoryId: 'F4',
          factoryName: '外部丁厂',
          inProgressQuantity: 6000,
          loadRate: 200,
          freeCapacity30d: -3000,
          status: 'OVERLOADED',
        },
      ],
    });
    render(<CapacityLedgerTab />);
    await waitFor(() => expect(screen.getByText('已超载')).toBeTruthy());
    // 同样要等：表格是异步填的，紧随其后的裸断言会偶发失败
    await waitFor(() => expect(screen.getByText('200%')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('-3000')).toBeTruthy());
  });

  it('负载不可知时显示「负载未知」，不给负荷率', async () => {
    mockApi.getCapacityLedger.mockResolvedValue({
      data: [
        {
          ...base,
          factoryId: 'F5',
          factoryName: '外部戊厂',
          inProgressQuantity: 0,
          inProgressOrders: 0,
          loadRate: null,
          freeCapacity30d: null,
          status: 'UNKNOWN',
        },
      ],
    });
    render(<CapacityLedgerTab />);
    await waitFor(() => expect(screen.getByText('负载未知')).toBeTruthy());
  });

  it('实测产能来源要标出来，便于判断数据可信度', async () => {
    mockApi.getCapacityLedger.mockResolvedValue({
      data: [{ ...base, capacitySource: 'real', realDailyOutput: 200 }],
    });
    render(<CapacityLedgerTab />);
    await waitFor(() => expect(screen.getByText('实测')).toBeTruthy());
  });

  it('接口失败要显式报错，不得静默空表', async () => {
    mockApi.getCapacityLedger.mockRejectedValue(new Error('网络异常'));
    render(<CapacityLedgerTab />);
    await waitFor(() => expect(screen.getByText('网络异常')).toBeTruthy());
  });

  it('必须声明近30天余量只是排产口径、不是档期预留', async () => {
    mockApi.getCapacityLedger.mockResolvedValue({ data: [base] });
    render(<CapacityLedgerTab />);
    expect(screen.getByText(/真正的可接单日期需要另建工厂档期/)).toBeTruthy();
  });
});