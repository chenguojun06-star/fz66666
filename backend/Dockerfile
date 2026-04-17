# ── 构建阶段：Maven 编译打包 ──────────────────────────────────────────────────
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

# 使用阿里云 Maven 镜像，大幅加快云端构建时依赖下载速度（Maven Central 直连慢 3-10x）
COPY maven-settings.xml /root/.m2/settings.xml

COPY pom.xml ./
COPY checkstyle.xml ./
# 先单独下载依赖，形成独立缓存层；只要 pom.xml 不变，此层不重新执行
RUN mvn -q -e -DskipTests --no-transfer-progress dependency:go-offline
COPY src ./src
RUN mvn -e -DskipTests --no-transfer-progress package

# ── 运行阶段：精简 JRE 镜像 ──────────────────────────────────────────────────
# eclipse-temurin:21-jre 基于 Ubuntu 24.04 (Noble Numbat)
# Noble 默认使用 DEB822 格式 (/etc/apt/sources.list.d/ubuntu.sources)，需同时兼容两种格式
# 移除 ca-certificates-java：Ubuntu 24.04 已不再提供此包，temurin 自带完整 Java CA 证书库
FROM eclipse-temurin:21-jre
WORKDIR /app
ENV PORT=8088

# 合并所有系统配置到一个 RUN 层，减少镜像层数
RUN (sed -i 's@archive.ubuntu.com@mirrors.aliyun.com@g' /etc/apt/sources.list 2>/dev/null || true) \
    && (sed -i 's@security.ubuntu.com@mirrors.aliyun.com@g' /etc/apt/sources.list 2>/dev/null || true) \
    && (sed -i 's@archive.ubuntu.com@mirrors.aliyun.com@g' /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null || true) \
    && (sed -i 's@security.ubuntu.com@mirrors.aliyun.com@g' /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null || true) \
    && apt-get clean \
    && apt-get update -o Acquire::Check-Valid-Until=false \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && update-ca-certificates \
    && ln -snf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && mkdir -p /uploads/tenants \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai
COPY --from=build /app/target/*.jar ./app.jar
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8088/actuator/health || exit 1
ENV SPRING_PROFILES_ACTIVE=prod
# 移除 -Djavax.net.ssl.trustStore：该文件由 ca-certificates-java 创建，
# 已移除该包后文件不存在，保留此参数会导致运行时 FileNotFoundException。
# temurin 自带 CA 库位于 /opt/java/openjdk/lib/security/cacerts，无需额外指定。
CMD ["java", "-XX:TieredStopAtLevel=1", "-Dspring.jmx.enabled=false", "-Duser.timezone=Asia/Shanghai", "-jar", "/app/app.jar"]
