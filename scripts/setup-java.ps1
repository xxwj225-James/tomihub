# AI-PM: One-click Java 21 setup + Auth service build & test
# Run in PowerShell: .\scripts\setup-java.ps1

$ErrorActionPreference = "Stop"
$JDK_VERSION = "21"
$JDK_URL = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip"
$JDK_ZIP = "$env:TEMP\jdk21.zip"
$JDK_DIR = "$env:USERPROFILE\.ai-pm\jdk-21"

Write-Host "=== AI-PM: Setting up Java 21 ===" -ForegroundColor Cyan

if (-not (Test-Path "$JDK_DIR\bin\java.exe")) {
    Write-Host "Downloading JDK 21..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $JDK_URL -OutFile $JDK_ZIP
    Write-Host "Extracting to $JDK_DIR..." -ForegroundColor Yellow
    Expand-Archive -Path $JDK_ZIP -DestinationPath $JDK_DIR -Force
    Remove-Item $JDK_ZIP

    # Move files out of nested dir
    $inner = Get-ChildItem $JDK_DIR | Where-Object { $_.PSIsContainer } | Select-Object -First 1
    if ($inner) {
        Get-ChildItem $inner.FullName | Move-Item -Destination $JDK_DIR -Force
        Remove-Item $inner.FullName -Recurse -Force
    }
    Write-Host "JDK 21 installed to $JDK_DIR" -ForegroundColor Green
}

$env:JAVA_HOME = $JDK_DIR
$env:PATH = "$JDK_DIR\bin;$env:PATH"

Write-Host "Java version:" -ForegroundColor Green
java --version

Write-Host ""
Write-Host "=== Building ai-pm-common ===" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\backend"
mvn install -pl ai-pm-common -DskipTests -q
Pop-Location

Write-Host ""
Write-Host "=== Running Auth Service Tests ===" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\backend"
mvn test -pl ai-pm-auth -Dtest="JwtTokenProviderTest,AuthServiceTest,TokenServiceTest"
Pop-Location
