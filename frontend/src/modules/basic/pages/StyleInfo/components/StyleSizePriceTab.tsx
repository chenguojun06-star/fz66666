import React, { useEffect, useState } from 'react';
import { Button, Input, InputNumber, message, Table } from 'antd';
import { SaveOutlined, EditOutlined } from '@ant-design/icons';
import api, { toNumberSafe } from '@/utils/api';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
}

interface SizePrice {
  id?: string;
  styleId: number;
  processCode: string;
  processName: string;
  size: string;
  price: number;
}

interface ProcessRow {
  processCode: string;
  processName: string;
  [key: string]: any; // 动态尺码价格字段
}

const StyleSizePriceTab: React.FC<Props> = ({ styleId, readOnly }) => {
  const [data, setData] = useState<ProcessRow[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // 获取尺码列表
  const fetchSizes = async () => {
    try {
      const res = await api.get<{ code: number; data: string }>(`/style/info/${styleId}`);
      if (res.code === 200 && res.data) {
        const sizeStr = res.data.size || '';
        const sizeList = sizeStr.split(',').map(s => s.trim()).filter(Boolean);
        setSizes(sizeList);
        return sizeList;
      }
    } catch (error) {
      console.error('获取尺码失败', error);
    }
    return [];
  };

  // 获取工序列表
  const fetchProcesses = async () => {
    try {
      const res = await api.get<{ code: number; data: any[] }>(`/style/process/list?styleId=${styleId}`);
      if (res.code === 200) {
        setProcesses(res.data || []);
        return res.data || [];
      }
    } catch (error) {
      console.error('获取工序失败', error);
    }
    return [];
  };

  // 获取多码单价数据
  const fetchData = async () => {
    setLoading(true);
    try {
      const [sizeList, processList] = await Promise.all([fetchSizes(), fetchProcesses()]);
      
      const res = await api.get<{ code: number; data: SizePrice[] }>(`/style/size-price/list?styleId=${styleId}`);
      
      if (res.code === 200) {
        const sizePriceData = res.data || [];
        
        // 构建表格数据：每个工序一行，尺码作为列
        const rows: ProcessRow[] = processList.map(proc => {
          const row: ProcessRow = {
            processCode: proc.processCode,
            processName: proc.processName,
          };
          
          // 为每个尺码添加价格列
          sizeList.forEach(size => {
            const found = sizePriceData.find(
              sp => sp.processCode === proc.processCode && sp.size === size
            );
            row[`price_${size}`] = found ? toNumberSafe(found.price) : toNumberSafe(proc.price);
          });
          
          return row;
        });
        
        setData(rows);
        setEditMode(false);
      }
    } catch (error) {
      message.error('获取数据失败');
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
      message.error(error?.message || '保存失败');
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
      width: 160,
      fixed: 'left' as const,
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!editMode || readOnly ? (
          <Button icon={<EditOutlined />} onClick={() => setEditMode(true)} disabled={loading || saving || readOnly}>
            编辑
          </Button>
        ) : (
          <>
            <Button icon={<SaveOutlined />} type="primary" onClick={saveAll} loading={saving} style={{ marginRight: 8 }}>
              保存
            </Button>
            <Button disabled={saving} onClick={() => { setEditMode(false); fetchData(); }}>
              取消
            </Button>
          </>
        )}
      </div>

      <Table
        bordered
        dataSource={data}
        columns={columns}
        pagination={false}
        loading={loading}
        rowKey="processCode"
        scroll={{ x: 'max-content' }}
        size="small"
      />
    </div>
  );
};

export default StyleSizePriceTab;
