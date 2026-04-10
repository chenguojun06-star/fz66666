-- 知识库扩充：专业安全合规标准（CPSC/GB/REACH/CPSIA）
-- 面向质检员和生产主管，每条≤100字的精准知识条目

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', 'CPSC 16CFR1120 童装绳带标准',
       '7岁以下童装帽子/颈部禁止绳带；7-14岁绳带不超过7.5cm。违规将被CPSC强制召回，出口美国必检项。',
       'CPSC,绳带,童装,出口,安全', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = 'CPSC 16CFR1120 童装绳带标准');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', 'CPSIA 铅含量标准',
       '12岁以下儿童产品基材铅含量≤100ppm，涂层铅≤90ppm。金属扣/拉链/装饰件均需检测，违反罚款$100k+。',
       'CPSIA,铅,重金属,童装,出口美国', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = 'CPSIA 铅含量标准');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', 'GB 18401 国标纺织品安全',
       '婴幼儿A类：甲醛≤20mg/kg，pH4.0-7.5；直接接触皮肤B类：甲醛≤75mg/kg；非直接接触C类：甲醛≤300mg/kg。AZO染料≤20mg/kg。',
       'GB18401,甲醛,pH值,AZO,国标', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = 'GB 18401 国标纺织品安全');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', 'GB 31701 婴幼儿及儿童纺织品安全',
       '36个月以下婴幼儿A类强制；3-14岁儿童直接接触皮肤至少B类。附件拉力≥70N，绳带/小部件需通窒息测试筒检测。',
       'GB31701,婴幼儿,儿童,附件拉力,窒息', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = 'GB 31701 婴幼儿及儿童纺织品安全');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', 'EU REACH 镍释放限值',
       '直接长时间接触皮肤的金属件（纽扣/扣环/拉链头）镍释放≤0.5μg/cm²/周。出口欧盟必检，违规整批退货。',
       'REACH,镍,金属配件,欧盟,出口', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = 'EU REACH 镍释放限值');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', '纽扣/附件拉力标准',
       '纽扣拉力≥70N（GB标准），按键式附件≥50N。测试方法：用拉力计垂直拉拽10秒不脱落。童装每批必测。',
       '纽扣,拉力,附件,童装,质检', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = '纽扣/附件拉力标准');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', '16CFR1610/1615 美国阻燃标准',
       '童装睡衣（0-14岁）必须符合16CFR1615/1616阻燃测试或采用紧身设计豁免。一般成衣需符合16CFR1610普通阻燃。',
       '阻燃,CPSC,童装睡衣,出口美国,flammability', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = '16CFR1610/1615 美国阻燃标准');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', '面料缩水率控制标准',
       '梭织面料缩水≤3%，针织面料缩水≤5%。裁剪前必须预缩处理（松布24h+蒸汽预缩），否则成品尺寸偏差大于允差。',
       '缩水率,预缩,裁剪,面料,质量控制', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = '面料缩水率控制标准');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', '色牢度等级要求',
       '水洗色牢度≥3-4级，摩擦色牢度干≥4级/湿≥3级，汗渍色牢度≥3-4级。深色面料（黑/红/藏青）重点关注湿摩擦。',
       '色牢度,水洗,摩擦,质检,面料', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = '色牢度等级要求');

INSERT INTO t_knowledge_base (tenant_id, category, title, content, tags, created_time)
SELECT 0, 'safety_standard', '针检要求（金属探测）',
       '出口日本必检：断针检测灵敏度φ1.0mm铁球标准。生产全程使用磁力针盒管理，发现断针立即封锁区域逐件排查。',
       '针检,断针,金属探测,出口日本,质检', NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_knowledge_base WHERE title = '针检要求（金属探测）');
