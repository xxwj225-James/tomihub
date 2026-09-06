# TomiHub Deployment Guide

> **Version**: v1.0
> **Date**: 2026-06-12
> **Applies to**: Localized private deployment / Production environments

---

## 1. Service List

| Service | Port | Tech Stack | Deployment Mode |
|------|------|--------|---------|
| PostgreSQL | 5434 | pgvector/pgvector:pg16 | Docker |
| Redis | 6379 | redis:7-alpine | Docker |
| RabbitMQ | 5672 / 15672 | rabbitmq:3-management-alpine | Docker |
| Nginx | 80 | nginx:alpine | Docker |
| Auth Service | 8081 | Spring Boot 3.3 + JDK 21 | Java process |
| Core Service | 8082 | Spring Boot 3.3 + JDK 21 | Java process |
| AI Brain | 8000 | Python 3.12 + FastAPI | Python process |
| Frontend | 3000 | Vite + React 19 | Node.js process |

## 2. Docker Containers

```bash
# base services
docker run -d --name tomiHub-postgres -p 5434:5432 \
  -e POSTGRES_USER=aipm -e POSTGRES_PASSWORD=<password> -e POSTGRES_DB=aipm \
  -v tomiHub_pgdata:/var/lib/postgresql/data \
  pgvector/pgvector:pg16

docker run -d --name tomiHub-redis -p 6379:6379 \
  redis:7-alpine --requirepass <password>

docker run -d --name tomiHub-rabbitmq -p 5672:5672 -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=aipm -e RABBITMQ_DEFAULT_PASS=<password> \
  rabbitmq:3-management-alpine
```

## 3. Application Service Startup Scripts

### 3.1 `start-services.sh`

```bash
#!/bin/bash
# TomiHub — Start all application services

JDK=/opt/jdk-21
MVN=/opt/apache-maven-3.9.9/bin/mvn
PROJECT_DIR=/opt/tomiHub

export JAVA_HOME=$JDK
export PATH=$JDK/bin:$MVN:$PATH

# Auth Service (8081)
cd $PROJECT_DIR/backend/ai-pm-auth
nohup mvn spring-boot:run -Dspring-boot.run.profiles=prod > /var/log/tomiHub/auth.log 2>&1 &

# Core Service (8082)
cd $PROJECT_DIR/backend/ai-pm-core
nohup mvn spring-boot:run -Dspring-boot.run.profiles=prod > /var/log/tomiHub/core.log 2>&1 &

# AI Brain (8000)
cd $PROJECT_DIR/ai-brain
nohup uvicorn api.main:app --host 0.0.0.0 --port 8000 > /var/log/tomiHub/aibrain.log 2>&1 &

# Frontend Build
cd $PROJECT_DIR/frontend
nohup node dist/server.js > /var/log/tomiHub/frontend.log 2>&1 &  # production
# or dev mode: nohup npm run dev > /var/log/tomiHub/frontend.log 2>&1 &

echo "TomiHub services started"
```

## 4. Nginx Configuration

Deploy to `/etc/nginx/conf.d/tomiHub.conf`, referencing `deploy/nginx-tomiHub.conf`.

## 5. Production Environment Configuration

### Key Items in application-prod.yml

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5434/aipm
    username: aipm
    password: ${DB_PASSWORD}

  rabbitmq:
    host: localhost
    port: 5672
    username: aipm
    password: ${RABBITMQ_PASSWORD}
```

## 6. Open Source Licenses (Commercial Compliance)

All dependencies use commercially friendly open source licenses:

| Component | License | Commercial Restriction |
|------|--------|:---:|
| PostgreSQL | PostgreSQL License | None |
| pgvector | PostgreSQL License | None |
| Redis | BSD 3-Clause | None |
| RabbitMQ | Mozilla Public License 2.0 | None |
| Nginx | 2-clause BSD | None |
| OpenJDK 21 | GPL v2 + Classpath Exception | None |
| Spring Boot 3.3 | Apache 2.0 | None |
| MyBatis-Plus | Apache 2.0 | None |
| React 19 | MIT | None |
| Vite | MIT | None |
| Tailwind CSS | MIT | None |
| TypeScript | Apache 2.0 | None |
| Python 3.12 | PSF License | None |
| FastAPI | MIT | None |
| Ollama | MIT | None |
| bge-m3 (BAAI) | MIT | None |
| deepseek-r1 | MIT | None |
| minicpm-v | Apache 2.0 | None |

**Conclusion**: 100% commercially friendly. No GPL copyleft licenses (OpenJDK's GPLv2+CE exception clause protects commercial applications). Localized deployment and sales can be done with confidence.
