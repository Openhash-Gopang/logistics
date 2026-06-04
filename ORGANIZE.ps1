# K-Logistics 디렉토리 정리 스크립트
# C:\Users\주피터\Downloads\logistics> 에서 실행하세요

# 1. docs 폴더 생성
New-Item -ItemType Directory -Force -Path "docs"    | Out-Null
# 2. prompts 폴더 생성
New-Item -ItemType Directory -Force -Path "prompts" | Out-Null

# 3. whitepaper 이동 (있는 경우)
if (Test-Path "k-logistics-whitepaper.md") {
    Move-Item -Path "k-logistics-whitepaper.md" -Destination "docs\k-logistics-whitepaper.md" -Force
}

# 4. 시스템 프롬프트 이동 (있는 경우)
if (Test-Path "logistics.md") {
    Move-Item -Path "logistics.md" -Destination "prompts\logistics.md" -Force
}

Write-Host "✅ 정리 완료" -ForegroundColor Green
Write-Host ""
Write-Host "최종 구조:" -ForegroundColor Cyan
tree /F
