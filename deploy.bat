@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Demand Hub - Deploy (commit + push)
echo ============================================
echo.

git add -A

git commit -m "Atualizacao via deploy.bat"
if errorlevel 1 (
  echo.
  echo (Nenhuma mudanca nova para commitar - seguindo para o push...)
)

echo.
echo Enviando para o GitHub...
git push

echo.
echo ============================================
echo   Concluido! A Vercel vai publicar em ~30s.
echo ============================================
echo.
pause
