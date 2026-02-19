#!/bin/bash

# 面辅料全流程测试脚本
# 流程：仓库指令 → 采购 → 入库 → 对账
# 每种面料100米真实数据

BASE_URL="http://localhost:8088"
TIMESTAMP=$(date +%Y%m%d%H%M%S)

echo "========================================="
echo "面辅料全流程测试脚本"
echo "流程：仓库指令 → 采购 → 入库 → 对账"
echo "时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
echo ""

# ==================== 面料基础数据 ====================
declare -a FABRICS=(
  "纯棉平纹布|fabric|白色|150cm|200g/m²|100%棉|35.00|慕尚纺织"
  "涤纶斜纹布|fabric|黑色|145cm|180g/m²|100%涤纶|28.00|华丽面料"
  "真丝绸缎|fabric|米白色|114cm|80g/m²|100%真丝|158.00|苏州丝绸"
  "雪纺薄纱|fabric|粉红色|150cm|60g/m²|100%涤纶|42.00|轻盈纺织"
  "牛仔布|fabric|深蓝色|148cm|320g/m²|98%棉2%弹力纤维|52.00|丹宁世家"
  "毛呢面料|fabric|灰色|150cm|350g/m²|70%羊毛30%涤纶|128.00|暖阳纺织"
  "雪纺印花布|fabric|碎花|140cm|75g/m²|100%涤纶|38.00|印象面料"
  "针织棉布|fabric|浅灰色|160cm|180g/m²|95%棉5%氨纶|45.00|舒适针织"
  "亚麻混纺布|fabric|米色|142cm|240g/m²|55%亚麻45%棉|68.00|自然纺织"
  "天鹅绒|fabric|酒红色|145cm|280g/m²|100%涤纶|88.00|华贵面料"
)

# ==================== 登录系统 ====================
echo "1️⃣  登录系统..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo "$LOGIN_RESPONSE"
  exit 1
fi
echo "✅ 登录成功"
echo ""

# ==================== 创建面料资料 ====================
echo "2️⃣  创建面料资料库..."
declare -a MATERIAL_CODES=()
FABRIC_INDEX=0

for fabric_data in "${FABRICS[@]}"; do
  IFS='|' read -r name type color width weight composition price supplier <<< "$fabric_data"

  MATERIAL_CODE="FABRIC-${TIMESTAMP}-$(printf "%02d" $FABRIC_INDEX)"
  MATERIAL_CODES+=("$MATERIAL_CODE")

  echo "   创建: $name ($color)"

  CREATE_MATERIAL=$(curl -s -X POST "${BASE_URL}/api/material/database" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{
      \"materialCode\": \"${MATERIAL_CODE}\",
      \"materialName\": \"${name}\",
      \"materialType\": \"${type}\",
      \"color\": \"${color}\",
      \"specifications\": \"${width}\",
      \"unit\": \"米\",
      \"supplierName\": \"${supplier}\",
      \"unitPrice\": ${price},
      \"fabricWidth\": \"${width}\",
      \"fabricWeight\": \"${weight}\",
      \"fabricComposition\": \"${composition}\",
      \"status\": \"completed\",
      \"remark\": \"全流程测试数据 - ${TIMESTAMP}\"
    }")

  if echo "$CREATE_MATERIAL" | grep -q '"code":200'; then
    echo "   ✅ $name 创建成功 ($MATERIAL_CODE)"
  else
    echo "   ⚠️  $name 创建失败"
  fi

  FABRIC_INDEX=$((FABRIC_INDEX + 1))
  sleep 0.3  # 避免请求过快
done

echo ""
echo "✅ 共创建 ${#MATERIAL_CODES[@]} 种面料"
echo ""

# ==================== 创建采购指令（仓库发出）====================
echo "3️⃣  仓库发出采购指令..."
declare -a INSTRUCTION_IDS=()
FABRIC_INDEX=0

for material_code in "${MATERIAL_CODES[@]}"; do
  fabric_data="${FABRICS[$FABRIC_INDEX]}"
  IFS='|' read -r name type color width weight composition price supplier <<< "$fabric_data"

  echo "   指令: $name - 100米"

  INSTRUCTION=$(curl -s -X POST "${BASE_URL}/api/production/purchase/instruction" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{
      \"materialCode\": \"${material_code}\",
      \"materialName\": \"${name}\",
      \"materialType\": \"${type}\",
      \"unit\": \"米\",
      \"color\": \"${color}\",
      \"purchaseQuantity\": 100,
      \"receiverId\": \"1\",
      \"receiverName\": \"采购经理\",
      \"remark\": \"仓库发出采购需求 - 需求数量100米\"
    }")

  INSTRUCTION_ID=$(echo "$INSTRUCTION" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ ! -z "$INSTRUCTION_ID" ]; then
    INSTRUCTION_IDS+=("$INSTRUCTION_ID")
    echo "   ✅ 指令已下发 (ID: $INSTRUCTION_ID)"
  else
    echo "   ⚠️  指令下发失败"
    INSTRUCTION_IDS+=("")
  fi

  FABRIC_INDEX=$((FABRIC_INDEX + 1))
  sleep 0.3
done

echo ""
echo "✅ 共下发 ${#INSTRUCTION_IDS[@]} 条采购指令"
echo ""

# ==================== 创建采购单 ====================
echo "4️⃣  采购部门创建采购单..."
declare -a PURCHASE_IDS=()
FABRIC_INDEX=0

for material_code in "${MATERIAL_CODES[@]}"; do
  fabric_data="${FABRICS[$FABRIC_INDEX]}"
  IFS='|' read -r name type color width weight composition price supplier <<< "$fabric_data"

  echo "   采购: $name - 100米 @ ¥${price}/米"

  TOTAL_PRICE=$(awk "BEGIN {printf \"%.2f\", ${price} * 100}")

  PURCHASE=$(curl -s -X POST "${BASE_URL}/api/production/purchase" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{
      \"materialCode\": \"${material_code}\",
      \"materialName\": \"${name}\",
      \"materialType\": \"${type}\",
      \"specifications\": \"${width}\",
      \"unit\": \"米\",
      \"color\": \"${color}\",
      \"size\": \"\",
      \"purchaseQuantity\": 100,
      \"unitPrice\": ${price},
      \"totalPrice\": ${TOTAL_PRICE},
      \"supplierName\": \"${supplier}\",
      \"buyerId\": \"1\",
      \"buyerName\": \"采购经理\",
      \"receiverName\": \"仓库管理员\",
      \"expectedDeliveryDate\": \"2026-02-15\",
      \"status\": \"pending\",
      \"sourceType\": \"manual\",
      \"remark\": \"根据仓库指令创建 - ${TIMESTAMP}\"
    }")

  # 尝试从API响应提取ID
  PURCHASE_ID=$(echo "$PURCHASE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  # 如果API没返回ID，从数据库查询（因为API返回的是boolean而不是对象）
  if [ -z "$PURCHASE_ID" ]; then
    # 查询刚创建的采购单（根据material_code和remark中的批次号）
    PURCHASE_ID=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_purchase WHERE material_code='${material_code}' AND remark LIKE '%${TIMESTAMP}%' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)
  fi

  if [ ! -z "$PURCHASE_ID" ]; then
    PURCHASE_IDS+=("$PURCHASE_ID")
    echo "   ✅ 采购单已创建 (ID: $PURCHASE_ID, 总价: ¥${TOTAL_PRICE})"
  else
    echo "   ⚠️  采购单创建失败或无法查询到: $PURCHASE"
    PURCHASE_IDS+=("")
  fi

  FABRIC_INDEX=$((FABRIC_INDEX + 1))
  sleep 0.3
done

echo ""
echo "✅ 共创建 ${#PURCHASE_IDS[@]} 张采购单"
echo ""

# ==================== 采购到货入库 ====================
echo "5️⃣  采购到货，执行入库操作..."
declare -a INBOUND_NOS=()
FABRIC_INDEX=0

for material_code in "${MATERIAL_CODES[@]}"; do
  fabric_data="${FABRICS[$FABRIC_INDEX]}"
  IFS='|' read -r name type color width weight composition price supplier <<< "$fabric_data"
  purchase_id="${PURCHASE_IDS[$FABRIC_INDEX]}"

  if [ -z "$purchase_id" ]; then
    echo "   ⏭️  跳过 $name（无采购单）"
    INBOUND_NOS+=("")
    FABRIC_INDEX=$((FABRIC_INDEX + 1))
    continue
  fi

  echo "   入库: $name - 100米"

  INBOUND=$(curl -s -X POST "${BASE_URL}/api/production/material/inbound/confirm-arrival" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{
      \"purchaseId\": \"${purchase_id}\",
      \"arrivedQuantity\": 100,
      \"warehouseLocation\": \"A区-$(printf "%02d" $FABRIC_INDEX)货架\",
      \"operatorId\": \"1\",
      \"operatorName\": \"仓库管理员\",
      \"remark\": \"采购到货入库 - 数量100米\"
    }")

  INBOUND_NO=$(echo "$INBOUND" | grep -o '"inboundNo":"[^"]*"' | cut -d'"' -f4)

  if [ ! -z "$INBOUND_NO" ]; then
    INBOUND_NOS+=("$INBOUND_NO")
    echo "   ✅ 入库成功 (入库单号: $INBOUND_NO)"
  else
    echo "   ⚠️  入库失败: $(echo $INBOUND | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
    INBOUND_NOS+=("")
  fi

  FABRIC_INDEX=$((FABRIC_INDEX + 1))
  sleep 0.5
done

echo ""
echo "✅ 共完成 ${#INBOUND_NOS[@]} 笔入库"
echo ""

# ==================== 生成面料对账单 ====================
echo "6️⃣  生成面料对账单..."
declare -a RECONCILIATION_IDS=()
FABRIC_INDEX=0

for material_code in "${MATERIAL_CODES[@]}"; do
  fabric_data="${FABRICS[$FABRIC_INDEX]}"
  IFS='|' read -r name type color width weight composition price supplier <<< "$fabric_data"
  purchase_id="${PURCHASE_IDS[$FABRIC_INDEX]}"
  inbound_no="${INBOUND_NOS[$FABRIC_INDEX]}"

  if [ -z "$purchase_id" ] || [ -z "$inbound_no" ]; then
    echo "   ⏭️  跳过 $name（无完整数据）"
    RECONCILIATION_IDS+=("")
    FABRIC_INDEX=$((FABRIC_INDEX + 1))
    continue
  fi

  echo "   对账: $name"

  TOTAL_AMOUNT=$(echo "$price * 100" | bc)
  RECONCILIATION_NO="MR${TIMESTAMP}$(printf "%02d" $FABRIC_INDEX)"

  RECONCILIATION=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{
      \"reconciliationNo\": \"${RECONCILIATION_NO}\",
      \"purchaseId\": \"${purchase_id}\",
      \"materialCode\": \"${material_code}\",
      \"materialName\": \"${name}\",
      \"materialType\": \"${type}\",
      \"color\": \"${color}\",
      \"supplierName\": \"${supplier}\",
      \"purchaseQuantity\": 100,
      \"receivedQuantity\": 100,
      \"unitPrice\": ${price},
      \"totalAmount\": ${TOTAL_AMOUNT},
      \"inboundNo\": \"${inbound_no}\",
      \"status\": \"pending\",
      \"reconciliationDate\": \"$(date '+%Y-%m-%d')\",
      \"remark\": \"系统自动生成对账单 - ${TIMESTAMP}\"
    }")

  RECONCILIATION_ID=$(echo "$RECONCILIATION" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ ! -z "$RECONCILIATION_ID" ] || echo "$RECONCILIATION" | grep -q '"code":200'; then
    RECONCILIATION_IDS+=("$RECONCILIATION_ID")
    echo "   ✅ 对账单已生成 (编号: $RECONCILIATION_NO, 金额: ¥${TOTAL_AMOUNT})"
  else
    echo "   ⚠️  对账单生成失败"
    RECONCILIATION_IDS+=("")
  fi

  FABRIC_INDEX=$((FABRIC_INDEX + 1))
  sleep 0.3
done

echo ""
echo "✅ 共生成 ${#RECONCILIATION_IDS[@]} 张对账单"
echo ""

# ==================== 汇总统计 ====================
echo "========================================="
echo "📊 全流程测试汇总"
echo "========================================="
echo ""
echo "✅ 面料资料: ${#MATERIAL_CODES[@]} 种"
echo "✅ 采购指令: ${#INSTRUCTION_IDS[@]} 条"
echo "✅ 采购单: ${#PURCHASE_IDS[@]} 张"
echo "✅ 入库记录: ${#INBOUND_NOS[@]} 笔"
echo "✅ 对账单: ${#RECONCILIATION_IDS[@]} 张"
echo ""

# 计算总金额
TOTAL_AMOUNT=0
FABRIC_INDEX=0
for fabric_data in "${FABRICS[@]}"; do
  IFS='|' read -r name type color width weight composition price supplier <<< "$fabric_data"
  AMOUNT=$(echo "$price * 100" | bc)
  TOTAL_AMOUNT=$(echo "$TOTAL_AMOUNT + $AMOUNT" | bc)
  FABRIC_INDEX=$((FABRIC_INDEX + 1))
done

echo "💰 采购总金额: ¥${TOTAL_AMOUNT}"
echo "📦 库存总量: $((${#MATERIAL_CODES[@]} * 100)) 米"
echo ""

# ==================== 数据查看提示 ====================
echo "========================================="
echo "📌 数据查看指引"
echo "========================================="
echo ""
echo "1. 面料资料库（MaterialDatabase）"
echo "   路径: 仓库管理 → 面辅料资料库"
echo "   筛选: 搜索关键词 \"${TIMESTAMP}\""
echo ""
echo "2. 采购指令（Instruction）"
echo "   路径: 生产管理 → 物料采购"
echo "   筛选: 我的任务或按日期筛选"
echo ""
echo "3. 采购单（Purchase）"
echo "   路径: 生产管理 → 物料采购"
echo "   状态: 待入库/已入库"
echo ""
echo "4. 入库记录（Inbound）"
echo "   路径: 仓库管理 → 面辅料进销存"
echo "   查看: 点击物料 → 查看详情 → 入库记录"
echo ""
echo "5. 对账单（Reconciliation）"
echo "   路径: 财务管理 → 面料对账"
echo "   状态: 待对账"
echo ""
echo "6. 库存明细（Stock）"
echo "   路径: 仓库管理 → 面辅料进销存"
echo "   筛选: 按物料编码搜索"
echo ""

# ==================== 详细数据列表 ====================
echo "========================================="
echo "📋 创建的面料明细"
echo "========================================="
echo ""

FABRIC_INDEX=0
for fabric_data in "${FABRICS[@]}"; do
  IFS='|' read -r name type color width weight composition price supplier <<< "$fabric_data"
  material_code="${MATERIAL_CODES[$FABRIC_INDEX]}"
  purchase_id="${PURCHASE_IDS[$FABRIC_INDEX]}"
  inbound_no="${INBOUND_NOS[$FABRIC_INDEX]}"

  echo "$((FABRIC_INDEX + 1)). $name"
  echo "   物料编码: $material_code"
  echo "   颜色: $color | 幅宽: $width | 克重: $weight"
  echo "   成分: $composition"
  echo "   单价: ¥${price}/米 | 采购: 100米 | 总价: ¥$(echo "$price * 100" | bc)"
  echo "   供应商: $supplier"
  echo "   仓位: A区-$(printf "%02d" $FABRIC_INDEX)货架"
  [ ! -z "$purchase_id" ] && echo "   采购单ID: $purchase_id"
  [ ! -z "$inbound_no" ] && echo "   入库单号: $inbound_no"
  echo ""

  FABRIC_INDEX=$((FABRIC_INDEX + 1))
done

# ==================== 测试完成 ====================
echo "========================================="
echo "✅ 全流程测试完成！"
echo "========================================="
echo ""
echo "测试批次标识: ${TIMESTAMP}"
echo "完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "💡 提示：可以在前端系统中查看完整的数据流转记录"
echo ""
