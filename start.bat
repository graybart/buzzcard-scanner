@echo off
rem Starts the check-in app on Windows. Run from Command Prompt or PowerShell:
rem   start.bat                         start with the last saved password ("admin" the first time)
rem   start.bat --password hunter2      set a new admin password (saved; logs everyone out)
rem   start.bat --port 8081             use another port (default 8080)
rem   start.bat --no-open               don't open the scanner page in a browser
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=8080"
set "PASSWORD="
set "OPEN=1"
set "NAME=scanner"
set "VOLUME=scanner-data"

:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="--password" goto :pw
if /i "%~1"=="-p" goto :pw
if /i "%~1"=="--port" goto :port
if /i "%~1"=="--no-open" ( set "OPEN=0" & shift & goto :args )
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
echo Unknown option: %~1
echo.
goto :usage
:pw
if "%~2"=="" ( echo ERROR: --password needs a value, e.g. --password hunter2 & exit /b 1 )
set "PASSWORD=%~2"
shift & shift & goto :args
:port
if "%~2"=="" ( echo ERROR: --port needs a value, e.g. --port 8081 & exit /b 1 )
set "PORT=%~2"
shift & shift & goto :args
:usage
echo Usage: start.bat [--password PASSWORD] [--port PORT] [--no-open]
echo   --password  set a new admin password (saved; starting without it keeps the last one)
echo   --port      port to use (default 8080)
echo   --no-open   don't open the scanner page in a browser
exit /b 0
:argsdone

echo %PORT%| findstr /r "^[0-9][0-9]*$" >nul || ( echo ERROR: --port must be a number & exit /b 1 )

echo === Check-in ===

where docker >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Docker isn't installed.
  echo Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again.
  exit /b 1
)

docker info >nul 2>nul && goto :dockerok
echo Starting Docker Desktop - this can take a minute...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a tries=0
:waitdocker
timeout /t 2 /nobreak >nul
docker info >nul 2>nul && goto :dockerok
set /a tries+=1
if %tries% lss 60 goto :waitdocker
echo.
echo ERROR: Docker isn't running. Open Docker Desktop, wait for it to finish loading, then run this again.
exit /b 1

:dockerok
echo Building app...
docker build -q -t %NAME% . >nul
if errorlevel 1 ( echo ERROR: Build failed - see messages above. & exit /b 1 )

echo Starting app...
docker rm -f %NAME% >nul 2>nul
if defined PASSWORD (
  docker run -d --name %NAME% --restart unless-stopped -p %PORT%:8080 -v %VOLUME%:/data -e TZ=America/New_York -e "ADMIN_PASSWORD=%PASSWORD%" %NAME% >nul
) else (
  docker run -d --name %NAME% --restart unless-stopped -p %PORT%:8080 -v %VOLUME%:/data -e TZ=America/New_York %NAME% >nul
)
if errorlevel 1 (
  echo ERROR: Couldn't start the app. Is port %PORT% already in use?
  echo If the old checkin or id-scanner app is running, stop it first, or try: start.bat --port 8081
  exit /b 1
)

rem Wait until the server answers.
set /a tries=0
:waitapp
curl -fs http://localhost:%PORT%/api/status >nul 2>nul && goto :ready
set /a tries+=1
if %tries% geq 30 goto :ready
timeout /t 1 /nobreak >nul
goto :waitapp

:ready
set "IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object IPv4DefaultGateway | Select-Object -First 1).IPv4Address.IPAddress"`) do set "IP=%%i"

echo.
echo Running!
echo   Scanner screen, this computer:  http://localhost:%PORT%/
echo   Admin, this computer:           http://localhost:%PORT%/admin
if defined IP echo   Admin, other devices on WiFi:   http://%IP%:%PORT%/admin
if defined IP echo   Exit door / public count:       http://%IP%:%PORT%/checkout   http://%IP%:%PORT%/count
if defined PASSWORD ( echo   Admin password: set to the one you passed with --password ) else ( echo   Admin password: unchanged - "admin" unless you've set one with --password )
echo.
echo The app keeps running in the background and starts again whenever Docker starts.
echo Run stop.bat to turn it off. Your data is kept.
if "%OPEN%"=="1" start "" http://localhost:%PORT%/
exit /b 0
