const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');

async function test() {
  const query = "Michael Learns To Rock - That's Why (You Go Away)";
  
  try {
    console.log('Searching YouTube for:', query);
    const r = await yts(query);
    const videos = r.videos;
    if (videos.length === 0) {
      console.log('No videos found');
      return;
    }
    
    const bestMatch = videos[0];
    console.log(`Found video: ${bestMatch.title} (URL: ${bestMatch.url})`);
    
    // Get Audio Stream
    console.log('Fetching audio stream...');
    const stream = ytdl(bestMatch.url, {
      filter: 'audioonly',
      quality: 'highestaudio'
    });
    
    const targetDir = 'D:\\mp3_download';
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const filePath = path.join(targetDir, 'test_mltr.m4a');
    console.log('Streaming to:', filePath);
    const fileStream = fs.createWriteStream(filePath);
    stream.pipe(fileStream);
    
    stream.on('end', () => {
      console.log('✅ Streaming completed successfully!');
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
      } else {
        console.log('File does not exist.');
      }
    });
    
    stream.on('error', (err) => {
      console.error('❌ Stream error:', err);
    });
    
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}
test();
