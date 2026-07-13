/* ============================================================
   历史上的今天 — 前端逻辑
   读取本地 manifest.json → 最新快照 → 渲染时间线
   支持：分区 Tab / 搜索 / 历史日期回看 / 加载·错误·空态
   ============================================================ */
(function () {
  'use strict';

  var SECTIONS = [
    { key: 'events', label: '事件', cls: 'tl-events' },
    { key: 'births', label: '出生', cls: 'tl-births' },
    { key: 'deaths', label: '逝世', cls: 'tl-deaths' },
    { key: 'holidays', label: '节日', cls: 'tl-holidays' },
  ];

  var els = {
    bigDate: document.getElementById('bigDate'),
    picker: document.getElementById('datePicker'),
    tabs: document.getElementById('tabs'),
    search: document.getElementById('search'),
    timeline: document.getElementById('timeline'),
    featured: document.getElementById('featured'),
    featuredGrid: document.getElementById('featuredGrid'),
    status: document.getElementById('status'),
  };

  var state = {
    manifest: null,
    current: null, // 当前快照对象
    currentFile: null,
    tab: 'all',
    query: '',
  };

  /* ---------------- 工具 ---------------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }
  function formatYear(y) {
    if (y === null || y === undefined || isNaN(y)) return null;
    if (y < 0) return '前' + Math.abs(y);
    return String(y);
  }
  function monthDayToLabel(md) {
    if (!md || md.indexOf('-') < 0) return '';
    var p = md.split('-');
    return parseInt(p[0], 10) + ' 月 ' + parseInt(p[1], 10) + ' 日';
  }

  /* ---------------- 状态提示 ---------------- */
  function showLoading(msg) {
    els.status.hidden = false;
    els.status.className = 'status';
    els.status.innerHTML = '<div class="spinner"></div>' + escapeHtml(msg || '载入中…');
    els.timeline.innerHTML = '';
  }
  function showError(msg) {
    els.status.hidden = false;
    els.status.className = 'status error';
    els.status.innerHTML = '⚠️ ' + escapeHtml(msg);
    els.timeline.innerHTML = '';
  }
  function showEmpty(msg) {
    els.status.hidden = false;
    els.status.className = 'status';
    els.status.textContent = msg || '暂无数据';
    els.timeline.innerHTML = '';
  }
  function hideStatus() {
    els.status.hidden = true;
    els.status.innerHTML = '';
  }

  /* ---------------- 渲染单条 ---------------- */
  function renderEntry(item) {
    var yearStr = formatYear(item.year);
    var badgeClass = 'year-badge';
    var badgeText = yearStr;
    if (yearStr === null) {
      badgeClass += ' festival';
      badgeText = '节日';
    } else if (item.year < 0) {
      badgeClass += ' bce';
    }

    var hasThumb = !!item.thumb;
    var inner =
      (hasThumb
        ? '<img class="thumb" src="' +
          escapeAttr(item.thumb) +
          '" alt="" loading="lazy" onerror="this.remove()">'
        : '') +
      '<p class="text">' +
      escapeHtml(item.text) +
      '</p>' +
      (item.link ? '<span class="meta">查看词条 ↗</span>' : '');

    var card =
      item.link
        ? '<a class="card' +
          (hasThumb ? ' has-thumb' : '') +
          '" href="' +
          escapeAttr(item.link) +
          '" target="_blank" rel="noopener">' +
          inner +
          '</a>'
        : '<div class="card' +
          (hasThumb ? ' has-thumb' : '') +
          '">' +
          inner +
          '</div>';

    return (
      '<div class="entry"><div class="year-col"><span class="' +
      badgeClass +
      '">' +
      escapeHtml(badgeText) +
      '</span></div>' +
      card +
      '</div>'
    );
  }

  function matchesQuery(item, q) {
    if (!q) return true;
    var hay = ((item.text || '') + ' ' + (item.link || '')).toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  /* ---------------- 渲染今日焦点（头部重点展示） ---------------- */
  function renderHero() {
    var snap = state.current;
    if (!snap) return;
    var q = state.query.trim().toLowerCase();
    // 兼容旧快照：无 featured 时回退取前 3 条事件
    var featured =
      snap.featured && snap.featured.length
        ? snap.featured
        : (snap.sections && snap.sections.events ? snap.sections.events : []).slice(0, 3);
    var items = featured.filter(function (it) {
      return matchesQuery(it, q);
    });
    if (!items.length) {
      els.featured.hidden = true;
      els.featuredGrid.innerHTML = '';
      return;
    }
    els.featured.hidden = false;
    var html = '';
    items.forEach(function (it) {
      var yearStr = formatYear(it.year);
      var badge = yearStr === null ? '焦点' : yearStr;
      var hasThumb = !!it.thumb;
      var inner =
        '<span class="feat-year">' +
        escapeHtml(badge) +
        '</span>' +
        (hasThumb
          ? '<img class="feat-thumb" src="' +
            escapeAttr(it.thumb) +
            '" alt="" loading="lazy" onerror="this.remove()">'
          : '') +
        '<p class="feat-text">' +
        escapeHtml(it.text) +
        '</p>' +
        (it.link ? '<span class="feat-link">阅读全文 ↗</span>' : '');
      var card = it.link
        ? '<a class="feat-card' +
          (hasThumb ? ' has-thumb' : '') +
          '" href="' +
          escapeAttr(it.link) +
          '" target="_blank" rel="noopener">' +
          inner +
          '</a>'
        : '<div class="feat-card' +
          (hasThumb ? ' has-thumb' : '') +
          '">' +
          inner +
          '</div>';
      html += card;
    });
    els.featuredGrid.innerHTML = html;
  }

  /* ---------------- 渲染时间线 ---------------- */
  function render() {
    var snap = state.current;
    if (!snap) return;
    var q = state.query.trim().toLowerCase();
    var sec = snap.sections || {};
    var html = '';

    if (state.tab === 'all') {
      var any = false;
      SECTIONS.forEach(function (s) {
        var items = (sec[s.key] || []).filter(function (it) {
          return matchesQuery(it, q);
        });
        if (!items.length) return;
        any = true;
        html +=
          '<h2 class="group-title" style="--tl-color:var(--c-' +
          s.key +
          ')">' +
          escapeHtml(s.label) +
          ' <span class="count">' +
          items.length +
          ' 条</span></h2>';
        html += '<div class="timeline ' + s.cls + '">';
        items.forEach(function (it) {
          html += renderEntry(it);
        });
        html += '</div>';
      });
      if (!any) {
        showEmpty(q ? '未找到匹配「' + state.query + '」的条目' : '该快照暂无数据');
        return;
      }
    } else {
      var meta = SECTIONS.filter(function (s) {
        return s.key === state.tab;
      })[0];
      var list = (sec[state.tab] || []).filter(function (it) {
        return matchesQuery(it, q);
      });
      if (!list.length) {
        showEmpty(
          q ? '未找到匹配「' + state.query + '」的' + meta.label : '「' + meta.label + '」暂无数据'
        );
        return;
      }
      html += '<div class="timeline ' + meta.cls + '">';
      list.forEach(function (it) {
        html += renderEntry(it);
      });
      html += '</div>';
    }

    hideStatus();
    els.timeline.innerHTML = html;
  }

  /* ---------------- 加载快照 ---------------- */
  function loadSnapshot(file) {
    showLoading('正在载入 ' + file + ' …');
    fetch('data/snapshots/' + file, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (snap) {
        state.current = snap;
        state.currentFile = file;
        var label = monthDayToLabel(snap.monthDay);
        els.bigDate.textContent = label || file.replace('.json', '');
        renderHero();
        render();
      })
      .catch(function (e) {
        showError('加载快照失败：' + e.message + '。请稍后重试或等待每日自动更新。');
      });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    showLoading('正在读取数据索引…');
    fetch('data/manifest.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (manifest) {
        state.manifest = manifest;
        var snaps = (manifest && manifest.snapshots) || [];
        if (!snaps.length) {
          showError('尚未抓取到任何数据快照。请等待 GitHub Actions 每日自动运行，或手动触发一次。');
          return;
        }
        // 填充日期选择器
        snaps.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.file;
          opt.textContent = s.file.replace('.json', '') + '（' + s.monthDay + '）';
          els.picker.appendChild(opt);
        });
        // 默认加载最新
        loadSnapshot(snaps[0].file);
      })
      .catch(function (e) {
        showError('读取索引失败：' + e.message + '。请确认站点已部署且 data/manifest.json 可访问。');
      });
  }

  /* ---------------- 事件绑定 ---------------- */
  els.tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab');
    if (!btn) return;
    var t = btn.getAttribute('data-tab');
    if (t === state.tab) return;
    state.tab = t;
    Array.prototype.forEach.call(els.tabs.children, function (c) {
      c.classList.toggle('active', c === btn);
    });
    renderHero();
    render();
  });

  els.search.addEventListener('input', function () {
    state.query = els.search.value;
    renderHero();
    render();
  });

  els.picker.addEventListener('change', function () {
    var v = els.picker.value;
    if (!v) {
      // 回到最新
      if (state.manifest && state.manifest.snapshots.length) {
        loadSnapshot(state.manifest.snapshots[0].file);
      }
    } else {
      loadSnapshot(v);
    }
  });

  init();
})();
