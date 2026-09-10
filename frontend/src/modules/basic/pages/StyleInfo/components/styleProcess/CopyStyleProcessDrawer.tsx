import React from 'react';
import ImportPickerDrawer from '@/components/common/ImportPickerDrawer';
import type { StyleProcess } from '@/types/style';
import api from '@/utils/api';

interface CopyStyleProcessDrawerProps {
  open: boolean;
  onClose: () => void;
  currentStyleId: string | number;
  submitting?: boolean;
  onConfirm: (rows: StyleProcess[]) => Promise<void> | void;
}

/** D-339 拷贝其他款工序（通用导入抽屉）：选款/通用模板 → 勾选工序 → 追加（编码自动顺延） */
const CopyStyleProcessDrawer: React.FC<CopyStyleProcessDrawerProps> = ({
  open, onClose, currentStyleId, submitting, onConfirm,
}) => {
  return (
    <ImportPickerDrawer<StyleProcess>
      open={open}
      onClose={onClose}
      title="拷贝其他款工序"
      currentStyleId={currentStyleId}
      templateType="process"
      submitting={submitting}
      fetchRowsByStyleId={async (sid) => {
        const res = await api.get<{ code: number; data: StyleProcess[] }>(`/style/process/list?styleId=${sid}`);
        return res.code === 200 ? (res.data || []) : [];
      }}
      fetchRowsByStyleNo={async (styleNo) => {
        const found = await api.get<{ code: number; data: { records?: Array<{ id: string | number }> } }>('/style/info/list', {
          params: { page: 1, pageSize: 1, styleNo },
        });
        const sid = found.code === 200 ? (found.data?.records || [])[0]?.id : undefined;
        if (sid == null) return [];
        const res = await api.get<{ code: number; data: StyleProcess[] }>(`/style/process/list?styleId=${sid}`);
        return res.code === 200 ? (res.data || []) : [];
      }}
      columns={[
        { title: '编码', dataIndex: 'processCode', key: 'processCode', width: 70 },
        { title: '工序名称', dataIndex: 'processName', key: 'processName', width: 180, ellipsis: true },
        { title: '进度节点', dataIndex: 'progressStage', key: 'progressStage', width: 90 },
        { title: '机器类型', dataIndex: 'machineType', key: 'machineType', width: 100, ellipsis: true, render: (v: string) => v || '-' },
        { title: '标准工时', dataIndex: 'standardTime', key: 'standardTime', width: 90, align: 'right' as const },
        { title: '单价', dataIndex: 'price', key: 'price', width: 90, align: 'right' as const, render: (v: number) => (v != null ? `¥${v}` : '-') },
      ]}
      rowKey={(r) => String(r.id ?? `${r.processCode}-${r.processName}`)}
      onConfirm={onConfirm}
      emptyRowsText="该款暂无工序"
      footerHint="确认后追加到当前款工序，编码自动顺延"
    />
  );
};

export default CopyStyleProcessDrawer;
