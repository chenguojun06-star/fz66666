# IDE 清理废弃 API 指南

## IntelliJ IDEA 清理步骤

1. **全局搜索废弃方法**
   - 快捷键：`Ctrl+Shift+F`（Windows/Linux）或 `Cmd+Shift+F`（Mac）
   - 搜索：`@Deprecated`
   - 范围：`Project Files`

2. **安全删除方法**
   - 右键点击 `@Deprecated` 标记的方法
   - 选择 `Safe Delete`（快捷键：`Alt+Delete`）
   - IDEA 会自动检查引用并提示

3. **批量删除**
   - 使用 `Structural Search`（`Ctrl+Shift+S`）
   - 搜索模板：
     ```java
     @Deprecated
     $Modifier$ $ReturnType$ $MethodName$($Parameters$) {
       $MethodBody$
     }
     ```
   - 右键 → `Delete All Matches`

## VS Code 清理步骤

1. **安装 Java 扩展**
   - Extension Pack for Java

2. **搜索并删除**
   - 全局搜索：`@Deprecated`
   - 文件：`backend/src/main/java/**/*Controller.java`
   - 手动删除标记的方法

3. **验证编译**
   ```bash
   cd backend
   mvn clean compile
   ```

## 删除后验证

1. **编译检查**
   ```bash
   cd backend
   mvn clean install -DskipTests
   ```

2. **运行测试**
   ```bash
   mvn test
   ```

3. **启动服务**
   ```bash
   ./dev-public.sh
   ```

4. **前端功能测试**
   - 打开 http://localhost:5173
   - 测试所有主要功能
   - 检查浏览器 Console 无错误

## 常见问题

**Q: 删除后编译错误？**
A: 检查是否有内部调用，确保废弃方法已被新方法替代

**Q: 前端报错？**
A: 检查 `legacyApiAdapter.ts` 是否正确转发请求

**Q: 如何回滚？**
A: 从备份恢复：`tar -xzf backups/backend-before-cleanup-*.tar.gz`
