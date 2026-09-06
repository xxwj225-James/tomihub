#!/bin/bash
# AI-PM: One-click Java 21 setup + Auth service build & test
set -e

JDK_VERSION="21.0.5"
JDK_TARBALL="OpenJDK21U-jdk_x64_linux_hotspot_${JDK_VERSION}_11.tar.gz"
JDK_URL="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-${JDK_VERSION}%2B11/${JDK_TARBALL}"
JDK_DIR="$HOME/.ai-pm/jdk-21"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== AI-PM: Setting up Java 21 ==="

if [ ! -f "$JDK_DIR/bin/java" ]; then
    echo "Downloading JDK 21..."
    mkdir -p "$JDK_DIR"
    curl -L "$JDK_URL" -o /tmp/jdk21.tar.gz
    echo "Extracting to $JDK_DIR..."
    tar -xzf /tmp/jdk21.tar.gz -C "$JDK_DIR" --strip-components=1
    rm /tmp/jdk21.tar.gz
    echo "JDK 21 installed."
fi

export JAVA_HOME="$JDK_DIR"
export PATH="$JDK_DIR/bin:$PATH"

echo "Java version:"
java --version

echo ""
echo "=== Building ai-pm-common ==="
cd "$PROJECT_DIR/backend"
mvn install -pl ai-pm-common -DskipTests -q

echo ""
echo "=== Running Auth Service Tests ==="
mvn test -pl ai-pm-auth -Dtest="JwtTokenProviderTest,AuthServiceTest,TokenServiceTest"

echo ""
echo "=== ALL TESTS PASSED ==="
