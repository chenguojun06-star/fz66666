#!/bin/bash
# ==========================================================================
# 租户数据完整性测试 - 确保新租户创建时数据100%正确
# 测试范围：创建租户→角色分配→权限配置→登录验证→数据清理
# ==========================================================================
set -e

API="http://localhost:8088"
PASS=0
FAIL=0
TOTAL=0
ADMIN_TOKEN=""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_pass() { ((PASS++)); ((TOTAL++)); echo -e "${GREEN}✅ PASS${NC}: $1"; }
log_fail() { ((FAIL++)); ((TOTAL++)); echo -e "${RED}❌ FAIL${NC}: $1"; }
log_info() { echo -e "${YELLOW}→${NC} $1"; }
log_section() { echo -e "\n${YELLOW}━━━━━ $1 ━━━━━${NC}"; }

# ==========================================================================
# 前置检查
# ==========================================================================
log_section "前置环境检查"

# 检查后端是否运行
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/actuator/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    log_pass "后端服务运行正常 (port 8088)"
else
    log_fail "后端服务未运行 (HTTP $HTTP_CODE)"
    echo "请先运行: ./dev-public.sh"
    exit 1
fi

# 管理员登录获取Token
log_info "使用 admin 账号登录..."
LOGIN_RESP=$(curl -s -X POST "$API/api/system/user/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"123456"}' 2>/dev/null)
LOGIN_CODE=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)

if [ "$LOGIN_CODE" = "200" ]; then
    ADMIN_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
    log_pass "admin 登录成功"
else
    log_fail "admin 登录失败: $LOGIN_RESP"
    exit 1
fi

# 检查角色模板是否存在
log_info "检查 full_admin 角色模板..."
TEMPLATE_CHECK=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
    "SELECT COUNT(*) FROM t_role WHERE is_template=1 AND role_code='full_admin' AND status='active'" 2>/dev/null)
if [ "$TEMPLATE_CHECK" -ge 1 ]; then
    TEMPLATE_PERMS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
        "SELECT COUNT(*) FROM t_role_permission rp JOIN t_role r ON rp.role_id=r.id WHERE r.is_template=1 AND r.role_code='full_admin'" 2>/dev/null)
    log_pass "full_admin 角色模板存在，权限数: $TEMPLATE_PERMS"
else
    log_fail "full_admin 角色模板不存在！系统基础数据缺失"
    exit 1
fi

# ==========================================================================
# 测试 1: 创建新租户 → 验证完整数据
# ==========================================================================
log_section "测试 1: 创建新租户 + 验证数据完整性"

TENANT_CODE="TEST_INTEG_$(date +%s)"
OWNER_USER="test_owner_$(date +%s)"

log_info "创建租户: $TENANT_CODE, 主账号: $OWNER_USER"
CREATE_RESP=$(curl -s -X POST "$API/api/system/tenant/create" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{
        \"tenantName\": \"数据完整性测试工厂\",
        \"tenantCode\": \"$TENANT_CODE\",
        \"contactName\": \"张测试\",
        \"contactPhone\": \"13800001111\",
        \"ownerUsername\": \"$OWNER_USER\",
        \"ownerPassword\": \"Test123456\",
        \"ownerName\": \"张测试\",
        \"maxUsers\": 10
    }" 2>/dev/null)

CREATE_CODE=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
if [ "$CREATE_CODE" != "200" ]; then
    log_fail "租户创建失败: $CREATE_RESP"
    exit 1
fi
log_pass "租户创建 API 返回 200"

# 从响应中提取数据
OWNER_DATA=$(echo "$CREATE_RESP" | python3 -c "
import sys,json
d = json.load(sys.stdin)['data']
owner = d['owner']
tenant = d['tenant']
print(f\"tenantId={tenant['id']}\")
print(f\"ownerId={owner['id']}\")
print(f\"roleId={owner.get('roleId','NULL')}\")
print(f\"roleName={owner.get('roleName','NULL')}\")
print(f\"tenantOwner={owner.get('isTenantOwner','NULL')}\")
print(f\"permRange={owner.get('permissionRange','NULL')}\")
" 2>/dev/null)
echo "$OWNER_DATA"

TENANT_ID=$(echo "$OWNER_DATA" | grep "tenantId=" | cut -d= -f2)
OWNER_ID=$(echo "$OWNER_DATA" | grep "ownerId=" | cut -d= -f2)
ROLE_ID=$(echo "$OWNER_DATA" | grep "roleId=" | cut -d= -f2)
ROLE_NAME=$(echo "$OWNER_DATA" | grep "roleName=" | cut -d= -f2)
IS_TENANT_OWNER=$(echo "$OWNER_DATA" | grep "tenantOwner=" | cut -d= -f2)

# 1.1 验证 roleId 不为空
if [ -n "$ROLE_ID" ] && [ "$ROLE_ID" != "NULL" ] && [ "$ROLE_ID" != "None" ] && [ "$ROLE_ID" != "null" ]; then
    log_pass "主账号 roleId 不为空: $ROLE_ID"
else
    log_fail "主账号 roleId 为空！这是致命的数据完整性问题"
fi

# 1.2 验证 roleName 不为空
if [ -n "$ROLE_NAME" ] && [ "$ROLE_NAME" != "NULL" ] && [ "$ROLE_NAME" != "None" ]; then
    log_pass "主账号 roleName 不为空: $ROLE_NAME"
else
    log_fail "主账号 roleName 为空！"
fi

# 1.3 验证 isTenantOwner = true
if [ "$IS_TENANT_OWNER" = "True" ] || [ "$IS_TENANT_OWNER" = "true" ]; then
    log_pass "主账号 isTenantOwner=true"
else
    log_fail "主账号 isTenantOwner 不为 true: $IS_TENANT_OWNER"
fi

# 1.4 数据库层验证（绕过 API，直接查数据库）
log_info "数据库层直接验证..."
DB_CHECK=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
    "SELECT id, username, role_id, role_name, tenant_id, is_tenant_owner, status, permission_range
     FROM t_user WHERE username='$OWNER_USER'" 2>/dev/null)
echo "  DB: $DB_CHECK"

DB_ROLE_ID=$(echo "$DB_CHECK" | awk '{print $3}')
DB_ROLE_NAME=$(echo "$DB_CHECK" | awk '{print $4}')
DB_TENANT_ID=$(echo "$DB_CHECK" | awk '{print $5}')
DB_IS_OWNER=$(echo "$DB_CHECK" | awk '{print $6}')

if [ "$DB_ROLE_ID" != "NULL" ] && [ -n "$DB_ROLE_ID" ]; then
    log_pass "数据库 role_id 不为 NULL: $DB_ROLE_ID"
else
    log_fail "数据库 role_id 为 NULL！致命错误"
fi

if [ "$DB_TENANT_ID" = "$TENANT_ID" ]; then
    log_pass "数据库 tenant_id 正确: $DB_TENANT_ID"
else
    log_fail "数据库 tenant_id 不匹配: 期望 $TENANT_ID, 实际 $DB_TENANT_ID"
fi

if [ "$DB_IS_OWNER" = "1" ]; then
    log_pass "数据库 is_tenant_owner=1"
else
    log_fail "数据库 is_tenant_owner 不为 1: $DB_IS_OWNER"
fi

# 1.5 验证角色权限数量
if [ "$DB_ROLE_ID" != "NULL" ] && [ -n "$DB_ROLE_ID" ]; then
    PERM_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
        "SELECT COUNT(*) FROM t_role_permission WHERE role_id=$DB_ROLE_ID" 2>/dev/null)
    if [ "$PERM_COUNT" -gt 0 ]; then
        log_pass "角色权限已分配: $PERM_COUNT 个"
    else
        log_fail "角色权限为 0！角色虽然存在但没有权限"
    fi

    # 和模板的权限数比较
    if [ "$PERM_COUNT" -ge "$TEMPLATE_PERMS" ]; then
        log_pass "权限数 ($PERM_COUNT) >= 模板权限数 ($TEMPLATE_PERMS)"
    else
        log_info "权限数 ($PERM_COUNT) < 模板权限数 ($TEMPLATE_PERMS)，可能受天花板限制（非错误）"
    fi
fi

# ==========================================================================
# 测试 2: 新租户主账号登录 + 权限验证
# ==========================================================================
log_section "测试 2: 新租户主账号登录 + 权限验证"

log_info "使用新创建的 $OWNER_USER 登录..."
OWNER_LOGIN=$(curl -s -X POST "$API/api/system/user/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$OWNER_USER\",\"password\":\"Test123456\"}" 2>/dev/null)

OWNER_LOGIN_CODE=$(echo "$OWNER_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
if [ "$OWNER_LOGIN_CODE" = "200" ]; then
    log_pass "新租户主账号登录成功"
    OWNER_TOKEN=$(echo "$OWNER_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
else
    log_fail "新租户主账号登录失败: $OWNER_LOGIN"
    OWNER_TOKEN=""
fi

# 2.1 验证 JWT 中包含正确的 roleId
if [ -n "$OWNER_TOKEN" ]; then
    JWT_DATA=$(echo "$OWNER_TOKEN" | python3 -c "
import sys, json, base64
token = sys.stdin.read().strip()
parts = token.split('.')
payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
decoded = json.loads(base64.b64decode(payload))
print(f\"jwt_roleId={decoded.get('roleId','NULL')}\")
print(f\"jwt_tenantId={decoded.get('tenantId','NULL')}\")
print(f\"jwt_tenantOwner={decoded.get('tenantOwner','NULL')}\")
" 2>/dev/null)
    echo "  $JWT_DATA"

    JWT_ROLE_ID=$(echo "$JWT_DATA" | grep "jwt_roleId=" | cut -d= -f2)
    JWT_TENANT_OWNER=$(echo "$JWT_DATA" | grep "jwt_tenantOwner=" | cut -d= -f2)

    if [ "$JWT_ROLE_ID" != "NULL" ] && [ "$JWT_ROLE_ID" != "None" ] && [ -n "$JWT_ROLE_ID" ]; then
        log_pass "JWT 中 roleId 不为空: $JWT_ROLE_ID"
    else
        log_fail "JWT 中 roleId 为空！登录后权限计算将失败"
    fi

    if [ "$JWT_TENANT_OWNER" = "True" ] || [ "$JWT_TENANT_OWNER" = "true" ]; then
        log_pass "JWT 中 tenantOwner=true"
    else
        log_fail "JWT 中 tenantOwner 不为 true: $JWT_TENANT_OWNER"
    fi
fi

# 2.2 调用 /me 接口验证权限
if [ -n "$OWNER_TOKEN" ]; then
    log_info "调用 /api/system/user/me 验证权限..."
    ME_RESP=$(curl -s "$API/api/system/user/me" \
        -H "Authorization: Bearer $OWNER_TOKEN" 2>/dev/null)
    ME_CODE=$(echo "$ME_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)

    if [ "$ME_CODE" = "200" ]; then
        log_pass "/me 接口返回 200"

        ME_DATA=$(echo "$ME_RESP" | python3 -c "
import sys,json
d = json.load(sys.stdin).get('data',{})
perms = d.get('permissions',[])
print(f\"me_roleId={d.get('roleId','NULL')}\")
print(f\"me_roleName={d.get('roleName','NULL')}\")
print(f\"me_permCount={len(perms)}\")
print(f\"me_isTenantOwner={d.get('isTenantOwner','NULL')}\")
" 2>/dev/null)
        echo "  $ME_DATA"

        ME_PERM_COUNT=$(echo "$ME_DATA" | grep "me_permCount=" | cut -d= -f2)
        ME_ROLE_ID=$(echo "$ME_DATA" | grep "me_roleId=" | cut -d= -f2)

        if [ "$ME_ROLE_ID" != "NULL" ] && [ "$ME_ROLE_ID" != "None" ]; then
            log_pass "/me 返回 roleId: $ME_ROLE_ID"
        else
            log_fail "/me 返回 roleId 为空！"
        fi

        if [ "$ME_PERM_COUNT" -gt 0 ] 2>/dev/null; then
            log_pass "/me 返回权限数: $ME_PERM_COUNT"
        else
            log_fail "/me 返回权限数为 0！用户将无法访问任何功能"
        fi
    else
        log_fail "/me 接口返回非 200: $ME_CODE"
    fi
fi

# 2.3 模拟页面刷新（重新调用 /me，验证不会被踢出）
if [ -n "$OWNER_TOKEN" ]; then
    log_info "模拟页面刷新（连续3次 /me 调用）..."
    for i in 1 2 3; do
        REFRESH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/system/user/me" \
            -H "Authorization: Bearer $OWNER_TOKEN" 2>/dev/null)
        if [ "$REFRESH_CODE" = "200" ]; then
            if [ "$i" = "3" ]; then
                log_pass "页面刷新稳定性: 3次 /me 均返回 200（不会自动退出）"
            fi
        else
            log_fail "第 $i 次刷新返回 $REFRESH_CODE，用户会被踢出登录"
            break
        fi
    done
fi

# ==========================================================================
# 测试 3: 租户主账号可以执行管理操作
# ==========================================================================
log_section "测试 3: 租户主账号管理操作验证"

if [ -n "$OWNER_TOKEN" ]; then
    # 3.1 查看本租户信息
    MY_TENANT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/system/tenant/my" \
        -H "Authorization: Bearer $OWNER_TOKEN" 2>/dev/null)
    if [ "$MY_TENANT_CODE" = "200" ]; then
        log_pass "查看本租户信息: 200"
    else
        log_fail "查看本租户信息失败: $MY_TENANT_CODE"
    fi

    # 3.2 查看子账号列表
    SUB_LIST_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$API/api/system/tenant/sub/list" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $OWNER_TOKEN" \
        -d '{"page":1,"pageSize":10}' 2>/dev/null)
    if [ "$SUB_LIST_CODE" = "200" ]; then
        log_pass "查看子账号列表: 200"
    else
        log_fail "查看子账号列表失败: $SUB_LIST_CODE"
    fi

    # 3.3 查看角色列表
    ROLES_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "$API/api/system/tenant/roles/$TENANT_ID" \
        -H "Authorization: Bearer $OWNER_TOKEN" 2>/dev/null)
    if [ "$ROLES_CODE" = "200" ]; then
        log_pass "查看租户角色列表: 200"
    else
        log_fail "查看租户角色列表失败: $ROLES_CODE"
    fi
fi

# ==========================================================================
# 测试 4: 重复创建同名租户应失败
# ==========================================================================
log_section "测试 4: 重复创建相同编码的租户"

DUP_RESP=$(curl -s -X POST "$API/api/system/tenant/create" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{
        \"tenantName\": \"重复测试\",
        \"tenantCode\": \"$TENANT_CODE\",
        \"contactName\": \"重复\",
        \"contactPhone\": \"13800002222\",
        \"ownerUsername\": \"dup_owner_$(date +%s)\",
        \"ownerPassword\": \"Test123456\",
        \"maxUsers\": 5
    }" 2>/dev/null)
DUP_CODE=$(echo "$DUP_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
if [ "$DUP_CODE" != "200" ]; then
    log_pass "重复租户编码被正确拒绝 (code=$DUP_CODE)"
else
    log_fail "重复租户编码未被拒绝，存在数据一致性风险！"
fi

# ==========================================================================
# 测试 5: 连续创建第二个租户验证一致性
# ==========================================================================
log_section "测试 5: 连续创建第二个租户"

TENANT_CODE_2="TEST_INTEG2_$(date +%s)"
OWNER_USER_2="test_owner2_$(date +%s)"

CREATE_RESP_2=$(curl -s -X POST "$API/api/system/tenant/create" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{
        \"tenantName\": \"第二个测试工厂\",
        \"tenantCode\": \"$TENANT_CODE_2\",
        \"contactName\": \"李测试\",
        \"contactPhone\": \"13800003333\",
        \"ownerUsername\": \"$OWNER_USER_2\",
        \"ownerPassword\": \"Test123456\",
        \"ownerName\": \"李测试\",
        \"maxUsers\": 10
    }" 2>/dev/null)

CREATE_CODE_2=$(echo "$CREATE_RESP_2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
if [ "$CREATE_CODE_2" = "200" ]; then
    log_pass "第二个租户创建成功"

    # 验证第二个租户数据
    OWNER_2_DATA=$(echo "$CREATE_RESP_2" | python3 -c "
import sys,json
d = json.load(sys.stdin)['data']
owner = d['owner']
tenant = d['tenant']
print(f\"tenantId2={tenant['id']}\")
print(f\"roleId2={owner.get('roleId','NULL')}\")
print(f\"roleName2={owner.get('roleName','NULL')}\")
" 2>/dev/null)

    TENANT_ID_2=$(echo "$OWNER_2_DATA" | grep "tenantId2=" | cut -d= -f2)
    ROLE_ID_2=$(echo "$OWNER_2_DATA" | grep "roleId2=" | cut -d= -f2)

    if [ "$ROLE_ID_2" != "NULL" ] && [ "$ROLE_ID_2" != "None" ] && [ -n "$ROLE_ID_2" ]; then
        log_pass "第二个租户主账号 roleId: $ROLE_ID_2"
    else
        log_fail "第二个租户主账号 roleId 为空！数据完整性问题持续存在"
    fi

    # 验证两个租户的角色是独立的（不同 roleId）
    if [ "$ROLE_ID" != "$ROLE_ID_2" ]; then
        log_pass "两个租户的角色独立隔离 ($ROLE_ID vs $ROLE_ID_2)"
    else
        log_fail "两个租户共享同一个角色ID！租户隔离被破坏"
    fi

    # 第二个租户主账号登录验证
    OWNER2_LOGIN=$(curl -s -X POST "$API/api/system/user/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$OWNER_USER_2\",\"password\":\"Test123456\"}" 2>/dev/null)
    OWNER2_LOGIN_CODE=$(echo "$OWNER2_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
    if [ "$OWNER2_LOGIN_CODE" = "200" ]; then
        OWNER2_TOKEN=$(echo "$OWNER2_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)

        # /me 验证
        ME2_RESP=$(curl -s "$API/api/system/user/me" -H "Authorization: Bearer $OWNER2_TOKEN" 2>/dev/null)
        ME2_PERMS=$(echo "$ME2_RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('permissions',[])))" 2>/dev/null)

        if [ "$ME2_PERMS" -gt 0 ] 2>/dev/null; then
            log_pass "第二个租户主账号: 登录+权限正常 ($ME2_PERMS 个权限)"
        else
            log_fail "第二个租户主账号权限为 0"
        fi
    else
        log_fail "第二个租户主账号登录失败"
    fi
else
    log_fail "第二个租户创建失败: $CREATE_RESP_2"
fi

# ==========================================================================
# 测试 6: 验证现有租户数据完整性
# ==========================================================================
log_section "测试 6: 所有已有租户数据完整性扫描"

log_info "扫描所有租户主账号..."
ALL_OWNERS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
    "SELECT u.id, u.username, u.role_id, u.role_name, u.tenant_id, t.tenant_name
     FROM t_user u
     LEFT JOIN t_tenant t ON u.tenant_id = t.id
     WHERE u.is_tenant_owner = 1
     ORDER BY u.id" 2>/dev/null)

OWNER_COUNT=0
OWNER_BROKEN=0
while IFS=$'\t' read -r uid uname urole urole_name utenant tname; do
    ((OWNER_COUNT++))
    if [ "$urole" = "NULL" ] || [ -z "$urole" ]; then
        ((OWNER_BROKEN++))
        log_fail "租户主账号数据异常: id=$uid, username=$uname, role_id=NULL, tenant=$tname"
    else
        # 检查角色是否有权限
        PERM_C=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
            "SELECT COUNT(*) FROM t_role_permission WHERE role_id=$urole" 2>/dev/null)
        if [ "$PERM_C" -gt 0 ] 2>/dev/null; then
            log_pass "租户主账号OK: $uname (roleId=$urole, perms=$PERM_C, tenant=$tname)"
        else
            ((OWNER_BROKEN++))
            log_fail "租户主账号角色无权限: $uname (roleId=$urole, perms=0, tenant=$tname)"
        fi
    fi
done <<< "$ALL_OWNERS"

if [ "$OWNER_BROKEN" -eq 0 ]; then
    log_pass "所有 $OWNER_COUNT 个租户主账号数据完整"
else
    log_fail "$OWNER_COUNT 个租户主账号中 $OWNER_BROKEN 个存在数据问题"
fi

# ==========================================================================
# 清理测试数据
# ==========================================================================
log_section "清理测试数据"

log_info "清理本次创建的测试租户和用户..."
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "
-- 删除测试用户的权限缓存和覆盖
DELETE uo FROM t_user_permission_override uo
    JOIN t_user u ON uo.user_id = u.id
    WHERE u.username IN ('$OWNER_USER', '$OWNER_USER_2');

-- 删除测试角色的权限
DELETE rp FROM t_role_permission rp
    JOIN t_role r ON rp.role_id = r.id
    JOIN t_tenant t ON r.tenant_id = t.id
    WHERE t.tenant_code IN ('$TENANT_CODE', '$TENANT_CODE_2');

-- 删除测试角色
DELETE r FROM t_role r
    JOIN t_tenant t ON r.tenant_id = t.id
    WHERE t.tenant_code IN ('$TENANT_CODE', '$TENANT_CODE_2');

-- 删除测试用户
DELETE FROM t_user WHERE username IN ('$OWNER_USER', '$OWNER_USER_2');

-- 删除测试租户
DELETE FROM t_tenant WHERE tenant_code IN ('$TENANT_CODE', '$TENANT_CODE_2');
" 2>/dev/null

# 验证清理结果
REMAIN=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
    "SELECT COUNT(*) FROM t_tenant WHERE tenant_code IN ('$TENANT_CODE', '$TENANT_CODE_2')" 2>/dev/null)
if [ "$REMAIN" = "0" ]; then
    log_pass "测试数据已完全清理"
else
    log_fail "测试数据清理不完整，剩余 $REMAIN 条"
fi

# ==========================================================================
# 测试结果汇总
# ==========================================================================
log_section "测试结果汇总"

echo ""
echo "  通过: $PASS"
echo "  失败: $FAIL"
echo "  总计: $TOTAL"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  全部测试通过！租户数据完整性保障机制正常工作     ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════${NC}"
    echo -e "${RED}  有 $FAIL 个测试失败！存在数据完整性风险          ${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════${NC}"
    exit 1
fi
