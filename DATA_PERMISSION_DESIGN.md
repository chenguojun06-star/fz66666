# 数据权限控制系统

## 概述

本系统实现了基于用户角色的数据权限控制，确保不同级别的用户只能访问其权限范围内的数据。

## 权限级别

| 权限范围 | 说明 | 适用角色 |
|---------|------|---------|
| `all` | 查看所有人的数据 | 管理员、主管 |
| `team` | 查看团队/班组的数据 | 组长、班长 |
| `own` | 仅查看自己的数据 | 普通工人 |

## 权限判断逻辑

```
┌─────────────────────────────────────────────────────────────┐
│                     用户请求数据                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   是管理员角色?   │
                    └─────────────────┘
                     │yes           │no
                     ▼              ▼
            ┌───────────┐   ┌─────────────────┐
            │ 返回全部   │   │ permissionRange │
            │   数据     │   │    = 'all'?     │
            └───────────┘   └─────────────────┘
                             │yes           │no
                             ▼              ▼
                    ┌───────────┐   ┌─────────────────┐
                    │ 返回全部   │   │ permissionRange │
                    │   数据     │   │   = 'team'?     │
                    └───────────┘   └─────────────────┘
                                     │yes           │no
                                     ▼              ▼
                            ┌───────────────┐ ┌───────────┐
                            │ 返回团队数据   │ │ 返回个人  │
                            │ (TODO:班组)   │ │  数据     │
                            └───────────────┘ └───────────┘
```

## 涉及的文件

### 后端

1. **UserContext.java** - 用户上下文，新增字段和方法:
   - `permissionRange` - 数据权限范围
   - `teamId` - 团队ID
   - `getDataScope()` - 获取数据范围
   - `canViewAll()` - 判断能否查看全部
   - `canViewTeam()` - 判断能否查看团队
   - `isWorker()` - 判断是否为普通工人

2. **DataPermissionHelper.java** - 数据权限过滤助手 (新建)
   - `applyOperatorFilter()` - 为QueryWrapper添加过滤条件
   - `canViewRecord()` - 判断是否有权查看某条记录
   - `addPermissionParams()` - 为Map参数添加权限参数

3. **TokenSubject.java** - JWT令牌主体，新增字段:
   - `permissionRange` - 数据权限范围

4. **AuthTokenService.java** - 令牌服务，新增处理:
   - 签发token时包含 `permRange`
   - 解析token时读取 `permRange`

5. **TokenAuthFilter.java** - 令牌过滤器，新增:
   - 将解析后的 TokenSubject 存入 request attribute

6. **SecurityConfig.java** - 安全配置，修改拦截器:
   - 从 TokenSubject 获取完整用户信息
   - 设置 permissionRange 到 UserContext

7. **ScanRecordServiceImpl.java** - 扫码记录服务，新增:
   - `applyDataPermissionFilter()` - 根据权限过滤查询结果

### 前端

1. **authContext.tsx** - 认证上下文:
   - `UserInfo.permissionRange` - 权限范围字段
   - `isAdmin()` - 判断管理员
   - `isSupervisorOrAbove()` - 判断主管以上
   - `canViewAllData()` - 判断能否查看全部
   - Context 新增 `isAdmin`, `canViewAll` 便捷属性

2. **UserList.tsx** - 用户管理:
   - 数据权限列显示改为标签形式
   - 表单中权限选择器更新为三个选项

## 数据表字段

`t_user` 表:
```sql
permission_range VARCHAR(50) COMMENT '权限范围: all/team/own'
```

## 使用示例

### 后端查询时添加权限过滤

```java
// 方式1: 使用 DataPermissionHelper
LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<>();
DataPermissionHelper.applyOperatorFilter(wrapper, "operator_id", "operator_name");
scanRecordMapper.selectList(wrapper);

// 方式2: 直接判断数据范围
String dataScope = UserContext.getDataScope();
if ("own".equals(dataScope)) {
    wrapper.eq(ScanRecord::getOperatorId, UserContext.userId());
}
```

### 前端根据权限显示UI

```tsx
import { useAuth, canViewAllData } from '@/utils/authContext';

const MyComponent = () => {
  const { user, canViewAll } = useAuth();
  
  return (
    <div>
      {canViewAll && <Button>导出全部数据</Button>}
      {!canViewAll && <span>您只能查看自己的数据</span>}
    </div>
  );
};
```

## 用户角色设置

在"系统设置" -> "人员管理"中，为每个用户设置:

1. **角色**: 选择用户的职位角色
2. **数据权限**: 
   - 查看全部 - 适合管理员、主管
   - 查看团队 - 适合组长、班长
   - 仅看自己 - 适合普通工人

## 注意事项

1. 管理员 (admin) 角色自动拥有全部数据权限，无需额外设置
2. 普通工人默认只能查看自己的扫码记录
3. 工资结算是按订单统计的，不受数据权限限制
4. 团队权限功能需要后续添加团队/班组管理模块

## 后续优化

- [ ] 添加团队/班组管理功能
- [ ] 实现团队数据过滤 (目前team权限同all)
- [ ] 前端根据权限隐藏部分菜单
- [ ] 添加数据权限审计日志
