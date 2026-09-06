# AI-PM: Use Node 20 + Install Frontend Dependencies
# Run in PowerShell: .\scripts\setup-node.ps1
$ErrorActionPreference = "Stop"

# Node 20 path (already installed)
$NODE20 = "$env:USERPROFILE\node20\node-v20.18.0-win-x64"
$env:PATH = "$NODE20;$env:PATH"

Write-Host "=== Node.js ===" -ForegroundColor Cyan
node --version

Write-Host "`n=== Installing Frontend Dependencies ===" -ForegroundColor Cyan
Set-Location "$PSScriptRoot\..\frontend"
npm install

Write-Host "`n=== TypeScript Check ===" -ForegroundColor Cyan
npx tsc --noEmit

Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Start dev server: cd frontend && npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "Tip: To remove Node 14, run in Admin PowerShell:" -ForegroundColor Gray
Write-Host "  Remove-Item 'C:\Program Files\nodejs' -Recurse -Force" -ForegroundColor Gray
Write-Host "  [Environment]::SetEnvironmentVariable('PATH', ($env:PATH -replace [regex]::Escape('C:\Program Files\nodejs;'), ''), 'Machine')" -ForegroundColor Gray
