import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from 'antd';
import type { FormInstance } from 'antd';
import BatchArrivalFormBody, { type BatchArrivalRow } from '../BatchArrivalFormBody';

// 仓库/库位级联 hook 走接口，测试中直接给固定选项
vi.mock('@/hooks/useWarehouseAreaOptions', () => ({
  useWarehouseAreaOptions: () => ({
    areas: [{ id: 'a1' }],
    selectOptions: [{ label: 'WL-01 物料仓', value: 'a1' }],
    loading: false,
  }),
  useWarehouseLocationByArea: () => ({
    locations: [],
    selectOptions: [{ label: 'A-01', value: 'A-01' }],
    loading: false,
  }),
}));

const rows: BatchArrivalRow[] = [
  { id: 'p1', materialName: '人字鱼骨纹真丝羊毛面料', color: '墨蓝', purchaseQuantity: 2.02, arrivedQuantity: 0, unit: '米' },
  { id: 'p2', materialName: '好景出芽条', color: '黑金', purchaseQuantity: 6.06, arrivedQuantity: 0, unit: '米' },
] as BatchArrivalRow[];

/**
 * D-891 回归：
 * 1) Radio 可点选——曾因表单体没有 <Form> 包裹（Modal.confirm 独立 React 根）
 *    导致 form 实例不挂载、Radio 受控但写不回值，用户反馈"点击不了 选择不到"。
 * 2) 顶部「统一选择」一次应用到全部行。
 * 3) 到货数量不设上限——超量填写校验必须通过（用户多次强调采购量只是推荐值）。
 */
describe('BatchArrivalFormBody（D-891）', () => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const setup = () => {
    let formRef: FormInstance;
    const Wrapper: React.FC = () => {
      const [form] = Form.useForm();
      formRef = form;
      return <BatchArrivalFormBody form={form} rows={rows} />;
    };
    render(<Wrapper />);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { form: () => formRef! };
  };

  it('每行「直采使用」Radio 可点选并写回表单', async () => {
    const { form } = setup();
    // 顺序：全局(全部入库/全部直采) → 行0(入库/直采) → 行1(入库/直采)
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(6);
    fireEvent.click(radios[3]);
    await waitFor(() => {
      expect(form().getFieldValue(['items', 0, 'movementAction'])).toBe('direct_use');
    });
    expect((radios[3] as HTMLInputElement).checked).toBe(true);
  });

  it('顶部「统一选择-全部直采使用」一次应用到所有行', async () => {
    const { form } = setup();
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);
    await waitFor(() => {
      expect(form().getFieldValue(['items', 0, 'movementAction'])).toBe('direct_use');
      expect(form().getFieldValue(['items', 1, 'movementAction'])).toBe('direct_use');
    });
    expect(await screen.findByText(/全部为直采使用/)).toBeTruthy();
  });

  it('到货数量超过待到货不再报错（不设上限）', async () => {
    const { form } = setup();
    form().setFieldsValue({
      items: [
        { purchaseId: 'p1', arrivedQuantity: 999, movementAction: 'inbound' },
        { purchaseId: 'p2', arrivedQuantity: 50, movementAction: 'inbound' },
      ],
      warehouseLocation: 'A-01',
    });
    await expect(form().validateFields()).resolves.toBeTruthy();
  });
});
