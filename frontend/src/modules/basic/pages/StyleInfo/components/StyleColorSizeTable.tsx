import React, { useState } from 'react';
import { App, Button, Input, InputNumber, Row, Col, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import DictAutoComplete from '@/components/common/DictAutoComplete';

interface StyleColorSizeTableProps {
  // 码数状态
  size1: string;
  size2: string;
  size3: string;
  size4: string;
  size5: string;
  setSize1: (value: string) => void;
  setSize2: (value: string) => void;
  setSize3: (value: string) => void;
  setSize4: (value: string) => void;
  setSize5: (value: string) => void;

  // 颜色状态
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  color5: string;
  setColor1: (value: string) => void;
  setColor2: (value: string) => void;
  setColor3: (value: string) => void;
  setColor4: (value: string) => void;
  setColor5: (value: string) => void;

  // 数量状态
  qty1: number;
  qty2: number;
  qty3: number;
  qty4: number;
  qty5: number;
  setQty1: (value: number) => void;
  setQty2: (value: number) => void;
  setQty3: (value: number) => void;
  setQty4: (value: number) => void;
  setQty5: (value: number) => void;

  // 常用选项
  commonSizes: string[];
  commonColors: string[];
  setCommonSizes: (sizes: string[]) => void;
  setCommonColors: (colors: string[]) => void;

  // 锁定状态
  editLocked: boolean;
  isFieldLocked: (fieldValue: any) => boolean;
}

/**
 * 颜色码数配置表组件
 * 5行表格 + 快捷标签选择
 */
const StyleColorSizeTable: React.FC<StyleColorSizeTableProps> = ({
  size1, size2, size3, size4, size5,
  setSize1, setSize2, setSize3, setSize4, setSize5,
  color1, color2, color3, color4, color5,
  setColor1, setColor2, setColor3, setColor4, setColor5,
  qty1, qty2, qty3, qty4, qty5,
  setQty1, setQty2, setQty3, setQty4, setQty5,
  commonSizes, commonColors,
  setCommonSizes, setCommonColors,
  editLocked, isFieldLocked
}) => {
  const { message } = App.useApp();

  const [showColorInput, setShowColorInput] = useState(false);
  const [showSizeInput, setShowSizeInput] = useState(false);
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');

  // 计算汇总数量
  const totalQty = qty1 + qty2 + qty3 + qty4 + qty5;

  // 快速添加码数
  const handleQuickAddSize = (size: string) => {
    if (editLocked) return;

    // 依次填充到5个码数框中（从左到右）
    if (size1 === '' || size1 === 'S') setSize1(size);
    else if (size2 === '' || size2 === 'M') setSize2(size);
    else if (size3 === '' || size3 === 'L') setSize3(size);
    else if (size4 === '' || size4 === 'XL') setSize4(size);
    else if (size5 === '' || size5 === 'XXL') setSize5(size);

    message.success(`已添加码数: ${size}`);
  };

  // 快速添加颜色
  const handleQuickAddColor = (color: string) => {
    if (editLocked) return;

    // 依次填充到5个颜色框中（从左到右）
    if (color1 === '') setColor1(color);
    else if (color2 === '') setColor2(color);
    else if (color3 === '') setColor3(color);
    else if (color4 === '') setColor4(color);
    else if (color5 === '') setColor5(color);

    message.success(`已添加颜色: ${color}`);
  };

  // 添加新码数到常用列表
  const handleAddNewSize = () => {
    if (newSize.trim() && !commonSizes.includes(newSize.trim())) {
      setCommonSizes([...commonSizes, newSize.trim()]);
      setNewSize('');
      setShowSizeInput(false);
    }
  };

  // 添加新颜色到常用列表
  const handleAddNewColor = () => {
    if (newColor.trim() && !commonColors.includes(newColor.trim())) {
      setCommonColors([...commonColors, newColor.trim()]);
      setNewColor('');
      setShowColorInput(false);
    }
  };

  return (
    <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
      <Col span={24}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>颜色码数配置：</div>

        {/* 表格和快捷标签 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* 左侧：表格 */}
          <table style={{ borderCollapse: 'collapse', border: '1px solid var(--color-border)' }}>
            <tbody>
              {/* 码数行 */}
              <tr>
                <td style={{ padding: '4px 8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-container)', fontWeight: 500, whiteSpace: 'nowrap' }}>码数</td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="size" size="small" value={size1} onChange={setSize1} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(size1)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="size" size="small" value={size2} onChange={setSize2} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(size2)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="size" size="small" value={size3} onChange={setSize3} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(size3)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="size" size="small" value={size4} onChange={setSize4} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(size4)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="size" size="small" value={size5} onChange={setSize5} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(size5)} />
                </td>
              </tr>

              {/* 颜色行 */}
              <tr>
                <td style={{ padding: '4px 8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-container)', fontWeight: 500, whiteSpace: 'nowrap', color: 'var(--color-danger)' }}>颜色</td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="color" size="small" value={color1} onChange={setColor1} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(color1)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="color" size="small" value={color2} onChange={setColor2} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(color2)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="color" size="small" value={color3} onChange={setColor3} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(color3)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="color" size="small" value={color4} onChange={setColor4} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(color4)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <DictAutoComplete dictType="color" size="small" value={color5} onChange={setColor5} style={{ width: '80px', textAlign: 'center' }} disabled={isFieldLocked(color5)} />
                </td>
              </tr>

              {/* 数量行 */}
              <tr>
                <td style={{ padding: '4px 8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-container)', fontWeight: 500, whiteSpace: 'nowrap', color: 'var(--color-danger)' }}>数量</td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <InputNumber size="small" value={qty1} onChange={(val) => setQty1(val || 0)} style={{ width: '80px' }} min={0} disabled={isFieldLocked(qty1)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <InputNumber size="small" value={qty2} onChange={(val) => setQty2(val || 0)} style={{ width: '80px' }} min={0} disabled={isFieldLocked(qty2)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <InputNumber size="small" value={qty3} onChange={(val) => setQty3(val || 0)} style={{ width: '80px' }} min={0} disabled={isFieldLocked(qty3)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <InputNumber size="small" value={qty4} onChange={(val) => setQty4(val || 0)} style={{ width: '80px' }} min={0} disabled={isFieldLocked(qty4)} />
                </td>
                <td style={{ padding: '2px 4px', border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                  <InputNumber size="small" value={qty5} onChange={(val) => setQty5(val || 0)} style={{ width: '80px' }} min={0} disabled={isFieldLocked(qty5)} />
                </td>
              </tr>
            </tbody>
          </table>

          {/* 右侧：快捷标签 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 码数快捷标签 */}
            <div>
              <Space size={[4, 4]} wrap>
                {commonSizes.map((size) => (
                  <Tag
                    key={size}
                    style={{ cursor: 'pointer', margin: 0 }}
                    onClick={() => handleQuickAddSize(size)}
                  >
                    {size}
                  </Tag>
                ))}
                {!showSizeInput ? (
                  <Tag
                    style={{ cursor: 'pointer', borderStyle: 'dashed', margin: 0 }}
                    onClick={() => !editLocked && setShowSizeInput(true)}
                  >
                    <PlusOutlined />
                  </Tag>
                ) : (
                  <Space.Compact size="small">
                    <Input
                      size="small"
                      placeholder="新码数"
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                      onPressEnter={handleAddNewSize}
                      style={{ width: 60 }}
                    />
                    <Button size="small" type="primary" onClick={handleAddNewSize}>✓</Button>
                    <Button size="small" onClick={() => {
                      setNewSize('');
                      setShowSizeInput(false);
                    }}>✕</Button>
                  </Space.Compact>
                )}
              </Space>
            </div>

            {/* 颜色快捷标签 */}
            <div>
              <Space size={[4, 4]} wrap>
                {commonColors.map((color) => (
                  <Tag
                    key={color}
                    style={{ cursor: 'pointer', margin: 0 }}
                    onClick={() => handleQuickAddColor(color)}
                  >
                    {color}
                  </Tag>
                ))}
                {!showColorInput ? (
                  <Tag
                    style={{ cursor: 'pointer', borderStyle: 'dashed', margin: 0 }}
                    onClick={() => !editLocked && setShowColorInput(true)}
                  >
                    <PlusOutlined />
                  </Tag>
                ) : (
                  <Space.Compact size="small">
                    <Input
                      size="small"
                      placeholder="新颜色"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      onPressEnter={handleAddNewColor}
                      style={{ width: 60 }}
                    />
                    <Button size="small" type="primary" onClick={handleAddNewColor}>✓</Button>
                    <Button size="small" onClick={() => {
                      setNewColor('');
                      setShowColorInput(false);
                    }}>✕</Button>
                  </Space.Compact>
                )}
              </Space>
            </div>
          </div>
        </div>

        {/* 汇总数量 */}
        {totalQty > 0 && (
          <div style={{ marginTop: 8, padding: '4px 8px', background: '#f0f9ff', border: '1px solid #91d5ff', display: 'inline-block' }}>
            <span style={{ fontWeight: 500, color: 'var(--primary-color)' }}>汇总数量：</span>
            <span style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: 'var(--primary-color)' }}>{totalQty}</span>
          </div>
        )}
      </Col>
    </Row>
  );
};

export default StyleColorSizeTable;
