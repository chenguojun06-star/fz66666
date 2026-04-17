-- =====================================================================
-- V202611020000: AI 升级批次 — 反馈回路 + 主动洞察 + 知识库扩充 50→80
-- 覆盖功能：D(反馈学习) + B(主动洞察推送) + J(异常自动建单) + E(知识库)
-- 幂等（INFORMATION_SCHEMA 判断 + IF NOT EXISTS + INSERT IGNORE）
-- 无嵌入 COMMENT 字符串（遵守 Flyway SQL 解析铁则）
-- =====================================================================

-- ① t_intelligence_metrics 扩展：D 反馈学习回路
-- user_feedback: 用户文字反馈（自由评论）
-- feedback_score: 1=好评 / -1=差评 / 0=未评 (SMALLINT 允许负数)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='user_feedback')=0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `user_feedback` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='feedback_score')=0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `feedback_score` SMALLINT DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='command_id')=0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `command_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_metrics' AND INDEX_NAME='idx_metrics_command_id')=0,
    'CREATE INDEX `idx_metrics_command_id` ON `t_intelligence_metrics` (`command_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② 新建 t_xiaoyun_daily_insight：B 主动洞察推送 + J 异常自动建单
CREATE TABLE IF NOT EXISTS `t_xiaoyun_daily_insight` (
  `id`             VARCHAR(64)  NOT NULL,
  `tenant_id`      BIGINT       NOT NULL,
  `insight_date`   DATE         NOT NULL,
  `scene`          VARCHAR(50)  NOT NULL,
  `severity`       VARCHAR(20)  DEFAULT 'info',
  `title`          VARCHAR(200) NOT NULL,
  `content`        TEXT         DEFAULT NULL,
  `card_json`      TEXT         DEFAULT NULL,
  `action_url`     VARCHAR(500) DEFAULT NULL,
  `auto_todo_id`   VARCHAR(64)  DEFAULT NULL,
  `read_flag`      TINYINT      NOT NULL DEFAULT 0,
  `dismissed`      TINYINT      NOT NULL DEFAULT 0,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_insight_tenant_date` (`tenant_id`, `insight_date`, `read_flag`),
  INDEX `idx_insight_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ③ 知识库扩充 50→80（30 条新增：高频 FAQ + 系统指南 + 行业场景）
INSERT IGNORE INTO `t_knowledge_base` (`id`,`tenant_id`,`category`,`title`,`content`,`keywords`,`source`) VALUES
-- 场景工作流（6条）
('kb-scn-001', NULL, 'sop', '跟单员早会场景（morning_brief）',
'**早会执行清单**：1) 逾期订单（pull高风险）2) 昨日入库与工厂排名 3) 今日要出货的订单 4) 任何延误预警。
小云指令：「早会汇报」或调用 /api/intelligence/ai-advisor/scenario/morning_brief',
'早会 晨会 morning_brief 跟单 汇报 逾期', 'system'),
('kb-scn-002', NULL, 'sop', '月末对账场景（month_close）',
'**月末对账流程**：1) 汇总本月工资（按工厂/员工）2) 汇总本月采购费用（按供应商）3) 比对上月差异 4) 生成对账单 Excel。
小云指令：「月末对账」或调用 /api/intelligence/ai-advisor/scenario/month_close',
'月末 对账 month_close 工资 采购 汇总', 'system'),
('kb-scn-003', NULL, 'sop', '质检复盘场景（quality_review）',
'**质检复盘流程**：1) 本周不良率 2) Top 缺陷类型 3) 高频不良工厂 4) 改进建议。
小云指令：「本周质检复盘」或调用 /api/intelligence/ai-advisor/scenario/quality_review',
'质检 复盘 quality_review 不良率 缺陷', 'system'),
('kb-scn-004', NULL, 'sop', '延误扫描场景（delay_scan）',
'**延误扫描**：识别所有在生产中 && (expected_ship_date < today+3 && progress<75%) 的订单，给出催工建议。
小云指令：「扫描延误」或调用 /api/intelligence/ai-advisor/scenario/delay_scan',
'延误 逾期 扫描 delay_scan 催工', 'system'),
('kb-scn-005', NULL, 'sop', '异常订单对比分析场景（order_compare）',
'**订单对比分析**：输入订单号，小云自动找出 3 条同款同尺码的正常订单，对比生产周期/工资占比/不良率，定位异常根因。
小云指令：「对比这单 PO2026xxx 的异常原因」',
'对比 分析 根因 order_compare 异常', 'system'),
('kb-scn-006', NULL, 'sop', '工厂产能预警场景',
'**产能预警使用**：主面板"工厂产能雷达"显示各工厂在产订单数与逾期率，小云在订单超出历史吞吐能力时自动提示改派工厂。
',
'产能 预警 工厂 雷达', 'system'),
-- AI 对话使用（4条）
('kb-ai-001', NULL, 'system_guide', '如何让小云记住我上次说的内容？',
'小云已默认记住最近 6 轮对话（按用户+租户隔离）。30 分钟无活动后自动过期。
如想延续早先对话：直接说「继续刚才」或「上次那个订单」。',
'会话 延续 记忆 上下文 小云', 'system'),
('kb-ai-002', NULL, 'system_guide', '小云为什么有时自动弹出卡片？',
'小云在调用了 tool_order_learning / tool_change_approval / tool_deep_analysis 等工具时会自动生成可视化卡片（橙色审批卡/红色风险卡/蓝色学习卡）。
点击卡片按钮可直接执行对应操作（如通过审批、查看订单详情）。',
'卡片 INSIGHT_CARDS 审批 学习', 'system'),
('kb-ai-003', NULL, 'system_guide', '高风险操作（撤销扫码/修改订单）需要确认吗？',
'是。小云在执行涉及 scan_undo / order_edit / payroll_approve / action_executor 等 22 项高风险工具时，
响应会带出 highRiskActions 字段，前端会弹出二次确认对话框。用户点击"确认执行"后才真正落库。',
'高风险 二次确认 撤销 扫码 订单修改', 'system'),
('kb-ai-004', NULL, 'system_guide', '图表是怎么自动出来的？',
'小云在需要展示数据趋势时，会在响应中嵌入【CHART】JSON 块（ECharts 配置）。前端自动识别并渲染成柱状/折线/饼图。
支持的图表类型：bar/line/pie/scatter。用户可说「用饼图看看」触发图表重绘。',
'图表 CHART ECharts 柱状 折线 饼图', 'system'),
-- 高频 FAQ（8条）
('kb-faq-021', NULL, 'faq', '订单进度球不更新怎么办？',
'**排查步骤**：
1. 刷新页面（Ctrl+F5）— 清全局进度球缓存
2. 检查扫码记录是否已录入（订单详情弹窗扫码记录 Tab）
3. 若扫码记录有但进度仍不变：扫码记录 scanResult 可能 != success
4. 联系超管执行「进度一致性校验任务」（每天 02:00 自动运行）',
'进度球 不更新 刷新 缓存 一致性', 'system'),
('kb-faq-022', NULL, 'faq', '工资为什么没有被计入结算？',
'**常见原因**：
1. 扫码记录的 scanResult != success（质检未通过不计工资）
2. 扫码时未选择正确工序（工序对应工价表中不存在）
3. 扫码记录被撤回（scanRecord.deleteFlag=1）
4. 工序对应的 price_per_piece=0（单价未配置）
解决：工资管理页点击"重新计算本月工资"。',
'工资 未结算 工价 扫码 工序', 'system'),
('kb-faq-023', NULL, 'faq', '订单已入库但工资还没结算？',
'**业务规则**：入库 ≠ 工资结算。工资流程：扫码 → 月末结算 → 主管审批 → 付款。
入库只影响库存数量，不影响工资。去"工资管理-待结算"查看状态。',
'入库 工资 结算 差异', 'system'),
('kb-faq-024', NULL, 'faq', '手机端扫码失败显示"菲号不存在"？',
'**根因**：二维码含 QR 或 SIG- 前缀时，小程序上传的是原始字符串，后端需剥离前缀后再查询。
如持续失败：1) 让工厂用户手动输入菲号 2) 联系超管检查 bundleNo 对应的 cutting_bundle 表',
'扫码 菲号 QR SIG 失败 前缀', 'system'),
('kb-faq-025', NULL, 'faq', '采购单付款后能修改吗？',
'**规则**：付款状态为 paid 的采购单不允许修改金额/供应商/数量。若必须修改：
1. 先撤销付款（需财务主管权限）
2. 修改后重新付款
撤销操作写入 t_sys_operation_log，保留审计链路。',
'采购 付款 修改 撤销 审批', 'system'),
('kb-faq-026', NULL, 'faq', '小程序打开白屏或连不上后端？',
'**排查**：
1. 检查网络（WiFi/4G 切换）
2. 小程序 → 我的 → 切换环境（开发版本 vs 正式版本 API 不同）
3. 如还白屏：清除小程序缓存（微信 → 发现 → 小程序 → 设置 → 清理）',
'小程序 白屏 连不上 后端 缓存', 'system'),
('kb-faq-027', NULL, 'faq', '为什么订单列表看不到我刚创建的单？',
'**权限规则**：工厂账号默认只能看到 factoryId=当前工厂的订单；其他工厂订单不可见。
如需跨工厂查看：申请超管角色或把订单的工厂字段改为"所有"。',
'订单 看不到 工厂 隔离 权限', 'system'),
('kb-faq-028', NULL, 'faq', '催单消息（urge_order）发到哪里去了？',
'**推送路径**：PC 端"快速编辑-催单"勾选后 → SysNoticeOrchestrator → 小程序 /inbox 列表 → 推送给关联工厂的工人账号。
工人可直接在小程序回复出货日期和备注。',
'催单 urge_order 推送 小程序 inbox', 'system'),
-- 系统指南（8条）
('kb-sys-021', NULL, 'system_guide', '如何导出本月对账单为 Excel？',
'**步骤**：对账管理 → 筛选月份 → 勾选全部 → 批量导出。支持 Excel（包含工资明细+物料明细+费用明细三个 Sheet）。
CSV 导出适合导入财务软件，Excel 适合给老板看汇总。',
'导出 对账 Excel CSV 月末', 'system'),
('kb-sys-022', NULL, 'system_guide', '如何批量导入生产订单？',
'**流程**：基础数据 → 数据导入 → 下载模板 → 填写（必填项：订单号/款号/颜色/尺码/数量/交期）→ 上传。
系统自动校验：款号必须存在于款式库；交期格式 yyyy-MM-dd；重复订单号跳过。导入结果可下载失败行 Excel 修正后再导入。',
'批量 导入 Excel 模板 订单', 'system'),
('kb-sys-023', NULL, 'system_guide', '如何给员工设置计件工价？',
'**方法**：基础数据 → 工价表 → 新增。字段：款号(可选通配符 ALL_STYLES) / 工序 / 单价(元/件)。
工价优先级：精确款号 > 通配款号 > 工厂默认。工人扫码后按优先级匹配工价。',
'工价 计件 员工 工序 单价', 'system'),
('kb-sys-024', NULL, 'system_guide', '工厂产能雷达怎么读？',
'**解读**：
- 绿色：订单数 < 历史吞吐 70% （闲）
- 黄色：70%~100% （正常）
- 红色：>100% （超载，建议改派）
逾期列显示该工厂本周会逾期的订单数，红色徽章＞3 需马上介入。',
'产能 雷达 解读 阈值 吞吐', 'system'),
('kb-sys-025', NULL, 'system_guide', '停滞订单预警的判定规则？',
'**规则**：订单 status != 完成 && 有历史扫码记录 && 最近 3 天内无新扫码 → 橙色 ⏸ 停滞 Tag。
点击 Tag 可快速跳转扫码记录，查看最后一条扫码时间与操作员，定位停工原因。',
'停滞 预警 3天 扫码 判定', 'system'),
('kb-sys-026', NULL, 'system_guide', '订单健康度评分怎么算？',
'**公式**：健康度 = 进度评分×40% + 货期评分×35% + 采购评分×25%
- 进度：按 productionProgress 百分比
- 货期：>14天35分 / 7天26 / 3天16 / 0天8 / 逾期0 / 未定20
- 采购：procurementCompletionRate×25
得分 <50 红色「危」/ 50~74 橙色「注」/ ≥75 不显示。',
'健康度 评分 算法 进度 货期 采购', 'system'),
('kb-sys-027', NULL, 'system_guide', '为什么我推送后没看到数据库变化？',
'**原因**：云端 FLYWAY_ENABLED=true，新迁移脚本只在容器重启时执行。推送后 3~5 分钟云端自动拉取 + 重启容器 + Flyway 迁移。
可在微信云托管控制台 → 日志 → 搜索 "Successfully applied" 确认。',
'Flyway 迁移 云端 推送 容器 重启', 'system'),
('kb-sys-028', NULL, 'system_guide', '小云的 RAG 知识库是怎么工作的？',
'**两阶段检索**：
1. 召回：Qdrant 向量召回 10 条 + MySQL 关键词召回 10 条
2. 精排：Cohere Reranker（rerank-v3.5）从 15 条中选 Top 5
前端响应 `retrievalMode` 返回 "reranked"（精排已启用）或 "hybrid"（Cohere 未配置，回退关键词）。',
'RAG 知识库 Qdrant Cohere 检索 精排', 'system'),
-- 术语（4条）
('kb-term-021', NULL, 'terminology', '什么是"OEM / ODM / OBM"？',
'- **OEM（Original Equipment Manufacturer，原始设备制造商）**：按客户设计图纸制造，贴客户品牌。如耐克代工厂。
- **ODM（Original Design Manufacturer，原始设计制造商）**：自己研发设计 + 制造，卖给客户贴其品牌。
- **OBM（Original Brand Manufacturer，自有品牌制造商）**：自己设计+制造+运营自己品牌。
服装工厂多为 OEM/ODM，行业链位置决定利润空间。',
'OEM ODM OBM 代工 自有品牌', 'system'),
('kb-term-022', NULL, 'terminology', '什么是"包长/包宽/克重"？',
'**包长**：面料/辅料的单卷长度（米）
**包宽**：单卷宽度（厘米），常见 142/150/160
**克重**：单位面积重量（g/m²），决定面料厚度，夏季 120~160，冬季 280~400
订单下单给工厂时必须提供"用料数"，由克重 × 裁片面积计算。',
'包长 包宽 克重 面料 规格', 'system'),
('kb-term-023', NULL, 'terminology', '什么是"压线/锁边/三线/五线"？',
'**压线**：缝纫机缉线，加固边缘
**锁边**：包缝机将布边包住防脱散，常见三线/五线
**三线锁边**：3 根线同时缝制，适合薄布
**五线锁边**：3 线锁边+2 线缝合，适合厚布/牛仔
工序扫码时需选择正确的锁边类型以计入对应工价。',
'锁边 三线 五线 压线 工序', 'system'),
('kb-term-024', NULL, 'terminology', '什么是"返工率/不良率/次品率"？',
'**返工率**：需要修补后可合格的数量 / 生产总数，业内良好 ≤2%
**不良率**：质检未通过且需返修的数量占比，良好 ≤3%
**次品率**：彻底无法合格必须报废的数量占比，良好 ≤0.5%
健康度评分高的订单这三个指标通常都≤阈值。',
'返工 不良 次品 率 质检', 'system');
