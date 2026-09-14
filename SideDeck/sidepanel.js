/* 全データ保持変数（categoryOrderで並び順を記憶します） */
let activeTasks = [], completedTasks = [], customCategories = [], collapsedCategories = {}, categoryOrder = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadAndRender(); setupSmartDropdownPanels(); setupDragAndDrop();
  setupCategoryDragAndDrop(); setupImageDropAndPaste(); setupInlineManualInput();
  setupSortButton(); setupBackupAndRestore(); setupCategoryManageButtons();
});

chrome.storage.onChanged.addListener((c) => {
  if (c.activeTasks || c.completedTasks || c.customCategories || c.categoryOrder) loadAndRender();
});

async function loadAndRender() {
  const d = await chrome.storage.local.get(['activeTasks', 'completedTasks', 'customCategories', 'collapsedCategories', 'categoryOrder']);
  activeTasks = d.activeTasks || []; completedTasks = d.completedTasks || [];
  customCategories = d.customCategories || []; collapsedCategories = d.collapsedCategories || {};
  categoryOrder = d.categoryOrder || [];
  render(); updateCategoryDropdown();
}

function getTodayString() {
  const n = new Date(); return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}/${String(n.getDate()).padStart(2,'0')}`;
}

function setupSmartDropdownPanels() {
  const bA = document.getElementById('btn-open-add-panel'), pA = document.getElementById('panel-add-sub');
  const bC = document.getElementById('btn-open-cat-panel'), pC = document.getElementById('panel-cat-sub');
  bA.addEventListener('click', () => { pC.classList.remove('open'); pA.classList.toggle('open'); });
  bC.addEventListener('click', () => { pA.classList.remove('open'); pC.classList.toggle('open'); });
}

function setupCategoryManageButtons() {
  const cBtn = document.getElementById('create-cat-btn'), dBtn = document.getElementById('delete-cat-btn');
  const dForm = document.getElementById('delete-cat-form'), dSelect = document.getElementById('delete-category-select');
  const dSub = document.getElementById('delete-cat-submit-btn'), dCan = document.getElementById('delete-cat-cancel-btn');
  const pCat = document.getElementById('panel-cat-sub');

  cBtn.addEventListener('click', async () => {
    pCat.classList.remove('open'); dForm.classList.remove('open');
    const n = prompt('新しいカテゴリ名を入力してください:'); if (!n || !n.trim()) return;
    const t = n.trim();
    if (!customCategories.includes(t)) {
      customCategories.push(t);
      if (!categoryOrder.includes(t)) categoryOrder.push(t);
      await chrome.storage.local.set({ customCategories, categoryOrder });
      render(); updateCategoryDropdown();
    } else alert('そのカテゴリは既に存在します。');
  });

  dBtn.addEventListener('click', () => {
    pCat.classList.remove('open'); dForm.classList.toggle('open');
    if (dForm.classList.contains('open')) {
      const all = new Set([...customCategories]);
      [...activeTasks, ...completedTasks].forEach(t => { if (t.categories) t.categories.forEach(c => { if (c && c !== '未分類') all.add(c); }); });
      dSelect.innerHTML = '<option value="">-- 削除するカテゴリを選択 --</option>';
      Array.from(all).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = `🗑️ ${c}`; dSelect.appendChild(o); });
    }
  });

  dCan.addEventListener('click', () => dForm.classList.remove('open'));
  dSub.addEventListener('click', async () => {
    const t = dSelect.value; if (!t) return alert('削除するカテゴリを選択してください。');
    if (confirm(`カテゴリ「${t}」を削除しますか？\n※チケットは削除されず「未分類」などに安全に残ります。`)) {
      customCategories = customCategories.filter(c => c !== t);
      categoryOrder = categoryOrder.filter(c => c !== t);
      activeTasks.forEach(x => { if (x.categories) x.categories = x.categories.filter(c => c !== t); });
      completedTasks.forEach(x => { if (x.categories) x.categories = x.categories.filter(c => c !== t); });
      await chrome.storage.local.set({ activeTasks, completedTasks, customCategories, categoryOrder });
      dForm.classList.remove('open'); render(); updateCategoryDropdown();
    }
  });
}

function updateCategoryDropdown() {
  const s = document.getElementById('manual-category-select'); if (!s) return;
  const set = new Set(customCategories);
  [...activeTasks, ...completedTasks].forEach(t => { if (t.categories) t.categories.forEach(c => { if (c && c !== '未分類') set.add(c); }); });
  s.innerHTML = '<option value="">-- 既存カテゴリから選択 (任意) --</option>';
  set.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = `📁 ${c}`; s.appendChild(o); });
}

function setupBackupAndRestore() {
  const ex = document.getElementById('export-btn'), im = document.getElementById('import-btn'), fi = document.getElementById('import-file-input');
  ex.addEventListener('click', () => {
    const b = new Blob([JSON.stringify({ activeTasks, completedTasks, customCategories, categoryOrder, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(b), a = document.createElement('a');
    a.href = u; a.download = `sidedeck_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(u);
  });
  im.addEventListener('click', () => fi.click());
  fi.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.activeTasks || d.completedTasks) {
          activeTasks = d.activeTasks || []; completedTasks = d.completedTasks || [];
          customCategories = d.customCategories || []; categoryOrder = d.categoryOrder || [];
          await chrome.storage.local.set({ activeTasks, completedTasks, customCategories, categoryOrder });
          alert('SideDeckのデータが正常に復元されました！');
        }
      } catch (err) { alert('ファイルの読み込みに失敗しました。'); }
    };
    r.readAsText(f);
  });
}

function setupSortButton() {
  document.getElementById('sort-due-btn').addEventListener('click', async () => {
    activeTasks.sort((a, b) => (!a.dueDate ? 1 : !b.dueDate ? -1 : new Date(a.dueDate) - new Date(b.dueDate)));
    await chrome.storage.local.set({ activeTasks });
  });
}

function setupInlineManualInput() {
  const m = document.getElementById('add-manual-trigger-btn'), p = document.getElementById('panel-add-sub'), f = document.getElementById('inline-form');
  const sub = document.getElementById('manual-subject-input'), tas = document.getElementById('manual-task-input');
  const sel = document.getElementById('manual-category-select'), inp = document.getElementById('manual-category-input');
  const btn = document.getElementById('manual-submit-btn'), can = document.getElementById('manual-cancel-btn');

  m.addEventListener('click', () => { p.classList.remove('open'); f.classList.toggle('open'); if (f.classList.contains('open')) sub.focus(); });
  can.addEventListener('click', () => { f.classList.remove('open'); sub.value = ''; tas.value = ''; sel.value = ''; inp.value = ''; });

  btn.addEventListener('click', async () => {
    const s = sub.value.trim(), t = tas.value.trim(), cS = sel.value, cI = inp.value.trim();
    const set = new Set(); if (cS) set.add(cS);
    if (cI) cI.split(/[,、]/).forEach(x => { const tr = x.trim(); if (tr) set.add(tr); });
    if (s || t) {
      activeTasks.unshift({ id: Date.now().toString(), subject: s || (t.length > 15 ? t.substring(0, 15) + '...' : t), title: t || s, categories: Array.from(set), source: '手動', createdAt: getTodayString(), dueDate: '', isImportant: false });
      await chrome.storage.local.set({ activeTasks }); sub.value = ''; tas.value = ''; sel.value = ''; inp.value = ''; f.classList.remove('open');
    }
  });
}

function createGoogleCalendarUrl(subject, details, dueDateStr) {
  if (!dueDateStr) return '#';
  const c = dueDateStr.replace(/-/g, ''), t = encodeURIComponent(`【タスク】${subject}`), d = encodeURIComponent(`SideDeckより追加されました。\n\n詳細本文:\n${details}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${t}&dates=${c}/${c}&details=${d}`;
}

/* 💡 「未分類」最上部固定 ＋ ドラッグ並べ替え ＋ 完了履歴カテゴリ別折りたたみ描画 */
function render() {
  const tc = document.getElementById('task-container'), hc = document.getElementById('history-container'), count = document.getElementById('task-counter');
  if (!tc || !hc) return;
  tc.innerHTML = ''; hc.innerHTML = '';

  /* 未完了タスクのグループ化 */
  const groups = {}; customCategories.forEach(c => groups[c] = []);
  activeTasks.forEach(t => { const cats = (t.categories && t.categories.length > 0) ? t.categories : ['未分類']; cats.forEach(c => { if (!groups[c]) groups[c] = []; groups[c].push(t); }); });

  /* カテゴリの並び順（未分類は一番上固定） */
  const allCatNames = Object.keys(groups);
  const orderedCats = ['未分類'];

  /* 保存されている並び順に従って追加 */
  categoryOrder.forEach(c => { if (c !== '未分類' && allCatNames.includes(c) && !orderedCats.includes(c)) orderedCats.push(c); });
  /* 残りの新規カテゴリを追加 */
  allCatNames.forEach(c => { if (!orderedCats.includes(c)) orderedCats.push(c); });

  orderedCats.forEach(cName => {
    if (!groups[cName]) return;
    const sec = document.createElement('div'); sec.className = 'category-section'; sec.dataset.cat = cName;
    const isCol = collapsedCategories[cName] || false;
    const isFixed = (cName === '未分類');

    const head = document.createElement('div');
    head.className = `category-header ${isFixed ? 'fixed-cat' : ''}`;
    if (!isFixed) sec.draggable = true; /* 💡 未分類以外はドラッグ可能 */

    head.innerHTML = `<span>📁 ${cName} (${groups[cName].length}件)</span><span>${isCol ? '► 開く' : '▼ 閉じる'}</span>`;
    const cont = document.createElement('div'); cont.className = `category-content ${isCol ? 'collapsed' : ''}`;

    head.addEventListener('click', async (e) => {
      if (sec.classList.contains('dragging-cat')) return;
      collapsedCategories[cName] = !collapsedCategories[cName];
      await chrome.storage.local.set({ collapsedCategories }); render();
    });

    groups[cName].forEach(task => { cont.appendChild(createCardElement(task, activeTasks.findIndex(t => t.id === task.id), false)); });
    sec.appendChild(head); sec.appendChild(cont); tc.appendChild(sec);
  });

  /* 💡 完了履歴もカテゴリごとにグループ化して折りたたみ描画 */
  const historyGroups = {};
  completedTasks.forEach(t => {
    const cats = (t.categories && t.categories.length > 0) ? t.categories : ['未分類'];
    cats.forEach(c => { if (!historyGroups[c]) historyGroups[c] = []; historyGroups[c].push(t); });
  });

  const historyCats = Object.keys(historyGroups).sort((a, b) => a === '未分類' ? -1 : b === '未分類' ? 1 : a.localeCompare(b, 'ja'));

  historyCats.forEach(cName => {
    const hSec = document.createElement('div'); hSec.className = 'category-section';
    const isCol = collapsedCategories[`hist_${cName}`] || false;
    const head = document.createElement('div'); head.className = 'category-header fixed-cat';
    head.innerHTML = `<span>📁 [履歴] ${cName} (${historyGroups[cName].length}件)</span><span>${isCol ? '► 開く' : '▼ 閉じる'}</span>`;
    const cont = document.createElement('div'); cont.className = `category-content ${isCol ? 'collapsed' : ''}`;

    head.addEventListener('click', async () => {
      collapsedCategories[`hist_${cName}`] = !collapsedCategories[`hist_${cName}`];
      await chrome.storage.local.set({ collapsedCategories }); render();
    });

    historyGroups[cName].forEach(task => {
      cont.appendChild(createCardElement(task, completedTasks.findIndex(t => t.id === task.id), true));
    });

    hSec.appendChild(head); hSec.appendChild(cont); hc.appendChild(hSec);
  });

  if (count) count.innerText = `未完了: ${activeTasks.length}件`;
  document.getElementById('history-toggle-btn').innerText = `完了履歴(${completedTasks.length}件) v`;
}

/* 💡 カテゴリ枠自体のドラッグ＆ドロップ並べ替え処理 */
function setupCategoryDragAndDrop() {
  const container = document.getElementById('task-container');
  let draggedCat = null;

  container.addEventListener('dragstart', (e) => {
    const sec = e.target.closest('.category-section');
    if (sec && sec.dataset.cat !== '未分類') {
      draggedCat = sec;
      sec.classList.add('dragging-cat');
    }
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedCat) return;
    const sections = [...container.querySelectorAll('.category-section:not(.dragging-cat)')];
    const afterSec = sections.reduce((closest, child) => {
      if (child.dataset.cat === '未分類') return closest; /* 未分類の上には並べ替え不可 */
      const box = child.getBoundingClientRect(), offset = e.clientY - box.top - box.height / 2;
      return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;

    afterSec == null ? container.appendChild(draggedCat) : container.insertBefore(draggedCat, afterSec);
  });

  container.addEventListener('dragend', async () => {
    if (draggedCat) {
      draggedCat.classList.remove('dragging-cat');
      const newOrder = [];
      [...container.querySelectorAll('.category-section')].forEach(sec => {
        const c = sec.dataset.cat;
        if (c && c !== '未分類' && !newOrder.includes(c)) newOrder.push(c);
      });
      categoryOrder = newOrder;
      await chrome.storage.local.set({ categoryOrder });
      draggedCat = null;
    }
  });
}

async function processClipboardItems(cbd) {
  let text = '', img = null;
  if (cbd.items) {
    for (let i = 0; i < cbd.items.length; i++) {
      if (cbd.items[i].type.indexOf('image') !== -1) img = cbd.items[i].getAsFile();
      else if (cbd.items[i].type === 'text/plain') cbd.items[i].getAsString(s => text = s);
    }
  }
  if (!text && cbd.getData) text = cbd.getData('text/plain');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let src = 'Web';
  if (tab && tab.url) {
    if (tab.url.includes('mail.google.com')) src = 'Gmail';
    else if (tab.url.includes('teams.microsoft.com')) src = 'Teams';
    else if (tab.url.includes('chat.google.com')) src = 'GoogleChat';
    else { try { src = new URL(tab.url).hostname.replace('www.', ''); } catch (e) { src = 'Web'; } }
  }

  const body = text.trim(), line = body.split('\n')[0], subj = line.length > 20 ? line.substring(0, 20) + '...' : line, today = getTodayString();
  if (img) {
    const r = new FileReader();
    r.onload = async (e) => {
      const url = e.target.result;
      if (!body && typeof Tesseract !== 'undefined') {
        try { const w = await Tesseract.createWorker('jpn+eng'), ret = await w.recognize(img); await w.terminate(); text = ret.data.text.trim(); } catch (err) {}
      }
      activeTasks.unshift({ id: Date.now().toString(), subject: subj || '【貼り付け画像】', title: body || '【画像タスク】', imageUrl: url, categories: [], source: src, createdAt: today, dueDate: '', isImportant: false });
      await chrome.storage.local.set({ activeTasks });
    };
    r.readAsDataURL(img);
  } else if (body !== '') {
    activeTasks.unshift({ id: Date.now().toString(), subject: subj, title: body, categories: [], source: src, createdAt: today, dueDate: '', isImportant: false });
    await chrome.storage.local.set({ activeTasks });
  }
}

function setupImageDropAndPaste() {
  const zone = document.getElementById('image-drop-zone');
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('dragover'); processClipboardItems(e.dataTransfer); });
  document.addEventListener('paste', (e) => processClipboardItems(e.clipboardData));
}

document.getElementById('paste-add-btn').addEventListener('click', async () => {
  document.getElementById('panel-add-sub').classList.remove('open');
  try {
    const text = await navigator.clipboard.readText(); if (!text || !text.trim()) return alert('クリップボードに文字がありません。');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let src = 'Web';
    if (tab && tab.url) {
      if (tab.url.includes('mail.google.com')) src = 'Gmail';
      else if (tab.url.includes('teams.microsoft.com')) src = 'Teams';
      else if (tab.url.includes('chat.google.com')) src = 'GoogleChat';
    }
    const body = text.trim(), line = body.split('\n')[0], subj = line.length > 20 ? line.substring(0, 20) + '...' : line;
    activeTasks.unshift({ id: Date.now().toString(), subject: subj, title: body, categories: [], source: src, createdAt: getTodayString(), dueDate: '', isImportant: false });
    await chrome.storage.local.set({ activeTasks });
  } catch (err) { alert('「Ctrl+V」キーで画面に貼り付けてみてください！'); }
});

function convertUrlsToLinks(text) {
  if (!text) return '';
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/(https?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

function createDueDateHtml(dStr) {
  if (!dStr) return '';
  const today = new Date(); today.setHours(0,0,0,0); const due = new Date(dStr); due.setHours(0,0,0,0);
  let cls = 'due-badge', txt = `📅 締切: ${dStr}`;
  if (due.getTime() === today.getTime()) { cls += ' today'; txt = `📅 今日が締切！ (${dStr})`; }
  else if (due.getTime() < today.getTime()) { cls += ' overdue'; txt = `🚨 期限切れ！ (${dStr})`; }
  return `<div class="${cls}">${txt}</div>`;
}

function createCardElement(task, index, isCompleted) {
  const card = document.createElement('div'); card.className = `task-card ${task.isImportant ? 'important' : ''} ${isCompleted ? 'completed-card' : ''}`;
  if (!isCompleted) { card.draggable = true; card.dataset.id = task.id || index.toString(); }

  let bCls = 'badge'; if (task.source === 'Gmail') bCls += ' gmail'; if (task.source === 'Teams') bCls += ' teams'; if (task.source === 'GoogleChat') bCls += ' chat';
  const fmt = convertUrlsToLinks(task.title), isLong = task.title.length > 80 || task.title.split('\n').length > 3;
  const cBadge = (task.categories && task.categories.length > 0) ? task.categories.map(c => `<span class="cat-tag">🏷️ ${c}</span>`).join('') : `<span class="cat-tag" style="opacity:0.6;">🏷️ カテゴリなし</span>`;
  const gcal = (task.dueDate && !isCompleted) ? `<a href="${createGoogleCalendarUrl(task.subject||task.title.substring(0,15), task.title, task.dueDate)}" target="_blank" class="gcal-btn">⚡ カレンダーに登録</a>` : '';

  card.innerHTML = `
    <div class="row-1"><span class="${bCls}">${task.source}</span><div class="cat-tags-wrap" title="ダブルクリックでカテゴリ複数変更">${cBadge}</div>${task.createdAt?`<span class="time-badge">📝登録:${task.createdAt}</span>`:''}${isCompleted&&task.completedAt?`<span class="time-badge completed">✅完了:${task.completedAt}</span>`:''}</div>
    <div class="row-2"><div class="action-group">${!isCompleted?`<button class="icon-btn star-btn">${task.isImportant?'[★重要]':'[☆普通]'}</button><button class="icon-btn date-btn">[📅締切]</button><input type="date" class="date-input-hidden" value="${task.dueDate||''}">`:''}<button class="icon-btn copy-btn">[コピー]</button>${!isCompleted?`<button class="icon-btn action-btn">[完了]</button>`:`<button class="icon-btn action-btn">[復元]</button>`}<button class="icon-btn danger-btn delete-direct-btn">[削除]</button></div><div>${createDueDateHtml(task.dueDate)}${gcal}</div></div>
    <div class="row-3"><div class="task-subject" contenteditable="false" title="ダブルクリックで編集">${task.subject||'（件名なし）'}</div></div>
    <div class="row-4"><div class="task-title-wrap"><div class="task-title ${isLong?'collapsed':''}" contenteditable="false" title="ダブルクリックで編集">${fmt}</div>${isLong?'<button class="toggle-expand-btn">▼ 続きを読む</button>':''}</div>${task.imageUrl?`<img src="${task.imageUrl}" class="task-image-preview" />`:''}</div>
  `;

  if (task.imageUrl) card.querySelector('.task-image-preview').addEventListener('click', () => { const w = window.open(""); w.document.write(`<img src="${task.imageUrl}" style="max-width:100%;" />`); });

  const catWrap = card.querySelector('.cat-tags-wrap');
  catWrap.addEventListener('dblclick', () => {
    const allSet = new Set(customCategories); [...activeTasks, ...completedTasks].forEach(t => { if (t.categories) t.categories.forEach(c => { if (c && c !== '未分類') allSet.add(c); }); });
    const catList = Array.from(allSet), targetArr = isCompleted ? completedTasks : activeTasks, curCats = targetArr[index].categories || [];
    const multiBox = document.createElement('div'); multiBox.className = 'card-cat-multi-box';

    let listHtml = '<div class="card-cat-checkbox-list">';
    catList.forEach(c => { listHtml += `<label class="card-cat-checkbox-item"><input type="checkbox" value="${c}" ${curCats.includes(c)?'checked':''}><span>📁 ${c}</span></label>`; });
    listHtml += '</div>';

    multiBox.innerHTML = `<div style="font-weight:bold; margin-bottom:4px; color:#1e40af;">🏷️ カテゴリ選択 (複数可)</div>${listHtml}<input type="text" id="multi-box-new-input" placeholder="新規カテゴリ手入力 (例: 仕事, 買物)" style="width:90%; padding:4px; font-size:10px; margin-bottom:6px; border:1px solid #cbd5e1; border-radius:4px;"><div style="display:flex; justify-content:flex-end; gap:4px;"><button id="multi-box-save-btn" class="icon-btn" style="background:#2563eb; color:#fff; font-weight:bold;">保存</button><button id="multi-box-cancel-btn" class="icon-btn">キャンセル</button></div>`;
    catWrap.innerHTML = ''; catWrap.appendChild(multiBox);

    multiBox.querySelector('#multi-box-save-btn').addEventListener('click', async () => {
      const selected = Array.from(multiBox.querySelectorAll('.card-cat-checkbox-list input[type="checkbox"]:checked')).map(cb => cb.value);
      const raw = multiBox.querySelector('#multi-box-new-input').value.trim();
      if (raw) raw.split(/[,、]/).forEach(c => { const tr = c.trim(); if (tr && !selected.includes(tr)) selected.push(tr); });
      if (isCompleted) { completedTasks[index].categories = selected; await chrome.storage.local.set({ completedTasks }); }
      else { activeTasks[index].categories = selected; await chrome.storage.local.set({ activeTasks }); }
      render();
    });
    multiBox.querySelector('#multi-box-cancel-btn').addEventListener('click', () => render());
  });

  if (!isCompleted) {
    const dBtn = card.querySelector('.date-btn'), dInp = card.querySelector('.date-input-hidden');
    dBtn.addEventListener('click', () => { dInp.showPicker ? dInp.showPicker() : dInp.click(); });
    dInp.addEventListener('change', async (e) => { activeTasks[index].dueDate = e.target.value; await chrome.storage.local.set({ activeTasks }); });

    const subDiv = card.querySelector('.task-subject'), titDiv = card.querySelector('.task-title');
    const save = async () => {
      if (subDiv.isContentEditable || titDiv.isContentEditable) {
        subDiv.contentEditable = "false"; titDiv.contentEditable = "false";
        activeTasks[index].subject = subDiv.innerText; activeTasks[index].title = titDiv.innerText;
        await chrome.storage.local.set({ activeTasks });
      }
    };
    const start = (el) => { el.contentEditable = "true"; el.focus(); };
    subDiv.addEventListener('dblclick', () => start(subDiv)); titDiv.addEventListener('dblclick', () => start(titDiv));
    subDiv.addEventListener('blur', () => setTimeout(save, 100)); titDiv.addEventListener('blur', () => setTimeout(save, 100));
  }

  if (isLong) {
    const btn = card.querySelector('.toggle-expand-btn'), tit = card.querySelector('.task-title');
    btn.addEventListener('click', () => { tit.classList.toggle('collapsed'); btn.innerText = tit.classList.contains('collapsed') ? '▼ 続きを読む' : '▲ 閉じる'; });
  }

  if (!isCompleted) card.querySelector('.star-btn').addEventListener('click', async () => { activeTasks[index].isImportant = !activeTasks[index].isImportant; await chrome.storage.local.set({ activeTasks }); });
  card.querySelector('.copy-btn').addEventListener('click', () => { navigator.clipboard.writeText(task.title); alert('タスク本文をコピーしました！'); });
  card.querySelector('.action-btn').addEventListener('click', async () => {
    if (isCompleted) { const [r] = completedTasks.splice(index, 1); delete r.completedAt; activeTasks.push(r); }
    else { const [c] = activeTasks.splice(index, 1); c.completedAt = getTodayString(); completedTasks.push(c); }
    await chrome.storage.local.set({ activeTasks, completedTasks });
  });
  card.querySelector('.delete-direct-btn').addEventListener('click', async () => {
    if (confirm('このタスクを削除しますか？')) {
      if (isCompleted) { completedTasks.splice(index, 1); await chrome.storage.local.set({ completedTasks }); }
      else { activeTasks.splice(index, 1); await chrome.storage.local.set({ activeTasks }); }
    }
  });
  return card;
}

function setupDragAndDrop() {
  const container = document.getElementById('task-container'); let dragged = null;
  container.addEventListener('dragstart', (e) => {
    if (e.target.closest('.category-header')) return; /* カテゴリ移動時はカード移動を無視 */
    const c = e.target.closest('.task-card'); if (c) { dragged = c; c.classList.add('dragging'); }
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault(); if (!dragged) return;
    const els = [...container.querySelectorAll('.task-card:not(.dragging)')];
    const after = els.reduce((closest, child) => { const box = child.getBoundingClientRect(), offset = e.clientY - box.top - box.height / 2; return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest; }, { offset: Number.NEGATIVE_INFINITY }).element;
    after == null ? container.appendChild(dragged) : container.insertBefore(dragged, after);
  });
  container.addEventListener('dragend', async (e) => {
    const c = e.target.closest('.task-card');
    if (c) {
      c.classList.remove('dragging');
      const newActive = [];
      [...container.querySelectorAll('.task-card')].forEach(el => {
        const found = activeTasks.find(t => (t.id || activeTasks.indexOf(t).toString()) === el.dataset.id);
        if (found && !newActive.includes(found)) newActive.push(found);
      });
      activeTasks = newActive; await chrome.storage.local.set({ activeTasks }); dragged = null;
    }
  });
}

document.getElementById('history-toggle-btn').addEventListener('click', () => document.getElementById('history-container').classList.toggle('open'));
document.getElementById('clear-history-btn').addEventListener('click', async () => {
  if (completedTasks.length === 0) return alert('削除する履歴がありません。');
  if (confirm('完了履歴をすべて完全削除しますか？(元に戻せません)')) { completedTasks = []; await chrome.storage.local.set({ completedTasks }); }
});