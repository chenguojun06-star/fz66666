FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
COPY checkstyle.xml ./
RUN mvn -q -e -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -e -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
ENV PORT=8088
RUN apk add --no-cache ca-certificates curl tzdata \
  && update-ca-certificates \
  && rm -rf /var/cache/apk/*
RUN CACERTS="/opt/java/openjdk/lib/security/cacerts" \
  && if [ -f /etc/ssl/certs/ca-certificates.crt ]; then \
       for pem in /etc/ssl/certs/*.pem /etc/ssl/certs/ca-certificates.crt; do \
         [ -f "$pem" ] || continue; \
         alias="system-$(basename "$pem" .pem)"; \
         /opt/java/openjdk/bin/keytool -importcert -noprompt \
           -alias "$alias" -file "$pem" \
           -keystore "$CACERTS" -storepass changeit 2>/dev/null || true; \
       done; \
     fi \
  && /opt/java/openjdk/bin/keytool -list -keystore "$CACERTS" -storepass changeit 2>/dev/null | grep -c "trustedCertEntry" || true
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo "Asia/Shanghai" > /etc/timezone
RUN mkdir -p /uploads/tenants
COPY --from=build /app/target/*.jar ./app.jar
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8088/actuator/health || exit 1
ENV SPRING_PROFILES_ACTIVE=prod
CMD ["java", "-XX:TieredStopAtLevel=1", "-Dspring.jmx.enabled=false", "-Duser.timezone=Asia/Shanghai", "-Djavax.net.ssl.trustStore=/opt/java/openjdk/lib/security/cacerts", "-Djavax.net.ssl.trustStorePassword=changeit", "-jar", "/app/app.jar"]
