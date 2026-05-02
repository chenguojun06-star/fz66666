import { useState } from 'react';
import { Form } from 'antd';
import { useModal } from '@/hooks';
import { materialInventoryApi } from '@/services/warehouse/materialInventoryApi';
import type { MaterialOutboundPrintPayload } from '../components/MaterialOutboundPrintModal';
import { message } from '@/utils/antdStatic';
import { safePrint } from '@/utils/safePrint';
import QRCode from 'qrcode';
import type { MaterialInventory } from '../types';

interface InboundFlowDeps {
  user: { name?: string; username?: string; id?: string } | null | undefined;
  fetchData: () => void;
  openPrintModal: (payload: MaterialOutboundPrintPayload) => void;
}

export function useInboundFlow({ user, fetchData }: InboundFlowDeps) {
  const [generatingRolls, setGeneratingRolls] = useState(false);
  const [inboundForm] = Form.useForm();
  const [rollForm] = Form.useForm();
  const inboundModal = useModal<MaterialInventory>();
  const rollModal = useModal<{ inboundId: string; materialCode: string; materialName: string }>();

  const handleInbound = (record?: MaterialInventory) => {
    if (record) {
      inboundForm.setFieldsValue({
        materialCode: record.materialCode,
        materialName: record.materialName,
        warehouseLocation: record.warehouseLocation,
      });
    }
    inboundModal.open(record ?? undefined);
  };

  const handleInboundConfirm = async () => {
    try {
      const values: any = await inboundForm.validateFields();
      const response = await materialInventoryApi.manualInbound({
        materialCode: values.materialCode,
        materialName: values.materialName || '',
        materialType: values.materialType || '面料',
        color: values.color || '',
        size: values.size || '',
        quantity: values.quantity,
        warehouseLocation: values.warehouseLocation || '默认仓',
        supplierName: values.supplierName || '',
        supplierId: values.supplierId || '',
        supplierContactPerson: values.supplierContactPerson || '',
        supplierContactPhone: values.supplierContactPhone || '',
        operatorId: user?.id || '',
        operatorName: user?.name || user?.username || '系统',
        remark: values.remark || '',
      });
      if (response?.code === 200 && response.data) {
        const { inboundNo, inboundId } = response.data;
        inboundModal.close();
        inboundForm.resetFields();
        void fetchData();
        const mat = inboundModal.data;
        rollForm.setFieldsValue({ rollCount: 1, quantityPerRoll: values.quantity, unit: '件' });
        rollModal.open({
          inboundId: inboundId || '',
          materialCode: mat?.materialCode || values.materialCode || '',
          materialName: mat?.materialName || values.materialName || '',
        });
        message.success(`入库成功！单号：${inboundNo}，请在弹窗中生成料卷标签`);
      } else {
        message.error((response as any)?.message || '入库失败');
      }
    } catch (error: unknown) {
      const errMsg = typeof error === 'object' && error !== null && 'response' in error
        ? String((error as Record<string, any>).response?.data?.message || '') : '';
      message.error(errMsg || (error instanceof Error ? error.message : '入库操作失败，请重试'));
    }
  };

  const printRollQrLabels = async (rolls: any[]) => {
    const items = await Promise.all(
      rolls.map(async (r) => {
        const qrUrl = await QRCode.toDataURL(r.rollCode, { width: 200, margin: 1 });
        return { ...r, qrUrl };
      }),
    );
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>料卷二维码标签</title><style>
      body{font-family:'Heiti SC','Songti SC','Hiragino Sans GB','STSong','Arial Unicode MS',serif;padding:10px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .card{border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center;break-inside:avoid}
      .code{font-size:11px;color:#666;margin:2px 0}.name{font-size:12px;font-weight:bold;margin:2px 0}
      .qty{font-size:12px;color:#333;margin:2px 0} img{width:140px;height:140px}
      @media print{body{padding:0}.grid{gap:8px}}
    </style></head><body>
      <h2 style="text-align:center;margin-bottom:12px">面辅料料卷二维码标签</h2>
      <div class="grid">${items.map(r => `
        <div class="card"><img loading="lazy" src="${r.qrUrl}" />
          <div class="code">${r.rollCode}</div><div class="name">${r.materialName}</div>
          <div class="qty">${r.quantity} ${r.unit}</div><div class="code">${r.warehouseLocation}</div>
        </div>`).join('')}
      </div></body></html>`;
    safePrint(html);
  };

  const handleGenerateRollLabels = async () => {
    try {
      setGeneratingRolls(true);
      const values: any = await rollForm.validateFields();
      const { inboundId } = rollModal.data!;
      const res = await materialInventoryApi.generateRolls({
        inboundId: inboundId || undefined,
        rollCount: values.rollCount,
        quantityPerRoll: values.quantityPerRoll,
        unit: values.unit,
      });
      if (res?.code === 200 && Array.isArray(res.data)) {
        rollModal.close();
        rollForm.resetFields();
        void printRollQrLabels(res.data);
        message.success(`已生成 ${values.rollCount} 张料卷标签！`);
      } else {
        message.error(res?.message || '生成失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setGeneratingRolls(false);
    }
  };

  return {
    inboundForm, rollForm, inboundModal, rollModal, generatingRolls,
    handleInbound, handleInboundConfirm, handleGenerateRollLabels,
  };
}
