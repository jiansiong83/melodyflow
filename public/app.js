// Cache DOM Elements
const songListInput = document.getElementById('song-list');
const downloadDirInput = document.getElementById('download-dir');
const btnStart = document.getElementById('btn-start');
const btnClear = document.getElementById('btn-clear');
const btnOpenDir = document.getElementById('btn-open-dir');

const emptyState = document.getElementById('empty-state');
const queueList = document.getElementById('queue-list');
const queueStats = document.getElementById('queue-stats');
const statDone = document.getElementById('stat-done');
const statTotal = document.getElementById('stat-total');

const summaryFooter = document.getElementById('summary-footer');
const globalProgressFill = document.getElementById('global-progress-fill');
const globalProgressPercent = document.getElementById('global-progress-percent');
const summarySuccessCount = document.getElementById('summary-success-count');
const summaryErrorCount = document.getElementById('summary-error-count');
const spinIcon = document.querySelector('.spin-icon');

let downloadQueue = [];
let isDownloading = false;
let successCount = 0;
let errorCount = 0;

// Helper: Sanitize song input line
function parseSongLine(line) {
  let text = line.trim();
  if (!text) return null;
  
  // Remove markdown asterisks (e.g. *Song*)
  text = text.replace(/\*/g, '').trim();
  // Remove leading numbers/bullets (e.g., "1. ", "* ", "02 - ", etc.)
  text = text.replace(/^\s*[\d\.\-\*\s()\[\]（）\p{P}、]+/u, '').trim();
  // Remove surrounding quotes
  text = text.replace(/^["'“”‘’]|["'“”‘’]$/g, '').trim();
  
  return text;
}

// Helper: Format duration (seconds -> mm:ss)
function formatDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Open Local Download Folder
btnOpenDir.addEventListener('click', async () => {
  const downloadDir = downloadDirInput.value.trim();
  try {
    const res = await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadDir })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '无法打开文件夹');
  } catch (err) {
    alert('打开文件夹失败: ' + err.message);
  }
});

// Clear List
btnClear.addEventListener('click', () => {
  if (isDownloading) return;
  songListInput.value = '';
  resetQueueUI();
});

function resetQueueUI() {
  downloadQueue = [];
  queueList.innerHTML = '';
  emptyState.classList.remove('hidden');
  queueList.classList.add('hidden');
  queueStats.classList.add('hidden');
  summaryFooter.classList.add('hidden');
  spinIcon.classList.add('hidden');
}

// Start Batch Download
btnStart.addEventListener('click', async () => {
  if (isDownloading) return;

  const rawLines = songListInput.value.split('\n');
  const cleanSongs = rawLines
    .map(line => parseSongLine(line))
    .filter(Boolean);

  if (cleanSongs.length === 0) {
    alert('请输入至少一首有效的歌曲名称！');
    return;
  }

  // Lock UI
  isDownloading = true;
  btnStart.disabled = true;
  btnClear.disabled = true;
  btnStart.innerHTML = `<i data-lucide="loader-2" class="spin-icon"></i> 正在下载...`;
  lucide.createIcons();
  spinIcon.classList.remove('hidden');

  // Initialize Queue Data
  downloadQueue = cleanSongs.map((name, index) => ({
    index,
    rawInput: name,
    status: 'pending', // pending, searching, downloading, completed, failed
    progress: 0,
    title: name,
    artist: '等待搜索...',
    cover: null,
    errorMsg: ''
  }));

  successCount = 0;
  errorCount = 0;

  // Render Queue UI
  renderQueueList();
  
  // Show panels
  emptyState.classList.add('hidden');
  queueList.classList.remove('hidden');
  queueStats.classList.remove('hidden');
  summaryFooter.classList.remove('hidden');
  
  updateGlobalStats();

  // Run Queue Worker (Sequential)
  for (let i = 0; i < downloadQueue.length; i++) {
    await processQueueItem(i);
    // Add 1.5s delay to prevent rate limits
    if (i < downloadQueue.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // Finished all
  isDownloading = false;
  btnStart.disabled = false;
  btnClear.disabled = false;
  btnStart.innerHTML = `<i data-lucide="download-cloud"></i> 开始批量下载`;
  spinIcon.classList.add('hidden');
  lucide.createIcons();
});

// Render all items in queue
function renderQueueList() {
  queueList.innerHTML = downloadQueue.map(item => `
    <div class="queue-item" id="item-${item.index}">
      <div class="item-main-row">
        <div class="item-info">
          <div class="item-avatar" id="avatar-${item.index}">
            <i data-lucide="music-2"></i>
          </div>
          <div class="item-meta">
            <div class="item-title" id="title-${item.index}">${escapeHtml(item.title)}</div>
            <div class="item-artist" id="artist-${item.index}">${escapeHtml(item.artist)}</div>
          </div>
        </div>
        <div id="badge-container-${item.index}">
          <span class="badge badge-pending">等待中</span>
        </div>
      </div>
      <div class="item-progress-row hidden" id="progress-row-${item.index}">
        <div class="item-progress-bar-bg">
          <div class="item-progress-bar-fill" id="progress-fill-${item.index}"></div>
        </div>
        <span class="item-progress-text" id="progress-text-${item.index}">0%</span>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

// Process single item
async function processQueueItem(idx) {
  const item = downloadQueue[idx];
  const downloadDir = downloadDirInput.value.trim();

  // 1. Search Phase
  updateItemStatus(idx, 'searching');
  
  let searchResult = null;
  try {
    const res = await fetch(`/api/search?keyword=${encodeURIComponent(item.rawInput)}`);
    const data = await res.json();
    if (res.ok && data.songs && data.songs.length > 0) {
      searchResult = data.songs[0]; // best match
    }
  } catch (err) {
    console.error('Search request failed', err);
  }

  if (!searchResult) {
    item.errorMsg = '未找到匹配的歌曲';
    updateItemStatus(idx, 'failed');
    errorCount++;
    updateGlobalStats();
    return;
  }

  // Update item details with resolved metadata
  item.title = searchResult.title;
  item.artist = searchResult.artist;
  item.cover = searchResult.cover;
  
  document.getElementById(`title-${idx}`).textContent = item.title;
  document.getElementById(`artist-${idx}`).textContent = item.artist;
  if (item.cover) {
    document.getElementById(`avatar-${idx}`).innerHTML = `<img src="${item.cover}" alt="cover">`;
  }

  // 2. Download Phase
  updateItemStatus(idx, 'downloading');
  const progressRow = document.getElementById(`progress-row-${idx}`);
  progressRow.classList.remove('hidden');

  // Simulated progress bar animation
  let fakeProgress = 0;
  const progressInterval = setInterval(() => {
    if (fakeProgress < 90) {
      fakeProgress += Math.floor(Math.random() * 8) + 2;
      if (fakeProgress > 90) fakeProgress = 90;
      updateItemProgress(idx, fakeProgress);
    }
  }, 250);

  // Trigger download api
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: searchResult.id,
        title: searchResult.title,
        artist: searchResult.artist,
        customFilename: item.rawInput,
        downloadDir
      })
    });
    
    clearInterval(progressInterval);
    const data = await res.json();

    if (res.ok && data.success) {
      updateItemProgress(idx, 100);
      updateItemStatus(idx, 'completed');
      successCount++;
    } else {
      item.errorMsg = data.error || '下载失败';
      updateItemStatus(idx, 'failed');
      errorCount++;
    }
  } catch (err) {
    clearInterval(progressInterval);
    item.errorMsg = '网络连接失败';
    updateItemStatus(idx, 'failed');
    errorCount++;
  }

  updateGlobalStats();
}

// Update UI item status badge
function updateItemStatus(idx, status) {
  const item = downloadQueue[idx];
  item.status = status;
  
  const container = document.getElementById(`badge-container-${idx}`);
  let badgeHtml = '';

  switch (status) {
    case 'searching':
      badgeHtml = `<span class="badge badge-searching"><i data-lucide="search" style="width:12px;height:12px;"></i> 搜索中</span>`;
      break;
    case 'downloading':
      badgeHtml = `<span class="badge badge-downloading"><i data-lucide="loader-2" class="spin-icon" style="width:12px;height:12px;"></i> 下载中</span>`;
      break;
    case 'completed':
      badgeHtml = `<span class="badge badge-completed"><i data-lucide="check-circle" style="width:12px;height:12px;"></i> 下载成功</span>`;
      break;
    case 'failed':
      badgeHtml = `<span class="badge badge-failed" title="${escapeHtml(item.errorMsg)}"><i data-lucide="alert-circle" style="width:12px;height:12px;"></i> 限制/失败</span>`;
      break;
    default:
      badgeHtml = `<span class="badge badge-pending">等待中</span>`;
  }

  container.innerHTML = badgeHtml;
  lucide.createIcons();
}

// Update UI item progress bar
function updateItemProgress(idx, pct) {
  const fill = document.getElementById(`progress-fill-${idx}`);
  const txt = document.getElementById(`progress-text-${idx}`);
  if (fill) fill.style.width = `${pct}%`;
  if (txt) txt.textContent = `${pct}%`;
}

// Update global progress bar and statistics
function updateGlobalStats() {
  const total = downloadQueue.length;
  const processed = successCount + errorCount;
  
  statDone.textContent = processed;
  statTotal.textContent = total;
  summarySuccessCount.textContent = successCount;
  summaryErrorCount.textContent = errorCount;

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  globalProgressFill.style.width = `${pct}%`;
  globalProgressPercent.textContent = `${pct}%`;
}

// Helper: Escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
