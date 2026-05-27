-- ============================================================
-- V20260526001 小云AI金融分析技能模板导入
-- 来源：scientific-agent-skills 金融分析模式 + 12-factor-agents 原则
-- 覆盖：风险评估、异常检测、成本预测、对账校验、现金流分析
-- ============================================================

INSERT IGNORE INTO `t_skill_template` (`id`,`tenant_id`,`skill_name`,`skill_group`,`title`,`description`,`trigger_phrases`,`steps_json`,`pre_conditions`,`post_check`,`source`,`version`,`use_count`,`success_count`,`avg_rating`,`confidence`,`enabled`,`delete_flag`) VALUES

-- 1. 风险评估技能
('sk-fin-001', NULL, 'financial_risk_assessment', 'finance',
'对账风险评估', '基于应收应付台账自动识别逾期风险、坏账风险、合同异常',
'["风险评估","风险分析","逾期风险","坏账","应收风险","哪些订单有风险","订单风险分析","财务风险扫描"]',
'[{"step":1,"action":"collect","tool":"query_receivable_payable","params":{"status":"pending","overdue":true},"description":"收集所有逾期应收应付款项"},
 {"step":2,"action":"classify","tool":"risk_classifier","params":{"thresholds":{"low":7,"medium":30,"high":90}},"description":"按逾期天数分类：低风险(7天)、中风险(30天)、高风险(90天)"},
 {"step":3,"action":"analyze","tool":"aggregate_by_customer","params":{},"description":"按客户/工厂维度聚合风险敞口"},
 {"step":4,"action":"recommend","tool":"generate_risk_report","params":{"format":"structured"},"description":"生成风险评估报告：风险等级、影响金额、建议措施"}]',
'["需要查询系统内的应收应付数据","需要工费结算数据"]',
'["风险报告包含客户名称、逾期金额、逾期天数、风险等级","TOP5 高风险客户/工厂","建议措施可执行为催款/暂停发货/法务介入"]',
'k-dense-ai/scientific-agent-skills',
1, 0, 0, NULL, 0.85, 1, 0),

-- 2. 异常检测技能
('sk-fin-002', NULL, 'financial_anomaly_detection', 'finance',
'财务异常检测', '检测工费单价异常、结算金额突变、重复结算等财务异常模式',
'["异常检测","金额异常","单价异常","价格异常","结算异常","重复结算","财务异常","账单异常"]',
'[{"step":1,"action":"collect","tool":"query_settlement_history","params":{"lookback_days":90},"description":"获取近90天所有结算记录"},
 {"step":2,"action":"baseline","tool":"calculate_price_baseline","params":{"method":"moving_average","window":30},"description":"建立工序单价基线（30天移动平均）"},
 {"step":3,"action":"detect","tool":"anomaly_detector","params":{"method":"z_score","threshold":3.0},"description":"Z-Score异常检测：识别偏离均值3个标准差以上的记录"},
 {"step":4,"action":"verify","tool":"cross_check_duplicate","params":{},"description":"交叉校验重复结算：同一订单+同一工序+同一工厂"},
 {"step":5,"action":"report","tool":"generate_anomaly_report","params":{},"description":"生成异常报告：异常类型、涉及金额、建议处理方式"}]',
'["需要历史结算数据至少30条","需要工序单价数据"]',
'["异常项有具体金额和日期","Z-Score>3的标记为显著异常","重复结算项100%标记为P0问题"]',
'k-dense-ai/scientific-agent-skills',
1, 0, 0, NULL, 0.82, 1, 0),

-- 3. 成本预测技能
('sk-fin-003', NULL, 'cost_forecasting', 'finance',
'生产成本预测', '基于历史工费、物料价格趋势预测未来订单成本，辅助报价决策',
'["成本预测","成本预估","报价参考","成本趋势","预测成本","预估成本","成本分析","工费趋势"]',
'[{"step":1,"action":"collect","tool":"query_historical_costs","params":{"lookback_months":6},"description":"收集近6个月成本数据：工费、物料费、辅料费"},
 {"step":2,"action":"decompose","tool":"decompose_cost_components","params":{"components":["labor","material","accessory","overhead"]},"description":"分解成本构成：人工/物料/辅料/间接费用"},
 {"step":3,"action":"forecast","tool":"time_series_forecast","params":{"method":"weighted_moving_average","horizon":90},"description":"时间序列预测：加权移动平均法预测未来90天成本趋势"},
 {"step":4,"action":"compare","tool":"compare_with_quotation","params":{},"description":"对比当前报价与预测成本，识别利润空间"},
 {"step":5,"action":"suggest","tool":"generate_pricing_advice","params":{"min_margin":0.15},"description":"生成定价建议：建议报价区间、风险预警"}]',
'["需要至少3个月连续成本数据","需要报价模板数据"]',
'["预测结果附带置信区间","低于15%毛利率的加红预警","建议报价不低于成本预测上限"]',
'k-dense-ai/scientific-agent-skills',
1, 0, 0, NULL, 0.78, 1, 0),

-- 4. 对账校验技能
('sk-fin-004', NULL, 'reconciliation_check', 'finance',
'对账单智能校验', '自动比对出库明细与收款记录，识别未收款、未对账、差异项',
'["对账","对账单","收款核对","对账校验","核对应收","收款对账","未对账","差异核对"]',
'[{"step":1,"action":"collect","tool":"query_shipment_and_payment","params":{"period":"current_month"},"description":"拉取本月出库明细和收款记录"},
 {"step":2,"action":"match","tool":"match_shipment_to_payment","params":{"match_keys":["order_no","customer_id","amount"]},"description":"按订单号+客户+金额匹配出库与收款"},
 {"step":3,"action":"identify","tool":"identify_mismatches","params":{"tolerance":0.01},"description":"识别不匹配项：部分收款(<95%)、零收款、多收、退款项"},
 {"step":4,"action":"classify","tool":"classify_discrepancy","params":{},"description":"分类差异：金额差异/客户差异/日期差异/重复"},
 {"step":5,"action":"report","tool":"generate_reconciliation_report","params":{},"description":"生成对账报告：匹配率、差异清单、建议行动"}]',
'["需要出库记录财务月结后","需要收款记录已录入"]',
'["匹配率>95%为正常","部分收款标记客户名称和金额","零收款>30天自动纳入催款清单"]',
'k-dense-ai/scientific-agent-skills',
1, 0, 0, NULL, 0.88, 1, 0),

-- 5. 现金流分析技能
('sk-fin-005', NULL, 'cashflow_analysis', 'finance',
'现金流健康度分析', '基于应收应付时间分布预测现金流缺口，预警流动性风险',
'["现金流","资金状况","收支分析","现金流分析","资金缺口","流动性","资金预测","回款分析"]',
'[{"step":1,"action":"collect","tool":"query_ar_ap_timeline","params":{"horizon_days":90},"description":"拉取未来90天应收应付时间线"},
 {"step":2,"action":"project","tool":"project_cashflow","params":{"method":"daily_net"},"description":"按日计算净现金流：每日应收-每日应付"},
 {"step":3,"action":"identify","tool":"identify_gap_periods","params":{"threshold":0},"description":"识别现金流为负的时段（资金缺口）"},
 {"step":4,"action":"stress_test","tool":"stress_test","params":{"scenarios":["delay_30d","default_20pct"]},"description":"压力测试：收款延迟30天、客户违约20%"},
 {"step":5,"action":"recommend","tool":"generate_liquidity_advice","params":{},"description":"生成流动性建议：融资时机、催款优先级、支出优化"}]',
'["需要应收应付的预计回款/付款日期","需要银行账户余额信息"]',
'["有负现金流时期给出具体金额和天数","压力测试结果标注最坏情况","催款建议按金额和逾期天数排序"]',
'k-dense-ai/scientific-agent-skills',
1, 0, 0, NULL, 0.80, 1, 0),

-- 6. 利润分析技能
('sk-fin-006', NULL, 'profitability_analysis', 'finance',
'订单/款式/客户利润分析', '多维度利润分析：按订单、款式、客户、工厂计算毛利率和净利润',
'["利润分析","毛利分析","盈利分析","赚钱","亏损","毛利率","净利润","利润排名","哪些订单赚钱","哪些款式赚钱","客户利润分析"]',
'[{"step":1,"action":"collect","tool":"query_order_financials","params":{"period":"last_quarter"},"description":"拉取近一个季度订单财务数据：收入、成本、费用"},
 {"step":2,"action":"calculate","tool":"calculate_margins","params":{"levels":["order","style","customer"]},"description":"三级毛利计算：订单级→款式级→客户级"},
 {"step":3,"action":"rank","tool":"rank_by_profitability","params":{"metric":"gross_margin"},"description":"按毛利率排名，识别TOP10盈利/亏损项"},
 {"step":4,"action":"drill","tool":"drill_down_loss_leaders","params":{"threshold":0.10},"description":"针对毛利率<10%的项，下钻到成本明细分析根因"},
 {"step":5,"action":"report","tool":"generate_profit_report","params":{"format":"dashboard"},"description":"生成利润看板：排名、趋势、异常、建议"}]',
'["需要完整的收入成本数据","需要间接费用分摊规则"]',
'["毛利率负值的标红","成本构成按人工/物料/辅料拆分","TOP10盈亏各有具体金额"]',
'k-dense-ai/scientific-agent-skills',
1, 0, 0, NULL, 0.86, 1, 0);