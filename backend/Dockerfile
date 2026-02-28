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
# 默认激活 prod 配置（cloudbaserc.json 或 docker run -e 可覆盖）
ENV SPRING_PROFILES_ACTIVE=prod
# -Duser.timezone 双保险：确保 JVM 使用正确时区（与容器系统 TZ 一致）
CMD ["java", "-Duser.timezone=Asia/Shanghai", "-jar", "/app/app.jar"]
