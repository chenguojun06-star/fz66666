FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -q -e -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -e -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
ENV PORT=8088
# 创建上传目录（COS 未配置时的降级存储 + 避免启动报错）
RUN mkdir -p /uploads/tenants
COPY --from=build /app/target/*.jar ./app.jar
EXPOSE 8088
# 默认激活 prod 配置（cloudbaserc.json 或 docker run -e 可覆盖）
ENV SPRING_PROFILES_ACTIVE=prod
CMD ["java", "-jar", "/app/app.jar"]
