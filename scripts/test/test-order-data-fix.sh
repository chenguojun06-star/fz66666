#!/bin/bash

# 订单数据完整性修复 - 快速测试脚本
# 用途：验证修复后的代码是否正确保存和显示所有订单字段
# 使用：./test-order-data-fix.sh

set -e

echo "========================================="
echo "订单数据完整性修复 - 测试脚本"
echo "修复日期：2026-02-15"
echo "========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 步骤1：检查服务状态
echo -e "${BLUE}步骤1：检查服务状态${NC}"
echo "----------------------------------------"

# 检查后端
if curl -s http://localhost:8088/actuator/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 后端服务运行中 (http://localhost:8088)"
else
    echo -e "${RED}✗${NC} 后端服务未运行"
    echo -e "${YELLOW}请先运行：./dev-public.sh${NC}"
    exit 1
fi

# 检查前端
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 前端服务运行中 (http://localhost:5173)"
else
    echo -e "${YELLOW}⚠${NC} 前端服务可能未运行（非致命错误）"
fi

# 检查数据库
if docker ps | grep fashion-mysql-simple > /dev/null; then
    echo -e "${GREEN}✓${NC} 数据库容器运行中"
else
    echo -e "${RED}✗${NC} 数据库容器未运行"
    echo -e "${YELLOW}请先运行：./deployment/db-manager.sh start${NC}"
    exit 1
fi

echo ""

# 步骤2：检查必要的测试数据
echo -e "${BLUE}步骤2：检查测试数据准备${NC}"
echo "----------------------------------------"

# 检查款式数据
STYLE_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e "SELECT COUNT(*) FROM t_style_info WHERE deleted = 0" 2>/dev/null)
if [ "$STYLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} 款式数据已准备 ($STYLE_COUNT 条)"
    SAMPLE_STYLE=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e "SELECT style_no FROM t_style_info WHERE deleted = 0 LIMIT 1" 2>/dev/null)
    echo "  示例款式编号：$SAMPLE_STYLE"
else
    echo -e "${YELLOW}⚠${NC} 款式数据为空，需要先创建款式"
    echo -e "${YELLOW}提示：访问「款式管理」创建测试款式${NC}"
fi

# 检查工厂数据
FACTORY_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e "SELECT COUNT(*) FROM t_factory WHERE deleted = 0" 2>/dev/null)
if [ "$FACTORY_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} 工厂数据已准备 ($FACTORY_COUNT 条)"
else
    echo -e "${YELLOW}⚠${NC} 工厂数据为空，需要先创建工厂"
    echo -e "${YELLOW}提示：访问「工厂管理」创建测试工厂${NC}"
fi

echo ""

# 步骤3：检查现有订单数据
echo -e "${BLUE}步骤3：检查现有订单数据完整性${NC}"
echo "----------------------------------------"

ORDER_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e "SELECT COUNT(*) FROM t_production_order WHERE deleted = 0" 2>/dev/null)
echo "现有订单总数：$ORDER_COUNT"

if [ "$ORDER_COUNT" -gt 0 ]; then
    echo ""
    echo "最近5条订单字段完整性检查："
    echo ""

    docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -t -e "
    SELECT
      order_no AS '订单号',
      CASE WHEN merchandiser IS NOT NULL THEN '✓' ELSE '✗' END AS '跟单员',
      CASE WHEN company IS NOT NULL THEN '✓' ELSE '✗' END AS '公司',
      CASE WHEN product_category IS NOT NULL THEN '✓' ELSE '✗' END AS '产品类别',
      CASE WHEN pattern_maker IS NOT NULL THEN '✓' ELSE '✗' END AS '打样员',
      CONCAT(
        CASE WHEN merchandiser IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN company IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN product_category IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN pattern_maker IS NOT NULL THEN 1 ELSE 0 END,
        '/4'
      ) AS '完整度',
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS '创建时间'
    FROM t_production_order
    WHERE deleted = 0
    ORDER BY created_at DESC
    LIMIT 5;
    " 2>/dev/null

    echo ""

    # 统计字段填写率
    MERCHANDISER_RATE=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e "
    SELECT CONCAT(ROUND(COUNT(CASE WHEN merchandiser IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 1), '%')
    FROM t_production_order WHERE deleted = 0" 2>/dev/null)

    COMPANY_RATE=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e "
    SELECT CONCAT(ROUND(COUNT(CASE WHEN company IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 1), '%')
    FROM t_production_order WHERE deleted = 0" 2>/dev/null)

    CATEGORY_RATE=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e "
    SELECT CONCAT(ROUND(COUNT(CASE WHEN product_category IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 1), '%')
    FROM t_production_order WHERE deleted = 0" 2>/dev/null)

    PATTERN_RATE=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e "
    SELECT CONCAT(ROUND(COUNT(CASE WHEN pattern_maker IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 1), '%')
    FROM t_production_order WHERE deleted = 0" 2>/dev/null)

    echo "字段填写率统计："
    echo "  跟单员：$MERCHANDISER_RATE"
    echo "  公司：$COMPANY_RATE"
    echo "  产品类别：$CATEGORY_RATE"
    echo "  打样员：$PATTERN_RATE"
    echo ""

    # 评估数据完整性
    if [[ "$MERCHANDISER_RATE" == "0.0%" ]] && [[ "$COMPANY_RATE" == "0.0%" ]]; then
        echo -e "${RED}⚠ 警告：关键字段填写率为 0%，可能存在数据丢失问题${NC}"
        echo -e "${YELLOW}建议：创建新订单测试修复效果${NC}"
    elif [[ "${MERCHANDISER_RATE%\%}" =~ ^[0-9]+(\.[0-9]+)?$ ]] && (( $(echo "${MERCHANDISER_RATE%\%} < 50" | bc -l) )); then
        echo -e "${YELLOW}⚠ 提示：部分字段填写率较低，建议测试新订单${NC}"
    else
        echo -e "${GREEN}✓ 数据完整性良好${NC}"
    fi
else
    echo -e "${YELLOW}ℹ 暂无订单数据，请创建测试订单${NC}"
fi

echo ""

# 步骤4：提供测试指引
echo -e "${BLUE}步骤4：手动测试指引${NC}"
echo "----------------------------------------"
echo ""
echo "请按以下步骤进行手动测试："
echo ""
echo -e "${GREEN}测试A：完整字段测试${NC}"
echo "  1. 访问：http://localhost:5173"
echo "  2. 进入「基础数据管理」→「下单管理」"
echo "  3. 创建新订单，${YELLOW}填写所有字段${NC}："
echo "     - 款式编号：选择款式"
echo "     - 订单数量：100"
echo "     - 工厂：选择工厂"
echo "     - ${YELLOW}跟单员${NC}：输入姓名（如\"张三修复测试\"）"
echo "     - ${YELLOW}公司${NC}：输入公司（如\"测试公司\"）"
echo "     - ${YELLOW}产品类别${NC}：选择类别"
echo "     - ${YELLOW}打样员${NC}：输入姓名（如\"李四\"）"
echo "  4. 保存订单"
echo "  5. 查看后端日志："
if [ -f "backend/logs/fashion-supplychain.log" ]; then
    echo "     tail -f backend/logs/fashion-supplychain.log | grep 'Creating order'"
else
    echo "     ${RED}日志文件不存在，请检查后端日志路径${NC}"
fi
echo "  6. 进入「生产管理」→「我的订单」"
echo "  7. ${GREEN}验证${NC}：所有字段正确显示（跟单员、公司、产品类别、打样员）"
echo ""

echo -e "${GREEN}测试B：空值处理测试${NC}"
echo "  1. 创建新订单，${YELLOW}仅填写必填字段${NC}（款式、数量、工厂）"
echo "  2. 跟单员、公司、产品类别、打样员等留空"
echo "  3. 保存订单（应成功，不报错）"
echo "  4. 查看后端日志（应显示 null 值）"
echo "  5. 进入「我的订单」列表"
echo "  6. ${GREEN}验证${NC}：空字段显示为空白，无错误提示"
echo ""

echo -e "${GREEN}测试C：编辑补充测试${NC}"
echo "  1. 编辑测试B创建的订单"
echo "  2. 补充之前留空的字段（跟单员、公司等）"
echo "  3. 保存订单"
echo "  4. ${GREEN}验证${NC}：字段成功更新并显示"
echo ""

# 步骤5：后端日志实时监控
echo -e "${BLUE}步骤5：后端日志实时监控${NC}"
echo "----------------------------------------"
echo ""
echo "创建订单时，后端日志应显示："
echo -e "${GREEN}Creating order - received fields: merchandiser=张三修复测试, company=测试公司, category=春装, patternMaker=李四, ...${NC}"
echo ""
echo "运行以下命令监控日志："
echo -e "${YELLOW}tail -f backend/logs/fashion-supplychain.log | grep --color=always 'Creating order'${NC}"
echo ""

# 步骤6：自动化完整性检查
echo -e "${BLUE}步骤6：完成测试后运行自动化检查${NC}"
echo "----------------------------------------"
echo ""
echo "创建测试订单后，运行以下命令检查数据完整性："
echo -e "${YELLOW}./check-order-data-completeness.sh${NC}"
echo ""
echo "脚本将自动检查："
echo "  - 字段完整性（merchandiser, company, product_category, pattern_maker）"
echo "  - JSON 字段有效性（orderDetails, progressWorkflowJson）"
echo "  - 关联数据一致性"
echo "  - 生成数据质量评分"
echo ""

# 步骤7：成功标准
echo -e "${BLUE}步骤7：验收标准${NC}"
echo "----------------------------------------"
echo ""
echo -e "${GREEN}✓${NC} 测试A：填写所有字段后，「我的订单」正确显示所有数据"
echo -e "${GREEN}✓${NC} 测试B：部分字段留空时，保存不报错，空字段显示为空白"
echo -e "${GREEN}✓${NC} 测试C：编辑订单时，能成功补充之前留空的字段"
echo -e "${GREEN}✓${NC} 后端日志正确记录了接收到的所有字段值"
echo -e "${GREEN}✓${NC} 数据库中字段值与表单填写一致"
echo ""

# 总结
echo "========================================="
echo -e "${BLUE}测试总结${NC}"
echo "========================================="
echo ""
echo "修复内容："
echo "  1. ✅ 前端：将空值从 undefined 改为 null"
echo "  2. ✅ 后端：添加字段接收日志"
echo ""
echo "下一步："
echo "  1. 执行测试A、B、C"
echo "  2. 监控后端日志"
echo "  3. 运行自动化检查脚本"
echo "  4. 确认所有验收标准通过"
echo ""
echo "相关文档："
echo "  - 修复总结：订单数据完整性修复总结-2026-02-15.md"
echo "  - 问题诊断：数据完整性问题诊断-2026-02-15.md"
echo "  - 修复补丁：订单数据修复补丁-2026-02-15.md"
echo ""
echo -e "${GREEN}测试准备完成！请开始手动测试。${NC}"
echo "========================================="
