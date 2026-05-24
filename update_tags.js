const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const downloadDir = 'D:\\mp3_download';
const ffmpegPath = 'D:\\music-downloader\\ffmpeg.exe';

const knownArtists = [
  "Michael Learns To Rock",
  "Richard Marx",
  "Savage Garden",
  "Avril Lavigne",
  "Celine Dion",
  "Aerosmith",
  "Britney Spears",
  "Enrique Iglesias",
  "Bon Jovi",
  "Robbie Williams",
  "LeAnn Rimes",
  "Natalie Imbruglia",
  "Toni Braxton"
];

function run() {
  console.log('=== STARTING METADATA ID3 TAG UPDATE ===');
  
  if (!fs.existsSync(downloadDir)) {
    console.log('Download directory does not exist.');
    return;
  }
  
  const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.mp3'));
  console.log(`Found ${files.length} MP3 files to process.\n`);
  
  files.forEach((file, index) => {
    const fullPath = path.join(downloadDir, file);
    const basename = path.basename(file, '.mp3');
    
    // Match against known artists
    let artist = '';
    let title = '';
    
    const matchedArtist = knownArtists.find(a => {
      const escapedArtist = a.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedArtist}\\b`, 'i');
      return regex.test(basename);
    });
    
    if (matchedArtist) {
      artist = matchedArtist;
      const escapedArtist = matchedArtist.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedArtist}\\b`, 'i');
      let tempTitle = basename.replace(regex, '').trim();
      // Remove leading/trailing hyphens, en-dashes, slashes, or spaces
      tempTitle = tempTitle.replace(/^[\s\-–—:_/\\|~]+|[\s\-–—:_/\\|~]+$/g, '');
      title = tempTitle;
    } else {
      // Fallback: Split by hyphen or en-dash
      const parts = basename.split(/\s*[-–]\s*/);
      if (parts.length >= 2) {
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else {
        artist = 'Unknown Artist';
        title = basename;
      }
    }
    
    console.log(`[${index + 1}/${files.length}] Processing: "${file}"`);
    console.log(`  -> Title:  "${title}"`);
    console.log(`  -> Artist: "${artist}"`);
    
    const tempPath = path.join(downloadDir, `temp_${file}`);
    
    try {
      // Run ffmpeg via spawnSync to avoid command injection or escaping issues
      const args = [
        '-y',
        '-i', fullPath,
        '-metadata', `title=${title}`,
        '-metadata', `artist=${artist}`,
        '-codec', 'copy',
        tempPath
      ];
      
      const result = spawnSync(ffmpegPath, args);
      
      if (result.status === 0 && fs.existsSync(tempPath)) {
        // Overwrite the original file with the newly tagged file
        fs.unlinkSync(fullPath);
        fs.renameSync(tempPath, fullPath);
        console.log(`  ✅ Successfully updated metadata!`);
      } else {
        const stderr = result.stderr ? result.stderr.toString() : 'Unknown error';
        throw new Error(stderr);
      }
    } catch (err) {
      console.error(`  ❌ Error updating:`, err.message);
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
    console.log('');
  });
  
  console.log('=== METADATA TAG UPDATE COMPLETE ===');
}

run();
