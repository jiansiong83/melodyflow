const { cloudsearch, song_url } = require('NeteaseCloudMusicApi');

async function test() {
  try {
    const searchRes = await cloudsearch({
      keywords: '周杰伦 晴天',
      type: 1, // 1: 单曲
      limit: 5
    });
    console.log('Search Result: SUCCESS');
    if (searchRes.body.result && searchRes.body.result.songs && searchRes.body.result.songs.length > 0) {
      const song = searchRes.body.result.songs[0];
      console.log(`Found song: ${song.name} - ${song.ar.map(a => a.name).join(',')}, ID: ${song.id}`);
      const songId = song.id;
      const urlRes = await song_url({
        id: songId,
        br: 320000 // 320kbps
      });
      console.log('URL Result:', JSON.stringify(urlRes.body.data, null, 2));
    } else {
      console.log('No songs found.');
    }
  } catch (err) {
    console.error('Error running test:', err);
  }
}
test();
