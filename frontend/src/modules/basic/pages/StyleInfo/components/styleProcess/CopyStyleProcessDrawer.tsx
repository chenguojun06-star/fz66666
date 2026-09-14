import React, { useRef } from 'react';
import { App } from 'antd';
import ImportPickerDrawer from '@/components/common/ImportPickerDrawer';
import { invalidateStageConfigBudget } from '@/utils/progressTimeBudget';
import type { StyleProcess } from '@/types/style';
import api from '@/utils/api';

interface CopyStyleProcessDrawerProps {
  open: boolean;
  onClose: () => void;
  currentStyleId: string | number;
  submitting?: boolean;
  onConfirm: (rows: StyleProcess[]) => Promise<void> | void;
}

/** D-339 拷贝其他款工序（通用导入抽屉）：选款/通用模板 → 勾选工序 → 追加（编码自动顺延）。选来源款导入时，顺带把来源款环节配置拷到当前款（样式拷贝闭环）。 */
const CopyStyleProcessDrawer: React.FC<CopyStyleProcessDrawerProps> = ({
  open, onClose, currentStyleId, submitting, onConfirm,
}) => {
  const { message: appMessage } = App.useApp();
  // 记录来源款 id（仅「按款号」来源携带；通用模板来源清空，不拷环节配置）
  const sourceStyleIdRef = useRef<string | number | null>(null);

  const handleConfirm = async (rows: StyleProcess[]) => {
    const src = sourceStyleIdRef.current;
    const tgt = currentStyleId;
    if (src != null && String(src) !== String(tgt)) {
      try {
        const res = await api.post<{ code: number; message?: string }>(
          '/production/stage-config/copy',
          null,
          { params: { sourceStyleId: String(src), targetStyleId: String(tgt) } },
        );
        if (res?.code === 200) {
          // 清掉预算天数缓存，否则拷过来的「预计时长」不会立刻反映到进度看板
          invalidateStageConfigBudget();
          appMessage.success('已顺带拷贝来源款环节配置');
        } else {
          appMessage.warning(String(res?.message || '环节配置拷贝未完成'));
        }
      } catch (e) {
        appMessage.warning(e instanceof Error ? e.message : '环节配置拷贝未完成');
      }
    }
    await onConfirm(rows);
  };

  return (
    <ImportPickerDrawer<StyleProcess>
      open={open}
      onClose={onClose}
      title="拷贝其他款工序"
      currentStyleId={currentStyleId}
      templateType="process"
      submitting={submitting}
      onSourceAvailable={(source) => { sourceStyleIdRef.current = source ? source.styleId ?? null : null; }}
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
      onConfirm={handleConfirm}
      emptyRowsText="该款暂无工序"
      footerHint="确认后追加到当前款工序，编码自动顺延"
    />
  );
};

export default CopyStyleProcessDrawer;
