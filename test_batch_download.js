const fs = require('fs');
const path = require('path');

const songsToDownload = [
  "Now and Forever - Richard Marx",
  "Hero - Enrique Iglesias",
  "It's My Life - Bon Jovi",
  "Paint My Love - Michael Learns To Rock",
  "Angels - Robbie Williams",
  "How Do I Live - LeAnn Rimes",
  "Torn - Natalie Imbruglia",
  "The Actor - Michael Learns To Rock"
];

const downloadDir = 'D:\\mp3_download';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('=== STARTING BATCH DOWNLOAD VERIFICATION ===');
  console.log(`Target directory: ${downloadDir}\n`);

  for (let i = 0; i < songsToDownload.length; i++) {
    const query = songsToDownload[i];
    console.log(`[${i + 1}/${songsToDownload.length}] Processing search for: "${query}"...`);

    try {
      // 1. Search
      const searchUrl = `http://localhost:3000/api/search?keyword=${encodeURIComponent(query)}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        throw new Error(`Search API returned status ${searchRes.status}`);
      }
      
      const searchData = await searchRes.json();
      if (!searchData.songs || searchData.songs.length === 0) {
        console.log(`❌ No matches found for: "${query}"\n`);
        continue;
      }

      const bestMatch = searchData.songs[0];
      console.log(`   Found match: "${bestMatch.title}" by "${bestMatch.artist}" (ID: ${bestMatch.id})`);
      console.log(`   Downloading...`);

      // 2. Download
      const downloadRes = await fetch('http://localhost:3000/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: bestMatch.id,
          title: bestMatch.title,
          artist: bestMatch.artist,
          customFilename: query,
          downloadDir
        })
      });

      const downloadData = await downloadRes.json();
      if (downloadRes.ok && downloadData.success) {
        // Verify file existence
        const filePath = downloadData.filePath;
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`   ✅ SUCCESS: "${downloadData.filename}" downloaded! (Size: ${sizeMB} MB)\n`);
        } else {
          console.log(`   ❌ ERROR: Download reported success, but file was not found at ${filePath}\n`);
        }
      } else {
        console.log(`   ❌ FAILED: ${downloadData.error || 'Unknown download error'}\n`);
      }

    } catch (err) {
      console.log(`   ❌ EXCEPTION: ${err.message}\n`);
    }

    // Rate-limit delay
    if (i < songsToDownload.length - 1) {
      await delay(2000);
    }
  }

  console.log('=== BATCH DOWNLOAD VERIFICATION COMPLETE ===');
  console.log('Files in download directory:');
  if (fs.existsSync(downloadDir)) {
    const files = fs.readdirSync(downloadDir);
    files.forEach(f => {
      const stat = fs.statSync(path.join(downloadDir, f));
      console.log(`- ${f} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
    });
  } else {
    console.log('(Directory does not exist)');
  }
}

runTest();
