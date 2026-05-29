const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn, execSync } = require('child_process');
const vm = require('vm');

// Active child process registry for lifecycle management (preventing orphan processes)
const activeProcesses = new Set();
let isShuttingDown = false;

function cleanupAndExit() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\nShutting down server, terminating active download/transcode child processes...');
  for (const proc of activeProcesses) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } else {
        proc.kill('SIGKILL');
      }
    } catch (e) {
      // ignore
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
// Note: The 'exit' event only supports synchronous operations. execSync is used here as a 
// best-effort, platform-dependent fallback to clean up process trees during final exit.
// For standard terminations (e.g., Ctrl+C), the SIGINT and SIGTERM handlers are the primary 
// mechanisms that guarantee execution.
process.on('exit', () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  for (const proc of activeProcesses) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } else {
        proc.kill('SIGKILL');
      }
    } catch (e) {
      // ignore
    }
  }
});

// Helper to run a child process as a Promise, managing activeProcesses registration automatically
function runProcess(commandPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandPath, args);
    activeProcesses.add(child);
    
    let stderrData = '';
    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    child.on('close', (code) => {
      activeProcesses.delete(child);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderrData.trim() || `Process exited with code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      activeProcesses.delete(child);
      reject(err);
    });
  });
}

// Helper to run a child process and retrieve its stdout
function runProcessGetOutput(commandPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandPath, args);
    activeProcesses.add(child);
    
    let stdoutData = '';
    let stderrData = '';
    
    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    child.on('close', (code) => {
      activeProcesses.delete(child);
      if (code === 0) {
        resolve(stdoutData);
      } else {
        reject(new Error(stderrData.trim() || `Process exited with code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      activeProcesses.delete(child);
      reject(err);
    });
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Sanitize filename for Windows
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

// Parse clean artist and title from a messy video title (e.g. from YouTube/Bilibili)
function parseArtistTitleFromVideoTitle(videoTitle, defaultArtist = 'Unknown Artist') {
  let title = videoTitle.trim();
  let artist = (defaultArtist || 'Unknown Artist').trim();

  // 1. Check for book/song brackets: 《Song Title》
  const bookBracketMatch = title.match(/(.*?)[《]([^》]+)[》](.*)/);
  if (bookBracketMatch) {
    const before = bookBracketMatch[1].trim();
    const inside = bookBracketMatch[2].trim();
    const after = bookBracketMatch[3].trim();
    
    if (before) {
      const cleanBefore = before.replace(/^\[[^\]]*\]|^【[^】]*】/g, '').trim();
      if (cleanBefore) {
        return {
          title: inside,
          artist: cleanBefore.replace(/^[\s\-–—:_/\\|~]+/g, '').replace(/[\s\-–—:_/\\|~]+$/g, '').trim()
        };
      }
    }
    if (after) {
      const cleanAfter = after.replace(/^[\s\-–—:_/\\|~]+/g, '').replace(/[\s\-–—:_/\\|~]+$/g, '').trim();
      if (cleanAfter && cleanAfter.length < 30) {
        return {
          title: inside,
          artist: cleanAfter
        };
      }
    }
    return {
      title: inside,
      artist: artist
    };
  }

  // 2. Standard split by common hyphens/dashes: - – — ~
  const splitPattern = /\s*[-–—~_]\s*/;
  const parts = title.split(splitPattern);
  if (parts.length >= 2) {
    let part0 = parts[0].replace(/^\[[^\]]*\]|^【[^】]*】/g, '').trim();
    let part1 = parts.slice(1).join(' - ').replace(/\[[^\]]*\]|【[^】]*】/g, '').trim();
    
    part0 = part0.replace(/\s*(official\s*video|official\s*music\s*video|lyric\s*video|official\s*audio|hd\s*video|mv|无损)/gi, '').trim();
    part1 = part1.replace(/\s*(official\s*video|official\s*music\s*video|lyric\s*video|official\s*audio|hd\s*video|mv|无损)/gi, '').trim();

    return {
      title: part1,
      artist: part0
    };
  }

  // Fallback: strip common junk and return
  const cleanTitle = title
    .replace(/^\[[^\]]*\]|^【[^】]*】/g, '')
    .replace(/\s*[\[\(\]（）][^\]\)]*(official|video|audio|lyrics|hd|4k|hq|music|clip|remastered|cc)[^\]\)]*[\]\)]/gi, '')
    .replace(/\s*(official\s*video|official\s*music\s*video|lyric\s*video|official\s*audio|hd\s*video|mv|无损)/gi, '')
    .trim();

  return {
    title: cleanTitle || videoTitle,
    artist: artist
  };
}

// Parse clean artist and title from a search query
function parseArtistTitleFromQuery(query, defaultArtist = 'Unknown Artist') {
  let q = query.trim();
  // 1. Try splitting by hyphen/dash
  let parts = q.split(/\s*[-–—~]\s*/);
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim()
    };
  }

  // 2. Try splitting by space
  parts = q.split(/\s+/);
  if (parts.length >= 2) {
    const firstPart = parts[0];
    const isChineseName = /^[\u4e00-\u9fa5]{2,4}$/.test(firstPart);
    const isEnglishName = /^[a-zA-Z\s]{2,15}$/.test(firstPart);
    if (isChineseName || isEnglishName) {
      return {
        artist: firstPart,
        title: parts.slice(1).join(' ').trim()
      };
    }
    
    const lastPart = parts[parts.length - 1];
    const isLastChineseName = /^[\u4e00-\u9fa5]{2,4}$/.test(lastPart);
    if (isLastChineseName) {
      return {
        artist: lastPart,
        title: parts.slice(0, -1).join(' ').trim()
      };
    }
  }

  return {
    artist: defaultArtist,
    title: q
  };
}

// Helper to scrape Bilibili search page directly via HTTP fetch and parse window.__pinia Vue 3 store payload (bypasses WAF 412 errors)
async function scrapeBilibiliSearch(keyword) {
  const url = 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(keyword);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }
  });
  if (!response.ok) {
    throw new Error(`Bilibili search request failed with status: ${response.status}`);
  }
  const html = await response.text();
  
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let piniaCode = null;
  
  while ((match = scriptRegex.exec(html)) !== null) {
    const content = match[1];
    if (content.includes('window.__pinia')) {
      piniaCode = content;
      break;
    }
  }
  
  if (!piniaCode) {
    throw new Error('Pinia store script tag not found on Bilibili search page');
  }
  
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(piniaCode, sandbox);
  const pinia = sandbox.window.__pinia;
  
  const searchRes = pinia.searchResponse;
  if (!searchRes || !searchRes.searchAllResponse) {
    return [];
  }
  
  const resultList = searchRes.searchAllResponse.result;
  const videoModule = resultList.find(r => r.result_type === 'video');
  if (!videoModule || !videoModule.data) {
    return [];
  }
  
  return videoModule.data.map(v => {
    // Helper to parse duration string 'MM:SS' or 'HH:MM:SS' into seconds
    let seconds = 0;
    if (v.duration) {
      const parts = v.duration.split(':').map(Number);
      if (parts.length === 2) {
        seconds = (parts[0] * 60) + parts[1];
      } else if (parts.length === 3) {
        seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
      }
    }
    
    // Strip HTML tags from title
    const cleanTitle = (v.title || '').replace(/<[^>]+>/g, '').trim();
    
    // Handle double-slash pic URL
    let cover = v.pic || '';
    if (cover.startsWith('//')) {
      cover = 'https:' + cover;
    }
    
    return {
      id: `https://www.bilibili.com/video/${v.bvid}`,
      title: cleanTitle,
      artist: v.author || 'Unknown Artist',
      album: 'Bilibili Video',
      cover: cover,
      duration: seconds
    };
  });
}

// 1. Search Song API (YouTube search fallback)
app.get('/api/search', async (req, res) => {
  const { keyword, source } = req.query;
  console.log(`[API Search] Request: keyword="${keyword}", source="${source}"`);
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' });
  }

  try {
    // Check if keyword is a Bilibili URL
    const bilibiliUrlRegex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:bilibili\.com\/video\/(?:av\d+|BV[a-zA-Z0-9]+)|b23\.tv\/[a-zA-Z0-9]+)/i;
    if (bilibiliUrlRegex.test(keyword)) {
      console.log(`Pasted direct Bilibili URL. Fetching video details for: ${keyword}`);
      const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
      const output = await runProcessGetOutput(ytDlpPath, ['-J', '--no-playlist', '--no-warnings', keyword]);
      const data = JSON.parse(output);
      
      const song = {
        id: keyword, // Store the full URL as ID so /api/download knows it's a Bilibili URL
        title: data.title || data.fulltitle || 'Bilibili Video',
        artist: data.uploader || data.artist || 'Unknown Artist',
        album: 'Bilibili Video',
        cover: data.thumbnail || '',
        duration: Math.round(data.duration || 0)
      };
      return res.json({ songs: [song] });
    }

    // Check if keyword is a YouTube URL
    const ytUrlRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    if (ytUrlRegex.test(keyword)) {
      console.log(`Pasted direct YouTube URL. Fetching video details for: ${keyword}`);
      const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
      const output = await runProcessGetOutput(ytDlpPath, ['-J', '--no-playlist', '--no-warnings', keyword]);
      const data = JSON.parse(output);
      
      const song = {
        id: data.id,
        title: data.title || data.fulltitle || 'YouTube Video',
        artist: data.uploader || data.artist || 'Unknown Artist',
        album: 'YouTube Video',
        cover: data.thumbnail || '',
        duration: Math.round(data.duration || 0)
      };
      return res.json({ songs: [song] });
    }

    // Clean up keyword for searching (remove punctuation, brackets, symbols)
    const cleanKeyword = keyword
      .replace(/[()\[\]{}（）《》【】［］·•\-\/\\、，,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');

    if (source === 'bilibili') {
      console.log(`Searching Bilibili for: "${cleanKeyword}" (via HTML scraping)`);
      try {
        const songs = await scrapeBilibiliSearch(cleanKeyword);
        return res.json({ songs: songs.slice(0, 5) });
      } catch (err) {
        console.error('Bilibili search failed:', err.message);
        return res.status(500).json({ error: 'Failed to search Bilibili', details: err.message });
      }
    } else {
      console.log(`Searching YouTube for: "${cleanKeyword}" (via yt-dlp)`);
      const output = await runProcessGetOutput(ytDlpPath, ['-J', '--no-playlist', '--no-warnings', `ytsearch5:${cleanKeyword}`]);
      const data = JSON.parse(output);
      
      if (data && data.entries && data.entries.length > 0) {
        const songs = data.entries.filter(Boolean).map(entry => ({
          id: entry.id,
          title: entry.title,
          artist: entry.uploader || entry.artist || 'Unknown Artist',
          album: 'YouTube Video',
          cover: entry.thumbnail || '',
          duration: Math.round(entry.duration || 0)
        }));
        return res.json({ songs });
      }
    }

    return res.json({ songs: [] });
  } catch (err) {
    console.error('Search API error:', err);
    return res.status(500).json({ error: 'Failed to search songs', details: err.message });
  }
});

// 2. Download MP3 API (YouTube download & conversion)
app.post('/api/download', async (req, res) => {
  const { songId, title, artist, downloadDir, customFilename } = req.body;
  if (!songId || !title) {
    return res.status(400).json({ error: 'songId and title are required' });
  }

  let targetDir;
  if (downloadDir) {
    targetDir = path.normalize(downloadDir);
  } else {
    // Fall back to project root downloads folder if D drive is not present
    if (fs.existsSync('D:\\')) {
      targetDir = 'D:\\mp3_download';
    } else {
      targetDir = path.join(__dirname, 'downloads');
    }
  }

  try {
    // Strict path validation to prevent path traversal
    if (targetDir.includes('..') || targetDir.includes('\0')) {
      return res.status(400).json({ error: 'Invalid download directory path' });
    }

    // Ensure download directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Parse baseline artist and title from the video details
    const parsed = parseArtistTitleFromVideoTitle(title, artist);
    let metaTitle = parsed.title;
    let metaArtist = parsed.artist;

    let filename;
    const isUrl = customFilename && (
      customFilename.startsWith('http://') || 
      customFilename.startsWith('https://') || 
      customFilename.includes('youtube.com') || 
      customFilename.includes('youtu.be') ||
      customFilename.includes('bilibili.com') ||
      customFilename.includes('b23.tv')
    );
    
    if (customFilename && !isUrl) {
      // User entered a query. Try to parse artist and title from it.
      const queryParsed = parseArtistTitleFromQuery(customFilename, metaArtist);
      metaArtist = queryParsed.artist;
      metaTitle = queryParsed.title;
    }
    
    const cleanArtist = sanitizeFilename(metaArtist);
    const cleanTitle = sanitizeFilename(metaTitle);
    
    // Construct uniform Artist - Title filename
    filename = `${cleanArtist} - ${cleanTitle}`;
    
    const tempFilenamePattern = `${filename}.%(ext)s`;
    const filePath = path.join(targetDir, `${filename}.mp3`);

    // If file already exists, skip download
    if (fs.existsSync(filePath)) {
      console.log(`File already exists: ${filePath}`);
      return res.json({
        success: true,
        message: 'File already exists',
        filename: `${filename}.mp3`,
        filePath
      });
    }

    const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
    let videoUrl;
    if (songId.startsWith('http://') || songId.startsWith('https://')) {
      videoUrl = songId;
    } else {
      videoUrl = `https://www.youtube.com/watch?v=${songId}`;
    }
    
    console.log(`Starting yt-dlp download for URL/ID: ${songId} -> ${filePath}`);

    // Spawn yt-dlp.exe with arguments to download and convert to MP3 VBR V0
    const args = [
      '--js-runtimes', 'node',
      '--no-playlist',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--ffmpeg-location', __dirname,
      '-o', path.join(targetDir, tempFilenamePattern),
      videoUrl
    ];

    await runProcess(ytDlpPath, args);

    if (!fs.existsSync(filePath)) {
      throw new Error('Downloaded file not found after conversion');
    }

    console.log(`Finished download for: ${filename}.mp3, embedding metadata...`);
    const tempFilePath = path.join(targetDir, `temp_${filename}.mp3`);
    

    
    const ffmpegBinPath = path.join(__dirname, 'ffmpeg.exe');
    const ffmpegArgs = [
      '-y',
      '-i', filePath,
      '-metadata', `title=${metaTitle}`,
      '-metadata', `artist=${metaArtist}`,
      '-codec', 'copy',
      tempFilePath
    ];
    
    await runProcess(ffmpegBinPath, ffmpegArgs);

    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(filePath);
        fs.renameSync(tempFilePath, filePath);
        console.log(`Successfully embedded ID3 metadata tags into ${filename}.mp3`);
      } catch (err) {
        console.error('Failed to swap post-processed metadata file:', err.message);
      }
    } else {
      throw new Error('ffmpeg metadata post-processing failed');
    }
    
    return res.json({
      success: true,
      message: 'Download completed successfully',
      filename: `${filename}.mp3`,
      filePath
    });

  } catch (err) {
    console.error('Download API error:', err.message);
    return res.status(500).json({ error: 'Failed to download song', details: err.message });
  }
});

// 3. Open Folder API
app.post('/api/open-folder', (req, res) => {
  const { downloadDir } = req.body;
  let targetDir;
  if (downloadDir) {
    targetDir = path.normalize(downloadDir);
  } else {
    // Fall back to project root downloads folder if D drive is not present
    if (fs.existsSync('D:\\')) {
      targetDir = 'D:\\mp3_download';
    } else {
      targetDir = path.join(__dirname, 'downloads');
    }
  }

  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create directory', details: err.message });
    }
  }

  // Windows explorer.exe can exit with non-zero codes even when successful. 
  // Using spawn with detached: true is more robust and prevents false-alarm errors.
  try {
    const p = spawn('explorer.exe', [targetDir], { detached: true, stdio: 'ignore' });
    p.unref();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to open directory', details: err.message });
  }
});

// 4. Set Global Proxy Config API
app.post('/api/config', (req, res) => {
  const { proxy } = req.body;
  if (proxy && proxy.trim()) {
    const proxyUrl = proxy.trim();
    process.env.HTTP_PROXY = proxyUrl;
    process.env.HTTPS_PROXY = proxyUrl;
    console.log(`[Proxy] Set globally to: ${proxyUrl}`);
  } else {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    console.log('[Proxy] Disabled (removed globally)');
  }
  return res.json({ success: true });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  
  // Verify existence of standalone binaries
  const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
  const ffmpegPath = path.join(__dirname, 'ffmpeg.exe');
  
  if (!fs.existsSync(ytDlpPath)) {
    console.warn('⚠️  WARNING: "yt-dlp.exe" is missing from the project root! Downloads may fail.');
  } else {
    console.log('✅ Found standalone yt-dlp.exe');
  }
  
  if (!fs.existsSync(ffmpegPath)) {
    console.warn('⚠️  WARNING: "ffmpeg.exe" is missing from the project root! MP3 conversion may fail.');
  } else {
    console.log('✅ Found standalone ffmpeg.exe');
  }

  // Automatically open browser on Windows once server is successfully listening
  if (process.platform === 'win32') {
    console.log('Launching browser to http://localhost:3000/ ...');
    exec('start http://localhost:3000/');
  }
});
