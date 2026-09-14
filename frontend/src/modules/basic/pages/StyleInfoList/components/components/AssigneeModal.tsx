import React, { useEffect, useMemo, useState } from 'react';
import { Form, Select, Spin, InputNumber, Tag, Space, Typography } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import type { SubProcessRow } from '../SampleProcessList.helpers';

// 指派人员弹窗（从 SampleProcessList.tsx 拆分而来）
// D-FIX：原实现只有一个 Input 让用户手输姓名，导致"搜不到人"——根本没搜索功能
// 改为 Select + showSearch，数据源 GET /factory-worker/list（按 tenant_id+factory_id 过滤）
// D-P2-7：弹窗里展示当前 color/size + 可编辑 quantity，让工人明确"我负责什么颜色多少件"

interface WorkerOption {
  id: string;
  workerNo?: string;
  workerName: string;
  phone?: string;
  status?: string;
}

export interface AssigneeModalProps {
  open: boolean;
  assigningRow: SubProcessRow | null;
  loading: boolean;
  form: FormInstance;
  onCancel: () => void;
  onOk: () => void;
}

const { Text } = Typography;

// 从 SubProcessRow.quantity 字符串里解析数字（如 "10" → 10；"1种面料" → null）
function parseQuantity(qtyStr: string | undefined): number | null {
  if (!qtyStr) return null;
  const trimmed = String(qtyStr).trim();
  if (!trimmed) return null;
  // 纯数字直接解析
  const n = Number(trimmed);
  if (!Number.isNaN(n) && Number.isFinite(n) && n > 0) return Math.floor(n);
  // 包含数字的字符串（如 "10件"）尝试提取
  const matched = trimmed.match(/(\d+)/);
  if (matched) {
    const v = Number(matched[1]);
    if (!Number.isNaN(v) && v > 0) return v;
  }
  return null;
}

const AssigneeModal: React.FC<AssigneeModalProps> = ({ open, assigningRow, loading, form, onCancel, onOk }) => {
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);

  // D-P2-7：从 assigningRow 解析默认数量
  const defaultQuantity = useMemo(() => parseQuantity(assigningRow?.quantity), [assigningRow?.quantity]);
  const hasColorOrSize = !!(assigningRow?.color || assigningRow?.size);

  // 弹窗打开时拉取工人列表（按 status=active 过滤）
  useEffect(() => {
    if (!open || fetched) return;
    let cancelled = false;
    setFetching(true);
    (async () => {
      try {
        const res = await api.get<{ code: number; data?: WorkerOption[]; message?: string }>(
          '/factory-worker/list',
          { params: { status: 'active' } },
        );
        if (cancelled) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        setWorkers(list);
        setFetched(true);
      } catch {
        if (!cancelled) setWorkers([]);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, fetched]);

  // 弹窗打开时把默认数量塞进 form（让 onOk 拿得到）
  useEffect(() => {
    if (open && defaultQuantity != null) {
      form.setFieldValue('quantity', defaultQuantity);
    }
  }, [open, defaultQuantity, form]);

  // 关闭弹窗时重置 fetched，下次打开重新拉取
  useEffect(() => {
    if (!open) setFetched(false);
  }, [open]);

  return (
    <ResizableModal
      title={`指派 — ${assigningRow?.name || ''}`}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={loading}
      okText="确认指派"
      cancelText="取消"
      // 渲染到 document.body，避免被外层 StyleStageDrawer 的堆叠上下文困住
      getContainer={() => document.body}
      // 高于 StyleStageDrawer（默认 1000）和 PurchaseDrawer/RemarkTimelineModal（1050）
      zIndex={1100}
    >
      <Form form={form} layout="vertical">
        {/* D-P2-7：当前样板颜色/尺码只读展示，让用户明确"指派的是什么颜色什么尺码" */}
        {hasColorOrSize && (
          <Form.Item label="当前样板" style={{ marginBottom: 12 }}>
            <Space size={[8, 4]} wrap>
              {assigningRow?.color ? <Tag color="blue">颜色：{assigningRow.color}</Tag> : null}
              {assigningRow?.size ? <Tag color="purple">尺码：{assigningRow.size}</Tag> : null}
            </Space>
          </Form.Item>
        )}

        {/* D-P2-7：数量可编辑（多色多码场景下，工人需要明确"我负责多少件"） */}
        <Form.Item
          name="quantity"
          label="指派数量"
          tooltip="多色多码时，工人需要明确自己负责多少件。默认填样板原数量，可调整。"
          rules={[{ required: true, message: '请填写指派数量' }]}
        >
          <InputNumber
            min={1}
            step={1}
            precision={0}
            placeholder="请输入指派数量"
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item name="assignee" label="指派人员" rules={[{ required: true, message: '请选择指派人员' }]}>
          <Select
            showSearch
            placeholder="搜索工人姓名/编号/电话"
            // 客户端模糊过滤：按 workerName/workerNo/phone 任意匹配
            filterOption={(input, option) => {
              const kw = (input || '').trim().toLowerCase();
              if (!kw) return true;
              const label = String(option?.label ?? '').toLowerCase();
              return label.includes(kw);
            }}
            notFoundContent={fetching ? <Spin size="small" /> : '暂无工人，请在系统管理-工厂工人中添加'}
            options={workers.map((w) => ({
              value: w.workerName,
              label: `${w.workerName}${w.workerNo ? `（${w.workerNo}）` : ''}${w.phone ? ` · ${w.phone}` : ''}`,
            }))}
            // D-P2-7：后端 assignee 接口已扩展接收 quantity，一起提交
            allowClear
          />
        </Form.Item>

        {defaultQuantity != null && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            样板原数量：{defaultQuantity} 件{defaultQuantity !== form.getFieldValue('quantity') ? '（已调整）' : ''}
          </Text>
        )}
      </Form>
    </ResizableModal>
  );
};

export default AssigneeModal;
