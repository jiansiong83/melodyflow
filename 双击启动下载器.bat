@echo off
:: Set window title
title 批量音乐下载器服务

:: Navigate to project directory
cd /d "D:\music-downloader"

echo ==============================================
echo        批量音乐下载器 (Music Downloader)
echo ==============================================
echo.

:: Check if dependencies are installed
if not exist node_modules (
  echo  [提示] 首次启动，正在自动安装项目依赖，请稍候...
  echo  (如果网络较慢，可能需要 1-2 分钟，请耐心等待)
  echo.
  call npm install --registry=https://registry.npmmirror.com
  echo.
  echo  [成功] 依赖安装完成！
  echo.
)

echo  正在启动本地 Express 服务...
echo  启动成功后，会自动在浏览器中打开下载网页。
echo  如果没有自动打开，请手动访问: http://localhost:3000/
echo.
echo  [提示] 使用完毕后，直接关闭本黑窗口即可关闭服务。
echo ==============================================
echo.

:: Start the node server
node index.js

pause
