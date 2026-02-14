#!/bin/bash
cd "$(dirname "$0")"
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export APP_AUTH_JWT_SECRET='ThisIsA_LocalJwtSecret_OnlyForDev_0123456789'
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true'
export SPRING_DATASOURCE_USERNAME=root
export SPRING_DATASOURCE_PASSWORD=changeme
export WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
mvn spring-boot:run -DskipTests -Dmaven.test.skip=true
