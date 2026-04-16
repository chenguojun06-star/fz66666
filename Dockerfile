FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
ARG BUILD_DATE=2026-04-16
RUN echo "Build date: ${BUILD_DATE}" > /app/build-info.txt
COPY backend/pom.xml ./
COPY backend/checkstyle.xml ./
ENV MAVEN_OPTS="-Xmx512m"
RUN mvn -q -e -DskipTests -Dcheckstyle.skip=true dependency:go-offline
COPY backend/src ./src
RUN mvn -e -DskipTests -Dcheckstyle.skip=true --no-transfer-progress package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
ENV PORT=8088
RUN apk add --no-cache ca-certificates curl tzdata \
  && update-ca-certificates \
  && rm -rf /var/cache/apk/*
RUN /opt/java/openjdk/bin/keytool -importcert -alias root-ca \
  -keystore /opt/java/openjdk/lib/security/cacerts \
  -file /etc/ssl/certs/ca-certificates.crt \
  -storepass changeit -noprompt 2>/dev/null || true
RUN for cert in /etc/ssl/certs/*.pem; do \
      /opt/java/openjdk/bin/keytool -importcert -alias "system-$(basename $cert .pem)" \
        -keystore /opt/java/openjdk/lib/security/cacerts \
        -file "$cert" -storepass changeit -noprompt 2>/dev/null || true; \
    done
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo "Asia/Shanghai" > /etc/timezone
RUN mkdir -p /uploads/tenants
COPY --from=build /app/target/*.jar ./app.jar
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8088/actuator/health || exit 1
ENV SPRING_PROFILES_ACTIVE=prod
CMD ["java", "-XX:TieredStopAtLevel=1", "-Dspring.jmx.enabled=false", "-Duser.timezone=Asia/Shanghai", "-Djavax.net.ssl.trustStore=/opt/java/openjdk/lib/security/cacerts", "-Djavax.net.ssl.trustStorePassword=changeit", "-jar", "/app/app.jar"]
