import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Space, Spin, Switch, Tag, Typography } from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, HolderOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/antdStatic';
import shopAdminApi from '@/services/shop/shopApi';

const { Text } = Typography;

type ModuleItem = {
  moduleKey: string;
  defaultTitle: string;
  canHide: boolean;
  enabled: boolean;
  sortOrder: number;
};

/** 不可隐藏的模块：没有图和价格的详情页对顾客毫无意义 */
const LOCKED_MODULES = ['gallery', 'price'];

/**
 * D-770：详情页模块布局编辑器。
 *
 * <p>参照主流电商（淘宝/1688/拼多多）的「模块化装修」：
 * 提供一组固定模块，商家可**勾选启用哪些**并**调整上到下顺序**。
 *
 * <p>刻意不做自由拖拽画布 —— 移动端体验差、保存易错、顾客端渲染不可控；
 * 上移/下移按钮在手机上更可靠，也更容易保证保存结果的确定性。
 *
 * <p>列表顺序即**从上到下**的展示顺序。
 */
export function LayoutEditorSection({ styleId }: { styleId: number | null }) {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const [defs, layout] = await Promise.all([
        shopAdminApi.layoutModules(),
        shopAdminApi.getStyleLayout(styleId),
      ]);
      const defList = (defs || []) as Array<{ moduleKey: string; defaultTitle: string; canHide: boolean }>;
      const layList = (layout || []) as Array<{ moduleKey: string; enabled: number; sortOrder: number }>;
      const layMap = new Map(layList.map((l) => [l.moduleKey, l]));
      const merged: ModuleItem[] = defList.map((d, i) => ({
        moduleKey: d.moduleKey,
        defaultTitle: d.defaultTitle,
        canHide: d.canHide,
        // 无布局记录时后端返回默认（全开），这里以布局记录为准，缺失视为开启
        enabled: layMap.get(d.moduleKey)?.enabled !== 0,
        sortOrder: layMap.get(d.moduleKey)?.sortOrder ?? i,
      }));
      merged.sort((a, b) => a.sortOrder - b.sortOrder);
      setModules(merged);
      setDirty(false);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '模块布局加载失败');
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (idx: number, delta: number) => {
    setModules((prev) => {
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((m, i) => ({ ...m, sortOrder: i }));
    });
    setDirty(true);
  };

  const toggle = (key: string, on: boolean) => {
    if (LOCKED_MODULES.includes(key)) {
      message.warning('「图片轮播」「价格与库存」是顾客了解商品的必需信息，不能隐藏');
      return;
    }
    setModules((prev) => prev.map((m) => (m.moduleKey === key ? { ...m, enabled: on } : m)));
    setDirty(true);
  };

  const save = async () => {
    if (!styleId) return;
    setSaving(true);
    try {
      await shopAdminApi.saveStyleLayout(styleId, {
        modules: modules.map((m, i) => ({
          moduleKey: m.moduleKey,
          enabled: m.enabled ? 1 : 0,
          sortOrder: i,
        })),
      });
      message.success('详情页布局已保存，顾客端即时生效');
      setDirty(false);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    void load();
    message.info('已恢复为默认布局');
  };

  return (
    <div className="shop-listing__layout">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text strong>详情页布局（上到下）</Text>
        <Space size={6}>
          <Button size="small" onClick={reset} disabled={loading || saving}>恢复默认</Button>
          <Button
            size="small"
            type="primary"
            loading={saving}
            disabled={!dirty}
            onClick={() => void save()}
          >
            保存布局
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 10 }}
        message="顾客端详情页按这里的顺序从上到下展示"
        description="勾选＝显示，关闭＝整块不显示。用 ↑↓ 调整顺序。没有资料的模块会自动跳过，不会出现空白块。"
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Spin size="small" />
        </div>
      ) : (
        <div>
          {modules.map((m, idx) => (
            <div
              key={m.moduleKey}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', marginBottom: 6,
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                background: m.enabled ? 'transparent' : 'var(--color-bg-subtle)',
              }}
            >
              <HolderOutlined style={{ color: 'var(--color-text-quaternary)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text>{m.defaultTitle}</Text>
                  {m.enabled ? null : <Tag>已隐藏</Tag>}
                  {LOCKED_MODULES.includes(m.moduleKey) ? <Tag color="blue">必需</Tag> : null}
                </div>
              </div>
              <Button
                size="small"
                type="text"
                icon={<ArrowUpOutlined />}
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
                aria-label="上移"
              />
              <Button
                size="small"
                type="text"
                icon={<ArrowDownOutlined />}
                disabled={idx === modules.length - 1}
                onClick={() => move(idx, 1)}
                aria-label="下移"
              />
              <Switch
                size="small"
                checked={m.enabled}
                onChange={(v) => toggle(m.moduleKey, v)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LayoutEditorSection;