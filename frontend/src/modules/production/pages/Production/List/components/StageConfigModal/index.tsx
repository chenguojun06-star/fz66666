/**
 * StageConfigModal — 生产环节配置弹窗
 *
 * 功能：为每个父环节（采购/裁剪/二次工艺/车缝/尾部/入库）配置：
 *   - 可操作人：勾选后仅这些人员可扫码（不勾选=所有人员可操作）
 *   - 预计时长（天）：仅展示 + 超期预警，不影响交期计算
 *   - 监控开关：开启后对超期环节进行预警
 *
 * 范围：大货与样衣共用同一套配置（按父环节名统一）。
 *      采购/入库为「默认环节」，不展示在工序列表，但可在此配置操作人+时长。
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Button,
  Switch,
  InputNumber,
  Select,
  Tag,
  Typography,
} from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import { App } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import { getStageConfig, saveStageConfig } from '@/utils/api/production.scan';
import type { StageConfigItem, StageOperator } from '@/utils/api/production.scan';

const { Text } = Typography;

// 环节固定顺序（与后端 StageConfigOrder 对齐）
const STAGE_ORDER = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

/** 默认环节（不展示在工序列表，但可配置） */
const DEFAULT_STAGES = ['采购', '入库'];

interface RowData {
  id?: number;
  stageName: string;
  expectedDays: number;
  operators: StageOperator[];
  monitorSwitch: number;
  defaultStage: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 是否主管及以上（决定是否可拉取操作人列表） */
  isSupervisorOrAbove: boolean;
}

export default function StageConfigModal({
  visible,
  onClose,
  isSupervisorOrAbove,
}: Props) {
  const { message: appMessage } = App.useApp();
  const [rows, setRows] = useState<RowData[]>([]);
  const [userOptions, setUserOptions] = useState<{ id: string; name: string; username: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 操作人下拉选项（当前租户人员）
  useEffect(() => {
    if (!visible || !isSupervisorOrAbove) return;
    (async () => {
      try {
        const res = await api.get<{ code: number; data: { records: Array<{ id: number | string; name?: string; username?: string }> } }>(
          '/system/user/list',
          { params: { page: 1, pageSize: 9999, status: 'active' } },
        );
        const records = res?.data?.records ?? [];
        setUserOptions(
          records
            .filter(r => r && (r.id != null))
            .map(r => ({
              id: String(r.id),
              name: r.name || '',
              username: r.username || '',
            })),
        );
      } catch (e) {
        appMessage.error('操作人列表加载失败');
      }
    })();
  }, [visible, isSupervisorOrAbove, appMessage]);

  // 加载现有配置
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    (async () => {
      try {
        const res = await getStageConfig();
        const list: StageConfigItem[] = res?.data ?? [];
        const byName = new Map<string, StageConfigItem>();
        list.forEach(c => c && c.stageName && byName.set(c.stageName, c));
        const next: RowData[] = STAGE_ORDER.map(name => {
          const c = byName.get(name);
          let operators: StageOperator[] = [];
          if (c) {
            if (Array.isArray(c.operators) && c.operators.length > 0) {
              operators = c.operators;
            } else if (typeof c.operatorsJson === 'string' && c.operatorsJson) {
              try {
                const parsed = JSON.parse(c.operatorsJson);
                if (Array.isArray(parsed)) operators = parsed;
              } catch (e) { /* ignore */ }
            }
          }
          return {
            id: c?.id,
            stageName: name,
            expectedDays: Number(c?.expectedDays ?? 0) || 0,
            operators,
            monitorSwitch: Number(c?.monitorSwitch ?? 1) || 1,
            defaultStage: Number(c?.defaultStage ?? 0) || (DEFAULT_STAGES.includes(name) ? 1 : 0),
          };
        });
        setRows(next);
      } catch (e) {
        appMessage.error('环节配置加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, appMessage]);

  function updateRow(stageName: string, patch: Partial<RowData>) {
    setRows(prev => prev.map(r => (r.stageName === stageName ? { ...r, ...patch } : r)));
  }

  const changeOperators = useCallback(
    (stageName: string, ids: string[]) => {
      const operators = ids.map(id => {
        const u = userOptions.find(o => o.id === id);
        return { id, name: u?.name || '' };
      });
      updateRow(stageName, { operators });
    },
    [userOptions],
  );

  async function handleSave() {
    setSaving(true);
    try {
      const payload: StageConfigItem[] = rows.map(r => ({
        id: r.id,
        stageName: r.stageName,
        expectedDays: r.expectedDays,
        operators: r.operators,
        operatorsJson: JSON.stringify(r.operators || []),
        monitorSwitch: r.monitorSwitch,
        defaultStage: r.defaultStage,
      }));
      const res = await saveStageConfig(payload);
      if (res?.code === 200) {
        appMessage.success('环节配置已保存');
        onClose();
      } else {
        appMessage.error(res?.message || '保存失败');
      }
    } catch (e: any) {
      appMessage.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnsType<RowData>>(() => [
    {
      title: '环节',
      dataIndex: 'stageName',
      key: 'stageName',
      width: 160,
      render: (name: string, row: RowData) => (
        <div className="u-d-flex u-fd-column" style={{ gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{name}</Text>
          {row.defaultStage === 1 && (
            <Tag color="orange" style={{ width: 'fit-content', margin: 0, fontSize: 12 }}>
              默认环节 · 不展示在工序列表
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '可操作人',
      key: 'operators',
      render: (_: unknown, row: RowData) => (
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="不配置=所有人员可操作"
          value={row.operators.map(o => o.id)}
          onChange={(ids: string[]) => changeOperators(row.stageName, ids)}
          options={userOptions.map(u => ({
            value: u.id,
            label: u.name ? `${u.name}（${u.username || u.id}）` : u.username || u.id,
          }))}
          style={{ width: '100%', maxWidth: 420 }}
          notFoundContent="无可选人员"
        />
      ),
    },
    {
      title: '预计时长（天）',
      dataIndex: 'expectedDays',
      key: 'expectedDays',
      width: 140,
      render: (v: number, row: RowData) => (
        <InputNumber
          value={v}
          min={0}
          max={999}
          precision={1}
          placeholder="0"
          onChange={val => updateRow(row.stageName, { expectedDays: Number(val ?? 0) || 0 })}
          style={{ width: 110 }}
        />
      ),
    },
    {
      title: '超期预警',
      dataIndex: 'monitorSwitch',
      key: 'monitorSwitch',
      width: 110,
      render: (v: number, row: RowData) => (
        <Switch
          checked={v === 1}
          checkedChildren="开"
          unCheckedChildren="关"
          onChange={checked => updateRow(row.stageName, { monitorSwitch: checked ? 1 : 0 })}
        />
      ),
    },
  ], [changeOperators, userOptions]);

  return (
    <ResizableModal
      title="环节配置"
      open={visible}
      onCancel={onClose}
      width="85vw"
      destroyOnHidden
      footer={null}
    >
      {/* 顶部说明条 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, padding: '8px 12px',
        background: 'var(--color-bg-highlight)', border: '1px solid var(--color-blue-200)', borderRadius: 6,
      }}>
        <span className="u-fs-14" style={{ color: 'var(--color-gray-700)' }}>
          配置后可操作人仅限对应人员扫码，不配置则所有人员可操作；预计时长仅展示+超期预警，不参与交期计算。大货与样衣共用本配置。
        </span>
        <div className="u-d-flex u-gap-8">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
        </div>
      </div>

      <ResizableTable<RowData>
        storageKey="stage-config-table"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        rowKey={(r) => r.id ?? r.stageName}
        bordered
        emptyDescription="暂无环节配置"
      />
    </ResizableModal>
  );
}