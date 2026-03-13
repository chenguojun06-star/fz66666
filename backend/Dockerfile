FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -q -e -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -e -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
ENV PORT=8088
# ⚠️ 强制设置容器时区为北京时间（Asia/Shanghai）
# eclipse-temurin 基础镜像默认 UTC，不设置会导致 LocalDateTime.now() 返回 UTC
# 表现：扫码记录时间偏 8 小时（小程序显示"8小时前"）
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo "Asia/Shanghai" > /etc/timezone
# 创建上传目录（COS 未配置时的降级存储 + 避免启动报错）
RUN mkdir -p /uploads/tenants
COPY --from=build /app/target/*.jar ./app.jar
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8088/actuator/health || exit 1
# 默认激活 prod 配置（cloudbaserc.json 或 docker run -e 可覆盖）
ENV SPRING_PROFILES_ACTIVE=prod
# JVM 启动优化（云端健康检查探针有时间限制，必须加速启动）
# -XX:TieredStopAtLevel=1  仅使用 C1 编译器，加速启动 30~50%
# -Duser.timezone          双保险：确保 JVM 使用正确时区（与容器系统 TZ 一致）
# -Dspring.jmx.enabled=false  禁用 JMX，减少启动扫描时间
CMD ["java", "-XX:TieredStopAtLevel=1", "-Dspring.jmx.enabled=false", "-Duser.timezone=Asia/Shanghai", "-jar", "/app/app.jar"]
