# MelodyFlow: 批量 MP3 下载器 (Batch MP3 Downloader)

[English](#english) | [中文](#中文)

---

# English

MelodyFlow is a lightweight, portable batch music downloader and tagger for Windows. It allows users to input a text list of "Artist - Song" or paste YouTube links directly. The system automatically searches, stream-downloads, converts to high-quality MP3 on the fly, and embeds ID3 metadata.

---

## 📌 Quick Start

### 1. Clone / Download the Project
```bash
git clone https://github.com/jiansiong83/melodyflow.git
cd melodyflow
```

### 2. Download Executable Binaries
To keep the repository lightweight, this repository does not include large executable binaries. Before running, please download the following tools and **place them directly in the project root directory**:

1. **`yt-dlp.exe`**: Download the latest release from the [yt-dlp GitHub Releases](https://github.com/yt-dlp/yt-dlp/releases).
2. **`ffmpeg.exe` & `ffprobe.exe`**: Download the Windows static builds from the [FFmpeg Official Site](https://ffmpeg.org/download.html), and extract `ffmpeg.exe` and `ffprobe.exe`.

Your folder structure should look like this:
```text
D:\music-downloader
 ├─ public                    # Static frontend folder
 ├─ index.js                  # Express backend server
 ├─ yt-dlp.exe                # ◄ Place manually here
 ├─ ffmpeg.exe                # ◄ Place manually here
 ├─ ffprobe.exe               # ◄ Place manually here
 ├─ 双击启动下载器.bat         # Batch launcher script
 └─ package.json              # Dependency declarations
```

### 3. Install & Start
Double-click **`双击启动下载器.bat`** (Double-click to Launch) in the project directory. The script will automatically:
1. Run `npm install` to install Node dependencies.
2. Start the local Express server.
3. Launch your default web browser to the interface: `http://localhost:3000/`

---

## ⚙️ Core Architecture & How It Works

### 1. Input Sanitization & Dual-Channel Routing
* **Format Cleaning**: The frontend filters out leading numbers (e.g., `11. `) and Markdown formatting (e.g., `*`).
* **Route Matching**:
  * **Direct URLs**: Detects YouTube URLs, extracts the 11-character Video ID (`([A-Za-z0-9_-]{11})`), and queries video metadata directly, skipping search.
  * **Keywords**: Runs a query through YouTube search and selects the most relevant result.

### 2. Deduplication Cache Check
* Checks if `[Artist] - [Title].mp3` already exists in the output folder. If found, it skips downloading instantly to save bandwidth.

### 3. High-Fidelity Audio Extraction & Encoding
* Streams audio via `yt-dlp` using `--js-runtimes node` for signature decryption.
* Pipes the audio stream to `ffmpeg` to encode it as **LAME VBR V0** MP3 (average bitrate ~`245kbps`, peaks up to `260kbps`), ensuring CD-like quality with a compact file size.

### 4. Zero-Reencoding Stream Copy ID3 Tagging
* Reorganizes and purges the title (removing redundancies like `[Official Video]`).
* Calls `ffmpeg` using **Stream Copy (`-codec copy`)** to inject `Title` and `Artist` ID3 tags in milliseconds without re-encoding, preserving 100% audio quality.

---

## 🛡️ Resiliency & Error Handling
1. **Startup Binary Warnings**: The server verifies `yt-dlp.exe` and `ffmpeg.exe` on startup. If any are missing, it logs a warning.
2. **Drive Detection Fallback**: The default download path is `D:\mp3_download`. If the D drive is not present on the system, it automatically falls back to `.\downloads` inside the project root to prevent crashes.
3. **URL Safety Filter**: If a URL is pasted, the system ignores it for the filename and instead uses cleaned metadata to name the output file.
4. **Non-blocking Queue Polling**: If a track download fails, the UI logs the error and highlights it in red, but **the batch download queue continues** to process the next song.

---

## 🚀 Future Roadmap
* **Persistent Cache Index (`history.json`)**: Maintain a database indexing downloaded tracks by `Video ID` or file `MD5` hashes to prevent duplicates caused by filename spacing variances.
* **Concurrency Pool**: Add a user-configurable pool (`1~3` concurrent downloads) using `p-limit`.
* **Resource Governance**: Add strict queue size limits and release stderr buffers to prevent memory leaks during massive batch downloads.

---

# 中文

MelodyFlow 是一个运行于 Windows 平台的轻量化、便携式批量音乐下载与打标系统。支持用户批量输入“歌手 - 歌名”文本列表或直接粘贴 YouTube 视频链接，后端自动检索、流式下载、转码高音质 MP3，并自动写入 ID3 歌曲元数据。

---

## 📌 快速开始

### 1. 克隆/下载本项目
```bash
git clone https://github.com/jiansiong83/melodyflow.git
cd melodyflow
```

### 2. 下载核心运行依赖
为了保持代码库的轻量化，本项目未包含大型二进制可执行文件。在运行前，请下载以下三个工具并**直接放置在项目根目录下**：

1. **`yt-dlp.exe`**：从 [yt-dlp 官方 GitHub Release](https://github.com/yt-dlp/yt-dlp/releases) 下载最新的 `yt-dlp.exe`。
2. **`ffmpeg.exe` & `ffprobe.exe`**：从 [FFmpeg 官网](https://ffmpeg.org/download.html) 下载 Windows 静态编译版，并提取出 `ffmpeg.exe` 和 `ffprobe.exe`。

您的项目文件夹结构应如下所示：
```text
D:\music-downloader
 ├─ public                    # 静态前端资源文件夹
 ├─ index.js                  # 后端 Express 服务器主程序
 ├─ yt-dlp.exe                # ◄ 需手动放置于此
 ├─ ffmpeg.exe                # ◄ 需手动放置于此
 ├─ ffprobe.exe               # ◄ 需手动放置于此
 ├─ 双击启动下载器.bat         # 批处理启动脚本
 └─ package.json              # 依赖声明
```

### 3. 安装依赖并启动
双击运行项目目录下的 **`双击启动下载器.bat`**，系统会自动：
1. 运行 `npm install` 安装 Node 依赖。
2. 自动启动 Express 后端服务。
3. 自动在您的默认浏览器中打开下载网页：`http://localhost:3000/`

---

## ⚙️ 核心工作原理

### 1. 输入清洗与双通道分流
* **格式清洗**：前端拿到输入列表后，通过正则表达式自动过滤行首数字序号（如 `11. `）以及 Markdown 强调符（如 `*`）。
* **链接判定**：
  * **若匹配为链接**：提取其 11 位 Video ID（`([A-Za-z0-9_-]{11})`），直接请求后台解析详情，绕过搜索检索。
  * **若匹配为关键字**：调用 YouTube 相关度检索，选取首位最匹配视频。

### 2. 查重检测机制
* 后端基于输出路径的文件名进行存在性校验。若已存在 `[歌手] - [歌名].mp3`，则秒级返回跳过，避免重复下载。

### 3. 音效提取与高保真转码
* 使用 `yt-dlp` 流式抓取音轨，通过配置 `--js-runtimes node` 自动处理 signature 特征解密。
* 将音频流实时交由 `ffmpeg` 压缩，转码参数指定为 **LAME VBR V0 级别**（最高音质动态码率级别，平均码率约 `245kbps`，峰值可达 `260kbps`）。

### 4. 流复制元数据嵌入
* 重组并净化文件名。使用 `ffmpeg` 的 **流复制 (Stream Copy, `-codec copy`)** 机制。该操作不重新编码音轨，仅在输出容器的元数据元区域重写 `Title` 与 `Artist` 属性，耗时在毫秒级别，避免了二次转码造成的音质损耗。

---

## 🛡️ 异常恢复与降级容灾设计
1. **环境缺失双检警报**：启动时自动检测 `yt-dlp.exe` 和 `ffmpeg.exe`，缺失则向控制台发送明显的 `WARNING` 警报。
2. **磁盘不存在时智能降级**：默认输出为 `D:\mp3_download`。若用户的电脑不存在 D 分区，系统会自动优雅降级到项目目录内的相对路径 `.\downloads` 下，防止崩溃。
3. **URL 安全忽略**：若直接粘贴 URL 下载，系统自动忽略 URL 作为文件名的指令，转而提取视频元数据命名。
4. **非阻塞式队列轮询**：某一歌曲因网络或版权限制导致下载失败时，只标记该项失败，**整个批量下载队列不会中断**，将继续轮询下载下一首。

---

## 🚀 未来演进规划 (Roadmap)
* **持久化去重索引 (`history.json`)**：未来规划维护一个本地的 `history.json` 索引库，以视频的唯一 `Video ID` 或音频文件的 `MD5` 码作为唯一标识做去重。
* **多线程并发池**：引入基于并发限制（如 `p-limit`）的线程池，支持用户自主选择并发下载数。
* **资源流式治理**：限制最大输入队列长度，并及时在子进程结束时释放控制台内存缓存，避免爆满。

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
