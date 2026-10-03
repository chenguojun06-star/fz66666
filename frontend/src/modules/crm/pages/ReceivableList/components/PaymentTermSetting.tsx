import React, { useEffect, useState } from 'react';
import { App, InputNumber, Modal, Tag } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import tenantSettingApi from '@/services/crm/tenantSettingApi';

/**
 * 应收账期设置（D-741）：出货后 N 天到期，默认 30。
 *
 * 逾期标记（后端 ReceivableOverdueJob）与前端「已逾期 N 天」高亮都基于应收单的
 * 到期日，而到期日 = 出货日期 + 账期天数——所以改这里，提醒自然跟着变。
 */
const PaymentTermSetting: React.FC = () => {
  const { message } = App.useApp();
  const [days, setDays] = useState(30);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number>(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await tenantSettingApi.get();
        const d = res?.data;
        if (d && typeof d.paymentTermDays === 'number') setDays(d.paymentTermDays);
      } catch {
        // 读不到按默认 30 展示，不阻塞页面
      }
      setLoaded(true);
    })();
  }, []);

  const handleSave = async () => {
    if (!draft || draft < 1 || draft > 365) {
      message.error('账期天数需在 1~365 之间');
      return;
    }
    try {
      setSaving(true);
      await tenantSettingApi.savePaymentTerm(draft);
      setDays(draft);
      setOpen(false);
      message.success(`已更新：出货后 ${draft} 天到期`);
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Tag
        icon={<SettingOutlined />}
        color="blue"
        style={{ cursor: 'pointer', fontSize: 13, padding: '2px 10px', marginInlineEnd: 0 }}
        onClick={() => { setDraft(days); setOpen(true); }}
        title="点击修改账期天数"
      >
        账期：出货后 {loaded ? days : 30} 天
      </Tag>
      <Modal
        title="应收账期设置"
        open={open}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setOpen(false)}
        okText="保存"
        cancelText="取消"
        width={440}
      >
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
          出货自动生成的应收单，按「出货日期 + 账期天数」计算到期日；
          超过到期日仍未收款的，自动标记逾期并计入「逾期未收」。
        </p>
        <div className="u-d-flex u-ai-center u-gap-8">
          <span>出货后</span>
          <InputNumber min={1} max={365} value={draft} onChange={(v) => setDraft(v ?? 30)} style={{ width: 100 }} />
          <span>天到期</span>
        </div>
      </Modal>
    </>
  );
};

export default PaymentTermSetting;
