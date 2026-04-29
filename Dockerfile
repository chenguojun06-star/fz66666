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
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
  CMD curl -f http://localhost:8088/actuator/health || exit 1
ENV SPRING_PROFILES_ACTIVE=prod
CMD ["java", "-XX:+UseG1GC", "-XX:MaxGCPauseMillis=200", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=50.0", "-XX:MaxMetaspaceSize=256m", "-Dspring.jmx.enabled=false", "-Duser.timezone=Asia/Shanghai", "-jar", "/app/app.jar"]
