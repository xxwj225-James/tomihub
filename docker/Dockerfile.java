# ==========================================
# Multi-stage Dockerfile — Java Microservices
# ==========================================
FROM maven:3.9-eclipse-temurin-21 AS deps
WORKDIR /build
COPY docker/maven-settings.xml /root/.m2/settings.xml
COPY backend/pom.xml ./pom.xml
COPY backend/ai-pm-common/pom.xml ./ai-pm-common/pom.xml
COPY backend/ai-pm-gateway/pom.xml ./ai-pm-gateway/pom.xml
COPY backend/ai-pm-auth/pom.xml ./ai-pm-auth/pom.xml
COPY backend/ai-pm-tenant/pom.xml ./ai-pm-tenant/pom.xml
COPY backend/ai-pm-core/pom.xml ./ai-pm-core/pom.xml
COPY backend/ai-pm-notification/pom.xml ./ai-pm-notification/pom.xml
COPY backend/ai-pm-webhook/pom.xml ./ai-pm-webhook/pom.xml
RUN mvn dependency:go-offline -B -DexcludeReactor=true || \
    mvn dependency:resolve -B -DexcludeReactor=true

# ═══ Stage 1: Build ═══
# NOTE: no ProGuard obfuscation — core is batch-1 open source (AGPL), and the
# license verifier it used to protect was removed (P1). Obfuscating open code
# is pointless and broke the build (auth module).
FROM deps AS builder
COPY backend/ai-pm-common/src ./ai-pm-common/src
COPY backend/ai-pm-gateway/src ./ai-pm-gateway/src
COPY backend/ai-pm-auth/src ./ai-pm-auth/src
COPY backend/ai-pm-tenant/src ./ai-pm-tenant/src
COPY backend/ai-pm-core/src ./ai-pm-core/src
COPY backend/ai-pm-notification/src ./ai-pm-notification/src
COPY backend/ai-pm-webhook/src ./ai-pm-webhook/src
# install (not package): each module installs to ~/.m2 so parallel builds resolve correctly
# -Dmaven.test.skip=true: don't compile/run tests in the image (tests are for
# CI; shipping them only slows builds and can drift from refactored ctors).
RUN mvn clean install -Dmaven.test.skip=true -B -T 2

# ═══ Stage 2: Runtime ═══
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache curl && \
    addgroup -S ai-pm && adduser -S ai-pm -G ai-pm && \
    mkdir -p /app/logs /var/log/tomiHub && \
    chown -R ai-pm:ai-pm /app /var/log/tomiHub && \
    rm -rf /var/cache/apk/* /tmp/* /root/.cache
USER ai-pm
ENV JAVA_OPTS="-XX:+UseZGC -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=60s \
  CMD curl -sf http://localhost:${SERVER_PORT:-8080}/actuator/health/liveness || exit 1

FROM runtime AS gateway
ARG JAR_FILE=ai-pm-gateway/target/ai-pm-gateway-*.jar
COPY --from=builder /build/${JAR_FILE} app.jar
ENV SERVER_PORT=8080
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar"]

FROM runtime AS auth
ARG JAR_FILE=ai-pm-auth/target/ai-pm-auth-*.jar
COPY --from=builder /build/${JAR_FILE} app.jar
ENV SERVER_PORT=8081
EXPOSE 8081
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar"]

FROM runtime AS tenant
ARG JAR_FILE=ai-pm-tenant/target/ai-pm-tenant-*.jar
COPY --from=builder /build/${JAR_FILE} app.jar
ENV SERVER_PORT=8083
EXPOSE 8083
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar"]

FROM runtime AS core
ARG JAR_FILE=ai-pm-core/target/ai-pm-core-*.jar
COPY --from=builder /build/${JAR_FILE} app.jar
ENV SERVER_PORT=8082
EXPOSE 8082
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar"]

FROM runtime AS notification
ARG JAR_FILE=ai-pm-notification/target/ai-pm-notification-*.jar
COPY --from=builder /build/${JAR_FILE} app.jar
ENV SERVER_PORT=8084
EXPOSE 8084
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar"]

FROM runtime AS webhook
ARG JAR_FILE=ai-pm-webhook/target/ai-pm-webhook-*.jar
COPY --from=builder /build/${JAR_FILE} app.jar
ENV SERVER_PORT=8085
EXPOSE 8085
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar"]
