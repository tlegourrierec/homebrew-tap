@echo off
cd /d "%~dp0"
where npm >nul 2>nul || (
  echo Node.js n'est pas installe. Installe-le depuis https://nodejs.org ^(bouton LTS^), puis relance ce fichier.
  start https://nodejs.org
  pause & exit /b
)
if not exist .env (
  set /p KEY="Colle ta cle Gemini (https://aistudio.google.com/apikey) puis Entree : "
  call :writeenv
)
if not exist node_modules call npm install
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
call npm start
pause
exit /b
:writeenv
powershell -NoProfile -Command "(Get-Content .env.example) -replace '^GEMINI_API_KEY=.*', 'GEMINI_API_KEY=%KEY%' | Set-Content .env"
exit /b
