(() => {
  'use strict';

  const CATS = {
    food:      { abbr: 'F', name: '餐飲', color: '#333' },
    transport: { abbr: 'T', name: '交通', color: '#555' },
    stay:      { abbr: 'S', name: '住宿', color: '#444' },
    shopping:  { abbr: 'B', name: '購物', color: '#666' },
    ticket:    { abbr: 'A', name: '門票', color: '#777' },
    other:     { abbr: 'O', name: '其他', color: '#999' },
  };

  const MEMBERS = {
    dad: { name: '爸爸', color: '#222' },
    mom: { name: '媽媽', color: '#555' },
    sis: { name: '姐姐', color: '#777' },
    bro: { name: '弟弟', color: '#999' },
  };

  const PAYS = {
    cash: { name: '現金', color: '#444' },
    card: { name: '信用卡', color: '#888' },
  };

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  const defaultSettings = {
    rate: 0.22,
    tripStart: '2026-06-24',
    tripEnd: '2026-07-01',
  };

  let settings = loadJSON('te_settings', defaultSettings);
  let expenses = loadJSON('te_expenses', []);
  let currentDay = null;
  let selectedCat = 'food';
  let selectedCurrency = 'JPY';
  let selectedMember = 'dad';
  let selectedPay = 'cash';
  let editingId = null;
  let pendingPhoto = null;
  let editPendingPhoto = undefined; // undefined = no change, null = remove, string = new

  function compressImage(file, maxW = 800) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxW / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function showPreview(container, src) {
    if (src) {
      container.innerHTML = `<img src="${src}" alt=""><button class="photo-remove" type="button">✕</button>`;
      container.querySelector('.photo-remove').addEventListener('click', (ev) => {
        ev.stopPropagation();
        container.innerHTML = '';
        if (container.id === 'photoPreview') pendingPhoto = null;
        else editPendingPhoto = null;
      });
    } else {
      container.innerHTML = '';
    }
  }

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }

  function saveExpenses() { localStorage.setItem('te_expenses', JSON.stringify(expenses)); }
  function saveSettings() { localStorage.setItem('te_settings', JSON.stringify(settings)); }

  function toTWD(amount, currency) {
    return currency === 'TWD' ? amount : amount * settings.rate;
  }

  function toJPY(amount, currency) {
    return currency === 'JPY' ? amount : amount / settings.rate;
  }

  function fmt(n) {
    return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
  }

  function getTripDays() {
    const start = new Date(settings.tripStart);
    const end = new Date(settings.tripEnd);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }

  function fmtDay(ds) {
    const d = new Date(ds);
    return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  }

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  async function fetchRate() {
    const cache = loadJSON('te_rate_cache', null);
    if (cache && cache.date === today()) {
      settings.rate = cache.rate;
      saveSettings();
      return;
    }

    try {
      const res = await fetch('https://open.er-api.com/v6/latest/JPY');
      const data = await res.json();
      if (data.result === 'success' && data.rates?.TWD) {
        settings.rate = parseFloat(data.rates.TWD.toFixed(4));
        saveSettings();
        localStorage.setItem('te_rate_cache', JSON.stringify({
          rate: settings.rate,
          date: today(),
        }));
        updateBudget();
        updateHint();
        toast(`匯率已更新 1 JPY = ${settings.rate} TWD`);
      }
    } catch {
      // offline — keep last saved rate
    }
  }

  function init() {
    setupTabs();
    setupAdd();
    setupList();
    setupSettings();
    setupModal();
    initDate();
    updateBudget();
    renderList();
    fetchRate();
  }

  function initDate() {
    const t = today();
    const days = getTripDays();
    currentDay = days.includes(t) ? t : days[0];
    $('#inputDate').value = currentDay || t;
  }

  function setupTabs() {
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        $$('.view').forEach(v => v.classList.remove('active'));
        $(`#view-${tab.dataset.tab}`).classList.add('active');
        if (tab.dataset.tab === 'stats') renderStats();
        if (tab.dataset.tab === 'list') renderList();
        if (tab.dataset.tab === 'settings') loadSettingsUI();
      });
    });
  }

  function setupAdd() {
    $$('#currencyToggle .currency-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#currencyToggle .currency-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCurrency = btn.dataset.currency;
        updateHint();
      });
    });

    $$('#memberToggle .member-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#memberToggle .member-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedMember = btn.dataset.member;
      });
    });

    $$('#view-add .cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#view-add .cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCat = btn.dataset.cat;
      });
    });

    $$('#payToggle .pay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#payToggle .pay-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPay = btn.dataset.pay;
      });
    });

    $('#btnPhoto').addEventListener('click', () => $('#inputPhoto').click());
    $('#inputPhoto').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      pendingPhoto = await compressImage(file);
      showPreview($('#photoPreview'), pendingPhoto);
      ev.target.value = '';
    });

    $('#inputAmount').addEventListener('input', updateHint);
    $('#btnAdd').addEventListener('click', addExpense);
  }

  function updateHint() {
    const v = parseFloat($('#inputAmount').value);
    const el = $('#conversionHint');
    if (!v || v <= 0) { el.textContent = ''; return; }
    el.textContent = selectedCurrency === 'JPY'
      ? `≈ NT$ ${fmt(v * settings.rate)}`
      : `≈ ¥ ${fmt(v / settings.rate)}`;
  }

  function addExpense() {
    const amount = parseFloat($('#inputAmount').value);
    if (!amount || amount <= 0) { toast('請輸入金額'); return; }

    const entry = {
      id: genId(),
      date: $('#inputDate').value || today(),
      amount,
      currency: selectedCurrency,
      category: selectedCat,
      member: selectedMember,
      pay: selectedPay,
      note: $('#inputNote').value.trim(),
      createdAt: Date.now(),
    };
    if (pendingPhoto) entry.photo = pendingPhoto;

    expenses.push(entry);
    saveExpenses();
    $('#inputAmount').value = '';
    $('#inputNote').value = '';
    $('#conversionHint').textContent = '';
    pendingPhoto = null;
    showPreview($('#photoPreview'), null);
    $('#inputAmount').focus();
    updateBudget();
    toast('已記錄');
  }

  function updateBudget() {
    const total = expenses.reduce((s, e) => s + toTWD(e.amount, e.currency), 0);
    $('#budgetSpent').textContent = `NT$ ${fmt(total)}`;
  }

  function setupList() {
    $('#dayPrev').addEventListener('click', () => navDay(-1));
    $('#dayNext').addEventListener('click', () => navDay(1));
    $('#dayAll').addEventListener('click', toggleAll);
  }

  function navDay(dir) {
    const days = getTripDays();
    if (currentDay === null) {
      currentDay = dir > 0 ? days[0] : days[days.length - 1];
    } else {
      const i = days.indexOf(currentDay) + dir;
      if (i >= 0 && i < days.length) currentDay = days[i];
    }
    $('#dayAll').classList.remove('active');
    renderList();
  }

  function toggleAll() {
    if (currentDay === null) {
      currentDay = getTripDays()[0];
      $('#dayAll').classList.remove('active');
    } else {
      currentDay = null;
      $('#dayAll').classList.add('active');
    }
    renderList();
  }

  function renderList() {
    const list = $('#expenseList');
    const empty = $('#emptyState');

    let filtered;
    if (currentDay === null) {
      $('#dayLabel').textContent = '全部記錄';
      filtered = [...expenses].sort((a, b) => b.createdAt - a.createdAt);
    } else {
      $('#dayLabel').textContent = fmtDay(currentDay);
      filtered = expenses.filter(e => e.date === currentDay).sort((a, b) => b.createdAt - a.createdAt);
    }

    if (!filtered.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      $('#dayTotal').textContent = '';
      return;
    }

    empty.style.display = 'none';
    const total = filtered.reduce((s, e) => s + toTWD(e.amount, e.currency), 0);
    $('#dayTotal').textContent = `${filtered.length} 筆 · NT$ ${fmt(total)}`;

    list.innerHTML = filtered.map(e => {
      const c = CATS[e.category] || CATS.other;
      const m = MEMBERS[e.member] || MEMBERS.dad;
      const p = PAYS[e.pay] || PAYS.cash;
      const pri = e.currency === 'JPY' ? `¥ ${fmt(e.amount)}` : `NT$ ${fmt(e.amount)}`;
      const sec = e.currency === 'JPY'
        ? `≈ NT$ ${fmt(toTWD(e.amount, e.currency))}`
        : `≈ ¥ ${fmt(toJPY(e.amount, e.currency))}`;
      const dateTag = currentDay === null ? ` · ${e.date.slice(5)}` : '';

      const thumb = e.photo ? `<img class="expense-thumb" src="${e.photo}" data-photo="${e.id}" alt="">` : '';

      return `<div class="expense-item" data-id="${e.id}">
        <span class="expense-dot" style="background:${c.color}"></span>
        <div class="expense-info">
          <div class="expense-cat">${c.name}${dateTag}<span class="expense-member" style="color:${m.color}">${m.name}</span><span class="expense-pay">${p.name}</span></div>
          ${e.note ? `<div class="expense-note">${esc(e.note)}</div>` : ''}
        </div>
        ${thumb}
        <div class="expense-amount">
          <div class="expense-primary">${pri}</div>
          <div class="expense-secondary">${sec}</div>
        </div>
        <button class="expense-delete" data-del="${e.id}">✕</button>
      </div>`;
    }).join('');

    list.querySelectorAll('.expense-thumb').forEach(img => {
      img.addEventListener('click', ev => {
        ev.stopPropagation();
        const e = expenses.find(x => x.id === img.dataset.photo);
        if (e?.photo) {
          $('#photoFull').src = e.photo;
          $('#photoViewer').classList.add('show');
        }
      });
    });

    list.querySelectorAll('.expense-item').forEach(item => {
      item.addEventListener('click', ev => {
        if (ev.target.closest('.expense-delete') || ev.target.closest('.expense-thumb')) return;
        openEdit(item.dataset.id);
      });
    });

    list.querySelectorAll('.expense-delete').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        delExpense(btn.dataset.del);
      });
    });
  }

  function delExpense(id) {
    if (!confirm('確定刪除？')) return;
    expenses = expenses.filter(e => e.id !== id);
    saveExpenses();
    updateBudget();
    renderList();
    toast('已刪除');
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setupModal() {
    $('#editCancel').addEventListener('click', closeEdit);
    $('#editConfirm').addEventListener('click', saveEdit);
    $('#editModal').addEventListener('click', ev => {
      if (ev.target === $('#editModal')) closeEdit();
    });

    $('#btnEditPhoto').addEventListener('click', () => $('#editPhoto').click());
    $('#editPhoto').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      editPendingPhoto = await compressImage(file);
      showPreview($('#editPhotoPreview'), editPendingPhoto);
      ev.target.value = '';
    });

    $('#photoViewer').addEventListener('click', () => {
      $('#photoViewer').classList.remove('show');
      $('#photoFull').src = '';
    });

    $$('[data-edit-currency]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('[data-edit-currency]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    $$('[data-edit-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('[data-edit-cat]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    $$('[data-edit-member]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('[data-edit-member]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    $$('[data-edit-pay]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('[data-edit-pay]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function openEdit(id) {
    const e = expenses.find(x => x.id === id);
    if (!e) return;
    editingId = id;
    $('#editAmount').value = e.amount;
    $('#editNote').value = e.note;
    $('#editDate').value = e.date;
    $$('[data-edit-currency]').forEach(b => b.classList.toggle('active', b.dataset.editCurrency === e.currency));
    $$('[data-edit-cat]').forEach(b => b.classList.toggle('active', b.dataset.editCat === e.category));
    $$('[data-edit-member]').forEach(b => b.classList.toggle('active', b.dataset.editMember === (e.member || 'dad')));
    $$('[data-edit-pay]').forEach(b => b.classList.toggle('active', b.dataset.editPay === (e.pay || 'cash')));
    editPendingPhoto = undefined;
    showPreview($('#editPhotoPreview'), e.photo || null);
    $('#editModal').classList.add('show');
  }

  function closeEdit() {
    $('#editModal').classList.remove('show');
    editingId = null;
  }

  function saveEdit() {
    const e = expenses.find(x => x.id === editingId);
    if (!e) return;
    const amount = parseFloat($('#editAmount').value);
    if (!amount || amount <= 0) { toast('請輸入金額'); return; }

    e.amount = amount;
    e.note = $('#editNote').value.trim();
    e.date = $('#editDate').value;

    const cBtn = document.querySelector('[data-edit-currency].active');
    if (cBtn) e.currency = cBtn.dataset.editCurrency;
    const catBtn = document.querySelector('[data-edit-cat].active');
    if (catBtn) e.category = catBtn.dataset.editCat;
    const mBtn = document.querySelector('[data-edit-member].active');
    if (mBtn) e.member = mBtn.dataset.editMember;
    const pBtn = document.querySelector('[data-edit-pay].active');
    if (pBtn) e.pay = pBtn.dataset.editPay;

    if (editPendingPhoto !== undefined) {
      if (editPendingPhoto) e.photo = editPendingPhoto;
      else delete e.photo;
    }

    saveExpenses();
    updateBudget();
    renderList();
    closeEdit();
    toast('已更新');
  }

  function renderMemberPie(memTotals, total) {
    const pie = $('#memberPie');
    const legend = $('#memberLegend');

    if (!total) {
      pie.innerHTML = '';
      legend.innerHTML = '';
      return;
    }

    const size = 160;
    const cx = size / 2, cy = size / 2, r = 60;
    const entries = Object.entries(MEMBERS).filter(([k]) => memTotals[k]);
    let cumAngle = -Math.PI / 2;

    const paths = entries.map(([k, m]) => {
      const v = memTotals[k] || 0;
      const angle = (v / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(cumAngle);
      const y1 = cy + r * Math.sin(cumAngle);
      cumAngle += angle;
      const x2 = cx + r * Math.cos(cumAngle);
      const y2 = cy + r * Math.sin(cumAngle);
      const large = angle > Math.PI ? 1 : 0;
      const gray = m.color;

      if (entries.length === 1) {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${gray}" opacity="0.7"/>`;
      }
      return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${gray}" opacity="0.7" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>`;
    });

    pie.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths.join('')}<circle cx="${cx}" cy="${cy}" r="32" fill="var(--bg)"/></svg>`;

    legend.innerHTML = entries.map(([k, m]) => {
      const v = memTotals[k] || 0;
      const pct = Math.round((v / total) * 100);
      return `<div class="pie-legend-item">
        <span class="pie-legend-dot" style="background:${m.color}"></span>
        <span class="pie-legend-name">${m.name}</span>
        <span class="pie-legend-pct">${pct}%</span>
        <span class="pie-legend-val">NT$ ${fmt(v)}</span>
      </div>`;
    }).join('');
  }

  function renderStats() {
    const totalTWD = expenses.reduce((s, e) => s + toTWD(e.amount, e.currency), 0);
    const totalJPY = expenses.reduce((s, e) => s + toJPY(e.amount, e.currency), 0);
    const daysUsed = new Set(expenses.map(e => e.date)).size || 1;

    $('#statTotalTWD').textContent = `NT$ ${fmt(totalTWD)}`;
    $('#statTotalJPY').textContent = `¥ ${fmt(totalJPY)}`;
    $('#statDailyAvg').textContent = `NT$ ${fmt(totalTWD / daysUsed)}`;
    $('#statCount').textContent = expenses.length;

    // Payment bars
    const payTotals = {};
    expenses.forEach(e => {
      const pk = e.pay || 'cash';
      payTotals[pk] = (payTotals[pk] || 0) + toTWD(e.amount, e.currency);
    });
    const maxPay = Math.max(...Object.values(payTotals), 1);

    $('#payBars').innerHTML = Object.entries(PAYS)
      .filter(([k]) => payTotals[k])
      .sort((a, b) => (payTotals[b[0]] || 0) - (payTotals[a[0]] || 0))
      .map(([k, p]) => {
        const v = payTotals[k] || 0;
        return `<div class="cat-bar-row">
          <span class="cat-bar-dot" style="background:${p.color}"></span>
          <div class="cat-bar-info">
            <div class="cat-bar-top">
              <span class="cat-bar-name">${p.name}</span>
              <span class="cat-bar-amount">NT$ ${fmt(v)}</span>
            </div>
            <div class="cat-bar-track">
              <div class="cat-bar-fill" style="width:${(v / maxPay) * 100}%;background:${p.color}"></div>
            </div>
          </div>
        </div>`;
      }).join('') || '<p style="color:var(--text3);font-size:0.82rem">尚無資料</p>';

    // Member bars
    const memTotals = {};
    expenses.forEach(e => {
      const mk = e.member || 'dad';
      memTotals[mk] = (memTotals[mk] || 0) + toTWD(e.amount, e.currency);
    });
    const maxMem = Math.max(...Object.values(memTotals), 1);

    $('#memberBars').innerHTML = Object.entries(MEMBERS)
      .filter(([k]) => memTotals[k])
      .sort((a, b) => (memTotals[b[0]] || 0) - (memTotals[a[0]] || 0))
      .map(([k, m]) => {
        const v = memTotals[k] || 0;
        return `<div class="cat-bar-row">
          <span class="cat-bar-dot" style="background:${m.color}"></span>
          <div class="cat-bar-info">
            <div class="cat-bar-top">
              <span class="cat-bar-name">${m.name}</span>
              <span class="cat-bar-amount">NT$ ${fmt(v)}</span>
            </div>
            <div class="cat-bar-track">
              <div class="cat-bar-fill" style="width:${(v / maxMem) * 100}%;background:${m.color}"></div>
            </div>
          </div>
        </div>`;
      }).join('') || '<p style="color:var(--text3);font-size:0.82rem">尚無資料</p>';

    // Member pie chart (SVG)
    renderMemberPie(memTotals, totalTWD);

    const catTotals = {};
    expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + toTWD(e.amount, e.currency); });
    const maxCat = Math.max(...Object.values(catTotals), 1);

    $('#categoryBars').innerHTML = Object.entries(CATS)
      .filter(([k]) => catTotals[k])
      .sort((a, b) => (catTotals[b[0]] || 0) - (catTotals[a[0]] || 0))
      .map(([k, c]) => {
        const v = catTotals[k] || 0;
        return `<div class="cat-bar-row">
          <span class="cat-bar-dot" style="background:${c.color}"></span>
          <div class="cat-bar-info">
            <div class="cat-bar-top">
              <span class="cat-bar-name">${c.name}</span>
              <span class="cat-bar-amount">NT$ ${fmt(v)}</span>
            </div>
            <div class="cat-bar-track">
              <div class="cat-bar-fill" style="width:${(v / maxCat) * 100}%;background:${c.color}"></div>
            </div>
          </div>
        </div>`;
      }).join('') || '<p style="color:var(--text3);font-size:0.82rem">尚無資料</p>';

    const days = getTripDays();
    const dayTotals = {};
    expenses.forEach(e => { dayTotals[e.date] = (dayTotals[e.date] || 0) + toTWD(e.amount, e.currency); });
    const maxDay = Math.max(...days.map(d => dayTotals[d] || 0), 1);

    $('#dailyChart').innerHTML = days.map(d => {
      const v = dayTotals[d] || 0;
      return `<div class="chart-col">
        <div class="chart-value">${v > 0 ? fmt(v) : ''}</div>
        <div class="chart-bar" style="height:${Math.max((v / maxDay) * 100, 2)}%"></div>
        <div class="chart-label">${d.slice(8)}</div>
      </div>`;
    }).join('');

    $('#btnExport').onclick = exportCSV;
  }

  function exportCSV() {
    if (!expenses.length) { toast('無資料'); return; }
    const BOM = '﻿';
    const header = '日期,成員,類別,付款方式,金額,幣別,台幣換算,備註\n';
    const rows = expenses
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      .map(e => {
        const cat = CATS[e.category]?.name || e.category;
        const mem = MEMBERS[e.member]?.name || '爸爸';
        const pay = PAYS[e.pay]?.name || '現金';
        return `${e.date},${mem},${cat},${pay},${e.amount},${e.currency},${Math.round(toTWD(e.amount, e.currency))},"${e.note.replace(/"/g, '""')}"`;
      }).join('\n');

    const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `travel_expense_${settings.tripStart}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已匯出');
  }

  function loadSettingsUI() {
    $('#setRate').value = settings.rate;
    $('#setStart').value = settings.tripStart;
    $('#setEnd').value = settings.tripEnd;
    updateRateHint();
  }

  function updateRateHint() {
    const cache = loadJSON('te_rate_cache', null);
    const hint = $('#rateHint');
    if (cache) {
      hint.textContent = `最後更新：${cache.date}　1 JPY = ${cache.rate} TWD`;
    } else {
      hint.textContent = '每日自動抓取，亦可手動覆蓋';
    }
  }

  function setupSettings() {
    $('#btnRefreshRate').addEventListener('click', async () => {
      localStorage.removeItem('te_rate_cache');
      toast('抓取中...');
      await fetchRate();
      loadSettingsUI();
    });

    $('#btnSaveSettings').addEventListener('click', () => {
      const r = parseFloat($('#setRate').value);
      if (r > 0) settings.rate = r;
      if ($('#setStart').value) settings.tripStart = $('#setStart').value;
      if ($('#setEnd').value) settings.tripEnd = $('#setEnd').value;
      saveSettings();
      updateBudget();
      toast('設定已儲存');
    });

    $('#btnClearData').addEventListener('click', () => {
      if (!confirm('確定清除所有記帳資料？無法復原。')) return;
      expenses = [];
      saveExpenses();
      updateBudget();
      renderList();
      toast('已清除');
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
