/**
 * 한자 사전 (Hanja Search PWA) - Main Application Logic
 */

(() => {
  'use strict';

  // ==========================================
  // 1. STATE & VARIABLES
  // ==========================================
  let hanjaData = [];
  let charMap = new Map();     // char -> entry
  let eumMap = new Map();      // eum -> [entries]
  let hunEntries = [];         // entries with Korean meaning (hun)
  let isDictLoaded = false;

  let isModelLoaded = false;
  let matcher = null;
  let origMatcher = null;

  let strokes = [];            // [[[x, y, t], ...], ...]
  let currentStroke = null;
  let isDrawing = false;
  let strokeStartTime = 0;
  let lastPointTime = 0;
  const POINT_THROTTLE_MS = 15;

  let favorites = new Set();
  let selectedHanja = null;

  // DOM Elements
  const canvas = document.getElementById('hwCanvas');
  const ctx = canvas.getContext('2d');
  const placeholder = document.getElementById('canvasPlaceholder');
  const hwStatus = document.getElementById('hwStatus');
  const hwEngineBadge = document.getElementById('hwEngineBadge');
  const hwCandidates = document.getElementById('hwCandidates');
  const hwDetailCard = document.getElementById('hwDetailCard');

  const btnUndo = document.getElementById('btnUndo');
  const btnClear = document.getElementById('btnClear');

  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchCountHint = document.getElementById('searchCountHint');
  const searchLoading = document.getElementById('searchLoading');

  const favResults = document.getElementById('favResults');
  const favCount = document.getElementById('favCount');
  const btnClearFavs = document.getElementById('btnClearFavs');

  const charModal = document.getElementById('charModal');
  const closeModal = document.getElementById('closeModal');
  const toastEl = document.getElementById('toast');

  // ==========================================
  // 2. INITIALIZATION
  // ==========================================
  window.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initCanvas();
    loadFavorites();
    loadDictionary();
    initHanziLookup();
    initSearch();
    initModal();
    initPWA();
  });

  // ==========================================
  // 3. PWA & iOS SUPPORT (Instant Update)
  // ==========================================
  function initPWA() {
    const updateNotice = document.getElementById('updateNotice');
    const btnForceUpdate = document.getElementById('btnForceUpdate');

    if (btnForceUpdate) {
      btnForceUpdate.addEventListener('click', async () => {
        btnForceUpdate.style.transform = 'rotate(360deg)';
        showToast('🔄 최신 버전으로 갱신 중...');
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.unregister();
          }
        }
        window.location.reload();
      });
    }

    if (updateNotice) {
      updateNotice.addEventListener('click', () => {
        window.location.reload();
      });
    }

    // Register Service Worker with version query
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js?v=2.2')
        .then(reg => {
          console.log('[PWA] Service Worker v2.2 registered.');
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  if (updateNotice) updateNotice.classList.remove('hidden');
                }
              };
            }
          };
        })
        .catch(err => console.warn('[PWA] Registration failed:', err));
    }

    // Check if running on iOS Safari and not standalone
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const installBanner = document.getElementById('installBanner');
    const closeBanner = document.getElementById('closeInstallBanner');

    if (isIos && !isStandalone) {
      const bannerDismissed = localStorage.getItem('hanja_banner_dismissed');
      if (!bannerDismissed && installBanner) {
        installBanner.classList.remove('hidden');
      }
    }

    if (closeBanner) {
      closeBanner.addEventListener('click', () => {
        installBanner.classList.add('hidden');
        localStorage.setItem('hanja_banner_dismissed', 'true');
      });
    }
  }

  // ==========================================
  // 4. TAB NAVIGATION
  // ==========================================
  function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const content = document.getElementById(`tab-${targetTab}`);
        if (content) content.classList.add('active');

        if (targetTab === 'favorites') {
          renderFavorites();
        } else if (targetTab === 'handwriting') {
          // Resize/redraw canvas if needed
          resizeCanvas();
        }
      });
    });
  }

  // ==========================================
  // 5. DICTIONARY DATA LOADER
  // ==========================================
  async function loadDictionary() {
    searchLoading.style.display = 'flex';
    try {
      const res = await fetch('./data/hanja_dict.json');
      hanjaData = await res.json();

      // Build indexing for ultra-fast lookup
      for (let i = 0; i < hanjaData.length; i++) {
        const entry = hanjaData[i];
        charMap.set(entry.char, entry);

        if (entry.eum) {
          if (!eumMap.has(entry.eum)) {
            eumMap.set(entry.eum, []);
          }
          eumMap.get(entry.eum).push(entry);
        }

        if (entry.hun) {
          hunEntries.push(entry);
        }
      }

      isDictLoaded = true;
      searchLoading.style.display = 'none';
      searchCountHint.textContent = `총 ${hanjaData.length.toLocaleString()}자의 한자 수록 (음/훈/단어 검색 가능)`;
      console.log(`[Dict] Loaded ${hanjaData.length} entries.`);

      // If user previously searched, refresh
      if (searchInput.value.trim()) {
        performSearch(searchInput.value.trim());
      }
    } catch (err) {
      console.error('[Dict] Error loading dictionary:', err);
      searchLoading.innerHTML = `<span style="color:#ef4444;">사전 데이터를 불러오는 데 실패했습니다.</span>`;
    }
  }

  // ==========================================
  // 6. HANZILOOKUPJS INITIALIZATION (Dual Engine)
  // ==========================================
  function initHanziLookup() {
    if (typeof HanziLookup === 'undefined') {
      console.warn('[HanziLookup] Library not found.');
      return;
    }

    // Load MMAH model
    HanziLookup.init('mmah', './data/mmah.json', (success) => {
      if (success) {
        matcher = new HanziLookup.Matcher('mmah');
        isModelLoaded = true;
        console.log('[HanziLookup] MMAH model loaded.');
      }
    });

    // Load ORIG model in background for dual fallback
    HanziLookup.init('orig', './data/orig.json', (success) => {
      if (success) {
        origMatcher = new HanziLookup.Matcher('orig');
        console.log('[HanziLookup] ORIG model loaded.');
      }
    });
  }

  // ==========================================
  // 7. CANVAS & DRAWING LOGIC (Mobile Optimized)
  // ==========================================
  function initCanvas() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Canvas drawing events (pointer events handles mouse, touch, and Apple Pencil smoothly)
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    btnUndo.addEventListener('click', undoStroke);
    btnClear.addEventListener('click', clearCanvas);

    // Character detail actions in handwriting tab
    document.getElementById('btnPronounce').addEventListener('click', () => {
      if (selectedHanja) speakHanja(selectedHanja);
    });
    document.getElementById('btnCopy').addEventListener('click', () => {
      if (selectedHanja) copyToClipboard(selectedHanja.char);
    });
    document.getElementById('btnToggleFav').addEventListener('click', () => {
      if (selectedHanja) toggleFavorite(selectedHanja.char);
    });
  }

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      ctx.scale(dpr, dpr);
      redrawAllStrokes();
    }
  }

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return [Math.round(x), Math.round(y)];
  }

  function handlePointerDown(e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    isDrawing = true;
    placeholder.classList.add('hidden');

    const now = Date.now();
    strokeStartTime = now;
    lastPointTime = now;

    const pos = getCanvasPos(e);
    currentStroke = [[pos[0], pos[1], 0]];

    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#1e293b';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos[0], pos[1]);
  }

  function handlePointerMove(e) {
    if (!isDrawing || !currentStroke) return;
    e.preventDefault();

    const now = Date.now();
    if (now - lastPointTime < POINT_THROTTLE_MS) return;
    lastPointTime = now;

    const pos = getCanvasPos(e);
    const lastPos = currentStroke[currentStroke.length - 1];
    if (pos[0] === lastPos[0] && pos[1] === lastPos[1]) return;

    const elapsed = now - strokeStartTime;
    currentStroke.push([pos[0], pos[1], elapsed]);
    ctx.lineTo(pos[0], pos[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos[0], pos[1]);
  }

  function handlePointerUp(e) {
    if (!isDrawing) return;
    e.preventDefault();
    isDrawing = false;

    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (currentStroke && currentStroke.length > 0) {
      strokes.push(currentStroke);
      currentStroke = null;
      runRecognition();
    }
  }

  function redrawAllStrokes() {
    const rect = canvas.parentElement.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#1e293b';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < strokes.length; i++) {
      const stroke = strokes[i];
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0][0], stroke[0][1]);
      for (let j = 1; j < stroke.length; j++) {
        ctx.lineTo(stroke[j][0], stroke[j][1]);
      }
      ctx.stroke();
    }
  }

  function undoStroke() {
    if (strokes.length > 0) {
      strokes.pop();
      redrawAllStrokes();
      if (strokes.length === 0) {
        placeholder.classList.remove('hidden');
        resetRecognitionResults();
      } else {
        runRecognition();
      }
    }
  }

  function clearCanvas() {
    strokes = [];
    currentStroke = null;
    redrawAllStrokes();
    placeholder.classList.remove('hidden');
    resetRecognitionResults();
  }

  function resetRecognitionResults() {
    hwStatus.textContent = '인식 후보 (터치하여 상세 보기)';
    hwCandidates.innerHTML = `
      <div style="color: var(--text-secondary); font-size: 0.9rem; padding: 12px 0;">
        한자를 쓰면 유사한 한자 후보가 여기에 표시됩니다.
      </div>
    `;
    hwDetailCard.style.display = 'none';
    selectedHanja = null;
  }

  // ==========================================
  // 8. HYBRID HANDWRITING RECOGNITION MATCHING
  // ==========================================
  async function runRecognition() {
    if (strokes.length === 0) return;

    hwStatus.textContent = '유사 한자 분석 중...';

    // 1. Try Google Cloud Digital Ink AI first (Superior stroke-order-free accuracy)
    if (navigator.onLine) {
      try {
        const candidates = await recognizeWithGoogle(strokes);
        if (candidates && candidates.length > 0) {
          updateEngineBadge('✨ AI 스마트 인식', '#dbeafe', '#1e40af');
          renderCandidates(candidates);
          return;
        }
      } catch (err) {
        console.warn('[Recognition] Cloud AI fallback to local engine:', err);
      }
    }

    // 2. Fallback to Local Engine (HanziLookupJS with 256x256 normalization & dual models)
    updateEngineBadge('📴 오프라인 로컬 인식', '#f1f5f9', '#475569');
    recognizeWithLocal(strokes);
  }

  function updateEngineBadge(text, bg, color) {
    if (hwEngineBadge) {
      hwEngineBadge.textContent = text;
      hwEngineBadge.style.background = bg;
      hwEngineBadge.style.color = color;
    }
  }

  // --- Cloud AI Engine (Google Input Tools Digital Ink) ---
  async function recognizeWithGoogle(userStrokes) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width) || 300;
    const height = Math.round(rect.height) || 300;

    const ink = userStrokes.map(stroke => {
      const xs = stroke.map(p => p[0]);
      const ys = stroke.map(p => p[1]);
      const ts = stroke.map(p => p[2] || 0);
      return [xs, ys, ts];
    });

    const payload = {
      app_version: 0.4,
      api_level: "533.17.9",
      device: "web",
      input_type: "0",
      options: "enable_pre_space",
      requests: [{
        writing_guide: { writing_area_width: width, writing_area_height: height },
        ink: ink,
        language: "zh-Hant" // Traditional CJK characters used in Korean Hanja
      }]
    };

    const res = await fetch("https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Google API status ${res.status}`);
    const data = await res.json();
    if (!data || data[0] !== "SUCCESS") throw new Error("Google API non-success");

    const rawMatches = data[1][0][1] || [];
    const candidates = [];
    const seen = new Set();

    for (let i = 0; i < rawMatches.length; i++) {
      const str = rawMatches[i];
      for (const ch of str) {
        const code = ch.charCodeAt(0);
        // Valid CJK Ideograph check
        if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) || (code >= 0xF900 && code <= 0xFAFF)) {
          if (!seen.has(ch)) {
            seen.add(ch);
            candidates.push(ch);
          }
        }
      }
      if (candidates.length >= 15) break;
    }

    return candidates;
  }

  // --- Local Fallback Engine (HanziLookupJS) ---
  function recognizeWithLocal(userStrokes) {
    if (!isModelLoaded || userStrokes.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = 256 / (rect.width || 256);
    const scaleY = 256 / (rect.height || 256);

    // Normalize coordinates to 256x256 coordinate system
    const normalizedStrokes = userStrokes.map(stroke =>
      stroke.map(p => [Math.round(p[0] * scaleX), Math.round(p[1] * scaleY)])
    );

    const analyzedChar = new HanziLookup.AnalyzedCharacter(normalizedStrokes);
    const candidates = [];
    const seen = new Set();

    if (matcher) {
      matcher.match(analyzedChar, 10, (matches) => {
        if (matches) {
          matches.forEach(m => {
            if (!seen.has(m.character)) {
              seen.add(m.character);
              candidates.push(m.character);
            }
          });
        }

        if (origMatcher) {
          origMatcher.match(analyzedChar, 6, (origMatches) => {
            if (origMatches) {
              origMatches.forEach(m => {
                if (!seen.has(m.character)) {
                  seen.add(m.character);
                  candidates.push(m.character);
                }
              });
            }
            renderCandidates(candidates);
          });
        } else {
          renderCandidates(candidates);
        }
      });
    }
  }

  function renderCandidates(candidates) {
    if (!candidates || candidates.length === 0) {
      hwStatus.textContent = '일치하는 한자를 찾지 못했습니다';
      hwCandidates.innerHTML = `<div style="color:var(--text-secondary); padding: 10px 0;">다른 획으로 다시 시도해보세요.</div>`;
      return;
    }

    hwStatus.textContent = `추천 후보 ${candidates.length}개 (원하는 한자를 터치하세요)`;
    hwCandidates.innerHTML = '';

    candidates.forEach((char, index) => {
      const entry = charMap.get(char);
      const hunEum = entry ? `${entry.hun || ''} ${entry.eum || ''}`.trim() : '';

      const btn = document.createElement('button');
      btn.className = 'hw-candidate' + (index === 0 ? ' selected' : '');
      btn.innerHTML = `
        <span class="hw-candidate-char">${char}</span>
        <span class="hw-candidate-huneum">${hunEum || '한자'}</span>
      `;
      btn.title = hunEum ? `${char} (${hunEum})` : char;

      btn.addEventListener('click', () => {
        document.querySelectorAll('.hw-candidate').forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
        showHanjaDetail(char);
      });

      hwCandidates.appendChild(btn);
    });

    // Automatically display detail for top candidate
    showHanjaDetail(candidates[0]);
  }

  function showHanjaDetail(char) {
    const entry = charMap.get(char) || {
      char: char,
      eum: '',
      hun: '',
      strokes: '-',
      definition: '상세 정보 없음'
    };

    selectedHanja = entry;

    document.getElementById('detailHanja').textContent = entry.char;
    document.getElementById('detailHunEum').textContent = (entry.hun || '') + ' ' + (entry.eum || '');
    document.getElementById('detailDefinition').textContent = entry.definition || '영문 정의 없음';
    document.getElementById('detailStrokes').textContent = entry.strokes ? `${entry.strokes}획` : '-';
    document.getElementById('detailUnicode').textContent = `U+${entry.char.charCodeAt(0).toString(16).toUpperCase()}`;

    // Update favorite button state
    const favBtn = document.getElementById('btnToggleFav');
    if (favorites.has(entry.char)) {
      favBtn.textContent = '★ 저장됨';
      favBtn.style.color = '#eab308';
    } else {
      favBtn.textContent = '⭐ 즐겨찾기';
      favBtn.style.color = '';
    }

    hwDetailCard.style.display = 'block';
  }

  // ==========================================
  // 9. HANGUL & WORD SEARCH LOGIC
  // ==========================================
  function initSearch() {
    let debounceTimer = null;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = e.target.value.trim();
        performSearch(query);
      }, 150);
    });
  }

  function performSearch(query) {
    if (!query) {
      searchResults.innerHTML = '';
      searchCountHint.textContent = `총 ${hanjaData.length.toLocaleString()}자의 한자 수록`;
      return;
    }

    if (!isDictLoaded) {
      return;
    }

    const results = [];
    const lowerQuery = query.toLowerCase();

    // 1. Direct Hanja lookup (e.g. user pasted '學')
    if (charMap.has(query)) {
      results.push(charMap.get(query));
    }

    // 2. Exact Korean sound match (음: e.g. '학')
    if (eumMap.has(query)) {
      const eumMatches = eumMap.get(query);
      for (let i = 0; i < eumMatches.length; i++) {
        const item = eumMatches[i];
        if (!results.includes(item)) {
          results.push(item);
        }
      }
    }

    // 3. Korean meaning match (훈: e.g. '배울')
    for (let i = 0; i < hunEntries.length; i++) {
      const item = hunEntries[i];
      if (item.hun && item.hun.includes(query)) {
        if (!results.includes(item)) {
          results.push(item);
        }
      }
      if (results.length >= 100) break; // Limit search pool for responsiveness
    }

    // 4. English definition match (e.g. 'study', 'water')
    if (results.length < 50 && /^[a-zA-Z\s]+$/.test(query)) {
      for (let i = 0; i < hanjaData.length; i++) {
        const item = hanjaData[i];
        if (item.definition && item.definition.toLowerCase().includes(lowerQuery)) {
          if (!results.includes(item)) {
            results.push(item);
          }
        }
        if (results.length >= 100) break;
      }
    }

    // 5. Multi-syllable Hangul breakdown (e.g. '학교')
    if (results.length === 0 && query.length > 1 && /^[가-힣]+$/.test(query)) {
      searchCountHint.textContent = `'${query}'의 음절별 한자를 표시합니다.`;
      renderSyllableBreakdown(query);
      return;
    }

    // Sort results: items with both hun & eum first, then by stroke count
    results.sort((a, b) => {
      const aScore = (a.hun ? 2 : 0) + (a.eum ? 1 : 0);
      const bScore = (b.hun ? 2 : 0) + (b.eum ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return (a.strokes || 0) - (b.strokes || 0);
    });

    searchCountHint.textContent = `검색 결과: ${results.length.toLocaleString()}건`;
    renderSearchResults(results);
  }

  function renderSearchResults(items) {
    if (items.length === 0) {
      searchResults.innerHTML = `
        <li class="no-results">
          <div class="emoji">🧐</div>
          <div>검색 결과가 없습니다.</div>
          <div style="font-size:0.8rem; margin-top:6px;">음(예: 학), 훈(예: 배울), 영문 뜻으로 검색해보세요.</div>
        </li>
      `;
      return;
    }

    // Render up to 50 items at a time
    const slice = items.slice(0, 50);
    let html = '';

    for (let i = 0; i < slice.length; i++) {
      const item = slice[i];
      const hunEum = (item.hun || '') + ' ' + (item.eum || '');
      html += `
        <li class="result-item" data-char="${item.char}">
          <div class="result-hanja">${item.char}</div>
          <div class="result-info">
            <div class="result-hun-eum">${hunEum.trim() || item.char}</div>
            <div class="result-definition">${item.definition || '영문 정의 없음'}</div>
          </div>
          <div class="result-strokes">${item.strokes ? item.strokes + '획' : ''}</div>
        </li>
      `;
    }

    searchResults.innerHTML = html;

    // Attach click listeners to open modal
    searchResults.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        const char = el.getAttribute('data-char');
        openModalWithChar(char);
      });
    });
  }

  function renderSyllableBreakdown(word) {
    let html = '';
    for (let i = 0; i < word.length; i++) {
      const charSyllable = word[i];
      const matches = eumMap.get(charSyllable) || [];
      const topMatches = matches.filter(m => m.hun).slice(0, 8);

      html += `
        <li style="margin-top: 16px; margin-bottom: 8px; font-weight: 700; color: var(--primary);">
          '${charSyllable}' 음을 가진 대표 한자
        </li>
      `;

      if (topMatches.length === 0) {
        html += `<li class="result-item"><div class="result-info">'${charSyllable}'에 해당하는 한자가 없습니다.</div></li>`;
      } else {
        topMatches.forEach(item => {
          html += `
            <li class="result-item" data-char="${item.char}">
              <div class="result-hanja">${item.char}</div>
              <div class="result-info">
                <div class="result-hun-eum">${item.hun} ${item.eum}</div>
                <div class="result-definition">${item.definition || ''}</div>
              </div>
              <div class="result-strokes">${item.strokes ? item.strokes + '획' : ''}</div>
            </li>
          `;
        });
      }
    }

    searchResults.innerHTML = html;
    searchResults.querySelectorAll('.result-item[data-char]').forEach(el => {
      el.addEventListener('click', () => {
        openModalWithChar(el.getAttribute('data-char'));
      });
    });
  }

  // ==========================================
  // 10. MODAL DETAIL DIALOG
  // ==========================================
  let modalChar = null;

  function initModal() {
    closeModal.addEventListener('click', () => charModal.close());
    charModal.addEventListener('click', (e) => {
      if (e.target === charModal) charModal.close();
    });

    document.getElementById('modalBtnPronounce').addEventListener('click', () => {
      if (modalChar) speakHanja(modalChar);
    });
    document.getElementById('modalBtnCopy').addEventListener('click', () => {
      if (modalChar) copyToClipboard(modalChar.char);
    });
    document.getElementById('modalBtnFav').addEventListener('click', () => {
      if (modalChar) {
        toggleFavorite(modalChar.char);
        updateModalFavButton(modalChar.char);
      }
    });
  }

  function openModalWithChar(char) {
    const entry = charMap.get(char) || {
      char: char,
      eum: '',
      hun: '',
      strokes: '-',
      definition: '상세 정보 없음'
    };

    modalChar = entry;

    document.getElementById('modalHanja').textContent = entry.char;
    document.getElementById('modalHunEum').textContent = (entry.hun || '') + ' ' + (entry.eum || '');
    document.getElementById('modalDefinition').textContent = entry.definition || '영문 정의 없음';
    document.getElementById('modalStrokes').textContent = entry.strokes ? `${entry.strokes}획` : '-';
    document.getElementById('modalUnicode').textContent = `U+${entry.char.charCodeAt(0).toString(16).toUpperCase()}`;

    updateModalFavButton(entry.char);
    charModal.showModal();
  }

  function updateModalFavButton(char) {
    const btn = document.getElementById('modalBtnFav');
    if (favorites.has(char)) {
      btn.textContent = '★ 저장됨';
      btn.style.color = '#eab308';
    } else {
      btn.textContent = '⭐ 즐겨찾기';
      btn.style.color = '';
    }
  }

  // ==========================================
  // 11. FAVORITES MANAGEMENT
  // ==========================================
  function loadFavorites() {
    try {
      const saved = localStorage.getItem('hanja_favorites');
      if (saved) {
        favorites = new Set(JSON.parse(saved));
      }
    } catch (e) {
      favorites = new Set();
    }
    updateFavCount();

    btnClearFavs.addEventListener('click', () => {
      if (favorites.size === 0) return;
      if (confirm('저장된 모든 한자를 삭제하시겠습니까?')) {
        favorites.clear();
        saveFavorites();
        renderFavorites();
        showToast('즐겨찾기를 모두 삭제했습니다.');
      }
    });
  }

  function saveFavorites() {
    localStorage.setItem('hanja_favorites', JSON.stringify([...favorites]));
    updateFavCount();
  }

  function updateFavCount() {
    favCount.textContent = favorites.size;
  }

  function toggleFavorite(char) {
    if (favorites.has(char)) {
      favorites.delete(char);
      showToast(`'${char}' 즐겨찾기에서 제거됨`);
    } else {
      favorites.add(char);
      showToast(`'${char}' 즐겨찾기에 추가됨`);
    }
    saveFavorites();

    // Refresh UI states if needed
    if (selectedHanja && selectedHanja.char === char) {
      showHanjaDetail(char);
    }
    if (modalChar && modalChar.char === char) {
      updateModalFavButton(char);
    }
  }

  function renderFavorites() {
    updateFavCount();
    if (favorites.size === 0) {
      favResults.innerHTML = `
        <li class="no-results">
          <div class="emoji">⭐</div>
          <div>저장된 한자가 없습니다.</div>
          <div style="font-size: 0.8rem; margin-top: 6px;">필기 검색 또는 한글 검색에서 별표를 눌러 저장해보세요.</div>
        </li>
      `;
      return;
    }

    let html = '';
    favorites.forEach(char => {
      const item = charMap.get(char) || { char: char, eum: '', hun: '', definition: '', strokes: 0 };
      const hunEum = (item.hun || '') + ' ' + (item.eum || '');
      html += `
        <li class="result-item" data-char="${item.char}">
          <div class="result-hanja">${item.char}</div>
          <div class="result-info">
            <div class="result-hun-eum">${hunEum.trim() || item.char}</div>
            <div class="result-definition">${item.definition || ''}</div>
          </div>
          <div class="result-strokes">${item.strokes ? item.strokes + '획' : ''}</div>
        </li>
      `;
    });

    favResults.innerHTML = html;
    favResults.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        openModalWithChar(el.getAttribute('data-char'));
      });
    });
  }

  // ==========================================
  // 12. UTILITIES (Speech, Copy, Toast)
  // ==========================================
  function speakHanja(entry) {
    if (!('speechSynthesis' in window)) {
      showToast('이 브라우저는 음성 재생을 지원하지 않습니다.');
      return;
    }

    window.speechSynthesis.cancel();

    // Speak in Korean: "배울 학" or "학"
    const textToSpeak = entry.hun ? `${entry.hun} ${entry.eum}` : (entry.eum || entry.char);
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.9;

    window.speechSynthesis.speak(utterance);
    showToast(`🔊 "${textToSpeak}" 재생 중`);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(`'${text}' 복사되었습니다.`);
      });
    } else {
      // Fallback
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showToast(`'${text}' 복사되었습니다.`);
    }
  }

  let toastTimer = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
  }

})();
