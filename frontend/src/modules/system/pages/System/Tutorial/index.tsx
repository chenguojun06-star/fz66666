import React, { useState, useEffect } from 'react';
import {
  Card,
  Collapse,
  Steps,
  Typography,
  Space,
  Tag,
  Image,
  Empty,
  Button,
  Row,
  Col,
  Tabs,
  Alert,
  Timeline,
  Badge,
} from 'antd';
import {
  BookOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  BulbOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import Layout from '@/components/Layout';
import './style.css';
import type { Dayjs } from 'dayjs';

const { Title, Text, Paragraph } = Typography;

interface TutorialStep {
  title: string;
  description: string;
  image?: string;
  tips?: string[];
}

interface Tutorial {
  id: string;
  title: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: string;
  steps: TutorialStep[];
  videoUrl?: string;
  faqs?: { question: string; answer: string }[];
  tags: string[];
}

const SystemTutorial: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [filteredTutorials, setFilteredTutorials] = useState<Tutorial[]>([]);

  // 教程数据
  const tutorials: Tutorial[] = [
    {
      id: 'order-create',
      title: '生产订单创建完整流程',
      category: 'production',
      difficulty: 'beginner',
      duration: '5分钟',
      tags: ['订单管理', '生产', '入门必看'],
      steps: [
        {
          title: '进入订单管理页面',
          description: '从左侧菜单选择「订单管理」→「我的订单」，进入订单列表页面。',
          tips: [
            '确保你有「订单管理」权限，如无权限请联系管理员',
            '首次使用建议先查看「款式资料」确保有可用款式',
          ],
        },
        {
          title: '点击新建订单',
          description: '点击页面右上角的「+ 新建订单」按钮，打开订单创建弹窗。',
          tips: ['弹窗为80vw × 85vh标准尺寸，可调整大小'],
        },
        {
          title: '选择款式',
          description: '在款式选择下拉框中搜索或选择已存在的款式，系统会自动填充款式信息（款号、颜色、尺码）。',
          tips: [
            '款式必须已在「款式资料」中创建',
            '款式封面图会自动显示，帮助确认选择',
            '如找不到款式，请先去「款式资料」创建',
          ],
        },
        {
          title: '填写订单基本信息',
          description: '填写订单编号（可自动生成）、客户名称、交货日期等必填字段。',
          tips: [
            '订单编号格式：PO + 8位日期 + 3位序号（如 PO20260128001）',
            '交货日期建议预留充足时间（建议至少30天）',
            '订单数量会影响后续裁剪分菲数量',
          ],
        },
        {
          title: '配置SKU明细',
          description: '在SKU明细表格中，为每个颜色和尺码组合设置订单数量。系统支持批量导入或手动输入。',
          tips: [
            'SKU = 款号 + 颜色 + 尺码',
            '总数量会自动汇总显示',
            '可以使用Excel批量导入（参考模板）',
          ],
        },
        {
          title: '保存并生成二维码',
          description: '点击「保存」后，系统会生成订单二维码，用于后续扫码生产。',
          tips: [
            '二维码包含订单完整信息',
            '建议打印二维码贴在生产单据上',
            '小程序扫码可直接进入生产工序',
          ],
        },
      ],
      faqs: [
        {
          question: '订单创建后可以修改吗？',
          answer: '✅ 可以修改。\n\n操作步骤：\n1. 进入【订单管理】→【我的订单】\n2. 找到目标订单，点击右侧【编辑】按钮\n3. 修改需要调整的字段（数量、交期等）\n4. 点击【保存】完成修改\n\n⚠️ 注意事项：\n• 已开始生产的订单谨慎修改数量，可能影响裁剪和工序进度\n• 修改交期需提前与工厂沟通确认\n• 重大变更建议创建新订单，避免数据混乱',
        },
        {
          question: '为什么找不到某个款式？',
          answer: '❌ 款式未创建或未完成必要配置。\n\n解决步骤：\n1. 进入【款式资料】页面\n2. 点击【新建款式】按钮\n3. 填写款号、名称、颜色、尺码等基本信息\n4. 上传款式图片和放码纸样（.dxf/.plt/.ets格式）\n5. 保存后即可在订单中选择\n\n⚠️ 关键要求：\n• 必须上传放码纸样才能用于生产订单\n• 款号不能重复，建议统一编码规则\n• 颜色和尺码需提前在【字典管理】配置',
        },
        {
          question: 'SKU数量配置有什么规则？',
          answer: '📊 SKU = 款号 + 颜色 + 尺码，每个组合独立配置数量。\n\n配置规则：\n1. 单个SKU数量必须 > 0（不能为空或负数）\n2. 所有SKU数量之和 = 订单总数量\n3. 系统自动计算总数并实时显示\n4. 支持Excel批量导入（下载模板填写）\n\n⚠️ 常见错误：\n• 总数不一致：检查是否有SKU遗漏或重复\n• 数量过大：单个SKU建议 < 1000件，超大订单分批\n• 尺码缺失：确保所有尺码都已配置（S/M/L/XL/XXL）',
        },
      ],
      videoUrl: 'https://example.com/tutorial-order-create.mp4',
    },
    {
      id: 'cutting-task',
      title: '裁剪单生成与菲号管理',
      category: 'production',
      difficulty: 'intermediate',
      duration: '8分钟',
      tags: ['裁剪', '菲号', '生产'],
      steps: [
        {
          title: '从订单创建裁剪单',
          description: '在「生产管理」→「裁剪单」页面，选择已创建的生产订单，点击「生成裁剪单」。',
          tips: [
            '订单必须有完整的SKU配置',
            '系统会根据订单数量自动计算裁剪份数',
          ],
        },
        {
          title: '配置裁剪明细',
          description: '设置每个菲号的数量、颜色、尺码分布。菲号格式为：订单号 + 颜色 + 序号（如 PO20260128001-黑色-01）。',
          tips: [
            '菲号是裁剪和扫码的最小单位',
            '建议每个菲号控制在50-100件',
            '相同颜色的菲号需要连续编号',
          ],
        },
        {
          title: '生成裁剪二维码',
          description: '保存后系统自动生成每个菲号的二维码，可批量打印贴在裁片上。',
          tips: [
            '每个菲号有独立二维码',
            '扫码时会自动识别菲号和SKU信息',
            '二维码支持多种格式打印（PDF/图片）',
          ],
        },
        {
          title: '下发裁剪任务',
          description: '将裁剪单分配给对应工厂或裁剪组，开始裁剪工作。',
          tips: ['可设置裁剪优先级', '支持多工厂并行裁剪'],
        },
      ],
      faqs: [
        {
          question: '菲号数量如何确定？',
          answer: '📐 菲号数量 = 订单总量 ÷ 每菲标准数量。\n\n计算示例：\n• 订单500件，每菲100件 → 生成5个菲号\n• 订单380件，每菲100件 → 生成4个菲号（最后一个80件）\n\n系统建议：\n1. 小订单（< 200件）：每菲50-80件\n2. 中订单（200-1000件）：每菲80-100件\n3. 大订单（> 1000件）：每菲100-150件\n\n⚠️ 注意事项：\n• 每菲数量尽量一致，便于工序统计\n• 最后一菲允许数量不足，系统自动补齐\n• 不同颜色分开编号（黑色-01、黑色-02 | 白色-01、白色-02）',
        },
        {
          question: '裁剪单可以重复生成吗？',
          answer: '✅ 可以分批生成多个裁剪单。\n\n适用场景：\n1. 大订单分期生产（如1000件分2批，每批500）\n2. 物料分批到货，裁剪分批进行\n3. 多工厂并行生产，每厂独立裁剪单\n\n操作步骤：\n1. 进入【裁剪单】页面，选择同一订单\n2. 点击【生成裁剪单】，填写本批次数量\n3. 系统自动分配剩余菲号编号（如第二批从-06开始）\n4. 保存后生成新裁剪单和二维码\n\n⚠️ 关键提示：\n• 多批次菲号编号连续，避免重复\n• 总裁剪数量不能超过订单数量\n• 建议备注批次信息（如"第1批/共2批"）',
        },
      ],
      videoUrl: 'https://example.com/tutorial-cutting.mp4',
    },
    {
      id: 'scan-work',
      title: '小程序扫码工序操作',
      category: 'mobile',
      difficulty: 'beginner',
      duration: '6分钟',
      tags: ['小程序', '扫码', '工序'],
      steps: [
        {
          title: '打开小程序扫码页面',
          description: '在微信小程序首页点击「扫码工序」快捷入口，或从底部菜单进入「工序扫码」。',
          tips: ['首次使用需要授权摄像头权限', '确保网络畅通'],
        },
        {
          title: '扫描菲号二维码',
          description: '对准裁剪单上的菲号二维码扫描，系统自动识别菲号信息（订单号 + 颜色 + 菲号序号）。',
          tips: [
            '扫码距离建议10-30cm',
            '确保二维码清晰无污损',
            '扫描成功会震动提示',
          ],
        },
        {
          title: '智能工序识别',
          description: '系统根据扫码次数自动识别当前工序（第1次=做领，第2次=上领...），无需手动选择。',
          tips: [
            '工序顺序由订单配置决定',
            '每次扫码间隔有防重复保护（最少30秒）',
            '如需跳过工序，可手动切换',
          ],
        },
        {
          title: '确认提交',
          description: '确认工序信息和数量后，点击「提交」完成本次扫码。系统自动记录工人、时间、工序。',
          tips: [
            '提交成功后会显示当前进度',
            '工资自动按工序单价计算',
            '可查看历史扫码记录',
          ],
        },
      ],
      faqs: [
        {
          question: '扫码后为什么提示"请稍后再试"？',
          answer: '⏰ 防重复保护机制触发。\n\n间隔时间计算：\n最小间隔 = max(30秒, 菲号数量 × 工序分钟 × 60 × 50%)\n\n示例：\n• 菲号100件，做领3分钟/件 → 间隔 = max(30秒, 100×3×60×50%) = 9000秒 ≈ 2.5小时\n• 菲号50件，上领2分钟/件 → 间隔 = max(30秒, 50×2×60×50%) = 3000秒 ≈ 50分钟\n\n解决方法：\n1. 等待间隔时间后重试\n2. 确认上次扫码是否成功（查看历史记录）\n3. 如确认误判，联系管理员后台调整\n\n⚠️ 为什么有保护：\n• 避免重复计算工资\n• 防止误扫导致数据错误\n• 确保工序实际完成才能扫码',
        },
        {
          question: '扫错工序怎么办？',
          answer: '🔄 分提交前和提交后两种情况。\n\n提交前处理：\n1. 扫码后在确认页面检查工序名称\n2. 如有误，点击工序名称手动切换\n3. 选择正确工序后再点击【提交】\n\n提交后处理：\n1. 立即截图保存错误记录（工序、时间、数量）\n2. 联系车间主管或管理员\n3. 管理员在PC端【扫码记录】页面找到该记录\n4. 点击【撤销】或【修改工序】\n5. 重新扫码提交正确工序\n\n⚠️ 重要提示：\n• 提交前务必核对工序名称\n• 发现错误第一时间处理，避免影响工资结算\n• 频繁出错需检查二维码是否正确或培训操作流程',
        },
        {
          question: '三种扫码模式有什么区别？',
          answer: '📱 三种模式适用不同场景。\n\n1️⃣ 订单扫码（扫订单号）：\n• 扫描内容：PO20260128001\n• 显示：SKU明细表单\n• 适用：批量提交多个SKU\n• 优点：一次扫码处理整个订单\n• 缺点：需手动选择数量，操作慢\n\n2️⃣ 菲号扫码（推荐⭐）：\n• 扫描内容：PO20260128001-黑色-01\n• 显示：自动识别菲号信息\n• 适用：单个菲号工序提交\n• 优点：自动识别，直接确认，最快\n• 缺点：需为每个菲号打印二维码\n\n3️⃣ SKU扫码（扫JSON）：\n• 扫描内容：{"orderNo":"PO...","color":"黑色","size":"L"}\n• 显示：单个SKU信息\n• 适用：特殊场景或测试\n• 优点：精确到单个SKU\n• 缺点：二维码复杂，少用\n\n⚠️ 建议：\n99%的场景使用菲号扫码，速度最快最准确！',
        },
      ],
    },
    {
      id: 'quality-check',
      title: '质检入库完整流程',
      category: 'production',
      difficulty: 'intermediate',
      duration: '7分钟',
      tags: ['质检', '入库', '仓储'],
      steps: [
        {
          title: '进入质检入库页面',
          description: '从「生产管理」→「质检入库」进入，查看待质检的生产订单。',
          tips: ['只显示已完成生产的订单', '可按工厂筛选'],
        },
        {
          title: '创建质检记录',
          description: '选择订单后，填写质检信息：合格数量、不良数量、不良原因等。',
          tips: [
            '合格数量 + 不良数量 = 完成数量',
            '不良品需要详细备注原因',
            '支持拍照记录质检问题',
          ],
        },
        {
          title: '生成入库单',
          description: '质检通过后，系统自动生成成品入库单，分配库位。',
          tips: [
            '入库单号自动生成（WH + 日期 + 序号）',
            '可设置库位编号便于管理',
            '入库后库存实时更新',
          ],
        },
        {
          title: '打印入库凭证',
          description: '打印入库单和库位标签，贴在成品包装上。',
          tips: ['支持批量打印', '包含二维码便于出库扫描'],
        },
      ],
      faqs: [
        {
          question: '质检不合格的产品如何处理？',
          answer: '❌ 不合格品分返工和报废两种处理。\n\n返工流程：\n1. 质检页面填写【不良数量】和【不良原因】（如线头、色差）\n2. 拍照上传不良品照片（必须）\n3. 选择【返工处理】，系统自动生成返工任务\n4. 返工任务下发给原工厂或指定车间\n5. 返工完成后重新质检入库\n\n报废流程：\n1. 质检页面选择【报废处理】\n2. 填写报废原因（如严重质量问题、无法修复）\n3. 上传报废照片和主管审批签字\n4. 系统扣减订单完成数量\n5. 财务自动生成报废损失单\n\n⚠️ 注意事项：\n• 返工率 > 5%需调查根本原因\n• 报废需主管以上权限审批\n• 不良原因详细记录，便于后续改进',
        },
        {
          question: '入库后发现质量问题怎么办？',
          answer: '🔍 入库后质量问题需紧急处理。\n\n操作步骤：\n1. 进入【仓储管理】→【库存查询】\n2. 搜索问题批次（按入库单号或订单号）\n3. 点击【标记异常】，选择"待处理"状态\n4. 填写问题描述和发现人\n5. 系统自动锁定该批次库存（暂停出库）\n\n后续处理：\n方案1 - 复核质检：\n• 创建【质检复核任务】\n• 重新抽检或全检\n• 合格则解除锁定，不合格转返工/报废\n\n方案2 - 客户已发货：\n• 立即联系物流拦截\n• 无法拦截则准备补发或赔偿\n• 记录客诉，追溯责任人\n\n⚠️ 预防措施：\n• 质检时严格按标准执行\n• 入库前再次抽检关键部位\n• 定期培训质检人员提升水平',
        },
      ],
    },
    {
      id: 'material-in-out',
      title: '面辅料出入库管理',
      category: 'warehouse',
      difficulty: 'beginner',
      duration: '6分钟',
      tags: ['仓储', '物料', '入库', '出库'],
      steps: [
        {
          title: '物料采购入库',
          description: '从「生产管理」→「物料采购」创建采购单，供应商送货后进行入库操作。',
          tips: [
            '入库前需要核对采购单信息',
            '检查物料规格、数量、质量',
            '拍照记录物料状态',
          ],
        },
        {
          title: '填写入库信息',
          description: '扫描或输入采购单号，填写实际到货数量、检验结果、存放库位。',
          tips: [
            '实际数量可能与采购数量不同，需要备注差异原因',
            '库位编号建议按区域-货架-层-位格式（如A-01-02-03）',
            '支持批次管理，同一物料不同批次分开存放',
          ],
        },
        {
          title: '物料出库发放',
          description: '生产领料时，根据生产订单或裁剪单进行物料出库，扣减库存。',
          tips: [
            '出库需要生产单据支撑',
            '按先进先出原则发放',
            '出库后更新库存台账',
          ],
        },
        {
          title: '库存盘点',
          description: '定期进行库存盘点，核对系统库存与实物库存，处理差异。',
          tips: ['建议每月盘点一次', '盘点时暂停出入库', '差异超过5%需要调查原因'],
        },
      ],
      faqs: [
        {
          question: '如何查询某个物料的库存？',
          answer: '📊 多维度查询实时库存。\n\n查询步骤：\n1. 进入【仓储管理】→【库存查询】\n2. 选择查询条件：\n   • 物料编号：输入完整编码（如F001）\n   • 物料名称：模糊搜索（如"面料"）\n   • 物料类别：下拉选择（面料/辅料/配件）\n   • 供应商：筛选特定供应商物料\n3. 点击【查询】，查看结果列表\n\n库存状态说明：\n• 可用库存：可立即领用的数量\n• 在途库存：已下单未到货的数量\n• 锁定库存：已分配给订单但未出库\n• 安全库存：最低库存警戒线\n\n⚠️ 快捷操作：\n• 扫描物料二维码快速查询\n• 导出Excel做库存分析\n• 设置库存预警（低于安全库存自动提醒）',
        },
        {
          question: '物料过期或损坏如何处理？',
          answer: '🗑️ 过期/损坏物料需及时处理避免损失。\n\n报废处理：\n1. 进入【库存管理】，找到问题物料\n2. 点击【标记异常】→【待处理】\n3. 拍照记录损坏情况（必须）\n4. 填写报废申请单：\n   • 报废原因（过期/损坏/质量不合格）\n   • 报废数量和金额\n   • 责任归属（供应商/仓管/使用部门）\n5. 提交主管审批\n6. 审批通过后系统自动扣减库存\n7. 财务生成报废损失凭证\n\n退货处理（供应商责任）：\n1. 联系供应商协商退货\n2. 创建【退货出库单】\n3. 扫码出库，系统扣减库存\n4. 供应商确认后财务退款\n\n⚠️ 预防措施：\n• 物料入库严格检验质量\n• 标注保质期，临期物料优先使用\n• 定期盘点，及时发现问题物料',
        },
      ],
    },
    {
      id: 'finished-product-out',
      title: '成品出库发货流程',
      category: 'warehouse',
      difficulty: 'intermediate',
      duration: '8分钟',
      tags: ['成品', '出库', '发货', '物流'],
      steps: [
        {
          title: '创建出库单',
          description: '从「仓储管理」→「成品出库」创建出库单，选择订单和出库数量。',
          tips: [
            '出库数量不能超过库存数量',
            '可部分出库（分批发货）',
            '自动关联销售订单',
          ],
        },
        {
          title: '扫码拣货',
          description: '根据出库单到对应库位扫描成品二维码，确认拣货。',
          tips: [
            '支持小程序扫码拣货',
            '拣货完成后自动核销出库单',
            '拣错可及时撤销',
          ],
        },
        {
          title: '包装发货',
          description: '拣货完成后进行包装，填写物流信息（快递公司、运单号）。',
          tips: [
            '支持多种物流公司',
            '运单号可自动推送给客户',
            '可打印装箱单和发货清单',
          ],
        },
        {
          title: '确认出库',
          description: '包装完成后确认出库，系统扣减库存，生成出库凭证。',
          tips: [
            '出库后库存实时更新',
            '财务自动生成销售出库单',
            '可追踪物流状态',
          ],
        },
      ],
      faqs: [
        {
          question: '成品出库后客户拒收怎么办？',
          answer: '↩️ 退货需快速处理避免影响库存周转。\n\n退货入库流程：\n1. 收到客户拒收通知，确认拒收原因\n2. 进入【成品出库】→【退货管理】\n3. 点击【创建退货单】，关联原出库单\n4. 填写退货信息：\n   • 退货数量（可部分退货）\n   • 退货原因（质量问题/尺码错误/数量错误）\n   • 物流运单号\n5. 货物到达后扫码验收入库\n6. 系统自动恢复库存（可用数量+退货数量）\n7. 根据原因判断是否需要质检复核\n\n重新发货：\n1. 退货入库完成后，检查库存充足\n2. 创建新出库单，关联原订单\n3. 备注"补发"，避免重复计费\n4. 扫码拣货、包装、发货\n\n⚠️ 注意事项：\n• 质量问题退货需拍照留证\n• 退货运费由责任方承担（质量问题由我方承担）\n• 频繁退货客户需分析根本原因',
        },
        {
          question: '如何处理紧急加急订单？',
          answer: '🚨 加急订单优先处理机制。\n\n加急标记步骤：\n1. 创建出库单时勾选【加急订单】选项\n2. 选择加急等级：\n   • 🔴 特急（2小时内发货）\n   • 🟠 加急（当天发货）\n   • 🟡 优先（次日发货）\n3. 填写加急原因和客户要求\n4. 保存后系统自动：\n   • 出库单列表置顶显示（红色标记）\n   • 推送通知给仓管主管和拣货人员\n   • 短信/微信提醒相关人员\n\n加急处理流程：\n1. 仓管收到通知后立即响应\n2. 优先拣货、优先打包\n3. 联系快递上门取件（协商加急服务）\n4. 实时更新物流状态\n5. 发货后通知客户运单号\n\n⚠️ 管理建议：\n• 加急订单需额外收费（快递费+加急费）\n• 控制加急比例（< 10%），避免影响正常订单\n• 分析加急原因，优化交期管理减少加急',
        },
      ],
    },
    {
      id: 'reconciliation',
      title: '对账与财务结算',
      category: 'finance',
      difficulty: 'advanced',
      duration: '10分钟',
      tags: ['对账', '财务', '结算'],
      steps: [
        {
          title: '工厂对账',
          description: '从「财务管理」→「工厂对账」进入，选择对账周期和工厂，系统自动汇总该期间的订单和工序数据。',
          tips: [
            '建议每月对账一次',
            '对账前确保所有扫码记录已提交',
            '可导出明细Excel核对',
          ],
        },
        {
          title: '核对明细',
          description: '核对工序数量、单价、总金额，处理异常数据（如重复扫码、工序错误）。',
          tips: [
            '异常数据可标记需复核',
            '支持手动调整金额（需备注原因）',
            '重大差异需工厂确认签字',
          ],
        },
        {
          title: '生成对账单',
          description: '确认无误后生成对账单，包含订单汇总、工序明细、应付金额等。',
          tips: [
            '对账单需要双方签字盖章',
            '系统自动生成PDF文件',
            '可发送邮件给工厂',
          ],
        },
        {
          title: '审批与付款',
          description: '对账单提交审批流程，财务审核后安排付款。',
          tips: [
            '审批流程可自定义（如主管→财务→总经理）',
            '付款后系统自动标记已结清',
            '支持部分付款（如预付30%）',
          ],
        },
      ],
      faqs: [
        {
          question: '对账金额与工厂报价不一致怎么办？',
          answer: '💰 金额差异需逐项排查。\n\n差异排查步骤：\n1. 导出对账明细Excel（系统自动计算）\n2. 导出工厂提供的报价明细\n3. 逐项对比：\n   ✓ 订单数量是否一致\n   ✓ 工序名称是否匹配\n   ✓ 单价是否正确（检查系统配置）\n   ✓ 扫码记录是否有重复或遗漏\n\n常见差异原因：\n• 单价配置错误：在【工序管理】核对单价\n• 重复扫码：在【扫码记录】查找重复数据并删除\n• 遗漏扫码：补录缺失的工序记录\n• 工序名称不一致：统一工序字典\n\n协商调整流程：\n1. 双方确认差异明细\n2. 判定责任（系统错误/人为失误/合同变更）\n3. 在系统【手动调整】功能修改金额\n4. 必须填写调整原因和审批人\n5. 双方签字确认调整单\n6. 备案调整记录便于审计\n\n⚠️ 预防措施：\n• 合同签订时明确单价和结算规则\n• 每月对账，避免累积大额差异\n• 定期核对单价配置是否与合同一致',
        },
        {
          question: '物料对账与工厂对账有什么区别？',
          answer: '📋 两种对账核算不同费用类型。\n\n物料对账（采购结算）：\n• 对象：供应商（面料商、辅料商）\n• 依据：采购单\n• 内容：物料名称、规格、数量、单价、金额\n• 周期：按批次或按月\n• 公式：应付款 = Σ(采购数量 × 单价)\n• 示例：\n  - 面料A：1000米 × 30元/米 = 30,000元\n  - 辅料B：5000个 × 0.5元/个 = 2,500元\n  - 总计：32,500元\n\n工厂对账（加工结算）：\n• 对象：加工工厂或车间\n• 依据：扫码记录（工序完成数量）\n• 内容：订单、工序、数量、单价、金额\n• 周期：按月\n• 公式：应付款 = Σ(工序数量 × 工序单价)\n• 示例：\n  - 做领：500件 × 2元/件 = 1,000元\n  - 上领：500件 × 1.5元/件 = 750元\n  - 总计：1,750元\n\n区别对比：\n┌─────────┬──────────┬──────────┐\n│ 项目     │ 物料对账   │ 工厂对账   │\n├─────────┼──────────┼──────────┤\n│ 核算对象 │ 材料成本   │ 人工成本   │\n│ 数据来源 │ 采购单入库 │ 扫码记录   │\n│ 结算单位 │ 米/个/公斤 │ 件/套      │\n│ 对账频率 │ 灵活       │ 固定月结   │\n└─────────┴──────────┴──────────┘\n\n⚠️ 注意事项：\n• 两种对账独立进行，不能混淆\n• 最终汇总到【财务报表】统一核算成本\n• 物料对账关注价格波动，工厂对账关注效率',
        },
      ],
    },
    {
      id: 'sample-management',
      title: '样衣开发与管理',
      category: 'sample',
      difficulty: 'beginner',
      duration: '8分钟',
      tags: ['样衣', '款式', '开发'],
      steps: [
        {
          title: '创建新款式',
          description: '从「样衣管理」→「样衣开发」进入，点击「新建款式」，填写款号、款名、类别等基本信息。',
          tips: [
            '款号格式建议统一（如HYY20222）',
            '款名要简洁明了，便于识别',
            '类别需要在字典管理中预先配置',
          ],
        },
        {
          title: '上传款式图片和资料',
          description: '上传款式封面图、细节图、放码纸样文件（.dxf/.plt/.ets格式）。',
          tips: [
            '封面图建议正面图，尺寸800×800px',
            '放码纸样是后续生产订单的必需文件',
            '支持批量上传多张细节图',
          ],
        },
        {
          title: '配置BOM物料清单',
          description: '添加该款式所需的面料、辅料、配件，设置每件用量和单价。',
          tips: [
            '物料需要在「面辅料数据库」中预先创建',
            '用量单位要准确（米、个、公斤）',
            '单价会自动汇总计算成本',
          ],
        },
        {
          title: '设置工序流程',
          description: '配置该款式的生产工序顺序和每道工序的工价。',
          tips: [
            '工序顺序影响小程序扫码识别',
            '工价用于后续工厂对账',
            '常见工序：裁剪→缝制→整烫→质检→包装',
          ],
        },
      ],
      faqs: [
        {
          question: '款式创建后可以修改吗？',
          answer: '✅ 可以修改，但需注意：\n\n• 基本信息（款号、名称）随时可改\n• BOM物料变更会影响已创建的采购单\n• 工序流程变更会影响进行中的订单\n• 建议重大变更时创建新版本款号',
        },
        {
          question: '放码纸样文件支持哪些格式？',
          answer: '📄 支持主流CAD格式：\n\n• .dxf（AutoCAD）\n• .plt（绘图仪）\n• .ets（力克系统）\n• .pat（格柏系统）\n\n文件要求：\n• 尺寸准确无误\n• 包含所有尺码的放码信息\n• 单个文件 < 50MB',
        },
      ],
    },
    {
      id: 'pattern-production',
      title: '样板生产流程',
      category: 'sample',
      difficulty: 'intermediate',
      duration: '6分钟',
      tags: ['样板', '生产', '打样'],
      steps: [
        {
          title: '创建样板生产任务',
          description: '从「样衣管理」→「样板生产」进入，选择款式创建样板任务。',
          tips: [
            '可同时创建多个款式的样板任务',
            '设置优先级和交期',
          ],
        },
        {
          title: '分配打样工厂',
          description: '选择承接打样的工厂或车间，系统会自动通知工厂。',
          tips: [
            '可查看工厂当前任务负载',
            '支持多工厂并行打样',
          ],
        },
        {
          title: '跟踪打样进度',
          description: '实时查看打样阶段（裁剪→缝制→整烫→成品），工厂完成后自动流转。',
          tips: [
            '支持小程序扫码更新进度',
            '可设置关键节点提醒',
          ],
        },
        {
          title: '样板验收',
          description: '样板完成后进行验收，拍照记录，确认合格后归档。',
          tips: [
            '不合格需填写返修意见',
            '合格样板可转为标准款式',
          ],
        },
      ],
      faqs: [
        {
          question: '样板生产和正式订单有什么区别？',
          answer: '🎯 主要区别：\n\n样板生产：\n• 数量少（通常1-3件）\n• 重点验证款式和工艺\n• 周期短（3-5天）\n• 不计入库存\n\n正式订单：\n• 数量大（批量生产）\n• 标准化流程\n• 周期长（15-30天）\n• 计入库存和财务',
        },
      ],
    },
    {
      id: 'data-center',
      title: '资料中心使用指南',
      category: 'sample',
      difficulty: 'beginner',
      duration: '5分钟',
      tags: ['资料', '查询', '归档'],
      steps: [
        {
          title: '查询款式资料',
          description: '通过款号、款名、分类等条件快速检索历史款式。',
          tips: [
            '支持模糊搜索',
            '可按时间范围筛选',
            '支持批量导出',
          ],
        },
        {
          title: '查看款式详情',
          description: '点击款式查看完整信息：图片、BOM、工序、历史订单等。',
          tips: [
            '所有附件可一键下载',
            '可查看款式销售数据',
          ],
        },
        {
          title: '款式复用',
          description: '将历史款式复制为新款式，快速创建相似款。',
          tips: [
            '修改款号避免重复',
            '根据需要调整BOM和工序',
          ],
        },
      ],
      faqs: [
        {
          question: '如何快速找到去年的某个款式？',
          answer: '🔍 使用高级搜索：\n\n1. 点击【高级筛选】\n2. 设置时间范围（2025-01-01 ~ 2025-12-31）\n3. 输入款号关键词或分类\n4. 点击【查询】',
        },
      ],
    },
    {
      id: 'template-price',
      title: '单价维护与成本核算',
      category: 'sample',
      difficulty: 'intermediate',
      duration: '7分钟',
      tags: ['单价', '成本', '报价'],
      steps: [
        {
          title: '维护物料单价',
          description: '从「样衣管理」→「单价维护」进入，更新面料、辅料的采购单价。',
          tips: [
            '定期更新单价（建议每月）',
            '保留历史单价记录',
            '支持批量导入Excel',
          ],
        },
        {
          title: '维护工序单价',
          description: '设置各工序的人工单价，按件计算。',
          tips: [
            '不同工厂单价可能不同',
            '复杂工序单价更高',
            '定期与工厂协商调整',
          ],
        },
        {
          title: '自动成本核算',
          description: '系统根据BOM用量和单价自动计算款式成本。',
          tips: [
            '成本 = 物料成本 + 人工成本',
            '用于报价参考',
            '可添加利润率自动生成报价',
          ],
        },
      ],
      faqs: [
        {
          question: '单价更新后，已创建的订单会受影响吗？',
          answer: '❌ 不会影响已创建订单。\n\n原因：\n• 订单创建时会快照当时的单价\n• 后续单价变更不影响历史数据\n• 确保财务对账准确\n\n如需调整历史订单价格：\n• 需要手动在订单中调整\n• 需要审批流程确认',
        },
      ],
    },
    {
      id: 'material-database',
      title: '面辅料数据库管理',
      category: 'warehouse',
      difficulty: 'beginner',
      duration: '5分钟',
      tags: ['面辅料', '物料', '数据库'],
      steps: [
        {
          title: '添加新物料',
          description: '从「仓库管理」→「面辅料数据库」点击「新增物料」，填写物料基本信息。',
          tips: [
            '物料编号建议统一格式（如F001-面料，F002-辅料）',
            '详细填写规格参数便于后续查找',
            '可上传物料实拍图',
          ],
        },
        {
          title: '设置物料属性',
          description: '填写成分、颜色、克重、门幅等物料特性。',
          tips: [
            '成分如：棉100%、涤纶65%棉35%',
            '门幅常见：140cm、150cm',
            '克重影响用料计算',
          ],
        },
        {
          title: '关联供应商',
          description: '绑定该物料的常用供应商和采购价格。',
          tips: [
            '可设置多个供应商比价',
            '标记首选供应商',
            '记录供应商起订量',
          ],
        },
      ],
      faqs: [
        {
          question: '同一种面料不同颜色需要分开创建吗？',
          answer: '✅ 建议分开创建。\n\n原因：\n• 不同颜色价格可能不同\n• 库存分开管理更清晰\n• 便于BOM精确配置\n\n命名建议：\n• F001-全棉府绸-白色\n• F001-全棉府绸-黑色',
        },
      ],
    },
    {
      id: 'order-management',
      title: '下单管理流程',
      category: 'sample',
      difficulty: 'beginner',
      duration: '6分钟',
      tags: ['下单', '订单', '跟单'],
      steps: [
        {
          title: '接收客户订单',
          description: '从「样衣管理」→「下单管理」创建客户订单，填写客户信息和订单明细。',
          tips: [
            '记录客户联系方式',
            '明确交货日期和地点',
            '特殊要求需备注清楚',
          ],
        },
        {
          title: '转化为生产订单',
          description: '审核通过后，一键转化为生产订单，自动流转到生产部门。',
          tips: [
            '转化时会自动关联款式BOM',
            '生成采购需求单',
            '创建生产排期',
          ],
        },
        {
          title: '跟踪订单状态',
          description: '实时查看订单进度（采购→裁剪→生产→质检→入库→发货）。',
          tips: [
            '关键节点自动提醒',
            '延期订单红色警示',
            '可导出订单跟踪表',
          ],
        },
      ],
      faqs: [
        {
          question: '客户订单和生产订单有什么区别？',
          answer: '📝 两种订单用途不同：\n\n客户订单：\n• 面向销售管理\n• 记录客户信息和商务条款\n• 可包含多个款式\n\n生产订单：\n• 面向生产执行\n• 单一款式\n• 指导车间生产',
        },
      ],
    },
    {
      id: 'dashboard',
      title: '仪表盘数据分析',
      category: 'system',
      difficulty: 'beginner',
      duration: '4分钟',
      tags: ['仪表盘', '数据', '分析'],
      steps: [
        {
          title: '查看核心指标',
          description: '登录后默认进入仪表盘，实时查看订单数、生产进度、库存预警等核心数据。',
          tips: [
            '数据每小时自动更新',
            '红色数字表示预警',
            '点击数字可查看明细',
          ],
        },
        {
          title: '自定义筛选条件',
          description: '选择工厂、时间范围等筛选条件，查看特定维度的数据。',
          tips: [
            '支持按月、按季度统计',
            '可对比历史同期数据',
            '导出统计报表',
          ],
        },
        {
          title: '图表分析',
          description: '通过柱状图、饼图、趋势图直观分析业务数据。',
          tips: [
            '鼠标悬停查看详细数值',
            '点击图例筛选数据',
            '图表可导出为图片',
          ],
        },
      ],
      faqs: [
        {
          question: '仪表盘数据多久更新一次？',
          answer: '⏰ 更新频率：\n\n• 订单数据：实时更新\n• 生产进度：扫码后立即更新\n• 库存数据：出入库后实时更新\n• 统计报表：每小时整点更新\n\n手动刷新：点击右上角【刷新】按钮',
        },
      ],
    },
    {
      id: 'payroll-settlement',
      title: '工资结算流程',
      category: 'finance',
      difficulty: 'intermediate',
      duration: '8分钟',
      tags: ['工资', '结算', '财务'],
      steps: [
        {
          title: '选择结算周期',
          description: '从「财务管理」→「工资结算」进入，选择月份或自定义日期范围。',
          tips: [
            '建议每月1-5号结算上月工资',
            '可设置结算周期模板',
          ],
        },
        {
          title: '自动汇总工资',
          description: '系统根据扫码记录自动计算每个工人的工序数量和工资。',
          tips: [
            '公式：工资 = Σ(工序数量 × 工序单价)',
            '可查看工资明细',
            '异常数据会标红提示',
          ],
        },
        {
          title: '审核与调整',
          description: '主管审核工资表，处理异常（如补录、扣款、奖金）。',
          tips: [
            '手动调整需填写原因',
            '调整后需要重新审批',
            '保留调整记录便于审计',
          ],
        },
        {
          title: '生成工资表',
          description: '审核通过后生成最终工资表，可导出Excel或打印。',
          tips: [
            '包含工人姓名、工号、工序明细、应发工资',
            '自动生成银行代发文件',
            '发放后标记已支付',
          ],
        },
      ],
      faqs: [
        {
          question: '工人对工资有异议怎么办？',
          answer: '🔍 异议处理流程：\n\n1. 查询该工人的扫码记录\n2. 核对工序数量和单价\n3. 如发现错误：\n   • 扫码记录错误：撤销重录\n   • 单价配置错误：调整单价重算\n   • 其他原因：手动调整并备注\n4. 重新生成工资表\n5. 与工人确认并签字',
        },
      ],
    },
    {
      id: 'warehouse-dashboard',
      title: '仓库数据看板',
      category: 'warehouse',
      difficulty: 'beginner',
      duration: '5分钟',
      tags: ['仓库', '看板', '数据'],
      steps: [
        {
          title: '查看库存总览',
          description: '从「仓库管理」→「数据看板」查看物料和成品的总库存、周转率等数据。',
          tips: [
            '红色表示低于安全库存',
            '黄色表示接近安全库存',
            '绿色表示库存充足',
          ],
        },
        {
          title: '出入库趋势分析',
          description: '查看近期出入库趋势图，分析库存周转情况。',
          tips: [
            '可切换日、周、月维度',
            '异常波动需要分析原因',
          ],
        },
        {
          title: '库存预警',
          description: '实时显示缺货预警、超库存预警、临期物料预警。',
          tips: [
            '设置预警阈值',
            '自动推送提醒',
            '一键生成采购建议',
          ],
        },
      ],
      faqs: [
        {
          question: '如何设置库存安全线？',
          answer: '⚙️ 安全库存设置：\n\n1. 进入【仓库管理】→【库存设置】\n2. 选择物料或成品\n3. 设置：\n   • 安全库存：最低保有量\n   • 最高库存：超出需要预警\n   • 补货提前期：提前多少天提醒采购\n4. 保存后自动生效\n\n计算建议：\n安全库存 = 平均日用量 × 采购周期 × 1.5（安全系数）',
        },
      ],
    },
    {
      id: 'sample-inventory',
      title: '样衣出入库管理',
      category: 'warehouse',
      difficulty: 'beginner',
      duration: '4分钟',
      tags: ['样衣', '库存', '借还'],
      steps: [
        {
          title: '样衣入库',
          description: '样板生产完成后，进行样衣入库登记，分配库位。',
          tips: [
            '扫描款式二维码快速入库',
            '拍照记录样衣状态',
            '设置是否可外借',
          ],
        },
        {
          title: '样衣借出',
          description: '业务员或客户借用样衣时，填写借出单。',
          tips: [
            '记录借出人和归还日期',
            '超期自动提醒',
            '可设置押金',
          ],
        },
        {
          title: '样衣归还',
          description: '样衣归还后，核对状态并办理归还手续。',
          tips: [
            '检查样衣是否完好',
            '损坏需要照相记录',
            '更新库存状态',
          ],
        },
      ],
      faqs: [
        {
          question: '样衣丢失或损坏如何处理？',
          answer: '💔 损失处理流程：\n\n1. 拍照记录损坏情况\n2. 填写【样衣损失单】\n3. 判定责任：\n   • 借用人责任：按成本赔偿\n   • 正常损耗：报废处理\n4. 主管审批\n5. 从库存中核销\n6. 财务记录损失',
        },
      ],
    },
    {
      id: 'dict-management',
      title: '字典管理使用指南',
      category: 'system',
      difficulty: 'beginner',
      duration: '5分钟',
      tags: ['字典', '配置', '基础数据'],
      steps: [
        {
          title: '了解字典类型',
          description: '字典用于统一下拉选项，如颜色、尺码、工序名称等。',
          tips: [
            '字典类型由系统预定义',
            '字典值可以自定义添加',
            '修改后全系统生效',
          ],
        },
        {
          title: '添加字典值',
          description: '从「系统设置」→「字典管理」选择字典类型，点击「新增」添加选项。',
          tips: [
            '标签：显示给用户的文字（如"红色"）',
            '值：系统内部使用的代码（如"red"）',
            '排序号：控制显示顺序',
          ],
        },
        {
          title: '启用/禁用字典',
          description: '可以禁用不再使用的字典值，避免误选。',
          tips: [
            '禁用后不会删除历史数据',
            '新创建记录中不显示',
            '可随时重新启用',
          ],
        },
      ],
      faqs: [
        {
          question: '常见字典类型有哪些？',
          answer: '📚 系统预置字典：\n\n• 颜色：红、黑、白、蓝...\n• 尺码：S、M、L、XL、XXL\n• 工序：裁剪、缝制、整烫、质检...\n• 物料类别：面料、辅料、配件\n• 客户等级：VIP、普通、临时',
        },
      ],
    },
    {
      id: 'user-permission',
      title: '人员与权限管理',
      category: 'system',
      difficulty: 'intermediate',
      duration: '7分钟',
      tags: ['权限', '人员', '角色'],
      steps: [
        {
          title: '创建用户账号',
          description: '从「系统设置」→「人员管理」点击「新增用户」，填写用户信息（姓名、账号、密码、手机号等）。',
          tips: [
            '账号格式建议：工号或手机号',
            '初始密码建议设置为统一格式（如123456），提醒用户首次登录修改',
            '手机号用于接收通知和找回密码',
          ],
        },
        {
          title: '分配角色',
          description: '为用户分配角色（如管理员、工厂操作员、财务人员等），角色决定了用户的菜单和操作权限。',
          tips: [
            '一个用户可以有多个角色',
            '角色继承权限（如"财务经理"包含"财务人员"的所有权限）',
            '新建角色需要先在「角色管理」中配置',
          ],
        },
        {
          title: '配置数据权限',
          description: '设置用户的数据范围（全部数据 / 仅本工厂数据），多工厂场景下实现数据隔离。',
          tips: [
            'dataScope=ALL：查看所有工厂数据（适合管理员）',
            'dataScope=FACTORY_ONLY：仅查看本工厂数据（适合工厂操作员）',
            '数据权限与菜单权限独立配置',
          ],
        },
        {
          title: '测试账号权限',
          description: '创建后建议先用测试环境或小号登录验证权限配置是否正确。',
          tips: ['检查菜单是否正确显示', '测试关键操作是否可执行', '验证数据范围是否准确'],
        },
      ],
      faqs: [
        {
          question: '如何禁用某个用户？',
          answer: '🚫 禁用用户保留数据但阻止登录。\n\n禁用操作：\n1. 进入【系统设置】→【人员管理】\n2. 在用户列表搜索目标用户（姓名/账号）\n3. 点击该用户右侧【更多】→【禁用】\n4. 系统弹窗确认："确定禁用该用户？"\n5. 点击【确定】，用户状态变为"已禁用"（红色标记）\n\n禁用后效果：\n• ❌ 用户无法登录PC端和小程序\n• ✅ 历史数据完整保留（订单、扫码记录、对账单）\n• ✅ 数据统计中仍包含该用户的贡献\n• ❌ 无法分配新任务或接收通知\n\n启用恢复：\n1. 找到已禁用用户（筛选"已禁用"状态）\n2. 点击【更多】→【启用】\n3. 用户恢复正常，可重新登录\n\n⚠️ 适用场景：\n• 员工离职（保留数据便于审计）\n• 临时暂停权限（如违规操作）\n• 长期休假（避免账号被盗用）\n\n💡 与删除的区别：\n• 禁用：可恢复，数据保留\n• 删除：不可恢复，数据清空（谨慎使用！）',
        },
        {
          question: '角色权限修改后，已登录用户会立即生效吗？',
          answer: '⏰ 不会立即生效，需重新登录。\n\n权限生效机制：\n1. 用户登录时，系统颁发Token（有效期2小时）\n2. Token包含用户权限信息（菜单、操作、数据范围）\n3. 前端根据Token判断显示哪些菜单和按钮\n4. 修改角色权限后，旧Token仍然有效\n5. 直到Token过期或用户重新登录，才获取新权限\n\n立即生效方法：\n\n方法1 - 通知用户重新登录：\n1. 修改权限后，通知相关用户\n2. 用户点击右上角【退出登录】\n3. 重新登录，获取最新权限\n\n方法2 - 管理员强制踢出（紧急）：\n1. 进入【系统设置】→【登录日志】\n2. 找到在线用户（状态="在线"）\n3. 点击【强制下线】\n4. 用户被踢出，下次登录获取新权限\n\n方法3 - 等待自动过期（2小时）：\n• 不需要操作\n• Token到期后自动失效\n• 用户刷新页面或操作时会自动重新登录\n\n⚠️ 注意事项：\n• 重大权限变更建议提前通知\n• 强制下线会中断用户当前操作\n• 权限配置前先在测试账号验证',
        },
      ],
    },
  ];

  // 分类定义
  const categories = [
    { key: 'all', label: '全部教程', icon: <BookOutlined /> },
    { key: 'sample', label: '样衣管理', icon: <FileTextOutlined /> },
    { key: 'production', label: '生产管理', icon: <RocketOutlined /> },
    { key: 'warehouse', label: '仓储管理', icon: <BulbOutlined /> },
    { key: 'mobile', label: '小程序操作', icon: <VideoCameraOutlined /> },
    { key: 'finance', label: '财务管理', icon: <FileTextOutlined /> },
    { key: 'system', label: '系统设置', icon: <ThunderboltOutlined /> },
  ];

  // 难度标签样式
  const getDifficultyTag = (difficulty: string) => {
    const configs = {
      beginner: { label: '入门', color: 'green' },
      intermediate: { label: '进阶', color: 'orange' },
      advanced: { label: '高级', color: 'red' },
    };
    const config = configs[difficulty as keyof typeof configs] || configs.beginner;
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  // 搜索和筛选
  useEffect(() => {
    let result = tutorials;

    // 分类筛选
    if (activeCategory !== 'all') {
      result = result.filter((t) => t.category === activeCategory);
    }

    // 搜索筛选
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(search) ||
          t.tags.some((tag) => tag.toLowerCase().includes(search)) ||
          t.steps.some((step) => step.title.toLowerCase().includes(search))
      );
    }

    setFilteredTutorials(result);
  }, [activeCategory, searchText]);

  return (
    <Layout>
      <div className="system-tutorial-container">
        {/* 页面头部 */}
        <div className="tutorial-page-header">
          <div className="header-content">
            <div className="tutorial-title-section">
              <BookOutlined className="tutorial-header-icon" />
              <div>
                <h2 className="tutorial-page-title">系统教学中心</h2>
                <Text type="secondary">从入门到精通，快速掌握服装供应链管理系统</Text>
              </div>
            </div>
          </div>
      </div>

      {/* 快速指引 */}
      <Alert
        title="💡 新手指引"
        description={
          <div>
            <p style={{ marginBottom: 8 }}>
              <strong>建议学习路径：</strong>
            </p>
            <Timeline
              items={[
                { content: '1️⃣ 先学习「生产订单创建」和「人员与权限管理」了解系统基础' },
                { content: '2️⃣ 掌握「裁剪单生成」和「小程序扫码工序」进行实操练习' },
                { content: '3️⃣ 学习「质检入库」和「面辅料管理」完善生产流程' },
                { content: '4️⃣ 最后学习「对账与财务结算」掌握完整业务闭环' },
              ]}
            />
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      {/* 搜索和分类 */}
      <Card style={{ marginBottom: 24 }}>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <StandardSearchBar
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchPlaceholder="搜索教程标题、标签或步骤"
            dateValue={dateRange}
            onDateChange={setDateRange}
            statusValue={activeCategory}
            onStatusChange={setActiveCategory}
            statusOptions={categories.map((cat) => ({
              label: cat.label,
              value: cat.key,
            }))}
          />
          <Space wrap size={[12, 12]}>
            {categories.map((cat) => (
              <Button
                key={cat.key}
                type={activeCategory === cat.key ? 'primary' : 'default'}
                icon={cat.icon}
                onClick={() => setActiveCategory(cat.key)}
              >
                {cat.label}
              </Button>
            ))}
          </Space>
        </Space>
      </Card>

      {/* 教程列表 */}
      {filteredTutorials.length === 0 ? (
        <Card>
          <Empty description="未找到相关教程，请尝试其他关键词" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {filteredTutorials.map((tutorial) => (
            <Col xs={24} key={tutorial.id}>
              <Card
                className="tutorial-card"
                title={
                  <Space>
                    <FileTextOutlined />
                    <span>{tutorial.title}</span>
                    {getDifficultyTag(tutorial.difficulty)}
                    <Tag>{tutorial.duration}</Tag>
                  </Space>
                }
                extra={
                  <Space>
                    {tutorial.tags.map((tag) => (
                      <Tag key={tag} color="blue">
                        {tag}
                      </Tag>
                    ))}
                  </Space>
                }
              >
                <Tabs
                  defaultActiveKey="steps"
                  items={[
                    {
                      key: 'steps',
                      label: '📖 操作步骤',
                      children: (
                        <Steps
                          orientation="vertical"
                          current={-1}
                          items={tutorial.steps.map((step, index) => ({
                            title: (
                              <Space>
                                <Badge count={index + 1} style={{ backgroundColor: 'var(--color-success)' }} />
                                <strong>{step.title}</strong>
                              </Space>
                            ),
                            content: (
                              <div style={{ paddingLeft: 30 }}>
                                <Paragraph>{step.description}</Paragraph>
                                {step.tips && step.tips.length > 0 && (
                                  <Alert
                                    title="💡 温馨提示"
                                    description={
                                      <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                                        {step.tips.map((tip, i) => (
                                          <li key={i}>{tip}</li>
                                        ))}
                                      </ul>
                                    }
                                    type="success"
                                    showIcon
                                    style={{ marginTop: 12 }}
                                  />
                                )}
                                {step.image && (
                                  <Image
                                    src={step.image}
                                    alt={step.title}
                                    style={{ marginTop: 12, maxWidth: 600 }}
                                    preview
                                  />
                                )}
                              </div>
                            ),
                            status: 'finish',
                          }))}
                        />
                      ),
                    },
                    ...(tutorial.faqs && tutorial.faqs.length > 0 ? [{
                      key: 'faqs',
                      label: '❓ 常见问题',
                      children: (
                        <Collapse
                          accordion
                          items={tutorial.faqs.map((faq, index) => ({
                            key: index,
                            label: (
                              <Space>
                                <QuestionCircleOutlined style={{ color: 'var(--color-warning)' }} />
                                <strong>{faq.question}</strong>
                              </Space>
                            ),
                            children: <Alert title={faq.answer} type="info" showIcon />
                          }))}
                        />
                      ),
                    }] : []),
                    ...(tutorial.videoUrl ? [{
                      key: 'video',
                      label: '🎬 视频教程',
                      children: (
                        <Alert
                          title="视频教程"
                          description={
                            <Space orientation="vertical" style={{ width: '100%' }}>
                              <Text>视频链接：{tutorial.videoUrl}</Text>
                              <Text type="secondary">（视频播放功能开发中，敬请期待）</Text>
                            </Space>
                          }
                          type="warning"
                          showIcon
                        />
                      ),
                    }] : []),
                  ]}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* 底部帮助 */}
      <Card style={{ marginTop: 24 }}>
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Title level={4}>
            <QuestionCircleOutlined /> 需要更多帮助？
          </Title>
          <Paragraph>
            • <strong>在线客服：</strong>点击右下角客服图标，实时咨询技术支持
            <br />
            • <strong>用户手册：</strong>下载完整PDF用户手册，离线查阅
            <br />
            • <strong>培训预约：</strong>联系管理员预约一对一系统培训
            <br />• <strong>反馈建议：</strong>
            发现问题或有改进建议？点击「意见反馈」告诉我们
          </Paragraph>
          <Space>
            <Button type="primary">
              下载用户手册
            </Button>
            <Button>意见反馈</Button>
          </Space>
        </Space>
      </Card>
      </div>
    </Layout>
  );
};

export default SystemTutorial;
