// Language dictionary for bilingual support
const i18n = {
  zh: {
    subtitle: '极简高端 · 歌曲 MP3 批量自动搜索与下载',
    inputTitle: '歌曲输入与配置',
    listLabel: '歌曲列表 (每行一首歌曲，支持“歌名”或“歌手 - 歌名”)',
    placeholder: '例如：\n周杰伦 - 晴天\n陈奕迅 - 十年\nMichael Learns To Rock - That\'s Why (You Go Away)\nRight Here Waiting - Richard Marx',
    sourceLabel: '默认搜索源',
    sourceAuto: '智能推荐',
    dirLabel: '下载目录 (本地文件夹路径)',
    dirPlaceholder: '请输入绝对路径',
    proxyLabel: '网络代理 (可选，中国大陆用户下载 YouTube 需配置)',
    proxyPlaceholder: '例如：http://127.0.0.1:7890',
    openFolder: '打开文件夹',
    startDownload: '开始批量下载',
    downloading: '正在下载...',
    clearList: '清空列表',
    queueTitle: '下载状态队列',
    completedBadge: '已完成',
    emptyState: '队列为空，请在左侧输入歌曲列表并点击“开始批量下载”',
    overallProgress: '总下载进度',
    successText: '成功',
    failedText: '限制/失败',
    
    // Badge status
    badgePending: '等待中',
    badgeSearching: '搜索中',
    badgeDownloading: '下载中',
    badgeCompleted: '下载成功',
    badgeFailed: '限制/失败',
    
    // Alerts/Errors
    alertNoSongs: '请输入至少一首有效的歌曲名称！',
    alertFolderFail: '打开文件夹失败: ',
    noMatch: '未找到匹配的歌曲',
    networkFail: '网络连接失败',
    downloadFail: '下载失败'
  },
  en: {
    subtitle: 'High-End & Minimalist · Batch MP3 Audio Downloader & Tagger',
    inputTitle: 'Song Input & Config',
    listLabel: 'Song List (One song per line, supports "Song Title" or "Artist - Song")',
    placeholder: 'Example:\nMichael Learns To Rock - That\'s Why (You Go Away)\nRichard Marx - Right Here Waiting\nJay Chou - Qiang Tian',
    sourceLabel: 'Default Search Source',
    sourceAuto: 'Auto Recommendation',
    dirLabel: 'Download Directory (Local folder path)',
    dirPlaceholder: 'Please enter absolute path',
    proxyLabel: 'Network Proxy (Optional, required for YouTube access in restricted regions)',
    proxyPlaceholder: 'e.g., http://127.0.0.1:7890',
    openFolder: 'Open Folder',
    startDownload: 'Start Batch Download',
    downloading: 'Downloading...',
    clearList: 'Clear List',
    queueTitle: 'Download Status Queue',
    completedBadge: 'Completed',
    emptyState: 'Queue is empty. Enter songs on the left and click "Start Batch Download".',
    overallProgress: 'Overall Progress',
    successText: 'Success',
    failedText: 'Limits/Failed',
    
    // Badge status
    badgePending: 'Pending',
    badgeSearching: 'Searching',
    badgeDownloading: 'Downloading',
    badgeCompleted: 'Success',
    badgeFailed: 'Limits/Failed',
    
    // Alerts/Errors
    alertNoSongs: 'Please enter at least one valid song name!',
    alertFolderFail: 'Failed to open directory: ',
    noMatch: 'No match found',
    networkFail: 'Network error',
    downloadFail: 'Download failed'
  }
};

// Current language state
let currentLang = localStorage.getItem('melodyflow_lang') || 'zh';

// Cache DOM Elements
const songListInput = document.getElementById('song-list');
const downloadDirInput = document.getElementById('download-dir');
const networkProxyInput = document.getElementById('network-proxy');
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
const btnLangToggle = document.getElementById('btn-lang-toggle');
const currentLangText = document.getElementById('current-lang-text');

const btnSourceAuto = document.getElementById('btn-source-auto');
const btnSourceYoutube = document.getElementById('btn-source-youtube');
const btnSourceBilibili = document.getElementById('btn-source-bilibili');
let currentSearchSource = localStorage.getItem('melodyflow_search_source') || 'auto';

function setSearchSource(source) {
  currentSearchSource = source;
  localStorage.setItem('melodyflow_search_source', source);
  
  if (btnSourceAuto) btnSourceAuto.classList.remove('active');
  if (btnSourceYoutube) btnSourceYoutube.classList.remove('active');
  if (btnSourceBilibili) btnSourceBilibili.classList.remove('active');
  
  if (source === 'bilibili' && btnSourceBilibili) {
    btnSourceBilibili.classList.add('active');
  } else if (source === 'youtube' && btnSourceYoutube) {
    btnSourceYoutube.classList.add('active');
  } else if (btnSourceAuto) {
    btnSourceAuto.classList.add('active');
  }
}

if (btnSourceAuto && btnSourceYoutube && btnSourceBilibili) {
  btnSourceAuto.addEventListener('click', () => setSearchSource('auto'));
  btnSourceYoutube.addEventListener('click', () => setSearchSource('youtube'));
  btnSourceBilibili.addEventListener('click', () => setSearchSource('bilibili'));
}

function detectBestSource(keyword) {
  const containsChinese = /[\u4e00-\u9fa5]/.test(keyword);
  return containsChinese ? 'bilibili' : 'youtube';
}

let downloadQueue = [];
let isDownloading = false;
let successCount = 0;
let errorCount = 0;

// Update UI Translation Texts
function updateUI() {
  const trans = i18n[currentLang];
  
  // Set lang text on button (shows the OTHER language option)
  currentLangText.textContent = currentLang === 'zh' ? 'English' : '华文';
  
  // Translate elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (trans[key]) {
      // Keep inner HTML icons if they exist
      const icon = el.querySelector('i, svg');
      if (icon) {
        el.innerHTML = '';
        el.appendChild(icon);
        el.appendChild(document.createTextNode(' ' + trans[key]));
      } else {
        el.textContent = trans[key];
      }
    }
  });
  
  // Special placeholders update
  songListInput.placeholder = trans.placeholder;
  downloadDirInput.placeholder = trans.dirPlaceholder;
  networkProxyInput.placeholder = trans.proxyPlaceholder;
  
  // Update button texts depending on state
  if (isDownloading) {
    btnStart.innerHTML = `<i data-lucide="loader-2" class="spin-icon"></i> ${trans.downloading}`;
  } else {
    btnStart.innerHTML = `<i data-lucide="download-cloud"></i> ${trans.startDownload}`;
  }
  
  btnClear.innerHTML = `<i data-lucide="trash-2"></i> ${trans.clearList}`;
  btnOpenDir.innerHTML = `<i data-lucide="folder-open"></i> ${trans.openFolder}`;
  
  // Recreate Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Language Switch Event
btnLangToggle.addEventListener('click', () => {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('melodyflow_lang', currentLang);
  updateUI();
  
  // Update badges of already rendered items
  if (downloadQueue.length > 0) {
    downloadQueue.forEach(item => {
      updateItemStatus(item.index, item.status);
    });
  }
});

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

// Open Local Download Folder
btnOpenDir.addEventListener('click', async () => {
  const downloadDir = downloadDirInput.value.trim();
  const trans = i18n[currentLang];
  try {
    const res = await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadDir })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '无法打开文件夹');
  } catch (err) {
    alert(trans.alertFolderFail + err.message);
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

  const trans = i18n[currentLang];
  const rawLines = songListInput.value.split('\n');
  const cleanSongs = rawLines
    .map(line => parseSongLine(line))
    .filter(Boolean);

  if (cleanSongs.length === 0) {
    alert(trans.alertNoSongs);
    return;
  }

  // Update backend proxy configurations
  const proxyVal = networkProxyInput ? networkProxyInput.value.trim() : '';
  localStorage.setItem('melodyflow_proxy', proxyVal);
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy: proxyVal })
    });
  } catch (err) {
    console.error('Failed to configure proxy on backend', err);
  }

  // Lock UI
  isDownloading = true;
  btnStart.disabled = true;
  btnClear.disabled = true;
  btnStart.innerHTML = `<i data-lucide="loader-2" class="spin-icon"></i> ${trans.downloading}`;
  lucide.createIcons();
  spinIcon.classList.remove('hidden');

  // Initialize Queue Data
  downloadQueue = cleanSongs.map((name, index) => ({
    index,
    rawInput: name,
    status: 'pending', // pending, searching, downloading, completed, failed
    progress: 0,
    title: name,
    artist: currentLang === 'zh' ? '等待搜索...' : 'Waiting for search...',
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
  btnStart.innerHTML = `<i data-lucide="download-cloud"></i> ${trans.startDownload}`;
  spinIcon.classList.add('hidden');
  lucide.createIcons();
});

// Render all items in queue
function renderQueueList() {
  const trans = i18n[currentLang];
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
          <span class="badge badge-pending">${trans.badgePending}</span>
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
  const trans = i18n[currentLang];

  // 1. Search Phase
  updateItemStatus(idx, 'searching');
  
  let sortedCandidates = [];
  let searchError = '';
  try {
    const searchSource = currentSearchSource === 'auto' ? detectBestSource(item.rawInput) : currentSearchSource;
    const res = await fetch(`/api/search?keyword=${encodeURIComponent(item.rawInput)}&source=${searchSource}`);
    const data = await res.json();
    if (res.ok) {
      if (data.songs && data.songs.length > 0) {
        // Sort candidates based on heuristic relevance
        const parts = item.rawInput.split(/\s*[-–—]\s*/);
        if (parts.length >= 2) {
          const part0 = parts[0].trim().toLowerCase();
          const part1 = parts.slice(1).join(' - ').trim().toLowerCase();
          
          let matchedSongs = [];
          let partialMatchedSongs = [];
          let otherSongs = [];
          
          for (const song of data.songs) {
            const sTitle = (song.title || '').toLowerCase();
            const sArtist = (song.artist || '').toLowerCase();
            
            const hasPart0 = sTitle.includes(part0) || sArtist.includes(part0);
            const hasPart1 = sTitle.includes(part1) || sArtist.includes(part1);
            
            if (hasPart0 && hasPart1) {
              matchedSongs.push(song);
            } else if (hasPart0) {
              partialMatchedSongs.push(song);
            } else {
              otherSongs.push(song);
            }
          }
          sortedCandidates = [...matchedSongs, ...partialMatchedSongs, ...otherSongs];
        } else {
          sortedCandidates = [...data.songs];
        }
      } else {
        searchError = trans.noMatch;
      }
    } else {
      searchError = data.error || data.details || 'Search API Error';
    }
  } catch (err) {
    console.error('Search request failed', err);
    searchError = trans.networkFail;
  }

  if (sortedCandidates.length === 0) {
    item.errorMsg = searchError || trans.noMatch;
    updateItemStatus(idx, 'failed');
    errorCount++;
    updateGlobalStats();
    return;
  }

  // 2. Download Phase (Sequential Candidate Download Try-Loop)
  updateItemStatus(idx, 'downloading');
  const progressRow = document.getElementById(`progress-row-${idx}`);
  progressRow.classList.remove('hidden');

  let downloadSuccess = false;
  let finalError = trans.downloadFail;

  for (let c = 0; c < sortedCandidates.length; c++) {
    const candidate = sortedCandidates[c];
    
    // Update active UI details
    item.title = candidate.title;
    item.artist = candidate.artist;
    item.cover = candidate.cover;
    
    document.getElementById(`title-${idx}`).textContent = item.title;
    document.getElementById(`artist-${idx}`).textContent = item.artist;
    if (item.cover) {
      document.getElementById(`avatar-${idx}`).innerHTML = `<img src="${item.cover}" alt="cover">`;
    } else {
      document.getElementById(`avatar-${idx}`).innerHTML = `<i data-lucide="music-2"></i>`;
      lucide.createIcons();
    }

    if (c > 0) {
      console.log(`[Queue] Previous candidate failed. Retrying backup candidate ${c + 1}/${sortedCandidates.length}: ${candidate.title}`);
    }

    // Simulated progress bar animation
    let fakeProgress = 0;
    updateItemProgress(idx, 0);
    const progressInterval = setInterval(() => {
      if (fakeProgress < 90) {
        fakeProgress += Math.floor(Math.random() * 8) + 2;
        if (fakeProgress > 90) fakeProgress = 90;
        updateItemProgress(idx, fakeProgress);
      }
    }, 250);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: candidate.id,
          title: candidate.title,
          artist: candidate.artist,
          cover: candidate.cover,
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
        downloadSuccess = true;
        break; // Success! Break out of candidates loop.
      } else {
        finalError = data.error || trans.downloadFail;
        console.warn(`Candidate ${c + 1} download failed:`, finalError);
      }
    } catch (err) {
      clearInterval(progressInterval);
      finalError = trans.networkFail;
      console.error(`Candidate ${c + 1} request error:`, err);
    }
  }

  if (!downloadSuccess) {
    item.errorMsg = finalError;
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
  if (!container) return;
  
  let badgeHtml = '';
  const trans = i18n[currentLang];

  switch (status) {
    case 'searching':
      badgeHtml = `<span class="badge badge-searching"><i data-lucide="search" style="width:12px;height:12px;"></i> ${trans.badgeSearching}</span>`;
      break;
    case 'downloading':
      badgeHtml = `<span class="badge badge-downloading"><i data-lucide="loader-2" class="spin-icon" style="width:12px;height:12px;"></i> ${trans.badgeDownloading}</span>`;
      break;
    case 'completed':
      badgeHtml = `<span class="badge badge-completed"><i data-lucide="check-circle" style="width:12px;height:12px;"></i> ${trans.badgeCompleted}</span>`;
      break;
    case 'failed':
      badgeHtml = `<span class="badge badge-failed" title="${escapeHtml(item.errorMsg)}"><i data-lucide="alert-circle" style="width:12px;height:12px;"></i> ${trans.badgeFailed}</span>`;
      break;
    default:
      badgeHtml = `<span class="badge badge-pending">${trans.badgePending}</span>`;
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

// Initialize Localization on Load
document.addEventListener('DOMContentLoaded', () => {
  // Load saved proxy preference
  const savedProxy = localStorage.getItem('melodyflow_proxy') || '';
  if (networkProxyInput) {
    networkProxyInput.value = savedProxy;
  }
  setSearchSource(currentSearchSource);
  updateUI();
});
