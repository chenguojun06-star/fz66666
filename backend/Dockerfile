FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -q -e -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
ENV PORT=8088
COPY --from=build /app/target/*.jar ./app.jar
EXPOSE 8088
CMD ["java","-jar","/app/app.jar"]
