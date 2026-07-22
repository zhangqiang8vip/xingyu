@echo off
setlocal
chcp 65001 >nul
title 星屿启动器
cd /d "%~dp0site"

set "NO_PROXY=localhost,127.0.0.1,::1"
set "no_proxy=localhost,127.0.0.1,::1"

echo 正在启动星屿，请稍候...
start "星屿服务（请勿关闭）" cmd /k "set NO_PROXY=localhost,127.0.0.1,::1&& set no_proxy=localhost,127.0.0.1,::1&& npm run dev"
timeout /t 7 /nobreak >nul

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME_X86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "PROFILE=%TEMP%\xingyu-browser-no-proxy"

if exist "%CHROME%" (
  start "" "%CHROME%" --no-proxy-server --user-data-dir="%PROFILE%" "http://127.0.0.1:3000"
  goto :done
)
if exist "%CHROME_X86%" (
  start "" "%CHROME_X86%" --no-proxy-server --user-data-dir="%PROFILE%" "http://127.0.0.1:3000"
  goto :done
)
if exist "%EDGE%" (
  start "" "%EDGE%" --no-proxy-server --user-data-dir="%PROFILE%" "http://127.0.0.1:3000"
  goto :done
)

echo 未找到 Chrome 或 Edge，请在代理软件中将 localhost、127.0.0.1 和 ::1 加入直连列表。
pause

:done
endlocal
