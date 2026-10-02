# 5 月陈旧 stash 备份（2026-10-02 清理前留档）

清理了 6 条 2026-05 的 stash。删除前已逐条核实「内容是否已被主线取代」，
结论均为**已被取代**，故不再保留 stash 条目，但补丁留档于此以防万一。

判定依据（逐条核实，非凭印象）：

| 原 stash | 内容 | 判定 |
|---|---|---|
| at-1 | 字体硬编码→token（UniversalCardView）；WarehousingTable 质检按钮按 qualityStatus 切换「质检/查看」 | 字体：主线已统一为 13px，意图达成。WarehousingTable 已被 `7fb0b0186` 拆分重构，文件不存在 |
| at-2 | vite.config manualChunks 分包（含 cssinjs） | 主线已有更完善的 4 层分包策略（vendor-react-core / react-antd / react-router / 大型第三方），带完整注释 |
| at-3 | 同 at-2 的子集（无 cssinjs 分支） | 被 at-2 覆盖，且两者均被主线取代 |
| at-4 | SmartAlertBell / Dashboard / ProgressPageContent 重构（-259 行） | 相关文件此后经 D-626/D-627/D-654 等多次重写（最近 2026-09-30），SmartAlertBell 现 452 行；其「高优先级→urgent 情绪」语义已在主线 SmartBubble.tsx:130 |
| at-5 | 61 文件仓库地图 WIP | 涉及组件已被 `a1ac8fe39` 等「拆分超大组件」重构取代 |
| at-6 | StyleInfo / global.css / security_audit_report.md 等 12 文件 | 涉及文件此后均已多次改动（最近 2026-09-30） |

**未清理**：`stash@{0}`（D-417 我的改动暂存，19 个文件，2026-09-15）——属用户改动，未触碰。

## 如何恢复

```bash
# 查看某个补丁内容
git apply --stat docs/archive/stash-backup-20261002/stash-at-1.patch

# 试应用（不落地）
git apply --check docs/archive/stash-backup-20261002/stash-at-1.patch

# 确认无误后应用
git apply docs/archive/stash-backup-20261002/stash-at-1.patch
```

注意：这些补丁基于 2026-05 的代码基线，主线已大幅演进，
**直接 apply 大概率冲突**。若补丁中确有仍需要的逻辑，
请人工甄别后按当前代码风格重新实现，不要盲目套用。
