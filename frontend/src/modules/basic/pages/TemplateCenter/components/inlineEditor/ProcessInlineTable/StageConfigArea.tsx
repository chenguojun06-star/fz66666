/**
 * StageConfigArea — 内嵌于「工序模板」编辑界的环节配置区
 *
 * 功能：直接嵌在工序表编辑界面（ProcessInlineTable）上方，按「父环节（进度节点）」配置：
 *   - 可操作人（可多选）：配置后仅这些人员可扫码（不配置=所有人员可操作）
 *   - 预计时长（天）：仅展示 + 超期预警，不影响交期计算
 *   - 超期预警开关
 *
 * 数据：写入 t_stage_config（按租户），扫码拦截(StageGatekeeper)+看板预警直接生效。
 * 作用范围：不传 styleId → 全厂基线一套（模板中心）；传 styleId → 该款独立配置，未配置回退基线。
 * 默认环节：采购/入库 为「默认环节 · 不属生产工序」，仍可配负责人+时长。
 *
 * 说明：非弹窗、内嵌紧凑表格；负责人较长时自动换行。
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, Switch, InputNumber, Select, Tag, Typography, App, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import api from '@/utils/api';
import { getStageConfig, saveStageConfig } from '@/utils/api/production.scan';
import type { StageConfigItem, StageOperator } from '@/utils/api/production.scan';

const { Text } = Typography;

// 环节固定顺序（与后端 StageConfigService.StageConfigOrder 对齐）
const STAGE_ORDER = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

/** 默认环节（不展示在工序列表，但仍可配置） */
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
  /** 只读时隐藏编辑区（预览场景不渲染配置） */
  readOnly?: boolean;
  /** 款式ID：不传/空 = 全厂基线；传了 = 该款独立配置 */
  styleId?: string;
}

export default function StageConfigArea({ readOnly = false, styleId }: Props) {
  const { message: appMessage } = App.useApp();
  const [rows, setRows] = useState<RowData[]>([]);
  const [userOptions, setUserOptions] = useState<{ id: string; name: string; username: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isStyleScoped = Boolean(styleId);

  // 操作人下拉选项（当前租户人员）
  useEffect(() => {
    if (readOnly) return;
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
  }, [readOnly, appMessage]);

  // 加载现有配置（styleId 空=全厂生效配置；非空=该款生效配置，含基线合并）
  useEffect(() => {
    if (readOnly) return;
    setLoading(true);
    (async () => {
      try {
        const res = await getStageConfig(styleId);
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
    // styleId 变化时重载（同一组件在详情页内复用会随款切换）
  }, [readOnly, appMessage, styleId]);

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
        styleId: styleId ?? '',
        stageName: r.stageName,
        expectedDays: r.expectedDays,
        operators: r.operators,
        operatorsJson: JSON.stringify(r.operators || []),
        monitorSwitch: r.monitorSwitch,
        defaultStage: r.defaultStage,
      }));
      const res = await saveStageConfig(payload);
      if (res?.code === 200) {
        appMessage.success(isStyleScoped ? '该款环节配置已保存' : '环节配置已保存');
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
      width: 200,
      render: (name: string, row: RowData) => (
        <div className="u-d-flex u-fd-column" style={{ gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{name}</Text>
          {row.defaultStage === 1 && (
            <Tag color="orange" style={{ width: 'fit-content', margin: 0, fontSize: 12 }}>
              默认环节 · 不属生产工序
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '负责人（可多选）',
      key: 'operators',
      render: (_: unknown, row: RowData) => (
        <div className="u-d-flex u-ai-center u-gap-8" style={{ width: '100%', maxWidth: 520 }}>
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
            style={{ flex: 1, minWidth: 0 }}
            notFoundContent="无可选人员"
          />
          {/* 全选/清空与下拉同一行，避免每行多占 24px */}
          <div className="u-d-flex u-gap-4 u-fshrink-0">
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => changeOperators(row.stageName, userOptions.map(o => o.id))}>一键全选</Button>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => changeOperators(row.stageName, [])}>清空</Button>
          </div>
        </div>
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

  if (readOnly) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* 说明条 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, padding: '8px 12px',
        background: 'var(--color-bg-highlight)', border: '1px solid var(--color-blue-200)', borderRadius: 6,
      }}>
        <span className="u-fs-13" style={{ color: 'var(--color-gray-700)' }}>
          {isStyleScoped
            ? '该款式环节配置：可操作人仅限对应人员扫码，不配置则所有人员可操作；预计时长仅展示+超期预警，未配的环节回退全厂基线。采购/入库为默认环节（不属生产工序）。'
            : '环节配置（全厂基线）：可操作人仅限对应人员扫码，不配置则所有人员可操作；预计时长仅展示+超期预警，不参与交期计算。采购/入库为默认环节（不属生产工序），大货与样衣共用本配置。'}
        </span>
        <div className="u-d-flex u-gap-8" style={{ flexShrink: 0 }}>
          <Button type="primary" size="small" loading={saving} onClick={handleSave}>保存环节配置</Button>
        </div>
      </div>

      <Table<RowData>
        size="small"
        bordered
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        rowKey={(r) => r.id ?? r.stageName}
        scroll={{ x: 760 }}
      />
    </div>
  );
}