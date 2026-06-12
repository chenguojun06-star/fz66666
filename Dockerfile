FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

COPY backend/maven-settings.xml /root/.m2/settings.xml

COPY backend/pom.xml ./
COPY backend/checkstyle.xml ./
RUN mvn -q -e -DskipTests --no-transfer-progress dependency:go-offline
COPY backend/src ./src
RUN mvn -e -DskipTests --no-transfer-progress package

FROM eclipse-temurin:21-jre
WORKDIR /app
ENV PORT=8088

RUN (sed -i 's@archive.ubuntu.com@mirrors.aliyun.com@g' /etc/apt/sources.list 2>/dev/null || true) \
    && (sed -i 's@security.ubuntu.com@mirrors.aliyun.com@g' /etc/apt/sources.list 2>/dev/null || true) \
    && (sed -i 's@archive.ubuntu.com@mirrors.aliyun.com@g' /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null || true) \
    && (sed -i 's@security.ubuntu.com@mirrors.aliyun.com@g' /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null || true) \
    && apt-get clean \
    && apt-get update -o Acquire::Check-Valid-Utility=false \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && update-ca-certificates \
    && ln -snf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && mkdir -p /uploads/tenants \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai
COPY --from=build /app/target/*.jar ./app.jar
COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 8088

# ⚠️ CloudBase 探针：HTTP + TCP 双保险，start-period=300s 给足启动时间
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
  CMD curl -fsS -o /dev/null --max-time 3 http://127.0.0.1:8088/actuator/health 2>/dev/null || \
      (echo "actuator not ready, checking TCP port" && (echo > /dev/tcp/127.0.0.1/8088) 2>/dev/null || exit 1)

ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["./docker-entrypoint.sh"]
