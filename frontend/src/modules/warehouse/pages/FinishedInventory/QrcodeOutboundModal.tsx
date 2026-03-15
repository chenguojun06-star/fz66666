import React, { useRef, useState } from 'react';
import { App, Button, InputNumber, Space, Table, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, ScanOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';

interface QrcodeItem {
  key: string;
  qrCode: string;
  quantity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * 扫码批量出库弹窗
 * 支持手动输入或扫描枪输入 QR 码（格式：款号-颜色-尺码-序号），
 * 每项可自定义出库数量，支持分批出库。
 */
const QrcodeOutboundModal: React.FC<Props> = ({ open, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [items, setItems] = useState<QrcodeItem[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const code = inputVal.trim();
    if (!code) { message.warning('请输入或扫描二维码'); return; }

    setItems(prev => {
      // 相同 QR 码合并数量，或新增一行
      const idx = prev.findIndex(it => it.qrCode === code);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { key: `${code}-${Date.now()}`, qrCode: code, quantity: 1 }];
    });
    setInputVal('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleQtyChange = (key: string, val: number | null) => {
    setItems(prev => prev.map(it => it.key === key ? { ...it, quantity: val ?? 1 } : it));
  };

  const handleRemove = (key: string) => {
    setItems(prev => prev.filter(it => it.key !== key));
  };

  const handleSubmit = async () => {
    if (items.length === 0) { message.warning('请先扫码添加出库明细'); return; }
    setSubmitting(true);
    try {
      await api.post('/warehouse/finished-inventory/qrcode-outbound', {
        items: items.map(it => ({ qrCode: it.qrCode, quantity: it.quantity })),
      });
      message.success(`出库成功，共 ${items.length} 项`);
      setItems([]);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      message.error(err?.message || '出库失败，请检查库存或二维码格式');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setItems([]);
    setInputVal('');
    onClose();
  };

  const columns = [
    {
      title: '二维码内容',
      dataIndex: 'qrCode',
      key: 'qrCode',
      ellipsis: true,
    },
    {
      title: '出库数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 130,
      render: (_: number, record: QrcodeItem) => (
        <InputNumber
          min={1}
          max={9999}
          value={record.quantity}
          onChange={val => handleQtyChange(record.key, val)}
          style={{ width: 100 }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 70,
      render: (_: unknown, record: QrcodeItem) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemove(record.key)}
        />
      ),
    },
  ];

  const totalQty = items.reduce((s, it) => s + it.quantity, 0);

  return (
    <ResizableModal
      title="扫码出库"
      open={open}
      onCancel={handleClose}
      width="40vw"
      footer={
        <Space>
          <Typography.Text type="secondary">
            共 {items.length} 项，合计 {totalQty} 件
          </Typography.Text>
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            icon={<ScanOutlined />}
            loading={submitting}
            disabled={items.length === 0}
            onClick={handleSubmit}
          >
            确认出库
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="扫描枪扫码或手动输入二维码（Enter 添加）"
          style={{
            flex: 1,
            height: 32,
            padding: '4px 11px',
            border: '1px solid #d9d9d9',
            borderRight: 'none',
            borderRadius: '6px 0 0 6px',
            outline: 'none',
            fontSize: 14,
          }}
          autoFocus
        />
        <Button icon={<PlusOutlined />} onClick={handleAdd} style={{ borderRadius: '0 6px 6px 0' }}>
          添加
        </Button>
      </Space.Compact>

      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        二维码格式：款号-颜色-尺码-序号（如 HHY001-白色-S-1）。相同商品可修改数量，支持分批多次扫码。
      </Typography.Text>

      <Table
        size="small"
        dataSource={items}
        columns={columns}
        pagination={false}
        locale={{ emptyText: '暂无出库明细，请扫码或输入二维码' }}
        scroll={{ y: 340 }}
      />
    </ResizableModal>
  );
};

export default QrcodeOutboundModal;
