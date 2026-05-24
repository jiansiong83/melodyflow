@echo off
:: Set window title
title 批量音乐下载器服务

:: Navigate to project directory
cd /d "D:\music-downloader"

echo ==============================================
echo        批量音乐下载器 (Music Downloader)
echo ==============================================
echo.
echo  正在启动本地 Express 服务...
echo  启动成功后，会自动在浏览器中打开下载网页。
echo  如果没有自动打开，请手动访问: http://localhost:3000/
echo.
echo  [提示] 使用完毕后，直接关闭本黑窗口即可关闭服务。
echo ==============================================
echo.

:: Automatically open default browser to the web interface
start http://localhost:3000/

:: Start the node server
node index.js

pause
