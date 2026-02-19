import React, { useEffect, useState } from 'react';
import { App, Button, Input, InputNumber, Modal, Space, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { SaveOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import api, { toNumberSafe } from '@/utils/api';
import StyleStageControlBar from './StyleStageControlBar';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  sizePriceAssignee?: string;
  sizePriceStartTime?: string;
  sizePriceCompletedTime?: string;
  onRefresh?: () => void;
}

interface SizePrice {
  id?: string;
  styleId: number;
  processCode: string;
  processName: string;
  progressStage?: string;
  size: string;
  price: number;
}

interface ProcessRow {
  processCode: string;
  processName: string;
  progressStage?: string;
  [key: string]: any; // 动态尺码价格字段
}

const normalizeSize = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

const expandXlSize = (value: string) => {
  const match = value.match(/^(\d+)XL$/i);
  if (match) {
    const count = Number(match[1]);
    if (Number.isFinite(count) && count > 0) {
      return `${'X'.repeat(count)}L`;
    }
  }
  return value;
};

const sizeOrder = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'XXXXXL', 'XXXXXXL'];

const getSizeWeight = (value: string) => {
  const normalized = expandXlSize(normalizeSize(value));
  if (!normalized) {
    return { group: 3, num: 0, text: '' };
  }
  if (normalized === '均码' || normalized === 'FREE' || normalized === 'F') {
    return { group: 2, num: 0, text: normalized };
  }
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return { group: 1, num: Number(normalized), text: normalized };
  }
  const mappedIndex = sizeOrder.indexOf(normalized);
  if (mappedIndex >= 0) {
    return { group: 0, num: mappedIndex, text: normalized };
  }
  const xlMatch = normalized.match(/^(\d+)X?L$/);
  if (xlMatch) {
    const count = Number(xlMatch[1]);
    if (Number.isFinite(count) && count > 0) {
      return { group: 0, num: sizeOrder.length + count, text: normalized };
    }
  }
  return { group: 2, num: 0, text: normalized };
};

const sortSizes = (list: string[]) => {
  const unique = Array.from(new Set(list.map((v) => normalizeSize(v)).filter(Boolean)));
  return unique.sort((a, b) => {
    const wa = getSizeWeight(a);
    const wb = getSizeWeight(b);
    if (wa.group !== wb.group) {
      return wa.group - wb.group;
    }
    if (wa.group === 0 || wa.group === 1) {
      return wa.num - wb.num;
    }
    return wa.text.localeCompare(wb.text, 'zh-Hans-CN', { numeric: true });
  });
};

const StyleSizePriceTab: React.FC<Props> = ({
  styleId,
  readOnly,
  sizePriceAssignee,
  sizePriceStartTime,
  sizePriceCompletedTime,
  onRefresh,
}) => {
  const { message } = App.useApp();
  const [data, setData] = useState<ProcessRow[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [editingSizes, setEditingSizes] = useState(false);
  const [newSize, setNewSize] = useState('');

  const getErrorStatus = (err: unknown) => {
    const anyErr = err as { status?: number; response?: { status?: number } };
    return Number(anyErr?.status || anyErr?.response?.status || 0);
  };

  const handleAuthError = (err: unknown) => {
    const status = getErrorStatus(err);
    if (status === 401 || status === 403) {
      message.error('登录已过期，请重新登录');
      setErrorMsg('登录已过期，请重新登录');
      return true;
    }
    return false;
  };

  // 获取尺码列表（从已保存的多码单价中提取，或使用默认尺码）
  const fetchSizes = async () => {
    if (!styleId || styleId === 'undefined') {
      return [];
    }
    try {
      // 先尝试从已保存的多码单价中获取尺码
      const res = await api.get<{ code: number; data: SizePrice[] }>(`/style/size-price/list`, {
        params: { styleId }
      });
      if (res.code === 200 && res.data && res.data.length > 0) {
        // 从已保存的数据中提取不重复的尺码
        const sizeSet = new Set<string>();
        (res.data || []).forEach((item: SizePrice) => {
          if (item.size) {
            sizeSet.add(item.size.trim());
          }
        });
        const sizeList = sortSizes(Array.from(sizeSet));
        if (sizeList.length > 0) {
          setSizes(sizeList);
          return sizeList;
        }
      }

      // 如果没有已保存的数据，使用默认尺码
      const defaultSizes = sortSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      setSizes(defaultSizes);
      return defaultSizes;
    } catch (error) {
      if (handleAuthError(error)) {
        return [];
      }
      console.error('获取尺码失败', error);
      // 出错时也使用默认尺码
      const defaultSizes = sortSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      setSizes(defaultSizes);
      return defaultSizes;
    }
  };

  // 获取工序列表
  const fetchProcesses = async () => {
    if (!styleId || styleId === 'undefined') {
      return [];
    }
    try {
      const res = await api.get<{ code: number; data: any[] }>(`/style/process/list`, {
        params: { styleId }
      });
      if (res.code === 200) {
        const processList = res.data || [];
        setProcesses(processList);
        if (processList.length === 0) {
          setErrorMsg('请先配置工序单价');
        }
        return processList;
      }
    } catch (error) {
      if (handleAuthError(error)) {
        return [];
      }
      console.error('获取工序失败', error);
      setErrorMsg('获取工序失败，请检查网络连接');
    }
    return [];
  };

  // 获取多码单价数据
  const fetchData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [sizeList, processList] = await Promise.all([fetchSizes(), fetchProcesses()]);

      // 检查工序是否配置
      if (processList.length === 0) {
        setErrorMsg('请先配置工序单价');
        setLoading(false);
        return;
      }

      const res = await api.get<{ code: number; data: SizePrice[] }>(`/style/size-price/list`, {
        params: { styleId }
      });

      if (res.code === 200) {
        const sizePriceData = res.data || [];

        // 构建表格数据：每个工序一行，尺码作为列
        const rows: ProcessRow[] = processList.map(proc => {
          const row: ProcessRow = {
            processCode: proc.processCode,
            processName: proc.processName,
            progressStage: proc.progressStage || '',
          };

          // 为每个尺码添加价格列
          sizeList.forEach(size => {
            const found = sizePriceData.find(
              sp => sp.processCode === proc.processCode && sp.size === size
            );
            // 如果没有配置多码单价，默认使用工序单价
            row[`price_${size}`] = found ? toNumberSafe(found.price) : toNumberSafe(proc.price);
          });

          return row;
        });

        setData(rows);
        setEditMode(false);
      }
    } catch (error) {
      if (handleAuthError(error)) {
        return;
      }
      message.error('获取数据失败');
      setErrorMsg('获取数据失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [styleId]);

  // 更新字段值
  const updateField = (processCode: string, field: string, value: any) => {
    setData(prev => prev.map(r => (r.processCode === processCode ? { ...r, [field]: value } : r)));
  };

  // 添加尺码
  const addSize = () => {
    const trimmed = newSize.trim().toUpperCase();
    if (!trimmed) {
      message.warning('请输入尺码');
      return;
    }
    if (sizes.includes(trimmed)) {
      message.warning('该尺码已存在');
      return;
    }

    // 添加尺码到列表
    const newSizes = sortSizes([...sizes, trimmed]);
    setSizes(newSizes);

    // 为所有工序添加该尺码的默认单价
    setData(prev => prev.map(row => ({
      ...row,
      [`price_${trimmed}`]: row.price || 0 // 使用工序基础单价作为默认值
    })));

    setNewSize('');
    message.success(`已添加尺码: ${trimmed}`);
  };

  // 删除尺码
  const removeSize = (size: string) => {
    const newSizes = sortSizes(sizes.filter(s => s !== size));
    setSizes(newSizes);

    // 从所有工序中删除该尺码的价格字段
    setData(prev => prev.map(row => {
      const newRow: ProcessRow = {
        processCode: row.processCode,
        processName: row.processName,
        progressStage: row.progressStage,
      };
      // 复制其他尺码的价格字段（排除要删除的尺码）
      newSizes.forEach(s => {
        newRow[`price_${s}`] = row[`price_${s}`];
      });
      return newRow;
    }));

    message.success(`已删除尺码: ${size}`);
  };

  // 保存数据
  const saveAll = async () => {
    setSaving(true);
    try {
      // 转换为后端需要的格式
      const list: SizePrice[] = [];
      data.forEach(row => {
        sizes.forEach(size => {
          const price = toNumberSafe(row[`price_${size}`]);
          list.push({
            styleId: Number(styleId),
            processCode: row.processCode,
            processName: row.processName,
            progressStage: row.progressStage,
            size,
            price,
          });
        });
      });

      const res = await api.post('/style/size-price/batch-save', list);
      if (res.code === 200) {
        message.success('保存成功');
        setEditMode(false);
        fetchData();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (error: any) {
      if (handleAuthError(error)) {
        return;
      }
      const anyError = error as { message?: string };
      message.error(anyError?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 构建动态列
  const columns = [
    {
      title: '工序编码',
      dataIndex: 'processCode',
      width: 100,
      fixed: 'left' as const,
    },
    {
      title: '工序名称',
      dataIndex: 'processName',
      width: 120,
      fixed: 'left' as const,
    },
    {
      title: '进度节点',
      dataIndex: 'progressStage',
      width: 100,
      fixed: 'left' as const,
      render: (text: string) => text || '-',
    },
    ...sizes.map(size => ({
      title: `${size}码单价`,
      dataIndex: `price_${size}`,
      width: 120,
      render: (text: number, record: ProcessRow) =>
        editMode ? (
          <InputNumber
            value={record[`price_${size}`]}
            min={0}
            step={0.01}
            prefix="¥"
            style={{ width: '100%' }}
            onChange={(v) => updateField(record.processCode, `price_${size}`, v)}
          />
        ) : (
          `¥${toNumberSafe(text).toFixed(2)}`
        ),
    })),
  ];

  return (
    <div>
      {/* 码数单价阶段状态控制栏 */}
      <StyleStageControlBar
        stageName="码数单价"
        styleId={styleId}
        apiPath="size-price"
        status={sizePriceCompletedTime ? 'COMPLETED' : sizePriceStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={sizePriceAssignee}
        startTime={sizePriceStartTime}
        completedTime={sizePriceCompletedTime}
        readOnly={readOnly}
        onRefresh={onRefresh ?? (() => fetchData())}
        onBeforeComplete={async () => {
          if (data.length === 0) {
            message.error('请先配置码数单价数据');
            return false;
          }
          return true;
        }}
      />
      {errorMsg && (
        <div style={{
          padding: '16px',
          marginBottom: '16px',
          background: '#fff7e6',
          border: '1px solid #ffd591',

          color: 'var(--warning-color-dark)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>⚠️ 提示：</strong> {errorMsg}
          </div>
          <Button size="small" onClick={fetchData} loading={loading}>
            刷新数据
          </Button>
        </div>
      )}

      {!errorMsg && (
        <>
          <div style={{
            padding: '12px',
            marginBottom: '16px',
            background: '#f0f7ff',

            fontSize: '13px',
            color: 'var(--neutral-text-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}>
            <div>
              <strong>使用说明：</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                <li>此功能用于配置不同尺码下的工序单价</li>
                <li>默认使用工序表中的单价，可针对特殊尺码调整价格</li>
                <li>例如：XL码和XXL码的车缝工序可能比S码更贵</li>
                <li style={{ color: 'var(--primary-color)', fontWeight: 500 }}>
                  当前已加载 {processes.length} 个工序，{sizes.length} 个尺码
                </li>
              </ul>
            </div>
            <Button size="small" onClick={fetchData} loading={loading}>
              刷新数据
            </Button>
          </div>

          {/* 尺码管理区域 */}
          <div style={{
            marginBottom: 16,
            padding: '12px',
            background: '#fafafa',

            border: '1px solid #d9d9d9'
          }}>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: '13px' }}>尺码管理</div>
            <Space wrap>
              {sizes.map(size => (
                <Tag
                  key={size}
                  closable={!readOnly && editingSizes}
                  onClose={() => removeSize(size)}
                  style={{ fontSize: '13px', padding: '2px 8px' }}
                >
                  {size}
                </Tag>
              ))}
              {editingSizes && !readOnly && (
                <Space.Compact style={{ width: 200 }}>
                  <Input
                    placeholder="输入尺码(如XL)"
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    onPressEnter={addSize}
                    style={{ width: 140 }}
                  />
                  <Button type="primary" onClick={addSize}>
                    添加
                  </Button>
                </Space.Compact>
              )}
            </Space>
            <div style={{ marginTop: 8 }}>
              {!readOnly && (
                <Button
                  size="small"
                  type="link"
                  onClick={() => setEditingSizes(!editingSizes)}
                >
                  {editingSizes ? '完成编辑' : '编辑尺码'}
                </Button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div />
            <Space>
              {!editMode || readOnly ? (
                <Button
                  onClick={() => setEditMode(true)}
                  disabled={loading || saving || readOnly || data.length === 0}
                >
                  编辑
                </Button>
              ) : (
                <>
                  <Button
                    type="primary"
                    loading={saving}
                    onClick={async () => {
                      // 首次保存时自动触发开始
                      if (!sizePriceStartTime && styleId) {
                        await api.post(`/style/info/${styleId}/size-price/start`).catch(() => {});
                        if (onRefresh) onRefresh();
                      }
                      saveAll();
                    }}
                  >
                    保存
                  </Button>
                  <Button type="default" disabled={saving} onClick={() => {
                    Modal.confirm({
                      title: '放弃未保存的修改？',
                      onOk: () => { setEditMode(false); fetchData(); },
                    });
                  }}>
                    取消
                  </Button>
                </>
              )}
            </Space>
          </div>

          <ResizableTable
            storageKey="style-size-price"
            bordered
            dataSource={data}
            columns={columns}
            pagination={false}
            loading={loading}
            rowKey="processCode"
            scroll={{ x: 'max-content' }}
            size="small"
            locale={{
              emptyText: sizes.length === 0
                ? '请先在基础信息中配置尺码'
                : processes.length === 0
                ? '请先配置工序单价'
                : '暂无数据'
            }}
          />
        </>
      )}
    </div>
  );
};

export default StyleSizePriceTab;
