const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn, execSync } = require('child_process');
const yts = require('yt-search');

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

const app = express();
const PORT = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Sanitize filename for Windows
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

// 1. Search Song API (YouTube search fallback)
app.get('/api/search', async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' });
  }

  try {
    // Check if keyword is a YouTube URL
    const ytUrlRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = keyword.match(ytUrlRegex);
    
    if (match) {
      const videoId = match[1];
      console.log(`Pasted direct YouTube URL. Fetching video details for ID: ${videoId}`);
      const video = await yts({ videoId });
      
      if (video) {
        const song = {
          id: video.videoId,
          title: video.title,
          artist: video.author ? video.author.name : 'Unknown Artist',
          album: 'YouTube Video',
          cover: video.thumbnail || video.image,
          duration: video.seconds
        };
        return res.json({ songs: [song] });
      }
    }

    console.log(`Searching YouTube for: "${keyword}"`);
    const r = await yts(keyword);
    
    if (r.videos && r.videos.length > 0) {
      const songs = r.videos.slice(0, 5).map(video => ({
        id: video.videoId,
        title: video.title,
        artist: video.author ? video.author.name : 'Unknown Artist',
        album: 'YouTube Video',
        cover: video.thumbnail || video.image,
        duration: video.seconds
      }));
      return res.json({ songs });
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
    // Ensure download directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let filename;
    const isUrl = customFilename && (customFilename.startsWith('http://') || customFilename.startsWith('https://') || customFilename.includes('youtube.com') || customFilename.includes('youtu.be'));
    
    if (customFilename && !isUrl) {
      filename = sanitizeFilename(customFilename);
    } else {
      const cleanArtist = sanitizeFilename(artist || 'Unknown Artist');
      let cleanTitle = sanitizeFilename(title);

      // Clean up title: strip artist name if title starts with it
      const artistLower = cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
      const titleLower = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (titleLower.startsWith(artistLower)) {
        const matchIndex = cleanTitle.toLowerCase().indexOf(cleanArtist.toLowerCase());
        if (matchIndex !== -1) {
          cleanTitle = cleanTitle.substring(matchIndex + cleanArtist.length);
          cleanTitle = cleanTitle.replace(/^[\s\-–—:_/\\|~]+/g, '');
        }
      }

      // Strip common YouTube video suffixes
      cleanTitle = cleanTitle.replace(/\s*[\[\(\]（）][^\]\)]*(official|video|audio|lyrics|hd|4k|hq|music|clip|remastered|closed caption|cc)[^\]\)]*[\]\)]/gi, '');
      cleanTitle = cleanTitle.replace(/\s*(official\s*video|official\s*music\s*video|lyric\s*video|official\s*audio|hd\s*video)/gi, '');
      cleanTitle = cleanTitle.trim();

      if (!cleanTitle) {
        cleanTitle = sanitizeFilename(title);
      }

      filename = `${cleanArtist} - ${cleanTitle}`;
    }
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
    const videoUrl = `https://www.youtube.com/watch?v=${songId}`;
    
    console.log(`Starting yt-dlp download for ID ${songId} -> ${filePath}`);

    // Spawn yt-dlp.exe with arguments
    const args = [
      '--js-runtimes', 'node',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--ffmpeg-location', __dirname,
      '-o', path.join(targetDir, tempFilenamePattern),
      videoUrl
    ];

    const child = spawn(ytDlpPath, args);
    activeProcesses.add(child);

    let stderrData = '';
    let stdoutData = '';

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('close', (code) => {
      activeProcesses.delete(child);
      if (code === 0 && fs.existsSync(filePath)) {
        console.log(`Finished download for: ${filename}.mp3, embedding metadata...`);
        const tempFilePath = path.join(targetDir, `temp_${filename}.mp3`);
        
        let metaTitle = title;
        let metaArtist = artist || 'Unknown Artist';
        
        const isUrl = customFilename && (customFilename.startsWith('http://') || customFilename.startsWith('https://') || customFilename.includes('youtube.com') || customFilename.includes('youtu.be'));
        if (customFilename && !isUrl) {
          const parts = customFilename.split(/\s*[-–]\s*/);
          if (parts.length >= 2) {
            const knownArtists = [
              "Michael Learns To Rock", "Richard Marx", "Savage Garden", "Avril Lavigne",
              "Celine Dion", "Aerosmith", "Britney Spears", "Enrique Iglesias",
              "Bon Jovi", "Robbie Williams", "LeAnn Rimes", "Natalie Imbruglia", "Toni Braxton"
            ];
            const part0Match = knownArtists.find(a => a.toLowerCase() === parts[0].trim().toLowerCase());
            const part1Match = knownArtists.find(a => a.toLowerCase() === parts[1].trim().toLowerCase());
            if (part0Match) {
              metaArtist = part0Match;
              metaTitle = parts.slice(1).join(' - ').trim();
            } else if (part1Match) {
              metaArtist = part1Match;
              metaTitle = parts[0].trim();
            } else {
              metaArtist = parts[0].trim();
              metaTitle = parts.slice(1).join(' - ').trim();
            }
          }
        }
        
        const ffmpegBinPath = path.join(__dirname, 'ffmpeg.exe');
        const ffmpegArgs = [
          '-y',
          '-i', filePath,
          '-metadata', `title=${metaTitle}`,
          '-metadata', `artist=${metaArtist}`,
          '-codec', 'copy',
          tempFilePath
        ];
        
        const postProcess = spawn(ffmpegBinPath, ffmpegArgs);
        activeProcesses.add(postProcess);
        
        postProcess.on('close', (pCode) => {
          activeProcesses.delete(postProcess);
          if (pCode === 0 && fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(filePath);
              fs.renameSync(tempFilePath, filePath);
              console.log(`Successfully embedded ID3 metadata tags into ${filename}.mp3`);
            } catch (err) {
              console.error('Failed to swap post-processed metadata file:', err.message);
            }
          } else {
            console.error('ffmpeg metadata post-processing failed');
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          }
          
          return res.json({
            success: true,
            message: 'Download completed successfully',
            filename: `${filename}.mp3`,
            filePath
          });
        });
      } else {
        console.error(`yt-dlp failed with exit code ${code}`);
        console.error('stderr:', stderrData);
        return res.status(500).json({
          error: 'Download failed',
          details: stderrData || `Exit code ${code}`
        });
      }
    });

  } catch (err) {
    console.error('Download API error:', err);
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
