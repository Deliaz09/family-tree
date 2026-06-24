@echo off
chcp 65001 >nul
echo ============================================
echo   Arbore Genealogic - Pornire automata
echo ============================================
echo.

REM Pornim backend-ul intr-o fereastra separata
echo [1/2] Pornesc backend-ul...
start "Backend FastAPI" cmd /k "cd /d C:\AN_4_SEM_2\LICENTA1\family-tree\backend && python -m uvicorn app:app --reload --port 8000"

REM Asteptam 5 secunde ca backend-ul sa porneasca
echo      Astept 5 secunde sa porneasca backend-ul...
timeout /t 5 /nobreak >nul

REM Pornim frontend-ul intr-o fereastra separata
echo [2/2] Pornesc frontend-ul...
start "Frontend React" cmd /k "cd /d C:\AN_4_SEM_2\LICENTA1\family-tree\frontend && npm run dev"

REM Asteptam 3 secunde ca frontend-ul sa porneasca
timeout /t 3 /nobreak >nul

REM Deschidem browserul automat
echo.
echo Deschid browserul...
start http://localhost:5173

echo.
echo ============================================
echo   Totul ruleaza!
echo   Browser:  http://localhost:5173
echo   API:      http://localhost:8000/docs
echo.
echo   Pentru a opri: inchide cele 2 ferestre negre
echo ============================================
echo.
pause
