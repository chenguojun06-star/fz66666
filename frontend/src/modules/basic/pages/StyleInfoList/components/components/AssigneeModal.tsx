import React, { useEffect, useState } from 'react';
import { Form, Select, Spin } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import type { SubProcessRow } from '../SampleProcessList.helpers';

// 指派人员弹窗（从 SampleProcessList.tsx 拆分而来）
// D-FIX：原实现只有一个 Input 让用户手输姓名，导致"搜不到人"——根本没搜索功能
// 改为 Select + showSearch，数据源 GET /factory-worker/list（按 tenant_id+factory_id 过滤）

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

const AssigneeModal: React.FC<AssigneeModalProps> = ({ open, assigningRow, loading, form, onCancel, onOk }) => {
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);

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
            // 后端 assignee 接口只接收 String 姓名，这里仍然提交 workerName 字符串
            // 如需 assigneeId 联动，需后端 PatternProductionController 升级字段
            allowClear
          />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default AssigneeModal;
