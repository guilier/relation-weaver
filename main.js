function __extends(d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}var obsidian = require('obsidian');

// Unified character mention highlighter: every rendered text surface points to the
// same character detail modal. Longest names win to avoid partial-name collisions.
function rwHighlightCharacterMentions(root, view) {
    if (!root || !view || !view.charNames || !view.charNames.length) return;
    var aliasToCanonical = {};
    (view.chars || []).forEach(function (c) {
        var canonical = String(c.name || '').trim(); if (!canonical) return;
        aliasToCanonical[canonical] = canonical;
        var aliases = c.aliases || (c.fields && (c.fields['别名'] || c.fields['曾用名'] || c.fields['别称'])) || [];
        (Array.isArray(aliases) ? aliases : String(aliases || '').split(/[、,，;；|]/)).forEach(function (a) { a = String(a || '').trim(); if (a && !aliasToCanonical[a]) aliasToCanonical[a] = canonical; });
    });
    var names = Object.keys(aliasToCanonical).sort(function (a, b) { return b.length - a.length; });
    if (!names.length) return;
    var escaped = names.map(function (n) { return String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    var pattern;
    try { pattern = new RegExp(escaped.join('|'), 'g'); } catch (e) { return; }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            var parent = node.parentElement;
            if (!parent || parent.closest('input,textarea,select,button,a,code,pre,script,style,.clink,.rw-person-mention,[contenteditable="true"]')) return NodeFilter.FILTER_REJECT;
            pattern.lastIndex = 0; return pattern.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });
    var nodes = [], node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function (textNode) {
        var text = textNode.nodeValue, frag = document.createDocumentFragment(), cursor = 0, match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
            if (match.index > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, match.index)));
            var span = document.createElement('span'); span.className = 'rw-person-mention'; span.textContent = match[0]; span.setAttribute('data-character-name', match[0]);
            span.addEventListener('click', function (ev) {
                ev.preventDefault(); ev.stopPropagation();
                var canonical = aliasToCanonical[span.getAttribute('data-character-name')] || span.getAttribute('data-character-name');
                var target = (view.chars || []).find(function (c) { return c.name === canonical; });
                if (target) view.showCharDetail(target);
            });
            frag.appendChild(span); cursor = pattern.lastIndex;
        }
        if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
        textNode.parentNode.replaceChild(frag, textNode);
    });
}

/* P3 self-contained modules: bundled into main.js for Obsidian's plugin loader. */
/** Deterministic, dependency-free compact relationship graph layout. */
function buildGraphLayout(chars, relations, width, height, layoutMode, layoutSeed) {
    chars = chars || []; relations = relations || [];
    var w = Math.max(320, Number(width) || 600), h = Math.max(320, Number(height) || 520);
    var byName = {}, degree = {}, edges = [];
    chars.forEach(function(c) { if (c && c.name) { byName[c.name] = c; degree[c.name] = 0; } });
    relations.forEach(function(r) {
        if (!r || !byName[r.charA] || !byName[r.charB] || r.charA === r.charB) return;
        degree[r.charA]++; degree[r.charB]++; edges.push(r);
    });
    var names = Object.keys(byName);
    names.sort(function(a,b) { return (degree[b]-degree[a]) || a.localeCompare(b); });
    var positions = {};
    if (!names.length) return { positions: positions, edges: edges, degree: degree, names: names };

    // Radial, collision-aware layout: one clear hub, then evenly spaced rings.
    // Unlike the previous force simulation, linked nodes are never pulled into a pile.
    layoutMode = layoutMode === 'comfortable' ? 'comfortable' : 'compact';
    layoutSeed = Number(layoutSeed) || 0;
    var centerX = w / 2, centerY = h / 2;
    var count = names.length;
    var baseRadius = layoutMode === 'comfortable' ? 158 : 138;
    var ringGap = layoutMode === 'comfortable' ? 142 : 124;
    var nodeBase = 24;
    var points = {};
    var hub = names[0];
    points[hub] = { x:centerX, y:centerY };
    var remaining = names.slice(1), cursor = 0, ring = 0;
    while (cursor < remaining.length) {
        var radius = baseRadius + ring * ringGap;
        var capacity = Math.max(7, Math.floor((Math.PI * 2 * radius) / (nodeBase * 3.45)));
        var takeLimit = ring === 0 && remaining.length - cursor > capacity - 1 ? Math.min(8, capacity) : capacity;
        var take = Math.min(takeLimit, remaining.length - cursor);
        var phase = ring % 2 ? Math.PI / capacity : -Math.PI / 2;
        for (var i = 0; i < take; i++) {
            var name = remaining[cursor + i];
            var angle = phase + (Math.PI * 2 * i / take) + (((layoutSeed + i * 7 + ring * 11) % 5) - 2) * .012;
            points[name] = { x:centerX + Math.cos(angle) * radius, y:centerY + Math.sin(angle) * radius };
        }
        cursor += take; ring++;
    }
    names.forEach(function(name) {
        var c = byName[name];
        // Keep nodes compact; degree changes size gently instead of creating oversized hubs.
        var radius = Math.max(19, Math.min(27, 19 + Math.min(8, degree[name] || 0) * .85));
        positions[name] = { x:points[name].x, y:points[name].y, char:c, degree:degree[name]||0, radius:radius };
    });
    return { positions: positions, edges: edges, degree: degree, names: names };
}
var graphModel = { buildGraphLayout: buildGraphLayout };

/** Local timeline aggregation helpers. */
function buildTimelineOverview(events, parseDate) {
    var buckets = {}, unknown = 0;
    (events || []).forEach(function(evt) {
        var raw = evt && (evt.storyYear || evt.year) || '';
        var parsed = typeof parseDate === 'function' ? parseDate(raw) : null;
        var sortKey = parsed && parsed.sortValue != null ? String(parsed.sortValue) : String(raw || '未标注');
        if (!sortKey || sortKey === '未标注') unknown++;
        if (!buckets[sortKey]) buckets[sortKey] = { count: 0, label: String(raw || '未标注'), numeric: parsed && parsed.sortValue != null ? Number(parsed.sortValue) : (/^-?\d+(?:\.\d+)?$/.test(sortKey) ? Number(sortKey) : null) };
        buckets[sortKey].count++;
    });
    var rows = Object.keys(buckets).map(function(k) { return { label:buckets[k].label, count:buckets[k].count, numeric:buckets[k].numeric }; });
    rows.sort(function(a,b) { if(a.numeric===null) return b.numeric===null ? a.label.localeCompare(b.label) : 1; if(b.numeric===null) return -1; return a.numeric-b.numeric; });
    return { rows: rows, total: (events||[]).length, unknown: unknown, max: rows.reduce(function(m,x){return Math.max(m,x.count);},0) };
}
var timelineModel = { buildTimelineOverview: buildTimelineOverview };

/**
 * Relation Weaver local story-audit engine.
 * Pure rule checks only: no network access, no AI calls, no source text mutation.
 * Dependencies are injected by main.js to keep the audit module isolated and testable.
 */
function createStoryAudit(deps) {
    var getTimeSortValue = deps.getTimeSortValue;
    var parseHistoricalDate = deps.parseHistoricalDate;
    var findCharsInEvent = deps.findCharsInEvent;
    var auditUnbornAppearances = deps.auditUnbornAppearances;
    var collectDeadAfterAppearIssues = deps.collectDeadAfterAppearIssues;
    var novelExt = deps.novelExt;
// ===== P2 故事逻辑体检：只报告可由结构化设定支持的问题，不自动改写原文 =====
function p2Issue(kind, severity, message, extra) {
    var item = { kind: kind, severity: severity, message: message };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) item[k] = extra[k];
    return item;
}
function collectAgeConsistencyIssues(view) {
    var issues = [];
    if (!view || !view.chars || !view.timeline) return issues;
    for (var i = 0; i < view.timeline.length; i++) {
        var evt = view.timeline[i];
        var eventTime = getTimeSortValue(evt.storyYear || evt.year);
        if (eventTime === null) continue;
        var names = findCharsInEvent(evt.event, view.charNames || []);
        for (var j = 0; j < names.length; j++) {
            var ch = view.findChar(names[j]);
            if (!ch) continue;
            var birth = view.getFieldValue(ch, (view.plugin.settings.birthFieldNames || '出生,出生时间'));
            var birthTime = getTimeSortValue(birth);
            if (birthTime === null || eventTime < birthTime) continue;
            var text = String(evt.event || '');
            var escapedName = ch.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var ageMatch = text.match(new RegExp(escapedName + '[^，。；;]{0,18}?(\\d{1,3})\\s*岁'));
            if (!ageMatch) ageMatch = text.match(new RegExp('(\\d{1,3})\\s*岁[^，。；;]{0,18}?' + escapedName));
            if (!ageMatch) continue;
            var stated = parseInt(ageMatch[1], 10);
            var eventParsed = parseHistoricalDate(evt.storyYear || evt.year);
            var birthParsed = parseHistoricalDate(birth);
            var eventAgePoint = eventParsed && eventParsed.era === 'modern' ? eventParsed.year : eventTime;
            var birthAgePoint = birthParsed && birthParsed.era === 'modern' ? birthParsed.year : birthTime;
            var expected = Math.abs(eventAgePoint - birthAgePoint);
            if (Math.abs(expected - stated) > 1) {
                issues.push(p2Issue('年龄与事件时间', 'medium', ch.name + ' 在「' + (evt.year || '时间未标注') + '」事件中标注 ' + stated + ' 岁；按出生设定「' + birth + '」推算约 ' + Math.round(expected) + ' 岁', { charName: ch.name, event: evt }));
            }
        }
    }
    return issues;
}
function collectRelationTimelineIssues(view) {
    var issues = [];
    var rels = (view && view.relations) || [];
    var pairMap = {};
    for (var i = 0; i < rels.length; i++) {
        var r = rels[i];
        var start = getTimeSortValue(r.startTime);
        var end = getTimeSortValue(r.endTime);
        if (start !== null && end !== null && start > end) {
            issues.push(p2Issue('人物关系变化', 'high', r.charA + ' 与 ' + r.charB + ' 的关系「' + r.type + '」结束时间早于开始时间（' + r.startTime + ' → ' + r.endTime + '）', { charName: r.charA }));
        }
        var key = [r.charA, r.charB].sort().join('|');
        if (!pairMap[key]) pairMap[key] = [];
        pairMap[key].push(r);
        [r.charA, r.charB].forEach(function(name) {
            var ch = view.findChar(name);
            if (!ch || !r.endTime) return;
            var death = view.getFieldValue(ch, (view.plugin.settings.deathFieldNames || '死亡,死亡时间'));
            var deathTime = getTimeSortValue(death);
            if (deathTime !== null && end !== null && end > deathTime) {
                issues.push(p2Issue('人物关系变化', 'medium', name + ' 已于「' + death + '」死亡，但与 ' + (name === r.charA ? r.charB : r.charA) + ' 的「' + r.type + '」关系延续至「' + r.endTime + '」', { charName: name }));
            }
        });
    }
    Object.keys(pairMap).forEach(function(key) {
        var arr = pairMap[key];
        for (var a = 0; a < arr.length; a++) for (var b = a + 1; b < arr.length; b++) {
            var x = arr[a], y = arr[b];
            if (x.type === y.type) continue;
            var xs = getTimeSortValue(x.startTime), xe = getTimeSortValue(x.endTime);
            var ys = getTimeSortValue(y.startTime), ye = getTimeSortValue(y.endTime);
            if (xs === null || ys === null) continue;
            var xEnd = xe === null ? Infinity : xe, yEnd = ye === null ? Infinity : ye;
            if (Math.max(xs, ys) <= Math.min(xEnd, yEnd)) {
                issues.push(p2Issue('人物关系变化', 'medium', x.charA + ' 与 ' + x.charB + ' 同一时期存在两种关系记录：「' + x.type + '」和「' + y.type + '」，请确认是否为关系转变或并存关系', { charName: x.charA }));
            }
        }
    });
    // 将关系编辑历史与当前关系记录交叉核对，发现历史变更未同步到当前关系档案的情况。
    var history = (view.plugin && view.plugin._intimacyHistory) || [];
    var latestTypeByPair = {};
    history.forEach(function(h) {
        if (h.recordKind !== 'relation_type') return;
        var key = [h.charA, h.charB].sort().join('|');
        latestTypeByPair[key] = h;
    });
    Object.keys(latestTypeByPair).forEach(function(key) {
        var h = latestTypeByPair[key];
        var current = pairMap[key] || [];
        if (!current.length) return;
        var found = current.some(function(r) { return (r.type || '未设置') === (h.newType || '未设置'); });
        if (!found) issues.push(p2Issue('人物关系变化', 'medium', h.charA + ' 与 ' + h.charB + ' 的关系变更历史记录为「' + (h.newType || '未设置') + '」（' + (h.timestamp || '时间未标注') + '），但当前关系档案未找到该类型，请核对历史与现状', { charName: h.charA }));
    });
    return issues;
}
function collectTimelineOrderIssues(view) {
    var issues = [];
    var events = (view && view.timeline) || [];
    var lastByVolume = {};
    for (var i = 0; i < events.length; i++) {
        var e = events[i];
        var t = getTimeSortValue(e.storyYear || e.year);
        if (t === null) continue;
        var vol = e.volume || '（未分卷）';
        if (lastByVolume[vol] && t < lastByVolume[vol].time) {
            issues.push(p2Issue('时间线冲突', 'low', '「' + vol + '」中的事件顺序可能倒置：' + (lastByVolume[vol].event.year || '') + ' 之后出现更早的「' + e.year + '」事件。若这是倒叙/插叙，可忽略', { event: e }));
        }
        lastByVolume[vol] = { time: t, event: e };
    }
    var seen = {};
    for (var j = 0; j < events.length; j++) {
        var ev = events[j];
        var time = ev.storyYear || ev.year || '';
        var signature = String(time) + '|' + String(ev.event || '').replace(/\s+/g, '').toLowerCase();
        if (ev.event && seen[signature]) {
            issues.push(p2Issue('时间线冲突', 'low', '发现同一时间重复记录的事件：「' + String(ev.event).substring(0, 42) + '」。请确认是否重复录入', { event: ev }));
        } else seen[signature] = true;
    }
    return issues;
}
function collectStoryLogicIssues(view) {
    var all = [];
    var first = novelExt.auditFirstAppearSync(view);
    first.forEach(function(x) { all.push(p2Issue('人物首次出场', x.severity || 'medium', x.message, { charName: x.charName, event: x.event, firstIssue: x })); });
    auditUnbornAppearances(view).forEach(function(x) { all.push(p2Issue('人物出生时间', 'high', x.message, { charName: x.charName, event: x.event })); });
    collectDeadAfterAppearIssues(view).forEach(function(x) { all.push(p2Issue('人物死亡时间', 'high', x.message, { charName: x.charName, event: x.event })); });
    collectAgeConsistencyIssues(view).forEach(function(x) { all.push(x); });
    collectRelationTimelineIssues(view).forEach(function(x) { all.push(x); });
    collectTimelineOrderIssues(view).forEach(function(x) { all.push(x); });
    novelExt.validatePlotLines(view.timeline || []).forEach(function(x) { all.push(p2Issue('伏笔回收检查', x.severity || 'medium', x.message, { event: x.event, plotLine: x.plotLine })); });
    novelExt.getUnredeemedPlotLines(view.timeline || []).forEach(function(g) {
        if (g.latestStatus === '埋设' || !g.latestStatus) all.push(p2Issue('伏笔回收检查', 'info', '伏笔「' + g.plotLine + '」目前只有埋设/未标状态，尚未记录推进或回收节点', { plotLine: g.plotLine }));
    });
    return all;
}

    return {
        collectAgeConsistencyIssues: collectAgeConsistencyIssues,
        collectRelationTimelineIssues: collectRelationTimelineIssues,
        collectTimelineOrderIssues: collectTimelineOrderIssues,
        collectStoryLogicIssues: collectStoryLogicIssues
    };
}

var debounce = obsidian.debounce;
var NOVEL_COMPACT_HIDDEN = ['intimacy', 'continuity', 'world', 'chars', 'search', 'factions', 'graph', 'lifecycle', 'statistics', 'heatmap', 'importexport'];

var NOVEL_PRIMARY_TAB_IDS = ['desk', 'relations', 'plots', 'outline', 'timeline', 'dashboard', 'chapterStatus'];

var PLOT_STATUSES = ['埋设', '推进', '升级', '假回收', '并入', '回收', '搁置'];
var PLOT_BEATS = ['激励事件', '第一幕转折', '中点', '第二幕低谷', '高潮', '结局'];
var PLOT_ACTS = ['第一幕', '第二幕', '第三幕'];
var PLOT_CLOSED_STATUSES = { '回收': true, '并入': true };
var WORLD_KINDS = [
    { id: 'places', file: '地点百科.md', title: '地点', heading: '地点百科' },
    { id: 'items', file: '道具.md', title: '道具', heading: '道具' },
    { id: 'arts', file: '功法.md', title: '功法', heading: '功法体系' },
    { id: 'orgs', file: '组织.md', title: '组织', heading: '组织层级' },
    { id: 'map', file: '地图.md', title: '地图', heading: '地图' }
];
var EXTRA_CHAR_TYPE_HINTS = ['龙套', '路人', '群像', '背景', '群众'];
var ALIAS_FIELD_NAMES = ['字号', '别名', '称号', '化名', '小名', '外号', '曾用名', '别称'];

function emptyWorldData() {
    return { places: [], items: [], arts: [], orgs: [], map: [] };
}

function parseChineseNumeral(str) {
    if (str == null) return null;
    var s = String(str).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    var map = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    var units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
    var n = 0, cur = 0;
    for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (ch === '零' || ch === '〇') continue;
        if (map[ch] != null) { cur = map[ch]; continue; }
        if (units[ch] != null) {
            if (cur === 0) cur = 1;
            n += cur * units[ch];
            cur = 0;
            continue;
        }
        if (/\d/.test(ch)) { cur = cur * 10 + parseInt(ch, 10); continue; }
        return null;
    }
    return n + cur;
}

function parseChapterHeading(str) {
    if (!str) return null;
    var s = String(str).trim();
    var m = s.match(/(?:第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*章|Chapter\s*(\d+)|Ch\.?\s*(\d+))/i);
    if (!m) return null;
    var raw = m[1] || m[2] || m[3];
    var num = parseChineseNumeral(raw);
    if (num == null || isNaN(num)) return null;
    return { num: num, display: s, era: 'chapter' };
}

/** 小说关系设计用的默认类型（「同期出场」仅作时间线辅助，放最后） */
var DEFAULT_RELATION_TYPES = [
    '父子', '母子', '父女', '母女', '兄弟', '姐妹', '兄妹', '姐弟',
    '夫妻', '恋人', '朋友', '挚友', '战友', '师生', '师徒',
    '君臣', '主仆', '敌人', '对手', '仇人', '同事', '同盟', '其他',
    '同期出场'
];

function getRelationTypes(plugin) {
    var seen = {};
    var list = [];
    function add(v) {
        var s = String(v || '').trim();
        if (!s || seen[s]) return;
        seen[s] = true;
        list.push(s);
    }
    for (var i = 0; i < DEFAULT_RELATION_TYPES.length; i++) add(DEFAULT_RELATION_TYPES[i]);
    var custom = (plugin && plugin.settings && plugin.settings.customRelationTypes) || '';
    String(custom).split(',').forEach(add);
    return list;
}

function findRelationIndex(relations, target) {
    if (!relations || !target) return -1;
    var byRef = relations.indexOf(target);
    if (byRef !== -1) return byRef;
    for (var i = 0; i < relations.length; i++) {
        var r = relations[i];
        var samePair = (r.charA === target.charA && r.charB === target.charB) ||
            (r.charA === target.charB && r.charB === target.charA);
        if (samePair && (r.type || '其他') === (target.type || '其他')) return i;
    }
    return -1;
}

var LIMITS = {
    TIMELINE_AUTO_EXPAND_YEAR_COUNT: 3,
    TIMELINE_AUTO_EXPAND_MONTH_EVENT_COUNT: 8,
    DETAIL_MODAL_EVENT_PREVIEW: 400,
    CHAR_LIST_VIRTUAL_THRESHOLD: 24,
    CHAR_LIST_VIRTUAL_ITEM_HEIGHT: 132,
    CHAR_LIST_VIRTUAL_HEADER_HEIGHT: 36,
    CHAR_LIST_VIRTUAL_OVERSCAN: 6,
    UNDO_HISTORY_MAX: 50
};

function showUserError(message, error) {
    console.error(message, error || '');
    new obsidian.Notice('❌ ' + message);
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeVaultPath(path) {
    if (!path || typeof path !== 'string') return '';
    var segments = path.replace(/\\/g, '/').split('/');
    var result = [];
    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i].trim();
        if (!seg || seg === '.') continue;
        if (seg === '..') {
            if (result.length > 0) result.pop();
            continue;
        }
        result.push(seg);
    }
    return result.join('/');
}

function deepCloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function createUndoSnapshot(view, label) {
    return {
        label: label || '操作',
        createdAt: Date.now(),
        factions: deepCloneJson(view.factions || []),
        relations: deepCloneJson(view.relations || []),
        orgRelations: deepCloneJson(view.orgRelations || []),
        orgMemberships: deepCloneJson(view.orgMemberships || []),
        intimacyHistory: deepCloneJson(view.plugin._intimacyHistory || [])
    };
}

function pushUndoSnapshot(view, label) {
    if (!view || !view.plugin) return;
    if (!view.plugin._undoStack) view.plugin._undoStack = [];
    view.plugin._undoStack.push(createUndoSnapshot(view, label));
    if (view.plugin._undoStack.length > LIMITS.UNDO_HISTORY_MAX) {
        view.plugin._undoStack.shift();
    }
    view.plugin._redoStack = [];
}

function restoreRelationsSnapshot(view, snapshot) {
    if (!view || !snapshot) throw new Error('撤销记录无效');
    view.factions = deepCloneJson(snapshot.factions || []);
    view.relations = deepCloneJson(snapshot.relations || []);
    view.orgRelations = normalizeOrgRelations(deepCloneJson(snapshot.orgRelations || []));
    view.orgMemberships = normalizeOrgMemberships(deepCloneJson(snapshot.orgMemberships || []));
    view.plugin._intimacyHistory = deepCloneJson(snapshot.intimacyHistory || []);
}

async function applyHistorySnapshot(view, snapshot) {
    restoreRelationsSnapshot(view, snapshot);
    // 仅恢复当前历史系统已完整持久化的关系域数据；不伪装恢复人物/时间线/世界观 Markdown。
    await view.saveFactionsAndRelations({ skipGraphSync: true });
    var saved = await loadSavedData(view.plugin);
    if (JSON.stringify(saved.factions || []) !== JSON.stringify(view.factions || []) ||
        JSON.stringify(saved.relations || []) !== JSON.stringify(view.relations || []) ||
        JSON.stringify(normalizeOrgRelations(saved.orgRelations || [])) !== JSON.stringify(view.orgRelations || []) ||
        JSON.stringify(normalizeOrgMemberships(saved.orgMemberships || [])) !== JSON.stringify(view.orgMemberships || [])) {
        throw new Error('恢复后的数据校验未通过');
    }
    invalidateTagCache(view.plugin);
    view.buildIndexes();
}

async function runHistoryAction(view, direction) {
    if (!view || !view.plugin || view._historyBusy) return;
    var plugin = view.plugin;
    var sourceKey = direction === 'undo' ? '_undoStack' : '_redoStack';
    var targetKey = direction === 'undo' ? '_redoStack' : '_undoStack';
    var source = plugin[sourceKey] || [];
    if (!source.length) {
        new obsidian.Notice(direction === 'undo' ? '没有可撤销的操作' : '没有可重做的操作');
        return;
    }
    var targetSnapshot = source.pop();
    var currentSnapshot = createUndoSnapshot(view, direction === 'undo' ? '撤销前状态' : '重做前状态');
    view._historyBusy = true;
    try {
        await applyHistorySnapshot(view, targetSnapshot);
        if (!plugin[targetKey]) plugin[targetKey] = [];
        plugin[targetKey].push(currentSnapshot);
        if (plugin[targetKey].length > LIMITS.UNDO_HISTORY_MAX) plugin[targetKey].shift();
        new obsidian.Notice((direction === 'undo' ? '已撤销：' : '已重做：') + (targetSnapshot.label || '操作'));
        view.render();
    } catch (error) {
        // 写入失败时恢复内存与历史栈，避免界面呈现虚假的成功状态。
        try { restoreRelationsSnapshot(view, currentSnapshot); } catch (restoreError) { console.error('[操作历史] 内存回滚失败', restoreError); }
        source.push(targetSnapshot);
        try { await view.saveFactionsAndRelations({ skipGraphSync: true }); }
        catch (rollbackError) { console.error('[操作历史] 保存回滚失败', rollbackError); }
        new obsidian.Notice((direction === 'undo' ? '撤销' : '重做') + '失败，已尝试恢复操作前数据：' + (error.message || error), 9000);
        view.render();
    } finally {
        view._historyBusy = false;
    }
}

var NOVEL_TAG_PRESETS = {
    gudai: {
        label: '古言 / 历史',
        tags: [
            { value: '朝堂', label: '朝堂', color: '#e74c3c' },
            { value: '博弈', label: '博弈', color: '#9b59b6' },
            { value: '感情', label: '感情', color: '#e91e63' },
            { value: '战争', label: '战争', color: '#c0392b' },
            { value: '出场', label: '出场', color: '#2ecc71' },
            { value: '死亡', label: '死亡', color: '#7f8c8d' },
            { value: '诸侯', label: '诸侯', color: '#3498db' },
            { value: '日常', label: '日常', color: '#16a085' }
        ]
    },
    xiandai: {
        label: '现代都市',
        tags: [
            { value: '职场', label: '职场', color: '#3498db' },
            { value: '感情', label: '感情', color: '#e91e63' },
            { value: '转折', label: '转折', color: '#e67e22' },
            { value: '日常', label: '日常', color: '#16a085' },
            { value: '冲突', label: '冲突', color: '#e74c3c' },
            { value: '出场', label: '出场', color: '#2ecc71' },
            { value: '回忆', label: '回忆', color: '#9b59b6' }
        ]
    },
    xuanhuan: {
        label: '玄幻修仙',
        tags: [
            { value: '突破', label: '突破', color: '#9b59b6' },
            { value: '宗门', label: '宗门', color: '#3498db' },
            { value: '历练', label: '历练', color: '#27ae60' },
            { value: '大战', label: '大战', color: '#e74c3c' },
            { value: '感情', label: '感情', color: '#e91e63' },
            { value: '出场', label: '出场', color: '#2ecc71' },
            { value: '机缘', label: '机缘', color: '#f39c12' },
            { value: '阴谋', label: '阴谋', color: '#7f8c8d' }
        ]
    }
};

function isNovelCompactUI(plugin) {
    if (plugin.settings.novelCompactUI === false) return false;
    return (plugin.settings.useCaseMode || 'novel') === 'novel';
}

function getTabsForRender(plugin, showMoreTabs) {
    var all = [];
    var hidden = plugin.settings.hiddenTabs || [];
    for (var i = 0; i < arguments.length; i++) {}
    // caller passes ALL_VIEW_TABS filter via getVisibleTabs first
    return { primary: [], secondary: [], showMore: !!showMoreTabs };
}

function splitTabsForNovelUI(plugin, visibleTabs, showMoreTabs) {
    if (!isNovelCompactUI(plugin)) {
        return { primary: visibleTabs, secondary: [], compact: false };
    }
    var primary = [];
    var secondary = [];
    for (var i = 0; i < visibleTabs.length; i++) {
        var t = visibleTabs[i];
        if (t.alwaysShow || NOVEL_PRIMARY_TAB_IDS.indexOf(t.id) !== -1) {
            primary.push(t);
        } else if (NOVEL_COMPACT_HIDDEN.indexOf(t.id) !== -1) {
            secondary.push(t);
        } else {
            primary.push(t);
        }
    }
    return { primary: primary, secondary: secondary, compact: true, showMore: !!showMoreTabs };
}

var UNLOCATED_CHAPTER_GROUP = '未定位章节';

// 时间线事件的稳定身份；旧事件在首次编辑保存时补齐，不强制批量改写旧文件。
function createTimelineEventId() {
    return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function normalizeChapterNotes(value) {
    if (Array.isArray(value)) return value.map(function(v) { return String(v || '').trim(); }).filter(Boolean);
    if (!value) return [];
    return String(value).split(/[、，,;；\n]+/).map(function(v) { return v.trim(); }).filter(Boolean);
}

function parseEventMeta(eventText) {
    var text = eventText;
    var plotLine = '';
    var plotStatus = '';
    var chapterNote = '';
    var chapterNotes = [];
    var eventId = '';
    var plotBeat = '';
    var plotAct = '';
    var conflictLevel = '';
    var mergeInto = '';
    var storyYear = '';
    var storyDesigns = {};
    function takeMeta(label) {
        var re = new RegExp('\\|\\s*' + label + '\\s*[:：]\\s*([^|]+)');
        var m = text.match(re);
        if (!m) return '';
        text = text.replace(m[0], '');
        return m[1].trim();
    }
    var m1 = text.match(/\|\s*情节线\s*[:：]\s*([^|]+)/);
    if (m1) { plotLine = m1[1].trim(); text = text.replace(m1[0], ''); }
    var m2 = text.match(/\|\s*状态\s*[:：]\s*([^|]+)/);
    if (m2) { plotStatus = m2[1].trim(); text = text.replace(m2[0], ''); }
    var m3 = text.match(/\|\s*笔记\s*[:：]\s*(\[\[[^\]]+\]\]|[^\|]+)/);
    if (m3) { chapterNote = m3[1].trim(); text = text.replace(m3[0], ''); }
    var mChapters = text.match(/\|\s*章节\s*[:：]\s*([^|]+)/);
    if (mChapters) { chapterNotes = normalizeChapterNotes(mChapters[1]); text = text.replace(mChapters[0], ''); }
    eventId = takeMeta('事件ID');
    plotBeat = takeMeta('节拍');
    plotAct = takeMeta('幕');
    conflictLevel = takeMeta('冲突');
    mergeInto = takeMeta('并入');
    storyYear = takeMeta('纪年');
    var storyDesignRaw = takeMeta('故事设计');
    if (storyDesignRaw) { try { storyDesigns = JSON.parse(decodeURIComponent(storyDesignRaw)); } catch (e) { storyDesigns = {}; } }
    text = text.replace(/\s+\|\s*$/g, '').trim();
    return {
        event: text.trim(), eventId: eventId, plotLine: plotLine, plotStatus: plotStatus, chapterNote: chapterNote || (chapterNotes.length ? chapterNotes[0] : ''),
        chapterNotes: chapterNotes.length ? chapterNotes : normalizeChapterNotes(chapterNote),
        plotBeat: plotBeat, plotAct: plotAct, conflictLevel: conflictLevel, mergeInto: mergeInto, storyYear: storyYear, storyDesigns: storyDesigns
    };
}

function serializeEventMeta(rec) {
    var parts = [rec.event];
    if (rec.plotLine) parts.push('情节线:' + rec.plotLine);
    if (rec.plotStatus) parts.push('状态:' + rec.plotStatus);
    if (rec.plotBeat) parts.push('节拍:' + rec.plotBeat);
    if (rec.plotAct) parts.push('幕:' + rec.plotAct);
    if (rec.conflictLevel) parts.push('冲突:' + rec.conflictLevel);
    if (rec.mergeInto) parts.push('并入:' + rec.mergeInto);
    if (rec.storyYear) parts.push('纪年:' + rec.storyYear);
    var chapterNotes = normalizeChapterNotes(rec.chapterNotes);
    if (chapterNotes.length) parts.push('章节:' + chapterNotes.join('、'));
    else if (rec.chapterNote) parts.push('笔记:' + rec.chapterNote);
    if (parts.length <= 1) return rec.event;
    return parts[0] + ' | ' + parts.slice(1).join(' | ');
}

function parseTimelineExtended(content, settings) {
    settings = settings || {};
    var mode = settings.timelineMode || 'auto';
    var records = [];
    var lines = content.split('\n');
    var currentVolume = '';
    var currentYear = '';
    var currentMonth = '';

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
            var h1 = trimmed.substring(2).trim();
            if (mode === 'chapter' || (mode === 'auto' && /卷|部|篇|Book|Act/i.test(h1))) {
                currentVolume = h1;
            }
            continue;
        }

        if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
            currentYear = trimmed.substring(3).trim();
            currentMonth = '';
            continue;
        }

        if (trimmed.startsWith('### ')) {
            currentMonth = trimmed.substring(4).trim();
            continue;
        }

        if (currentYear && (trimmed.startsWith('- ') || trimmed.startsWith('* '))) {
            var raw = trimmed.substring(2).trim();
            if (!raw) continue;
            var tag = '';
            var tagMatch = raw.match(/^\[([^\]]+)\]\s*/);
            if (tagMatch) {
                tag = tagMatch[1];
                raw = raw.substring(tagMatch[0].length);
            }
            var meta = parseEventMeta(raw);
            var chapterParsed = parseChapterHeading(currentYear);
            records.push({
                volume: currentVolume,
                year: currentYear,
                month: currentMonth || '未标注',
                event: meta.event,
                eventId: meta.eventId,
                tag: tag,
                plotLine: meta.plotLine,
                plotStatus: meta.plotStatus,
                chapterNote: meta.chapterNote,
                chapterNotes: meta.chapterNotes,
                plotBeat: meta.plotBeat,
                plotAct: meta.plotAct,
                conflictLevel: meta.conflictLevel,
                mergeInto: meta.mergeInto || (meta.plotStatus === '并入' ? meta.plotLine : ''),
                storyYear: meta.storyYear,
                storyDesigns: meta.storyDesigns || {},
                chapterIndex: chapterParsed ? chapterParsed.num : null,
                _lineIndex: i
            });
        }
    }
    return records;
}

function getRelationMetaPath(plugin) {
    var folder = (plugin.settings.charFolder || '').trim();
    if (!folder) {
        var active = plugin.app.workspace.getActiveFile();
        if (active && active.parent) folder = active.parent.path;
    }
    var fname = (plugin.settings.relationMetaFile || '关系与阵营.md').trim();
    return normalizeVaultPath(folder ? folder + '/' + fname : fname);
}

function parseFactionsFromMd(content) {
    var factions = [];
    var lines = content.split('\n');
    var current = null;
    var inFactionSection = false;

    for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (t === '# 阵营' || t === '## 阵营') { inFactionSection = true; continue; }
        if (t.startsWith('# 关系') || t === '## 关系') { inFactionSection = false; if (current) { factions.push(current); current = null; } continue; }
        if (!inFactionSection) continue;
        if (t.startsWith('## ')) {
            if (current) factions.push(current);
            current = { name: t.substring(3).trim(), color: '#4a90e2', desc: '' };
            continue;
        }
        if (current && t.startsWith('- ')) {
            var body = t.substring(2);
            var sep = body.indexOf('：') !== -1 ? body.indexOf('：') : body.indexOf(':');
            if (sep !== -1) {
                var k = body.substring(0, sep).trim();
                var v = body.substring(sep + 1).trim();
                if (k === '颜色') current.color = v;
                if (k === '描述') current.desc = v;
            }
        }
    }
    if (current) factions.push(current);
    return factions;
}

function parseRelationsFromMd(content) {
    var relations = [];
    var lines = content.split('\n');
    var current = null;
    var inRelSection = false;

    for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (t.startsWith('# 关系') || t === '## 关系') { inRelSection = true; continue; }
        if (inRelSection && (t === '# 阵营' || t === '## 阵营')) break;
        if (!inRelSection) continue;
        if (t.startsWith('## ')) {
            if (current && current.charA && current.charB) relations.push(current);
            var title = t.substring(3).trim();
            var names = title.split(/[·•\-—]/).map(function(s) { return s.trim(); }).filter(Boolean);
            current = {
                charA: names[0] || '',
                charB: names[1] || '',
                type: '其他',
                intimacy: 0,
                desc: '',
                startTime: '',
                endTime: ''
            };
            continue;
        }
        if (current && t.startsWith('- ')) {
            var body = t.substring(2);
            var sep = body.indexOf('：') !== -1 ? body.indexOf('：') : body.indexOf(':');
            if (sep !== -1) {
                var k = body.substring(0, sep).trim();
                var v = body.substring(sep + 1).trim();
                if (k === '类型') current.type = v;
                else if (k === '亲密度') current.intimacy = parseInt(v, 10) || 0;
                else if (k === '描述') current.desc = v;
                else if (k === '开始' || k === '开始时间') current.startTime = v;
                else if (k === '结束' || k === '结束时间') current.endTime = v;
            }
        }
    }
    if (current && current.charA && current.charB) relations.push(current);
    return relations;
}

function serializeRelationMetaMd(factions, relations) {
    var lines = ['# 关系与阵营', '', '> 由「人物关系谱系」插件维护，可在 Obsidian 中直接编辑', ''];
    lines.push('# 阵营', '');
    if (!factions || factions.length === 0) {
        lines.push('（暂无阵营）', '');
    } else {
        for (var fi = 0; fi < factions.length; fi++) {
            var f = factions[fi];
            lines.push('## ' + f.name);
            lines.push('- 颜色：' + (f.color || '#4a90e2'));
            if (f.desc) lines.push('- 描述：' + f.desc);
            lines.push('');
        }
    }
    lines.push('# 关系', '');
    if (!relations || relations.length === 0) {
        lines.push('（暂无关系）', '');
    } else {
        for (var ri = 0; ri < relations.length; ri++) {
            var r = relations[ri];
            lines.push('## ' + r.charA + ' · ' + r.charB);
            lines.push('- 类型：' + (r.type || '其他'));
            lines.push('- 亲密度：' + (r.intimacy || 0));
            if (r.desc) lines.push('- 描述：' + r.desc);
            if (r.startTime) lines.push('- 开始：' + r.startTime);
            if (r.endTime) lines.push('- 结束：' + r.endTime);
            lines.push('');
        }
    }
    return lines.join('\n');
}

async function loadRelationsFromMd(plugin) {
    var path = getRelationMetaPath(plugin);
    try {
        if (!await plugin.app.vault.adapter.exists(path)) return null;
        var content = await plugin.app.vault.adapter.read(path);
        if (!content || content.indexOf('# 关系') === -1) return null;
        return {
            factions: parseFactionsFromMd(content),
            relations: parseRelationsFromMd(content)
        };
    } catch (e) {
        showUserError('读取关系与阵营文件失败', e);
        return null;
    }
}

async function saveRelationsToMd(plugin, factions, relations) {
    if (plugin.settings.syncRelationsToMd === false) return;
    var path = getRelationMetaPath(plugin);
    var content = serializeRelationMetaMd(factions, relations);
    try {
        var existing = plugin.app.vault.getAbstractFileByPath(path);
        if (existing) {
            await plugin.app.vault.modify(existing, content);
        } else {
            var folder = path.substring(0, path.lastIndexOf('/'));
            if (folder && !await plugin.app.vault.adapter.exists(folder)) {
                await plugin.app.vault.adapter.mkdir(folder);
            }
            await plugin.app.vault.create(path, content);
        }
    } catch (e) {
        showUserError('写入关系与阵营文件失败', e);
    }
}

function stripWikiName(name) {
    var s = String(name || '').trim();
    var m = s.match(/^\[\[([^\]|#]+)/);
    return m ? m[1].trim() : s;
}

function relationPairKey(charA, charB, type) {
    var names = [String(charA || '').trim(), String(charB || '').trim()].sort();
    return names[0] + '\0' + names[1] + '\0' + String(type || '其他');
}

function parsePipeKv(text) {
    var map = {};
    var parts = String(text || '').split(/[｜|]/);
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (!p) continue;
        var sep = p.indexOf('：');
        if (sep === -1) sep = p.indexOf(':');
        if (sep === -1) {
            if (!map._head) map._head = p;
            continue;
        }
        map[p.substring(0, sep).trim()] = p.substring(sep + 1).trim();
    }
    return map;
}

function sanitizeRelField(value) {
    // 避免 ｜ 拆坏 MD 字段；全角竖线改为顿号分隔语义
    return String(value == null ? '' : value).replace(/[｜|]/g, '、').trim();
}

function sanitizeMdTableCell(value) {
    return String(value == null ? '' : value)
        .replace(/\r?\n/g, ' ')
        .replace(/\|/g, '、')
        .trim();
}

function splitMdTableRow(line) {
    var raw = String(line || '').trim();
    if (!raw.startsWith('|')) return null;
    if (raw.charAt(0) === '|') raw = raw.substring(1);
    if (raw.charAt(raw.length - 1) === '|') raw = raw.substring(0, raw.length - 1);
    return raw.split('|').map(function (c) { return c.trim(); });
}

function isMdTableSeparator(line) {
    var cells = splitMdTableRow(line);
    if (!cells || cells.length === 0) return false;
    for (var i = 0; i < cells.length; i++) {
        if (!/^:?-{1,}:?$/.test(cells[i].replace(/\s/g, ''))) return false;
    }
    return true;
}

function zipTableRowToMap(headers, cells) {
    var map = {};
    if (!headers || !cells) return map;
    for (var i = 0; i < headers.length; i++) {
        var key = String(headers[i] || '').trim();
        if (!key) continue;
        map[key] = cells[i] != null ? String(cells[i]).trim() : '';
    }
    return map;
}

function serializeCharRelationLine(ownerName, rel) {
    var other = rel.charA === ownerName ? rel.charB : rel.charA;
    var parts = [other + '：' + (rel.type || '其他'), '亲密度：' + (rel.intimacy != null ? rel.intimacy : 0)];
    if (rel.desc) parts.push('描述：' + sanitizeRelField(rel.desc));
    if (rel.startTime) parts.push('开始：' + sanitizeRelField(rel.startTime));
    if (rel.endTime) parts.push('结束：' + sanitizeRelField(rel.endTime));
    return '- ' + parts.join('｜');
}

function serializeCharHistoryLine(ownerName, record) {
    var other = record.charA === ownerName ? record.charB : (record.charB === ownerName ? record.charA : record.charB);
    // 手写 MD 不必填 id；插件内部用字段组合生成稳定 id
    var parts = [
        '对方：' + other,
        '旧：' + (record.oldValue != null ? record.oldValue : 0),
        '新：' + (record.newValue != null ? record.newValue : 0),
        '原因：' + (record.changeReason || ''),
        '时间：' + (record.timestamp || ''),
        '日期：' + (record.recordDate || '')
    ];
    if (record.customReason) parts.push('备注：' + record.customReason);
    else if (record.note) parts.push('备注：' + record.note);
    if (record.eventId) parts.push('事件：' + record.eventId);
    if (record.eventYear) parts.push('事件年：' + record.eventYear);
    if (record.eventText) parts.push('事件文：' + record.eventText);
    return '- ' + parts.join('｜');
}

function appendMdTable(outLines, headers, rows) {
    outLines.push('| ' + headers.join(' | ') + ' |');
    outLines.push('| ' + headers.map(function () { return '---'; }).join(' | ') + ' |');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var cells = [];
        for (var c = 0; c < headers.length; c++) {
            cells.push(sanitizeMdTableCell(row[c] != null ? row[c] : ''));
        }
        outLines.push('| ' + cells.join(' | ') + ' |');
    }
}

function serializeCharRelationTableLines(ownerName, rels) {
    var headers = ['对方', '类型', '亲密度', '描述', '开始', '结束'];
    var rows = [];
    for (var i = 0; i < rels.length; i++) {
        var rel = rels[i];
        var other = rel.charA === ownerName ? rel.charB : rel.charA;
        rows.push([
            other,
            rel.type || '其他',
            rel.intimacy != null ? rel.intimacy : 0,
            rel.desc || '',
            rel.startTime || '',
            rel.endTime || ''
        ]);
    }
    var lines = [];
    appendMdTable(lines, headers, rows);
    return lines;
}

function serializeCharHistoryTableLines(ownerName, histRecords) {
    var headers = ['对方', '旧', '新', '原因', '时间', '日期', '备注', '事件', '事件年', '事件文'];
    var rows = [];
    for (var i = 0; i < histRecords.length; i++) {
        var record = histRecords[i];
        var other = record.charA === ownerName ? record.charB : (record.charB === ownerName ? record.charA : record.charB);
        rows.push([
            other,
            record.oldValue != null ? record.oldValue : 0,
            record.newValue != null ? record.newValue : 0,
            record.changeReason || '',
            record.timestamp || '',
            record.recordDate || '',
            record.customReason || record.note || '',
            record.eventId || '',
            record.eventYear || '',
            record.eventText || ''
        ]);
    }
    var lines = [];
    appendMdTable(lines, headers, rows);
    return lines;
}

function normalizeHistoryMapKeys(map) {
    if (!map) return {};
    var out = Object.assign({}, map);
    if (out['人物'] && !out['对方']) out['对方'] = out['人物'];
    if (out['角色'] && !out['对方']) out['对方'] = out['角色'];
    if (out['旧值'] != null && out['旧'] == null) out['旧'] = out['旧值'];
    if (out['新值'] != null && out['新'] == null) out['新'] = out['新值'];
    if (out['时间点'] && !out['时间']) out['时间'] = out['时间点'];
    if (out['记录日期'] && !out['日期']) out['日期'] = out['记录日期'];
    return out;
}

function normalizeRelationMapKeys(map) {
    if (!map) return {};
    var out = Object.assign({}, map);
    if (out['人物'] && !out['对方']) out['对方'] = out['人物'];
    if (out['角色'] && !out['对方']) out['对方'] = out['角色'];
    if (out['关系类型'] && !out['类型']) out['类型'] = out['关系类型'];
    if (out['亲密'] != null && out['亲密度'] == null) out['亲密度'] = out['亲密'];
    if (out['开始时间'] && !out['开始']) out['开始'] = out['开始时间'];
    if (out['结束时间'] && !out['结束']) out['结束'] = out['结束时间'];
    return out;
}

function parseCharRelationFromMap(ownerName, rawMap) {
    var map = normalizeRelationMapKeys(rawMap);
    var other = '';
    var type = '其他';
    var knownRelKeys = {
        '亲密度': 1, '亲密': 1, '描述': 1, '开始': 1, '开始时间': 1,
        '结束': 1, '结束时间': 1, '对方': 1, '类型': 1, '关系类型': 1,
        '人物': 1, '角色': 1, '_head': 1
    };
    if (map._head) {
        var headSep = map._head.indexOf('：');
        if (headSep === -1) headSep = map._head.indexOf(':');
        if (headSep !== -1) {
            other = stripWikiName(map._head.substring(0, headSep));
            type = map._head.substring(headSep + 1).trim() || '其他';
        } else {
            other = stripWikiName(map._head);
        }
    }
    if (map['对方']) other = stripWikiName(map['对方']);
    if (map['类型']) type = map['类型'];
    if (!other) {
        for (var k in map) {
            if (!map.hasOwnProperty(k) || knownRelKeys[k]) continue;
            other = stripWikiName(k);
            if (!type || type === '其他') type = String(map[k] || '').trim() || '其他';
            break;
        }
    }
    if (!other || other === ownerName || other.indexOf('暂无') !== -1) return null;
    return {
        charA: ownerName,
        charB: other,
        type: type || '其他',
        intimacy: parseInt(map['亲密度'] != null ? map['亲密度'] : (map['亲密'] || '0'), 10) || 0,
        desc: map['描述'] || '',
        startTime: map['开始'] || map['开始时间'] || '',
        endTime: map['结束'] || map['结束时间'] || ''
    };
}

function parseCharHistoryFromMap(ownerName, rawMap) {
    var map = normalizeHistoryMapKeys(rawMap);
    var other = stripWikiName(map['对方'] || map._head || '');
    if (!other || other.indexOf('暂无') !== -1) return null;
    return {
        id: buildHistoryRecordId(ownerName, other, map),
        charA: ownerName,
        charB: other,
        oldValue: parseInt(map['旧'] != null && String(map['旧']).trim() !== '' ? map['旧'] : '0', 10) || 0,
        newValue: parseInt(map['新'] != null && String(map['新']).trim() !== '' ? map['新'] : '0', 10) || 0,
        changeReason: map['原因'] || '',
        timestamp: map['时间'] || map['时间点'] || '',
        recordDate: map['日期'] || '',
        note: map['备注'] || '',
        customReason: map['备注'] || '',
        eventId: map['事件'] || '',
        eventYear: map['事件年'] || '',
        eventText: map['事件文'] || ''
    };
}

function parseCharRelationLine(ownerName, lineText) {
    var body = lineText.replace(/^[-*]\s*/, '').trim();
    if (!body || body.indexOf('暂无') !== -1) return null;
    return parseCharRelationFromMap(ownerName, parsePipeKv(body));
}

function buildHistoryRecordId(ownerName, other, map) {
    if (map && (map['id'] || map['ID'])) return map['id'] || map['ID'];
    var pair = [String(ownerName || '').trim(), String(other || '').trim()].sort().join('\0');
    return [
        'ih_md',
        pair,
        map && map['旧'] != null ? map['旧'] : '0',
        map && map['新'] != null ? map['新'] : '0',
        (map && (map['时间'] || map['时间点'])) || '',
        (map && map['日期']) || '',
        (map && map['原因']) || '',
        (map && map['备注']) || ''
    ].join('_');
}

function parseCharHistoryLine(ownerName, lineText) {
    var body = lineText.replace(/^[-*]\s*/, '').trim();
    if (!body || body.indexOf('暂无') !== -1) return null;
    return parseCharHistoryFromMap(ownerName, parsePipeKv(body));
}

function parseCharEmbeddedRelationsAndHistory(content) {
    var relations = [];
    var history = [];
    var errors = [];
    if (!content || typeof content !== 'string') {
        return { relations: relations, history: history, errors: errors };
    }
    var lines = content.split('\n');
    var currentChar = null;
    var section = null;
    var tableHeaders = null;

    for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (!t) continue;
        if (t.startsWith('## ') && !t.startsWith('### ')) {
            currentChar = t.substring(3).trim();
            section = null;
            tableHeaders = null;
            continue;
        }
        if (!currentChar) continue;
        if (t === '### 关系' || t === '###关系') {
            section = 'rel';
            tableHeaders = null;
            continue;
        }
        if (t === '### 关系变化' || t === '###关系变化') {
            section = 'hist';
            tableHeaders = null;
            continue;
        }
        if (t.startsWith('### ')) {
            section = null;
            tableHeaders = null;
            continue;
        }
        if (t.startsWith('# ')) continue;
        if (section !== 'rel' && section !== 'hist') continue;

        if (t.startsWith('|')) {
            if (isMdTableSeparator(t)) continue;
            var cells = splitMdTableRow(t);
            if (!cells || cells.length === 0) continue;
            if (!tableHeaders) {
                tableHeaders = cells;
                continue;
            }
            var rowMap = zipTableRowToMap(tableHeaders, cells);
            if (section === 'rel') {
                var relFromTable = parseCharRelationFromMap(currentChar, rowMap);
                if (relFromTable) {
                    relations.push(relFromTable);
                } else if ((rowMap['对方'] || rowMap['人物'] || '').trim() &&
                    String(rowMap['对方'] || rowMap['人物'] || '').indexOf('暂无') === -1) {
                    errors.push({
                        line: i + 1,
                        char: currentChar,
                        section: '关系',
                        text: t,
                        reason: '表格行无法识别。表头示例：对方 | 类型 | 亲密度 | 描述 | 开始 | 结束'
                    });
                }
            } else {
                var histFromTable = parseCharHistoryFromMap(currentChar, rowMap);
                if (histFromTable) {
                    history.push(histFromTable);
                } else if ((rowMap['对方'] || rowMap['人物'] || '').trim() &&
                    String(rowMap['对方'] || rowMap['人物'] || '').indexOf('暂无') === -1) {
                    errors.push({
                        line: i + 1,
                        char: currentChar,
                        section: '关系变化',
                        text: t,
                        reason: '表格行无法识别。表头示例：对方 | 旧 | 新 | 原因 | 时间 | 日期 | 备注'
                    });
                }
            }
            continue;
        }

        if (!(t.startsWith('- ') || t.startsWith('* '))) continue;
        tableHeaders = null;
        if (section === 'rel') {
            var rel = parseCharRelationLine(currentChar, t);
            if (rel) {
                relations.push(rel);
            } else if (t.indexOf('暂无') === -1) {
                errors.push({
                    line: i + 1,
                    char: currentChar,
                    section: '关系',
                    text: t,
                    reason: '无法识别。推荐表格：| 对方 | 类型 | 亲密度 | 描述 | 开始 | 结束 |；旧格式：- 李四：朋友｜亲密度：3'
                });
            }
        } else if (section === 'hist') {
            var hist = parseCharHistoryLine(currentChar, t);
            if (hist) {
                history.push(hist);
            } else if (t.indexOf('暂无') === -1) {
                errors.push({
                    line: i + 1,
                    char: currentChar,
                    section: '关系变化',
                    text: t,
                    reason: '无法识别。推荐表格：| 对方 | 旧 | 新 | 原因 | 时间 | 日期 | 备注 |；旧格式：- 对方：李四｜旧：1｜新：3｜原因：自定义描述｜时间：前280年｜日期：2026-08-02'
                });
            }
        }
    }

    var relMap = {};
    var dedupedRels = [];
    for (var ri = 0; ri < relations.length; ri++) {
        var r = relations[ri];
        var key = relationPairKey(r.charA, r.charB, r.type);
        if (!relMap[key]) {
            relMap[key] = r;
            dedupedRels.push(r);
        } else {
            var prev = relMap[key];
            if (!prev.desc && r.desc) prev.desc = r.desc;
            if (!prev.startTime && r.startTime) prev.startTime = r.startTime;
            if (!prev.endTime && r.endTime) prev.endTime = r.endTime;
            if ((prev.intimacy == null || prev.intimacy === 0) && r.intimacy) prev.intimacy = r.intimacy;
        }
    }

    var histMap = {};
    var dedupedHist = [];
    for (var hi = 0; hi < history.length; hi++) {
        var h = history[hi];
        var hk = h.id || (h.charA + '|' + h.charB + '|' + h.timestamp + '|' + h.oldValue + '|' + h.newValue);
        if (!histMap[hk]) {
            histMap[hk] = true;
            dedupedHist.push(h);
        }
    }
    return { relations: dedupedRels, history: dedupedHist, errors: errors };
}

function appendCharRelationSections(outLines, charName, relations, intimacyHistory) {
    var rels = [];
    for (var i = 0; i < (relations || []).length; i++) {
        var r = relations[i];
        if (r.charA === charName || r.charB === charName) rels.push(r);
    }
    outLines.push('');
    outLines.push('### 关系');
    if (rels.length === 0) {
        appendMdTable(outLines, ['对方', '类型', '亲密度', '描述', '开始', '结束'], []);
    } else {
        var relLines = serializeCharRelationTableLines(charName, rels);
        for (var rli = 0; rli < relLines.length; rli++) outLines.push(relLines[rli]);
    }

    var hist = [];
    for (var hi = 0; hi < (intimacyHistory || []).length; hi++) {
        var h = intimacyHistory[hi];
        if (h.charA === charName || h.charB === charName) hist.push(h);
    }
    outLines.push('');
    outLines.push('### 关系变化');
    if (hist.length === 0) {
        appendMdTable(outLines, ['对方', '旧', '新', '原因', '时间', '日期', '备注', '事件', '事件年', '事件文'], []);
    } else {
        var sorted = hist.slice().sort(function (a, b) {
            return String(a.recordDate || '').localeCompare(String(b.recordDate || '')) ||
                String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
        });
        var histLines = serializeCharHistoryTableLines(charName, sorted);
        for (var hli = 0; hli < histLines.length; hli++) outLines.push(histLines[hli]);
    }
    outLines.push('');
}

async function syncRelationsIntoCharMd(app, plugin, relations, intimacyHistory) {
    if (plugin.settings.syncRelationsToCharMd === false) return;
    // 与加载路径一致，避免写入/读取落到不同文件
    var fullPath = getCharFullPath(plugin);
    var file = app.vault.getAbstractFileByPath(fullPath);
    if (!file) {
        fullPath = getCharFullPathForExt(plugin);
        file = app.vault.getAbstractFileByPath(fullPath);
    }
    if (!file) {
        console.log('同步关系到人物 MD 失败：未找到人物索引', fullPath);
        return;
    }
    try {
        var content = await app.vault.read(file);
        var lines = content.split('\n');
        var out = [];
        var currentChar = null;
        var skippingRelSection = false;
        var fieldLines = [];
        var afterFieldLines = [];
        var inFields = false;

        function flushChar() {
            if (!currentChar) return;
            for (var fi = 0; fi < fieldLines.length; fi++) out.push(fieldLines[fi]);
            appendCharRelationSections(out, currentChar, relations, intimacyHistory);
            for (var ai = 0; ai < afterFieldLines.length; ai++) out.push(afterFieldLines[ai]);
            currentChar = null;
            fieldLines = [];
            afterFieldLines = [];
            inFields = false;
            skippingRelSection = false;
        }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.trim();
            if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
                flushChar();
                currentChar = trimmed.substring(3).trim();
                out.push(line);
                inFields = true;
                continue;
            }
            if (currentChar && (trimmed === '### 关系' || trimmed === '###关系' ||
                trimmed === '### 关系变化' || trimmed === '###关系变化')) {
                skippingRelSection = true;
                inFields = false;
                continue;
            }
            if (skippingRelSection) {
                if (trimmed.startsWith('### ') || (trimmed.startsWith('## ') && !trimmed.startsWith('### '))) {
                    skippingRelSection = false;
                    i--;
                    continue;
                }
                continue;
            }
            if (!currentChar) {
                out.push(line);
                continue;
            }
            // 人物信息字段（- xxx：yyy）紧跟在 ## 名下；其后的其它小节仍保留在关系之后
            if (inFields && (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed === '')) {
                fieldLines.push(line);
                continue;
            }
            if (inFields && trimmed.startsWith('### ')) {
                inFields = false;
                afterFieldLines.push(line);
                continue;
            }
            if (inFields) {
                inFields = false;
            }
            afterFieldLines.push(line);
        }
        flushChar();
        var next = out.join('\n').replace(/\n{3,}/g, '\n\n');
        if (next !== content) await app.vault.modify(file, next);
    } catch (e) {
        showUserError('同步关系到人物 MD 失败', e);
    }
}

function mergeCsvSetting(existing, additions) {
    var set = {};
    var list = [];
    function addOne(v) {
        var s = String(v || '').trim();
        if (!s || set[s]) return;
        set[s] = true;
        list.push(s);
    }
    String(existing || '').split(',').forEach(addOne);
    (additions || []).forEach(addOne);
    return list.join(',');
}

function syncFactionsFromChars(chars, factions, factionFieldName) {
    var list = (factions || []).slice();
    var existing = {};
    for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].name) existing[list[i].name] = list[i];
    }
    var fieldNames = [];
    function addFieldName(n) {
        var s = String(n || '').trim();
        if (!s || fieldNames.indexOf(s) !== -1) return;
        fieldNames.push(s);
    }
    addFieldName(factionFieldName || '阵营');
    addFieldName('阵营');
    addFieldName('势力');
    addFieldName('所属组织');
    addFieldName('所属势力');
    var palette = ['#4a90e2', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e'];
    var added = false;
    for (var ci = 0; ci < (chars || []).length; ci++) {
        var fields = (chars[ci] && chars[ci].fields) || {};
        for (var fi = 0; fi < fieldNames.length; fi++) {
            var raw = fields[fieldNames[fi]];
            if (!raw) continue;
            String(raw).split(/[,，、;；|/]/).forEach(function(part) {
                var name = stripWikiName(part);
                if (!name || name.indexOf('暂无') !== -1 || existing[name]) return;
                var faction = {
                    name: name,
                    color: palette[Object.keys(existing).length % palette.length],
                    desc: ''
                };
                existing[name] = faction;
                list.push(faction);
                added = true;
            });
        }
    }
    return { factions: list, added: added };
}

function syncSettingsFromParsedData(plugin, chars, relations, timeline) {
    if (plugin.settings.autoDiscoverFromMd === false) return false;
    var changed = false;
    var builtInFields = {
        '身份': 1, '阵营': 1, '首次出场': 1, '死亡': 1, '死亡时间': 1,
        '出生': 1, '出生时间': 1, '年龄': 1, '性别': 1, '种族': 1,
        '职业': 1, '居住地': 1, '别名': 1, '亲密人物': 1, '类型': 1, '章节笔记': 1
    };
    var fieldKeys = [];
    for (var i = 0; i < (chars || []).length; i++) {
        var f = chars[i].fields || {};
        for (var k in f) {
            if (f.hasOwnProperty(k) && !builtInFields[k]) fieldKeys.push(k);
        }
    }
    var nextFields = mergeCsvSetting(plugin.settings.customFields, fieldKeys);
    if (nextFields !== (plugin.settings.customFields || '')) {
        plugin.settings.customFields = nextFields;
        changed = true;
    }

    var types = [];
    for (var ri = 0; ri < (relations || []).length; ri++) {
        if (relations[ri].type) types.push(relations[ri].type);
    }
    var nextTypes = mergeCsvSetting(plugin.settings.customRelationTypes, types);
    if (nextTypes !== (plugin.settings.customRelationTypes || '')) {
        plugin.settings.customRelationTypes = nextTypes;
        changed = true;
    }

    var tagMap = {};
    var customTags = Array.isArray(plugin.settings.customEventTags) ? plugin.settings.customEventTags : [];
    var deletedTagValues = Array.isArray(plugin.settings.deletedEventTagValues) ? plugin.settings.deletedEventTagValues : [];
    var tagsNormalized = false;
    for (var ti = 0; ti < customTags.length; ti++) {
        var ct = normalizeEventTag(customTags[ti]);
        if (!ct) continue;
        if (!customTags[ti].value || customTags[ti].value !== ct.value ||
            customTags[ti].label !== ct.label || customTags[ti].color !== ct.color) {
            tagsNormalized = true;
        }
        tagMap[ct.value] = ct;
    }
    var tagAdded = false;
    var palette = ['#4a90e2', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e'];
    for (var ei = 0; ei < (timeline || []).length; ei++) {
        var tag = (timeline[ei].tag || '').trim();
        if (!tag || tagMap[tag] || deletedTagValues.indexOf(tag) >= 0) continue;
        tagMap[tag] = {
            value: tag,
            label: tag,
            color: palette[Object.keys(tagMap).length % palette.length]
        };
        tagAdded = true;
    }
    if (tagAdded || tagsNormalized) {
        plugin.settings.customEventTags = Object.keys(tagMap).map(function(key) { return tagMap[key]; });
        changed = true;
    }
    return changed;
}

function removeIntimacyHistoryForPair(plugin, charA, charB) {
    var history = ensureIntimacyHistory(plugin);
    plugin._intimacyHistory = history.filter(function(h) {
        return !((h.charA === charA && h.charB === charB) || (h.charA === charB && h.charB === charA));
    });
}

function getTimelineTimePoints(timeline, settings) {
    var points = [];
    var seen = {};
    for (var i = 0; i < timeline.length; i++) {
        var evt = timeline[i];
        var label = getTimelineStoryTimeLabel(evt);
        if (label && label !== '未注明故事时间' && !seen[label]) {
            seen[label] = true;
            points.push({ label: label, year: label, volume: '' });
        }
    }
    return points;
}

function getTimelineStoryTimeLabel(evt) {
    if (evt && String(evt.storyYear || '').trim()) return String(evt.storyYear).trim();
    // Legacy records used the H2 heading as a date. Keep those dates usable,
    // but never mistake a chapter heading for story chronology.
    var legacy = evt && String(evt.year || '').trim();
    var legacyParsed = legacy ? parseHistoricalDate(legacy) : null;
    if (legacy && !parseChapterHeading(legacy) && legacy !== UNLOCATED_CHAPTER_GROUP && legacyParsed && legacyParsed.sortValue !== null) return legacy;
    return '未注明故事时间';
}

function getSortedTimelineEvents(timeline) {
    return timeline.slice().sort(function(a, b) {
        var as = eventSortValue(a);
        var bs = eventSortValue(b);
        if (as !== null && bs !== null && as !== bs) return as - bs;
        // Unknown or non-numeric story times keep their original author-entered order.
        // Chapter order is a narrative presentation detail, not story chronology.
        var ai = a && a._lineIndex != null ? Number(a._lineIndex) : null;
        var bi = b && b._lineIndex != null ? Number(b._lineIndex) : null;
        if (ai !== null && bi !== null && ai !== bi) return ai - bi;
        return String(a && a.eventId || '').localeCompare(String(b && b.eventId || ''));
    });
}

function eventSortValue(evt) {
    if (!evt) return null;
    var story = String(evt.storyYear || '').trim();
    if (story) return getTimeSortValue(story);
    var legacy = String(evt.year || '').trim();
    if (!legacy || parseChapterHeading(legacy) || legacy === UNLOCATED_CHAPTER_GROUP) return null;
    return getTimeSortValue(legacy);
}

function getNextTimePoint(timeline, currentTimeStr) {
    if (!timeline.length) return '';
    var sorted = getSortedTimelineEvents(timeline);
    if (!currentTimeStr) return sorted[0].year;
    for (var i = 0; i < sorted.length; i++) {
        if (sorted[i].year === currentTimeStr || (sorted[i].volume + ' / ' + sorted[i].year) === currentTimeStr) {
            return sorted[i + 1] ? sorted[i + 1].year : sorted[i].year;
        }
    }
    return sorted[0].year;
}

function applyNovelTagPreset(plugin, presetKey) {
    var preset = NOVEL_TAG_PRESETS[presetKey];
    if (!preset) return;
    plugin.settings.customEventTags = JSON.parse(JSON.stringify(preset.tags));
    plugin.settings.novelTagPreset = presetKey;
}

function getUnredeemedPlotEvents(timeline) {
    return getUnredeemedPlotLines(timeline).reduce(function(acc, g) {
        return acc.concat(g.events.filter(function(e) { return !PLOT_CLOSED_STATUSES[e.plotStatus]; }));
    }, []);
}

function latestMeaningfulPlotStatus(events) {
    for (var i = events.length - 1; i >= 0; i--) {
        var st = events[i].plotStatus;
        if (st && st !== '搁置') return { status: st, event: events[i], index: i };
    }
    return { status: '', event: null, index: -1 };
}

function getPlotLineGroups(timeline) {
    var groups = {};
    var ordered = getSortedTimelineEvents(timeline);
    for (var i = 0; i < ordered.length; i++) {
        var e = ordered[i];
        if (!e.plotLine) continue;
        if (!groups[e.plotLine]) {
            groups[e.plotLine] = {
                plotLine: e.plotLine, events: [], latestStatus: '', isRedeemed: false,
                mergedInto: '', maxConflict: 0, beats: [], acts: []
            };
        }
        groups[e.plotLine].events.push(e);
        if (e.mergeInto) groups[e.plotLine].mergedInto = e.mergeInto;
        var cl = parseInt(e.conflictLevel, 10);
        if (!isNaN(cl) && cl > groups[e.plotLine].maxConflict) groups[e.plotLine].maxConflict = cl;
        if (e.plotBeat && groups[e.plotLine].beats.indexOf(e.plotBeat) === -1) groups[e.plotLine].beats.push(e.plotBeat);
        if (e.plotAct && groups[e.plotLine].acts.indexOf(e.plotAct) === -1) groups[e.plotLine].acts.push(e.plotAct);
    }
    var result = [];
    for (var key in groups) {
        if (!groups.hasOwnProperty(key)) continue;
        var g = groups[key];
        var last = latestMeaningfulPlotStatus(g.events);
        g.latestStatus = last.status || '';
        g.isRedeemed = !!(PLOT_CLOSED_STATUSES[last.status]);
        result.push(g);
    }
    result.sort(function(a, b) { return a.plotLine.localeCompare(b.plotLine, 'zh-CN'); });
    return result;
}

function getUnredeemedPlotLines(timeline) {
    return getPlotLineGroups(timeline).filter(function(g) { return !g.isRedeemed; });
}

function isSimilarPlotLineName(a, b) {
    if (!a || !b || a === b) return false;
    var na = String(a).replace(/[\s_·]/g, '').toLowerCase();
    var nb = String(b).replace(/[\s_·]/g, '').toLowerCase();
    if (na === nb) return true;
    var da = String(a).replace(/[\s_·]/g, '-').toLowerCase();
    var db = String(b).replace(/[\s_·]/g, '-').toLowerCase();
    if ((da.indexOf(db + '-') === 0 || db.indexOf(da + '-') === 0)) return false;
    if (na.length >= 4 && nb.length >= 4) {
        var longer = na.length >= nb.length ? na : nb;
        var shorter = na.length >= nb.length ? nb : na;
        if (longer.indexOf(shorter) === 0) {
            var rest = longer.substring(shorter.length);
            if (/[A-Za-z0-9\u4e00-\u9fff]/.test(rest)) return false;
        }
    }
    if (na.length >= 4 && nb.length >= 4 && Math.abs(na.length - nb.length) <= 1) {
        var dist = 0;
        var maxL = Math.max(na.length, nb.length);
        for (var i = 0; i < maxL; i++) {
            if (na.charAt(i) !== nb.charAt(i)) dist++;
            if (dist > 1) return false;
        }
        return dist === 1;
    }
    return false;
}

function validatePlotLines(timeline) {
    var warnings = [];
    var groups = getPlotLineGroups(timeline);
    var statusOrder = { '埋设': 1, '推进': 2, '升级': 3, '假回收': 2, '并入': 4, '回收': 4 };

    for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi];
        var events = g.events;
        var firstIdx = {};
        var lastTrueRecycle = -1;
        var lastFakeRecycle = -1;

        for (var i = 0; i < events.length; i++) {
            var st = events[i].plotStatus;
            if (st && firstIdx[st] === undefined) firstIdx[st] = i;
            if (st === '回收') lastTrueRecycle = i;
            if (st === '假回收') lastFakeRecycle = i;
            if (lastTrueRecycle !== -1 && i > lastTrueRecycle && st && st !== '回收' && st !== '搁置') {
                var afterFake = lastFakeRecycle > lastTrueRecycle;
                if (st === '推进' || st === '升级' || st === '埋设' || st === '假回收') {
                    warnings.push({
                        type: 'reopen_after_recycle',
                        severity: afterFake ? 'low' : 'info',
                        plotLine: g.plotLine,
                        message: '「' + g.plotLine + '」在「' + events[lastTrueRecycle].year + '」标记回收后，于「' + events[i].year + '」再次「' + st + '」——若是假回收再爆，请把前一次改成「假回收」',
                        event: events[i]
                    });
                } else if (st !== '并入') {
                    warnings.push({
                        type: 'after_recycle',
                        severity: 'medium',
                        plotLine: g.plotLine,
                        message: '「' + g.plotLine + '」已在「' + events[lastTrueRecycle].year + '」回收，但「' + events[i].year + '」仍有「' + st + '」',
                        event: events[i]
                    });
                }
            }
        }

        if (firstIdx['回收'] !== undefined && firstIdx['埋设'] !== undefined && firstIdx['回收'] < firstIdx['埋设']) {
            warnings.push({
                type: 'recycle_before_plant',
                severity: 'high',
                plotLine: g.plotLine,
                message: '「' + g.plotLine + '」的「回收」出现在「埋设」之前',
                event: events[firstIdx['回收']]
            });
        }
        if (firstIdx['推进'] !== undefined && firstIdx['埋设'] !== undefined && firstIdx['推进'] < firstIdx['埋设']) {
            warnings.push({
                type: 'advance_before_plant',
                severity: 'low',
                plotLine: g.plotLine,
                message: '「' + g.plotLine + '」的「推进」出现在「埋设」之前（可能是中途接入）',
                event: events[firstIdx['推进']]
            });
        }

        for (var j = 1; j < events.length; j++) {
            var prevSt = events[j - 1].plotStatus;
            var curSt = events[j].plotStatus;
            if (!prevSt || !curSt || prevSt === '搁置' || curSt === '搁置') continue;
            if (prevSt === '假回收' && (curSt === '推进' || curSt === '升级' || curSt === '埋设')) continue;
            if (prevSt === '回收' && (curSt === '推进' || curSt === '升级' || curSt === '假回收' || curSt === '埋设')) continue;
            if (statusOrder[prevSt] && statusOrder[curSt] && statusOrder[curSt] < statusOrder[prevSt]) {
                warnings.push({
                    type: 'status_regress',
                    severity: 'low',
                    plotLine: g.plotLine,
                    message: '「' + g.plotLine + '」状态从「' + prevSt + '」回到「' + curSt + '」（' + events[j].year + '）',
                    event: events[j]
                });
            }
        }
    }

    for (var a = 0; a < groups.length; a++) {
        for (var b = a + 1; b < groups.length; b++) {
            if (isSimilarPlotLineName(groups[a].plotLine, groups[b].plotLine)) {
                warnings.push({
                    type: 'similar_name',
                    severity: 'low',
                    plotLine: groups[a].plotLine,
                    message: '情节线名称非常接近：「' + groups[a].plotLine + '」与「' + groups[b].plotLine + '」（带序号后缀的不算合并提示）'
                });
            }
        }
    }
    return warnings;
}

// 事件身份与故事设计保存在插件 data.json，不写入作者的时间线 Markdown。
function rwEventFingerprint(evt, timelinePath) {
    var raw = [timelinePath || '', evt.year || '', evt.month || '', evt.tag || '', evt.event || ''].join('\u001f');
    var hash = 2166136261;
    for (var i = 0; i < raw.length; i++) { hash ^= raw.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return 'rwf-' + (hash >>> 0).toString(36);
}
function rwGetEventRegistry(plugin) {
    if (!plugin.settings.timelineEventRegistry || typeof plugin.settings.timelineEventRegistry !== 'object') plugin.settings.timelineEventRegistry = {};
    return plugin.settings.timelineEventRegistry;
}
async function rwSaveEventRegistry(plugin) {
    if (plugin && typeof plugin.saveSettings === 'function') await plugin.saveSettings();
}
async function rwReconcileTimelineEventRegistry(view, timelinePath) {
    var registry = rwGetEventRegistry(view.plugin);
    var entries = Array.isArray(registry[timelinePath]) ? registry[timelinePath] : [];
    var used = {};
    var changed = false;
    var occurrence = {};
    (view.timeline || []).forEach(function(evt) {
        var fp = rwEventFingerprint(evt, timelinePath);
        var n = occurrence[fp] || 0; occurrence[fp] = n + 1;
        var key = fp + ':' + n;
        var found = entries.find(function(entry) { return !used[entry.id] && entry.key === key; });
        if (!found && evt.eventId) found = entries.find(function(entry) { return !used[entry.id] && entry.id === evt.eventId; });
        if (found) {
            used[found.id] = true;
            if (found.fingerprint !== fp || found.key !== key || found.lineIndex !== evt._lineIndex) changed = true;
            found.fingerprint = fp; found.key = key; found.lineIndex = evt._lineIndex;
            if (evt.storyDesigns && Object.keys(evt.storyDesigns).length && (!found.storyDesigns || !Object.keys(found.storyDesigns).length)) { found.storyDesigns = evt.storyDesigns; changed = true; }
            evt.eventId = found.id;
            evt.storyDesigns = found.storyDesigns || {};
        } else {
            var id = evt.eventId || createTimelineEventId();
            evt.eventId = id;
            evt.storyDesigns = evt.storyDesigns || {};
            entries.push({ id: id, fingerprint: fp, key: key, lineIndex: evt._lineIndex, storyDesigns: evt.storyDesigns });
            used[id] = true; changed = true;
        }
    });
    // Retain entries for temporarily absent events (e.g. filtered/imported timeline sections).
    registry[timelinePath] = entries;
    if (changed) await rwSaveEventRegistry(view.plugin);
}
async function rwStripLegacyEventIdentityMetadata(view, timelineFile, content) {
    var lines = content.split('\n');
    var changed = false;
    (view.timeline || []).forEach(function(evt) {
        var i = evt._lineIndex;
        if (i == null || i < 0 || i >= lines.length) return;
        var line = lines[i];
        if (!/\|\s*(?:事件ID|故事设计)\s*[:：]/.test(line)) return;
        var prefix = (line.match(/^(\s*(?:[-*]\s*))/) || [''])[0];
        lines[i] = prefix + buildEventMdLine(evt).replace(/^-\s*/, '');
        changed = true;
    });
    if (changed) {
        var cleaned = lines.join('\n');
        await view.app.vault.modify(timelineFile, cleaned);
        view._lastTimelineMd = cleaned;
    }
}

async function rwSaveEventStoryDesign(plugin, evt, designs) {
    // Use the exact same canonical path as loadAllData()/rwReconcileTimelineEventRegistry.
    // A different fallback path creates a second registry bucket and breaks IDs after reload.
    var path = getTimelineFullPath(plugin);
    var registry = rwGetEventRegistry(plugin);
    var entries = Array.isArray(registry[path]) ? registry[path] : (registry[path] = []);
    var entry = entries.find(function(x) { return x.id === evt.eventId; });
    if (!entry) {
        entry = { id: evt.eventId || createTimelineEventId(), fingerprint: rwEventFingerprint(evt, path), lineIndex: evt._lineIndex, key: '' };
        evt.eventId = entry.id; entries.push(entry);
    }
    entry.storyDesigns = designs || {};
    await rwSaveEventRegistry(plugin);
    return true;
}
async function rwUpdateEventRegistryAfterEdit(plugin, originalEvt, newEvt) {
    var path = getTimelineFullPathForExt(plugin);
    var entries = rwGetEventRegistry(plugin)[path] || [];
    var entry = entries.find(function(x) { return x.id === originalEvt.eventId; });
    if (!entry) return;
    entry.fingerprint = rwEventFingerprint(newEvt, path);
    entry.lineIndex = originalEvt._lineIndex;
    entry.storyDesigns = entry.storyDesigns || originalEvt.storyDesigns || {};
    var fp = entry.fingerprint;
    var same = entries.filter(function(x) { return x.fingerprint === fp; });
    entry.key = fp + ':' + Math.max(0, same.indexOf(entry));
    await rwSaveEventRegistry(plugin);
}

function buildEventMdLine(evt) {
    var tagPart = evt.tag ? '[' + evt.tag + '] ' : '';
    return '- ' + tagPart + serializeEventMeta({
        event: evt.event,
        chapterNotes: evt.chapterNotes || (evt.chapterNote ? [evt.chapterNote] : []),
        plotLine: evt.plotLine || '',
        plotStatus: evt.plotStatus || '',
        plotBeat: evt.plotBeat || '',
        plotAct: evt.plotAct || '',
        conflictLevel: evt.conflictLevel || '',
        mergeInto: evt.mergeInto || '',
        storyYear: evt.storyYear || '',
        chapterNote: evt.chapterNote || '',
    });
}

async function deleteEventFromMd(app, plugin, eventOrLineIndex) {
    var fullPath = getTimelineFullPathForExt(plugin);
    var file = app.vault.getAbstractFileByPath(fullPath);
    var lineIndex = typeof eventOrLineIndex === 'object' && eventOrLineIndex ? eventOrLineIndex._lineIndex : eventOrLineIndex;
    if (!file || lineIndex == null || lineIndex < 0) return false;
    var content = await app.vault.read(file);
    var lines = content.split('\n');
    if (lineIndex >= lines.length) return false;
    // 若行索引已因其他编辑而过期，不删除当前行，避免误删另一条事件。
    if (typeof eventOrLineIndex === 'object' && eventOrLineIndex) {
        var expected = String(eventOrLineIndex.event || '').trim();
        var actual = String(lines[lineIndex] || '');
        if (!expected || actual.indexOf(expected) === -1) {
            new obsidian.Notice('⚠️ 事件位置已变化，未执行删除。请刷新时间线后重试。', 7000);
            return false;
        }
    }
    lines.splice(lineIndex, 1);
    await app.vault.modify(file, lines.join('\n'));
    return true;
}

async function updateEventInMd(app, plugin, originalEvt, newEvt) {
    var fullPath = getTimelineFullPathForExt(plugin);
    var file = app.vault.getAbstractFileByPath(fullPath);
    if (!file || originalEvt._lineIndex == null || originalEvt._lineIndex < 0) return false;
    var content = await app.vault.read(file);
    var lines = content.split('\n');
    if (originalEvt._lineIndex >= lines.length) return false;
    var expectedText = String(originalEvt.event || '').trim();
    if (!expectedText || String(lines[originalEvt._lineIndex] || '').indexOf(expectedText) === -1) {
        new obsidian.Notice('⚠️ 事件位置已变化，未执行修改。请刷新时间线后重试。', 7000);
        return false;
    }
    // 先移除旧事件行，再按新年份/月份放回对应分组；仅一次 Vault 写入，避免先删后增造成丢失。
    lines.splice(originalEvt._lineIndex, 1);
    var yearHeading = '## ' + String(newEvt.year || '').trim();
    var monthValue = String(newEvt.month || '未标注').trim();
    var yearIndex = -1;
    for (var yi = 0; yi < lines.length; yi++) {
        if (String(lines[yi] || '').trim() === yearHeading) { yearIndex = yi; break; }
    }
    if (yearIndex < 0) {
        while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
        if (lines.length) lines.push('');
        lines.push(yearHeading);
        yearIndex = lines.length - 1;
    }
    var sectionEnd = lines.length;
    for (var se = yearIndex + 1; se < lines.length; se++) {
        if (/^##\s+/.test(String(lines[se] || '').trim())) { sectionEnd = se; break; }
    }
    var insertAt = yearIndex + 1;
    if (monthValue && monthValue !== '未标注') {
        var monthHeading = '### ' + monthValue;
        var monthIndex = -1;
        for (var mi = yearIndex + 1; mi < sectionEnd; mi++) {
            if (String(lines[mi] || '').trim() === monthHeading) { monthIndex = mi; break; }
        }
        if (monthIndex < 0) {
            // 在该年份分组末尾创建月份标题，避免插入到相邻年份。
            insertAt = sectionEnd;
            while (insertAt > yearIndex + 1 && !String(lines[insertAt - 1] || '').trim()) insertAt--;
            lines.splice(insertAt, 0, monthHeading);
            monthIndex = insertAt;
        }
        insertAt = monthIndex + 1;
        while (insertAt < lines.length && !String(lines[insertAt] || '').trim()) insertAt++;
        while (insertAt < lines.length && !/^#{1,3}\s+/.test(String(lines[insertAt] || '').trim())) insertAt++;
    } else {
        insertAt = yearIndex + 1;
        while (insertAt < sectionEnd && !/^#{1,2}\s+/.test(String(lines[insertAt] || '').trim())) insertAt++;
    }
    lines.splice(insertAt, 0, buildEventMdLine(newEvt));
    originalEvt._lineIndex = insertAt;
    await app.vault.modify(file, lines.join('\n'));
    await rwUpdateEventRegistryAfterEdit(plugin, originalEvt, newEvt);
    return true;
}

function getPlotLineGroup(timeline, plotLineName) {
    var groups = getPlotLineGroups(timeline);
    for (var i = 0; i < groups.length; i++) {
        if (groups[i].plotLine === plotLineName) return groups[i];
    }
    return null;
}

function buildCharMdBlock(name, fields, relations, intimacyHistory) {
    var lines = ['## ' + name];
    for (var k in fields) {
        if (fields.hasOwnProperty(k) && fields[k]) {
            lines.push('- ' + k + '：' + fields[k]);
        }
    }
    appendCharRelationSections(lines, name, relations || [], intimacyHistory || []);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function appendCharToMd(app, plugin, name, fields) {
    var path = plugin.settings.charFile ? resolveCharPathForExt(plugin) : '人物索引.md';
    var fullPath = getCharFullPathForExt(plugin);
    var block = buildCharMdBlock(name, fields);
    var existing = app.vault.getAbstractFileByPath(fullPath);
    if (existing) {
        var content = await app.vault.read(existing);
        if (content.indexOf('## ' + name) !== -1) {
            return updateCharInMd(app, plugin, name, fields);
        }
        await app.vault.modify(existing, content.trim() + '\n\n' + block + '\n');
    } else {
        var folder = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (folder && !await app.vault.adapter.exists(folder)) await app.vault.adapter.mkdir(folder);
        await app.vault.create(fullPath, '# 人物索引\n\n' + block + '\n');
    }
}

async function updateCharInMd(app, plugin, name, fields) {
    var fullPath = getCharFullPathForExt(plugin);
    var file = app.vault.getAbstractFileByPath(fullPath);
    if (!file) return false;
    var content = await app.vault.read(file);
    var lines = content.split('\n');
    var out = [];
    var inTarget = false;
    var inSubSection = false;
    var replaced = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.trim();
        if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
            inTarget = false;
            inSubSection = false;
            if (trimmed === '## ' + name) {
                inTarget = true;
                out.push(line);
                for (var k2 in fields) {
                    if (fields.hasOwnProperty(k2) && fields[k2]) out.push('- ' + k2 + '：' + fields[k2]);
                }
                replaced = true;
                continue;
            }
            out.push(line);
            continue;
        }
        if (inTarget) {
            if (trimmed.startsWith('### ')) {
                inSubSection = true;
                out.push(line);
                continue;
            }
            if (inSubSection) {
                out.push(line);
                continue;
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) continue;
            out.push(line);
            continue;
        }
        out.push(line);
    }
    if (!replaced) {
        out.push('');
        out.push(buildCharMdBlock(name, fields));
    }
    await app.vault.modify(file, out.join('\n'));
    return true;
}

function resolveCharPathForExt(plugin) {
    var folder = (plugin.settings.charFolder || '').trim();
    if (!folder) {
        var f = plugin.app.workspace.getActiveFile();
        if (f && f.parent) folder = f.parent.path;
    }
    return (plugin.settings.charFile || '人物索引.md').trim();
}

function getCharFullPathForExt(plugin) {
    var folder = (plugin.settings.charFolder || '').trim();
    if (!folder) {
        var f = plugin.app.workspace.getActiveFile();
        if (f && f.parent) folder = f.parent.path;
    }
    var fname = (plugin.settings.charFile || '人物索引.md').trim();
    return folder ? folder + '/' + fname : fname;
}

function getTimelineFullPathForExt(plugin) {
    var folder = (plugin.settings.timelineFolder || plugin.settings.charFolder || '').trim();
    if (!folder) {
        var f = plugin.app.workspace.getActiveFile();
        if (f && f.parent) folder = f.parent.path;
    }
    var fname = (plugin.settings.timelineFile || '时间线.md').trim();
    return folder ? folder + '/' + fname : fname;
}

async function appendEventToMd(app, plugin, evt) {
    var fullPath = getTimelineFullPathForExt(plugin);
    var existing = app.vault.getAbstractFileByPath(fullPath);
    var tagPart = evt.tag ? '[' + evt.tag + '] ' : '';
    var line = '- ' + tagPart + serializeEventMeta(evt);
    var section = '';
    var eventGroup = String(evt.year || '').trim() || UNLOCATED_CHAPTER_GROUP;

    if (plugin.settings.timelineMode === 'chapter' && evt.volume) {
        section += '# ' + evt.volume + '\n\n';
    }
    section += '## ' + eventGroup + '\n';
    if (evt.month && evt.month !== '未标注') section += '### ' + evt.month + '：\n';
    section += line + '\n';

    if (existing) {
        var content = await app.vault.read(existing);
        if (content.indexOf('## ' + eventGroup) !== -1) {
            var idx = content.indexOf('## ' + eventGroup);
            var after = content.indexOf('\n', idx) + 1;
            var before = content.substring(0, after);
            var rest = content.substring(after);
            var nextH2 = rest.search(/\n## /);
            if (nextH2 === -1) {
                await app.vault.modify(existing, content.trim() + '\n' + line + '\n');
            } else {
                var insertAt = after + nextH2;
                await app.vault.modify(existing, content.substring(0, insertAt) + line + '\n' + content.substring(insertAt));
            }
        } else {
            await app.vault.modify(existing, content.trim() + '\n\n' + section);
        }
    } else {
        var folder = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (folder && !await app.vault.adapter.exists(folder)) await app.vault.adapter.mkdir(folder);
        await app.vault.create(fullPath, '# 时间线\n\n' + section);
    }
}

function renderWikiLinksInElement(container, app, onClick) {
    var wikiPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (var i = 0; i < textNodes.length; i++) {
        var node = textNodes[i];
        var text = node.nodeValue || '';
        if (text.indexOf('[[') === -1) continue;
        wikiPattern.lastIndex = 0;
        if (!wikiPattern.test(text)) continue;
        wikiPattern.lastIndex = 0;

        var frag = document.createDocumentFragment();
        var lastIndex = 0;
        var match;
        while ((match = wikiPattern.exec(text)) !== null) {
            if (match.index > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            var path = match[1];
            var display = match[2] || path;
            var link = document.createElement('a');
            link.href = '#';
            link.className = 'my-char-wikilink';
            link.setAttribute('data-path', path);
            link.textContent = display;
            frag.appendChild(link);
            lastIndex = wikiPattern.lastIndex;
        }
        if (lastIndex < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        if (node.parentNode) node.parentNode.replaceChild(frag, node);
    }

    var links = container.querySelectorAll('.my-char-wikilink');
    for (var li = 0; li < links.length; li++) {
        (function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                var p = link.getAttribute('data-path');
                var file = app.metadataCache.getFirstLinkpathDest(p, '');
                if (file) app.workspace.openLinkText(p, '');
                else if (onClick) onClick(p);
            });
        })(links[li]);
    }
}

function rwSearchText(value) { return String(value == null ? '' : value).toLowerCase().trim(); }
function rwCharSearchHaystack(c) {
    var fields = c.fields || {}, parts = [c.name || ''];
    for (var k in fields) if (fields.hasOwnProperty(k)) parts.push(k + ':' + fields[k]);
    // 拼音与首字母由人物档案中的「拼音」「拼音首字母」字段提供；别名字段自动参与检索。
    return rwSearchText(parts.join(' '));
}
function performGlobalSearch(view, query, moduleFilter) {
    var raw = (query || '').trim();
    var q = raw.toLowerCase();
    if (!q) return { chars: [], relations: [], timeline: [], plotLines: [], factions: [], orgRelations: [], orgMemberships: [], world: [] };
    var fieldQuery = null;
    var colon = raw.indexOf(':');
    if (colon > 0) fieldQuery = { key: raw.slice(0, colon).trim(), value: raw.slice(colon + 1).trim().toLowerCase() };
    var chars = view.chars.filter(function(c) {
        var fields = c.fields || {};
        if (fieldQuery) {
            var v = fields[fieldQuery.key];
            return v != null && rwSearchText(v).indexOf(fieldQuery.value) !== -1;
        }
        return rwCharSearchHaystack(c).indexOf(q) !== -1;
    });
    var relations = view.relations.filter(function(r) {
        return [r.charA, r.charB, r.type, r.desc, r.startTime, r.endTime].some(function(v) { return rwSearchText(v).indexOf(q) !== -1; });
    });
    var timeline = view.timeline.filter(function(e) {
        return [e.event, e.year, e.month, e.plotLine, e.tag, e.volume, e.chapterNote, (e.chapterNotes || []).join(' ')].some(function(v) { return rwSearchText(v).indexOf(q) !== -1; });
    });
    var plotLines = getPlotLineGroups(view.timeline).filter(function(g) {
        return rwSearchText(g.plotLine).indexOf(q) !== -1 || g.events.some(function(e) { return rwSearchText(e.event).indexOf(q) !== -1; });
    });
    var factions = (view.factions || []).filter(function(f) { return rwSearchText((f.name || '') + ' ' + (f.desc || '')).indexOf(q) !== -1; });
    var orgRelations = (view.orgRelations || []).filter(function(r) { return rwSearchText(JSON.stringify(r)).indexOf(q) !== -1; });
    var orgMemberships = (view.orgMemberships || []).filter(function(m) { return rwSearchText(JSON.stringify(m)).indexOf(q) !== -1; });
    var world = [];
    var worldData = view.world || emptyWorldData();
    Object.keys(worldData).forEach(function(bucket) {
        var rows = Array.isArray(worldData[bucket]) ? worldData[bucket] : [];
        rows.forEach(function(item) {
            if (rwSearchText(JSON.stringify(item)).indexOf(q) !== -1) {
                world.push({ bucket: bucket, item: item, title: item.name || item.title || item.id || '未命名资料' });
            }
        });
    });
    if (moduleFilter && moduleFilter !== 'all') {
        if (moduleFilter !== 'chars') chars = [];
        if (moduleFilter !== 'relations') relations = [];
        if (moduleFilter !== 'timeline') timeline = [];
        if (moduleFilter !== 'plotLines') plotLines = [];
        if (moduleFilter !== 'factions') factions = [];
        if (moduleFilter !== 'orgRelations') orgRelations = [];
        if (moduleFilter !== 'orgMemberships') orgMemberships = [];
        if (moduleFilter !== 'world') world = [];
    }
    return { chars: chars, relations: relations, timeline: timeline, plotLines: plotLines, factions: factions, orgRelations: orgRelations, orgMemberships: orgMemberships, world: world };
}

function downloadTextFile(content, filename, mimeType) {
    mimeType = mimeType || 'text/plain;charset=utf-8';
    var blob = new Blob(['\uFEFF' + content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function saveTextToVault(app, folder, filename, content) {
    var path = folder ? folder + '/' + filename : filename;
    var existing = app.vault.getAbstractFileByPath(path);
    if (existing) {
        await app.vault.modify(existing, content);
    } else {
        if (folder && !await app.vault.adapter.exists(folder)) {
            await app.vault.adapter.mkdir(folder);
        }
        await app.vault.create(path, content);
    }
    return path;
}

function isAppearTimelineTag(tag) {
    if (!tag) return false;
    var t = String(tag).trim();
    if (t === '出场' || t === '登场' || t === '首次出场' || t === '首次出现' || t === '首次登场') return true;
    return /出场|登场/.test(t);
}

function formatFirstAppearFromEvent(evt, settings) {
    settings = settings || {};
    var mode = settings.timelineMode || 'auto';
    if (mode === 'chapter' || (mode === 'auto' && evt.volume)) {
        if (evt.volume && evt.month && evt.month !== '未标注') {
            return evt.volume + ' · ' + evt.year + ' · ' + evt.month;
        }
        if (evt.volume) return evt.volume + ' · ' + evt.year;
    }
    if (evt.month && evt.month !== '未标注') return evt.year + ' · ' + evt.month;
    return evt.year || '';
}

function firstAppearValuesMatch(a, b) {
    if (!a || !b) return false;
    var na = String(a).replace(/\s+/g, '').toLowerCase();
    var nb = String(b).replace(/\s+/g, '').toLowerCase();
    if (na === nb) return true;
    if (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1) return true;
    var pa = parseHistoricalDate(a);
    var pb = parseHistoricalDate(b);
    if (pa && pb && pa.sortValue !== null && pb.sortValue !== null && pa.sortValue === pb.sortValue) return true;
    return false;
}

function getTimelineFirstAppearMap(timeline, charNames, plugin) {
    var map = {};
    for (var i = 0; i < timeline.length; i++) {
        var evt = timeline[i];
        if (!isAppearTimelineTag(evt.tag)) continue;
        var appeared = findCharsInEvent(evt.event, charNames);
        for (var j = 0; j < appeared.length; j++) {
            var name = appeared[j];
            if (!map[name]) {
                map[name] = {
                    event: evt,
                    location: formatFirstAppearFromEvent(evt, plugin.settings),
                    timelineIndex: i
                };
            }
        }
    }
    return map;
}

function auditFirstAppearSync(view) {
    var settings = view.plugin.settings;
    var fieldName = settings.firstAppearFieldName || '首次出场';
    var timelineMap = getTimelineFirstAppearMap(view.timeline, view.charNames, view.plugin);
    var issues = [];

    for (var i = 0; i < view.chars.length; i++) {
        var c = view.chars[i];
        var charFirst = view.getFieldValue(c, fieldName);
        var tl = timelineMap[c.name];

        if (tl && !charFirst) {
            issues.push({
                type: 'missing_on_char',
                charName: c.name,
                suggested: tl.location,
                event: tl.event,
                severity: 'medium',
                message: '「' + c.name + '」时间线已 [出场]（' + tl.location + '），人物档案未填首次出场'
            });
        } else if (!tl && charFirst) {
            issues.push({
                type: 'missing_on_timeline',
                charName: c.name,
                charValue: charFirst,
                severity: 'low',
                message: '「' + c.name + '」档案写首次出场「' + charFirst + '」，时间线无 [出场] 事件'
            });
        } else if (tl && charFirst && !firstAppearValuesMatch(charFirst, tl.location)) {
            issues.push({
                type: 'mismatch',
                charName: c.name,
                charValue: charFirst,
                timelineValue: tl.location,
                event: tl.event,
                severity: 'high',
                message: '「' + c.name + '」不一致：档案「' + charFirst + '」≠ 时间线「' + tl.location + '」'
            });
        }
    }
    return issues;
}

async function setCharFieldInMd(app, plugin, charName, fieldName, fieldValue) {
    var fullPath = getCharFullPathForExt(plugin);
    var file = app.vault.getAbstractFileByPath(fullPath);
    if (!file) return false;
    var content = await app.vault.read(file);
    var lines = content.split('\n');
    var out = [];
    var inTarget = false;
    var inSubSection = false;
    var fieldUpdated = false;
    var foundChar = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.trim();
        if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
            if (inTarget && !fieldUpdated) {
                out.push('- ' + fieldName + '：' + fieldValue);
                fieldUpdated = true;
            }
            inTarget = trimmed === '## ' + charName;
            inSubSection = false;
            if (inTarget) foundChar = true;
            out.push(line);
            continue;
        }
        if (inTarget && trimmed.startsWith('### ')) {
            if (!fieldUpdated) {
                out.push('- ' + fieldName + '：' + fieldValue);
                fieldUpdated = true;
            }
            inSubSection = true;
            out.push(line);
            continue;
        }
        if (inTarget && inSubSection) {
            out.push(line);
            continue;
        }
        if (inTarget && (trimmed.startsWith('- ') || trimmed.startsWith('* '))) {
            var fieldLine = trimmed.substring(2);
            var colonIdx = fieldLine.indexOf('：');
            if (colonIdx === -1) colonIdx = fieldLine.indexOf(':');
            if (colonIdx !== -1) {
                var key = fieldLine.substring(0, colonIdx).trim();
                if (key === fieldName) {
                    out.push('- ' + fieldName + '：' + fieldValue);
                    fieldUpdated = true;
                    continue;
                }
            }
        }
        out.push(line);
    }
    if (inTarget && !fieldUpdated) {
        out.push('- ' + fieldName + '：' + fieldValue);
        fieldUpdated = true;
    }
    if (!foundChar) return false;
    await app.vault.modify(file, out.join('\n'));
    return true;
}

async function syncFirstAppearFromEvent(app, plugin, view, evt) {
    if (plugin.settings.syncFirstAppearOnEvent === false) {
        return { synced: [], skipped: [], mismatched: [] };
    }
    if (!isAppearTimelineTag(evt.tag)) {
        return { synced: [], skipped: [], mismatched: [] };
    }
    var appeared = findCharsInEvent(evt.event, view.charNames);
    if (!appeared.length) {
        return { synced: [], skipped: [], mismatched: [] };
    }
    var fieldName = plugin.settings.firstAppearFieldName || '首次出场';
    var location = formatFirstAppearFromEvent(evt, plugin.settings);
    var synced = [];
    var skipped = [];
    var mismatched = [];

    for (var i = 0; i < appeared.length; i++) {
        var name = appeared[i];
        var charData = view.findChar(name);
        if (!charData) {
            skipped.push(name);
            continue;
        }
        var current = view.getFieldValue(charData, fieldName);
        if (current && !firstAppearValuesMatch(current, location)) {
            mismatched.push({ name: name, current: current, location: location });
            continue;
        }
        if (current && firstAppearValuesMatch(current, location)) continue;
        var ok = await setCharFieldInMd(app, plugin, name, fieldName, location);
        if (ok) synced.push(name);
        else skipped.push(name);
    }
    return { synced: synced, skipped: skipped, mismatched: mismatched };
}

function needsEmptyStateGuide(view) {
    if (view.tab === 'importexport' || view.tab === 'dashboard' || view.tab === 'search') return false;
    return view.chars.length === 0 && view.timeline.length === 0;
}

function getDataSetupStatus(view) {
    var charPath = getCharFullPath(view.plugin);
    var timelinePath = getTimelineFullPath(view.plugin);
    return {
        charPath: charPath,
        timelinePath: timelinePath,
        charFileExists: !!view.app.vault.getAbstractFileByPath(charPath),
        timelineFileExists: !!view.app.vault.getAbstractFileByPath(timelinePath),
        charCount: view.chars.length,
        timelineCount: view.timeline.length,
        relationCount: view.relations.length,
        factionCount: view.factions.length
    };
}

function openCharViewAndRun(app, fn) {
    // setViewState/revealLeaf can complete after the old fixed 80ms delay on slower vaults.
    // Poll for the actual view instance and run the navigation callback only once.
    openCharView(app);
    var attempts = 0;
    var runWhenReady = function() {
        attempts++;
        var leaves = app.workspace.getLeavesOfType(VIEW_TYPE);
        var leaf = leaves && leaves.length ? leaves[0] : null;
        if (leaf && leaf.view && typeof leaf.view.render === 'function' && !leaf.view._rendering) {
            try { fn(leaf.view); } catch (e) { console.error('Relation Weaver navigation failed:', e); new obsidian.Notice('跳转失败：' + (e && e.message ? e.message : e)); }
            return;
        }
        if (attempts < 40) window.setTimeout(runWhenReady, 100);
        else new obsidian.Notice('工作区正在加载，请稍后重试跳转');
    };
    window.setTimeout(runWhenReady, 60);
}

var novelExt = {
    NOVEL_COMPACT_HIDDEN: NOVEL_COMPACT_HIDDEN,
    NOVEL_PRIMARY_TAB_IDS: NOVEL_PRIMARY_TAB_IDS,
    PLOT_STATUSES: PLOT_STATUSES,
    NOVEL_TAG_PRESETS: NOVEL_TAG_PRESETS,
    isNovelCompactUI: isNovelCompactUI,
    splitTabsForNovelUI: splitTabsForNovelUI,
    parseEventMeta: parseEventMeta,
    serializeEventMeta: serializeEventMeta,
    parseTimelineExtended: parseTimelineExtended,
    getRelationMetaPath: getRelationMetaPath,
    loadRelationsFromMd: loadRelationsFromMd,
    saveRelationsToMd: saveRelationsToMd,
    parseCharEmbeddedRelationsAndHistory: parseCharEmbeddedRelationsAndHistory,
    syncRelationsIntoCharMd: syncRelationsIntoCharMd,
    syncSettingsFromParsedData: syncSettingsFromParsedData,
    syncFactionsFromChars: syncFactionsFromChars,
    getTimelineTimePoints: getTimelineTimePoints,
    getNextTimePoint: getNextTimePoint,
    applyNovelTagPreset: applyNovelTagPreset,
    getUnredeemedPlotEvents: getUnredeemedPlotEvents,
    getPlotLineGroups: getPlotLineGroups,
    getUnredeemedPlotLines: getUnredeemedPlotLines,
    getPlotLineGroup: getPlotLineGroup,
    validatePlotLines: validatePlotLines,
    buildEventMdLine: buildEventMdLine,
    appendCharToMd: appendCharToMd,
    updateCharInMd: updateCharInMd,
    appendEventToMd: appendEventToMd,
    updateEventInMd: updateEventInMd,
    deleteEventFromMd: deleteEventFromMd,
    isAppearTimelineTag: isAppearTimelineTag,
    formatFirstAppearFromEvent: formatFirstAppearFromEvent,
    firstAppearValuesMatch: firstAppearValuesMatch,
    getTimelineFirstAppearMap: getTimelineFirstAppearMap,
    auditFirstAppearSync: auditFirstAppearSync,
    setCharFieldInMd: setCharFieldInMd,
    syncFirstAppearFromEvent: syncFirstAppearFromEvent,
    performGlobalSearch: performGlobalSearch,
    downloadTextFile: downloadTextFile,
    saveTextToVault: saveTextToVault,
    renderWikiLinksInElement: renderWikiLinksInElement,
    getCharFullPathForExt: getCharFullPathForExt,
    getTimelineFullPathForExt: getTimelineFullPathForExt,
    isTimeFilterActive: isTimeFilterActive,
    isRelationActiveAtTime: isRelationActiveAtTime,
    isEventAtOrBeforeTime: isEventAtOrBeforeTime,
    auditUnbornAppearances: auditUnbornAppearances,
    createVaultSnapshot: createVaultSnapshot,
    listVaultSnapshots: listVaultSnapshots,
    restoreVaultSnapshot: restoreVaultSnapshot
};


// ========== UI 样式辅助 ==========
function setFilterChip(btn, isActive, activeColor) {
    btn.className = "my-char-chip";
    if (isActive) {
        btn.classList.add("is-active");
        if (activeColor) btn.style.setProperty("--chip-active-bg", activeColor);
    } else {
        btn.style.removeProperty("--chip-active-bg");
    }
    return btn;
}

function setBadge(el, bgColor, extraClass) {
    el.className = "my-char-badge" + (extraClass ? " " + extraClass : "");
    el.style.setProperty("--badge-bg", bgColor);
    return el;
}

function setRelAccent(el, color) {
    el.style.setProperty("--rel-accent", color);
    return el;
}

var VIEW_TYPE = 'my-char-view';

// ========== Tab 配置（支持按场景隐藏）==========
var ALL_VIEW_TABS = [
    { id: 'desk', desc: '设定侧栏：关系、亲密度、伏笔、穿帮', alwaysShow: true },
    { id: 'relations', desc: '人物之间的关系' },
    { id: 'intimacy', desc: '亲密度变化历史' },
    { id: 'plots', desc: '未回收伏笔清单' },
    { id: 'outline', desc: '节拍、三幕与章节目录' },
    { id: 'chapterStatus', desc: '当前正文的事件、人物、阵营与伏笔总览' },
    { id: 'world', desc: '地点、道具、功法、组织、地图' },
    { id: 'continuity', desc: '时间线穿帮检查' },
    { id: 'chars', desc: '实体列表与详情' },
    { id: 'search', desc: '跨模块统一搜索' },
    { id: 'factions', desc: '分组/势力/分类' },
    { id: 'graph', desc: '关系网络可视化' },
    { id: 'timeline', desc: '事件与日记按时间排列' },
    { id: 'lifecycle', desc: '出生/出场/死亡时间轴' },
    { id: 'statistics', desc: '数据汇总分析' },
    { id: 'dashboard', desc: '写作进度与待办' },
    { id: 'heatmap', desc: '出场频率热力图' },
    { id: 'importexport', desc: '备份与迁移数据' }
];

var USE_CASE_TERMS = {
    novel: { entity: '人物', faction: '阵营', relation: '关系', timeline: '时间线', event: '事件' },
    diary: { entity: '人物', faction: '分组', relation: '关系', timeline: '日记', event: '记录' },
    trpg: { entity: '角色', faction: '阵营', relation: '关系', timeline: '冒险日志', event: '事件' },
    knowledge: { entity: '概念', faction: '分类', relation: '关联', timeline: '脉络', event: '节点' }
};

var TAB_LABEL_TEMPLATES = {
    desk: '📌 设定侧栏',
    chars: '👥 ',
    search: '🔍 ',
    factions: '🏰 ',
    relations: '🔗 ',
    intimacy: '❤️ 亲密度史',
    plots: '🧵 伏笔回收',
    outline: '🧭 大纲',
    world: '🌍 世界观',
    continuity: '⚠️ 时间线穿帮',
    graph: '🕸️ ',
    timeline: '📅 ',
    lifecycle: '⏳ 生命周期',
    statistics: '📊 统计',
    dashboard: '📋 仪表盘',
    heatmap: '🔥 热力图',
    importexport: '💾 导入导出'
};

var USE_CASE_PRESETS = {
    novel: {
        label: '小说 / 历史创作',
        viewTitle: '设定侧栏',
        hiddenTabs: [],
        preset: 'default',
        terms: USE_CASE_TERMS.novel,
        timelineMode: 'auto',
        novelCompactUI: true
    },
    diary: {
        label: '日常日记',
        viewTitle: '人物与事件',
        hiddenTabs: ['factions', 'lifecycle', 'heatmap', 'dashboard', 'statistics', 'graph'],
        preset: 'diary',
        terms: USE_CASE_TERMS.diary
    },
    trpg: {
        label: '跑团 / TRPG',
        viewTitle: '角色与冒险',
        hiddenTabs: ['heatmap'],
        preset: 'fantasy',
        terms: USE_CASE_TERMS.trpg
    },
    knowledge: {
        label: '知识 / 概念关系',
        viewTitle: '知识关系图谱',
        hiddenTabs: ['lifecycle', 'heatmap', 'dashboard'],
        preset: 'knowledge',
        terms: USE_CASE_TERMS.knowledge
    },
    custom: {
        label: '自定义',
        viewTitle: '',
        hiddenTabs: null,
        preset: null,
        terms: null
    }
};

function getTermSet(plugin) {
    var mode = plugin.settings.useCaseMode || 'novel';
    var base = USE_CASE_TERMS[mode] || USE_CASE_TERMS.novel;
    var custom = plugin.settings.termLabels || {};
    return {
        entity: custom.entity || base.entity,
        faction: custom.faction || base.faction,
        relation: custom.relation || base.relation,
        timeline: custom.timeline || base.timeline,
        event: custom.event || base.event
    };
}

function getTerm(plugin, key) {
    return getTermSet(plugin)[key] || key;
}

function getTabDisplayLabel(plugin, tabId) {
    if (tabId === 'chapterStatus') return '章节情况';
    if (plugin.settings.tabLabels && plugin.settings.tabLabels[tabId]) {
        return plugin.settings.tabLabels[tabId];
    }
    var terms = getTermSet(plugin);
    if (tabId === 'desk') return TAB_LABEL_TEMPLATES.desk;
    if (tabId === 'chars') return TAB_LABEL_TEMPLATES.chars + terms.entity;
    if (tabId === 'search') return TAB_LABEL_TEMPLATES.search + '全局搜索';
    if (tabId === 'factions') return TAB_LABEL_TEMPLATES.factions + terms.faction;
    if (tabId === 'relations') return TAB_LABEL_TEMPLATES.relations + terms.relation;
    if (tabId === 'intimacy') return TAB_LABEL_TEMPLATES.intimacy;
    if (tabId === 'plots') return TAB_LABEL_TEMPLATES.plots;
    if (tabId === 'continuity') return TAB_LABEL_TEMPLATES.continuity;
    if (tabId === 'graph') return TAB_LABEL_TEMPLATES.graph + terms.relation + '图谱';
    if (tabId === 'timeline') return TAB_LABEL_TEMPLATES.timeline + terms.timeline;
    return TAB_LABEL_TEMPLATES[tabId] || tabId;
}

function getToolbarStatsText(view) {
    var t = getTermSet(view.plugin);
    return t.entity + ':' + view.chars.length + ' | ' + t.faction + ':' + view.factions.length + ' | ' + t.relation + ':' + view.relations.length;
}

function shouldHideLifecycleFields(plugin) {
    var mode = plugin.settings.useCaseMode;
    return mode === 'diary' || mode === 'knowledge';
}

function getViewTitle(plugin) {
    var title = plugin.settings.viewTitle;
    if (title && title.trim()) return title.trim();
    var mode = plugin.settings.useCaseMode || 'novel';
    var preset = USE_CASE_PRESETS[mode];
    if (preset && preset.viewTitle) return preset.viewTitle;
    return isNovelCompactUI(plugin) ? '设定侧栏' : '人物关系谱系';
}

function getVisibleTabs(plugin) {
    var hidden = plugin.settings.hiddenTabs || [];
    return ALL_VIEW_TABS.filter(function(t) {
        if (t.alwaysShow) return true;
        return hidden.indexOf(t.id) === -1;
    }).map(function(t) {
        return { id: t.id, label: getTabDisplayLabel(plugin, t.id), desc: t.desc, alwaysShow: t.alwaysShow };
    });
}

function ensureValidTab(view) {
    var ids = getVisibleTabs(view.plugin).map(function(t) { return t.id; });
    if (ids.indexOf(view.tab) === -1) view.tab = getHomeTab(view.plugin);
}

function applyFieldPreset(plugin, presetKey) {
    if (presetKey === 'fantasy') {
        plugin.settings.factionFieldName = '势力';
        plugin.settings.customRelationTypes = '同盟,敌对,隶属,师徒,主仆,战友,宿敌';
        plugin.settings.deathFieldNames = '陨落,死亡';
        plugin.settings.birthFieldNames = '诞生,出生';
        plugin.settings.firstAppearFieldName = '登场';
        plugin.settings.intimateFieldName = '羁绊';
    } else if (presetKey === 'modern' || presetKey === 'diary') {
        plugin.settings.factionFieldName = '所属组织';
        plugin.settings.customRelationTypes = '同事,上下级,朋友,恋人,家人,竞争对手';
        plugin.settings.deathFieldNames = '去世,死亡';
        plugin.settings.birthFieldNames = '出生';
        plugin.settings.firstAppearFieldName = '首次出现';
        plugin.settings.intimateFieldName = '亲密关系';
    } else if (presetKey === 'knowledge') {
        plugin.settings.factionFieldName = '分类';
        plugin.settings.customRelationTypes = '包含,引用,因果,对比,相关,从属,对立';
        plugin.settings.deathFieldNames = '废止,停用';
        plugin.settings.birthFieldNames = '创建,提出';
        plugin.settings.firstAppearFieldName = '首次收录';
        plugin.settings.intimateFieldName = '相关概念';
    } else if (presetKey === 'scifi') {
        plugin.settings.factionFieldName = '所属势力';
        plugin.settings.customRelationTypes = '同盟,敌对,从属,克隆,共生,竞争';
        plugin.settings.deathFieldNames = '阵亡,销毁,死亡';
        plugin.settings.birthFieldNames = '制造,出生,激活';
        plugin.settings.firstAppearFieldName = '首次登场';
        plugin.settings.intimateFieldName = '情感链接';
    } else {
        plugin.settings.factionFieldName = '阵营';
        plugin.settings.customRelationTypes = '';
        plugin.settings.deathFieldNames = '死亡,死亡时间';
        plugin.settings.birthFieldNames = '出生,出生时间';
        plugin.settings.firstAppearFieldName = '首次出场';
        plugin.settings.intimateFieldName = '亲密人物';
    }
    plugin.settings.preset = presetKey || 'default';
}

function applyUseCaseMode(plugin, mode) {
    var cfg = USE_CASE_PRESETS[mode] || USE_CASE_PRESETS.custom;
    plugin.settings.useCaseMode = mode;
    if (cfg.hiddenTabs !== null) {
        plugin.settings.hiddenTabs = cfg.hiddenTabs.slice();
    }
    if (cfg.viewTitle) {
        plugin.settings.viewTitle = cfg.viewTitle;
    }
    if (cfg.preset) {
        applyFieldPreset(plugin, cfg.preset);
    }
    if (cfg.terms) {
        plugin.settings.termLabels = Object.assign({}, cfg.terms);
    }
    if (cfg.timelineMode) {
        plugin.settings.timelineMode = cfg.timelineMode;
    }
    if (cfg.novelCompactUI !== undefined) {
        plugin.settings.novelCompactUI = cfg.novelCompactUI;
    }
}

// ========== 亲密度配置（支持自定义）==========
var DEFAULT_INTIMACY_LEVELS = [
    { value: -3, label: '仇恨', color: '#c0392b' },
    { value: -2, label: '厌恶', color: '#e67e22' },
    { value: -1, label: '冷淡', color: '#f39c12' },
    { value: 0, label: '陌生', color: '#95a5a6' },
    { value: 1, label: '认识', color: '#4a90e2' },
    { value: 2, label: '一般', color: '#2ecc71' },
    { value: 3, label: '友好', color: '#27ae60' },
    { value: 4, label: '亲密', color: '#e74c3c' },
    { value: 5, label: '挚友/至亲', color: '#9b59b6' }
];
var INTIMACY_LEVELS = DEFAULT_INTIMACY_LEVELS.slice();

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function updateIntimacyLevels(customStr) {
    if (!customStr || !customStr.trim()) {
        INTIMACY_LEVELS = DEFAULT_INTIMACY_LEVELS.slice();
        return;
    }
    try {
        var parts = customStr.split(',').map(function(s) { return s.trim(); });
        var newLevels = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].split(':');
            if (p.length >= 3) {
                newLevels.push({
                    value: parseInt(p[0]),
                    label: p[1],
                    color: p[2]
                });
            }
        }
        if (newLevels.length > 0) {
            INTIMACY_LEVELS = newLevels;
        }
    } catch(e) {
        console.log('自定义亲密度解析失败:', e);
    }
}

function getIntimacyLabel(value) {
    for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
        if (INTIMACY_LEVELS[i].value === value) return INTIMACY_LEVELS[i].label;
    }
    return '认识';
}

function getIntimacyColor(value) {
    for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
        if (INTIMACY_LEVELS[i].value === value) return INTIMACY_LEVELS[i].color;
    }
    return '#4a90e2';
}

// ========== 默认事件标签配置 ==========
var DEFAULT_EVENT_TAGS = [
    { value: '朝堂', label: '朝堂', color: '#e74c3c' },
    { value: '博弈', label: '博弈', color: '#9b59b6' },
    { value: '感情', label: '感情', color: '#e91e63' },
    { value: '出场', label: '出场', color: '#2ecc71' },
    { value: '死亡', label: '死亡', color: '#7f8c8d' },
    { value: '诸侯', label: '诸侯', color: '#3498db' },
    { value: '日常', label: '📚 日常', color: '#16a085' },
    { value: '其他', label: '其他', color: '#95a5a6' }
];

function normalizeEventTag(tag) {
    if (!tag) return null;
    if (typeof tag === 'string') {
        var s = tag.trim();
        if (!s) return null;
        return { value: s, label: s, color: '#4a90e2' };
    }
    // 兼容误存成 { id, label, color } 的旧数据
    var value = String(tag.value || tag.id || '').trim();
    if (!value) return null;
    return {
        value: value,
        label: String(tag.label || value).trim() || value,
        color: tag.color || '#4a90e2'
    };
}

// ========== 直接使用保存的标签；自动发现时合并而非覆盖 ==========
function getEventTags(plugin) {
    var hasCustomTags = Object.prototype.hasOwnProperty.call(plugin.settings, 'customEventTags');
    var customTags = hasCustomTags && Array.isArray(plugin.settings.customEventTags) ? plugin.settings.customEventTags : null;
    var cacheKey = JSON.stringify(customTags);
    if (plugin._eventTagsCache && plugin._eventTagsCacheKey === cacheKey) {
        return plugin._eventTagsCache;
    }
    var result;
    if (customTags === null || (!plugin.settings.eventTagsCustomized && customTags.length === 0)) {
        result = deepCloneJson(DEFAULT_EVENT_TAGS);
    } else {
        result = [];
        for (var i = 0; i < customTags.length; i++) {
            var nt = normalizeEventTag(customTags[i]);
            if (nt) result.push(nt);
        }
    }
    plugin._eventTagsCache = result;
    plugin._eventTagsCacheKey = cacheKey;
    return result;
}

function getTagMap(plugin) {
    if (!plugin._tagMapCache) {
        var map = {};
        var tags = getEventTags(plugin);
        for (var i = 0; i < tags.length; i++) {
            if (tags[i].value) map[tags[i].value] = tags[i];
        }
        plugin._tagMapCache = map;
    }
    return plugin._tagMapCache;
}

function invalidateTagCache(plugin) {
    plugin._tagMapCache = null;
    plugin._eventTagsCache = null;
    plugin._eventTagsCacheKey = null;
}

function getTagLabel(plugin, tagValue) {
    var tag = getTagMap(plugin)[tagValue];
    return tag ? tag.label : (tagValue || '其他');
}

function getTagColor(plugin, tagValue) {
    var tag = getTagMap(plugin)[tagValue];
    return tag ? tag.color : '#95a5a6';
}

function exportToJSON(data, filename) {
    var jsonStr = JSON.stringify(data, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function importFromJSON(file, callback) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            callback(data);
        } catch (err) {
            new obsidian.Notice('JSON解析失败');
        }
    };
    reader.readAsText(file);
}

function confirmDestructiveAction(title, detail) {
    // Electron/Obsidian 不支持 window.prompt；使用原生确认框完成单步确认。
    var message = '⚠️ ' + title + '\n' + (detail || '该操作会删除现有数据。') + '\n\n此操作不可自动撤销，确定继续吗？';
    return window.confirm(message);
}

function requestTextInput(app, title, defaultValue, placeholder) {
    return new Promise(function(resolve) {
        var modal = new obsidian.Modal(app);
        var settled = false;
        function finish(value) { if (settled) return; settled = true; modal.close(); resolve(value); }
        modal.onOpen = function() {
            var content = modal.contentEl;
            content.empty();
            modal.titleEl.setText(title || '请输入');
            var input = content.createEl('input', { type: 'text', cls: 'my-char-form-input' });
            input.value = defaultValue == null ? '' : String(defaultValue);
            if (placeholder) input.placeholder = placeholder;
            input.style.width = '100%';
            var actions = content.createDiv({ cls: 'modal-button-container' });
            var cancel = actions.createEl('button', { text: '取消' });
            var ok = actions.createEl('button', { text: '确定', cls: 'mod-cta' });
            cancel.addEventListener('click', function() { finish(null); });
            ok.addEventListener('click', function() { finish(input.value); });
            input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); finish(input.value); } });
            window.setTimeout(function() { input.focus(); input.select(); }, 0);
        };
        modal.onClose = function() { if (!settled) { settled = true; resolve(null); } };
        modal.open();
    });
}

function chooseTimelineEvents(app, events, selectedIds) {
    return new Promise(function(resolve) {
        var modal = new obsidian.Modal(app);
        var settled = false;
        function finish(value) { if (settled) return; settled = true; modal.close(); resolve(value); }
        modal.onOpen = function() {
            var content = modal.contentEl;
            content.empty();
            modal.titleEl.setText('关联时间线事件');
            content.createEl('p', { text: '勾选要关联到当前大纲章节的事件；取消勾选可解除关联。' });
            var list = content.createDiv({ cls: 'rw-outline-event-picker' });
            var checks = [];
            events.forEach(function(evt, index) {
                var label = list.createEl('label', { cls: 'rw-outline-event-option' });
                var checkbox = label.createEl('input', { type: 'checkbox' });
                checkbox.checked = selectedIds.indexOf(evt.eventId) >= 0;
                var date = (evt.year || '未定位') + (evt.month && evt.month !== '未标注' ? ' / ' + evt.month : '');
                label.createEl('span', { text: (index + 1) + '. [' + date + '] ' + String(evt.event || '').replace(/\s+/g, ' ').slice(0, 120) });
                checks.push({ checkbox: checkbox, id: evt.eventId });
            });
            var actions = content.createDiv({ cls: 'modal-button-container' });
            var cancel = actions.createEl('button', { text: '取消' });
            var clear = actions.createEl('button', { text: '清空关联' });
            var save = actions.createEl('button', { text: '保存关联', cls: 'mod-cta' });
            cancel.addEventListener('click', function() { finish(null); });
            clear.addEventListener('click', function() { finish([]); });
            save.addEventListener('click', function() { finish(checks.filter(function(x) { return x.checkbox.checked; }).map(function(x) { return x.id; })); });
        };
        modal.onClose = function() { if (!settled) { settled = true; resolve(null); } };
        modal.open();
    });
}

function getDataPath(plugin) {
    // Obsidian Plugin.loadData/saveData 使用插件目录下的 data.json 保存 settings。
    // 关系/阵营数据必须独立存放，避免两套数据互相覆盖。
    return plugin.app.vault.configDir + '/plugins/' + plugin.manifest.id + '/relations-data.json';
}

async function loadSavedData(plugin) {
    var adapter = plugin.app.vault.adapter;
    var path = getDataPath(plugin);
    var backupPath = path + '.bak';
    async function readValidJson(candidate) {
        if (!await adapter.exists(candidate)) return null;
        var raw = await adapter.read(candidate);
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('数据文件格式不正确');
        return parsed;
    }
    var primaryError = null;
    try {
        var primary = await readValidJson(path);
        if (primary) return primary;
    } catch (e) {
        primaryError = e;
        console.error('[人物关系谱系] 关系数据文件读取失败：', e);
    }
    try {
        var backup = await readValidJson(backupPath);
        if (backup) {
            new obsidian.Notice('⚠️ 关系数据文件缺失或损坏，已从上一次备份读取数据。建议立即创建快照。', 8000);
            return backup;
        }
    } catch (backupError) {
        console.error('[人物关系谱系] 关系数据备份也无法读取：', backupError);
        throw new Error('关系数据与备份均无法读取。为避免覆盖损坏数据，已停止加载：' + backupError.message);
    }
    if (primaryError) throw new Error('关系数据文件无法读取，且没有可用备份：' + primaryError.message);

    // 3.3.3 及更早版本曾把关系数据写入 Obsidian 专用的 data.json，
    // 与 Plugin.loadData()/saveData() 的设置存储发生冲突。只迁移可识别的关系字段，绝不覆盖原文件。
    var legacyPath = plugin.app.vault.configDir + '/plugins/' + plugin.manifest.id + '/data.json';
    if (await adapter.exists(legacyPath)) {
        try {
            var legacy = JSON.parse(await adapter.read(legacyPath));
            if (legacy && typeof legacy === 'object' && !Array.isArray(legacy) &&
                (Array.isArray(legacy.factions) || Array.isArray(legacy.relations))) {
                var migrated = {
                    factions: Array.isArray(legacy.factions) ? legacy.factions : [],
                    relations: Array.isArray(legacy.relations) ? legacy.relations : []
                };
                await saveData(plugin, migrated);
                new obsidian.Notice('✓ 已将旧版关系数据迁移到独立文件，原设置文件未修改。', 8000);
                return migrated;
            }
        } catch (legacyError) {
            console.error('[人物关系谱系] 旧版关系数据迁移失败：', legacyError);
            new obsidian.Notice('⚠️ 旧版关系数据迁移失败，原文件已保留，请先创建备份后检查。', 8000);
        }
    }
    return { factions: [], relations: [] };
}

// 对关系数据文件的写入串行化，避免多个异步保存互相覆盖。
async function saveData(plugin, data) {
    var adapter = plugin.app.vault.adapter;
    var path = getDataPath(plugin);
    var backupPath = path + '.bak';
    var dir = plugin.app.vault.configDir + '/plugins/' + plugin.manifest.id;
    var payload;
    try {
        payload = JSON.stringify(data, null, 2);
        if (typeof payload !== 'string') throw new Error('数据无法序列化');
        // 序列化结果必须可重新解析，避免写入不可恢复的数据。
        JSON.parse(payload);
    } catch (serializeError) {
        console.error('[人物关系谱系] 保存前序列化失败：', serializeError);
        new obsidian.Notice('❌ 保存失败：数据无法序列化，原文件未改动。', 6000);
        throw serializeError;
    }

    var previous = plugin._rwDataSaveQueue || Promise.resolve();
    var current = previous.catch(function() {}).then(async function() {
        if (!await adapter.exists(dir)) await adapter.mkdir(dir);
        var tempPath = path + '.tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        var hadOriginal = await adapter.exists(path);
        var movedOriginal = false;
        var movedOriginalPath = tempPath + '.previous';
        try {
            await adapter.write(tempPath, payload);
            var check = JSON.parse(await adapter.read(tempPath));
            if (!check || typeof check !== 'object' || Array.isArray(check)) {
                throw new Error('临时文件校验失败');
            }
            if (hadOriginal) {
                // 先更新 .bak，再用 rename 原子替换主文件；原文件始终至少保留一份。
                var oldRaw = await adapter.read(path);
                var oldIsValid = true;
                try { JSON.parse(oldRaw); } catch (invalidOldData) { oldIsValid = false; }
                if (oldIsValid) {
                    if (await adapter.exists(backupPath)) await adapter.remove(backupPath);
                    await adapter.write(backupPath + '.tmp', oldRaw);
                    JSON.parse(await adapter.read(backupPath + '.tmp'));
                    await adapter.rename(backupPath + '.tmp', backupPath);
                } else {
                    // 主文件已损坏时不覆盖 .bak；将损坏文件留档后再写入恢复后的有效数据。
                    movedOriginalPath = path + '.corrupt-' + Date.now();
                }
                await adapter.rename(path, movedOriginalPath);
                movedOriginal = true;
            }
            await adapter.rename(tempPath, path);
            if (movedOriginal && movedOriginalPath === tempPath + '.previous' && await adapter.exists(movedOriginalPath)) {
                await adapter.remove(movedOriginalPath);
            }
            plugin._rwLastSaveAt = Date.now();
            return true;
        } catch (writeError) {
            // 若新文件替换失败，尽可能恢复原文件，不以空数据覆盖。
            try {
                if (movedOriginal && !(await adapter.exists(path)) && await adapter.exists(movedOriginalPath)) {
                    await adapter.rename(movedOriginalPath, path);
                }
            } catch (restoreError) {
                console.error('[人物关系谱系] 保存失败后的原文件恢复也失败：', restoreError);
            }
            try { if (await adapter.exists(tempPath)) await adapter.remove(tempPath); } catch (cleanupError) {}
            try { if (await adapter.exists(backupPath + '.tmp')) await adapter.remove(backupPath + '.tmp'); } catch (cleanupError2) {}
            console.error('[人物关系谱系] 数据保存失败：', writeError);
            new obsidian.Notice('❌ 数据保存失败，原数据已尽力保留。请检查磁盘空间与文件权限；不要关闭 Obsidian 前忽略此提示。', 10000);
            throw writeError;
        }
    });
    plugin._rwDataSaveQueue = current;
    return current;
}

function getCurrentFolder(app) {
    var activeFile = app.workspace.getActiveFile();
    if (activeFile && activeFile.parent) {
        return activeFile.parent.path;
    }
    var view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (view && view.file && view.file.parent) {
        return view.file.parent.path;
    }
    return '';
}

function resolveDataFilePath(plugin, folderSettingKey, fileSettingKey, defaultFileName) {
    var settings = plugin.settings || {};
    var folder = (settings[folderSettingKey] || '').trim();
    if (!folder) {
        folder = getCurrentFolder(plugin.app);
    }
    var filename = (settings[fileSettingKey] || defaultFileName).trim();
    return folder ? folder + '/' + filename : filename;
}

function getCharFullPath(plugin) {
    return resolveDataFilePath(plugin, 'charFolder', 'charFile', '人物索引.md');
}

function parseCharsFromContent(content) {
    var chars = [];
    if (!content || typeof content !== 'string') return chars;
    var lines = content.split('\n');
    var current = null;
    var inSubSection = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('## ') && !line.startsWith('### ')) {
            if (current && current.name) chars.push(current);
            current = { name: line.substring(3).trim(), fields: {} };
            inSubSection = false;
            continue;
        }

        if (line.startsWith('### ')) {
            inSubSection = true;
            continue;
        }

        if (line.startsWith('# ')) continue;
        if (line.startsWith('---')) continue;
        if (inSubSection) continue;

        if (current) {
            var text = line;
            var hasDash = line.startsWith('- ') || line.startsWith('* ');
            if (hasDash) text = line.substring(2);

            var sep = text.indexOf('：');
            if (sep === -1) sep = text.indexOf(':');

            if (sep !== -1) {
                var key = text.substring(0, sep).trim();
                var value = text.substring(sep + 1).trim();
                if (value !== undefined) current.fields[key] = value;
            }
        }
    }
    if (current && current.name) chars.push(current);
    return chars;
}

function getTimelineFullPath(plugin) {
    return resolveDataFilePath(plugin, 'timelineFolder', 'timelineFile', '时间线.md');
}

function getGraphNotesFolder(plugin) {
    var custom = (plugin.settings.graphNotesFolder || '').trim();
    if (custom) return custom;
    var charFolder = (plugin.settings.charFolder || '').trim() || getCurrentFolder(plugin.app);
    return charFolder ? charFolder + '/关系图谱节点' : '关系图谱节点';
}

function sanitizeNoteName(name) {
    return String(name).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function getRelationsForChar(view, charName) {
    var result = [];
    for (var i = 0; i < view.relations.length; i++) {
        var rel = view.relations[i];
        if (rel.charA === charName || rel.charB === charName) {
            result.push({
                relation: rel,
                other: rel.charA === charName ? rel.charB : rel.charA
            });
        }
    }
    return result;
}

var GRAPH_SYNC_UNTYPED_LABEL = '(无类型)';

function getCharTypeForGraph(char) {
    if (!char || !char.fields) return '';
    var typeVal = char.fields['类型'];
    return typeVal && String(typeVal).trim() ? String(typeVal).trim() : '';
}

function getCharTypeLabelForGraph(char) {
    var typeVal = getCharTypeForGraph(char);
    return typeVal || GRAPH_SYNC_UNTYPED_LABEL;
}

function isGraphSyncModeSelected(plugin) {
    return plugin.settings.graphSyncMode === 'selected';
}

function isCharIncludedInGraphSync(plugin, char) {
    if (!isGraphSyncModeSelected(plugin)) return true;
    var allowed = plugin.settings.graphSyncTypes || [];
    if (allowed.length === 0) return false;
    return allowed.indexOf(getCharTypeLabelForGraph(char)) !== -1;
}

function getCharsForGraphSync(plugin, view) {
    var result = [];
    for (var i = 0; i < view.chars.length; i++) {
        if (isCharIncludedInGraphSync(plugin, view.chars[i])) {
            result.push(view.chars[i]);
        }
    }
    return result;
}

function collectCharTypesForGraph(view) {
    var typeSet = {};
    var untypedCount = 0;
    for (var i = 0; i < view.chars.length; i++) {
        var typeVal = getCharTypeForGraph(view.chars[i]);
        if (typeVal) {
            typeSet[typeVal] = (typeSet[typeVal] || 0) + 1;
        } else {
            untypedCount++;
        }
    }
    var sortOrder = ['⭐ 主角', '主角', '🔶 配角', '配角', '👤 龙套', '龙套'];
    var sorted = [];
    for (var si = 0; si < sortOrder.length; si++) {
        if (typeSet[sortOrder[si]]) {
            sorted.push({ label: sortOrder[si], count: typeSet[sortOrder[si]] });
            delete typeSet[sortOrder[si]];
        }
    }
    var remaining = Object.keys(typeSet).sort();
    for (var ri = 0; ri < remaining.length; ri++) {
        sorted.push({ label: remaining[ri], count: typeSet[remaining[ri]] });
    }
    if (untypedCount > 0) {
        sorted.push({ label: GRAPH_SYNC_UNTYPED_LABEL, count: untypedCount });
    }
    return sorted;
}

function getGraphSyncSummaryText(plugin, view) {
    var terms = getTermSet(plugin);
    var total = view.chars.length;
    var syncCount = getCharsForGraphSync(plugin, view).length;
    if (!isGraphSyncModeSelected(plugin)) {
        return '同步范围：全部类型（' + syncCount + ' 个' + terms.entity + '）';
    }
    var selected = plugin.settings.graphSyncTypes || [];
    if (selected.length === 0) {
        return '同步范围：未选择任何类型（0/' + total + '）';
    }
    var labels = selected.slice(0, 4).join('、');
    if (selected.length > 4) labels += ' 等' + selected.length + '类';
    return '同步范围：' + labels + '（' + syncCount + '/' + total + '）';
}

function formatGraphSyncNotice(res) {
    var msg = '✓ 已同步 ' + res.count + ' 个节点到 ' + res.folder;
    if (res.skipped > 0) msg += '；跳过 ' + res.skipped + ' 个';
    if (res.conflicts > 0) msg += '；有 ' + res.conflicts + ' 个同名笔记未覆盖（为保护原文）';
    if (res.stale > 0) msg += '；发现 ' + res.stale + ' 个已不在同步范围内的旧节点，已保留未删除';
    return msg;
}

async function loadCharsForGraphSettings(app, plugin) {
    var leaves = app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length > 0 && leaves[0].view && leaves[0].view.chars && leaves[0].view.chars.length > 0) {
        return leaves[0].view.chars;
    }
    var path = getCharFullPath(plugin);
    var file = app.vault.getAbstractFileByPath(path);
    if (!file) return [];
    try {
        var content = await app.vault.read(file);
        return parseCharsFromContent(content);
    } catch (e) {
        console.log('读取人物类型失败:', e);
        return [];
    }
}

async function syncGraphNotesToVault(plugin, view) {
    var folder = getGraphNotesFolder(plugin);
    var adapter = plugin.app.vault.adapter;
    if (!await adapter.exists(folder)) {
        await adapter.mkdir(folder);
    }
    var terms = getTermSet(plugin);
    var factionField = plugin.settings.factionFieldName || '阵营';
    // Obsidian 原生图谱按属性分组依赖有效的 YAML frontmatter；统一双引号转义，兼容冒号、井号等特殊字符。
    function yamlQuoted(value) {
        return '"' + String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';
    }
    var charsToSync = getCharsForGraphSync(plugin, view);
    var syncedNames = {};
    for (var sn = 0; sn < charsToSync.length; sn++) {
        syncedNames[charsToSync[sn].name] = true;
    }
    var synced = 0;
    var conflicts = 0;

    for (var ci = 0; ci < charsToSync.length; ci++) {
        var c = charsToSync[ci];
        var notePath = folder + '/' + sanitizeNoteName(c.name) + '.md';
        var lines = ['---', 'tags: [relation-weaver]', 'entity: ' + yamlQuoted(c.name)];
        var currentFaction = view && typeof view.getCharField === 'function'
            ? view.getCharField(c, factionField)
            : (c.fields && c.fields[factionField] || '');
        if (currentFaction && currentFaction !== '暂无当前阵营' && currentFaction !== '未分配阵营') {
            lines.push(yamlQuoted(factionField) + ': ' + yamlQuoted(currentFaction));
        }
        var typeVal = getCharTypeForGraph(c);
        if (typeVal) lines.push('类型: ' + yamlQuoted(typeVal));
        lines.push('---', '', '# ' + c.name, '');
        if (c.fields) {
            var keys = Object.keys(c.fields);
            for (var ki = 0; ki < keys.length; ki++) {
                var fieldValue = keys[ki] === factionField ? currentFaction : c.fields[keys[ki]];
                if (fieldValue) lines.push('- ' + keys[ki] + '：' + fieldValue);
            }
        }
        lines.push('', '## ' + terms.relation, '');
        var rels = getRelationsForChar(view, c.name);
        if (rels.length === 0) {
            lines.push('_（暂无' + terms.relation + '）_');
        } else {
            for (var ri = 0; ri < rels.length; ri++) {
                var item = rels[ri];
                var rel = item.relation;
                var intimacyLabel = getIntimacyLabel(rel.intimacy || 0);
                var relLabel = (rel.type || terms.relation) + '（' + intimacyLabel + '）';
                if (syncedNames[item.other]) {
                    lines.push('- [[' + item.other + ']] — ' + relLabel);
                } else {
                    lines.push('- ' + item.other + ' — ' + relLabel);
                }
            }
        }
        lines.push('', '> 由「人物关系谱系」插件同步，可在 Obsidian 原生图谱中拖拽探索');
        var content = lines.join('\n');
        var existing = plugin.app.vault.getAbstractFileByPath(notePath);
        if (existing) {
            // Protect user-authored notes: only refresh notes that carry our ownership marker.
            var existingContent = await plugin.app.vault.read(existing);
            if (existingContent.indexOf('由「人物关系谱系」插件同步') === -1) {
                conflicts++;
                continue;
            }
            await plugin.app.vault.modify(existing, content);
        } else {
            await plugin.app.vault.create(notePath, content);
        }
        synced++;
    }

    // Never delete stale graph notes automatically. They may contain annotations or links
    // added by the user after sync; report them so the user can review them manually.
    var stale = 0;
    for (var cj = 0; cj < view.chars.length; cj++) {
        var excluded = view.chars[cj];
        if (syncedNames[excluded.name]) continue;
        var stalePath = folder + '/' + sanitizeNoteName(excluded.name) + '.md';
        var staleFile = plugin.app.vault.getAbstractFileByPath(stalePath);
        if (staleFile) stale++;
    }

    return {
        folder: folder,
        count: synced,
        skipped: view.chars.length - synced,
        conflicts: conflicts,
        stale: stale,
        removed: 0
    };
}

async function openObsidianGlobalGraph(app, folderPath) {
    var leaf = app.workspace.getLeaf('tab');
    var state = {};
    if (folderPath) {
        state.search = 'path:"' + folderPath + '"';
    }
    await leaf.setViewState({ type: 'graph', state: state, active: true });
}

async function openObsidianLocalGraph(app, file) {
    if (!file) return false;
    var leaf = app.workspace.getLeaf('tab');
    await leaf.openFile(file);
    var graphLeaf = app.workspace.getLeaf('split', { direction: 'vertical' });
    await graphLeaf.setViewState({
        type: 'graph',
        state: { localGraph: true, localNodeId: file.path },
        active: true
    });
    return true;
}

async function openLocalGraphForEntity(app, plugin, view, charName) {
    var charData = null;
    for (var i = 0; i < view.chars.length; i++) {
        if (view.chars[i].name === charName) {
            charData = view.chars[i];
            break;
        }
    }
    if (charData && !isCharIncludedInGraphSync(plugin, charData)) {
        new obsidian.Notice('「' + charName + '」的类型未纳入图谱同步范围，请在设置或图谱页调整');
        return;
    }
    var folder = getGraphNotesFolder(plugin);
    var path = folder + '/' + sanitizeNoteName(charName) + '.md';
    var file = app.vault.getAbstractFileByPath(path);
    if (!file) {
        new obsidian.Notice('「' + charName + '」尚未生成独立图谱笔记。若需要，请在关系图谱页手动点击「同步到 Obsidian 图谱」。');
        return;
    }
    await openObsidianLocalGraph(app, file);
}

var SCENARIO_TEMPLATES = {
    novel: {
        folder: '小说世界',
        charFile: '人物索引.md',
        timelineFile: '时间线.md',
        charContent: '## 张三\n- 身份：主角\n- 阵营：北境王国\n- 首次出场：公元前300年\n- 出生：公元前280年\n- 亲密人物：李四\n\n## 李四\n- 身份：挚友\n- 阵营：北境王国\n- 出生：公元前290年\n- 首次出场：公元前295年\n\n## 王五\n- 身份：对手\n- 阵营：南域联盟\n- 首次出场：公元前298年\n',
        timelineContent: '# 第一卷·北境\n\n## 第一章\n### 开篇：\n- [出场] 张三首次登场 | 情节线:主线-A | 状态:埋设 | 笔记:[[第一章]]\n- [感情] 张三与李四相遇\n\n## 第二章\n### 冲突：\n- [博弈] 王五现身，三方对峙 | 情节线:主线-A | 状态:推进\n'
    },
    diary: {
        folder: '生活日记',
        charFile: '人物索引.md',
        timelineFile: '日记时间线.md',
        charContent: '## 小明\n- 身份：同事\n- 所属组织：公司A\n- 首次出现：2025年1月\n- 亲密关系：小红\n\n## 小红\n- 身份：朋友\n- 所属组织：公司B\n- 首次出现：2024年12月\n',
        timelineContent: '## 2025年7月7日\n- [日常] 和小明一起吃午饭，聊了项目进展\n\n## 2025年7月6日\n- [感情] 给小红发了生日祝福\n'
    },
    trpg: {
        folder: '跑团战役',
        charFile: '人物索引.md',
        timelineFile: '冒险日志.md',
        charContent: '## 艾拉\n- 身份：精灵游侠 PC\n- 势力：银月旅团\n- 登场：序章\n- 诞生：森林历102年\n\n## 莫格\n- 身份：矮人战士 PC\n- 势力：铁锤氏族\n- 登场：序章\n\n## 暗影领主\n- 身份：BBEG\n- 势力：深渊教团\n- 登场：第一章\n',
        timelineContent: '## 序章\n### 酒馆：\n- [出场] 艾拉与莫格在「断剑酒馆」相遇\n- [博弈] 接受神秘委托\n\n## 第一章\n### 地下城：\n- [战斗] 遭遇暗影领主的爪牙\n'
    },
    knowledge: {
        folder: '知识库',
        charFile: '概念索引.md',
        timelineFile: '知识脉络.md',
        charContent: '## 机器学习\n- 分类：人工智能\n- 首次收录：2020年\n- 相关概念：深度学习, 神经网络\n\n## 深度学习\n- 分类：人工智能\n- 首次收录：2018年\n- 相关概念：机器学习, 反向传播\n\n## 反向传播\n- 分类：算法\n- 首次收录：2019年\n',
        timelineContent: '## 2018年\n- [节点] 深度学习概念首次整理\n\n## 2019年\n- [引用] 反向传播与梯度下降的关系梳理\n\n## 2020年\n- [因果] 机器学习与深度学习体系建立\n'
    }
};

async function createScenarioTemplate(app, plugin, mode) {
    var tpl = SCENARIO_TEMPLATES[mode];
    if (!tpl) {
        new obsidian.Notice('未知场景模板');
        return null;
    }
    var adapter = app.vault.adapter;
    if (!await adapter.exists(tpl.folder)) {
        await adapter.mkdir(tpl.folder);
    }
    var graphFolder = tpl.folder + '/关系图谱节点';
    if (!await adapter.exists(graphFolder)) {
        await adapter.mkdir(graphFolder);
    }

    var charPath = tpl.folder + '/' + tpl.charFile;
    var timelinePath = tpl.folder + '/' + tpl.timelineFile;
    if (!await adapter.exists(charPath)) {
        await app.vault.create(charPath, tpl.charContent);
    }
    if (!await adapter.exists(timelinePath)) {
        await app.vault.create(timelinePath, tpl.timelineContent);
    }

    var readmePath = tpl.folder + '/README.md';
    if (!await adapter.exists(readmePath)) {
        var readme = '# ' + tpl.folder + '\n\n本文件夹由「人物关系谱系」插件自动生成。\n\n- **' + tpl.charFile + '**：实体/人物数据\n- **' + tpl.timelineFile + '**：时间线/日记/脉络\n- **关系与阵营.md**：关系与阵营（可双向编辑）\n- **关系图谱节点/**：同步到 Obsidian 原生图谱的独立笔记\n\n💡 不同场景 = 不同文件夹，在插件设置中指定文件夹路径即可切换数据源。\n';
        await app.vault.create(readmePath, readme);
    }

    var relMetaPath = tpl.folder + '/关系与阵营.md';
    if (!await adapter.exists(relMetaPath)) {
        await app.vault.create(relMetaPath, '# 关系与阵营\n\n# 阵营\n\n（暂无阵营）\n\n# 关系\n\n（暂无关系）\n');
    }

    plugin.settings.charFolder = tpl.folder;
    plugin.settings.timelineFolder = tpl.folder;
    plugin.settings.charFile = tpl.charFile;
    plugin.settings.timelineFile = tpl.timelineFile;
    plugin.settings.graphNotesFolder = graphFolder;
    applyUseCaseMode(plugin, mode);
    await plugin.saveSettings();

    var view = app.workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (view && view.view) {
        await view.view.loadAllData();
        if ((plugin.settings.syncGraphOnSave === true && plugin.settings.graphAutoSyncExplicitlyEnabled === true)) {
            await syncGraphNotesToVault(plugin, view.view);
        }
    }
    refreshCharView(app);
    return tpl.folder;
}

function createOption(value, text) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    return opt;
}

// ========== 历史时间解析 ==========
// auto: bare years default to CE; bc/ad: bare years follow the selected story era.
var ACTIVE_TIMELINE_ERA = 'auto';
function parseHistoricalDate(str) {
    if (!str || !String(str).trim()) return null;
    var s = String(str).trim();

    // ===== 支持括号中的年份格式 =====
    // 中文括号 + 公元前：秦始皇帝二十六年（公元前221年）→ -221
    var bracketBcMatch = s.match(/（公元前\s*(\d+(?:\.\d+)?)\s*年）/);
    if (bracketBcMatch) {
        var bcYear = parseFloat(bracketBcMatch[1]);
        return { sortValue: -bcYear, display: s, era: 'bc', year: bcYear };
    }

    // 中文括号 + 公元/数字年：天宝十四年（755年）→ 755
    var bracketMatch = s.match(/（(\d+(?:\.\d+)?)\s*年）/);
    if (bracketMatch) {
        var year = parseFloat(bracketMatch[1]);
        return ACTIVE_TIMELINE_ERA === 'bc' ? { sortValue: -year, display: s, era: 'bc', year: year } : { sortValue: year, display: s, era: 'ad', year: year };
    }

    // 英文括号 + 公元前：秦始皇帝二十六年(公元前221年)→ -221
    var bracketBcMatchEn = s.match(/\(公元前\s*(\d+(?:\.\d+)?)\s*年\)/);
    if (bracketBcMatchEn) {
        var bcYearEn = parseFloat(bracketBcMatchEn[1]);
        return { sortValue: -bcYearEn, display: s, era: 'bc', year: bcYearEn };
    }

    // 英文括号 + 公元/数字年：天宝十四年(755年) → 755
    var bracketMatchEn = s.match(/\((\d+(?:\.\d+)?)\s*年\)/);
    if (bracketMatchEn) {
        var yearEn = parseFloat(bracketMatchEn[1]);
        return ACTIVE_TIMELINE_ERA === 'bc' ? { sortValue: -yearEn, display: s, era: 'bc', year: yearEn } : { sortValue: yearEn, display: s, era: 'ad', year: yearEn };
    }

    // 英文后置纪年：300 BC / 300 BCE / 300 B.C.E.
    var postfixBcMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:年\s*)?(?:BCE|B\.C\.E\.?|BC|B\.C\.?)/i);
    if (postfixBcMatch) {
        var postfixBcYear = parseFloat(postfixBcMatch[1]);
        return { sortValue: -postfixBcYear, display: s, era: 'bc', year: postfixBcYear };
    }

    // ===== 原有格式 =====
    var bcMatch = s.match(/(?:公元前|前|BCE|BC|B\.C\.E?\.?)\s*(\d+(?:\.\d+)?)\s*(?:年)?/i);
    if (bcMatch) {
        var bcYear = parseFloat(bcMatch[1]);
        return { sortValue: -bcYear, display: s, era: 'bc', year: bcYear };
    }

    var adMatch = s.match(/(?:公元|AD|A\.D\.?)\s*(\d+(?:\.\d+)?)\s*(?:年)?/i);
    if (adMatch) {
        var adYear = parseFloat(adMatch[1]);
        return { sortValue: adYear, display: s, era: 'ad', year: adYear };
    }

    var yearMatch = s.match(/^(\d+(?:\.\d+)?)\s*年$/);
    if (yearMatch) {
        var y1 = parseFloat(yearMatch[1]);
        return ACTIVE_TIMELINE_ERA === 'bc' ? { sortValue: -y1, display: s, era: 'bc', year: y1 } : { sortValue: y1, display: s, era: 'ad', year: y1 };
    }

    var numMatch = s.match(/^(\d+(?:\.\d+)?)$/);
    if (numMatch) {
        var y2 = parseFloat(numMatch[1]);
        return ACTIVE_TIMELINE_ERA === 'bc' ? { sortValue: -y2, display: s, era: 'bc', year: y2 } : { sortValue: y2, display: s, era: 'ad', year: y2 };
    }

    // ===== 现代日期（日记模式）=====
    var isoMatch = s.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?/);
    if (isoMatch) {
        var iy = parseInt(isoMatch[1], 10);
        var im = parseInt(isoMatch[2], 10) || 1;
        var id = parseInt(isoMatch[3], 10) || 1;
        return { sortValue: iy * 10000 + im * 100 + id, display: s, era: 'modern', year: iy, month: im, day: id };
    }
    var cnDateMatch = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?/);
    if (cnDateMatch) {
        var cy = parseInt(cnDateMatch[1], 10);
        var cm = parseInt(cnDateMatch[2], 10);
        var cd = parseInt(cnDateMatch[3], 10);
        return { sortValue: cy * 10000 + cm * 100 + cd, display: s, era: 'modern', year: cy, month: cm, day: cd };
    }
    var cnMonthMatch = s.match(/^(\d{4})年(\d{1,2})月$/);
    if (cnMonthMatch) {
        var my = parseInt(cnMonthMatch[1], 10);
        var mm = parseInt(cnMonthMatch[2], 10);
        return { sortValue: my * 10000 + mm * 100, display: s, era: 'modern', year: my, month: mm };
    }

    // 含季节/后缀的年份：前280年冬、755年春
    var bcSuffixMatch = s.match(/(?:公元前|前)\s*(\d+(?:\.\d+)?)\s*年/);
    if (bcSuffixMatch) {
        var bcSuf = parseFloat(bcSuffixMatch[1]);
        return { sortValue: -bcSuf, display: s, era: 'bc', year: bcSuf };
    }
    var adSuffixMatch = s.match(/(?:公元\s*)?(\d+(?:\.\d+)?)\s*年/);
    if (adSuffixMatch) {
        var adSuf = parseFloat(adSuffixMatch[1]);
        return ACTIVE_TIMELINE_ERA === 'bc' && !/(公元|AD|A\.D\.)/i.test(s) ? { sortValue: -adSuf, display: s, era: 'bc', year: adSuf } : { sortValue: adSuf, display: s, era: 'ad', year: adSuf };
    }

    var chapter = parseChapterHeading(s);
    if (chapter) {
        return { sortValue: chapter.num, display: s, era: 'chapter', year: chapter.num, chapter: chapter.num };
    }

    return { sortValue: null, display: s, era: 'unknown', raw: s };
}

function timesAreComparable(a, b) {
    var pa = typeof a === 'object' && a && a.era ? a : parseHistoricalDate(a);
    var pb = typeof b === 'object' && b && b.era ? b : parseHistoricalDate(b);
    if (!pa || !pb || pa.sortValue == null || pb.sortValue == null) return false;
    if (pa.era === 'chapter' && pb.era !== 'chapter') return false;
    if (pb.era === 'chapter' && pa.era !== 'chapter') return false;
    return true;
}

function formatSortValue(sortValue) {
    if (sortValue === null || sortValue === undefined || isNaN(sortValue)) return '?';
    if (sortValue < 0) return '前' + Math.abs(Math.round(sortValue)) + '年';
    if (sortValue === 0) return '公元元年';
    return Math.round(sortValue) + '年';
}

function getTimeSortValue(str) {
    if (!str || !String(str).trim()) return null;
    var p = parseHistoricalDate(str);
    return p && p.sortValue !== null ? p.sortValue : null;
}

function isTimeFilterActive(plugin) {
    if (!plugin || !plugin.settings) return false;
    if (plugin.settings.timeFilterEnabled === false) return false;
    return !!(plugin.settings.currentTimePoint || '').trim();
}

function isRelationActiveAtTime(rel, timeStr) {
    if (!timeStr) return true;
    var cur = getTimeSortValue(timeStr);
    if (cur === null) return true;
    var start = getTimeSortValue(rel && rel.startTime);
    var end = getTimeSortValue(rel && rel.endTime);
    if (start !== null && cur < start) return false;
    if (end !== null && cur > end) return false;
    return true;
}

function isEventAtOrBeforeTime(evt, timeStr) {
    if (!timeStr) return true;
    var cur = getTimeSortValue(timeStr);
    var evtSort = eventSortValue(evt);
    if (cur === null || evtSort === null) return true;
    return evtSort <= cur;
}

function auditUnbornAppearances(view) {
    var issues = [];
    if (!view || !view.timeline || !view.chars) return issues;
    var birthField = (view.plugin.settings && view.plugin.settings.birthFieldNames) || '出生,出生时间';
    for (var i = 0; i < view.timeline.length; i++) {
        var evt = view.timeline[i];
        var evtSort = getTimeSortValue(evt.storyYear || evt.year);
        if (evtSort === null) continue;
        var names = findCharsInEvent(evt.event, view.charNames || []);
        for (var j = 0; j < names.length; j++) {
            var char = view.findChar ? view.findChar(names[j]) : null;
            if (!char) continue;
            var birth = view.getFieldValue(char, birthField);
            var birthSort = getTimeSortValue(birth);
            if (birthSort !== null && evtSort < birthSort) {
                issues.push({
                    type: 'unborn_appear',
                    severity: 'high',
                    message: names[j] + ' 在出生前出场：' + evt.year + ' · ' + String(evt.event || '').substring(0, 28),
                    charName: names[j],
                    event: evt
                });
            }
        }
    }
    return issues;
}


// P3 模块化：故事逻辑校验器独立于主视图，全部本地运行。
var storyAudit = createStoryAudit({
    getTimeSortValue: getTimeSortValue,
    parseHistoricalDate: parseHistoricalDate,
    findCharsInEvent: findCharsInEvent,
    auditUnbornAppearances: auditUnbornAppearances,
    collectDeadAfterAppearIssues: collectDeadAfterAppearIssues,
    novelExt: novelExt
});
var collectStoryLogicIssues = storyAudit.collectStoryLogicIssues;

function getHomeTab(plugin) {
    // 3.7.6：创作工作台是统一首页，不再受旧版 novelCompactUI / 场景模式开关影响。
    return 'desk';
}

function collectDeadAfterAppearIssues(view) {
    var issues = [];
    if (!view || !view.chars || !view.timeline) return issues;
    var deathField = (view.plugin.settings && view.plugin.settings.deathFieldNames) || '死亡,死亡时间';
    for (var i = 0; i < view.chars.length; i++) {
        var c = view.chars[i];
        var death = view.getFieldValue(c, deathField);
        var deathSort = getTimeSortValue(death);
        if (deathSort === null) continue;
        for (var j = 0; j < view.timeline.length; j++) {
            var evt = view.timeline[j];
            var yearSort = getTimeSortValue(evt.storyYear || evt.year);
            if (yearSort === null || yearSort <= deathSort) continue;
            var appeared = findCharsInEvent(evt.event, [c.name]);
            if (appeared.length > 0) {
                issues.push({
                    type: 'dead_after_appear',
                    severity: 'high',
                    message: c.name + ' 卒于 ' + death + '，却在「' + evt.year + '」仍出场',
                    charName: c.name,
                    event: evt
                });
                break;
            }
        }
    }
    return issues;
}

function getRecentIntimacyHistory(plugin, limit) {
    var history = (plugin && plugin._intimacyHistory) || [];
    var sorted = history.slice().sort(function(a, b) {
        var da = a.recordDate || a.timestamp || '';
        var db = b.recordDate || b.timestamp || '';
        if (da !== db) return String(db).localeCompare(String(da));
        var sa = getRecordSortValue(a);
        var sb = getRecordSortValue(b);
        if (sa !== null && sb !== null) return sb - sa;
        return 0;
    });
    if (limit && sorted.length > limit) return sorted.slice(0, limit);
    return sorted;
}

function sortRelationsByIntimacy(relations) {
    return (relations || []).slice().sort(function(a, b) {
        return (b.intimacy || 0) - (a.intimacy || 0);
    });
}

function snapshotTextHash(text) {
    // FNV-1a 32-bit：用于发现快照文件意外损坏/改动，不作为密码学签名。
    var value = 2166136261;
    var str = String(text);
    for (var i = 0; i < str.length; i++) {
        value ^= str.charCodeAt(i);
        value = Math.imul(value, 16777619) >>> 0;
    }
    return ('00000000' + value.toString(16)).slice(-8);
}

async function createVaultSnapshot(app, plugin) {
    var adapter = app.vault.adapter;
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    var baseFolder = (plugin.settings.charFolder || '').trim();
    var snapRoot = baseFolder ? baseFolder + '/设定快照' : '设定快照';
    var destFolder = snapRoot + '/' + stamp + '-' + Math.random().toString(36).slice(2, 6);
    async function ensureVaultFolder(folderPath) {
        var parts = String(folderPath || '').split('/').filter(Boolean);
        var current = '';
        for (var fi = 0; fi < parts.length; fi++) {
            current = current ? current + '/' + parts[fi] : parts[fi];
            if (!await adapter.exists(current)) await app.vault.createFolder(current);
        }
    }
    await ensureVaultFolder(destFolder);
    var copied = [];
    var failures = [];

    async function copyVaultFile(srcPath, destName) {
        if (!srcPath) return;
        var file = app.vault.getAbstractFileByPath(srcPath);
        if (!file) return;
        var content = await app.vault.read(file);
        var dest = destFolder + '/' + destName;
        await app.vault.create(dest, content);
        var verify = app.vault.getAbstractFileByPath(dest);
        if (!verify || (await app.vault.read(verify)) !== content) throw new Error('快照校验失败：' + destName);
        copied.push({ name: destName, source: srcPath, size: content.length });
    }
    async function copyAdapterFile(srcPath, destName) {
        if (!await adapter.exists(srcPath)) return;
        var content = await adapter.read(srcPath);
        var dest = destFolder + '/' + destName;
        await app.vault.create(dest, content);
        var verify = app.vault.getAbstractFileByPath(dest);
        if (!verify || (await app.vault.read(verify)) !== content) throw new Error('快照校验失败：' + destName);
        copied.push({ name: destName, source: srcPath, size: content.length });
    }

    var tasks = [
        function() { return copyVaultFile(getCharFullPath(plugin), '人物索引.md'); },
        function() { return copyVaultFile(getTimelineFullPath(plugin), '时间线.md'); },
        function() { return copyVaultFile(getRelationMetaPath(plugin), '关系与阵营.md'); },
        function() { return copyAdapterFile(getDataPath(plugin), 'relations-data.json'); },
        function() { return copyAdapterFile(app.vault.configDir + '/plugins/' + plugin.manifest.id + '/data.json', 'plugin-settings.json'); },
        function() { return copyAdapterFile(app.vault.configDir + '/plugins/' + plugin.manifest.id + '/intimacy_history.json', 'intimacy_history.json'); }
    ];
    for (var i = 0; i < tasks.length; i++) {
        try { await tasks[i](); } catch (e) { failures.push(e.message || String(e)); }
    }
    // 结构化清单用于安全恢复；每个条目都保留原始 Vault/插件路径与完整性校验值。
    for (var ci = 0; ci < copied.length; ci++) {
        var snapRaw = await adapter.read(destFolder + '/' + copied[ci].name);
        copied[ci].hash = snapshotTextHash(snapRaw);
    }
    var manifest = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        folder: destFolder,
        pluginId: plugin.manifest.id,
        complete: failures.length === 0 && copied.length > 0,
        errors: failures.slice(),
        files: copied.map(function(x) { return { name: x.name, source: x.source, size: x.size, hash: x.hash }; })
    };
    var manifestText = JSON.stringify(manifest, null, 2);
    await app.vault.create(destFolder + '/_snapshot.json', manifestText);
    var manifestFile = app.vault.getAbstractFileByPath(destFolder + '/_snapshot.json');
    if (!manifestFile || (await app.vault.read(manifestFile)) !== manifestText) {
        throw new Error('快照索引写入校验失败：' + destFolder + '/_snapshot.json');
    }

    var meta = [
        '# 设定快照', '',
        '- 创建时间：' + new Date().toLocaleString(),
        '- 快照目录：`' + destFolder + '`',
        '- 状态：' + (failures.length ? '不完整（不可视为有效备份）' : '完整且已逐文件校验'),
        '- 机器可读索引：`_snapshot.json`（用于预览与恢复校验）',
        '- 已备份文件：' + (copied.length ? copied.map(function(x) { return x.name; }).join('、') : '（无）'),
        '',
        '## 文件清单',
        ...copied.map(function(x) { return '- `' + x.name + '` ← `' + x.source + '`（' + x.size + ' 字符）'; }),
        '',
        '## 错误',
        ...(failures.length ? failures.map(function(x) { return '- ' + x; }) : ['- 无']),
        '',
        '> 恢复前会自动创建当前状态快照；恢复后逐文件回读校验。', ''
    ].join('\n');
    await app.vault.create(destFolder + '/_snapshot.md', meta);
    if (failures.length || copied.length === 0) {
        new obsidian.Notice('⚠️ 快照未完整通过校验：' + failures.join('；'), 10000);
        throw new Error('快照不完整，已保留现场文件夹供排查：' + destFolder);
    }
    return { folder: destFolder, files: copied.map(function(x) { return x.name; }), verified: true };
}


function getSnapshotRoot(plugin) {
    var baseFolder = (plugin.settings.charFolder || '').trim();
    return baseFolder ? baseFolder + '/设定快照' : '设定快照';
}

function getAllowedSnapshotTargets(plugin) {
    var folder = plugin.app.vault.configDir + '/plugins/' + plugin.manifest.id + '/';
    return {
        '人物索引.md': getCharFullPath(plugin),
        '时间线.md': getTimelineFullPath(plugin),
        '关系与阵营.md': getRelationMetaPath(plugin),
        'relations-data.json': getDataPath(plugin),
        'plugin-settings.json': folder + 'data.json',
        'intimacy_history.json': folder + 'intimacy_history.json'
    };
}

function validateSnapshotFileContent(name, content) {
    if (!/\.json$/i.test(name)) return true;
    var parsed = JSON.parse(content);
    if (name === 'intimacy_history.json') { if (!Array.isArray(parsed)) throw new Error('亲密度历史必须为数组'); return true; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON根结构无效：' + name);
    if (name === 'relations-data.json' && (!Array.isArray(parsed.factions) || !Array.isArray(parsed.relations))) {
        throw new Error('关系数据缺少 factions / relations 数组');
    }
    if (name === 'intimacy_history.json' && !Array.isArray(parsed)) {
        throw new Error('亲密度历史必须为数组');
    }
    return true;
}

async function listVaultSnapshots(app, plugin) {
    var root = getSnapshotRoot(plugin);
    var adapter = app.vault.adapter;
    if (!await adapter.exists(root)) return [];
    var listing = await adapter.list(root);
    var folders = listing && listing.folders ? listing.folders : [];
    var results = [];
    for (var i = 0; i < folders.length; i++) {
        var folder = folders[i];
        var manifestPath = folder + '/_snapshot.json';
        var legacyPath = folder + '/_snapshot.md';
        var item = { folder: folder, name: folder.split('/').pop(), files: [], valid: false, legacy: false, createdAt: '' };
        try {
            if (await adapter.exists(manifestPath)) {
                var raw = await adapter.read(manifestPath);
                var manifest = JSON.parse(raw);
                if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('快照索引格式不支持');
                if (manifest.folder !== folder || manifest.pluginId !== plugin.manifest.id) throw new Error('快照所属库/插件标识不匹配');
                item.files = manifest.files;
                item.createdAt = manifest.createdAt || '';
                item.valid = manifest.complete !== false;
                if (manifest.complete === false) item.error = '快照创建时未通过完整性校验';
            } else if (await adapter.exists(legacyPath)) {
                var md = await adapter.read(legacyPath);
                var lines = md.split(/\r?\n/);
                for (var li = 0; li < lines.length; li++) {
                    var match = lines[li].match(/^- `([^`]+)` ← `([^`]+)`（(\d+) 字符）/);
                    if (match) item.files.push({ name: match[1], source: match[2], size: parseInt(match[3], 10) });
                }
                item.legacy = true;
                item.valid = item.files.length > 0;
                var dateMatch = md.match(/^- 创建时间：(.+)$/m);
                item.createdAt = dateMatch ? dateMatch[1] : '';
            }
            var allowed = getAllowedSnapshotTargets(plugin);
            for (var fi = 0; fi < item.files.length; fi++) {
                var f = item.files[fi];
                f.allowed = Object.keys(allowed).some(function(k) { return k === f.name && allowed[k] === f.source; });
                var snapshotFilePath = folder + '/' + f.name;
                if (!f.allowed || !await adapter.exists(snapshotFilePath)) {
                    f.present = false;
                    item.valid = false;
                } else {
                    var snapshotContent = await adapter.read(snapshotFilePath);
                    f.present = true;
                    if (typeof f.size === 'number' && snapshotContent.length !== f.size) {
                        f.sizeValid = false;
                        item.valid = false;
                    } else f.sizeValid = true;
                    if (f.hash && snapshotTextHash(snapshotContent) !== f.hash) { f.hashValid = false; item.valid = false; }
                    else f.hashValid = true;
                    try { validateSnapshotFileContent(f.name, snapshotContent); f.contentValid = true; }
                    catch (contentError) { f.contentValid = false; item.valid = false; f.contentError = contentError.message || String(contentError); }
                }
            }
            if (!item.files.length || item.files.some(function(f) { return !f.allowed || !f.present || f.sizeValid === false || f.hashValid === false || f.contentValid === false; })) item.valid = false;
        } catch (e) {
            item.error = e.message || String(e);
            item.valid = false;
        }
        results.push(item);
    }
    results.sort(function(a, b) { return b.name.localeCompare(a.name); });
    return results;
}

async function readSnapshotForRestore(app, plugin, snapshot) {
    if (!snapshot || !snapshot.valid) throw new Error('该快照缺少可信索引或包含未知路径，不能恢复');
    var adapter = app.vault.adapter;
    var targets = getAllowedSnapshotTargets(plugin);
    var files = [];
    for (var i = 0; i < snapshot.files.length; i++) {
        var entry = snapshot.files[i];
        var target = targets[entry.name];
        if (!target || target !== entry.source) throw new Error('快照目标路径校验失败：' + entry.name);
        var snapshotPath = snapshot.folder + '/' + entry.name;
        if (!await adapter.exists(snapshotPath)) throw new Error('快照文件缺失：' + entry.name);
        var content = await adapter.read(snapshotPath);
        if (typeof entry.size === 'number' && content.length !== entry.size) throw new Error('快照文件长度校验失败：' + entry.name);
        if (entry.hash && snapshotTextHash(content) !== entry.hash) throw new Error('快照文件完整性校验失败：' + entry.name);
        validateSnapshotFileContent(entry.name, content);
        files.push({ name: entry.name, source: target, content: content });
    }
    if (!files.length) throw new Error('快照没有可恢复的文件');
    return files;
}

async function restoreVaultSnapshot(app, plugin, snapshot) {
    var adapter = app.vault.adapter;
    var restoreFiles = await readSnapshotForRestore(app, plugin, snapshot);
    // 先读取当前现场，再创建并验证恢复前快照；两者都成功才开始写入。
    var before = [];
    for (var i = 0; i < restoreFiles.length; i++) {
        var f = restoreFiles[i];
        before.push({ source: f.source, existed: await adapter.exists(f.source), content: await adapter.exists(f.source) ? await adapter.read(f.source) : null });
    }
    var preSnapshot = await createVaultSnapshot(app, plugin);
    var written = [];
    try {
        for (var wi = 0; wi < restoreFiles.length; wi++) {
            var file = restoreFiles[wi];
            var parent = file.source.substring(0, file.source.lastIndexOf('/'));
            if (parent && !await adapter.exists(parent)) {
                var parts = parent.split('/'); var cur = '';
                for (var pi = 0; pi < parts.length; pi++) {
                    cur = cur ? cur + '/' + parts[pi] : parts[pi];
                    if (!await adapter.exists(cur)) await adapter.mkdir(cur);
                }
            }
            await adapter.write(file.source, file.content);
            var verify = await adapter.read(file.source);
            if (verify !== file.content) throw new Error('恢复后校验失败：' + file.name);
            written.push(file.name);
        }
        // 再做结构级检查，避免仅文本相同但关键 JSON 无法加载。
        for (var vi = 0; vi < restoreFiles.length; vi++) {
            var vf = restoreFiles[vi];
            if (/\.json$/i.test(vf.name)) JSON.parse(await adapter.read(vf.source));
        }
        return { restored: written, backupFolder: preSnapshot.folder, verified: true };
    } catch (restoreError) {
        var rollbackErrors = [];
        for (var ri = before.length - 1; ri >= 0; ri--) {
            try {
                if (before[ri].existed) {
                    await adapter.write(before[ri].source, before[ri].content);
                    if ((await adapter.read(before[ri].source)) !== before[ri].content) throw new Error('回滚回读不一致');
                } else if (await adapter.exists(before[ri].source)) {
                    await adapter.remove(before[ri].source);
                }
            } catch (rollbackError) { rollbackErrors.push(before[ri].source + '：' + (rollbackError.message || rollbackError)); }
        }
        var suffix = rollbackErrors.length ? '；回滚也有异常：' + rollbackErrors.join('；') : '；已尝试恢复到操作前状态';
        throw new Error('快照恢复失败：' + (restoreError.message || restoreError) + suffix + '。恢复前备份保留于：' + preSnapshot.folder);
    }
}

function findCharsInEvent(eventText, charNames) {
    var sorted = charNames.slice().sort(function(a, b) { return b.length - a.length; });
    var found = [];
    var usedRanges = [];

    for (var i = 0; i < sorted.length; i++) {
        var name = sorted[i];
        var idx = 0;
        while ((idx = eventText.indexOf(name, idx)) !== -1) {
            var end = idx + name.length;
            var overlap = false;
            for (var r = 0; r < usedRanges.length; r++) {
                if (!(end <= usedRanges[r].start || idx >= usedRanges[r].end)) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) {
                found.push(name);
                usedRanges.push({ start: idx, end: end });
                break;
            }
            idx++;
        }
    }
    return found;
}

function validateImportData(data) {
    if (!data || typeof data !== 'object') return { ok: false, error: '无效的数据格式' };
    if (data.factions !== undefined) {
        if (!Array.isArray(data.factions)) return { ok: false, error: 'factions 必须是数组' };
        for (var i = 0; i < data.factions.length; i++) {
            if (!data.factions[i] || !data.factions[i].name) return { ok: false, error: '阵营第 ' + (i + 1) + ' 项缺少 name' };
        }
    }
    if (data.relations !== undefined) {
        if (!Array.isArray(data.relations)) return { ok: false, error: 'relations 必须是数组' };
        for (var j = 0; j < data.relations.length; j++) {
            var rel = data.relations[j];
            if (!rel || !rel.charA || !rel.charB) return { ok: false, error: '关系第 ' + (j + 1) + ' 项缺少 charA 或 charB' };
        }
    }
    if (data.chars !== undefined) {
        if (!Array.isArray(data.chars)) return { ok: false, error: 'chars 必须是数组' };
        for (var ci = 0; ci < data.chars.length; ci++) if (!data.chars[ci] || !data.chars[ci].name || (data.chars[ci].fields !== undefined && (!data.chars[ci].fields || typeof data.chars[ci].fields !== 'object' || Array.isArray(data.chars[ci].fields)))) return { ok: false, error: '人物第 ' + (ci + 1) + ' 项缺少 name' };
    }
    if (data.orgMemberships !== undefined && !Array.isArray(data.orgMemberships)) return { ok: false, error: 'orgMemberships 必须是数组' };
    if (data.orgRelations !== undefined && !Array.isArray(data.orgRelations)) return { ok: false, error: 'orgRelations 必须是数组' };
    if (data.timeline !== undefined) {
        if (!Array.isArray(data.timeline)) return { ok: false, error: 'timeline 必须是数组' };
        for (var ti = 0; ti < data.timeline.length; ti++) if (!data.timeline[ti] || !data.timeline[ti].event) return { ok: false, error: '事件第 ' + (ti + 1) + ' 项缺少 event' };
    }
    return { ok: true };
}


function normalizeImportKey(value) { return String(value || '').trim().toLocaleLowerCase(); }
function relationImportKey(rel) {
    return [normalizeImportKey(rel.charA), normalizeImportKey(rel.charB)].sort().join('::') + '::' + normalizeImportKey(rel.type || '关系');
}
function eventImportKey(evt) {
    return [evt.year, evt.month, evt.tag, evt.event, evt.plotLine].map(normalizeImportKey).join('::');
}
function sameImportValue(a, b) { return JSON.stringify(a || {}) === JSON.stringify(b || {}); }
function buildSmartImportPlan(view, data, overwriteConflicts) {
    data = data || {};
    var plan = { factions: [], relations: [], chars: [], timeline: [], orgMemberships: [], conflicts: [], duplicates: [], warnings: [], counts: {} };
    function mergeList(existing, incoming, keyFn, label, overwrite) {
        var out = (existing || []).slice();
        var map = {};
        out.forEach(function(item, idx) { map[keyFn(item)] = idx; });
        (incoming || []).forEach(function(item) {
            var key = keyFn(item);
            if (!key) return;
            if (map[key] === undefined) { map[key] = out.length; out.push(item); plan[label].push(item); }
            else if (sameImportValue(out[map[key]], item)) { plan.duplicates.push(label + '：' + (item.name || item.charA + ' ↔ ' + item.charB || key)); }
            else {
                plan.conflicts.push({ type: label, key: key, current: out[map[key]], incoming: item });
                if (overwrite) { out[map[key]] = item; plan[label].push(item); }
            }
        });
        return out;
    }
    plan.mergedFactions = mergeList(view.factions, data.factions, function(f) { return normalizeImportKey(f.name); }, 'factions', !!overwriteConflicts);
    plan.mergedRelations = mergeList(view.relations, data.relations, relationImportKey, 'relations', !!overwriteConflicts);
    var existingChars = {};
    (view.chars || []).forEach(function(c) { existingChars[normalizeImportKey(c.name)] = c; });
    (data.chars || []).forEach(function(c) {
        var key = normalizeImportKey(c.name);
        if (!key) return;
        if (!existingChars[key]) { plan.chars.push(c); existingChars[key] = c; }
        else if (sameImportValue(existingChars[key].fields || {}, c.fields || {})) plan.duplicates.push('人物：' + c.name);
        else plan.conflicts.push({ type: '人物', key: key, current: existingChars[key], incoming: c, note: '人物档案冲突暂不自动覆盖，避免丢失 Markdown 中的手工内容' });
    });
    var knownChars = {};
    (view.chars || []).forEach(function(c) { knownChars[normalizeImportKey(c.name)] = true; });
    (data.chars || []).forEach(function(c) { knownChars[normalizeImportKey(c.name)] = true; });
    (data.relations || []).forEach(function(r) {
        if (!knownChars[normalizeImportKey(r.charA)] || !knownChars[normalizeImportKey(r.charB)]) plan.warnings.push('关系「' + r.charA + ' ↔ ' + r.charB + '」引用了当前人物档案中不存在的人物');
    });
    var membershipKeys = {};
    (view.orgMemberships || []).forEach(function(r) { membershipKeys[String(r.id || [r.character,r.organization,r.type,r.startTime].join('::'))] = true; });
    (data.orgMemberships || []).forEach(function(r) { var key=String(r.id || [r.character,r.organization,r.type,r.startTime].join('::')); if(membershipKeys[key]) plan.duplicates.push('组织任职：'+(r.character||'')+' · '+(r.organization||'')); else { plan.orgMemberships.push(r); membershipKeys[key]=true; } });
    var eventKeys = {};
    (view.timeline || []).forEach(function(e) { eventKeys[eventImportKey(e)] = true; });
    (data.timeline || []).forEach(function(e) {
        var key = eventImportKey(e);
        if (!key || eventKeys[key]) plan.duplicates.push('事件：' + (e.year || '') + ' ' + (e.event || '').slice(0, 24));
        else { plan.timeline.push(e); eventKeys[key] = true; }
    });
    plan.counts = {
        factions: plan.factions.length, relations: plan.relations.length,
        chars: plan.chars.length, timeline: plan.timeline.length, orgMemberships: plan.orgMemberships.length,
        conflicts: plan.conflicts.length, duplicates: plan.duplicates.length, warnings: plan.warnings.length
    };
    return plan;
}

function openCharView(app) {
    var leaf = app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
        app.workspace.getRightLeaf(false).setViewState({ type: VIEW_TYPE, active: true });
    } else {
        app.workspace.revealLeaf(leaf);
        // 左侧插件图标 / 打开命令代表进入工作台首页，而不是恢复上次停留的子模块。
        if (leaf.view) {
            leaf.view._tabHistory = [];
            leaf.view._suppressTabHistory = true; leaf.view._tab = 'desk'; leaf.view._suppressTabHistory = false;
            leaf.view.searchText = '';
            leaf.view.selectedTag = '';
            if (typeof leaf.view.render === 'function') leaf.view.render();
        }
    }
}

function refreshCharView(app, options) {
    options = options || {};
    var leaves = app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length > 0) {
        var view = leaves[0].view;
        if (view && view.loadAllData) {
            view.loadAllData(options).then(function() { view.render(); });
        }
    }
}

function getCharLifecycle(view, char) {
    var settings = view.plugin.settings;
    var birth = view.getFieldValue(char, settings.birthFieldNames || '出生,出生时间');
    var death = view.getFieldValue(char, settings.deathFieldNames || '死亡,死亡时间');
    var firstAppear = view.getFieldValue(char, settings.firstAppearFieldName || '首次出场');
    return {
        birth: birth,
        death: death,
        firstAppear: firstAppear,
        birthParsed: parseHistoricalDate(birth),
        deathParsed: parseHistoricalDate(death),
        firstAppearParsed: parseHistoricalDate(firstAppear)
    };
}
// ========== 视图 ==========
var MyView = /** @class */ (function (_super) {
    __extends(MyView, _super);
    function MyView(leaf, plugin) {
        var _this = _super.call(this, leaf) || this;
        _this.plugin = plugin;
        _this.chars = [];
        _this.timeline = [];
        _this.factions = [];
        _this.relations = [];
        _this.orgRelations = [];
        _this.orgMemberships = [];
        _this._tabHistory = [];
        _this.tab = getHomeTab(plugin);
        _this.heatmapMode = '集中';        // '集中' | '单人' | '多人'
        _this.heatmapGranularity = '年';   // '年' | '半年' | '季度' | '月'
        _this.heatmapYearRange = null;     // { start: 0, end: 2 }
        _this.heatmapPage = 1;
        _this.heatmapPageSize = 20;
        _this.heatmapSearchText = '';
        _this.heatmapFilterType = '全部';
        _this.heatmapSelectedPeople = [];
        _this.heatmapSelectedPerson = '';
        _this.searchText = '';
        _this.expandedFactions = {};
        _this.selectedTag = '';
        _this.relationFilterType = 'all';
        _this.relationFilterIntimacy = 'all';
        _this.relationSortBy = 'intimacy';
        _this.relationViewMode = 'list';
        _this.expandedRelationGroups = {};
        _this._rendering = false;
        _this.lifecycleSortBy = 'birth';
        _this.lifecycleSortOrder = 'asc';
        _this.lifecycleOnlyDated = false;
        _this.charMap = {};
        _this.appearCounts = {};
        _this.relationCounts = {};
        _this.charNames = [];
        _this._showMoreTabs = false;
        _this._plotLineFilter = '';
        _this._timelineExpandedYears = {};
        _this._timelineExpandedMonths = {};
        _this._globalSearchText = '';
        return _this;
    }
    Object.defineProperty(MyView.prototype, 'tab', {
        configurable: true,
        get: function () { return this._tab || getHomeTab(this.plugin); },
        set: function (next) {
            next = String(next || getHomeTab(this.plugin));
            var current = this._tab || '';
            if (current && current !== next && !this._suppressTabHistory) {
                this._tabHistory = this._tabHistory || [];
                this._tabHistory.push(current);
                if (this._tabHistory.length > 60) this._tabHistory.shift();
            }
            this._tab = next;
        }
    });
    MyView.prototype.goBack = function () {
        var history = this._tabHistory || [];
        while (history.length) { var previous = history.pop(); if (previous && previous !== this.tab) { this._suppressTabHistory = true; this._tab = previous; this._suppressTabHistory = false; this.render(); return; } }
        new obsidian.Notice('已经没有可返回的上一页');
    };

    MyView.prototype.getViewType = function () { return VIEW_TYPE; };
    MyView.prototype.getDisplayText = function () { return getViewTitle(this.plugin); };
    MyView.prototype.getIcon = function () { return 'users'; };

    MyView.prototype.onOpen = function () {
        var self = this;
        this._activeChapterFile = this.app.workspace.getActiveFile ? this.app.workspace.getActiveFile() : null;
        this.registerEvent(this.app.workspace.on('file-open', function (opened) {
            if (opened && opened.extension === 'md') { self._activeChapterFile = opened; if (self.tab === 'chapterStatus') self.render(); }
        }));
        this.registerEvent(this.app.workspace.on('active-leaf-change', function () {
            var active = self.app.workspace.getActiveFile ? self.app.workspace.getActiveFile() : null;
            if (active && active.extension === 'md') self._activeChapterFile = active;
            if (self.tab === 'chapterStatus') self.render();
        }));
        this.contentEl.empty();
        this.contentEl.addClass('my-char-view-root');
        this.loadAllData().then(function() {
            self.render();
        });
    };

    MyView.prototype.getCharField = function (charData, fieldName) {
        var raw = charData && charData.fields ? (charData.fields[fieldName] || '') : '';
        var factionField = this.plugin && this.plugin.settings && (this.plugin.settings.factionFieldName || '阵营');
        if (!charData || fieldName !== factionField || !Array.isArray(this.orgMemberships)) return raw;
        var name = String(charData.name || '');
        var records = normalizeOrgMemberships(this.orgMemberships).filter(function(r) { return r.character === name; });
        if (!records.length) return raw; // 兼容旧人物：没有任职履历时沿用原阵营字段
        var progress = this.plugin.settings.currentTimePoint || '';
        var current = records.filter(function(r) {
            // 已解散组织的履历保留作历史依据，但不再作为人物当前阵营。
            return r.type !== '组织解散' && classifyOrgMembershipAtProgress(r, progress) === 'current';
        });
        if (!current.length) return '暂无当前阵营';
        var names = [];
        current.forEach(function(r) { if (names.indexOf(r.organization) < 0) names.push(r.organization); });
        return names.join('、');
    };

    // 根据人物在当前故事时间点的有效任职记录确定阵营颜色。
    // 多个阵营同时有效时，取开始时间最晚的有效任职记录；若时间相同，按记录 id 稳定排序，避免依赖阵营数组顺序。
    MyView.prototype.getFactionColorForChar = function (charData) {
        if (!charData) return '';
        var factions = Array.isArray(this.factions) ? this.factions : [];
        var factionByName = Object.create(null);
        factions.forEach(function (faction) {
            if (!faction || !faction.name || !faction.color) return;
            var key = String(faction.name).trim();
            if (typeof stripWikiName === 'function') key = stripWikiName(key);
            factionByName[key.toLocaleLowerCase()] = String(faction.color).trim();
        });
        var characterName = String(charData.name || '').trim();
        var progress = this.plugin && this.plugin.settings ? (this.plugin.settings.currentTimePoint || '') : '';
        var memberships = normalizeOrgMemberships(this.orgMemberships).filter(function (record) {
            return String(record.character || '').trim() === characterName && record.type !== '组织解散' && classifyOrgMembershipAtProgress(record, progress) === 'current';
        });
        if (memberships.length) {
            memberships.sort(function (a, b) {
                var pa = parseHistoricalDate(a.startTime), pb = parseHistoricalDate(b.startTime);
                var av = pa && pa.sortValue != null ? pa.sortValue : -Infinity;
                var bv = pb && pb.sortValue != null ? pb.sortValue : -Infinity;
                if (av !== bv) return bv - av;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
            for (var mi = 0; mi < memberships.length; mi++) {
                var orgName = String(memberships[mi].organization || '').trim();
                if (typeof stripWikiName === 'function') orgName = stripWikiName(orgName);
                var membershipColor = factionByName[orgName.toLocaleLowerCase()];
                if (membershipColor) return membershipColor;
            }
            // 存在履历时严格以当前有效履历为准，不回退到过期的基础资料阵营字段。
            return '';
        }
        // 兼容没有组织任职履历的旧人物数据。
        var factionField = this.plugin && this.plugin.settings && (this.plugin.settings.factionFieldName || '阵营') || '阵营';
        var raw = String((charData.fields && charData.fields[factionField]) || '').trim();
        if (!raw || /^(暂无当前阵营|未分配阵营|无)$/.test(raw)) return '';
        var names = raw.split(/[、，,;；|/]+/).map(function (part) {
            var value = String(part || '').trim();
            if (typeof stripWikiName === 'function') value = stripWikiName(value);
            return value.toLocaleLowerCase();
        }).filter(Boolean);
        for (var ni = 0; ni < names.length; ni++) if (factionByName[names[ni]]) return factionByName[names[ni]];
        return '';
    };

    MyView.prototype.getFieldValue = function (charData, fieldNames) {
        if (!fieldNames) return '';
        var names = Array.isArray(fieldNames) ? fieldNames : fieldNames.split(',');
        for (var i = 0; i < names.length; i++) {
            var val = this.getCharField(charData, names[i].trim());
            if (val) return val;
        }
        return '';
    };

    MyView.prototype.renderCompactTopBar = function (container) {
        var self = this;
        var bar = container.createEl('div', { cls: 'my-char-compact-top-bar' });

        var expandBtn = bar.createEl('button', { text: '▼ 展开顶栏', cls: 'my-char-view-btn my-char-btn-xs my-char-top-toggle-btn' });
        expandBtn.title = '展开标题、工具栏与 Tab';
        expandBtn.addEventListener('click', async function () {
            self.plugin.settings.topChromeCollapsed = false;
            self._forceTopChromeExpanded = true;
            await self.plugin.saveSettings();
            self.render();
        });

        ensureValidTab(this);
        var tabNames = getVisibleTabs(this.plugin);
        var tabSelect = bar.createEl('select', { cls: 'my-char-compact-tab-select' });
        for (var i = 0; i < tabNames.length; i++) {
            var opt = tabSelect.createEl('option', { text: tabNames[i].label, value: tabNames[i].id });
            if (tabNames[i].id === self.tab) opt.selected = true;
        }
        tabSelect.addEventListener('change', function () {
            self.tab = tabSelect.value;
            self.searchText = '';
            self.selectedTag = '';
            self.render();
        });

        bar.createEl('span', { text: getToolbarStatsText(this), cls: 'my-char-compact-stats' });

        var refreshBtn = bar.createEl('button', { text: '🔄', cls: 'my-char-view-btn my-char-btn-xs' });
        refreshBtn.title = '刷新数据';
        refreshBtn.addEventListener('click', function () {
            self.loadAllData().then(function () { self.render(); });
        });
    };

    MyView.prototype.render = function () {
        if (this._rendering) return;
        this._rendering = true;

        var container = this.contentEl;
        container.empty();
        container.addClass('my-char-view-root');
        var self = this;
        var currentTabMeta = getVisibleTabs(this.plugin).find(function (t) { return t.id === self.tab; });
        var compactHeader = container.createEl('div', { cls: 'rw-compact-header' });
        var backBtn = compactHeader.createEl('button', { text: '←', cls: 'rw-home-button rw-back-button' });
        backBtn.title = '返回上一页'; backBtn.setAttribute('aria-label','返回上一页');
        backBtn.disabled = !(this._tabHistory && this._tabHistory.length);
        backBtn.addEventListener('click', function(){ self.goBack(); });
        var homeBtn = compactHeader.createEl('button', { text: '⌂', cls: 'rw-home-button' });
        homeBtn.title = '返回创作工作台';
        homeBtn.setAttribute('aria-label', '返回创作工作台');
        homeBtn.addEventListener('click', function () {
            self._tabHistory = [];
            self._suppressTabHistory = true; self._tab = 'desk'; self._suppressTabHistory = false;
            self.searchText = '';
            self.selectedTag = '';
            self.render();
        });
        compactHeader.createEl('div', { text: self.tab === getHomeTab(self.plugin) ? '创作工作台' : ((currentTabMeta && currentTabMeta.label) || '工作区'), cls: 'rw-current-module' });
        var undoBtn = compactHeader.createEl('button', { text: '↶', cls: 'rw-refresh-button rw-history-button' });
        undoBtn.title = '撤销上一步数据操作'; undoBtn.setAttribute('aria-label', '撤销');
        undoBtn.disabled = !(self.plugin._undoStack && self.plugin._undoStack.length) || !!self._historyBusy;
        undoBtn.addEventListener('click', function () { runHistoryAction(self, 'undo'); });
        var redoBtn = compactHeader.createEl('button', { text: '↷', cls: 'rw-refresh-button rw-history-button' });
        redoBtn.title = '重做上一步数据操作'; redoBtn.setAttribute('aria-label', '重做');
        redoBtn.disabled = !(self.plugin._redoStack && self.plugin._redoStack.length) || !!self._historyBusy;
        redoBtn.addEventListener('click', function () { runHistoryAction(self, 'redo'); });
        var headerSpacer = compactHeader.createEl('div', { cls: 'rw-header-spacer' });
        var refreshBtn = compactHeader.createEl('button', { text: '↻', cls: 'rw-refresh-button' });
        refreshBtn.title = '刷新数据';
        refreshBtn.setAttribute('aria-label', '刷新数据');
        refreshBtn.addEventListener('click', function () {
            refreshBtn.disabled = true;
            self.loadAllData({ silent: true }).then(function () { self.render(); }).catch(function (e) { showUserError('刷新数据失败', e); }).finally(function () { refreshBtn.disabled = false; });
        });

        var content = container.createEl('div', { cls: 'my-char-view-content' });
        if (needsEmptyStateGuide(this)) {
            this.renderEmptyStateGuide(content);
        } else {
            try {
                this.renderCurrentTab(content);
            } catch (err) {
                console.error('渲染错误:', err);
                content.createEl('p', { text: '渲染出错，请查看控制台', cls: 'my-char-view-empty' });
            }
        }
                this.updateCharFloatPanel();
        this._rendering = false;
    };

    MyView.prototype.renderEmptyStateGuide = function (container) {
        var self = this;
        container.empty();
        var status = getDataSetupStatus(this);
        var terms = getTermSet(this.plugin);
        var guide = container.createEl('div', { cls: 'my-char-empty-guide' });

        guide.createEl('h3', { text: '👋 欢迎使用「' + getViewTitle(this.plugin) + '」', cls: 'my-char-section-title' });
        guide.createEl('p', {
            text: '这是写作时用的设定侧栏：人物关系、亲密度史、伏笔回收、时间线穿帮。还没有检测到' + terms.entity + '或' + terms.timeline + '数据，先完成下面几步：',
            cls: 'my-char-muted'
        });

        var steps = guide.createEl('div', { cls: 'my-char-empty-steps' });

        var step1 = steps.createEl('div', { cls: 'my-char-empty-step' });
        step1.createEl('div', { text: '1', cls: 'my-char-empty-step-num' });
        var body1 = step1.createEl('div', { cls: 'my-char-empty-step-body' });
        body1.createEl('strong', { text: '创建或指定数据文件' });
        body1.createEl('p', {
            text: '推荐：一键创建场景模板（含示例' + terms.entity + '、' + terms.timeline + '与文件夹结构）',
            cls: 'my-char-muted'
        });
        var tplRow = body1.createEl('div', { cls: 'my-char-btn-group' });
        var tplModes = [
            { id: 'novel', label: '📖 小说' },
            { id: 'diary', label: '📔 日记' },
            { id: 'trpg', label: '🎲 跑团' },
            { id: 'knowledge', label: '🧠 知识库' }
        ];
        for (var ti = 0; ti < tplModes.length; ti++) {
            (function(mode) {
                var btn = tplRow.createEl('button', { text: mode.label, cls: 'my-char-view-btn my-char-btn-sm' });
                btn.addEventListener('click', async function() {
                    btn.disabled = true;
                    btn.textContent = '创建中…';
                    try {
                        var folder = await createScenarioTemplate(self.app, self.plugin, mode.id);
                        if (folder) new obsidian.Notice('✅ 已创建模板：' + folder);
                        await self.loadAllData();
                        self.render();
                    } catch (e) {
                        console.error(e);
                        new obsidian.Notice('创建失败，请查看控制台');
                        btn.disabled = false;
                        btn.textContent = mode.label;
                    }
                });
            })(tplModes[ti]);
        }
        var settingsBtn = body1.createEl('button', { text: '⚙️ 手动配置路径', cls: 'my-char-btn-ghost my-char-btn-sm' });
        settingsBtn.style.marginTop = '8px';
        settingsBtn.addEventListener('click', function() {
            self.app.setting.open();
            self.app.setting.openTabById(self.plugin.manifest.id);
        });

        var pathBox = body1.createEl('div', { cls: 'my-char-empty-paths' });
        pathBox.createEl('div', {
            text: (status.charFileExists ? '✅' : '❌') + ' ' + terms.entity + '文件：' + status.charPath,
            cls: status.charFileExists ? 'is-ok' : 'is-missing'
        });
        pathBox.createEl('div', {
            text: (status.timelineFileExists ? '✅' : '❌') + ' ' + terms.timeline + '文件：' + status.timelinePath,
            cls: status.timelineFileExists ? 'is-ok' : 'is-missing'
        });
        if (!status.charFileExists || !status.timelineFileExists) {
            pathBox.createEl('p', {
                text: '文件不存在时，可点击上方模板按钮自动创建，或在设置中修改路径后自行新建 Markdown 文件。',
                cls: 'my-char-muted'
            });
        }

        var step2 = steps.createEl('div', { cls: 'my-char-empty-step' });
        step2.createEl('div', { text: '2', cls: 'my-char-empty-step-num' });
        var body2 = step2.createEl('div', { cls: 'my-char-empty-step-body' });
        body2.createEl('strong', { text: '刷新加载数据' });
        body2.createEl('p', { text: '创建文件或修改设置后，点击刷新让插件读取最新内容。', cls: 'my-char-muted' });
        body2.createEl('button', { text: '🔄 刷新数据', cls: 'my-char-view-btn my-char-btn-sm' })
            .addEventListener('click', function() {
                self.loadAllData().then(function() { self.render(); });
            });

        var step3 = steps.createEl('div', { cls: 'my-char-empty-step' });
        step3.createEl('div', { text: '3', cls: 'my-char-empty-step-num' });
        var body3 = step3.createEl('div', { cls: 'my-char-empty-step-body' });
        body3.createEl('strong', { text: '开始录入' });
        body3.createEl('p', {
            text: '添加第一个' + terms.entity + '、记录' + terms.timeline + '事件、建立' + terms.relation + '——数据会自动写入 Markdown，Obsidian 里也能直接编辑。',
            cls: 'my-char-muted'
        });
        var actionRow = body3.createEl('div', { cls: 'my-char-btn-group' });
        actionRow.createEl('button', { text: '+ 添加' + terms.entity, cls: 'my-char-view-btn my-char-btn-sm' })
            .addEventListener('click', function() { self.showQuickAddChar(); });
        actionRow.createEl('button', { text: '+ 添加' + terms.event, cls: 'my-char-view-btn my-char-btn-sm' })
            .addEventListener('click', function() { self.showQuickAddEvent(); });
        actionRow.createEl('button', { text: '📌 打开设定侧栏', cls: 'my-char-btn-ghost my-char-btn-sm' })
            .addEventListener('click', function() {
                self.tab = getHomeTab(self.plugin);
                self.render();
            });

        var tipBox = guide.createEl('div', { cls: 'my-char-empty-tip' });
        tipBox.createEl('strong', { text: '💡 小提示' });
        tipBox.createEl('p', {
            text: '写正文时把本视图停在右侧。主界面四件事：人物关系、亲密度史、伏笔回收清单、时间线穿帮。其余功能收在「更多」。',
            cls: 'my-char-muted'
        });
    };

    // 当前正文章节仪表盘：仅从现有事件/人物/组织履历/伏笔数据汇总，不重复录入。
    MyView.prototype.renderChapterStatusTab = function (container) {
        var self = this;
        var file = this._activeChapterFile || (this.app.workspace.getActiveFile ? this.app.workspace.getActiveFile() : null);
        var head = container.createEl('div', { cls: 'rw-module-hero' });
        head.createEl('div', { text: 'CHAPTER STORY DASHBOARD', cls: 'rw-module-eyebrow' });
        head.createEl('h3', { text: '章节情况', cls: 'my-char-section-title' });
        head.createEl('p', { text: '根据当前打开的正文 Markdown 自动汇总关联剧情。这里展示的是故事设计与资料关联，不代表正文已经完成。', cls: 'my-char-muted' });
        if (!file || file.extension !== 'md') {
            container.createEl('div', { text: '请先在 Obsidian 编辑区打开一篇正文 Markdown，再切换到「章节情况」。', cls: 'my-char-view-empty' });
            return;
        }
        var path = file.path;
        var basename = file.basename || path.split('/').pop().replace(/\.md$/i, '');
        function cleanRef(ref) {
            return String(ref || '').replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].replace(/\.md$/i, '').trim();
        }
        function refMatches(ref) {
            var value = cleanRef(ref);
            if (!value) return false;
            var resolved = self.app.metadataCache && self.app.metadataCache.getFirstLinkpathDest ? self.app.metadataCache.getFirstLinkpathDest(value, path) : null;
            if (resolved && resolved.path === path) return true;
            return value === basename || value === path || value.toLowerCase() === basename.toLowerCase();
        }
        var events = (this.timeline || []).filter(function (evt) {
            var refs = normalizeChapterNotes(evt.chapterNotes && evt.chapterNotes.length ? evt.chapterNotes : evt.chapterNote);
            var designEntries = rwGetStoryDesignEntries(evt);
            return refs.some(refMatches) || designEntries.some(function (d) { return d.chapter && refMatches(d.chapter); });
        }).sort(function (a, b) { return Number(a._lineIndex || 0) - Number(b._lineIndex || 0); });
        var chars = [];
        var plotGroups = {};
        events.forEach(function (evt) {
            findCharsInEvent(evt.event || '', self.charNames || []).forEach(function (name) { if (chars.indexOf(name) < 0) chars.push(name); });
            if (evt.plotLine) {
                var key = evt.plotLine;
                if (!plotGroups[key]) plotGroups[key] = { name: key, events: [], statuses: [] };
                plotGroups[key].events.push(evt);
                if (evt.plotStatus && plotGroups[key].statuses.indexOf(evt.plotStatus) < 0) plotGroups[key].statuses.push(evt.plotStatus);
            }
        });
        var factionRows = [];
        var factionField = this.plugin.settings.factionFieldName || '阵营';
        chars.forEach(function (name) {
            var records = normalizeOrgMemberships(self.orgMemberships || []).filter(function (r) { return r.character === name; });
            if (!records.length) {
                var ch = (self.chars || []).find(function (x) { return x.name === name; });
                var raw = ch && ch.fields ? ch.fields[factionField] : '';
                String(raw || '').split(/[、,，;；]/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (org) {
                    if (!factionRows.some(function (x) { return x.character === name && x.organization === org; })) factionRows.push({ character: name, organization: org, historical: false });
                });
            } else {
                var relevantTimes = events.filter(function (evt) { return (self.charNames || []).indexOf(name) >= 0 && (evt.event || '').indexOf(name) >= 0; }).map(function (evt) { return evt.storyYear || evt.year || ''; });
                var progress = relevantTimes.length ? relevantTimes[0] : (self.plugin.settings.currentTimePoint || '');
                records.forEach(function (r) {
                    if (r.type === '组织解散') return;
                    var state = classifyOrgMembershipAtProgress(r, progress);
                    if (state === 'current' || state === 'history') {
                        if (!factionRows.some(function (x) { return x.character === name && x.organization === r.organization; })) factionRows.push({ character: name, organization: r.organization, historical: state === 'history' });
                    }
                });
            }
        });
        var titleBar = container.createEl('div', { cls: 'rw-chapter-status-titlebar' });
        titleBar.createEl('h3', { text: basename, cls: 'my-char-section-title' });
        titleBar.createEl('span', { text: path, cls: 'my-char-muted' });
        // Show the matching outline section in chapter details. The outline Markdown
        // remains the source of truth; this is a live read, not a copied snapshot.
        var outlineSection = container.createEl('section', { cls: 'rw-chapter-status-section rw-chapter-outline-detail' });
        outlineSection.createEl('h4', { text: '📖 本章大纲' });
        outlineSection.createEl('p', { text: '正在同步读取故事大纲…', cls: 'my-char-muted' });
        (async function () {
            try {
                var outlineFile = await rwResolveConfiguredFile(self.plugin, 'outlineFilePath', RW_OUTLINE_FILE);
                if (!outlineFile) { outlineSection.empty(); outlineSection.createEl('p', { text: '尚未配置故事大纲文件。', cls: 'my-char-muted' }); return; }
                var outlineMd = await self.app.vault.read(outlineFile);
                var outlineRe = /^##\s+(.+)\s*$/gm, om, outlineMatches = [];
                while ((om = outlineRe.exec(outlineMd))) outlineMatches.push({ title: om[1].trim(), start: om.index, end: outlineRe.lastIndex });
                var normalizeTitle = function (v) { return String(v || '').replace(/\.md$/i, '').replace(/[：:：\s_-]+/g, '').toLowerCase(); };
                var targetOutline = null;
                outlineMatches.forEach(function (x, i) {
                    var bodyEnd = i + 1 < outlineMatches.length ? outlineMatches[i + 1].start : outlineMd.length;
                    var a = normalizeTitle(x.title), b = normalizeTitle(basename);
                    if (x.title === basename || a === b || (b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0))) targetOutline = { title: x.title, body: outlineMd.slice(x.end, bodyEnd).replace(/\n?<!--\s*rw-timeline-events:[^>]*-->\s*/ig, '').trim() };
                });
                outlineSection.empty(); outlineSection.createEl('h4', { text: '📖 本章大纲' });
                if (targetOutline && targetOutline.body) {
                    outlineSection.createEl('div', { cls: 'rw-chapter-outline-title', text: targetOutline.title });
                    var outlineBody = outlineSection.createEl('div', { cls: 'rw-outline-rendered markdown-rendered' });
                    rwRenderMarkdown(self.app, targetOutline.body, outlineBody, self);
                } else {
                    outlineSection.createEl('p', { text: '故事大纲中尚未找到与当前正文「' + basename + '」对应的章节。请确保大纲的二级标题与正文文件名一致。', cls: 'my-char-muted' });
                }
            } catch (err) {
                outlineSection.empty(); outlineSection.createEl('h4', { text: '📖 本章大纲' });
                outlineSection.createEl('p', { text: '读取章节大纲失败：' + (err && err.message ? err.message : String(err)), cls: 'my-char-muted' });
            }
        })();
        var stats = container.createEl('div', { cls: 'rw-outline-stats' });
        [[events.length, '关联事件'], [chars.length, '涉及人物'], [factionRows.length, '阵营记录'], [Object.keys(plotGroups).length, '相关伏笔']].forEach(function (x) { var item = stats.createEl('div'); item.createEl('strong', { text: String(x[0]) }); item.createEl('span', { text: x[1] }); });
        var eventSection = container.createEl('section', { cls: 'rw-chapter-status-section rw-chapter-events-section' });
        eventSection.createEl('h4', { text: '📅 本章事件时间线' });
        if (!events.length) eventSection.createEl('p', { text: '还没有关联事件。可在时间线事件编辑窗口的「关联章节」中添加本章，或在「故事设计」中填写本章名称。', cls: 'my-char-view-empty' });
        events.forEach(function (evt) {
            var card = eventSection.createEl('div', { cls: 'rw-chapter-event-card' });
            var top = card.createEl('div', { cls: 'rw-chapter-event-top' });
            top.createEl('strong', { text: (evt.tag ? '[' + evt.tag + '] ' : '') + (evt.event || '') });
            var meta = [evt.year, evt.month, evt.storyYear].filter(function (x) { return x && x !== '未标注'; }).join(' · ');
            if (meta) card.createEl('div', { text: meta, cls: 'my-char-muted' });
            if (evt.plotLine || evt.plotStatus) card.createEl('div', { text: [evt.plotLine, evt.plotStatus].filter(Boolean).join(' · '), cls: 'my-char-muted' });
            var designs = rwGetStoryDesignEntries(evt).filter(function (d) { return d.chapter && refMatches(d.chapter); });
            designs.forEach(function (design) {
                var d = card.createEl('details', { cls: 'rw-chapter-design-details' });
                d.createEl('summary', { text: '✦ ' + (design.title || '故事设计') });
                d.createEl('div', { text: design.content || '（尚未填写设计内容）', cls: 'rw-chapter-design-content' });
                var editDesign = d.createEl('button', { text: '编辑此方案', cls: 'my-char-btn-ghost my-char-btn-sm' });
                editDesign.addEventListener('click', function (ev) { ev.preventDefault(); new StoryDesignModal(self.app, self.plugin, self, evt, design.id).open(); });
            });
            var actions = card.createEl('div', { cls: 'rw-chapter-card-actions' });
            var edit = actions.createEl('button', { text: '打开事件', cls: 'my-char-btn-ghost my-char-btn-sm' });
            edit.addEventListener('click', function () { self.tab = 'timeline'; self._pendingFocusEvent = evt; self._pendingHighlightLineIndex = evt._lineIndex != null ? evt._lineIndex : null; self.render(); });
            var addDesign = actions.createEl('button', { text: '＋ 故事线设计', cls: 'my-char-btn-ghost my-char-btn-sm' });
            addDesign.addEventListener('click', function () { new StoryDesignModal(self.app, self.plugin, self, evt).open(); });
            if (designs.length) actions.createEl('span', { text: designs.length + ' 份设计', cls: 'my-char-muted' });
        });
        var peopleSection = container.createEl('section', { cls: 'rw-chapter-status-section' });
        peopleSection.createEl('h4', { text: '👤 涉及人物' });
        if (!chars.length) peopleSection.createEl('p', { text: '暂未从关联事件内容中识别到人物。', cls: 'my-char-muted' });
        chars.forEach(function (name) {
            var row = peopleSection.createEl('div', { cls: 'rw-chapter-entity-row' });
            row.createEl('span', { text: name });
            var btn = row.createEl('button', { text: '查看人物档案', cls: 'my-char-btn-ghost my-char-btn-sm' });
            btn.addEventListener('click', function () { var target = (self.chars || []).find(function (c) { return c.name === name; }); if (target) self.showCharDetail(target); });
        });
        var factionSection = container.createEl('section', { cls: 'rw-chapter-status-section' });
        factionSection.createEl('h4', { text: '🏳️ 涉及阵营' });
        if (!factionRows.length) factionSection.createEl('p', { text: '暂无可识别的阵营记录。若人物有任职履历，将优先按事件故事时间判断；旧人物则兼容其阵营字段。', cls: 'my-char-muted' });
        factionRows.forEach(function (r) { var row=factionSection.createEl('div', { cls: 'rw-chapter-entity-row rw-chapter-faction-row' }); row.createEl('span', { text: r.character + ' · ' + r.organization + (r.historical ? '（历史所属）' : '') }); var btn=row.createEl('button',{text:'查看阵营',cls:'my-char-btn-ghost my-char-btn-sm'}); btn.addEventListener('click',function(){self._focusFactionName=r.organization;self.expandedFactions[r.organization]=true;self.tab='factions';self.render();}); });
        var plotSection = container.createEl('section', { cls: 'rw-chapter-status-section' });
        plotSection.createEl('h4', { text: '🧵 相关伏笔／情节线' });
        var plotNames = Object.keys(plotGroups);
        if (!plotNames.length) plotSection.createEl('p', { text: '关联事件尚未填写情节线／伏笔名称。', cls: 'my-char-muted' });
        plotNames.forEach(function (name) {
            var group = plotGroups[name];
            var row = plotSection.createEl('div', { cls: 'rw-chapter-entity-row' });
            row.createEl('span', { text: name + ' · ' + group.events.length + ' 条事件 · ' + (group.statuses.join('、') || '未标注状态') });
            var btn = row.createEl('button', { text: '查看伏笔', cls: 'my-char-btn-ghost my-char-btn-sm' });
            btn.addEventListener('click', function () { self.tab = 'plots'; self.render(); });
        });
        var foot = container.createEl('p', { text: '提示：人物来自事件文本匹配；阵营优先使用组织任职履历。若同一事件跨多个故事时间点，阵营汇总以该人物在本章首次关联事件的时间作为当前章节的参考时间。', cls: 'my-char-muted' });
    };



    MyView.prototype.renderCurrentTab = function (container) {
        container.empty();
        var tabContent = container.createEl('div');
        tabContent.className = 'tab-content';
        /* tab-content styled in CSS */

        switch (this.tab) {
            case 'desk': this.renderDesk(tabContent); break;
            case 'intimacy': this.renderIntimacyHistoryTab(tabContent); break;
            case 'plots': this.renderPlotsTab(tabContent); break;
            case 'continuity': this.renderContinuityTab(tabContent); break;
            case 'chars': this.renderChars(tabContent); break;
            case 'search': this.renderGlobalSearch(tabContent); break;
            case 'factions': this.renderFactions(tabContent); break;
            case 'relations': this.renderRelations(tabContent); break;
            case 'graph': this.renderGraph(tabContent); break;
            case 'timeline': this.renderTimeline(tabContent); break;
            case 'lifecycle': this.renderLifecycle(tabContent); break;
            case 'statistics': this.renderStatistics(tabContent); break;
            case 'dashboard':
                try { this.renderDashboard(tabContent); }
                catch (dashboardError) { console.error('仪表盘渲染失败:', dashboardError); tabContent.createEl('div', { text: '仪表盘加载失败：' + (dashboardError && dashboardError.message ? dashboardError.message : String(dashboardError)) + '。请刷新数据后重试。', cls: 'my-char-view-empty' }); }
                break;
            case 'heatmap': this.renderHeatmap(tabContent); break;
            case 'outline': this.renderOutlineTab(tabContent); break;
            case 'chapterStatus': this.renderChapterStatusTab(tabContent); break;
            case 'world': this.renderWorldTab(tabContent); break;
            case 'importexport': this.renderImportExport(tabContent); break;
            default: this.renderDesk(tabContent);
        }
        var self = this;
        // Several views render Markdown asynchronously; observe briefly so mentions
        // added after the initial render receive the same direct profile navigation.
        setTimeout(function () { rwHighlightCharacterMentions(tabContent, self); }, 80);
        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function () { rwHighlightCharacterMentions(tabContent, self); });
            observer.observe(tabContent, { childList: true, subtree: true });
            setTimeout(function () { observer.disconnect(); }, 2500);
        }
    };

    MyView.prototype.loadAllData = async function (options) {
        options = options || {};
        var silent = !!options.silent;
        
        if (this.plugin.settings.charFile) {
            var fullCharPath = getCharFullPath(this.plugin);
            var charFile = this.app.vault.getAbstractFileByPath(fullCharPath);
            if (charFile) {
                var charContent = await this.app.vault.read(charFile);
                this._lastCharMd = charContent;
                this.chars = this.parseChars(charContent);
            } else if (!silent) {
                console.log('人物文件未找到:', fullCharPath);
                new obsidian.Notice('未找到人物文件: ' + fullCharPath);
            }
        }

        if (this.plugin.settings.timelineFile) {
            var fullTimelinePath = getTimelineFullPath(this.plugin);
            var timelineFile = this.app.vault.getAbstractFileByPath(fullTimelinePath);
            if (timelineFile) {
                var timelineContent = await this.app.vault.read(timelineFile);
                this._lastTimelineMd = timelineContent;
                this.timeline = this.parseTimeline(timelineContent);
                await rwReconcileTimelineEventRegistry(this, fullTimelinePath);
                await rwStripLegacyEventIdentityMetadata(this, timelineFile, timelineContent);
            } else if (!silent) {
                console.log('时间线文件未找到:', fullTimelinePath);
                new obsidian.Notice('未找到时间线文件: ' + fullTimelinePath);
            }
        }

        var savedData = await loadSavedData(this.plugin);
        // 亲密度变化历史：优先人物 MD，其次 JSON 备份
        try {
            var historyPath = this.plugin.app.vault.configDir + '/plugins/' + this.plugin.manifest.id + '/intimacy_history.json';
            if (await this.plugin.app.vault.adapter.exists(historyPath)) {
                var histContent = await this.plugin.app.vault.adapter.read(historyPath);
                this.plugin._intimacyHistory = JSON.parse(histContent);
            } else {
                this.plugin._intimacyHistory = [];
            }
        } catch(e) {
            console.log('加载变化历史失败:', e);
            this.plugin._intimacyHistory = [];
        }
        this.factions = savedData.factions || [];
        this.relations = savedData.relations || [];
        this.orgRelations = normalizeOrgRelations(savedData.orgRelations || []);
        this.orgMemberships = normalizeOrgMemberships(savedData.orgMemberships || []);
        var mdData = await novelExt.loadRelationsFromMd(this.plugin);
        if (mdData && (mdData.factions.length > 0 || mdData.relations.length > 0)) {
            if (mdData.factions.length > 0) this.factions = mdData.factions;
            if (mdData.relations.length > 0) this.relations = mdData.relations;
        }

        // 人物索引内 ### 关系 / ### 关系变化 为权威来源；空的「关系变化」不能冲掉 JSON 备份
        this._mdParseErrors = [];
        var fullCharPathForRel = getCharFullPath(this.plugin);
        var charFileForRel = this.app.vault.getAbstractFileByPath(fullCharPathForRel);
        if (charFileForRel) {
            var charRaw = await this.app.vault.read(charFileForRel);
            var hasRelSection = /(?:^|\n)###\s*关系\s*(?:\n|$)/.test(charRaw);
            var hasHistSection = /(?:^|\n)###\s*关系变化\s*(?:\n|$)/.test(charRaw);
            var embedded = parseCharEmbeddedRelationsAndHistory(charRaw);
            var jsonHistory = this.plugin._intimacyHistory || [];
            this._mdParseErrors = embedded.errors || [];

            // 有解析结果才以 MD 为准；空小节不能把 JSON/中央关系冲掉
            if (embedded.relations.length > 0) {
                this.relations = embedded.relations;
            }

            if (embedded.history.length > 0) {
                this.plugin._intimacyHistory = embedded.history;
            } else {
                this.plugin._intimacyHistory = jsonHistory;
            }

            var usesOldListFormat = /(?:^|\n)###\s*关系(?:变化)?\s*\n(?:\s*\n)*-\s/.test(charRaw);
            var needSyncToMd = this.plugin.settings.syncRelationsToCharMd !== false && (
                (!hasRelSection && (this.relations.length > 0 || (this.plugin._intimacyHistory || []).length > 0)) ||
                (this.relations.length > 0 && hasRelSection && embedded.relations.length === 0) ||
                ((this.plugin._intimacyHistory || []).length > 0 && (!hasHistSection || embedded.history.length === 0)) ||
                (usesOldListFormat && (this.relations.length > 0 || (this.plugin._intimacyHistory || []).length > 0 || embedded.relations.length > 0 || embedded.history.length > 0))
            );
            if (needSyncToMd) {
                await syncRelationsIntoCharMd(this.app, this.plugin, this.relations, this.plugin._intimacyHistory || []);
                if (this.plugin.saveIntimacyHistory) {
                    await this.plugin.saveIntimacyHistory();
                }
            }
        }

        if (this.plugin.settings.customIntimacyLevels) {
            updateIntimacyLevels(this.plugin.settings.customIntimacyLevels);
        }

        // 从人物索引 MD 的阵营/势力等字段自动收录阵营
        if (this.plugin.settings.autoDiscoverFromMd !== false) {
            var factionSync = syncFactionsFromChars(
                this.chars,
                this.factions,
                this.plugin.settings.factionFieldName || '阵营'
            );
            if (factionSync.added) {
                this.factions = factionSync.factions;
                try {
                    await saveData(this.plugin, {
                        factions: this.factions,
                        relations: this.relations
                    });
                    await novelExt.saveRelationsToMd(this.plugin, this.factions, this.relations);
                } catch (e) {
                    console.log('自动保存阵营失败:', e);
                }
            }
        }

        var settingsChanged = syncSettingsFromParsedData(this.plugin, this.chars, this.relations, this.timeline);
        if (settingsChanged) {
            try { await this.plugin.saveSettings(); } catch (e) { console.log('自动同步设定失败:', e); }
        }

        invalidateTagCache(this.plugin);
        this.buildIndexes();

        if (!this._mdParseErrors) this._mdParseErrors = [];
        if (!silent) {
            var msg = '加载完成：' + this.chars.length + '人物，' + this.factions.length + '阵营，' + this.relations.length + '关系';
            if (this._mdParseErrors.length > 0) {
                msg += '；⚠ ' + this._mdParseErrors.length + ' 行关系 MD 解析失败';
            }
            new obsidian.Notice(msg);
        }
    };

    MyView.prototype.buildIndexes = function () {
        this.charMap = {};
        this.appearCounts = {};
        this.relationCounts = {};
        this.charNames = [];

        for (var i = 0; i < this.chars.length; i++) {
            var c = this.chars[i];
            this.charMap[c.name] = c;
            this.appearCounts[c.name] = 0;
            this.relationCounts[c.name] = 0;
            this.charNames.push(c.name);
        }

        for (var ti = 0; ti < this.timeline.length; ti++) {
            var appeared = findCharsInEvent(this.timeline[ti].event, this.charNames);
            for (var ai = 0; ai < appeared.length; ai++) {
                this.appearCounts[appeared[ai]]++;
            }
        }

        for (var ri = 0; ri < this.relations.length; ri++) {
            var r = this.relations[ri];
            if (this.relationCounts[r.charA] !== undefined) this.relationCounts[r.charA]++;
            if (this.relationCounts[r.charB] !== undefined) this.relationCounts[r.charB]++;
        }
    };

    MyView.prototype.parseChars = function (content) {
        return parseCharsFromContent(content);
    };

    MyView.prototype.parseTimeline = function (content) {
        return novelExt.parseTimelineExtended(content, this.plugin.settings);
    };

    MyView.prototype._parseTimelineLegacy = function (content) {
        var records = [];
        var lines = content.split('\n');
        var currentYear = '';
        var currentMonth = '';

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmedLine = line.trim();
            
            if (!trimmedLine) continue;
            if (trimmedLine.startsWith('# ') && !trimmedLine.startsWith('## ')) continue;
            
            if (trimmedLine.startsWith('## ') && !trimmedLine.startsWith('### ')) {
                currentYear = trimmedLine.substring(3).trim();
                currentMonth = '';
                continue;
            }
            
            if (trimmedLine.startsWith('### ')) {
                currentMonth = trimmedLine.substring(4).replace(/[：:]/g, '').trim();
                continue;
            }
            
            if (currentYear && (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* '))) {
                var eventText = trimmedLine.substring(1).trim();
                
                if (eventText) {
                    var tag = '';
                    var tagMatch = eventText.match(/^\[([^\]]+)\]\s*/);
                    if (tagMatch) {
                        tag = tagMatch[1];
                        eventText = eventText.substring(tagMatch[0].length);
                    }
                    
                    records.push({ 
                        year: currentYear, 
                        month: currentMonth || '未标注', 
                        event: eventText, 
                        tag: tag 
                    });
                }
            }
        }
        
        return records;
    };

    MyView.prototype.saveFactionsAndRelations = async function (options) {
        options = options || {};
        await saveData(this.plugin, {
            factions: this.factions,
            relations: this.relations,
            orgRelations: normalizeOrgRelations(this.orgRelations || []),
            orgMemberships: normalizeOrgMemberships(this.orgMemberships || [])
        });
        await novelExt.saveRelationsToMd(this.plugin, this.factions, this.relations);
        await syncRelationsIntoCharMd(this.app, this.plugin, this.relations, this.plugin._intimacyHistory || []);
        if (this.plugin.saveIntimacyHistory) {
            await this.plugin.saveIntimacyHistory();
        }
        if (!options.skipGraphSync && (this.plugin.settings.syncGraphOnSave === true && this.plugin.settings.graphAutoSyncExplicitlyEnabled === true)) {
            try {
                await syncGraphNotesToVault(this.plugin, this);
            } catch (e) {
                console.log('图谱同步失败:', e);
            }
        }
    };

    MyView.prototype.refreshRelationsIfVisible = function () {
        if (this.tab === 'relations' && this._lastRelationsContainer) {
            this.renderRelations(this._lastRelationsContainer);
        }
    };

    MyView.prototype.renderGlobalTimeBar = function (container) {
        var self = this;
        var settings = this.plugin.settings;
        var currentTimeStr = settings.currentTimePoint || '';
        var filterOn = settings.timeFilterEnabled !== false;
        var bar = container.createEl('div', { cls: 'my-char-global-time-bar' });
        bar.createEl('span', { text: '⏱️ 故事进度：', cls: 'my-char-time-label' });
        var valueSpan = bar.createEl('span', {
            text: currentTimeStr || '（未设置 — 在下方选择或输入）',
            cls: 'my-char-time-value' + (currentTimeStr ? ' is-set' : '')
        });
        var select = bar.createEl('select', { cls: 'my-char-select' });
        select.createEl('option', { text: '— 选择时间点 —', value: '' });
        var points = novelExt.getTimelineTimePoints(this.timeline, settings);
        for (var pi = 0; pi < points.length; pi++) {
            var opt = select.createEl('option', { text: points[pi].label, value: points[pi].year });
            if (points[pi].year === currentTimeStr) opt.selected = true;
        }
        select.addEventListener('change', async function() {
            settings.currentTimePoint = select.value;
            await self.plugin.saveSettings();
            self.render();
        });
        var input = bar.createEl('input', { type: 'text', cls: 'my-char-input-inline' });
        input.placeholder = '手动输入时间点';
        input.style.maxWidth = '140px';
        input.value = currentTimeStr;
        input.addEventListener('keydown', async function(e) {
            if (e.key === 'Enter') {
                settings.currentTimePoint = input.value.trim();
                await self.plugin.saveSettings();
                self.render();
            }
        });
        var nextBtn = bar.createEl('button', { text: '下一节点 ▶', cls: 'my-char-btn-ghost my-char-btn-xs' });
        nextBtn.addEventListener('click', async function() {
            var next = novelExt.getNextTimePoint(self.timeline, currentTimeStr);
            settings.currentTimePoint = next;
            await self.plugin.saveSettings();
            new obsidian.Notice('时间点 → ' + next);
            self.render();
        });
        var filterBtn = bar.createEl('button', {
            text: filterOn ? '🔎 时间过滤：开' : '🔎 时间过滤：关',
            cls: 'my-char-btn-ghost my-char-btn-xs' + (filterOn && currentTimeStr ? ' is-active-filter' : '')
        });
        filterBtn.title = '开启后：关系按开始/结束时间过滤，时间线隐藏未来事件；人物状态始终按当前时间点判断';
        filterBtn.addEventListener('click', async function() {
            settings.timeFilterEnabled = !(settings.timeFilterEnabled !== false);
            await self.plugin.saveSettings();
            new obsidian.Notice(settings.timeFilterEnabled !== false
                ? '已开启时间过滤（关系 + 时间线）'
                : '已关闭时间过滤');
            self.render();
        });
        var dashBtn = bar.createEl('button', { text: '📋 仪表盘', cls: 'my-char-btn-ghost my-char-btn-xs' });
        dashBtn.addEventListener('click', function() {
            self.tab = 'dashboard';
            self.render();
        });
        if (isTimeFilterActive(this.plugin)) {
            bar.createEl('span', {
                text: '· 已按「' + currentTimeStr + '」过滤关系/时间线',
                cls: 'my-char-filter-hint'
            });
        }
    };

    // ========== 人物视图 ==========
   MyView.prototype.renderChars = function (container) {
    var self = this;
    var settings = this.plugin.settings;
    var factionField = settings.factionFieldName || '阵营';
    var deathFieldNames = settings.deathFieldNames || '死亡,死亡时间';
    var firstAppearField = settings.firstAppearFieldName || '首次出场';
    var intimateField = settings.intimateFieldName || '亲密人物';
    var currentTimeStr = settings.currentTimePoint || '';

    if (this._statusFilter === undefined) this._statusFilter = 'all';
    if (this._typeFilter === undefined) this._typeFilter = 'all';

    // ===== 筛选横幅 =====
    if (this._activeFilter) {
        var banner = container.createEl('div', { cls: 'my-char-banner my-char-banner-info' });
        var iconSpan = banner.createEl('span', { text: this._activeFilter.label.split(' ')[0], cls: 'my-char-banner-icon' });
        var textSpan = banner.createEl('span', { cls: 'my-char-banner-text' });
        textSpan.textContent = this._activeFilter.label;
        if (this._activeFilter.detail) {
            var detailSpan = banner.createEl('span', { cls: 'my-char-banner-detail' });
            detailSpan.textContent = this._activeFilter.detail;
        }
        var bannerActions = banner.createEl('div', { cls: 'my-char-banner-actions' });
        var clearBtn = bannerActions.createEl('button', { text: '✕ 清除筛选', cls: 'my-char-btn-danger my-char-btn-sm' });
        clearBtn.addEventListener('click', function() {
            self.clearActiveFilter();
        });
        
        if (this._deadAfterAppearDetails && this._deadAfterAppearDetails.length > 0) {
            var detailBtn = bannerActions.createEl('button', { text: '📋 查看详情', cls: 'my-char-view-btn my-char-btn-sm' });
            detailBtn.addEventListener('click', function() {
                var msg = '⚠️ 已故后仍出场的人物详情：\n\n' + self._deadAfterAppearDetails.join('\n');
                new obsidian.Notice(msg, 10000);
            });
        }
    }

    // ===== 搜索栏 =====
    var searchBar = container.createEl('div');
    searchBar.className = 'my-char-search-bar';
    
    var timeDisplay = searchBar.createEl('div');
    timeDisplay.className = 'my-char-time-row';
    timeDisplay.createEl('span', { text: '⏱️ 当前时间点：', cls: 'my-char-time-label' });
    var timeValue = timeDisplay.createEl('span', { text: currentTimeStr || '（未设置）' });
    timeValue.className = 'my-char-time-value' + (currentTimeStr ? ' is-set' : '');
    var setTimeBtn = timeDisplay.createEl('button', { text: '⚙️ 设置' });
    setTimeBtn.className = 'my-char-btn-ghost my-char-btn-xs';
    setTimeBtn.addEventListener('click', function() { self.app.setting.open(); self.app.setting.openTabById(self.plugin.manifest.id); });

    var searchInput = searchBar.createEl('input', { type: 'text', placeholder: '搜索人物名、身份、阵营、死亡...' });
    searchInput.className = 'my-char-view-search';
    searchInput.value = this.searchText || '';
    // 不在中文输入法组合过程中重绘整个视图；重绘后恢复焦点和光标，避免只能输入一个字/无法连续输入。
    var searchComposing = false;
    var renderSearchResults = debounce(function() {
        if (searchComposing) return;
        self.searchText = searchInput.value;
        if (self._activeFilter && self.searchText) self._activeFilter = null;
        var parentContainer = container.parentElement;
        if (!parentContainer) return;
        var caretStart = searchInput.selectionStart;
        var caretEnd = searchInput.selectionEnd;
        self.renderCurrentTab(parentContainer);
        window.setTimeout(function() {
            var replacement = parentContainer.querySelector('.my-char-view-search');
            if (!replacement) return;
            replacement.focus();
            try { replacement.setSelectionRange(caretStart, caretEnd); } catch (e) {}
        }, 0);
    }, 250);
    searchInput.addEventListener('compositionstart', function() { searchComposing = true; });
    searchInput.addEventListener('compositionend', function() { searchComposing = false; renderSearchResults(); });
    searchInput.addEventListener('input', function() { if (!searchComposing) renderSearchResults(); });

    var quickRow = container.createEl('div', { cls: 'my-char-quick-actions' });
    quickRow.createEl('button', { text: '+ 快速添加人物', cls: 'my-char-view-btn my-char-btn-sm' })
        .addEventListener('click', function() { self.showQuickAddChar(); });
    var expandCharGroups=quickRow.createEl('button',{text:'展开分组',cls:'my-char-btn-ghost my-char-btn-sm'});
    expandCharGroups.addEventListener('click',function(){self._rwExpandedCharGroups=self._rwExpandedCharGroups||{};Object.keys(groups).forEach(function(k){self._rwExpandedCharGroups[k]=true;});self.renderCurrentTab(container.parentElement);});
    var collapseCharGroups=quickRow.createEl('button',{text:'全部折叠',cls:'my-char-btn-ghost my-char-btn-sm'});
    collapseCharGroups.addEventListener('click',function(){self._rwExpandedCharGroups={};self.renderCurrentTab(container.parentElement);});

    // ===== 状态筛选 =====
    var filterBar = container.createEl('div');
    filterBar.className = 'my-char-filter-bar';
    filterBar.createEl('span', { text: '状态筛选：', cls: 'my-char-filter-label' });

    var statusOptions = [
        { id: 'all', label: '📋 全部' },
        { id: 'alive', label: '🟢 存活' },
        { id: 'dead', label: '🔴 已故' },
        { id: 'unborn', label: '🔵 未出生' },
        { id: 'unknown', label: '🟡 未知' },
        { id: 'missing', label: '⚪ 失踪' }
    ];

    var filterButtons = [];
    for (var si = 0; si < statusOptions.length; si++) {
        (function(opt) {
            var isActive = self._statusFilter === opt.id;
            var btn = filterBar.createEl('button', { text: opt.label });
            var activeColor = opt.id === 'all' ? '#4a90e2' : getStatusColor(opt.id);
            setFilterChip(btn, isActive, activeColor);
            btn.addEventListener('click', function() {
                self._statusFilter = opt.id;
                if (self._activeFilter) {
                    self._activeFilter = null;
                }
                for (var j = 0; j < filterButtons.length; j++) {
                    var fb = filterButtons[j];
                    var fActive = fb.optId === self._statusFilter;
                    var fColor = fb.optId === 'all' ? '#4a90e2' : getStatusColor(fb.optId);
                    setFilterChip(fb.btn, fActive, fColor);
                }
                var parentContainer = container.parentElement;
                if (parentContainer) self.renderCurrentTab(parentContainer);
            });
            filterButtons.push({ btn: btn, optId: opt.id });
        })(statusOptions[si]);
    }

    // ============================================================
    // ⭐ 新增：类型筛选（主角/配角/龙套）
    // ============================================================
    var typeFilterBar = container.createEl('div');
    typeFilterBar.className = 'my-char-filter-bar my-char-filter-bar-accent';
    typeFilterBar.createEl('span', { text: '📌 类型筛选：', cls: 'my-char-filter-label' });

    // 自动扫描所有人物，收集「类型」字段的值
    var typeSet = {};
    for (var i = 0; i < this.chars.length; i++) {
        var typeVal = this.getCharField(this.chars[i], '类型');
        if (typeVal && typeVal.trim()) {
            typeSet[typeVal.trim()] = true;
        }
    }
    // 如果没有类型数据，显示提示
    var typeKeys = Object.keys(typeSet);
    
    var typeOptions = [
        { id: 'all', label: '📋 全部' }
    ];
    // 按常用顺序排序：主角 > 配角 > 龙套 > 其他
    var sortOrder = ['⭐ 主角', '主角', '🔶 配角', '配角', '👤 龙套', '龙套'];
    var sortedKeys = [];
    for (var si2 = 0; si2 < sortOrder.length; si2++) {
        if (typeSet[sortOrder[si2]]) {
            sortedKeys.push(sortOrder[si2]);
            delete typeSet[sortOrder[si2]];
        }
    }
    // 剩余的类型按字母排序
    var remaining = Object.keys(typeSet).sort();
    for (var i = 0; i < remaining.length; i++) {
        sortedKeys.push(remaining[i]);
    }
    
    for (var i = 0; i < sortedKeys.length; i++) {
        var label = sortedKeys[i];
        // 如果 label 没有 emoji，自动加一个
        var displayLabel = label;
        if (label.indexOf('主角') !== -1 && label.indexOf('⭐') === -1) {
            displayLabel = '⭐ ' + label;
        } else if (label.indexOf('配角') !== -1 && label.indexOf('🔶') === -1) {
            displayLabel = '🔶 ' + label;
        } else if (label.indexOf('龙套') !== -1 && label.indexOf('👤') === -1) {
            displayLabel = '👤 ' + label;
        }
        typeOptions.push({ id: label, label: displayLabel });
    }

    var typeFilterButtons = [];
    // 即使没有类型数据，也显示「全部」按钮
    for (var i = 0; i < typeOptions.length; i++) {
        (function(opt) {
            var isActive = self._typeFilter === opt.id;
            var btn = typeFilterBar.createEl('button', { text: opt.label });
            var activeColor = '#6c5ce7';
            setFilterChip(btn, isActive, activeColor);
            btn.addEventListener('click', function() {
                self._typeFilter = opt.id;
                if (self._activeFilter) {
                    self._activeFilter = null;
                }
                for (var j = 0; j < typeFilterButtons.length; j++) {
                    var fb = typeFilterButtons[j];
                    var fActive = fb.optId === self._typeFilter;
                    setFilterChip(fb.btn, fActive, '#6c5ce7');
                }
                var parentContainer = container.parentElement;
                if (parentContainer) self.renderCurrentTab(parentContainer);
            });
            typeFilterButtons.push({ btn: btn, optId: opt.id });
        })(typeOptions[i]);
    }

    if (typeKeys.length === 0) {
        var hint = typeFilterBar.createEl('span', { text: '（暂无类型数据，请在人物文件中添加「类型」字段）' });
        hint.className = 'my-char-filter-hint';
    }

    // ===== 人物列表 =====
    var listContainer = container.createEl('div');
    listContainer.classList.add('my-char-scroll-list');

    var filtered = this.chars.slice();

    if (this._activeFilter) {
        filtered = filtered.filter(this._activeFilter.condition);
    }
    
    if (this.searchText) {
        var kw = this.searchText.toLowerCase();
        filtered = filtered.filter(function(c) {
            var searchStr = c.name.toLowerCase() + ' ' + JSON.stringify(c.fields).toLowerCase();
            return searchStr.indexOf(kw) !== -1;
        });
    }

    if (this._statusFilter !== 'all') {
        filtered = filtered.filter(function(c) {
            return getCharStatusAtTime(self, c, currentTimeStr) === self._statusFilter;
        });
    }

    // ===== 类型筛选 =====
    if (this._typeFilter !== 'all') {
        filtered = filtered.filter(function(c) {
            var typeVal = self.getCharField(c, '类型');
            return typeVal && typeVal.trim() === self._typeFilter;
        });
    }

    var groups = {};
    for (var i = 0; i < filtered.length; i++) {
        var f = this.getCharField(filtered[i], factionField) || '未分配阵营';
        if (!groups[f]) groups[f] = [];
        groups[f].push(filtered[i]);
    }
    var groupNames = Object.keys(groups).sort();

    if (groupNames.length === 0) {
        listContainer.createEl('p', { text: '没有匹配的人物', cls: 'my-char-view-empty' });
        return;
    }

    for (var gi = 0; gi < groupNames.length; gi++) {
        var gname = groupNames[gi];
        var members = groups[gname];
        self._rwExpandedCharGroups=self._rwExpandedCharGroups||{};
        var groupDetails=listContainer.createEl('details',{cls:'rw-char-group-accordion'});
        groupDetails.open=!!self._rwExpandedCharGroups[gname];
        var groupSummary=groupDetails.createEl('summary',{cls:'rw-char-group-summary'});
        groupSummary.createEl('strong',{text:gname});
        groupSummary.createEl('span',{text:members.length+' 人',cls:'my-char-muted'});
        (function(groupKey,detailsEl){detailsEl.addEventListener('toggle',function(){self._rwExpandedCharGroups[groupKey]=detailsEl.open;});})(gname,groupDetails);
        var groupBody=groupDetails.createEl('div',{cls:'rw-char-group-body'});

        for (var j = 0; j < members.length; j++) {
            var c = members[j];
            var card = groupBody.createEl('div', { cls: 'my-char-view-card' });
            var appearCount = this.appearCounts[c.name] || 0;
            var relCount = this.relationCounts[c.name] || 0;
            var identity = this.getCharField(c, '身份');
            var death = this.getFieldValue(c, deathFieldNames);
            var firstAppear = this.getCharField(c, firstAppearField);
            var intimate = this.getCharField(c, intimateField);
            var typeVal = this.getCharField(c, '类型');
            var status = getCharStatusAtTime(this, c, currentTimeStr);

            var headerRow = card.createEl('div');
            headerRow.className = 'my-char-card-header';
            
            // 状态徽章
            var badge = headerRow.createEl('span', { text: getStatusLabel(status) });
            setBadge(badge, getStatusColor(status));
            
            // 名字
            var titleEl = headerRow.createEl('strong');
            titleEl.className = 'my-char-card-title';
            titleEl.textContent = c.name;
            // 姓名颜色统一读取人物当前有效阵营（包含任职履历计算结果）。
            var currentFactionText = String(this.getCharField(c, factionField) || '').trim();
            var currentFactionColor = this.getFactionColorForChar(c);
            if (currentFactionColor) {
                titleEl.style.setProperty('color', currentFactionColor, 'important');
                titleEl.style.textDecorationColor = currentFactionColor;
                titleEl.setAttribute('data-faction-color', currentFactionColor);
                titleEl.title = currentFactionText;
            } else {
                titleEl.removeAttribute('data-faction-color');
                titleEl.removeAttribute('title');
            }
            
            // 类型标签（如果有）
            if (typeVal) {
                var typeBadge = headerRow.createEl('span', { text: typeVal });
                var typeColors = {
                    '主角': '#e74c3c',
                    '⭐ 主角': '#e74c3c',
                    '配角': '#f39c12',
                    '🔶 配角': '#f39c12',
                    '龙套': '#95a5a6',
                    '👤 龙套': '#95a5a6'
                };
                var typeColor = '#6c5ce7';
                for (var key in typeColors) {
                    if (typeVal.indexOf(key) !== -1) {
                        typeColor = typeColors[key];
                        break;
                    }
                }
                setBadge(typeBadge, typeColor, 'my-char-badge-type');
            }
            
            if (identity) {
                var idEl = headerRow.createEl('small');
                idEl.className = 'my-char-view-muted';
                idEl.textContent = ' ' + identity;
            }
            if (death) {
                var deathEl = headerRow.createEl('span');
                deathEl.className = 'my-char-death-tag';
                deathEl.textContent = '💀' + death;
            }

            card.createEl('br');
            var timeMeta = card.createEl('small');
            timeMeta.className = 'my-char-card-meta';
            var timeParts = [];
            var birth = this.getFieldValue(c, settings.birthFieldNames || '出生,出生时间');
            if (birth) timeParts.push('生: ' + birth);
            if (firstAppear) timeParts.push('首: ' + firstAppear);
            if (death) timeParts.push('卒: ' + death);
            timeMeta.textContent = timeParts.join(' | ') || '';

            var metaEl = card.createEl('small', { cls: 'my-char-view-muted' });
            var metaText = '出场 ' + appearCount + '次 | 关系 ' + relCount + '个';
            if (intimate) metaText += ' | 亲密: ' + intimate;
            metaEl.textContent = metaText;

            (function(charData, view) {
                card.addEventListener('click', function() { view.showCharDetail(charData); });
            })(c, this);
        }
    }
};

    // ========== 阵营视图 ==========
    MyView.prototype.renderFactions = function (container) {
        var self = this;
        var settings = this.plugin.settings;
        var factionField = settings.factionFieldName || '阵营';

        var headerBar = container.createEl('div');
        headerBar.className = 'my-char-faction-header';

        headerBar.createEl('h3', { text: '阵营管理' });

        var btnGroup = headerBar.createEl('div');
        btnGroup.className = 'my-char-btn-group';

        var expandAllBtn = btnGroup.createEl('button', { text: '全部展开' });
        expandAllBtn.className = 'my-char-btn-ghost my-char-btn-sm';
        expandAllBtn.addEventListener('click', function () {
            for (var i = 0; i < self.factions.length; i++) {
                self.expandedFactions[self.factions[i].name] = true;
            }
            self.renderCurrentTab(container.parentElement);
        });

        var collapseAllBtn = btnGroup.createEl('button', { text: '全部折叠' });
        collapseAllBtn.className = 'my-char-btn-ghost my-char-btn-sm';
        collapseAllBtn.addEventListener('click', function () {
            self.expandedFactions = {};
            self.renderCurrentTab(container.parentElement);
        });

        var addBtn = btnGroup.createEl('button', { text: '+ 添加阵营' });
        addBtn.className = 'my-char-view-btn my-char-btn-sm';
        addBtn.addEventListener('click', function () {
            self.showFactionDialog(null);
        });

        this.renderOrgRelationsPanel(container);

        if (this.factions.length === 0) {
            container.createEl('p', {
                text: '暂无阵营。可在人物索引里写「- 阵营：北境王国」后刷新，或点击上方按钮手动添加',
                cls: 'my-char-view-empty'
            });
            return;
        }

        for (var i = 0; i < this.factions.length; i++) {
            (function (faction, index) {
                var isExpanded = self.expandedFactions[faction.name] || self._focusFactionName === faction.name;

                var members = [];
                for (var ci = 0; ci < self.chars.length; ci++) {
                    var currentFactionValue = String(self.getCharField(self.chars[ci], factionField) || '');
                    var currentFactionNames = currentFactionValue.split(/[、，,;；|/]+/).map(function(name) {
                        var value = String(name || '').trim();
                        if (typeof stripWikiName === 'function') value = stripWikiName(value);
                        return value.toLocaleLowerCase();
                    });
                    var targetFactionName = String(faction.name || '').trim();
                    if (typeof stripWikiName === 'function') targetFactionName = stripWikiName(targetFactionName);
                    if (currentFactionNames.indexOf(targetFactionName.toLocaleLowerCase()) >= 0) members.push(self.chars[ci]);
                }

                var card = container.createEl('div', { cls: 'my-char-faction-card' });
                if (self._focusFactionName === faction.name) { card.classList.add('is-focused'); card.setAttribute('data-focused-faction','true'); setTimeout(function(){card.scrollIntoView({behavior:'smooth',block:'center'});self._focusFactionName='';},80); }
                if (faction.color) {
                    card.style.borderLeft = '4px solid ' + faction.color;
                }

                var header = card.createEl('div', { cls: 'my-char-faction-card-header' + (isExpanded ? ' is-expanded' : '') });

                var leftSide = header.createEl('div');
                leftSide.className = 'my-char-card-header';

                var arrow = leftSide.createEl('span', { text: isExpanded ? '▼' : '▶', cls: 'my-char-muted' });
                arrow.style.fontSize = '10px';
                arrow.style.width = '12px';

                leftSide.createEl('strong', { text: faction.name, cls: 'my-char-card-title' });
                
                if (faction.color) {
                    var dot = leftSide.createEl('span', { cls: 'my-char-color-dot' });
                    dot.style.background = faction.color;
                }

                leftSide.createEl('span', { text: members.length + '人', cls: 'my-char-muted' });

                var rightSide = header.createEl('div', { cls: 'my-char-btn-group' });

                var editBtn = rightSide.createEl('button', { text: '编辑', cls: 'my-char-btn-ghost my-char-btn-xs' });
                editBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self.showFactionDialog(faction);
                });

                var delBtn = rightSide.createEl('button', { text: '删除', cls: 'my-char-btn-danger my-char-btn-xs' });
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var linkedMemberships = normalizeOrgMemberships(self.orgMemberships || []).filter(function(r) { return r.organization === faction.name; });
                    var linkedOrgRelations = normalizeOrgRelations(self.orgRelations || []).filter(function(r) { return r.from === faction.name || r.to === faction.name; });
                    var detail = '该阵营将从当前阵营列表移除。' +
                        (linkedMemberships.length ? ' 关联的 ' + linkedMemberships.length + ' 条人物任职履历会保留，并标记为「组织解散」，不会抹去历史。' : '') +
                        (linkedOrgRelations.length ? ' 与该阵营有关的 ' + linkedOrgRelations.length + ' 条组织关系也会移除。' : '');
                    // 阵营删除只使用一次确认，避免第二层 prompt 在部分 Obsidian 环境中
                    // 被拦截或未显示，导致用户点击确认后看起来没有任何反应。
                    if (confirm('删除阵营「' + faction.name + '」？\\n\\n' + detail + '\\n\\n确认后将从当前阵营列表移除；人物历史履历会保留。')) {
                        var before = {
                            factions: deepCloneJson(self.factions || []),
                            orgMemberships: deepCloneJson(self.orgMemberships || []),
                            orgRelations: deepCloneJson(self.orgRelations || [])
                        };
                        pushUndoSnapshot(self, '删除阵营：' + faction.name);
                        self.factions.splice(index, 1);
                        var progressText = String((self.plugin.settings && self.plugin.settings.currentTimePoint) || '').trim();
                        self.orgMemberships = normalizeOrgMemberships(self.orgMemberships || []).map(function(r) {
                            if (r.organization !== faction.name) return r;
                            return Object.assign({}, r, {
                                type: '组织解散',
                                endTime: progressText || r.endTime,
                                reason: r.reason || '所属阵营已删除'
                            });
                        });
                        self.orgRelations = normalizeOrgRelations(self.orgRelations || []).filter(function(r) { return r.from !== faction.name && r.to !== faction.name; });
                        self.saveFactionsAndRelations().then(function() {
                            self.renderCurrentTab(container.parentElement);
                            new obsidian.Notice('阵营已删除，相关人物任职历史已保留');
                        }).catch(async function(err) {
                            self.factions = before.factions;
                            self.orgMemberships = before.orgMemberships;
                            self.orgRelations = before.orgRelations;
                            try { await self.saveFactionsAndRelations(); } catch (rollbackError) { console.error('[阵营删除] 回滚保存失败：', rollbackError); }
                            new obsidian.Notice('删除失败，已尝试恢复原数据：' + (err && err.message ? err.message : '未知错误'), 8000);
                            self.renderCurrentTab(container.parentElement);
                        });
                    }
                });

                header.addEventListener('click', function () {
                    self.expandedFactions[faction.name] = !isExpanded;
                    self.renderCurrentTab(container.parentElement);
                });

                if (isExpanded) {
                    var body = card.createEl('div', { cls: 'my-char-faction-card-body' });

                    if (faction.desc) {
                        body.createEl('div', { text: faction.desc, cls: 'my-char-faction-desc' });
                    }
                    var linkedWorld=(self._rwWorldRecords||settings.worldRecords||[]).filter(function(r){return (r.links||[]).indexOf(faction.name)>=0;});
                    var worldDetails=body.createEl('details',{cls:'rw-linked-world-section'});
                    var worldSummary=worldDetails.createEl('summary');worldSummary.createEl('strong',{text:'关联世界观资料'});worldSummary.createEl('span',{text:linkedWorld.length+' 条',cls:'my-char-muted'});
                    var worldList=worldDetails.createEl('div',{cls:'rw-linked-world-list'});
                    if(!linkedWorld.length)worldList.createEl('p',{text:'暂无关联世界观资料。',cls:'my-char-view-muted'});
                    linkedWorld.forEach(function(r){var b=worldList.createEl('button',{text:r.name,cls:'rw-linked-world-item'});b.addEventListener('click',function(e){e.stopPropagation();self._rwLocateWorldId=r.id;self._worldSubtab='overview';self.tab='world';self.render();});});

                    if (members.length === 0) {
                        body.createEl('p', { text: '暂无人物属于此阵营', cls: 'my-char-view-empty' });
                    } else {
                        for (var mi = 0; mi < members.length; mi++) {
                            var m = members[mi];
                            var mRow = body.createEl('div', { cls: 'my-char-faction-member' });

                            var mLeft = mRow.createEl('div');
                            mLeft.createEl('strong', { text: m.name });
                            var mIdentity = self.getCharField(m, '身份');
                            if (mIdentity) {
                                mLeft.createEl('small', { text: ' - ' + mIdentity, cls: 'my-char-muted' });
                            }

                            var deathFieldNames = settings.deathFieldNames || '死亡,死亡时间';
                            var mDeath = self.getFieldValue(m, deathFieldNames);
                            if (mDeath) {
                                mRow.createEl('span', { text: '💀 ' + mDeath, cls: 'my-char-death-tag' });
                            }

                            (function (charData) {
                                mRow.addEventListener('click', function () {
                                    self.showCharDetail(charData);
                                });
                            })(m);
                        }
                    }
                }
            })(this.factions[i], i);
        }
    };

    MyView.prototype.showFactionDialog = function (faction) {
        var self = this;
        var modal = new FactionModal(this.app, faction, function (result) {
            if (faction) {
                var idx = self.factions.indexOf(faction);
                if (idx !== -1) self.factions[idx] = result;
            } else {
                self.factions.push(result);
            }
            self.saveFactionsAndRelations();
            self.render();
        });
        modal.open();
    };

    // ========== 关系视图 ==========
    MyView.prototype.renderRelations = function (container) {
        var self = this;
        this._lastRelationsContainer = container;
        
        container.empty();
        container.classList.add('my-char-flex-col');
        
        var toolbar = container.createEl('div');
        toolbar.className = 'my-char-toolbar';
        
        var titleArea = toolbar.createEl('div');
        titleArea.className = 'my-char-toolbar-title';
        titleArea.createEl('strong', { text: getTerm(this.plugin, 'entity') + getTerm(this.plugin, 'relation') });

        var addBtn = titleArea.createEl('button', { text: '+ 添加' + getTerm(this.plugin, 'relation') });
        addBtn.className = 'my-char-view-btn my-char-btn-sm';
        addBtn.addEventListener('click', function () {
            if (self.chars.length < 2) {
                new obsidian.Notice('至少需要两个人物');
                return;
            }
            self.showRelationDialog(null);
        });

        var syncMdBtn = titleArea.createEl('button', { text: '📥 从 MD 同步设定' });
        syncMdBtn.className = 'my-char-view-btn my-char-view-btn-secondary my-char-btn-sm';
        syncMdBtn.title = '从人物/时间线 MD 自动识别关系、阵营、字段、标签并刷新显示';
        syncMdBtn.addEventListener('click', function () {
            self.loadAllData().then(function() {
                var changed = syncSettingsFromParsedData(self.plugin, self.chars, self.relations, self.timeline);
                if (changed) self.plugin.saveSettings();
                self.render();
                new obsidian.Notice('已从 MD 同步：' + self.relations.length + ' 条关系，' + self.factions.length + ' 个阵营');
            });
        });

        var statsSpan = toolbar.createEl('span', { text: '共 ' + this.relations.length + ' 条关系' });
        statsSpan.className = 'my-char-toolbar-stats';
        
        var filterBar = container.createEl('div');
        filterBar.className = 'my-char-filter-bar';
        
        filterBar.createEl('span', { text: '筛选：', cls: 'my-char-filter-label' });
        
        var typeSelect = filterBar.createEl('select');
        typeSelect.className = 'my-char-select';
        typeSelect.add(createOption('all', '📋 全部类型'));
        
        var typeSet = {};
        for (var i = 0; i < this.relations.length; i++) {
            var t = this.relations[i].type || '其他';
            typeSet[t] = true;
        }
        var customTypes = this.plugin.settings.customRelationTypes || '';
        var presetTypes = customTypes ? customTypes.split(',').map(function(s) { return s.trim(); }) : [];
        for (var i = 0; i < presetTypes.length; i++) {
            typeSet[presetTypes[i]] = true;
        }
        var allTypes = Object.keys(typeSet).sort();
        for (var i = 0; i < allTypes.length; i++) {
            typeSelect.add(createOption(allTypes[i], allTypes[i]));
        }
        typeSelect.value = this.relationFilterType;
        typeSelect.addEventListener('change', function() {
            self.relationFilterType = typeSelect.value;
            self.renderRelations(container);
        });
        
        var intimacySelect = filterBar.createEl('select');
        intimacySelect.className = 'my-char-select';
        intimacySelect.add(createOption('all', '❤️ 全部亲密度'));
        for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
            var lvl = INTIMACY_LEVELS[i];
            intimacySelect.add(createOption(lvl.value.toString(), lvl.label));
        }
        intimacySelect.value = this.relationFilterIntimacy;
        intimacySelect.addEventListener('change', function() {
            self.relationFilterIntimacy = intimacySelect.value;
            self.renderRelations(container);
        });
        
        filterBar.createEl('span', { text: '排序：', cls: 'my-char-filter-label' });
        
        var sortSelect = filterBar.createEl('select');
        sortSelect.className = 'my-char-select';
        sortSelect.add(createOption('intimacy', '❤️ 亲密度降序'));
        sortSelect.add(createOption('intimacy_asc', '❤️ 亲密度升序'));
        sortSelect.add(createOption('type', '📌 按类型'));
        sortSelect.add(createOption('name', '👥 按人物名'));
        sortSelect.value = this.relationSortBy;
        sortSelect.addEventListener('change', function() {
            self.relationSortBy = sortSelect.value;
            self.renderRelations(container);
        });
        
        var viewModeBtn = filterBar.createEl('button', { text: this.relationViewMode === 'list' ? '📋 列表视图' : '📁 分组视图' });
        viewModeBtn.className = 'my-char-btn-ghost my-char-btn-sm'; viewModeBtn.style.marginLeft = 'auto';
        viewModeBtn.addEventListener('click', function() {
            self.relationViewMode = self.relationViewMode === 'list' ? 'group' : 'list';
            self.renderRelations(container);
        });
        
        var batchBtn = filterBar.createEl('button', { text: '⚡ 批量操作' });
        batchBtn.className = 'my-char-btn-warning my-char-btn-sm';
        batchBtn.addEventListener('click', function() {
            self.showBatchRelationDialog();
        });

        if ((this._mdParseErrors || []).length > 0) {
            var errBanner = container.createEl('div', { cls: 'my-char-banner my-char-banner-warn' });
            errBanner.createEl('span', {
                text: '⚠ 人物索引有 ' + this._mdParseErrors.length + ' 行关系/变化未能解析 → 点仪表盘查看详情',
                cls: 'my-char-banner-text'
            });
            errBanner.style.cursor = 'pointer';
            errBanner.addEventListener('click', function() {
                self.tab = 'dashboard';
                self.render();
            });
        }
        
        var contentArea = container.createEl('div');
        contentArea.className = 'relations-content-area';
        
        var filteredRelations = this.relations.slice();
        if (this.relationFilterType !== 'all') {
            filteredRelations = filteredRelations.filter(function(r) {
                return (r.type || '其他') === self.relationFilterType;
            });
        }
        if (this.relationFilterIntimacy !== 'all') {
            var targetIntimacy = parseInt(this.relationFilterIntimacy);
            filteredRelations = filteredRelations.filter(function(r) {
                return (r.intimacy || 0) === targetIntimacy;
            });
        }
        if (isTimeFilterActive(this.plugin)) {
            var timePoint = this.plugin.settings.currentTimePoint;
            var beforeTimeCount = filteredRelations.length;
            filteredRelations = filteredRelations.filter(function(r) {
                return isRelationActiveAtTime(r, timePoint);
            });
            if (beforeTimeCount > filteredRelations.length) {
                statsSpan.textContent = '共 ' + this.relations.length + ' 条关系 · 当前时间点显示 ' + filteredRelations.length + ' 条';
            }
        }
        
        filteredRelations = this.sortRelations(filteredRelations, this.relationSortBy);
        
        if (filteredRelations.length === 0) {
            var emptyMsg = contentArea.createEl('div');
            emptyMsg.className = 'my-char-view-empty';
            emptyMsg.innerHTML = isTimeFilterActive(this.plugin)
                ? '📭 当前时间点下没有生效中的关系<br><small>可关闭顶栏「时间过滤」，或给关系补上开始/结束时间</small>'
                : '📭 暂无关系数据<br><small>点击上方"添加关系"按钮添加</small>';
            this.renderAutoRelationsSuggestions(contentArea);
            return;
        }
        
        if (this.relationViewMode === 'group') {
            this.renderRelationsGrouped(contentArea, filteredRelations);
        } else {
            this.renderRelationsList(contentArea, filteredRelations);
        }
        
        this.renderAutoRelationsSuggestions(contentArea);
    };
    
    MyView.prototype.sortRelations = function(relations, sortBy) {
        var sorted = relations.slice();
        switch(sortBy) {
            case 'intimacy':
                sorted.sort(function(a, b) { return (b.intimacy || 0) - (a.intimacy || 0); });
                break;
            case 'intimacy_asc':
                sorted.sort(function(a, b) { return (a.intimacy || 0) - (b.intimacy || 0); });
                break;
            case 'type':
                sorted.sort(function(a, b) { return (a.type || '').localeCompare(b.type || ''); });
                break;
            case 'name':
                sorted.sort(function(a, b) { 
                    var nameA = a.charA + a.charB;
                    var nameB = b.charA + b.charB;
                    return nameA.localeCompare(nameB);
                });
                break;
            default:
                sorted.sort(function(a, b) { return (b.intimacy || 0) - (a.intimacy || 0); });
        }
        return sorted;
    };
    
    MyView.prototype.renderRelationsList = function(container, relations) {
        var self = this;
        
        for (var i = 0; i < relations.length; i++) {
            (function(rel) {
                var card = container.createEl('div');
                card.className = 'my-char-rel-card';
                setRelAccent(card, getIntimacyColor(rel.intimacy || 0));

                var mainLine = card.createEl('div');
                mainLine.className = 'my-char-rel-line';
                var nameA = mainLine.createEl('strong', { text: rel.charA });
                nameA.className = 'my-char-link'; nameA.style.fontSize = '14px';
                nameA.addEventListener('click', function() {
                    var cd = self.findChar(rel.charA);
                    if (cd) self.showCharDetail(cd);
                });

                var typeBadge = mainLine.createEl('span', { text: rel.type });
                typeBadge.className = 'my-char-badge-relation';

                var intimacyLabel = getIntimacyLabel(rel.intimacy || 0);
                var intimacyColor = getIntimacyColor(rel.intimacy || 0);
                var intimacyBadge = mainLine.createEl('span', { text: '❤️ ' + intimacyLabel });
                setBadge(intimacyBadge, intimacyColor);

                var nameB = mainLine.createEl('strong', { text: rel.charB });
                nameB.className = 'my-char-link'; nameB.style.fontSize = '14px';
                nameB.addEventListener('click', function() {
                    var cd = self.findChar(rel.charB);
                    if (cd) self.showCharDetail(cd);
                });

                if (rel.desc) {
                    card.createEl('div', { text: rel.desc, cls: 'my-char-rel-desc' });
                }

                if (rel.startTime || rel.endTime) {
                    var timeRange = card.createEl('div');
                    timeRange.className = 'my-char-rel-time';
                    var timeText = '';
                    if (rel.startTime) timeText += '📅 始于 ' + rel.startTime;
                    if (rel.endTime) timeText += (timeText ? ' · ' : '') + '⌛ 止于 ' + rel.endTime;
                    timeRange.textContent = timeText;
                }

                var relHistory = getRelationHistory(self.plugin, rel.charA, rel.charB);
                var historySummary = getChangeSummary(relHistory);
                var summaryRow = card.createEl('div');
                summaryRow.className = 'my-char-rel-summary';
                summaryRow.textContent = '📈 ' + historySummary;

                var btnRow = card.createEl('div');
                btnRow.className = 'my-char-rel-actions';

                var editRelBtn = btnRow.createEl('button', { text: '编辑' });
                editRelBtn.className = 'my-char-btn-ghost my-char-btn-xs';
                editRelBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.showRelationDialog(rel);
                });

                // 🆕 新增：查看变化历史按钮
                var historyBtn = btnRow.createEl('button', { text: '📊 历史' });
                historyBtn.className = 'my-char-btn-ghost my-char-btn-xs'; historyBtn.style.color = 'var(--char-purple)';
                historyBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.showChangeHistory(rel);
                });

                // 🆕 新增：记录变化按钮
                var recordBtn = btnRow.createEl('button', { text: '📝 记录变化' });
                recordBtn.className = 'my-char-view-btn my-char-btn-xs';
                recordBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.showRecordChange(rel, function() {
                        self.renderRelations(container);
                    });
                });

                var delRelBtn = btnRow.createEl('button', { text: '删除' });
                delRelBtn.className = 'my-char-btn-danger my-char-btn-xs';
                delRelBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (confirmDestructiveAction('删除关系：' + rel.charA + ' × ' + rel.charB, '将同时清除双方人物 MD 中的关系与变化记录。')) {
                        var realIdx = findRelationIndex(self.relations, rel);
                        if (realIdx !== -1) {
                            removeIntimacyHistoryForPair(self.plugin, rel.charA, rel.charB);
                            self.relations.splice(realIdx, 1);
                            self.saveFactionsAndRelations();
                            self.render();
                        }
                    }
                });
            })(relations[i]);
        }
    };
    
    MyView.prototype.renderRelationsGrouped = function(container, relations) {
        var self = this;
        var typeGroups = {};
        for (var i = 0; i < relations.length; i++) {
            var type = relations[i].type || '其他';
            if (!typeGroups[type]) typeGroups[type] = [];
            typeGroups[type].push(relations[i]);
        }
        
        var typeNames = Object.keys(typeGroups).sort();
        for (var ti = 0; ti < typeNames.length; ti++) {
            var type = typeNames[ti];
            var typeRels = typeGroups[type];
            
            var groupHeader = container.createEl('div');
            groupHeader.className = 'my-char-rel-group-header';
            
            if (this.expandedRelationGroups[type] === undefined) this.expandedRelationGroups[type] = true;
            var arrow = groupHeader.createEl('span', { text: this.expandedRelationGroups[type] ? '▼' : '▶' });
            arrow.className = 'my-char-muted'; arrow.style.fontSize = '10px'; arrow.style.marginRight = '6px';
            
            groupHeader.createEl('strong', { text: type });
            groupHeader.createEl('span', { text: typeRels.length + '条', cls: 'my-char-muted' });
            
            var sumIntimacy = 0;
            for (var i = 0; i < typeRels.length; i++) {
                sumIntimacy += (typeRels[i].intimacy || 0);
            }
            var avgIntimacy = typeRels.length > 0 ? (sumIntimacy / typeRels.length).toFixed(1) : 0;
            var avgLabel = getIntimacyLabel(Math.round(avgIntimacy));
            groupHeader.createEl('span', { text: '平均: ' + avgLabel, cls: 'my-char-muted' }); groupHeader.lastChild.style.fontSize = '10px'; groupHeader.lastChild.style.marginLeft = '8px';
            
            groupHeader.addEventListener('click', (function(t) {
                return function() {
                    self.expandedRelationGroups[t] = !self.expandedRelationGroups[t];
                    self.render();
                };
            })(type));
            
            if (this.expandedRelationGroups[type]) {
                var groupBody = container.createEl('div');
                groupBody.className = 'my-char-section'; groupBody.style.marginLeft = '16px';
                
                var sortedRels = typeRels.slice().sort(function(a, b) {
                    return (b.intimacy || 0) - (a.intimacy || 0);
                });
                
                for (var i = 0; i < sortedRels.length; i++) {
                    (function(rel) {
                    var subCard = groupBody.createEl('div');
                    subCard.className = 'my-char-rel-subcard'; setRelAccent(subCard, getIntimacyColor(rel.intimacy || 0));

                    var subLine = subCard.createEl('div');
                    subLine.className = 'my-char-rel-line';

                    var nameA = subLine.createEl('span', { text: rel.charA });
                    nameA.className = 'my-char-link'; nameA.style.fontSize = '13px';
                    nameA.addEventListener('click', function() {
                        var cd = self.findChar(rel.charA);
                        if (cd) self.showCharDetail(cd);
                    });

                    subLine.createEl('span', { text: '→', cls: 'my-char-muted' }); subLine.lastChild.style.fontSize = '11px';

                    var nameB = subLine.createEl('span', { text: rel.charB });
                    nameB.className = 'my-char-link'; nameB.style.fontSize = '13px';
                    nameB.addEventListener('click', function() {
                        var cd = self.findChar(rel.charB);
                        if (cd) self.showCharDetail(cd);
                    });

                    var intimacyLabel = getIntimacyLabel(rel.intimacy || 0);
                    var intimacyColor = getIntimacyColor(rel.intimacy || 0);
                    setBadge(subLine.createEl('span', { text: '❤️ ' + intimacyLabel }), intimacyColor); subLine.lastChild.style.fontSize = '9px';

                    var relHistory = getRelationHistory(self.plugin, rel.charA, rel.charB);
                    var historySummary = getChangeSummary(relHistory);
                    var summarySpan = subCard.createEl('div');
                    summarySpan.className = 'my-char-rel-summary'; summarySpan.style.fontSize = '10px';
                    summarySpan.textContent = '📈 ' + historySummary;

                    var actRow = subCard.createEl('div');
                    actRow.className = 'my-char-rel-actions';
                    var histBtn = actRow.createEl('button', { text: '📊 历史' });
                    histBtn.className = 'my-char-btn-ghost my-char-btn-xs'; histBtn.style.color = 'var(--char-purple)';
                    histBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        self.showChangeHistory(rel);
                    });
                    var recBtn = actRow.createEl('button', { text: '📝 记录变化' });
                    recBtn.className = 'my-char-view-btn my-char-btn-xs';
                    recBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        self.showRecordChange(rel, function() {
                            self.renderRelations(container);
                        });
                    });

                    var editBtn = actRow.createEl('button', { text: '编辑' });
                    editBtn.className = 'my-char-btn-ghost my-char-btn-xs';
                    editBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        self.showRelationDialog(rel);
                    });

                    var delRelBtn = actRow.createEl('button', { text: '删除' });
                    delRelBtn.className = 'my-char-btn-danger my-char-btn-xs';
                    delRelBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (confirmDestructiveAction('删除关系：' + rel.charA + ' × ' + rel.charB, '将同时清除双方人物 MD 中的关系与变化记录。')) {
                            var realIdx = findRelationIndex(self.relations, rel);
                            if (realIdx !== -1) {
                                removeIntimacyHistoryForPair(self.plugin, rel.charA, rel.charB);
                                self.relations.splice(realIdx, 1);
                                self.saveFactionsAndRelations();
                                self.render();
                            }
                        }
                    });

                    if (rel.desc) {
                        subCard.createEl('div', { text: rel.desc, cls: 'my-char-rel-desc' });
                    }
                    })(sortedRels[i]);
                }
            }
        }
    };

    MyView.prototype.renderGraph = function(container) {
        var self = this;
        var terms = getTermSet(this.plugin);
        container.empty();
        container.addClass('my-char-graph-root');

        var toolbar = container.createEl('div', { cls: 'my-char-graph-toolbar' });
        toolbar.createEl('span', { text: '🕸️ ' + terms.relation + '网络', cls: 'my-char-graph-title' });

        var syncBtn = toolbar.createEl('button', { text: '🔄 同步到 Obsidian 图谱', cls: 'my-char-view-btn' });
        syncBtn.style.fontSize = '12px';
        syncBtn.addEventListener('click', function() {
            syncGraphNotesToVault(self.plugin, self).then(function(res) {
                new obsidian.Notice(formatGraphSyncNotice(res));
                self.renderGraph(container);
            });
        });

        var globalGraphBtn = toolbar.createEl('button', { text: '🌐 打开原生全局图谱', cls: 'my-char-view-btn-secondary' });
        globalGraphBtn.style.fontSize = '12px';
        globalGraphBtn.addEventListener('click', function() {
            var folder = getGraphNotesFolder(self.plugin);
            openObsidianGlobalGraph(self.app, folder).then(function() {
                new obsidian.Notice('已在 Obsidian 原生图谱中打开（筛选：' + folder + '）');
            });
        });

        var hint = toolbar.createEl('span', { text: '原生图谱阵营配色：同步节点会写入「阵营」属性，可在原生图谱设置→分组中按 阵营:阵营名称 添加分组并选择颜色；下方预览自动按阵营颜色显示' });
        hint.className = 'my-char-view-muted';
        hint.style.fontSize = '11px';

        if (this.chars.length === 0) {
            container.createEl('p', { text: '暂无' + terms.entity + '数据', cls: 'my-char-view-empty' });
            return;
        }

        var syncScopeBar = container.createEl('div', { cls: 'my-char-graph-sync-scope' });
        syncScopeBar.createEl('span', { text: '📌 图谱同步类型：', cls: 'my-char-filter-label' });

        var modeSelect = syncScopeBar.createEl('select', { cls: 'my-char-select' });
        modeSelect.style.fontSize = '12px';
        modeSelect.add(createOption('all', '全部类型'));
        modeSelect.add(createOption('selected', '仅选中类型'));
        modeSelect.value = isGraphSyncModeSelected(this.plugin) ? 'selected' : 'all';
        modeSelect.addEventListener('change', async function() {
            self.plugin.settings.graphSyncMode = modeSelect.value;
            if (modeSelect.value === 'selected' && (!self.plugin.settings.graphSyncTypes || self.plugin.settings.graphSyncTypes.length === 0)) {
                var allTypes = collectCharTypesForGraph(self);
                self.plugin.settings.graphSyncTypes = allTypes.map(function(t) { return t.label; });
            }
            await self.plugin.saveSettings();
            self.renderGraph(container);
        });

        var typeOptions = collectCharTypesForGraph(this);
        var selectedTypes = this.plugin.settings.graphSyncTypes || [];
        var typeCheckboxWrap = container.createEl('div', { cls: 'my-char-graph-type-checks' });
        if (typeOptions.length === 0) {
            typeCheckboxWrap.createEl('span', { text: '（暂无类型数据，请在人物文件中添加「类型」字段）', cls: 'my-char-view-muted' });
        } else {
            for (var ti = 0; ti < typeOptions.length; ti++) {
                (function(opt) {
                    var label = typeCheckboxWrap.createEl('label', { cls: 'my-char-graph-type-check' });
                    var cb = label.createEl('input', { type: 'checkbox' });
                    cb.checked = !isGraphSyncModeSelected(self.plugin) || selectedTypes.indexOf(opt.label) !== -1;
                    cb.disabled = !isGraphSyncModeSelected(self.plugin);
                    label.createEl('span', { text: opt.label + ' (' + opt.count + ')' });
                    cb.addEventListener('change', async function() {
                        var list = (self.plugin.settings.graphSyncTypes || []).slice();
                        var idx = list.indexOf(opt.label);
                        if (cb.checked && idx === -1) list.push(opt.label);
                        if (!cb.checked && idx !== -1) list.splice(idx, 1);
                        self.plugin.settings.graphSyncTypes = list;
                        self.plugin.settings.graphSyncMode = 'selected';
                        await self.plugin.saveSettings();
                        self.renderGraph(container);
                    });
                })(typeOptions[ti]);
            }
        }

        var graphChars = getCharsForGraphSync(this.plugin, this);
        var graphFolder = getGraphNotesFolder(this.plugin);
        var folderHint = container.createEl('div', { cls: 'my-char-graph-legend' });
        folderHint.textContent = getGraphSyncSummaryText(this.plugin, this) + ' · 图谱节点目录：' + graphFolder + ' · ' + graphChars.length + ' 个节点，' + this.relations.length + ' 条' + terms.relation;

        container.createEl('div', { cls: 'my-char-view-muted', text: '▼ 关系网络预览（核心人物按关系度居中；节点大小表示关系数量；点击或键盘聚焦节点可打开本地图谱）' }).style.margin = '8px 0 4px';

        var n = graphChars.length;
        if (n === 0) {
            container.createEl('p', { text: '当前同步范围内没有' + terms.entity + '，请调整类型筛选后重试', cls: 'my-char-view-empty' });
            return;
        }
        // 先确定画布尺寸再计算节点坐标；此前 width/height 尚未赋值，导致布局坐标异常。
        var graphCols = Math.max(1, Math.ceil(Math.sqrt(n * 1.35)));
        var graphRows = Math.ceil(n / graphCols);
        var longestGraphName = graphChars.reduce(function(m, c) { return Math.max(m, Array.from(String(c.name || '')).length); }, 0);
        // 紧凑画布：优先使用当前面板宽度，避免少量人物也被撑成超宽画布。
        var availableGraphWidth = Math.max(320, container.clientWidth || 600);
        var graphCellWidth = Math.max(132, Math.min(168, longestGraphName * 6 + 82));
        var comfortableLayout = (this._graphLayoutMode || 'compact') === 'comfortable';
        var baseGraphRadius = comfortableLayout ? 158 : 138;
        var graphRingGap = comfortableLayout ? 142 : 124;
        var remainingGraphNodes = Math.max(0, n - 1), ringIndex = 0, radialExtent = 0;
        while (remainingGraphNodes > 0) {
            var currentRingRadius = baseGraphRadius + ringIndex * graphRingGap;
            var currentRingCapacity = Math.max(7, Math.floor((Math.PI * 2 * currentRingRadius) / (24 * 3.45)));
            var currentRingLimit = ringIndex === 0 && remainingGraphNodes > currentRingCapacity - 1 ? Math.min(8, currentRingCapacity) : currentRingCapacity;
            remainingGraphNodes -= Math.min(currentRingLimit, remainingGraphNodes);
            radialExtent = currentRingRadius;
            ringIndex++;
        }
        if (!radialExtent) radialExtent = baseGraphRadius;
        var graphDiameter = Math.ceil(radialExtent * 2 + 100);
        var width = Math.max(520, Math.min(Math.max(availableGraphWidth, graphDiameter), graphDiameter));
        var height = Math.max(520, graphDiameter);
        var graphLayoutMode = this._graphLayoutMode || 'compact';
        var graphNodeScale = Number(this._graphNodeScale) || 1;
        var graphLayoutSeed = Number(this._graphLayoutSeed) || 0;
        var layout = graphModel.buildGraphLayout(graphChars, this.relations, width, height, graphLayoutMode, graphLayoutSeed);
        var nodePositions = layout.positions;
        var graphCharNames = {};
        for (var gi = 0; gi < graphChars.length; gi++) graphCharNames[graphChars[gi].name] = true;

        // 图谱交互工具：搜索定位、关系类型筛选、人物聚焦、缩放
        var tools = container.createEl('div', { cls: 'rw-graph-tools' });
        var searchInput = tools.createEl('input', { type: 'search', placeholder: '搜索人物姓名并定位…', cls: 'my-char-form-input' });
        searchInput.style.maxWidth = '240px';
        var relationFilter = tools.createEl('select', { cls: 'my-char-select' });
        relationFilter.createEl('option', { text: '全部关系类型', attr: { value: '__all__' } });
        var relationTypes = Array.from(new Set(this.relations.map(function(r){ return String(r.type || r.relation || '关系').trim(); }).filter(Boolean)));
        relationTypes.forEach(function(t){ relationFilter.createEl('option', { text: t, attr: { value: t } }); });
        var focusHint = tools.createEl('span', { text: '点击人物聚焦，再次点击取消；双击打开人物资料', cls: 'my-char-view-muted' });
        var layoutBar = container.createEl('div', { cls: 'rw-graph-layout-controls' });
        layoutBar.createEl('span', { text: '布局', cls: 'my-char-view-muted' });
        function addLayoutButton(label, title, active, handler) {
            var btn = layoutBar.createEl('button', { text: label, cls: 'my-char-view-btn rw-graph-layout-btn' });
            btn.setAttribute('title', title); btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            if (active) btn.addClass('is-active');
            btn.addEventListener('click', handler); return btn;
        }
        addLayoutButton('紧凑', '缩短人物间距，适合日常查看', graphLayoutMode === 'compact', function() {
            self._graphLayoutMode = 'compact'; self.renderGraph(container);
        });
        addLayoutButton('舒适', '增加人物间距，适合关系较多时查看', graphLayoutMode === 'comfortable', function() {
            self._graphLayoutMode = 'comfortable'; self.renderGraph(container);
        });
        var nodeSizeLabel = layoutBar.createEl('span', { text: '节点 ' + (graphNodeScale < .95 ? '小' : (graphNodeScale > 1.05 ? '大' : '中')), cls: 'my-char-view-muted rw-graph-node-size-label' });
        addLayoutButton('−', '缩小人物节点', false, function() {
            self._graphNodeScale = Math.max(.8, Math.round((graphNodeScale - .1) * 10) / 10); self.renderGraph(container);
        });
        addLayoutButton('+', '放大人物节点', false, function() {
            self._graphNodeScale = Math.min(1.25, Math.round((graphNodeScale + .1) * 10) / 10); self.renderGraph(container);
        });
        addLayoutButton('自动整理', '重新计算人物位置，尝试减少连线交叉', false, function() {
            self._graphLayoutSeed = graphLayoutSeed + 1; self.renderGraph(container);
        });
        var wrap = container.createEl('div', { cls: 'my-char-graph-canvas-wrap' });
        // 使用固定尺寸舞台承载 SVG 与 HTML 姓名层；两者共享完全相同的坐标与缩放矩阵。
        wrap.style.overflow='auto'; wrap.style.minHeight=height+'px'; wrap.style.position='relative';
        var graphStage = wrap.createEl('div', { cls: 'rw-graph-stage' });
        graphStage.style.position='relative'; graphStage.style.width=width+'px'; graphStage.style.height=height+'px';
        graphStage.style.minWidth=width+'px'; graphStage.style.flex='none';
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height); svg.classList.add('my-char-graph-svg'); svg.style.overflow='visible';
        svg.style.position='absolute'; svg.style.left='0'; svg.style.top='0'; svg.style.width=width+'px'; svg.style.height=height+'px'; svg.style.maxWidth='none';
        var viewportGroup=document.createElementNS('http://www.w3.org/2000/svg','g');
        var graphScale=1, graphTx=0, graphTy=0, focusedName=null, searchName=null;
        var edgeGroup=document.createElementNS('http://www.w3.org/2000/svg','g');
        var nodeGroup=document.createElementNS('http://www.w3.org/2000/svg','g');
        var edgeEls=[], nodeEls={}, graphNodeLabels=[];
        function relType(rel){ return String(rel.type || rel.relation || '关系').trim(); }
        for (var ri=0; ri<layout.edges.length; ri++) {
            var rel=layout.edges[ri]; if(!graphCharNames[rel.charA] || !graphCharNames[rel.charB]) continue;
            var pa=nodePositions[rel.charA], pb=nodePositions[rel.charB]; if(!pa||!pb) continue;
            var eg=document.createElementNS('http://www.w3.org/2000/svg','g'); eg.setAttribute('class','my-char-graph-edge-group');
            var line=document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1',String(pa.x)); line.setAttribute('y1',String(pa.y)); line.setAttribute('x2',String(pb.x)); line.setAttribute('y2',String(pb.y));
            line.setAttribute('stroke',getIntimacyColor(rel.intimacy||0)); line.setAttribute('stroke-width','1.6'); line.setAttribute('stroke-opacity','0.58'); line.setAttribute('class','my-char-graph-edge'); eg.appendChild(line);
            var label=document.createElementNS('http://www.w3.org/2000/svg','text');
            var edgeDx=pb.x-pa.x, edgeDy=pb.y-pa.y, edgeLen=Math.sqrt(edgeDx*edgeDx+edgeDy*edgeDy)||1;
            // 标签沿连线偏向中段但不压在节点边缘；同一人物对的多条关系使用不同偏移。
            var pairKey=[rel.charA,rel.charB].sort().join('|||');
            var samePairIndex=0;
            for(var rj=0;rj<ri;rj++){var prior=layout.edges[rj];if([prior.charA,prior.charB].sort().join('|||')===pairKey)samePairIndex++;}
            var edgeOffset=(samePairIndex%2===0?1:-1)*(13+Math.floor(samePairIndex/2)*12);
            var labelT=samePairIndex>0?0.56:0.5;
            label.setAttribute('x',String(pa.x+(pb.x-pa.x)*labelT-(edgeDy/edgeLen)*edgeOffset));
            label.setAttribute('y',String(pa.y+(pb.y-pa.y)*labelT+(edgeDx/edgeLen)*edgeOffset-5));
            label.setAttribute('text-anchor','middle'); label.setAttribute('font-size','10'); label.setAttribute('class','my-char-graph-edge-label'); label.setAttribute('paint-order','stroke'); label.setAttribute('stroke','#f8fafc'); label.setAttribute('stroke-width','5'); label.setAttribute('stroke-linejoin','round'); label.textContent=relType(rel); eg.appendChild(label);
            eg.dataset.type=relType(rel); eg.dataset.a=rel.charA; eg.dataset.b=rel.charB; if(layout.edges.length >= 10) eg.classList.add('rw-edge-label-hidden'); edgeGroup.appendChild(eg); edgeEls.push(eg);
        }
        var names=Object.keys(nodePositions);
        for(var ni=0; ni<names.length; ni++) (function(name){
            var pos=nodePositions[name], faction=self.getCharField(pos.char,self.plugin.settings.factionFieldName||'阵营'), nodeColor=self.getFactionColorForChar(pos.char)||'#4a90e2';
            var g=document.createElementNS('http://www.w3.org/2000/svg','g'); g.setAttribute('class','my-char-graph-node'); g.setAttribute('role','button'); g.setAttribute('tabindex','0'); g.setAttribute('aria-label',name+'，关系度 '+(pos.degree||0)); g.style.cursor='pointer';
            var displayName = String((pos.char && pos.char.name) || name || '').trim();
            var validDisplayName = displayName && !/^(undefined|null|\[object Object\])$/i.test(displayName);
            var nameChars = validDisplayName ? Array.from(displayName) : [];
            var nameLines = [];
            for (var nameIndex = 0; nameIndex < nameChars.length; nameIndex += 4) nameLines.push(nameChars.slice(nameIndex, nameIndex + 4).join(''));
            var nodeRadius = Math.max(17, Math.min(34, (pos.radius || 24) * graphNodeScale));
            var circle=document.createElementNS('http://www.w3.org/2000/svg','circle'); circle.setAttribute('cx',String(pos.x)); circle.setAttribute('cy',String(pos.y)); circle.setAttribute('r',String(nodeRadius)); circle.setAttribute('fill',nodeColor); circle.setAttribute('stroke','var(--background-primary, #fff)'); circle.setAttribute('stroke-width','2.5'); g.appendChild(circle);
            // 姓名数据先收集，稍后统一绘制到所有圆点之上的独立 SVG 图层，防止被后续节点覆盖。
            if (validDisplayName) graphNodeLabels.push({name:displayName, x:pos.x, y:pos.y, radius:nodeRadius});
            if (displayName && !/^(undefined|null|\[object Object\])$/i.test(displayName)) { var title=document.createElementNS('http://www.w3.org/2000/svg','title'); title.textContent=displayName+(faction?' · '+faction:''); g.appendChild(title); }
            var nodeClickTimer=null;
            g.addEventListener('click',function(ev){ focusedName=focusedName===name?null:name; updateGraphEmphasis(); if(nodeClickTimer) clearTimeout(nodeClickTimer); nodeClickTimer=setTimeout(function(){ if(self.showCharDetail && pos.char) self.showCharDetail(pos.char); },240); });
            g.addEventListener('dblclick',function(ev){ev.preventDefault();ev.stopPropagation();if(nodeClickTimer)clearTimeout(nodeClickTimer);openLocalGraphForEntity(self.app,self.plugin,self,name);});
            g.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();focusedName=focusedName===name?null:name;updateGraphEmphasis();if(self.showCharDetail&&pos.char)self.showCharDetail(pos.char);}});
            nodeGroup.appendChild(g); nodeEls[name]=g;
        })(names[ni]);
        // HTML 姓名层：不再使用 SVG <text>。它位于 SVG 之上，避免 Obsidian/主题对 SVG 文本的样式覆盖。
        var nodeLabelGroup = graphStage.createEl('div', { cls: 'rw-graph-html-label-layer' });
        nodeLabelGroup.setAttribute('aria-hidden','true');
        nodeLabelGroup.style.position='absolute'; nodeLabelGroup.style.left='0'; nodeLabelGroup.style.top='0';
        nodeLabelGroup.style.width=width+'px'; nodeLabelGroup.style.height=height+'px';
        nodeLabelGroup.style.transformOrigin='0 0'; nodeLabelGroup.style.pointerEvents='none';
        nodeLabelGroup.style.zIndex='2'; nodeLabelGroup.style.overflow='visible';
        for (var nli=0; nli<graphNodeLabels.length; nli++) {
            var labelInfo=graphNodeLabels[nli], chars=Array.from(labelInfo.name), lines=[];
            var maxCharsPerLine = chars.length <= 4 ? 4 : (labelInfo.radius >= 46 ? 4 : 3);
            for (var cli=0; cli<chars.length; cli+=maxCharsPerLine) lines.push(chars.slice(cli,cli+maxCharsPerLine).join(''));
            var fontSize = (chars.length <= 2 ? 13 : (chars.length <= 4 ? 11 : 10)) * graphNodeScale;
            var htmlLabel=nodeLabelGroup.createEl('div', { cls: 'rw-graph-node-name-label', text: lines.join('\n') });
            htmlLabel.setAttribute('data-node-name',labelInfo.name);
            htmlLabel.style.position='absolute'; htmlLabel.style.left=labelInfo.x+'px'; htmlLabel.style.top=labelInfo.y+'px';
            htmlLabel.style.transform='translate(-50%, -50%)'; htmlLabel.style.width=Math.max(48,labelInfo.radius*1.72)+'px';
            htmlLabel.style.height=Math.max(34,labelInfo.radius*1.55)+'px'; htmlLabel.style.display='flex';
            htmlLabel.style.alignItems='center'; htmlLabel.style.justifyContent='center'; htmlLabel.style.textAlign='center';
            htmlLabel.style.whiteSpace='pre-line'; htmlLabel.style.overflow='hidden'; htmlLabel.style.overflowWrap='anywhere';
            htmlLabel.style.fontSize=fontSize+'px'; htmlLabel.style.lineHeight='1.15'; htmlLabel.style.fontWeight='750';
            htmlLabel.style.color='#ffffff'; htmlLabel.style.textShadow='0 1px 2px rgba(0,0,0,.72), 0 0 3px rgba(0,0,0,.38)';
            htmlLabel.style.opacity='1'; htmlLabel.style.visibility='visible'; htmlLabel.style.pointerEvents='none';
            htmlLabel.style.zIndex='3'; htmlLabel.style.boxSizing='border-box';
        }
        viewportGroup.appendChild(edgeGroup); viewportGroup.appendChild(nodeGroup); svg.appendChild(viewportGroup);
        graphStage.appendChild(svg);

        var zoomBar=wrap.createEl('div',{cls:'my-char-graph-zoom-bar'});
        var zoomOut=zoomBar.createEl('button',{text:'−',attr:{'aria-label':'缩小图谱'}}), zoomLabel=zoomBar.createEl('span',{text:'100%',cls:'my-char-graph-zoom-label'}), zoomIn=zoomBar.createEl('button',{text:'+',attr:{'aria-label':'放大图谱'}}), zoomReset=zoomBar.createEl('button',{text:'适应'});
        [zoomOut,zoomIn,zoomReset].forEach(function(btn){btn.addClass('my-char-view-btn');btn.addEventListener('pointerdown',function(ev){ev.stopPropagation();});});
        function applyGraphZoom(){
            viewportGroup.setAttribute('transform','translate('+graphTx+' '+graphTy+') translate('+width/2+' '+height/2+') scale('+graphScale+') translate('+(-width/2)+' '+(-height/2)+')');
            var matrixOffsetX=graphTx+(width/2)*(1-graphScale), matrixOffsetY=graphTy+(height/2)*(1-graphScale);
            nodeLabelGroup.style.transform='matrix('+graphScale+',0,0,'+graphScale+','+matrixOffsetX+','+matrixOffsetY+')';
            zoomLabel.textContent=Math.round(graphScale*100)+'%'; updateGraphEmphasis();
        }
        function updateGraphEmphasis(){
            var selectedType=relationFilter.value||'__all__';
            var connected={}; if(focusedName){connected[focusedName]=true;edgeEls.forEach(function(e){if(e.dataset.a===focusedName)connected[e.dataset.b]=true;if(e.dataset.b===focusedName)connected[e.dataset.a]=true;});}
            Object.keys(nodeEls).forEach(function(name){var g=nodeEls[name],dim=(focusedName&&!connected[name])||(searchName&&!name.toLowerCase().includes(searchName.toLowerCase()));g.style.opacity=dim?'0.16':'1';g.classList.toggle('is-focused',name===focusedName);g.classList.toggle('is-search-hit',!!searchName&&name.toLowerCase().includes(searchName.toLowerCase()));});
            nodeLabelGroup.querySelectorAll('[data-node-name]').forEach(function(label){var labelName=label.getAttribute('data-node-name')||'',dim=(focusedName&&!connected[labelName])||(searchName&&!labelName.toLowerCase().includes(searchName.toLowerCase()));label.style.opacity=dim?'0.16':'1';});
            edgeEls.forEach(function(e){var typeOk=selectedType==='__all__'||e.dataset.type===selectedType;var focusOk=!focusedName||(e.dataset.a===focusedName||e.dataset.b===focusedName);e.style.display=typeOk?'':'none';e.style.opacity=focusOk?'1':'.08';var label=e.querySelector('text');var hideDenseLabel=edgeEls.length>=10&&!focusedName&&graphScale<1.2;e.classList.toggle('rw-edge-label-hidden',hideDenseLabel||(focusedName&&!focusOk));if(label&&(!typeOk||(focusedName&&!focusOk)))e.classList.add('rw-edge-label-hidden');else if(label&&!hideDenseLabel)e.classList.remove('rw-edge-label-hidden');});
        }
        function fitGraphToView() {
            var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
            names.forEach(function(name){var p=nodePositions[name],pad=(p.radius||26)+24;minX=Math.min(minX,p.x-pad);maxX=Math.max(maxX,p.x+pad);minY=Math.min(minY,p.y-pad);maxY=Math.max(maxY,p.y+pad);});
            if (!isFinite(minX)) { graphScale=1;graphTx=0;graphTy=0;applyGraphZoom();return; }
            var boundsW=Math.max(1,maxX-minX),boundsH=Math.max(1,maxY-minY),viewW=wrap.clientWidth||width,viewH=wrap.clientHeight||height,pad=24;
            graphScale=Math.max(.4,Math.min(1.8,(viewW-pad*2)/boundsW,(viewH-pad*2)/boundsH));
            var centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
            graphTx=viewW/2-(width/2+(centerX-width/2)*graphScale);
            graphTy=viewH/2-(height/2+(centerY-height/2)*graphScale);
            searchName=null;searchInput.value='';focusedName=null;applyGraphZoom();
        }
        zoomIn.addEventListener('click',function(){graphScale=Math.min(3.2,graphScale*1.2);applyGraphZoom();}); zoomOut.addEventListener('click',function(){graphScale=Math.max(.4,graphScale/1.2);applyGraphZoom();}); zoomReset.addEventListener('click',fitGraphToView);
        searchInput.addEventListener('input',function(){searchName=searchInput.value.trim();var found=names.find(function(n){return searchName&&n.toLowerCase().includes(searchName.toLowerCase());});if(found){var p=nodePositions[found];graphTx=graphScale*(width/2-p.x);graphTy=graphScale*(height/2-p.y);}applyGraphZoom();});
        relationFilter.addEventListener('change',updateGraphEmphasis);
        var drag=null; svg.addEventListener('pointerdown',function(ev){if(ev.target.closest&&ev.target.closest('.my-char-graph-node'))return;if(ev.button!==undefined&&ev.button!==0)return;drag={x:ev.clientX,y:ev.clientY,tx:graphTx,ty:graphTy};if(svg.setPointerCapture)svg.setPointerCapture(ev.pointerId);});
        svg.addEventListener('pointermove',function(ev){if(!drag)return;graphTx=drag.tx+(ev.clientX-drag.x);graphTy=drag.ty+(ev.clientY-drag.y);applyGraphZoom();});
        function endDrag(){drag=null;} svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);svg.addEventListener('lostpointercapture',endDrag);
        svg.addEventListener('wheel',function(ev){ev.preventDefault();graphScale=Math.max(.4,Math.min(3.2,graphScale*(ev.deltaY<0?1.08:.92)));applyGraphZoom();},{passive:false});
        fitGraphToView();
    };
    
    MyView.prototype.renderAutoRelationsSuggestions = function(container) {
        var self = this;
        var autoRels = this.buildAutoRelations();
        var manualKeys = {};
        for (var i = 0; i < this.relations.length; i++) {
            var key = [this.relations[i].charA, this.relations[i].charB].sort().join('|||');
            manualKeys[key] = true;
        }
        
        var newAutoRels = [];
        var autoKeys = Object.keys(autoRels);
        for (var i = 0; i < autoKeys.length; i++) {
            if (!manualKeys[autoKeys[i]]) {
                newAutoRels.push(autoRels[autoKeys[i]]);
            }
        }

        // 已有大量「同期出场」时，提示可批量改成真正关系类型
        var syncCount = 0;
        for (var si = 0; si < this.relations.length; si++) {
            if ((this.relations[si].type || '') === '同期出场') syncCount++;
        }
        if (syncCount > 0) {
            var tip = container.createEl('div', { cls: 'my-char-banner my-char-banner-info' });
            tip.createEl('span', {
                text: '💡 当前有 ' + syncCount + ' 条「同期出场」。写作设计请点「编辑」改成朋友/恋人/师徒等；也可用批量操作按类型清理。',
                cls: 'my-char-banner-text'
            });
        }
        
        if (newAutoRels.length > 0) {
            var suggestDiv = container.createEl('div');
            suggestDiv.className = 'my-char-section';
            suggestDiv.style.borderTop = '2px solid var(--char-border)';
            suggestDiv.style.paddingTop = '12px';

            var head = suggestDiv.createEl('div');
            head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap;';
            head.createEl('div', {
                text: '💡 共同出场线索（辅助，不是正式关系）',
                cls: 'my-char-muted'
            });
            var expanded = !!this._autoRelSuggestExpanded;
            var toggleBtn = head.createEl('button', {
                text: expanded ? '收起线索' : '展开线索（' + newAutoRels.length + '）',
                cls: 'my-char-btn-ghost my-char-btn-xs'
            });
            toggleBtn.addEventListener('click', function() {
                self._autoRelSuggestExpanded = !self._autoRelSuggestExpanded;
                self.renderRelations(self._lastRelationsContainer || container);
            });
            if (!expanded) return;

            suggestDiv.createEl('p', {
                text: '点「设计关系」打开编辑框，请选择真正的关系类型（默认朋友）。勿依赖「同期出场」当主设定。',
                cls: 'my-char-muted'
            }).style.cssText = 'font-size:11px;margin:0 0 8px;';
            
            newAutoRels.sort(function(a, b) { return b.count - a.count; });
            var showCount = Math.min(10, newAutoRels.length);
            
            for (var i = 0; i < showCount; i++) {
                var rel = newAutoRels[i];
                var card = suggestDiv.createEl('div');
                card.className = 'my-char-rel-subcard';
                card.style.borderStyle = 'dashed';
                card.style.display = 'flex';
                card.style.alignItems = 'center';
                card.style.justifyContent = 'space-between';
                card.innerHTML = '<div><strong>' + rel.charA + '</strong> <span style="color:#888;">↔</span> <strong>' + rel.charB + '</strong><br><small style="color:#888;">共同出现 ' + rel.count + ' 次</small></div>';
                var addBtn = card.createEl('button', { text: '✏️ 设计关系' });
                addBtn.className = 'my-char-view-btn my-char-btn-xs';
                addBtn.addEventListener('click', (function(rd) {
                    return function(e) {
                        e.stopPropagation();
                        self.showRelationDialog({
                            charA: rd.charA,
                            charB: rd.charB,
                            type: '朋友',
                            desc: '共同出场 ' + rd.count + ' 次（可改描述）',
                            intimacy: 1
                        });
                    };
                })(rel));
            }
            
            if (newAutoRels.length > 10) {
                suggestDiv.createEl('div', { text: '...还有 ' + (newAutoRels.length - 10) + ' 条线索', cls: 'my-char-muted' }).style.textAlign = 'center';
            }
        }
    };
    
    MyView.prototype.showBatchRelationDialog = function() {
        var self = this;
        var modal = new BatchRelationModal(this.app, this.relations, this.chars, function(result) {
            if (result.action === 'batch_delete_by_type') {
                var toDelete = [];
                for (var i = 0; i < self.relations.length; i++) {
                    if ((self.relations[i].type || '其他') === result.type) {
                        toDelete.push(self.relations[i]);
                    }
                }
                for (var i = 0; i < toDelete.length; i++) {
                    var idx = self.relations.indexOf(toDelete[i]);
                    if (idx !== -1) self.relations.splice(idx, 1);
                }
                self.saveFactionsAndRelations();
                self.render();
                new obsidian.Notice('已删除 ' + toDelete.length + ' 条「' + result.type + '」关系');
            } else if (result.action === 'batch_update_intimacy') {
                var updatedCount = 0;
                for (var i = 0; i < self.relations.length; i++) {
                    if ((self.relations[i].type || '其他') === result.type) {
                        self.relations[i].intimacy = result.newIntimacy;
                        updatedCount++;
                    }
                }
                self.saveFactionsAndRelations();
                self.render();
                new obsidian.Notice('已更新 ' + updatedCount + ' 条关系的亲密度');
            } else if (result.action === 'clear_all') {
                if (confirmDestructiveAction('删除全部关系？', '将清空全部关系和亲密度历史，并同步清理人物 MD 中的关系记录。此操作不可撤销。')) {
                    self.relations = [];
                    self.plugin._intimacyHistory = [];
                    self.saveFactionsAndRelations();
                    self.render();
                    new obsidian.Notice('已清空所有关系');
                }
            } else if (result.action === 'export_relations') {
                var csvRows = [['人物A', '人物B', '关系类型', '亲密度', '开始时间', '结束时间', '描述']];
                for (var i = 0; i < self.relations.length; i++) {
                    var r = self.relations[i];
                    csvRows.push([r.charA, r.charB, r.type, r.intimacy || 0, r.startTime || '', r.endTime || '', r.desc || '']);
                }
                var csvContent = csvRows.map(function(row) {
                    return row.map(function(cell) {
                        return '"' + String(cell).replace(/"/g, '""') + '"';
                    }).join(',');
                }).join('\n');
                var blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'relations-export.csv';
                a.click();
                URL.revokeObjectURL(url);
                new obsidian.Notice('导出成功');
            }
        });
        modal.open();
    };

    MyView.prototype.findChar = function (name) {
        return this.charMap[name] || null;
    };

    MyView.prototype.buildSettingCollectionMarkdown = function () {
        var self = this;
        var terms = getTermSet(this.plugin);
        var title = getViewTitle(this.plugin);
        var now = new Date().toLocaleString();
        var currentTime = this.plugin.settings.currentTimePoint || '（未设置）';
        var lines = [];
        lines.push('# 📚 ' + title + ' · 设定集');
        lines.push('');
        lines.push('> 生成时间：' + now);
        lines.push('> 当前故事进度：' + currentTime);
        lines.push('> ' + terms.entity + ' ' + this.chars.length + ' · ' + terms.relation + ' ' + this.relations.length + ' · ' + terms.faction + ' ' + this.factions.length + ' · ' + terms.event + ' ' + this.timeline.length);
        lines.push('');

        lines.push('## 👥 ' + terms.entity + '一览');
        lines.push('');
        if (this.chars.length === 0) {
            lines.push('（暂无数据）');
        } else {
            for (var ci = 0; ci < this.chars.length; ci++) {
                var c = this.chars[ci];
                lines.push('### ' + c.name);
                var status = getCharStatusAtTime(this, c, currentTime === '（未设置）' ? '' : currentTime);
                lines.push('- 状态：' + getStatusLabel(status));
                var fields = c.fields || {};
                for (var fk in fields) {
                    if (fields.hasOwnProperty(fk) && fields[fk]) {
                        lines.push('- ' + fk + '：' + fields[fk]);
                    }
                }
                lines.push('');
            }
        }

        lines.push('## 🏰 ' + terms.faction);
        lines.push('');
        if (this.factions.length === 0) {
            lines.push('（暂无）');
        } else {
            for (var fi = 0; fi < this.factions.length; fi++) {
                var f = this.factions[fi];
                lines.push('- **' + f.name + '**' + (f.desc ? '：' + f.desc : ''));
            }
        }
        lines.push('');

        lines.push('## 🔗 ' + terms.relation + '表');
        lines.push('');
        if (this.relations.length === 0) {
            lines.push('（暂无）');
        } else {
            lines.push('| A | B | 类型 | 亲密度 | 描述 |');
            lines.push('| --- | --- | --- | --- | --- |');
            for (var ri = 0; ri < this.relations.length; ri++) {
                var r = this.relations[ri];
                lines.push('| ' + r.charA + ' | ' + r.charB + ' | ' + (r.type || '') + ' | ' + (r.intimacy || 0) + ' | ' + (r.desc || '').replace(/\|/g, '\\|') + ' |');
            }
        }
        lines.push('');

        if (this.relations.length > 0) {
            lines.push('## 🕸️ 关系图（Mermaid）');
            lines.push('');
            lines.push('```mermaid');
            lines.push('graph LR');
            var nodeIds = {};
            var nodeSeq = 0;
            function mermaidNodeId(name) {
                if (nodeIds[name]) return nodeIds[name];
                nodeSeq++;
                var id = 'N' + nodeSeq;
                nodeIds[name] = id;
                return id;
            }
            for (var mi = 0; mi < this.relations.length; mi++) {
                var mr = this.relations[mi];
                var aId = mermaidNodeId(mr.charA);
                var bId = mermaidNodeId(mr.charB);
                var edge = String(mr.type || '关系').replace(/"/g, "'");
                lines.push('  ' + aId + '["' + String(mr.charA).replace(/"/g, "'") + '"] -->|' + edge + '| ' + bId + '["' + String(mr.charB).replace(/"/g, "'") + '"]');
            }
            lines.push('```');
            lines.push('');
        }

        lines.push('## 📅 ' + terms.timeline);
        lines.push('');
        if (this.timeline.length === 0) {
            lines.push('（暂无）');
        } else {
            var lastYear = '';
            for (var ti = 0; ti < this.timeline.length; ti++) {
                var evt = this.timeline[ti];
                if (evt.year !== lastYear) {
                    lines.push('');
                    lines.push('### ' + evt.year);
                    lastYear = evt.year;
                }
                var tagPart = evt.tag ? '[' + evt.tag + '] ' : '';
                var meta = '';
                if (evt.plotLine) meta += ' | 情节线:' + evt.plotLine;
                if (evt.plotStatus) meta += ' | 状态:' + evt.plotStatus;
                if (evt.chapterNote) meta += ' | 笔记:' + evt.chapterNote;
                var monthPart = evt.month && evt.month !== '未标注' ? '（' + evt.month + '）' : '';
                lines.push('- ' + tagPart + evt.event + monthPart + meta);
            }
        }
        lines.push('');

        var unredeemed = novelExt.getUnredeemedPlotLines(this.timeline);
        lines.push('## 🧵 未回收伏笔 / 情节线');
        lines.push('');
        if (unredeemed.length === 0) {
            lines.push('✅ 暂无未回收情节线');
        } else {
            for (var ui = 0; ui < unredeemed.length; ui++) {
                var g = unredeemed[ui];
                lines.push('- **' + g.plotLine + '** · ' + (g.latestStatus || '进行中') + ' · ' + g.events.length + ' 个节点');
            }
        }
        lines.push('');

        var warnings = novelExt.validatePlotLines(this.timeline);
        if (warnings.length > 0) {
            lines.push('## ⚠️ 伏笔逻辑提醒');
            lines.push('');
            for (var wi = 0; wi < warnings.length; wi++) {
                lines.push('- ' + warnings[wi].message);
            }
            lines.push('');
        }

        var faIssues = novelExt.auditFirstAppearSync(this);
        var unbornIssues = auditUnbornAppearances(this);
        var parseErrors = this._mdParseErrors || [];
        var consistencyLines = [];
        for (var fai = 0; fai < faIssues.length; fai++) consistencyLines.push('- ' + faIssues[fai].message);
        for (var ubi = 0; ubi < unbornIssues.length; ubi++) consistencyLines.push('- ' + unbornIssues[ubi].message);
        for (var pei = 0; pei < Math.min(parseErrors.length, 30); pei++) {
            var pe = parseErrors[pei];
            consistencyLines.push('- 第' + pe.line + '行（' + pe.char + ' / ' + pe.section + '）：' + pe.reason + '　`' + pe.text + '`');
        }
        if (parseErrors.length > 30) {
            consistencyLines.push('- …还有 ' + (parseErrors.length - 30) + ' 行解析失败');
        }
        if (consistencyLines.length > 0) {
            lines.push('## ✅ 出场 / 伏笔一致性检查');
            lines.push('');
            for (var cli = 0; cli < consistencyLines.length; cli++) lines.push(consistencyLines[cli]);
            lines.push('');
        }

        lines.push('---');
        lines.push('*由「人物关系谱系」插件自动生成*');
        return lines.join('\n');
    };

    MyView.prototype.buildPrintPreviewBodyHtml = function () {
        var terms = getTermSet(this.plugin);
        var title = getViewTitle(this.plugin);
        var now = new Date().toLocaleString();
        var currentTime = this.plugin.settings.currentTimePoint || '（未设置）';
        var parts = [];
        parts.push('<h1>📚 ' + title + ' · 设定集</h1>');
        parts.push('<p class="meta">生成时间：' + now + '</p>');
        parts.push('<p class="meta">当前故事进度：' + currentTime + '</p>');
        parts.push('<p class="meta">' + terms.entity + ' ' + this.chars.length + ' · ' + terms.relation + ' ' + this.relations.length + ' · ' + terms.faction + ' ' + this.factions.length + ' · ' + terms.event + ' ' + this.timeline.length + '</p>');

        parts.push('<h2>👥 ' + terms.entity + '</h2><ul>');
        for (var ci = 0; ci < this.chars.length; ci++) {
            var c = this.chars[ci];
            var fields = c.fields || {};
            var extras = [];
            for (var fk in fields) {
                if (fields.hasOwnProperty(fk) && fields[fk]) extras.push(fk + '：' + fields[fk]);
            }
            parts.push('<li><strong>' + c.name + '</strong>' + (extras.length ? ' — ' + extras.slice(0, 3).join('；') : '') + '</li>');
        }
        parts.push('</ul>');

        parts.push('<h2>🔗 ' + terms.relation + '</h2>');
        if (this.relations.length > 0) {
            parts.push('<table><tr><th>A</th><th>B</th><th>类型</th><th>亲密度</th></tr>');
            for (var ri = 0; ri < this.relations.length; ri++) {
                var r = this.relations[ri];
                parts.push('<tr><td>' + r.charA + '</td><td>' + r.charB + '</td><td>' + (r.type || '') + '</td><td>' + (r.intimacy || 0) + '</td></tr>');
            }
            parts.push('</table>');
        }

        parts.push('<h2>📅 ' + terms.timeline + '</h2><ul>');
        var lastY = '';
        for (var ti = 0; ti < this.timeline.length; ti++) {
            var evt = this.timeline[ti];
            if (evt.year !== lastY) {
                parts.push('<li class="year-mark"><strong>' + evt.year + '</strong></li>');
                lastY = evt.year;
            }
            var tag = evt.tag ? '<span class="tag">[' + evt.tag + ']</span> ' : '';
            var plot = evt.plotLine ? ' <em>(' + evt.plotLine + (evt.plotStatus ? '·' + evt.plotStatus : '') + ')</em>' : '';
            parts.push('<li>' + tag + evt.event + plot + '</li>');
        }
        parts.push('</ul>');

        var unredeemed = novelExt.getUnredeemedPlotLines(this.timeline);
        parts.push('<h2>🧵 未回收伏笔</h2><ul>');
        if (unredeemed.length === 0) {
            parts.push('<li>✅ 暂无</li>');
        } else {
            for (var ui = 0; ui < unredeemed.length; ui++) {
                parts.push('<li><strong>' + unredeemed[ui].plotLine + '</strong> · ' + (unredeemed[ui].latestStatus || '进行中') + '</li>');
            }
        }
        parts.push('</ul>');
        return parts.join('');
    };

    MyView.prototype.getPrintPreviewStyles = function () {
        return '.my-char-print-doc{font-family:var(--font-interface,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif);color:var(--text-normal,#222);line-height:1.55;font-size:13px;}' +
            '.my-char-print-doc h1{font-size:22px;border-bottom:2px solid #6c5ce7;padding-bottom:8px;margin:0 0 12px;}' +
            '.my-char-print-doc h2{font-size:15px;margin-top:22px;color:#4a7fd4;border-left:4px solid #4a7fd4;padding-left:8px;}' +
            '.my-char-print-doc .meta{color:var(--text-muted,#666);font-size:12px;margin:3px 0;}' +
            '.my-char-print-doc ul{list-style:none;padding:0;margin:6px 0;}' +
            '.my-char-print-doc li{padding:3px 0 3px 10px;border-left:2px solid #e0e0e0;margin:2px 0;}' +
            '.my-char-print-doc .year-mark{border-left-color:#6c5ce7;margin-top:10px;}' +
            '.my-char-print-doc .tag{background:#4a7fd4;color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;}' +
            '.my-char-print-doc table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;}' +
            '.my-char-print-doc td,.my-char-print-doc th{border:1px solid #ddd;padding:5px 8px;text-align:left;}';
    };

    MyView.prototype.buildPrintPreviewHtml = function () {
        var title = getViewTitle(this.plugin);
        var body = this.buildPrintPreviewBodyHtml();
        var screenCss = this.getPrintPreviewStyles();
        var printCss = 'body{font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;max-width:820px;margin:24px auto;padding:0 20px 40px;color:#222;line-height:1.55;font-size:13px;}' +
            'h1{font-size:22px;border-bottom:2px solid #6c5ce7;padding-bottom:8px;}' +
            'h2{font-size:15px;margin-top:22px;color:#4a7fd4;border-left:4px solid #4a7fd4;padding-left:8px;}' +
            '.meta{color:#666;font-size:12px;margin:3px 0;}ul{list-style:none;padding:0;margin:6px 0;}' +
            'li{padding:3px 0 3px 10px;border-left:2px solid #e0e0e0;margin:2px 0;}.year-mark{border-left-color:#6c5ce7;margin-top:10px;}' +
            '.tag{background:#4a7fd4;color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;}' +
            'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;}td,th{border:1px solid #ddd;padding:5px 8px;text-align:left;}';
        return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + ' · 设定集</title><style>' + printCss + '</style></head><body>' + body + '</body></html>';
    };

    MyView.prototype.showPrintPreview = function () {
        new PrintPreviewModal(this.app, this).open();
    };

    MyView.prototype.exportSettingCollection = function (saveToVault) {
        var self = this;
        var md = this.buildSettingCollectionMarkdown();
        var fname = '设定集-' + new Date().toISOString().slice(0, 10) + '.md';
        if (saveToVault) {
            var folder = (this.plugin.settings.charFolder || '').trim();
            novelExt.saveTextToVault(this.app, folder, fname, md).then(function(path) {
                new obsidian.Notice('✅ 已保存到 ' + path);
            });
        } else {
            novelExt.downloadTextFile(md, fname, 'text/markdown;charset=utf-8');
            new obsidian.Notice('✅ 设定集已下载');
        }
    };

    /** 覆盖写入固定文件名，便于共创/编辑随时打开最新版 */
    MyView.prototype.updateSettingCollection = async function () {
        var md = this.buildSettingCollectionMarkdown();
        var folder = (this.plugin.settings.charFolder || '').trim();
        var fname = (this.plugin.settings.settingCollectionFile || '设定集.md').trim() || '设定集.md';
        var path = await novelExt.saveTextToVault(this.app, folder, fname, md);
        new obsidian.Notice('✅ 设定集已更新：' + path);
        return path;
    };

    MyView.prototype.createDataSnapshot = async function () {
        var res = await createVaultSnapshot(this.app, this.plugin);
        new obsidian.Notice('✅ 已备份到 ' + res.folder + '（' + res.files.length + ' 个文件）');
        return res;
    };

    MyView.prototype.openSnapshotManager = function () {
        new SnapshotManagerModal(this.app, this).open();
    };

    MyView.prototype.renderGlobalSearch = function (container) {
        var self = this;
        container.empty();
        container.classList.add('my-char-scroll-section');
        var terms = getTermSet(this.plugin);

        container.createEl('h3', { text: '🔍 全局搜索', cls: 'my-char-section-title' });
        container.createEl('p', {
            text: '同时搜索人物、关系、事件、阵营、组织履历与世界观资料，点击结果可进入对应模块。',
            cls: 'my-char-muted'
        }).style.margin = '0 0 12px';

        var searchBar = container.createEl('div', { cls: 'my-char-search-bar' });
        var input = searchBar.createEl('input', {
            type: 'text',
            placeholder: '输入姓名、事件、情节线、阵营…',
            cls: 'my-char-view-search'
        });
        input.value = this._globalSearchText || '';
        if (!this._globalSearchText) input.focus();

        var globalSearchComposing = false;
        var debouncedSearch = debounce(function() {
            if (globalSearchComposing) return;
            self._globalSearchText = input.value;
            var caretStart = input.selectionStart;
            var caretEnd = input.selectionEnd;
            self.renderGlobalSearch(container);
            window.setTimeout(function() {
                var replacement = container.querySelector('.my-char-view-search');
                if (!replacement) return;
                replacement.focus();
                try { replacement.setSelectionRange(caretStart, caretEnd); } catch (e) {}
            }, 0);
        }, 250);
        input.addEventListener('compositionstart', function() { globalSearchComposing = true; });
        input.addEventListener('compositionend', function() { globalSearchComposing = false; debouncedSearch(); });
        input.addEventListener('input', function() { if (!globalSearchComposing) debouncedSearch(); });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !globalSearchComposing) {
                self._globalSearchText = input.value;
                self.renderGlobalSearch(container);
                window.setTimeout(function() {
                    var replacement = container.querySelector('.my-char-view-search');
                    if (replacement) { replacement.focus(); replacement.setSelectionRange(replacement.value.length, replacement.value.length); }
                }, 0);
            }
        });
        var filterRow = container.createEl('div', { cls: 'my-char-search-filters' });
        filterRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px;';
        filterRow.createEl('span', { text: '范围筛选', cls: 'my-char-muted' });
        var moduleSelect = filterRow.createEl('select', { cls: 'my-char-select' });
        [['all','全部模块'],['chars','人物'],['relations','关系'],['timeline','时间线事件'],['plotLines','情节线'],['factions','阵营'],['orgRelations','组织关系'],['orgMemberships','任职履历'],['world','世界观资料']].forEach(function(pair) {
            moduleSelect.createEl('option', { text: pair[1], value: pair[0] });
        });
        moduleSelect.value = self._globalSearchModule || 'all';
        moduleSelect.addEventListener('change', function() { self._globalSearchModule = moduleSelect.value; self.renderGlobalSearch(container); });
        filterRow.createEl('span', { text: '字段检索可用「字段名:关键词」，拼音请填写人物档案的「拼音」或「拼音首字母」字段。', cls: 'my-char-muted' });

        var quickRow = container.createEl('div', { cls: 'my-char-quick-actions' });
        quickRow.createEl('button', { text: '+ 人物', cls: 'my-char-view-btn my-char-btn-sm' }).addEventListener('click', function() { self.showQuickAddChar(); });
        quickRow.createEl('button', { text: '+ 关系', cls: 'my-char-view-btn my-char-btn-sm' }).addEventListener('click', function() { self.showRelationDialog(null); });
        quickRow.createEl('button', { text: '+ 事件', cls: 'my-char-view-btn my-char-btn-sm' }).addEventListener('click', function() { self.showQuickAddEvent(); });

        var q = (this._globalSearchText || '').trim();
        if (!q) {
            container.createEl('p', { text: '输入关键词开始搜索', cls: 'my-char-view-empty' });
            return;
        }

        var results = performGlobalSearch(this, q, this._globalSearchModule || 'all');
        var total = results.chars.length + results.relations.length + results.timeline.length + results.plotLines.length + results.factions.length + results.orgRelations.length + results.orgMemberships.length + results.world.length;
        container.createEl('p', { text: '找到 ' + total + ' 条相关结果（关键词：「' + q + '」）', cls: 'my-char-muted' }).style.margin = '0 0 12px';

        function renderSection(title, count, renderFn) {
            if (count === 0) return;
            var sec = container.createEl('div', { cls: 'my-char-search-section' });
            sec.createEl('h4', { text: title + '（' + count + '）', cls: 'my-char-subsection-title' });
            renderFn(sec);
        }

        renderSection('👥 ' + terms.entity, results.chars.length, function(sec) {
            for (var i = 0; i < results.chars.length; i++) {
                (function(c) {
                    var row = sec.createEl('div', { cls: 'my-char-search-row' });
                    row.createEl('strong', { text: c.name, cls: 'my-char-view-link' });
                    var fields = c.fields || {};
                    var hint = fields['身份'] || fields['类型'] || fields['阵营'] || '';
                    if (hint) row.createEl('span', { text: ' · ' + hint, cls: 'my-char-muted' });
                    row.addEventListener('click', function() { self.showCharDetail(c); });
                })(results.chars[i]);
            }
        });

        renderSection('🔗 ' + terms.relation, results.relations.length, function(sec) {
            for (var i = 0; i < results.relations.length; i++) {
                (function(r) {
                    var row = sec.createEl('div', { cls: 'my-char-search-row' });
                    row.textContent = r.charA + ' ↔ ' + r.charB + ' · ' + (r.type || '关系') + (r.desc ? ' — ' + r.desc.substring(0, 40) : '');
                    row.title = '点击直接编辑这条关系';
                    row.addEventListener('click', function() {
                        self.showRelationDialog(r);
                    });
                })(results.relations[i]);
            }
        });

        renderSection('📅 ' + terms.timeline, results.timeline.length, function(sec) {
            for (var i = 0; i < Math.min(results.timeline.length, 30); i++) {
                (function(evt) {
                    var row = sec.createEl('div', { cls: 'my-char-search-row' });
                    row.textContent = '[' + evt.year + '] ' + (evt.tag ? '[' + evt.tag + '] ' : '') + evt.event.substring(0, 60);
                    row.addEventListener('click', function() {
                        self.tab = 'timeline';
                        if (evt.plotLine) self._plotLineFilter = evt.plotLine;
                        self._yearSearchText = evt.year;
                        self.render();
                        self.showEditEvent(evt);
                    });
                })(results.timeline[i]);
            }
            if (results.timeline.length > 30) {
                sec.createEl('p', { text: '…还有 ' + (results.timeline.length - 30) + ' 条，请缩小关键词', cls: 'my-char-muted' });
            }
        });

        renderSection('🧵 情节线', results.plotLines.length, function(sec) {
            for (var i = 0; i < results.plotLines.length; i++) {
                (function(g) {
                    var row = sec.createEl('div', { cls: 'my-char-search-row' });
                    row.textContent = g.plotLine + ' · ' + (g.latestStatus || '进行中') + ' · ' + g.events.length + ' 节点';
                    row.addEventListener('click', function() {
                        self.tab = 'timeline';
                        self._plotLineFilter = g.plotLine;
                        self.render();
                    });
                })(results.plotLines[i]);
            }
        });

        renderSection('🏰 ' + terms.faction, results.factions.length, function(sec) {
            for (var i = 0; i < results.factions.length; i++) {
                (function(f) {
                    var row = sec.createEl('div', { cls: 'my-char-search-row' });
                    row.textContent = f.name + (f.desc ? ' — ' + f.desc.substring(0, 40) : '');
                    row.title = '点击直接编辑这个阵营';
                    row.addEventListener('click', function() {
                        self.showFactionDialog(f);
                    });
                })(results.factions[i]);
            }
        });

        renderSection('🏛️ 组织关系', results.orgRelations.length, function(sec) {
            results.orgRelations.forEach(function(r) {
                var row = sec.createEl('div', { cls: 'my-char-search-row' });
                row.textContent = (r.orgA || r.factionA || r.nameA || '组织') + ' ↔ ' + (r.orgB || r.factionB || r.nameB || '组织') + ' · ' + (r.type || r.relation || '组织关系');
                row.title = '点击查看组织关系';
                row.addEventListener('click', function() { self.tab = 'factions'; self.render(); });
            });
        });
        renderSection('🧾 组织任职履历', results.orgMemberships.length, function(sec) {
            results.orgMemberships.forEach(function(m) {
                var row = sec.createEl('div', { cls: 'my-char-search-row' });
                row.textContent = [m.charName || m.character || m.person || '', m.factionName || m.orgName || m.organization || '', m.position || m.role || '', m.startTime || m.startDate || '', m.endTime || m.endDate || ''].filter(Boolean).join(' · ') || '任职记录';
                row.title = '匹配到任职履历';
                row.addEventListener('click', function() { self.tab = 'factions'; self.render(); });
            });
        });
        renderSection('🌍 世界观资料', results.world.length, function(sec) {
            results.world.forEach(function(entry) {
                var row = sec.createEl('div', { cls: 'my-char-search-row' });
                var bucketNames = { places: '地点', items: '道具', arts: '功法', orgs: '组织', map: '地图' };
                var detail = entry.item.description || entry.item.desc || entry.item.summary || '';
                row.textContent = (bucketNames[entry.bucket] || entry.bucket) + ' · ' + entry.title + (detail ? ' — ' + String(detail).slice(0, 72) : '');
                row.title = '匹配到世界观资料';
                row.addEventListener('click', function() { self.tab = 'world'; self.render(); });
            });
        });

        if (total === 0) {
            container.createEl('p', { text: '没有找到匹配「' + q + '」的内容', cls: 'my-char-view-empty' });
        }
    };

    MyView.prototype.buildAutoRelations = function () {
        var relations = {};
        for (var i = 0; i < this.timeline.length; i++) {
            var appeared = findCharsInEvent(this.timeline[i].event, this.charNames);
            for (var a = 0; a < appeared.length; a++) {
                for (var b = a + 1; b < appeared.length; b++) {
                    var key = [appeared[a], appeared[b]].sort().join('|||');
                    if (!relations[key]) {
                        relations[key] = { charA: appeared[a], charB: appeared[b], count: 0 };
                    }
                    relations[key].count++;
                }
            }
        }
        return relations;
    };

    MyView.prototype.showRelationDialog = function (prefill) {
        var self = this;
        var relTypes = getRelationTypes(this.plugin);
        var isEdit = !!(prefill && prefill.charA !== undefined && findRelationIndex(this.relations, prefill) !== -1);
        
        var modal = new RelationModal(this.app, this.chars, prefill, relTypes, function (result) {
            var oldIntimacy = (prefill && prefill.intimacy !== undefined) ? prefill.intimacy : null;
            var newIntimacy = result.intimacy !== undefined ? result.intimacy : 1;
            var timePoint = self.plugin.settings.currentTimePoint || result.startTime || '未标注时间';

            if (isEdit) {
                var idx = findRelationIndex(self.relations, prefill);
                if (idx === -1 && prefill) {
                    var pairKey = [prefill.charA, prefill.charB].sort().join('\0');
                    for (var pi = 0; pi < self.relations.length; pi++) {
                        var pk = [self.relations[pi].charA, self.relations[pi].charB].sort().join('\0');
                        if (pk === pairKey && (self.relations[pi].type || '') === (prefill.type || '')) {
                            idx = pi;
                            break;
                        }
                    }
                }
                if (idx !== -1) {
                    self.relations[idx] = result;
                } else {
                    self.relations.push(result);
                }
                if (prefill && (prefill.charA !== result.charA || prefill.charB !== result.charB)) {
                    addIntimacyRecord(self.plugin, {
                        id: generateId(), charA: result.charA, charB: result.charB,
                        oldValue: oldIntimacy === null ? newIntimacy : oldIntimacy,
                        newValue: oldIntimacy === null ? newIntimacy : oldIntimacy,
                        recordKind: 'relation_pair', oldCharA: prefill.charA, oldCharB: prefill.charB,
                        newCharA: result.charA, newCharB: result.charB,
                        changeReason: '关系双方调整', timestamp: timePoint,
                        recordDate: new Date().toISOString().split('T')[0],
                        customReason: '关系双方由「' + prefill.charA + ' ↔ ' + prefill.charB + '」调整为「' + result.charA + ' ↔ ' + result.charB + '」'
                    });
                }
                if (prefill && (prefill.type || '') !== (result.type || '')) {
                    addIntimacyRecord(self.plugin, {
                        id: generateId(), charA: result.charA, charB: result.charB,
                        oldValue: oldIntimacy === null ? newIntimacy : oldIntimacy,
                        newValue: oldIntimacy === null ? newIntimacy : oldIntimacy,
                        recordKind: 'relation_type', oldType: prefill.type || '未设置', newType: result.type || '未设置',
                        changeReason: '关系类型变更', timestamp: timePoint,
                        recordDate: new Date().toISOString().split('T')[0],
                        customReason: '关系类型由「' + (prefill.type || '未设置') + '」调整为「' + (result.type || '未设置') + '」'
                    });
                }
                if (oldIntimacy !== null && oldIntimacy !== newIntimacy) {
                    addIntimacyRecord(self.plugin, {
                        id: generateId(),
                        charA: result.charA,
                        charB: result.charB,
                        oldValue: oldIntimacy,
                        newValue: newIntimacy,
                        changeReason: '关系编辑',
                        timestamp: timePoint,
                        recordDate: new Date().toISOString().split('T')[0],
                        note: '通过关系编辑更新亲密度'
                    });
                }
            } else {
                self.relations.push(result);
                addIntimacyRecord(self.plugin, {
                    id: generateId(),
                    charA: result.charA,
                    charB: result.charB,
                    oldValue: newIntimacy,
                    newValue: newIntimacy,
                    changeReason: '初始值设定',
                    timestamp: timePoint,
                    recordDate: new Date().toISOString().split('T')[0],
                    note: '新建关系时的初始亲密度'
                });
            }
            self.saveFactionsAndRelations().then(function() {
                self.render();
                new obsidian.Notice(isEdit
                    ? '✅ 关系已更新：' + result.charA + ' ↔ ' + result.charB + '（' + result.type + '）'
                    : '✅ 关系已添加：' + result.charA + ' ↔ ' + result.charB + '（' + result.type + '）');
            });
        });
        modal.open();
    };

function isTimelineYearExpanded(view, year, yearIndex, totalYears) {
    if (view._timelineExpandedYears && view._timelineExpandedYears.hasOwnProperty(year)) {
        return !!view._timelineExpandedYears[year];
    }
    if (view._yearSearchText || view._plotLineFilter || view.selectedTag) return true;
    if (totalYears <= 3) return true;
    return yearIndex === 0;
}

function isTimelineMonthExpanded(view, year, month, yearExpanded, eventCount) {
    var key = year + '\x00' + month;
    if (view._timelineExpandedMonths && view._timelineExpandedMonths.hasOwnProperty(key)) {
        return !!view._timelineExpandedMonths[key];
    }
    if (!yearExpanded) return false;
    if (view._yearSearchText || view._plotLineFilter || view.selectedTag) return true;
    return eventCount <= 8;
}

function setTimelineYearExpanded(view, year, expanded) {
    if (!view._timelineExpandedYears) view._timelineExpandedYears = {};
    view._timelineExpandedYears[year] = expanded;
}

function setTimelineMonthExpanded(view, year, month, expanded) {
    if (!view._timelineExpandedMonths) view._timelineExpandedMonths = {};
    view._timelineExpandedMonths[year + '\x00' + month] = expanded;
}

function expandAllTimelineGroups(view, yearGroups) {
    if (!view._timelineExpandedYears) view._timelineExpandedYears = {};
    if (!view._timelineExpandedMonths) view._timelineExpandedMonths = {};
    var years = Object.keys(yearGroups);
    for (var yi = 0; yi < years.length; yi++) {
        var y = years[yi];
        view._timelineExpandedYears[y] = true;
        var monthGroups = {};
        for (var i = 0; i < yearGroups[y].length; i++) {
            var m = yearGroups[y][i].month || '未标注';
            monthGroups[m] = true;
        }
        for (var mk in monthGroups) {
            if (monthGroups.hasOwnProperty(mk)) {
                view._timelineExpandedMonths[y + '\x00' + mk] = true;
            }
        }
    }
}

function collapseAllTimelineGroups(view, yearGroups) {
    if (!view._timelineExpandedYears) view._timelineExpandedYears = {};
    if (!view._timelineExpandedMonths) view._timelineExpandedMonths = {};
    var years = Object.keys(yearGroups);
    for (var yi = 0; yi < years.length; yi++) {
        var y = years[yi];
        view._timelineExpandedYears[y] = false;
        for (var i = 0; i < yearGroups[y].length; i++) {
            var m = yearGroups[y][i].month || '未标注';
            view._timelineExpandedMonths[y + '\x00' + m] = false;
        }
    }
}

    // ========== 时间线视图 ==========
function renderTimelineOverview(container, events, onSelectYear) {
    var data = timelineModel.buildTimelineOverview(events, parseHistoricalDate);
    if (!data.rows.length) return;
    var card = container.createEl('div', { cls: 'rw-timeline-overview' });
    var head = card.createEl('div', { cls: 'rw-timeline-overview-head' });
    head.createEl('strong', { text: '时间分布概览' });
    head.createEl('span', { text: data.total + ' 个事件 · ' + data.rows.length + ' 个时间点', cls: 'my-char-muted' });
    var bars = card.createEl('div', { cls: 'rw-timeline-overview-bars' });
    data.rows.slice(0, 36).forEach(function(row) {
        var item = bars.createEl('button', { cls: 'rw-timeline-overview-item', attr: { type: 'button', title: row.label + ' · ' + row.count + ' 个事件' } });
        var bar = item.createEl('span', { cls: 'rw-timeline-overview-bar' });
        bar.style.height = Math.max(5, Math.round((row.count / Math.max(1,data.max))*54)) + 'px';
        item.createEl('span', { text: row.label, cls: 'rw-timeline-overview-label' });
        item.createEl('small', { text: row.count, cls: 'rw-timeline-overview-count' });
        item.addEventListener('click', function() { if (onSelectYear) onSelectYear(row.label); });
    });
    if (data.rows.length > 36) card.createEl('small', { text: '仅展示前 36 个时间点；可使用下方搜索定位更多事件。', cls: 'my-char-muted' });
}
MyView.prototype.renderTimeline = function (container) {
    var self = this;
    container.empty();
    container.classList.add('my-char-scroll-section');

    // ===== 年份搜索框 =====
    var searchToolbar = container.createEl('div');
    searchToolbar.className = 'my-char-filter-bar';
    searchToolbar.createEl('span', { text: '📅 年份搜索：', cls: 'my-char-filter-label' });

    var yearInput = searchToolbar.createEl('input', { type: 'text' });
    yearInput.className = 'my-char-input-inline'; yearInput.style.flex = '1'; yearInput.style.minWidth = '120px';
    yearInput.placeholder = '输入年份/年号/关键词搜索';
    yearInput.value = this._yearSearchText || '';

    var searchBtn = searchToolbar.createEl('button', { text: '🔍 搜索' });
    searchBtn.className = 'my-char-view-btn my-char-btn-sm';
    searchBtn.addEventListener('click', function() {
        self._yearSearchText = yearInput.value.trim();
        self.renderTimeline(container);
    });

    var clearBtn = searchToolbar.createEl('button', { text: '✕ 清除' });
    clearBtn.className = 'my-char-btn-danger my-char-btn-sm';
    clearBtn.addEventListener('click', function() {
        self._yearSearchText = '';
        yearInput.value = '';
        self.renderTimeline(container);
    });

    yearInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            self._yearSearchText = yearInput.value.trim();
            self.renderTimeline(container);
        }
    });

    // ===== 标签管理 =====
    var tagToolbar = container.createEl('div');
    tagToolbar.className = 'my-char-filter-bar';

    tagToolbar.createEl('span', { text: '🏷️ 标签管理：', cls: 'my-char-filter-label' });

    var tagManageBtn = tagToolbar.createEl('button', { text: '✏️ 管理标签' });
    tagManageBtn.className = 'my-char-btn-purple my-char-btn-sm';
    tagManageBtn.addEventListener('click', function() {
        var modal = new EventTagModal(self.plugin.app, self.plugin, function() {
            self.loadAllData().then(function() {
                self.renderTimeline(container);
            });
        });
        modal.open();
    });

    tagToolbar.createEl('button', { text: '+ 快速添加事件', cls: 'my-char-view-btn my-char-btn-sm' })
        .addEventListener('click', function() { self.showQuickAddEvent(); });

    var floatBtn = tagToolbar.createEl('button', { text: '👤 人物速查', cls: 'my-char-view-btn my-char-view-btn-secondary my-char-btn-sm' });
    floatBtn.title = '打开可拖动的人物列表弹窗';
    floatBtn.addEventListener('click', function() { self.toggleCharFloatPanel(true); });
    self.updateCharFloatPanel();

    var currentTags = getEventTags(this.plugin);
    var filterBar = tagToolbar.createEl('div');
    filterBar.className = 'my-char-chip-list rw-timeline-tag-filter';
    filterBar.style.marginLeft = '8px';
    var allBtn = filterBar.createEl('button', { text: '全部' });
    setFilterChip(allBtn, this.selectedTag === '', '#4a90e2');
    allBtn.addEventListener('click', function() {
        self.selectedTag = '';
        self.renderTimeline(container);
    });
    for (var i = 0; i < currentTags.length; i++) {
        (function(tag) {
            var btn = filterBar.createEl('button', { text: tag.label });
            btn.className = 'my-char-tag-chip rw-timeline-filter-chip';
            btn.style.background = tag.color;
            btn.style.setProperty('--tag-bg', tag.color);
            if (self.selectedTag === tag.value) btn.classList.add('is-active');
            else btn.classList.add('is-filter-inactive');
            btn.setAttribute('aria-pressed', self.selectedTag === tag.value ? 'true' : 'false');
            btn.title = '点击筛选「' + tag.label + '」事件；再次点击取消筛选';
            btn.addEventListener('click', function() {
                self.selectedTag = self.selectedTag === tag.value ? '' : tag.value;
                self.renderTimeline(container);
            });
        })(currentTags[i]);
    }

    var plotLines = {};
    for (var pli = 0; pli < this.timeline.length; pli++) {
        if (this.timeline[pli].plotLine) plotLines[this.timeline[pli].plotLine] = true;
    }
    var plotKeys = Object.keys(plotLines).sort();
    if (plotKeys.length > 0) {
        var plotBar = container.createEl('div', { cls: 'my-char-filter-bar my-char-filter-bar-accent' });
        plotBar.createEl('span', { text: '🧵 情节线：', cls: 'my-char-filter-label' });
        var allPlotBtn = plotBar.createEl('button', { text: '全部' });
        setFilterChip(allPlotBtn, !this._plotLineFilter, '#6c5ce7');
        allPlotBtn.addEventListener('click', function() {
            self._plotLineFilter = '';
            self.renderTimeline(container);
        });
        for (var pk = 0; pk < plotKeys.length; pk++) {
            (function(pl) {
                var pbtn = plotBar.createEl('button', { text: pl });
                setFilterChip(pbtn, self._plotLineFilter === pl, '#6c5ce7');
                pbtn.addEventListener('click', function() {
                    self._plotLineFilter = pl;
                    self.renderTimeline(container);
                });
            })(plotKeys[pk]);
        }
        var unredeemedLines = novelExt.getUnredeemedPlotLines(this.timeline);
        if (unredeemedLines.length > 0) {
            plotBar.createEl('span', {
                text: '⚠ ' + unredeemedLines.length + ' 条未回收线',
                cls: 'my-char-filter-hint'
            });
        }
    }

    self.renderPlotWarnings(container, this._plotLineFilter || '');

    if (this._plotLineFilter) {
        self.renderPlotLineTrack(container, this._plotLineFilter);
    }

    // ===== 筛选数据 =====
    var filteredTimeline = this.timeline;

    if (this._plotLineFilter) {
        filteredTimeline = filteredTimeline.filter(function(e) {
            return e.plotLine === self._plotLineFilter;
        });
    }

    if (this.selectedTag) {
        filteredTimeline = filteredTimeline.filter(function(e) {
            return e.tag === self.selectedTag;
        });
    }

    // ===== 当前时间点：隐藏「未来」事件 =====
    if (isTimeFilterActive(this.plugin)) {
        var timePointTl = this.plugin.settings.currentTimePoint;
        filteredTimeline = filteredTimeline.filter(function(e) {
            return isEventAtOrBeforeTime(e, timePointTl);
        });
    }

    // ===== 年份搜索筛选 =====
    if (this._yearSearchText) {
        var searchText = this._yearSearchText.trim().toLowerCase();
        filteredTimeline = filteredTimeline.filter(function(evt) {
            var yearLower = String(evt.year || '').toLowerCase();
            var storyLower = String(evt.storyYear || '').toLowerCase();
            // 匹配故事时间或旧数据中的原始分组/章节定位
            if (yearLower.indexOf(searchText) !== -1 || storyLower.indexOf(searchText) !== -1) {
                return true;
            }
            // 尝试解析年份进行数值匹配
            var parsed = parseHistoricalDate(evt.storyYear || evt.year);
            if (parsed && parsed.sortValue !== null) {
                var searchNum = parseFloat(searchText);
                if (!isNaN(searchNum) && parsed.sortValue === searchNum) {
                    return true;
                }
            }
            // 匹配事件内容
            if (evt.event.toLowerCase().indexOf(searchText) !== -1) {
                return true;
            }
            return false;
        });
    }

    renderTimelineOverview(container, filteredTimeline, function(yearLabel) {
        self._yearSearchText = yearLabel;
        self.renderTimeline(container);
    });
    // Timeline Markdown heading order is the author's canonical chronology.
    // Do not globally sort events by chapter index or optional storyYear here.
    // The renderer below groups by the original H2 (year) and H3 (scene/month)
    // headings and preserves the order of records within each group.
    filteredTimeline.sort(function(a, b) {
        return Number(a && a._lineIndex || 0) - Number(b && b._lineIndex || 0);
    });

    if (filteredTimeline.length === 0) {
        var emptyMsg = '暂无时间线事件';
        if (this.selectedTag) emptyMsg = '没有匹配标签的事件';
        if (this._yearSearchText) emptyMsg = '没有匹配 "' + this._yearSearchText + '" 的事件';
        if (isTimeFilterActive(this.plugin)) emptyMsg = '当前时间点之前暂无事件（可关闭顶栏「时间过滤」查看全部）';
        container.createEl('p', { text: emptyMsg, cls: 'my-char-view-empty' });
        if (self._pendingFocusEvent && typeof self.showEditEvent === 'function') {
            var orphanEvt = self._pendingFocusEvent;
            self._pendingHighlightLineIndex = null;
            self._pendingFocusEvent = null;
            setTimeout(function () { self.showEditEvent(orphanEvt); }, 50);
        } else {
            self._pendingHighlightLineIndex = null;
            self._pendingFocusEvent = null;
        }
        return;
    }

    // Preserve the original Markdown hierarchy: H2 = primary time heading,
    // H3 = its scene/month heading. The author's heading order is authoritative;
    // month names are not re-sorted as calendar months (e.g. narrative order may
    // intentionally be 十月、十一月、四月、五月).
    var yearGroups = {};
    var years = [];
    for (var i = 0; i < filteredTimeline.length; i++) {
        var y = String(filteredTimeline[i].year || '未标注时间').trim();
        if (!yearGroups[y]) {
            yearGroups[y] = [];
            years.push(y);
        }
        yearGroups[y].push(filteredTimeline[i]);
    }

    var foldBar = container.createEl('div', { cls: 'my-char-timeline-fold-bar' });
    foldBar.createEl('span', { text: '时间点：', cls: 'my-char-filter-label' });
    foldBar.createEl('button', { text: '▼ 全部展开', cls: 'my-char-btn-ghost my-char-btn-xs' })
        .addEventListener('click', function() {
            expandAllTimelineGroups(self, yearGroups);
            self.renderTimeline(container);
        });
    foldBar.createEl('button', { text: '▶ 全部收起', cls: 'my-char-btn-ghost my-char-btn-xs' })
        .addEventListener('click', function() {
            collapseAllTimelineGroups(self, yearGroups);
            self.renderTimeline(container);
        });
    foldBar.createEl('span', {
        text: years.length + ' 个时间点 · ' + filteredTimeline.length + ' 条事件',
        cls: 'my-char-filter-hint'
    });

    for (var yi = 0; yi < years.length; yi++) {
        (function(year, yi, records) {
        var yearExpanded = isTimelineYearExpanded(self, year, yi, years.length);
        var yearNode = container.createEl('div', { cls: 'my-char-timeline-year' });

        var yearHeader = yearNode.createEl('div', { cls: 'my-char-timeline-year-header' + (yearExpanded ? ' is-expanded' : '') });
        yearHeader.createEl('span', { text: yearExpanded ? '▼' : '▶', cls: 'my-char-timeline-toggle' });
        yearHeader.createEl('span', { text: year, cls: 'my-char-timeline-year-title' });
        yearHeader.createEl('span', { text: records.length + ' 条', cls: 'my-char-timeline-count' });
        if (records[0] && records[0].volume) {
            yearHeader.createEl('span', { text: records[0].volume, cls: 'my-char-timeline-volume' });
        }
        yearHeader.addEventListener('click', function() {
            setTimelineYearExpanded(self, year, !yearExpanded);
            self.renderTimeline(container);
        });

        if (!yearExpanded) return;

        var yearBody = yearNode.createEl('div', { cls: 'my-char-timeline-year-body' });

        var monthGroups = {};
        for (var i = 0; i < records.length; i++) {
            var m = records[i].month || '未标注';
            if (!monthGroups[m]) monthGroups[m] = [];
            monthGroups[m].push(records[i]);
        }

        var months = Object.keys(monthGroups);
        for (var mi = 0; mi < months.length; mi++) {
            (function(month, events) {
            var monthExpanded = isTimelineMonthExpanded(self, year, month, yearExpanded, events.length);
            var showMonthHeader = month !== '未标注' || months.length > 1;
            var monthNode = yearBody.createEl('div', { cls: 'my-char-timeline-month' });

            if (showMonthHeader) {
                var monthHeader = monthNode.createEl('div', { cls: 'my-char-timeline-month-header' + (monthExpanded ? ' is-expanded' : '') });
                monthHeader.createEl('span', { text: monthExpanded ? '▼' : '▶', cls: 'my-char-timeline-toggle' });
                monthHeader.createEl('span', { text: month, cls: 'my-char-timeline-month-label' });
                monthHeader.createEl('span', { text: events.length + ' 条', cls: 'my-char-timeline-count' });
                monthHeader.addEventListener('click', function() {
                    setTimelineMonthExpanded(self, year, month, !monthExpanded);
                    setTimelineYearExpanded(self, year, true);
                    self.renderTimeline(container);
                });
            } else {
                monthExpanded = true;
            }

            if (!monthExpanded) return;

            var monthBody = monthNode.createEl('div', { cls: 'my-char-timeline-month-body' });

            for (var ei = 0; ei < events.length; ei++) {
                (function(eventData) {
                var tagColor = eventData.tag ? getTagColor(self.plugin, eventData.tag) : '#4a90e2';
                var eventDiv = monthBody.createEl('div', { cls: 'my-char-timeline-event my-char-timeline-event-editable' });
                eventDiv.title = '点击编辑';
                if (eventData._lineIndex != null) {
                    eventDiv.setAttribute('data-line-index', String(eventData._lineIndex));
                }
                eventDiv.style.setProperty('--event-accent', tagColor);
                eventDiv.style.borderLeftColor = tagColor;

                var mainCol = eventDiv.createEl('div', { cls: 'my-char-timeline-event-main' });
                if (eventData.tag) {
                    var tagSpan = mainCol.createEl('span', { text: getTagLabel(self.plugin, eventData.tag), cls: 'my-char-tag-chip my-char-tag-chip-inline' });
                    tagSpan.style.background = tagColor;
                }

                var eventBody = mainCol.createEl('span', { cls: 'my-char-timeline-event-text' });
                var eventText = String(eventData.event == null ? '' : eventData.event);
                // 用文本节点渲染事件正文，避免正文中的尖括号/引号破坏布局；人物链接仍保留。
                var factionFieldName = self.plugin.settings.factionFieldName || '阵营';
                var charDataByName = {};
                var factionColorByName = {};
                (self.factions || []).forEach(function(f) { if (f && f.name && f.color) factionColorByName[f.name] = f.color; });
                var aliasToChar = {};
                var uniqueNames = [];
                self.chars.forEach(function (c) {
                    var canonical = String(c.name || '').trim();
                    if (!canonical) return;
                    charDataByName[canonical] = c;
                    var aliases = [canonical];
                    var fields = c.fields || {};
                    ALIAS_FIELD_NAMES.forEach(function (fieldName) {
                        var raw = fields[fieldName];
                        if (raw == null) return;
                        (Array.isArray(raw) ? raw : String(raw).split(/[,，、;；|\n\/]+/)).forEach(function (value) {
                            var alias = String(value || '').trim();
                            if (alias && alias !== canonical) aliases.push(alias);
                        });
                    });
                    aliases.forEach(function (alias) { if (!aliasToChar[alias]) { aliasToChar[alias] = c; uniqueNames.push(alias); } });
                });
                uniqueNames.sort(function(a,b){return b.length-a.length;});
                if (uniqueNames.length) {
                    var escapedNames = uniqueNames.map(function (name) {
                        return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    });
                    var namePattern = new RegExp(escapedNames.join('|'), 'g');
                    var cursor = 0;
                    var match;
                    while ((match = namePattern.exec(eventText)) !== null) {
                        if (match.index > cursor) eventBody.appendChild(document.createTextNode(eventText.slice(cursor, match.index)));
                        var charLink = eventBody.createEl('span', { text: match[0], cls: 'clink my-char-link rw-faction-colored-name' });
                        var matchedChar = aliasToChar[match[0]] || charDataByName[match[0]];
                        charLink.setAttribute('data-name', matchedChar ? matchedChar.name : match[0]);
                        var factionName = '';
                        if (matchedChar && matchedChar.fields) {
                            var factionFieldCandidates = [factionFieldName, '阵营', '势力', '所属势力', '所属组织'];
                            for (var fci = 0; fci < factionFieldCandidates.length; fci++) {
                                var factionRaw = matchedChar.fields[factionFieldCandidates[fci]];
                                if (factionRaw) { factionName = String(factionRaw).split(/[,，、;；|/]/)[0].trim(); if (factionName) break; }
                            }
                        }
                        var factionColor = factionColorByName[factionName];
                        if (factionColor) {
                            charLink.style.color = factionColor;
                            charLink.style.textDecorationColor = factionColor;
                            charLink.style.fontWeight = '650';
                            charLink.title = match[0] + ' · ' + factionName;
                            charLink.setAttribute('data-faction', factionName);
                        }
                        cursor = namePattern.lastIndex;
                    }
                    if (cursor < eventText.length) eventBody.appendChild(document.createTextNode(eventText.slice(cursor)));
                } else {
                    eventBody.textContent = eventText;
                }
                var eventLineCount = Math.max(Math.ceil(eventText.length / 42), (eventText.match(/\n/g) || []).length + 1);
                var clampLines = eventLineCount <= 8 ? 5 : (eventLineCount <= 16 ? 7 : (eventLineCount <= 28 ? 10 : 14));
                var isLongEvent = eventLineCount > clampLines;
                if (isLongEvent) {
                    eventBody.style.setProperty('--rw-event-lines', String(clampLines));
                    eventBody.classList.add('is-clamped');
                    var expandEventBtn = eventDiv.createEl('button', { text: '展开全文', cls: 'my-char-timeline-expand-btn' });
                    expandEventBtn.setAttribute('type', 'button');
                    expandEventBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        var expanded = eventBody.classList.toggle('is-expanded');
                        eventBody.classList.toggle('is-clamped', !expanded);
                        expandEventBtn.textContent = expanded ? '收起正文' : '展开全文';
                    });
                }

                var eventChapterNotes = normalizeChapterNotes(eventData.chapterNotes && eventData.chapterNotes.length ? eventData.chapterNotes : eventData.chapterNote);
                if (eventData.plotLine || eventChapterNotes.length) {
                    var metaCol = eventDiv.createEl('div', { cls: 'my-char-timeline-event-meta' });
                    if (eventData.plotLine) {
                        var plotText = eventData.plotLine + (eventData.plotStatus ? '(' + eventData.plotStatus + ')' : '');
                        metaCol.createEl('span', { text: plotText, cls: 'my-char-plot-chip my-char-plot-chip-vertical', title: plotText });
                    }
                    eventChapterNotes.forEach(function(chapterNote) {
                        var noteSpan = metaCol.createEl('span', { text: chapterNote, cls: 'my-char-link my-char-timeline-note-link my-char-chapter-link-vertical', title: chapterNote });
                        noteSpan.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var nm = chapterNote.match(/\[\[([^\]|]+)/);
                            if (nm) self.app.workspace.openLinkText(nm[1], '');
                        });
                    });
                }

                eventDiv.addEventListener('click', function(e) {
                    if (e.target.closest('.clink') || e.target.closest('.my-char-timeline-note-link')) return;
                    self.showEditEvent(eventData);
                });
                })(events[ei]);
            }
            })(months[mi], monthGroups[months[mi]]);
        }
        })(years[yi], yi, yearGroups[years[yi]]);
    }

    var links = container.querySelectorAll('.clink');
    for (var i = 0; i < links.length; i++) {
        (function (link) {
            link.addEventListener('click', function () {
                var name = link.getAttribute('data-name');
                var charData = null;
                for (var j = 0; j < self.chars.length; j++) {
                    if (self.chars[j].name === name) { charData = self.chars[j]; break; }
                }
                if (charData) self.showCharDetail(charData);
            });
        })(links[i]);
    }

    if (self._pendingHighlightLineIndex != null) {
        var pendingIdx = self._pendingHighlightLineIndex;
        var pendingEvt = self._pendingFocusEvent;
        self._pendingHighlightLineIndex = null;
        self._pendingFocusEvent = null;
        setTimeout(function () {
            var target = container.querySelector('[data-line-index="' + pendingIdx + '"]');
            if (target) {
                target.classList.add('is-highlight');
                if (typeof target.scrollIntoView === 'function') {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            if (pendingEvt && typeof self.showEditEvent === 'function') {
                self.showEditEvent(pendingEvt);
            }
        }, 50);
    }
};
    // ========== 生命周期视图 ==========
    MyView.prototype.renderLifecycle = function (container) {
        var self = this;
        container.empty();
        container.classList.add('my-char-scroll-section');

        container.createEl('h3', { text: '⏳ 人物生命周期', cls: 'my-char-section-title' });
        container.createEl('p', {
            text: '支持公元前/公元时间排序。出生、首次出场、死亡字段可在设置中配置。时间格式示例：公元前280年、前100年、280年、公元100年',
            cls: 'my-char-muted'
        }).style.margin = '0 0 12px';

        var toolbar = container.createEl('div', { cls: 'my-char-lifecycle-toolbar' });
        toolbar.createEl('span', { text: '排序依据：' }).style.fontSize = '12px';

        var sortSelect = toolbar.createEl('select');
        sortSelect.add(createOption('birth', '出生时间'));
        sortSelect.add(createOption('firstAppear', '首次出场'));
        sortSelect.add(createOption('death', '死亡时间'));
        sortSelect.value = this.lifecycleSortBy;
        sortSelect.addEventListener('change', function() {
            self.lifecycleSortBy = sortSelect.value;
            self.renderLifecycle(container);
        });

        var orderSelect = toolbar.createEl('select');
        orderSelect.add(createOption('asc', '从早到晚 ↑'));
        orderSelect.add(createOption('desc', '从晚到早 ↓'));
        orderSelect.value = this.lifecycleSortOrder;
        orderSelect.addEventListener('change', function() {
            self.lifecycleSortOrder = orderSelect.value;
            self.renderLifecycle(container);
        });

        var onlyDatedBtn = toolbar.createEl('button', {
            text: this.lifecycleOnlyDated ? '✓ 仅显示有时间数据' : '显示全部人物',
            cls: 'my-char-view-btn'
        });
        onlyDatedBtn.style.fontSize = '12px';
        onlyDatedBtn.addEventListener('click', function() {
            self.lifecycleOnlyDated = !self.lifecycleOnlyDated;
            self.renderLifecycle(container);
        });

        var legend = container.createEl('div', { cls: 'my-char-lifecycle-legend' });
        var legendItems = [
            { cls: 'my-char-lifecycle-marker-birth', label: '出生' },
            { cls: 'my-char-lifecycle-marker-appear', label: '首次出场' },
            { cls: 'my-char-lifecycle-marker-death', label: '死亡' }
        ];
        for (var li = 0; li < legendItems.length; li++) {
            var legItem = legend.createEl('span', { cls: 'my-char-lifecycle-legend-item' });
            var dot = legItem.createEl('span', { cls: 'my-char-lifecycle-legend-dot ' + legendItems[li].cls });
            legItem.createEl('span', { text: legendItems[li].label });
        }

        var items = [];
        var globalMin = Infinity;
        var globalMax = -Infinity;

        for (var ci = 0; ci < this.chars.length; ci++) {
            var char = this.chars[ci];
            var lc = getCharLifecycle(this, char);
            var points = [];
            if (lc.birthParsed && lc.birthParsed.sortValue !== null) points.push(lc.birthParsed.sortValue);
            if (lc.firstAppearParsed && lc.firstAppearParsed.sortValue !== null) points.push(lc.firstAppearParsed.sortValue);
            if (lc.deathParsed && lc.deathParsed.sortValue !== null) points.push(lc.deathParsed.sortValue);

            if (this.lifecycleOnlyDated && points.length === 0) continue;

            var sortKey = null;
            if (this.lifecycleSortBy === 'birth' && lc.birthParsed) sortKey = lc.birthParsed.sortValue;
            else if (this.lifecycleSortBy === 'firstAppear' && lc.firstAppearParsed) sortKey = lc.firstAppearParsed.sortValue;
            else if (this.lifecycleSortBy === 'death' && lc.deathParsed) sortKey = lc.deathParsed.sortValue;
            if (sortKey === null && points.length > 0) sortKey = points[0];
            if (sortKey === null) sortKey = this.lifecycleSortOrder === 'asc' ? Infinity : -Infinity;

            if (points.length > 0) {
                var rowMin = Math.min.apply(null, points);
                var rowMax = Math.max.apply(null, points);
                globalMin = Math.min(globalMin, rowMin);
                globalMax = Math.max(globalMax, rowMax);
            }

            items.push({ char: char, lifecycle: lc, sortKey: sortKey, points: points });
        }

        items.sort(function(a, b) {
            if (a.sortKey === b.sortKey) return a.char.name.localeCompare(b.char.name);
            return self.lifecycleSortOrder === 'asc' ? a.sortKey - b.sortKey : b.sortKey - a.sortKey;
        });

        if (items.length === 0) {
            container.createEl('p', { text: '暂无可用的时间数据，请在人物文件中填写出生/首次出场/死亡字段', cls: 'my-char-view-empty' });
            return;
        }

        if (!isFinite(globalMin) || !isFinite(globalMax)) {
            globalMin = -100;
            globalMax = 100;
        }
        if (globalMin === globalMax) {
            globalMin -= 10;
            globalMax += 10;
        }

        var range = globalMax - globalMin;
        var axis = container.createEl('div', { cls: 'my-char-lifecycle-axis' });
        var axisMarks = [globalMin, globalMin + range * 0.5, globalMax];
        for (var am = 0; am < axisMarks.length; am++) {
            var mark = axis.createEl('span', { cls: 'my-char-lifecycle-axis-label', text: formatSortValue(axisMarks[am]) });
            mark.style.left = ((axisMarks[am] - globalMin) / range * 100) + '%';
        }

        var list = container.createEl('div');
        for (var ii = 0; ii < items.length; ii++) {
            (function(entry) {
                var lc = entry.lifecycle;
                var row = list.createEl('div', { cls: 'my-char-lifecycle-row' });

                var nameEl = row.createEl('div', { text: entry.char.name, cls: 'my-char-lifecycle-name' });
                nameEl.setAttr('title', entry.char.name);
                nameEl.addEventListener('click', function() {
                    self.showCharDetail(entry.char);
                });

                var track = row.createEl('div', { cls: 'my-char-lifecycle-track' });

                if (entry.points.length > 0) {
                    var rowMinVal = Math.min.apply(null, entry.points);
                    var rowMaxVal = Math.max.apply(null, entry.points);
                    var leftPct = ((rowMinVal - globalMin) / range) * 100;
                    var widthPct = Math.max(((rowMaxVal - rowMinVal) / range) * 100, 0.5);

                    var span = track.createEl('div', { cls: 'my-char-lifecycle-span my-char-lifecycle-span-life' });
                    span.style.left = leftPct + '%';
                    span.style.width = widthPct + '%';
                    span.setAttr('title', '活跃区间');

                    function placeMarker(parsed, cls, tip) {
                        if (!parsed || parsed.sortValue === null) return;
                        var m = track.createEl('div', { cls: 'my-char-lifecycle-marker ' + cls });
                        m.style.left = ((parsed.sortValue - globalMin) / range * 100) + '%';
                        m.setAttr('title', tip + ': ' + parsed.display);
                    }
                    placeMarker(lc.birthParsed, 'my-char-lifecycle-marker-birth', '出生');
                    placeMarker(lc.firstAppearParsed, 'my-char-lifecycle-marker-appear', '首次出场');
                    placeMarker(lc.deathParsed, 'my-char-lifecycle-marker-death', '死亡');
                } else {
                    track.createEl('span', { text: '无时间数据', cls: 'my-char-muted' });
                }

                var labels = row.createEl('div', { cls: 'my-char-lifecycle-labels' });
                if (lc.birth) labels.createEl('div', { text: '🟢 ' + lc.birth });
                if (lc.firstAppear) labels.createEl('div', { text: '🔵 ' + lc.firstAppear });
                if (lc.death) labels.createEl('div', { text: '🔴 ' + lc.death });
                if (!lc.birth && !lc.firstAppear && !lc.death) labels.createEl('div', { text: '—' });
            })(items[ii]);
        }
    };

    // ========== 统计视图 ==========
    MyView.prototype.renderStatistics = function (container) {
        var self = this;
        var terms = getTermSet(this.plugin);
        container.empty();
        container.classList.add('my-char-scroll-section');

        container.createEl('h3', { text: '📊 数据统计', cls: 'my-char-section-title' });

        var statsGrid = container.createEl('div');
        statsGrid.className = 'my-char-stats-grid';

        var totalChars = this.chars.length;
        var totalEvents = this.timeline.length;
        var totalRels = this.relations.length;
        var totalFactions = this.factions.length;

        var cards = [
            { label: terms.entity, value: totalChars, icon: '👥', color: '#4a90e2' },
            { label: terms.event, value: totalEvents, icon: '📅', color: '#2ecc71' },
            { label: terms.relation, value: totalRels, icon: '🔗', color: '#e74c3c' },
            { label: terms.faction, value: totalFactions, icon: '🏰', color: '#9b59b6' }
        ];

        for (var i = 0; i < cards.length; i++) {
            var card = statsGrid.createEl('div', { cls: 'my-char-view-stat-card' });
            card.className = 'my-char-stat-card';
            card.innerHTML = '<div class="my-char-stat-icon">' + cards[i].icon + '</div>' +
                '<div class="my-char-stat-value" style="color:' + cards[i].color + ';">' + cards[i].value + '</div>' +
                '<div class="my-char-stat-label">' + escapeHtml(cards[i].label) + '</div>';
        }

        if (this.relations.length > 0) {
            container.createEl('h4', { text: '❤️ 亲密度分布', cls: 'my-char-subsection-title' });
            var intimacyCounts = {};
            for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
                intimacyCounts[INTIMACY_LEVELS[i].value] = 0;
            }
            for (var i = 0; i < this.relations.length; i++) {
                var val = this.relations[i].intimacy || 0;
                intimacyCounts[val] = (intimacyCounts[val] || 0) + 1;
            }
            
            var intimacyChart = container.createEl('div');
            intimacyChart.className = 'my-char-chart-panel';
            
            for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
                var lvl = INTIMACY_LEVELS[i];
                var cnt = intimacyCounts[lvl.value] || 0;
                if (cnt === 0 && this.relations.length === 0) continue;
                var percent = (cnt / (this.relations.length || 1)) * 100;
                var row = intimacyChart.createEl('div');
                row.className = 'my-char-chart-row';
                row.createEl('span', { text: lvl.label, cls: 'my-char-filter-label' }); row.lastChild.style.width = '60px'; row.lastChild.style.color = lvl.color;
                var bar = row.createEl('div');
                bar.className = 'my-char-chart-bar'; bar.style.background = lvl.color; bar.style.width = percent + '%'; bar.style.maxWidth = '150px';
                row.createEl('span', { text: cnt + '个', cls: 'my-char-muted' });
            }
        }

        container.createEl('h4', { text: '🏷️ 事件标签分布', cls: 'my-char-subsection-title' });
        var tagCounts = {};
        for (var i = 0; i < this.timeline.length; i++) {
            var tag = this.timeline[i].tag || '其他';
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
        
        var tagContainer = container.createEl('div');
        tagContainer.className = 'my-char-chip-list'; tagContainer.style.marginBottom = '15px';
        
        var sortedTags = Object.keys(tagCounts).sort(function(a,b) {
            return tagCounts[b] - tagCounts[a];
        });
        
        for (var i = 0; i < sortedTags.length; i++) {
            var tag = sortedTags[i];
            var cnt = tagCounts[tag];
            var percent = totalEvents > 0 ? Math.round((cnt / totalEvents) * 100) : 0;
            var tagChip = tagContainer.createEl('div');
            var tagColor = getTagColor(this.plugin, tag);
            tagChip.className = 'my-char-tag-chip'; tagChip.style.background = tagColor; tagChip.style.padding = '6px 12px'; tagChip.style.display = 'inline-flex'; tagChip.style.alignItems = 'center'; tagChip.style.gap = '6px';
            tagChip.innerHTML = getTagLabel(this.plugin, tag) + ' <strong style="font-size:14px;">' + cnt + '</strong> <span style="font-size:10px;opacity:0.8;">(' + percent + '%)</span>';
        }

        container.createEl('h4', { text: '🏆 出场排行榜', cls: 'my-char-subsection-title' });
        var sortedAppear = Object.keys(this.appearCounts).map(function(k) {
            return { name: k, count: self.appearCounts[k] || 0 };
        }).filter(function(c) { return c.count > 0; }).sort(function(a, b) { return b.count - a.count; }).slice(0, 10);

        var rankList = container.createEl('div', { cls: 'my-char-view-panel' });
        
        var medals = ['🥇', '🥈', '🥉'];
        for (var i = 0; i < sortedAppear.length; i++) {
            var row = rankList.createEl('div');
            row.className = 'my-char-rank-row';
            var medal = i < 3 ? medals[i] : (i + 1) + '.';
            var nameSpan = row.createEl('span');
            nameSpan.createEl('span', { text: medal + ' ' });
            var nameLink = nameSpan.createEl('strong', { text: sortedAppear[i].name, cls: 'my-char-view-link' });
            nameLink.addEventListener('click', (function(charName) {
                return function() {
                    var cd = self.findChar(charName);
                    if (cd) self.showCharDetail(cd);
                };
            })(sortedAppear[i].name));
            var countBadge = row.createEl('span', { text: sortedAppear[i].count + '次', cls: 'my-char-view-btn' });
            countBadge.style.fontSize = '11px';
            countBadge.style.padding = '2px 8px';
        }

        container.createEl('h4', { text: '📈 年份事件趋势', cls: 'my-char-subsection-title' });
        var yearCounts = {};
        for (var i = 0; i < this.timeline.length; i++) {
            var y = this.timeline[i].year;
            yearCounts[y] = (yearCounts[y] || 0) + 1;
        }
        var years = Object.keys(yearCounts).sort();
        var maxCount = 1;
        for (var y in yearCounts) {
            if (yearCounts[y] > maxCount) maxCount = yearCounts[y];
        }

        var chartDiv = container.createEl('div');
        chartDiv.className = 'my-char-chart-panel'; chartDiv.style.overflowX = 'auto';
        var chartInner = chartDiv.createEl('div');
        chartInner.style.minWidth = '300px';
        
        for (var i = 0; i < years.length; i++) {
            var y = years[i];
            var cnt = yearCounts[y];
            var barWidth = (cnt / maxCount) * 100;
            var row = chartInner.createEl('div');
            row.className = 'my-char-chart-row';
            row.createEl('span', { text: y, cls: 'my-char-filter-label' }); row.lastChild.style.width = '70px';
            var bar = row.createEl('div');
            bar.className = 'my-char-chart-bar'; bar.style.height = '22px'; bar.style.background = 'linear-gradient(90deg,var(--char-accent),var(--char-purple))';
            bar.style.width = Math.max(barWidth, 4) + '%';
            row.createEl('span', { text: cnt + '件', cls: 'my-char-muted' }); row.lastChild.style.minWidth = '40px';
        }

        var charsWithRelations = {};
        for (var ri = 0; ri < this.relations.length; ri++) {
            charsWithRelations[this.relations[ri].charA] = true;
            charsWithRelations[this.relations[ri].charB] = true;
        }
        var isolatedNames = [];
        for (var ci = 0; ci < this.chars.length; ci++) {
            if (!charsWithRelations[this.chars[ci].name]) isolatedNames.push(this.chars[ci].name);
        }
        if (isolatedNames.length > 0) {
            container.createEl('h4', { text: '⚠️ 孤立' + terms.entity + '（无任何' + terms.relation + '）', cls: 'my-char-subsection-title' });
            var isoPanel = container.createEl('div', { cls: 'my-char-view-panel my-char-isolated-panel' });
            isoPanel.createEl('p', { text: '共 ' + isolatedNames.length + ' 个' + terms.entity + '尚未建立' + terms.relation + '，建议补充关联。', cls: 'my-char-muted' });
            var isoList = isoPanel.createEl('div');
            isoList.className = 'my-char-chip-list';
            for (var ii = 0; ii < isolatedNames.length; ii++) {
                (function(nm) {
                    var chip = isoList.createEl('span', { text: nm, cls: 'my-char-view-link' });
                    chip.className = 'my-char-iso-chip';
                    chip.addEventListener('click', function() {
                        var cd = self.findChar(nm);
                        if (cd) self.showCharDetail(cd);
                    });
                })(isolatedNames[ii]);
            }
            var isoBtn = isoPanel.createEl('button', { text: '查看全部孤立' + terms.entity, cls: 'my-char-view-btn' });
            isoBtn.className = 'my-char-view-btn my-char-btn-sm'; isoBtn.style.marginTop = '10px';
            isoBtn.addEventListener('click', function() { self.showIsolatedChars(); });
        }

        var reportBtn = container.createEl('button', { text: '📄 导出统计报告 (Markdown)' });
        reportBtn.className = 'my-char-btn-purple my-char-btn-block';
        reportBtn.addEventListener('click', function() {
            var report = '# 关系谱统计报告\n\n';
            report += '> 生成时间：' + new Date().toLocaleString() + '\n\n';
            report += '## 数据概览\n\n';
            report += '| 类别 | 数量 |\n|------|------|\n';
            report += '| 人物 | ' + totalChars + ' |\n';
            report += '| 事件 | ' + totalEvents + ' |\n';
            report += '| 关系 | ' + totalRels + ' |\n';
            report += '| 阵营 | ' + totalFactions + ' |\n\n';
            
            report += '## 出场排行榜\n\n';
            for (var i = 0; i < sortedAppear.length; i++) {
                report += (i+1) + '. **' + sortedAppear[i].name + '** - ' + sortedAppear[i].count + '次\n';
            }
            
            report += '\n## 事件标签分布\n\n';
            for (var tag in tagCounts) {
                report += '- ' + getTagLabel(self.plugin, tag) + ': ' + tagCounts[tag] + '件\n';
            }

            if (this.relations.length > 0) {
                report += '\n## 亲密度分布\n\n';
                for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
                    var lvl = INTIMACY_LEVELS[i];
                    var cnt = intimacyCounts[lvl.value] || 0;
                    if (cnt > 0) {
                        report += '- ' + lvl.label + ': ' + cnt + '个关系\n';
                    }
                }
            }
            
            var blob = new Blob([report], { type: 'text/markdown' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'statistics-report.md';
            a.click();
            URL.revokeObjectURL(url);
            new obsidian.Notice('报告已导出');
        });
    };

    // ========== 导入导出视图 ==========

    MyView.prototype.renderImportExport = function (container) {
        var self = this;
        container.empty();
        container.classList.add('my-char-scroll-section');

        container.createEl('h3', { text: '💾 数据导入/导出', cls: 'my-char-section-title' });

        var exportDiv = container.createEl('div');
        exportDiv.className = 'my-char-panel';

        exportDiv.createEl('h4', { text: '导出数据', cls: 'my-char-subsection-title' }); exportDiv.lastChild.style.margin = '0 0 10px';

        var exportData = {
            version: '1.2.0',
            exportTime: new Date().toISOString(),
            factions: this.factions,
            relations: this.relations,
            chars: this.chars.map(function(c) {
                return { name: c.name, fields: c.fields };
            }),
            timeline: this.timeline,
            orgRelations: this.orgRelations || [],
            orgMemberships: this.orgMemberships || []
        };

        var exportJSONBtn = exportDiv.createEl('button', { text: '📄 导出为 JSON' });
        exportJSONBtn.className = 'my-char-view-btn'; exportJSONBtn.style.marginRight = '10px';
        exportJSONBtn.addEventListener('click', function() {
            exportToJSON(exportData, 'char-relation-data.json');
            new obsidian.Notice('导出成功');
        });

        var exportCSVBtn = exportDiv.createEl('button', { text: '📊 导出关系为 CSV' });
        exportCSVBtn.className = 'my-char-btn-success';
        exportCSVBtn.addEventListener('click', function() {
            var csvRows = [['人物A', '人物B', '关系类型', '亲密度', '开始时间', '结束时间', '描述']];
            for (var i = 0; i < self.relations.length; i++) {
                var r = self.relations[i];
                csvRows.push([r.charA, r.charB, r.type, r.intimacy || 0, r.startTime || '', r.endTime || '', r.desc || '']);
            }
            var csvContent = csvRows.map(function(row) {
                return row.map(function(cell) {
                    return '"' + String(cell).replace(/"/g, '""') + '"';
                }).join(',');
            }).join('\n');
            var blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'relations.csv';
            a.click();
            URL.revokeObjectURL(url);
            new obsidian.Notice('导出成功');
        });

        var settingDiv = container.createEl('div', { cls: 'my-char-panel' });
        settingDiv.createEl('h4', { text: '📚 设定集导出', cls: 'my-char-subsection-title' });
        settingDiv.createEl('p', {
            text: '将' + getTermSet(this.plugin).entity + '、' + getTermSet(this.plugin).relation + '、' + getTermSet(this.plugin).timeline + '、未回收伏笔等整合为一份文档，便于分享或归档。',
            cls: 'my-char-muted'
        }).style.margin = '0 0 10px';

        var settingBtnRow = settingDiv.createEl('div', { cls: 'my-char-btn-group' });
        settingBtnRow.createEl('button', { text: '⚡ 一键更新设定集', cls: 'my-char-view-btn' })
            .addEventListener('click', function() {
                self.loadAllData({ silent: true }).then(function() {
                    return self.updateSettingCollection();
                });
            });
        settingBtnRow.createEl('button', { text: '📄 下载设定集 Markdown', cls: 'my-char-view-btn my-char-view-btn-secondary' })
            .addEventListener('click', function() { self.exportSettingCollection(false); });
        settingBtnRow.createEl('button', { text: '💾 另存带日期副本', cls: 'my-char-btn-success' })
            .addEventListener('click', function() { self.exportSettingCollection(true); });
        settingBtnRow.createEl('button', { text: '🖨️ 打印预览', cls: 'my-char-btn-purple' })
            .addEventListener('click', function() { self.showPrintPreview(); });
        settingDiv.createEl('p', {
            text: '「一键更新」会覆盖人物文件夹下的「设定集.md」（含人物卡、关系表、Mermaid 关系图、未回收伏笔、一致性检查）。',
            cls: 'my-char-muted'
        }).style.margin = '8px 0 0';

        var snapDiv = container.createEl('div', { cls: 'my-char-panel' });
        snapDiv.createEl('h4', { text: '🧊 设定快照', cls: 'my-char-subsection-title' });
        snapDiv.createEl('p', {
            text: '按日期备份人物索引、时间线、关系与阵营到「设定快照/时间戳/」文件夹，大改设定前建议先点一次。',
            cls: 'my-char-muted'
        }).style.margin = '0 0 10px';
        var snapBtn = snapDiv.createEl('button', { text: '🧊 创建今日快照', cls: 'my-char-btn-warning' });
        snapBtn.addEventListener('click', function() {
            self.createDataSnapshot().catch(function(e) {
                showUserError('创建快照失败', e);
            });
        });
        var manageSnapBtn = snapDiv.createEl('button', { text: '📚 查看快照 / 预览 / 恢复', cls: 'my-char-btn-ghost' });
        manageSnapBtn.style.marginLeft = '8px';
        manageSnapBtn.addEventListener('click', function() { self.openSnapshotManager(); });

        var importDiv = container.createEl('div');
        importDiv.className = 'my-char-panel';

        importDiv.createEl('h4', { text: '导入数据', cls: 'my-char-subsection-title' }); importDiv.lastChild.style.margin = '0 0 10px';

        var fileInput = importDiv.createEl('input', { type: 'file', accept: '.json' });
        fileInput.style.marginBottom = '10px';

        var importBtn = importDiv.createEl('button', { text: '📂 预览并智能合并 JSON', cls: 'my-char-btn-warning' });
        importBtn.addEventListener('click', function() {
            if (!fileInput.files || fileInput.files.length === 0) {
                new obsidian.Notice('请选择 JSON 文件');
                return;
            }
            importFromJSON(fileInput.files[0], function(data) {
                var validation = validateImportData(data);
                if (!validation.ok) {
                    new obsidian.Notice('导入失败：' + validation.error);
                    return;
                }
                new ImportPreviewModal(self.app, self, data).open();
            });
        });
        var warning = importDiv.createEl('p', { text: '导入先展示预览，再按人物姓名、事件内容、阵营名称和关系双方+类型进行去重合并。默认保留现有冲突项；可选择用导入文件覆盖冲突的阵营/关系。执行前会自动创建快照。关系/阵营同步到「关系与阵营.md」。' });
        warning.className = 'my-char-muted'; warning.style.color = 'var(--color-orange, #e67e22)'; warning.style.marginTop = '10px';
    };

    // ========== 快速录入 ==========
    MyView.prototype.showQuickAddChar = function () {
        var self = this;
        var modal = new QuickAddCharModal(this.app, this.plugin, function(data) {
            novelExt.appendCharToMd(self.app, self.plugin, data.name, data.fields).then(function() {
                return self.loadAllData({ silent: true });
            }).then(function() {
                self.render();
                new obsidian.Notice('✅ 已添加人物：' + data.name);
            });
        });
        modal.open();
    };

    MyView.prototype.showQuickAddEvent = function (prefillText) {
        var self = this;
        var modal = new QuickAddEventModal(this.app, this.plugin, this, function(evt) {
            novelExt.appendEventToMd(self.app, self.plugin, evt).then(function() {
                return self.loadAllData({ silent: true });
            }).then(function() {
                return novelExt.syncFirstAppearFromEvent(self.app, self.plugin, self, evt);
            }).then(function(syncResult) {
                var notice = '✅ 已添加事件';
                var duration = 3000;
                if (syncResult && syncResult.synced && syncResult.synced.length > 0) {
                    notice = '✅ 已添加事件，并同步首次出场：' + syncResult.synced.join('、');
                    return self.loadAllData({ silent: true }).then(function() {
                        return { notice: notice, duration: duration };
                    });
                }
                if (syncResult && syncResult.mismatched && syncResult.mismatched.length > 0) {
                    var m0 = syncResult.mismatched[0];
                    notice = '✅ 已添加事件 · ⚠ ' + m0.name + ' 首次出场不一致，见仪表盘';
                    duration = 5000;
                }
                return { notice: notice, duration: duration };
            }).then(function(result) {
                self.render();
                if (result && result.notice) new obsidian.Notice(result.notice, result.duration);
            });
        }, null, null, prefillText || '');
        modal.open();
    };

    MyView.prototype.showEditEvent = function (existingEvent) {
        var self = this;
        if (existingEvent._lineIndex == null) {
            new obsidian.Notice('无法定位该事件，请刷新数据后重试');
            return;
        }
        var modal = new QuickAddEventModal(this.app, this.plugin, this, function(newEvt) {
            novelExt.updateEventInMd(self.app, self.plugin, existingEvent, newEvt).then(function(updated) {
                if (!updated) throw new Error('事件未能安全定位，未执行修改');
                return self.loadAllData({ silent: true });
            }).then(function() {
                return novelExt.syncFirstAppearFromEvent(self.app, self.plugin, self, newEvt);
            }).then(function(syncResult) {
                var notice = '✅ 已更新事件';
                var duration = 3000;
                if (syncResult && syncResult.synced && syncResult.synced.length > 0) {
                    notice = '✅ 已更新事件，并同步首次出场：' + syncResult.synced.join('、');
                    return self.loadAllData({ silent: true }).then(function() {
                        return { notice: notice, duration: duration };
                    });
                }
                if (syncResult && syncResult.mismatched && syncResult.mismatched.length > 0) {
                    var m0 = syncResult.mismatched[0];
                    notice = '✅ 已更新事件 · ⚠ ' + m0.name + ' 首次出场不一致，见仪表盘';
                    duration = 5000;
                }
                return { notice: notice, duration: duration };
            }).then(function(result) {
                self.render();
                if (result && result.notice) new obsidian.Notice(result.notice, result.duration);
            }).catch(function(err) {
                console.error('[人物关系谱系] 更新时间线事件失败：', err);
                new obsidian.Notice('❌ 事件修改失败：' + (err.message || err), 8000);
            });
        }, existingEvent, function(evt) {
            novelExt.deleteEventFromMd(self.app, self.plugin, evt).then(function(deleted) {
                if (!deleted) return false;
                return self.loadAllData({ silent: true });
            }).then(function(deleted) {
                if (!deleted) return;
                self.render();
                new obsidian.Notice('已删除事件');
            }).catch(function(err) {
                console.error('[人物关系谱系] 删除时间线事件失败：', err);
                new obsidian.Notice('❌ 删除失败，原事件未确认删除：' + (err.message || err), 8000);
            });
        });
        modal.open();
    };

    MyView.prototype.fixFirstAppearIssue = async function (issue, useTimelineValue) {
        var fieldName = this.plugin.settings.firstAppearFieldName || '首次出场';
        if (issue.type === 'missing_on_char' || (issue.type === 'mismatch' && useTimelineValue)) {
            var val = issue.suggested || issue.timelineValue;
            var ok = await novelExt.setCharFieldInMd(this.app, this.plugin, issue.charName, fieldName, val);
            if (!ok) {
                new obsidian.Notice('写入失败，未找到人物：' + issue.charName);
                return;
            }
            await this.loadAllData({ silent: true });
            this.render();
            new obsidian.Notice('✅ 已写入「' + issue.charName + '」首次出场：' + val);
        } else if (issue.type === 'mismatch') {
            var cd = this.findChar(issue.charName);
            if (cd) this.showCharDetail(cd);
            else new obsidian.Notice('未找到人物：' + issue.charName);
        } else if (issue.type === 'missing_on_timeline') {
            this.tab = 'timeline';
            this._yearSearchText = issue.charValue || '';
            this.render();
            new obsidian.Notice('请在时间线添加 [出场] 事件：' + issue.charName);
        }
    };

    MyView.prototype.fixAllMissingFirstAppear = async function () {
        var issues = novelExt.auditFirstAppearSync(this).filter(function(i) { return i.type === 'missing_on_char'; });
        if (!issues.length) {
            new obsidian.Notice('没有需要补全的首次出场');
            return;
        }
        var fieldName = this.plugin.settings.firstAppearFieldName || '首次出场';
        var count = 0;
        for (var i = 0; i < issues.length; i++) {
            var ok = await novelExt.setCharFieldInMd(this.app, this.plugin, issues[i].charName, fieldName, issues[i].suggested);
            if (ok) count++;
        }
        await this.loadAllData({ silent: true });
        this.render();
        new obsidian.Notice('✅ 已补全 ' + count + ' 个人物的首次出场');
    };

    MyView.prototype.renderPlotLineTrack = function (container, plotLineName) {
        var self = this;
        var group = novelExt.getPlotLineGroup(this.timeline, plotLineName);
        if (!group || group.events.length === 0) return;

        var trackPanel = container.createEl('div', { cls: 'my-char-plot-track-panel' });
        trackPanel.createEl('div', {
            text: '🧵 情节线：' + plotLineName + (group.isRedeemed ? '（已回收 ✓）' : '（进行中 · ' + (group.latestStatus || '未标注') + '）'),
            cls: 'my-char-plot-track-title'
        });

        var track = trackPanel.createEl('div', { cls: 'my-char-plot-track' });
        for (var i = 0; i < group.events.length; i++) {
            (function(evt, idx) {
                if (idx > 0) {
                    track.createEl('div', { cls: 'my-char-plot-track-line' });
                }
                var node = track.createEl('div', { cls: 'my-char-plot-track-node' });
                if (evt.plotStatus === '回收') node.classList.add('is-done');
                else if (evt.plotStatus === '推进') node.classList.add('is-active');
                else if (evt.plotStatus === '埋设') node.classList.add('is-seed');
                else node.classList.add('is-plain');
                var loc = evt.year + (evt.month && evt.month !== '未标注' ? '·' + evt.month : '');
                node.createEl('div', { text: loc, cls: 'my-char-plot-track-loc' });
                var statusLabel = evt.plotStatus || '—';
                node.createEl('div', { text: statusLabel, cls: 'my-char-plot-track-status' });
                var summary = evt.event.length > 18 ? evt.event.substring(0, 18) + '…' : evt.event;
                node.createEl('div', { text: summary, cls: 'my-char-plot-track-event' });
                node.title = evt.event;
                node.addEventListener('click', function() { self.showEditEvent(evt); });
            })(group.events[i], i);
        }
    };

    MyView.prototype.renderPlotWarnings = function (container, plotLineFilter) {
        var self = this;
        var allWarnings = novelExt.validatePlotLines(this.timeline);
        var warnings = plotLineFilter
            ? allWarnings.filter(function(w) { return w.plotLine === plotLineFilter; })
            : allWarnings;
        if (warnings.length === 0) return;

        var settings = this.plugin.settings;
        if (!Array.isArray(settings.plotWarningHandled)) settings.plotWarningHandled = [];
        if (!Array.isArray(settings.plotWarningHidden)) settings.plotWarningHidden = [];
        if (settings.plotWarningsCollapsed == null) settings.plotWarningsCollapsed = true;

        function warningKey(w) {
            var ev = w.event || {};
            return [w.plotLine || '', w.message || '', ev.year || '', ev.month || '', ev.event || (typeof ev === 'string' ? ev : '')].join('::');
        }
        var visibleWarnings = warnings.filter(function(w) {
            var key = warningKey(w);
            return settings.plotWarningHandled.indexOf(key) === -1 &&
                settings.plotWarningHidden.indexOf(key) === -1;
        });
        var handledCount = warnings.filter(function(w) {
            return settings.plotWarningHandled.indexOf(warningKey(w)) !== -1;
        }).length;
        var hiddenCount = warnings.filter(function(w) {
            return settings.plotWarningHidden.indexOf(warningKey(w)) !== -1;
        }).length;
        if (!visibleWarnings.length && !handledCount && !hiddenCount) return;

        var panel = container.createEl('div', { cls: 'my-char-banner my-char-banner-warn my-char-plot-warn-panel' });
        var header = panel.createEl('div', { cls: 'my-char-plot-warn-header' });
        var title = header.createEl('div', { cls: 'my-char-banner-text' });
        title.textContent = '⚠️ 伏笔逻辑提醒（' + visibleWarnings.length + ' 条）';
        var toggle = header.createEl('button', { cls: 'my-char-plot-warn-toggle' });
        toggle.textContent = settings.plotWarningsCollapsed ? '展开 ▾' : '收起 ▴';
        toggle.addEventListener('click', async function() {
            settings.plotWarningsCollapsed = !settings.plotWarningsCollapsed;
            await self.plugin.saveSettings();
            self.render();
        });

        if (settings.plotWarningsCollapsed) {
            var meta = panel.createEl('div', { cls: 'my-char-plot-warn-meta' });
            meta.textContent = visibleWarnings.length
                ? '提醒已折叠，不影响时间线数据'
                : '当前提醒均已处理或暂时隐藏';
            if (handledCount + hiddenCount > 0) {
                var manage = meta.createEl('button', { cls: 'my-char-plot-warn-link' });
                manage.textContent = '已处理 ' + handledCount + ' · 暂藏 ' + hiddenCount + '（管理）';
                manage.addEventListener('click', async function() {
                    settings.plotWarningsCollapsed = false;
                    self._showHandledPlotWarnings = true;
                    await self.plugin.saveSettings();
                    self.render();
                });
            }
            return;
        }

        var list = panel.createEl('div', { cls: 'my-char-plot-warn-list' });
        for (var wi = 0; wi < visibleWarnings.length; wi++) {
            (function(w) {
                var key = warningKey(w);
                var row = list.createEl('div', { cls: 'my-char-plot-warn-entry' });
                var message = row.createEl('div', { cls: 'my-char-plot-warn-item' + (w.severity === 'high' ? ' is-high' : '') });
                message.textContent = w.message;
                if (w.event) {
                    message.style.cursor = 'pointer';
                    message.title = '点击编辑相关事件';
                    message.addEventListener('click', function() { self.showEditEvent(w.event); });
                }
                var actions = row.createEl('div', { cls: 'my-char-plot-warn-actions' });
                var intentional = actions.createEl('button', { cls: 'my-char-plot-warn-link' });
                intentional.textContent = '标记为作者有意';
                intentional.title = '这是刻意设置的伏笔，不再作为问题提醒';
                intentional.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    if (settings.plotWarningHandled.indexOf(key) === -1) settings.plotWarningHandled.push(key);
                    await self.plugin.saveSettings();
                    self.render();
                });
                var hide = actions.createEl('button', { cls: 'my-char-plot-warn-link' });
                hide.textContent = '暂时隐藏';
                hide.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    if (settings.plotWarningHidden.indexOf(key) === -1) settings.plotWarningHidden.push(key);
                    await self.plugin.saveSettings();
                    self.render();
                });
            })(visibleWarnings[wi]);
        }
        if (!visibleWarnings.length) list.createEl('div', { text: '没有待处理提醒', cls: 'my-char-muted' });

        if (handledCount + hiddenCount > 0) {
            var history = panel.createEl('div', { cls: 'my-char-plot-warn-history' });
            history.createEl('span', { text: '已处理 ' + handledCount + ' 条 · 暂时隐藏 ' + hiddenCount + ' 条' });
            var restore = history.createEl('button', { cls: 'my-char-plot-warn-link' });
            restore.textContent = '恢复全部';
            restore.addEventListener('click', async function() {
                var keys = warnings.map(warningKey);
                settings.plotWarningHandled = settings.plotWarningHandled.filter(function(k) { return keys.indexOf(k) === -1; });
                settings.plotWarningHidden = settings.plotWarningHidden.filter(function(k) { return keys.indexOf(k) === -1; });
                await self.plugin.saveSettings();
                self.render();
            });
        }
    };

    // ========== 跳转到时间线事件并高亮 ==========
    MyView.prototype.focusTimelineEvent = function (evt) {
        if (!evt) return;
        this.tab = 'timeline';
        this._plotLineFilter = '';
        this._yearSearchText = '';
        this.selectedTag = null;
        if (evt.year) setTimelineYearExpanded(this, evt.year, true);
        if (evt.year && evt.month) setTimelineMonthExpanded(this, evt.year, evt.month, true);
        this._pendingHighlightLineIndex = (evt._lineIndex != null) ? evt._lineIndex : null;
        this._pendingFocusEvent = evt;
        this.render();
    };

    // ========== 人物详情弹窗 ==========
    MyView.prototype.showCharDetail = function (charData) {
        var self = this;
        var relatedEvents = [];
        for (var i = 0; i < this.timeline.length; i++) {
            var appeared = findCharsInEvent(this.timeline[i].event, this.charNames);
            if (appeared.indexOf(charData.name) !== -1) {
                relatedEvents.push(this.timeline[i]);
            }
        }

        var relatedChars = {};
        for (var ei = 0; ei < relatedEvents.length; ei++) {
            var othersInEvent = findCharsInEvent(relatedEvents[ei].event, this.charNames);
            for (var oi = 0; oi < othersInEvent.length; oi++) {
                var other = othersInEvent[oi];
                if (other !== charData.name) {
                    if (!relatedChars[other]) relatedChars[other] = [];
                    if (relatedChars[other].indexOf(relatedEvents[ei]) === -1) {
                        relatedChars[other].push(relatedEvents[ei]);
                    }
                }
            }
        }

        var manualRels = [];
        for (var i = 0; i < this.relations.length; i++) {
            if (this.relations[i].charA === charData.name || this.relations[i].charB === charData.name) {
                manualRels.push(this.relations[i]);
            }
        }

        new DetailModal(this.app, charData, relatedEvents, relatedChars, manualRels, this).open();
    };

    return MyView;
}(obsidian.ItemView));


// ========== 时间线可拖动人物速查弹窗 ==========
MyView.prototype.onClose = function () {
    this.hideCharFloatPanel();
};

MyView.prototype.toggleCharFloatPanel = function (forceShow) {
    if (forceShow === true) {
        this.plugin.settings.timelineFloatChars = true;
        this.plugin.saveSettings();
        this.showCharFloatPanel();
        return;
    }
    if (this._charFloatEl && this._charFloatEl.isConnected) {
        this.hideCharFloatPanel();
        this.plugin.settings.timelineFloatChars = false;
        this.plugin.saveSettings();
    } else {
        this.plugin.settings.timelineFloatChars = true;
        this.plugin.saveSettings();
        this.showCharFloatPanel();
    }
};

MyView.prototype.updateCharFloatPanel = function () {
    if (this.tab === 'timeline' && this.plugin.settings.timelineFloatChars !== false) {
        this.showCharFloatPanel();
    } else if (this.tab !== 'timeline') {
        this.hideCharFloatPanel();
    }
};

MyView.prototype.hideCharFloatPanel = function () {
    if (this._charFloatEl) {
        if (this._charFloatEl._cleanupDrag) this._charFloatEl._cleanupDrag();
        if (this._charFloatEl.parentNode) this._charFloatEl.parentNode.removeChild(this._charFloatEl);
    }
    this._charFloatEl = null;
    this._charFloatBody = null;
};

MyView.prototype.showCharFloatPanel = function () {
    var self = this;
    if (this._charFloatEl && this._charFloatEl.isConnected) {
        this.refreshCharFloatPanelBody();
        return;
    }
    var pos = this.plugin.settings.floatPanelPos || { x: 24, y: 120 };
    var panel = document.createElement('div');
    panel.className = 'my-char-float-panel';
    panel.style.left = (pos.x || 24) + 'px';
    panel.style.top = (pos.y || 120) + 'px';

    var header = document.createElement('div');
    header.className = 'my-char-float-panel-header';
    header.innerHTML = '<span>👤 人物速查</span>';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'my-char-float-close';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭（可在时间线工具栏再次打开）';
    closeBtn.addEventListener('click', function () {
        self.plugin.settings.timelineFloatChars = false;
        self.plugin.saveSettings();
        self.hideCharFloatPanel();
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var search = document.createElement('input');
    search.type = 'text';
    search.className = 'my-char-float-search';
    search.placeholder = '筛选人物…';
    search.addEventListener('input', function () {
        self._charFloatFilter = search.value.trim();
        self.refreshCharFloatPanelBody();
    });
    panel.appendChild(search);

    var body = document.createElement('div');
    body.className = 'my-char-float-panel-body';
    panel.appendChild(body);
    this._charFloatBody = body;
    this._charFloatFilter = '';

    var dragging = false;
    var ox = 0, oy = 0;
    header.addEventListener('mousedown', function (e) {
        if (e.target === closeBtn) return;
        dragging = true;
        ox = e.clientX - panel.offsetLeft;
        oy = e.clientY - panel.offsetTop;
        e.preventDefault();
    });
    var onMove = function (e) {
        if (!dragging) return;
        var x = Math.max(0, e.clientX - ox);
        var y = Math.max(0, e.clientY - oy);
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
    };
    var onUp = function () {
        if (!dragging) return;
        dragging = false;
        self.plugin.settings.floatPanelPos = {
            x: parseInt(panel.style.left, 10) || 24,
            y: parseInt(panel.style.top, 10) || 120
        };
        self.plugin.saveSettings();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    panel._cleanupDrag = function () {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    document.body.appendChild(panel);
    this._charFloatEl = panel;
    this.refreshCharFloatPanelBody();
};

MyView.prototype.refreshCharFloatPanelBody = function () {
    var self = this;
    if (!this._charFloatBody) return;
    var body = this._charFloatBody;
    body.innerHTML = '';
    var filter = (this._charFloatFilter || '').toLowerCase();
    var tabs = document.createElement('div');
    tabs.className = 'my-char-float-tabs';
    var list = this.chars || [];
    var shown = 0;
    for (var i = 0; i < list.length; i++) {
        (function (charData) {
            var name = charData.name || '';
            if (filter && name.toLowerCase().indexOf(filter) === -1) return;
            shown++;
            var tab = document.createElement('button');
            tab.className = 'my-char-float-tab';
            tab.textContent = name;
            tab.title = name;
            tab.addEventListener('click', function () {
                self.showCharDetail(charData);
            });
            tabs.appendChild(tab);
        })(list[i]);
    }
    if (shown === 0) {
        var empty = document.createElement('div');
        empty.className = 'my-char-float-empty';
        empty.textContent = '暂无匹配人物';
        body.appendChild(empty);
    } else {
        body.appendChild(tabs);
    }
};

// ========== 快速添加人物弹窗 ==========
var QuickAddCharModal = /** @class */ (function (_super) {
    __extends(QuickAddCharModal, _super);
    function QuickAddCharModal(app, plugin, onSubmit) {
        var _this = _super.call(this, app) || this;
        _this.plugin = plugin;
        _this.onSubmit = onSubmit;
        return _this;
    }
    QuickAddCharModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.className = 'my-char-modal-body';
        el.createEl('h3', { text: '+ 快速添加人物', cls: 'my-char-section-title' });
        var nameRow = el.createEl('div', { cls: 'my-char-form-row' });
        nameRow.createEl('label', { text: '姓名 *', cls: 'my-char-form-label' });
        var nameInput = nameRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        var fields = [
            { key: '类型', placeholder: '主角 / 配角 / 龙套' },
            { key: '身份', placeholder: '身份描述' },
            { key: '阵营', placeholder: '所属阵营' },
            { key: '首次出场', placeholder: '如：第一卷第三章' },
            { key: '章节笔记', placeholder: '如：[[第三章]]' }
        ];
        var inputs = {};
        for (var i = 0; i < fields.length; i++) {
            var row = el.createEl('div', { cls: 'my-char-form-row' });
            row.createEl('label', { text: fields[i].key, cls: 'my-char-form-label' });
            var inp = row.createEl('input', { type: 'text', cls: 'my-char-form-input' });
            inp.placeholder = fields[i].placeholder;
            inputs[fields[i].key] = inp;
        }
        var saveBtn = el.createEl('button', { text: '添加', cls: 'my-char-view-btn' });
        saveBtn.addEventListener('click', function() {
            if (!nameInput.value.trim()) { new obsidian.Notice('请输入姓名'); return; }
            var f = {};
            for (var k in inputs) { if (inputs[k].value.trim()) f[k] = inputs[k].value.trim(); }
            self.onSubmit({ name: nameInput.value.trim(), fields: f });
            self.close();
        });
    };
    QuickAddCharModal.prototype.onClose = function () { this.contentEl.empty(); };
    return QuickAddCharModal;
}(obsidian.Modal));

// ========== 设定集打印预览弹窗（Obsidian 内，无需浏览器弹窗）==========
var PrintPreviewModal = /** @class */ (function (_super) {
    __extends(PrintPreviewModal, _super);
    function PrintPreviewModal(app, view) {
        var _this = _super.call(this, app) || this;
        _this.view = view;
        return _this;
    }
    PrintPreviewModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.empty();
        el.className = 'my-char-modal-body my-char-print-modal';
        el.createEl('h3', { text: '🖨️ 设定集打印预览', cls: 'my-char-section-title' });
        el.createEl('p', {
            text: '在 Obsidian 内预览。点击「打印」后，在系统对话框中选择打印机或「另存为 PDF」。',
            cls: 'my-char-muted'
        }).style.margin = '0 0 10px';

        var toolbar = el.createEl('div', { cls: 'my-char-print-toolbar' });
        toolbar.createEl('button', { text: '🖨️ 打印 / 另存为 PDF', cls: 'my-char-view-btn' })
            .addEventListener('click', function() { self.triggerPrint(); });
        toolbar.createEl('button', { text: '关闭', cls: 'my-char-btn-ghost my-char-btn-sm' })
            .addEventListener('click', function() { self.close(); });

        var scroll = el.createEl('div', { cls: 'my-char-print-scroll' });
        var doc = scroll.createEl('div', { cls: 'my-char-print-doc' });
        doc.innerHTML = this.view.buildPrintPreviewBodyHtml();

        var styleEl = el.createEl('style');
        styleEl.textContent = this.view.getPrintPreviewStyles();
    };
    PrintPreviewModal.prototype.triggerPrint = function () {
        var html = this.view.buildPrintPreviewHtml();
        var iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;opacity:0;pointer-events:none;';
        document.body.appendChild(iframe);
        var iwin = iframe.contentWindow;
        var idoc = iframe.contentDocument || (iwin && iwin.document);
        if (!idoc || !iwin) {
            document.body.removeChild(iframe);
            new obsidian.Notice('打印初始化失败，请重试');
            return;
        }
        idoc.open();
        idoc.write(html);
        idoc.close();
        window.setTimeout(function() {
            try {
                iwin.focus();
                iwin.print();
            } catch (e) {
                console.error(e);
                new obsidian.Notice('打印失败：' + e.message);
            }
            window.setTimeout(function() {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 1000);
        }, 300);
    };
    PrintPreviewModal.prototype.onClose = function () {
        this.contentEl.empty();
    };
    return PrintPreviewModal;
}(obsidian.Modal));


// ========== 快照管理与安全恢复 ==========
var SnapshotManagerModal = /** @class */ (function (_super) {
    __extends(SnapshotManagerModal, _super);
    function SnapshotManagerModal(app, view) {
        var _this = _super.call(this, app) || this;
        _this.view = view;
        _this.snapshots = [];
        _this.selected = null;
        return _this;
    }
    SnapshotManagerModal.prototype.onOpen = function () { this.render(); };
    SnapshotManagerModal.prototype.render = async function () {
        var self = this, el = this.contentEl;
        el.empty();
        el.className = 'my-char-modal-body';
        el.createEl('h3', { text: '🧊 快照管理与恢复', cls: 'my-char-section-title' });
        el.createEl('p', { text: '选择快照可查看文件清单。恢复前会自动备份当前状态；恢复后逐文件回读校验。', cls: 'my-char-muted' });
        var top = el.createEl('div', { cls: 'my-char-btn-group' });
        var createBtn = top.createEl('button', { text: '＋ 创建新快照', cls: 'my-char-btn-warning' });
        createBtn.addEventListener('click', async function () {
            createBtn.disabled = true; createBtn.textContent = '正在创建…';
            try { await self.view.createDataSnapshot(); await self.render(); }
            catch (e) { showUserError('创建快照失败', e); createBtn.disabled = false; createBtn.textContent = '＋ 创建新快照'; }
        });
        var closeBtn = top.createEl('button', { text: '关闭', cls: 'my-char-btn-ghost' });
        closeBtn.addEventListener('click', function () { self.close(); });
        var body = el.createEl('div', { cls: 'my-char-snapshot-layout' }); body.style.cssText = 'display:grid;grid-template-columns:minmax(0, 0.85fr) minmax(0, 1.5fr);gap:12px;margin-top:12px;';
        var listPane = body.createEl('div'); listPane.style.cssText = 'max-height:55vh;overflow:auto;border:1px solid var(--background-modifier-border);border-radius:8px;padding:8px;';
        var detail = body.createEl('div'); detail.style.cssText = 'min-height:180px;border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;';
        listPane.createEl('div', { text: '快照列表', cls: 'my-char-subsection-title' });
        try { this.snapshots = await listVaultSnapshots(this.app, this.view.plugin); }
        catch (e) { detail.createEl('p', { text: '读取快照失败：' + (e.message || e) }); return; }
        if (!this.snapshots.length) listPane.createEl('p', { text: '暂无快照', cls: 'my-char-muted' });
        this.snapshots.forEach(function (snap) {
            var b = listPane.createEl('button', { text: (snap.valid ? '✓ ' : '⚠ ') + snap.name, cls: 'my-char-btn-ghost' });
            b.style.cssText = 'display:block;width:100%;text-align:left;margin:4px 0;white-space:normal;';
            b.addEventListener('click', function () { self.selected = snap; self.renderDetail(detail, snap); });
        });
        if (this.selected) {
            var selected = this.snapshots.find(function (x) { return x.folder === self.selected.folder; });
            if (selected) { this.selected = selected; this.renderDetail(detail, selected); }
        } else if (this.snapshots.length) {
            this.selected = this.snapshots[0]; this.renderDetail(detail, this.selected);
        } else {
            detail.createEl('p', { text: '创建快照后，这里会显示备份时间、文件清单和恢复状态。', cls: 'my-char-muted' });
        }
    };
    SnapshotManagerModal.prototype.renderDetail = function (detail, snap) {
        var self = this;
        detail.empty();
        detail.createEl('h4', { text: snap.name });
        detail.createEl('p', { text: '创建时间：' + (snap.createdAt || '未记录'), cls: 'my-char-muted' });
        detail.createEl('p', { text: snap.legacy ? '旧版快照：由 Markdown 清单解析路径' : '结构化快照：含机器可读索引', cls: 'my-char-muted' });
        detail.createEl('p', { text: '可用性：' + (snap.valid ? '路径白名单通过，可校验恢复' : '不可恢复：索引缺失、文件清单为空或路径未通过白名单'), cls: 'my-char-muted' });
        var table = detail.createEl('div'); table.style.cssText = 'max-height:26vh;overflow:auto;margin:8px 0;';
        var previewPanel = detail.createEl('div'); previewPanel.style.cssText = 'display:none;margin:8px 0;padding:10px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);';
        snap.files.forEach(function (f) {
            var fileOk = f.allowed !== false && f.present !== false && f.sizeValid !== false && f.hashValid !== false && f.contentValid !== false;
            var row = table.createEl('div'); row.style.cssText = 'font-size:11px;padding:5px 0;border-bottom:1px solid var(--background-modifier-border);word-break:break-all;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
            row.createEl('span', { text: (fileOk ? '✓ ' : '⚠ ') + f.name + ' ← ' + f.source + ' (' + (f.size || 0) + ' 字符)' + (f.contentError ? '；' + f.contentError : '') }).style.flex = '1 1 180px';
            var previewBtn = row.createEl('button', { text: '内容预览', cls: 'my-char-btn-ghost my-char-btn-xs' });
            previewBtn.disabled = !f.present || f.allowed === false;
            previewBtn.addEventListener('click', async function () {
                previewBtn.disabled = true; previewBtn.textContent = '读取中…';
                try {
                    var snapPath = snap.folder + '/' + f.name;
                    var snapshotText = await self.app.vault.adapter.read(snapPath);
                    var currentExists = await self.app.vault.adapter.exists(f.source);
                    var currentText = currentExists ? await self.app.vault.adapter.read(f.source) : null;
                    previewPanel.empty(); previewPanel.style.display = 'block';
                    previewPanel.createEl('strong', { text: '文件内容预览 · ' + f.name });
                    var status = !currentExists ? '当前文件不存在' : (currentText === snapshotText ? '当前文件与快照完全一致' : '当前文件与快照存在差异');
                    previewPanel.createEl('p', { text: status + ' · 快照 ' + snapshotText.length + ' 字符' + (currentExists ? ' · 当前 ' + currentText.length + ' 字符' : ''), cls: 'my-char-muted' });
                    var pre = previewPanel.createEl('pre'); pre.style.cssText = 'max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:11px;';
                    pre.textContent = snapshotText.length > 6000 ? snapshotText.slice(0,6000) + '\n…（内容过长，已截断）' : snapshotText;
                } catch (e) { showUserError('读取快照内容失败', e); }
                finally { previewBtn.disabled = false; previewBtn.textContent = '内容预览'; }
            });
        });
        if (snap.error) detail.createEl('p', { text: '错误：' + snap.error });
        var restore = detail.createEl('div'); restore.style.cssText = 'margin-top:12px;padding:10px;border-radius:8px;background:var(--background-secondary);';
        restore.createEl('p', { text: '恢复会覆盖快照中列出的目标文件。未包含在快照中的文件不会改变。操作前会自动创建一份当前状态快照。', cls: 'my-char-muted' });
        var input = restore.createEl('input', { type: 'text', placeholder: '输入“恢复”以启用恢复' }); input.style.cssText = 'width:100%;margin:4px 0 8px;';
        var btn = restore.createEl('button', { text: '从此快照恢复', cls: 'my-char-btn-danger' }); btn.disabled = !snap.valid;
        input.addEventListener('input', function () { btn.disabled = !snap.valid || input.value !== '恢复'; });
        btn.addEventListener('click', async function () {
            if (!snap.valid || input.value !== '恢复') return;
            if (!confirm('最后确认：将使用「' + snap.name + '」覆盖 ' + snap.files.length + ' 个文件。恢复前会创建当前状态备份。继续吗？')) return;
            btn.disabled = true; btn.textContent = '正在备份并恢复…';
            try {
                var result = await restoreVaultSnapshot(self.app, self.view.plugin, snap);
                if (self.view.plugin.loadSettings) await self.view.plugin.loadSettings();
                await self.view.loadAllData({ silent: true });
                self.view.render();
                new obsidian.Notice('✅ 恢复并校验成功；恢复前备份：' + result.backupFolder, 10000);
                self.close();
            } catch (e) {
                showUserError('快照恢复未完成', e);
                btn.disabled = false; btn.textContent = '从此快照恢复';
            }
        });
    };
    SnapshotManagerModal.prototype.onClose = function () { this.contentEl.empty(); };
    return SnapshotManagerModal;
}(obsidian.Modal));

// ========== 导入预览与智能合并 ==========
var ImportPreviewModal = /** @class */ (function (_super) {
    __extends(ImportPreviewModal, _super);
    function ImportPreviewModal(app, view, data) {
        var _this = _super.call(this, app) || this;
        _this.view = view; _this.data = data; _this.overwriteConflicts = false;
        return _this;
    }
    ImportPreviewModal.prototype.onOpen = function () { this.render(); };
    ImportPreviewModal.prototype.render = function () {
        var self = this, el = this.contentEl;
        el.empty(); el.className = 'my-char-modal-body my-char-import-preview';
        el.createEl('h3', { text: '📥 导入预览与智能合并', cls: 'my-char-section-title' });
        el.createEl('p', { text: '先比较导入文件与当前 Vault 数据。默认只新增缺失项目、跳过重复项，并保留冲突中的现有内容。', cls: 'my-char-muted' });
        var overwriteRow = el.createEl('label'); overwriteRow.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:10px 0;padding:10px;border:1px solid var(--background-modifier-border);border-radius:8px;';
        var overwrite = overwriteRow.createEl('input', { type: 'checkbox' }); overwrite.checked = !!this.overwriteConflicts;
        overwriteRow.createEl('span', { text: '阵营/关系遇到同名或同一关系键但内容不同时，以导入文件覆盖现有项目（人物档案冲突仍保留现有内容）' });
        overwrite.addEventListener('change', function () { self.overwriteConflicts = overwrite.checked; self.render(); });
        var plan = buildSmartImportPlan(this.view, this.data, this.overwriteConflicts); this.plan = plan;
        var grid = el.createEl('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0;';
        [['新增/更新阵营',plan.counts.factions],['新增/更新关系',plan.counts.relations],['新增人物',plan.counts.chars],['新增事件',plan.counts.timeline],['冲突待处理',plan.counts.conflicts],['重复跳过',plan.counts.duplicates]].forEach(function(pair) {
            var card = grid.createEl('div'); card.style.cssText = 'padding:10px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);';
            card.createEl('div', { text: String(pair[1]), cls: 'my-char-section-title' }).style.fontSize = '20px';
            card.createEl('div', { text: pair[0], cls: 'my-char-muted' });
        });
        var detail = el.createEl('div'); detail.style.cssText = 'max-height:34vh;overflow:auto;border:1px solid var(--background-modifier-border);border-radius:8px;padding:10px;';
        detail.createEl('strong', { text: '冲突与重复明细' });
        if (!plan.conflicts.length && !plan.duplicates.length) detail.createEl('p', { text: '没有发现冲突或重复项目。', cls: 'my-char-muted' });
        plan.conflicts.slice(0,80).forEach(function(c) { detail.createEl('p', { text: '⚠ ' + c.type + '：' + c.key + (c.note ? ' · ' + c.note : ''), cls: 'my-char-muted' }); });
        plan.duplicates.slice(0,80).forEach(function(d) { detail.createEl('p', { text: '↪ 跳过 ' + d, cls: 'my-char-muted' }); });
        plan.warnings.slice(0,80).forEach(function(w) { detail.createEl('p', { text: 'ⓘ ' + w, cls: 'my-char-muted' }); });
        if (plan.conflicts.length + plan.duplicates.length + plan.warnings.length > 160) detail.createEl('p', { text: '仅显示前 160 条明细。', cls: 'my-char-muted' });
        var incoming = el.createEl('div'); incoming.style.cssText = 'max-height:24vh;overflow:auto;margin-top:10px;padding:10px;border:1px solid var(--background-modifier-border);border-radius:8px;';
        incoming.createEl('strong', { text: '本次将写入的内容预览' });
        var previewItems = [];
        plan.chars.forEach(function(x) { previewItems.push('人物 · ' + x.name); });
        plan.timeline.forEach(function(x) { previewItems.push('事件 · ' + x.year + ' · ' + x.event); });
        plan.orgMemberships.forEach(function(x) { previewItems.push('组织任职 · '+x.character+' · '+x.organization+' · '+(x.type||'加入')); });
        plan.mergedFactions.forEach(function(x) { if (plan.factions.indexOf(x) !== -1) previewItems.push('阵营 · ' + x.name); });
        plan.mergedRelations.forEach(function(x) { if (plan.relations.indexOf(x) !== -1) previewItems.push('关系 · ' + x.charA + ' ↔ ' + x.charB + ' · ' + (x.type || '关系')); });
        if (!previewItems.length) incoming.createEl('p', { text: '没有需要写入的新内容。', cls: 'my-char-muted' });
        previewItems.slice(0,100).forEach(function(x) { incoming.createEl('div', { text: '＋ ' + x, cls: 'my-char-muted' }).style.cssText = 'padding:3px 0;'; });
        if (previewItems.length > 100) incoming.createEl('p', { text: '另有 ' + (previewItems.length - 100) + ' 项未展开。', cls: 'my-char-muted' });
        var actions = el.createEl('div'); actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;';
        actions.createEl('button', { text: '取消', cls: 'my-char-btn-ghost' }).addEventListener('click', function() { self.close(); });
        var apply = actions.createEl('button', { text: '🛡️ 创建快照并执行合并', cls: 'my-char-btn-success' });
        var total = plan.counts.factions + plan.counts.relations + plan.counts.chars + plan.counts.timeline + plan.counts.orgMemberships;
        apply.disabled = total === 0;
        apply.addEventListener('click', async function() {
            if (!confirm('将新增/更新 ' + total + ' 项，跳过 ' + plan.counts.duplicates + ' 项重复内容。执行前会创建快照。继续吗？')) return;
            apply.disabled = true; apply.textContent = '正在备份并合并…';
            var backup = null;
            try {
                backup = await createVaultSnapshot(self.app, self.view.plugin);
                for (var ci = 0; ci < plan.chars.length; ci++) await appendCharToMd(self.app, self.view.plugin, plan.chars[ci].name, plan.chars[ci].fields || {});
                for (var ti = 0; ti < plan.timeline.length; ti++) await appendEventToMd(self.app, self.view.plugin, plan.timeline[ti]);
                self.view.factions = plan.mergedFactions;
                self.view.relations = plan.mergedRelations;
                self.view.orgMemberships = normalizeOrgMemberships((self.view.orgMemberships||[]).concat(plan.orgMemberships||[]));
                await self.view.saveFactionsAndRelations();
                await self.view.loadAllData({ silent: true }); self.view.render();
                new obsidian.Notice('✅ 智能合并完成：新增人物 ' + plan.counts.chars + '、事件 ' + plan.counts.timeline + '、阵营 ' + plan.counts.factions + '、关系 ' + plan.counts.relations + '、组织任职履历 ' + plan.counts.orgMemberships + '。导入前快照：' + backup.folder, 10000);
                self.close();
            } catch (e) {
                var rollbackMessage = '';
                if (backup) {
                    try {
                        var snaps = await listVaultSnapshots(self.app, self.view.plugin);
                        var backupItem = snaps.find(function(x) { return x.folder === backup.folder; });
                        if (backupItem && backupItem.valid) { await restoreVaultSnapshot(self.app, self.view.plugin, backupItem); await self.view.loadAllData({ silent: true }); self.view.render(); rollbackMessage = '；已尝试回滚到导入前快照'; }
                    } catch (rollbackError) { rollbackMessage = '；自动回滚失败，请从快照管理恢复：' + backup.folder + '；' + (rollbackError.message || rollbackError); }
                }
                showUserError('智能合并未完成', new Error((e.message || e) + rollbackMessage + (backup ? '。导入前快照：' + backup.folder : '')));
                apply.disabled = false; apply.textContent = '🛡️ 创建快照并执行合并';
            }
        });
    };
    ImportPreviewModal.prototype.onClose = function () { this.contentEl.empty(); };
    return ImportPreviewModal;
}(obsidian.Modal));

// Story designs are independent, addressable plans. Legacy chapter-keyed objects are
// normalized on read so older vault data remains usable without a destructive migration.
function rwGetStoryDesignEntries(evt) {
    var raw = evt && evt.storyDesigns;
    if (Array.isArray(raw)) return raw.map(function (d, i) { return Object.assign({ id: 'design-' + i, title: '方案 ' + (i + 1), chapter: '', content: '' }, d || {}); });
    if (!raw || typeof raw !== 'object') return [];
    return Object.keys(raw).map(function (key, i) {
        var d = raw[key] || {};
        return {
            id: d.id || ('legacy-' + encodeURIComponent(key)),
            title: d.title || ('方案 ' + (i + 1)),
            chapter: d.chapter || key,
            content: d.content || '',
            updatedAt: d.updatedAt || ''
        };
    });
}
function rwPackStoryDesignEntries(entries) {
    var out = {};
    (entries || []).forEach(function (d) { if (d && d.id) out[d.id] = { id: d.id, title: d.title || '未命名方案', chapter: d.chapter || '', content: d.content || '', updatedAt: d.updatedAt || '' }; });
    return out;
}

// ========== 按章节记录事件故事设计 ==========
var StoryDesignModal = /** @class */ (function (_super) {
    __extends(StoryDesignModal, _super);
    function StoryDesignModal(app, plugin, view, eventData, designId, chapterRef) {
        var _this = _super.call(this, app) || this;
        _this.plugin = plugin; _this.view = view; _this.eventData = eventData; _this.designId = designId || null; _this.chapterRef = chapterRef || ''; 
        return _this;
    }
    StoryDesignModal.prototype.onOpen = function () {
        var self = this, el = this.contentEl, evt = this.eventData;
        el.className = 'my-char-modal-body';
        el.createEl('h3', { text: '✦ 故事线设计', cls: 'my-char-section-title' });
        el.createEl('p', { text: '同一事件可以建立多份独立方案。每份方案都可关联章节；章节侧边栏与故事大纲读取同一份设计资料。', cls: 'my-char-muted' });
        var entries = rwGetStoryDesignEntries(evt);
        var activeId = this.designId || (entries[0] && entries[0].id) || '';
        var defaultChapter = this.chapterRef || normalizeChapterNotes(evt.chapterNotes && evt.chapterNotes.length ? evt.chapterNotes : evt.chapterNote)[0] || '';
        if (!activeId && defaultChapter) { activeId = 'design-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); entries.push({ id: activeId, title: '新方案', chapter: defaultChapter, content: '' }); }
        var selectorRow = el.createEl('div', { cls: 'my-char-form-row' });
        selectorRow.createEl('label', { text: '设计方案', cls: 'my-char-form-label' });
        var selector = selectorRow.createEl('select', { cls: 'my-char-form-input' });
        function refreshSelector() {
            selector.empty();
            entries.forEach(function (d) { selector.createEl('option', { text: (d.title || '未命名方案') + (d.chapter ? ' · ' + d.chapter : ''), attr: { value: d.id } }); });
            if (activeId && entries.some(function (d) { return d.id === activeId; })) selector.value = activeId;
        }
        var titleRow = el.createEl('div', { cls: 'my-char-form-row' }); titleRow.createEl('label', { text: '方案名称', cls: 'my-char-form-label' });
        var titleInput = titleRow.createEl('input', { type: 'text', cls: 'my-char-form-input', attr: { placeholder: '例如：正面冲突版／暗线揭露版' } });
        var chapterRow = el.createEl('div', { cls: 'my-char-form-row' }); chapterRow.createEl('label', { text: '对应章节（可选）', cls: 'my-char-form-label' });
        var chapterInput = chapterRow.createEl('input', { type: 'text', cls: 'my-char-form-input', attr: { placeholder: '例如：[[第十二章]]' } });
        var designRow = el.createEl('div', { cls: 'my-char-form-row' }); designRow.createEl('label', { text: '设计内容', cls: 'my-char-form-label' });
        var designInput = designRow.createEl('textarea', { cls: 'my-char-form-input' }); designInput.rows = 10;
        designInput.placeholder = '记录事件如何呈现、埋下或推进的伏笔、冲突转折、人物反应与关系变化等。内容可自由组织。';
        function loadActive() {
            var d = entries.filter(function (x) { return x.id === activeId; })[0];
            titleInput.value = d ? d.title || '' : '';
            chapterInput.value = d ? d.chapter || '' : '';
            designInput.value = d ? d.content || '' : '';
        }
        refreshSelector(); loadActive();
        selector.addEventListener('change', function () { activeId = selector.value; loadActive(); });
        var actions = el.createEl('div', { cls: 'my-char-form-actions' });
        var add = actions.createEl('button', { text: '＋ 新建方案', cls: 'my-char-btn-ghost' });
        add.addEventListener('click', function () {
            activeId = 'design-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
            entries.push({ id: activeId, title: '新方案 ' + (entries.length + 1), chapter: chapterInput.value.trim() || defaultChapter, content: '' });
            refreshSelector(); loadActive(); titleInput.focus();
        });
        var remove = actions.createEl('button', { text: '删除此方案', cls: 'my-char-btn-ghost' });
        remove.addEventListener('click', function () {
            if (!activeId || !confirmDestructiveAction('删除这份故事设计？', '只删除当前方案，不会删除时间线事件。')) return;
            entries = entries.filter(function (d) { return d.id !== activeId; });
            activeId = entries[0] ? entries[0].id : '';
            refreshSelector(); loadActive();
        });
        var save = actions.createEl('button', { text: '💾 保存设计', cls: 'my-char-view-btn' }); save.style.flex = '1';
        save.addEventListener('click', async function () {
            if (!activeId) { activeId = 'design-' + Date.now().toString(36); entries.push({ id: activeId }); }
            var idx = entries.findIndex(function (d) { return d.id === activeId; });
            var item = { id: activeId, title: titleInput.value.trim() || '未命名方案', chapter: chapterInput.value.trim(), content: designInput.value, updatedAt: new Date().toISOString() };
            if (idx >= 0) entries[idx] = item; else entries.push(item);
            try {
                await rwSaveEventStoryDesign(self.plugin, evt, rwPackStoryDesignEntries(entries));
                await self.view.loadAllData({ silent: true }); self.view.render();
                new obsidian.Notice('故事线设计已保存，可在章节情况与故事大纲中查看'); self.close();
            } catch (e) { showUserError('保存故事线设计失败', e); }
        });
        var cancel = actions.createEl('button', { text: '关闭', cls: 'my-char-btn-ghost' }); cancel.addEventListener('click', function () { self.close(); });
        setTimeout(function () { rwHighlightCharacterMentions(el, self.view); }, 60);
    };
    StoryDesignModal.prototype.onClose = function () { this.contentEl.empty(); };
    return StoryDesignModal;
}(obsidian.Modal));

// ========== 快速添加/编辑事件弹窗 ==========
var QuickAddEventModal = /** @class */ (function (_super) {
    __extends(QuickAddEventModal, _super);
    function QuickAddEventModal(app, plugin, view, onSubmit, existingEvent, onDelete, prefillText) {
        var _this = _super.call(this, app) || this;
        _this.plugin = plugin;
        _this.view = view;
        _this.onSubmit = onSubmit;
        _this.existingEvent = existingEvent || null;
        _this.onDelete = onDelete || null;
        _this.prefillText = prefillText || '';
        return _this;
    }
    QuickAddEventModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.className = 'my-char-modal-body';
        var isEdit = !!this.existingEvent;
        var evt = this.existingEvent;
        el.createEl('h3', { text: isEdit ? '✏️ 编辑事件' : '+ 快速添加事件', cls: 'my-char-section-title' });
        var mode = this.plugin.settings.timelineMode || 'auto';
        var volumeInput, yearInput, monthInput;
        if (mode === 'chapter' || mode === 'auto') {
            var volRow = el.createEl('div', { cls: 'my-char-form-row' });
            volRow.createEl('label', { text: '卷/部（可选）', cls: 'my-char-form-label' });
            volumeInput = volRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
            volumeInput.placeholder = '如：第一卷·北境';
            if (isEdit && evt.volume) volumeInput.value = evt.volume;
        }
        var yearRow = el.createEl('div', { cls: 'my-char-form-row' });
        yearRow.createEl('label', { text: mode === 'chapter' ? '章节定位（可选）' : '章节/时间分组（可选）', cls: 'my-char-form-label' });
        yearInput = yearRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        yearInput.placeholder = mode === 'chapter' ? '第三章；暂不关联章节可留空' : '如：第三章 / 公元前300年；暂不定位可留空';
        if (isEdit && evt.year !== UNLOCATED_CHAPTER_GROUP) yearInput.value = evt.year || '';
        var monthRow = el.createEl('div', { cls: 'my-char-form-row' });
        monthRow.createEl('label', { text: '场景/月份（可选）', cls: 'my-char-form-label' });
        monthInput = monthRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        if (isEdit && evt.month && evt.month !== '未标注') monthInput.value = evt.month;
        var storyTimeRow = el.createEl('div', { cls: 'my-char-form-row' });
        storyTimeRow.createEl('label', { text: '故事内时间（可选）', cls: 'my-char-form-label' });
        var storyTimeInput = storyTimeRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        storyTimeInput.placeholder = '如：公元前300年、夏末、第三日；不确定可留空';
        if (isEdit && evt.storyYear) storyTimeInput.value = evt.storyYear;
        var tagRow = el.createEl('div', { cls: 'my-char-form-row' });
        tagRow.createEl('label', { text: '标签', cls: 'my-char-form-label' });
        var tagSelect = tagRow.createEl('select', { cls: 'my-char-select' });
        tagSelect.createEl('option', { text: '（无）', value: '' });
        var tags = getEventTags(this.plugin);
        for (var ti = 0; ti < tags.length; ti++) {
            var topt = tagSelect.createEl('option', { text: tags[ti].label, value: tags[ti].value });
            if (isEdit && evt.tag === tags[ti].value) topt.selected = true;
        }
        var appearHint = tagRow.createEl('div', { cls: 'my-char-muted' });
        appearHint.style.cssText = 'font-size:12px;margin-top:4px;display:none;';
        var fieldLabel = this.plugin.settings.firstAppearFieldName || '首次出场';
        function updateAppearHint() {
            if (novelExt.isAppearTimelineTag(tagSelect.value)) {
                appearHint.textContent = '💡 [出场] 标签会写入事件内提及人物的「' + fieldLabel + '」字段';
                appearHint.style.display = 'block';
            } else {
                appearHint.style.display = 'none';
            }
        }
        updateAppearHint();
        tagSelect.addEventListener('change', updateAppearHint);
        var eventRow = el.createEl('div', { cls: 'my-char-form-row' });
        eventRow.createEl('label', { text: '事件内容 *', cls: 'my-char-form-label' });
        var eventInput = eventRow.createEl('textarea', { cls: 'my-char-form-input' });
        eventInput.rows = 3;
        if (isEdit) eventInput.value = evt.event || '';
        else if (this.prefillText) eventInput.value = this.prefillText;
        var plotRow = el.createEl('div', { cls: 'my-char-form-row' });
        plotRow.createEl('label', { text: '情节线', cls: 'my-char-form-label' });
        var plotInput = plotRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        plotInput.placeholder = '如：主线-A、感情线';
        if (isEdit && evt.plotLine) plotInput.value = evt.plotLine;
        var statusRow = el.createEl('div', { cls: 'my-char-form-row' });
        statusRow.createEl('label', { text: '伏笔状态', cls: 'my-char-form-label' });
        var statusSelect = statusRow.createEl('select', { cls: 'my-char-select' });
        statusSelect.createEl('option', { text: '（无）', value: '' });
        for (var si = 0; si < novelExt.PLOT_STATUSES.length; si++) {
            var sopt = statusSelect.createEl('option', { text: novelExt.PLOT_STATUSES[si], value: novelExt.PLOT_STATUSES[si] });
            if (isEdit && evt.plotStatus === novelExt.PLOT_STATUSES[si]) sopt.selected = true;
        }
        var noteRow = el.createEl('div', { cls: 'my-char-form-row' });
        noteRow.createEl('label', { text: '关联章节（可选，可多个）', cls: 'my-char-form-label' });
        var noteInput = noteRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        noteInput.placeholder = '[[第一章]]、[[第五章]]；也可以暂时留空';
        if (isEdit) noteInput.value = normalizeChapterNotes(evt.chapterNotes && evt.chapterNotes.length ? evt.chapterNotes : evt.chapterNote).join('、');
        if (isEdit) {
            var designRow = el.createEl('div', { cls: 'my-char-form-row' });
            designRow.createEl('label', { text: '章节化故事构思', cls: 'my-char-form-label' });
            var designBtn = designRow.createEl('button', { text: '✦ 打开故事设计', cls: 'my-char-btn-ghost' });
            var designCount = rwGetStoryDesignEntries(evt).length;
            designBtn.title = designCount ? '已有 ' + designCount + ' 个章节设计' : '按章节记录这个事件的构思';
            designBtn.addEventListener('click', function () { new StoryDesignModal(self.app, self.plugin, self.view, evt).open(); });
            if (designCount) designRow.createEl('span', { text: '已有 ' + designCount + ' 份方案', cls: 'my-char-muted' });
        }

        var btnRow = el.createEl('div', { cls: 'my-char-form-actions' });
        var saveBtn = btnRow.createEl('button', { text: isEdit ? '💾 保存修改' : '添加到时间线', cls: 'my-char-view-btn' });
        saveBtn.style.flex = '1';
        saveBtn.addEventListener('click', function() {
            if (!eventInput.value.trim()) {
                new obsidian.Notice('请填写事件内容');
                return;
            }
            self.onSubmit({
                volume: volumeInput ? volumeInput.value.trim() : '',
                year: yearInput.value.trim() || UNLOCATED_CHAPTER_GROUP,
                storyYear: storyTimeInput.value.trim(),
                month: monthInput.value.trim() || '未标注',
                tag: tagSelect.value,
                event: eventInput.value.trim(),
                eventId: (isEdit && evt.eventId) ? evt.eventId : createTimelineEventId(),
                chapterNotes: normalizeChapterNotes(noteInput.value),
                plotLine: plotInput.value.trim(),
                plotStatus: statusSelect.value,
                chapterNote: normalizeChapterNotes(noteInput.value)[0] || '',
                storyDesigns: (isEdit && evt.storyDesigns) ? evt.storyDesigns : {}
            });
            self.close();
        });
        if (isEdit && this.onDelete) {
            var deleteBtn = btnRow.createEl('button', { text: '🗑 删除', cls: 'my-char-btn-danger my-char-btn-sm' });
            deleteBtn.addEventListener('click', function() {
                if (confirmDestructiveAction('删除这条时间线事件？', '时间线 Markdown 中对应事件行将被删除。')) {
                    self.onDelete(self.existingEvent);
                    self.close();
                }
            });
        }
    };
    QuickAddEventModal.prototype.onClose = function () { this.contentEl.empty(); };
    return QuickAddEventModal;
}(obsidian.Modal));

// ========== 组织关系模型（3.9.8） ==========
var ORG_RELATION_TYPES = ['联盟', '敌对', '附属', '从属', '中立', '竞争'];
function createOrgRelationId() {
    return 'orgrel-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
function normalizeOrgRelations(items) {
    var seenIds = Object.create(null);
    return (Array.isArray(items) ? items : []).filter(function(r) {
        return r && typeof r === 'object' && r.from && r.to && r.from !== r.to;
    }).map(function(r) {
        var id = r.id ? String(r.id) : '';
        if (!id || seenIds[id]) id = createOrgRelationId();
        seenIds[id] = true;
        return {
            id: id, from: String(r.from), to: String(r.to),
            type: ORG_RELATION_TYPES.indexOf(r.type) >= 0 ? r.type : '联盟',
            startTime: String(r.startTime || ''), endTime: String(r.endTime || ''),
            desc: String(r.desc || ''), createdAt: r.createdAt || ''
        };
    });
}
function compareOrgRelationTime(a, b) {
    var av = getTimeSortValue(a.startTime), bv = getTimeSortValue(b.startTime);
    if (av !== null && bv !== null && av !== bv) return av - bv;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''), 'zh-CN');
}
// 组织关系一律以事件线的 currentTimePoint（当前写作进度）为准。
// 返回 current / history / future / unknown；不受时间过滤开关影响。
function classifyOrgRelationAtProgress(relation, progressText) {
    var progress = parseHistoricalDate(progressText || '');
    if (!progress || progress.sortValue == null) return 'unknown';
    var startText = String(relation && relation.startTime || '').trim();
    var endText = String(relation && relation.endTime || '').trim();
    var start = startText ? parseHistoricalDate(startText) : null;
    var end = endText ? parseHistoricalDate(endText) : null;
    function compatible(a, b) {
        if (!a || !b || a.sortValue == null || b.sortValue == null) return false;
        if (a.era === 'chapter' || b.era === 'chapter') return a.era === 'chapter' && b.era === 'chapter';
        if (a.era === 'modern' || b.era === 'modern') return a.era === 'modern' && b.era === 'modern';
        return true; // 公元前与公元后可按时间线的正负年份比较
    }
    if (startText && !compatible(start, progress)) return 'unknown';
    if (endText && !compatible(end, progress)) return 'unknown';
    if (startText && endText && !compatible(start, end)) return 'unknown';
    if (start && end && start.sortValue > end.sortValue) return 'unknown';
    if (end && end.sortValue < progress.sortValue) return 'history';
    if (!start) return 'unknown';
    if (start.sortValue > progress.sortValue) return 'future';
    return 'current';
}

// ========== 人物组织任职履历（3.9.9） ==========
var ORG_MEMBERSHIP_TYPES = ['加入', '任职', '晋升', '调任', '退出', '被逐', '叛变', '投诚', '组织解散', '其他'];
function createOrgMembershipId() {
    return 'orgmem-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
function normalizeOrgMemberships(items) {
    var seen = Object.create(null);
    return (Array.isArray(items) ? items : []).filter(function(r) {
        return r && typeof r === 'object' && String(r.character || '').trim() && String(r.organization || '').trim();
    }).map(function(r) {
        var id = r.id ? String(r.id) : '';
        if (!id || seen[id]) id = createOrgMembershipId();
        seen[id] = true;
        return {
            id: id, character: String(r.character), organization: String(r.organization),
            type: ORG_MEMBERSHIP_TYPES.indexOf(r.type) >= 0 ? r.type : '加入',
            position: String(r.position || ''), startTime: String(r.startTime || ''),
            endTime: String(r.endTime || ''), reason: String(r.reason || ''),
            linkedEvent: String(r.linkedEvent || ''), notes: String(r.notes || ''),
            createdAt: r.createdAt || ''
        };
    });
}
function classifyOrgMembershipAtProgress(record, progressText) {
    var state = classifyOrgRelationAtProgress({ startTime: record.startTime, endTime: record.endTime }, progressText);
    // 阵营被删除时，关联履历标记为「组织解散」；不应继续显示在当前任职分组。
    if (record && record.type === '组织解散' && state === 'current') return 'history';
    return state;
}

var OrgMembershipModal = /** @class */ (function (_super) {
    __extends(OrgMembershipModal, _super);
    function OrgMembershipModal(app, character, factions, record, onSubmit) {
        var _this = _super.call(this, app) || this;
        _this.character = character; _this.factions = factions || []; _this.record = record || null; _this.onSubmit = onSubmit;
        return _this;
    }
    OrgMembershipModal.prototype.onOpen = function() {
        var self = this, el = this.contentEl, r = this.record || {};
        el.addClass('my-char-modal-body'); el.style.cssText = 'padding:18px;max-height:78vh;overflow:auto;';
        el.createEl('h3', {text: this.record ? '编辑组织任职履历' : '新增组织任职履历'});
        el.createEl('p', {text:'时间格式沿用事件线；状态按全局当前写作进度自动计算。历史记录不会覆盖人物原有阵营字段。',cls:'my-char-muted'});
        function field(label, value, placeholder) {
            var row=el.createEl('div',{cls:'my-char-form-row'}); row.createEl('label',{text:label,cls:'my-char-form-label'});
            var input=row.createEl('input',{type:'text'}); input.value=value||''; input.placeholder=placeholder||'';
            input.style.cssText='width:100%;min-width:0;padding:8px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:var(--text-normal);box-sizing:border-box;'; return input;
        }
        function select(label, value, options) {
            var row=el.createEl('div',{cls:'my-char-form-row'}); row.createEl('label',{text:label,cls:'my-char-form-label'});
            var input=row.createEl('select'); options.forEach(function(v){var op=input.createEl('option',{text:v});op.value=v;}); input.value=value||options[0];
            input.style.cssText='width:100%;padding:8px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:var(--text-normal);'; return input;
        }
        var orgNames=this.factions.map(function(f){return f.name;});
        if (r.organization && orgNames.indexOf(r.organization)<0) orgNames.unshift(r.organization);
        if (!orgNames.length) orgNames=['（请先建立组织/阵营）'];
        var org=select('所属组织',r.organization,orgNames);
        var type=select('履历类型',r.type,ORG_MEMBERSHIP_TYPES);
        var position=field('职位 / 身份',r.position,'如：外门弟子、长老、统领');
        var start=field('开始时间',r.startTime,'例如：公元前221年 / 第三章');
        var end=field('结束时间',r.endTime,'尚未离开可留空');
        var reason=field('变动原因',r.reason,'如：主动退出、被逐、策反');
        var linked=field('关联事件（可选）',r.linkedEvent,'填写事件名称或事件线原文关键词');
        var notes=el.createEl('textarea'); notes.value=r.notes||''; notes.placeholder='补充说明'; notes.rows=3; notes.style.cssText='width:100%;box-sizing:border-box;margin-top:8px;';
        el.createEl('label',{text:'备注',cls:'my-char-form-label'});
        var actions=el.createEl('div',{cls:'my-char-btn-group'}); actions.style.cssText='justify-content:flex-end;margin-top:14px;';
        actions.createEl('button',{text:'保存',cls:'my-char-view-btn'}).addEventListener('click',function(){
            if(!org.value || org.value.indexOf('请先建立')>=0){new obsidian.Notice('请先建立组织/阵营');return;}
            if(start.value.trim() && end.value.trim() && timesAreComparable(start.value.trim(),end.value.trim()) && getTimeSortValue(start.value.trim())>getTimeSortValue(end.value.trim())){new obsidian.Notice('结束时间不能早于开始时间');return;}
            self.onSubmit({id:r.id||createOrgMembershipId(),character:self.character,organization:org.value,type:type.value,position:position.value.trim(),startTime:start.value.trim(),endTime:end.value.trim(),reason:reason.value.trim(),linkedEvent:linked.value.trim(),notes:notes.value.trim(),createdAt:r.createdAt||new Date().toISOString()});
            self.close();
        });
        actions.createEl('button',{text:'取消',cls:'my-char-btn-ghost'}).addEventListener('click',function(){self.close();});
    };
    OrgMembershipModal.prototype.onClose=function(){this.contentEl.empty();};
    return OrgMembershipModal;
}(obsidian.Modal));

var OrgRelationModal = /** @class */ (function (_super) {
    __extends(OrgRelationModal, _super);
    function OrgRelationModal(app, factions, relation, onSubmit) {
        var _this = _super.call(this, app) || this;
        _this.factions = factions || [];
        _this.relation = relation || null;
        _this.onSubmit = onSubmit;
        return _this;
    }
    OrgRelationModal.prototype.onOpen = function() {
    var self = this, el = this.contentEl, r = this.relation || {};
    el.addClass('my-char-modal-body'); el.style.cssText = 'padding:18px;max-height:78vh;overflow:auto;';
    el.createEl('h3', {text: this.relation ? '编辑组织关系' : '建立组织关系'});
    el.createEl('p', {text:'时间格式沿用事件线。关系状态会根据全局「故事进度」自动判断；结束时间留空表示尚未记录结束时间。', cls:'my-char-muted'});
    function field(label, type, value, options) {
        var row=el.createEl('div',{cls:'my-char-form-row'}); row.createEl('label',{text:label,cls:'my-char-form-label'});
        var input;
        if(type==='select') { input=row.createEl('select'); (options||[]).forEach(function(o){var op=input.createEl('option',{text:o.label||o.value});op.value=o.value;}); }
        else if(type==='textarea') input=row.createEl('textarea'); else input=row.createEl('input',{type:type||'text'});
        if(value!=null) input.value=value; input.style.cssText='width:100%;min-width:0;padding:8px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);color:var(--text-normal);box-sizing:border-box;';
        return input;
    }
    var names=this.factions.map(function(f){return f.name;});
    var from=field('组织 A','select',r.from||names[0],names.map(function(n){return {value:n,label:n};}));
    var to=field('组织 B','select',r.to||names[1]||names[0],names.map(function(n){return {value:n,label:n};}));
    var type=field('关系类型','select',r.type||'联盟',ORG_RELATION_TYPES.map(function(n){return {value:n,label:n};}));
    var start=field('开始时间','text',r.startTime||''); start.placeholder='例如：公元前221年 / 第三章';
    var end=field('结束时间（可留空）','text',r.endTime||''); end.placeholder='留空表示尚未记录结束时间';
    var desc=field('关系说明','textarea',r.desc||''); desc.rows=3;
    var actions=el.createEl('div',{cls:'my-char-btn-group'}); actions.style.cssText='justify-content:flex-end;margin-top:14px;';
    var save=actions.createEl('button',{text:'保存',cls:'my-char-view-btn'});
    save.addEventListener('click',function(){
        if(!from.value||!to.value||from.value===to.value){new obsidian.Notice('请选择两个不同的组织');return;}
        if(start.value.trim()&&end.value.trim()&&timesAreComparable(start.value.trim(),end.value.trim())&&getTimeSortValue(start.value.trim())>getTimeSortValue(end.value.trim())){new obsidian.Notice('结束时间不能早于开始时间');return;}
        self.onSubmit({id:r.id||('orgrel-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)),from:from.value,to:to.value,type:type.value,startTime:start.value.trim(),endTime:end.value.trim(),desc:desc.value.trim(),createdAt:r.createdAt||new Date().toISOString()});
        self.close();
    });
    var cancel=actions.createEl('button',{text:'取消',cls:'my-char-btn-ghost'}); cancel.addEventListener('click',function(){self.close();});
    };
    OrgRelationModal.prototype.onClose=function(){this.contentEl.empty();};
    return OrgRelationModal;
}(obsidian.Modal));

MyView.prototype.showOrgRelationDialog = function(relation) {
    var self=this;
    if((this.factions||[]).length<2){new obsidian.Notice('至少需要建立两个阵营，才能设置组织关系');return;}
    new OrgRelationModal(this.app,this.factions,relation,function(result){
        pushUndoSnapshot(self,'组织关系变更');
        self.orgRelations=normalizeOrgRelations(self.orgRelations||[]);
        var idx=self.orgRelations.findIndex(function(x){return x.id===result.id;});
        if(idx>=0)self.orgRelations[idx]=result;else self.orgRelations.push(result);
        self.saveFactionsAndRelations().then(function(){self.render();new obsidian.Notice('组织关系已保存');}).catch(function(e){console.error(e);new obsidian.Notice('组织关系保存失败：'+e.message);});
    }).open();
};

MyView.prototype.renderOrgRelationsPanel = function(container) {
    var self=this, all=normalizeOrgRelations(this.orgRelations||[]);
    // 将补齐后的 ID 回写到视图数据，保证编辑、删除和保存始终引用同一条记录。
    this.orgRelations = all;
    var progressText = String((this.plugin.settings && this.plugin.settings.currentTimePoint) || '').trim();
    var buckets = { current: [], history: [], future: [], unknown: [] };
    all.forEach(function(r) { buckets[classifyOrgRelationAtProgress(r, progressText)].push(r); });
    Object.keys(buckets).forEach(function(k) { buckets[k].sort(compareOrgRelationTime); });
    var panel=container.createEl('section',{cls:'rw-org-rel-panel'});
    var head=panel.createEl('div',{cls:'rw-org-rel-head'});
    head.createEl('div',{text:'组织关系',cls:'rw-org-rel-title'});
    head.createEl('button',{text:'+ 建立关系',cls:'my-char-view-btn my-char-btn-sm'}).addEventListener('click',function(){self.showOrgRelationDialog(null);});
    var progress=panel.createEl('div',{cls:'rw-org-rel-progress'});
    progress.textContent='按当前写作进度判断：'+(progressText || '尚未设置。请先在事件线设置当前时间点。');
    var tabs=panel.createEl('div',{cls:'rw-org-rel-tabs'}), body=panel.createEl('div',{cls:'rw-org-rel-list'});
    var mode='current';
    function draw(){
        body.empty();
        var list=buckets[mode];
        if(!list.length){
            var emptyText = mode==='current'?'暂无当前有效的组织关系':mode==='history'?'暂无历史组织关系':mode==='future'?'暂无待生效的组织关系':'暂无待确认时间的组织关系';
            body.createEl('div',{text:emptyText,cls:'my-char-view-empty'});return;
        }
        list.forEach(function(r){
            var row=body.createEl('article',{cls:'rw-org-rel-row'});
            var top=row.createEl('div',{cls:'rw-org-rel-row-top'});
            top.createEl('strong',{text:r.from});
            top.createEl('span',{text:r.type,cls:'rw-org-rel-type rw-org-rel-type-'+(r.type==='联盟'?'alliance':r.type==='敌对'?'hostile':r.type==='附属'||r.type==='从属'?'subordinate':'neutral')});
            top.createEl('strong',{text:r.to});
            var timeLabel=(r.startTime||'开始时间未注明')+(r.endTime?' — '+r.endTime:' — 未记录结束时间');
            row.createEl('div',{text:timeLabel,cls:'rw-org-rel-time'});
            if(mode==='future') row.createEl('div',{text:'尚未到达这段关系的开始时间',cls:'rw-org-rel-status'});
            if(mode==='unknown') row.createEl('div',{text:'缺少当前进度或时间格式无法可靠比较，请补充/统一时间格式',cls:'rw-org-rel-status'});
            if(r.desc)row.createEl('div',{text:r.desc,cls:'rw-org-rel-desc'});
            var tools=row.createEl('div',{cls:'rw-org-rel-actions'});
            tools.createEl('button',{text:'编辑',cls:'my-char-btn-ghost my-char-btn-xs'}).addEventListener('click',function(){self.showOrgRelationDialog(r);});
            tools.createEl('button',{text:'删除',cls:'my-char-btn-danger my-char-btn-xs'}).addEventListener('click',function(){
                if(!confirmDestructiveAction('删除这条组织关系？','只删除这条关系记录，不会删除两个组织或其历史资料。'))return;
                var previous=deepCloneJson(self.orgRelations||[]);
                pushUndoSnapshot(self,'删除组织关系');
                self.orgRelations=(self.orgRelations||[]).filter(function(x){return x.id!==r.id;});
                self.saveFactionsAndRelations().then(async function(){
                    var persisted=await loadSavedData(self.plugin);
                    var stillExists=normalizeOrgRelations(persisted.orgRelations||[]).some(function(x){return x.id===r.id;});
                    if(stillExists) throw new Error('保存校验未通过，记录仍存在');
                    new obsidian.Notice('组织关系已删除');
                    self.render();
                }).catch(async function(e){
                    console.error('[组织关系] 删除或保存校验失败：',e);
                    self.orgRelations=previous;
                    try { await self.saveFactionsAndRelations(); } catch(rollbackError) { console.error('[组织关系] 删除失败后的数据恢复失败：',rollbackError); }
                    new obsidian.Notice('删除失败，已尝试恢复原记录：'+(e&&e.message?e.message:'未知错误'),8000);
                    self.render();
                });
            });
        });
    }
    function setTab(next){
        mode=next;tabs.empty();
        [['current','当前 '+buckets.current.length],['history','历史 '+buckets.history.length],['future','待生效 '+buckets.future.length],['unknown','待确认 '+buckets.unknown.length]].forEach(function(t){
            var b=tabs.createEl('button',{text:t[1],cls:'rw-org-rel-tab'+(mode===t[0]?' is-active':'')});
            b.addEventListener('click',function(){setTab(t[0]);});
        });
        draw();
    }
    setTab('current');
};

// ========== 阵营编辑弹窗 ==========
var FactionModal = /** @class */ (function (_super) {
    __extends(FactionModal, _super);
    function FactionModal(app, faction, onSubmit) {
        var _this = _super.call(this, app) || this;
        _this.faction = faction;
        _this.onSubmit = onSubmit;
        return _this;
    }

    FactionModal.prototype.onOpen = function () {
        var el = this.contentEl;
        el.className = 'my-char-modal-body';

        el.createEl('h3', { text: this.faction ? '编辑阵营' : '添加阵营' });

        var nameValue = this.faction ? this.faction.name : '';
        var colorValue = this.faction ? this.faction.color || '#4a90e2' : '#4a90e2';
        var descValue = this.faction ? this.faction.desc || '' : '';

        var nameRow = el.createEl('div');
        nameRow.className = 'my-char-form-row';
        nameRow.createEl('label', { text: '阵营名称', cls: 'my-char-form-label' });
        var nameInput = nameRow.createEl('input', { type: 'text', value: nameValue });
        nameInput.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
        nameInput.addEventListener('input', function () { nameValue = nameInput.value; });

        var colorRow = el.createEl('div');
        colorRow.style.cssText = 'margin:10px 0;';
        colorRow.createEl('label', { text: '颜色' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var colorInput = colorRow.createEl('input', { type: 'color', value: colorValue });
        colorInput.addEventListener('input', function () { colorValue = colorInput.value; });

        var descRow = el.createEl('div');
        descRow.style.cssText = 'margin:10px 0;';
        descRow.createEl('label', { text: '描述（可选）' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var descInput = descRow.createEl('textarea', { value: descValue });
        descInput.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;height:60px;box-sizing:border-box;';
        descInput.addEventListener('input', function () { descValue = descInput.value; });

        var btnRow = el.createEl('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:15px;';

        var self = this;
        var saveBtn = btnRow.createEl('button', { text: '保存' });
        saveBtn.style.cssText = 'padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;';
        saveBtn.addEventListener('click', function () {
            if (!nameValue.trim()) { new obsidian.Notice('请输入名称'); return; }
            self.onSubmit({ name: nameValue.trim(), color: colorValue, desc: descValue.trim() });
            self.close();
        });

        var cancelBtn = btnRow.createEl('button', { text: '取消' });
        cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:white;';
        cancelBtn.addEventListener('click', function () { self.close(); });
    };

    FactionModal.prototype.onClose = function () { this.contentEl.empty(); };

    return FactionModal;
}(obsidian.Modal));

// ========== 关系编辑弹窗 ==========
var RelationModal = /** @class */ (function (_super) {
    __extends(RelationModal, _super);
    function RelationModal(app, chars, prefill, relTypes, onSubmit) {
        var _this = _super.call(this, app) || this;
        _this.chars = chars;
        _this.prefill = prefill;
        _this.relTypes = relTypes;
        _this.onSubmit = onSubmit;
        return _this;
    }

    RelationModal.prototype.onOpen = function () {
        var el = this.contentEl;
        el.addClass('my-char-modal-body');
        el.style.cssText = 'padding:20px;max-height:70vh;overflow-y:auto;';

        var isEdit = !!(this.prefill && this.prefill.charA && !this.prefill._new);
        el.createEl('h3', { text: isEdit ? '编辑人物关系' : '添加人物关系' });
        el.createEl('p', {
            text: isEdit
                ? '可改类型、亲密度、起止时间；保存后会写回人物索引 MD。'
                : '建议从这里设计关系（朋友/恋人/师徒等）。「同期出场」只是时间线辅助，不必作为主关系。',
            cls: 'my-char-muted'
        }).style.cssText = 'font-size:12px;margin:0 0 12px;';

        var charA = this.prefill ? this.prefill.charA : (this.chars[0] ? this.chars[0].name : '');
        var charB = this.prefill ? this.prefill.charB : (this.chars[1] ? this.chars[1].name : '');
        // 新建默认「朋友」，避免空类型或误用「同期出场」
        var type = this.prefill ? (this.prefill.type || '朋友') : '朋友';
        var desc = this.prefill ? (this.prefill.desc || '') : '';
        var intimacy = (this.prefill && this.prefill.intimacy !== undefined) ? this.prefill.intimacy : 1;
        var startTime = this.prefill ? (this.prefill.startTime || '') : '';
        var endTime = this.prefill ? (this.prefill.endTime || '') : '';

        var rowA = el.createEl('div');
        rowA.style.cssText = 'margin:10px 0;';
        rowA.createEl('label', { text: '人物 A' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var selA = rowA.createEl('input', { type: 'text', placeholder: '输入姓名或从建议中选择' });
        selA.style.cssText = 'width:100%;padding:8px;border:1px solid var(--background-modifier-border);border-radius:6px;';
        var listAId = 'rw-char-a-' + Math.random().toString(36).slice(2, 9);
        selA.setAttribute('list', listAId);
        var listA = rowA.createEl('datalist', { attr: { id: listAId } });
        for (var i = 0; i < this.chars.length; i++) listA.createEl('option', { value: this.chars[i].name });
        selA.value = charA || '';

        var rowType = el.createEl('div');
        rowType.style.cssText = 'margin:10px 0;';
        rowType.createEl('label', { text: '关系类型' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var selType = rowType.createEl('select');
        selType.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;';

        var hasMatch = false;
        for (var i = 0; i < this.relTypes.length; i++) {
            var opt = selType.createEl('option', { text: this.relTypes[i], value: this.relTypes[i] });
            if (this.relTypes[i] === type) { opt.selected = true; hasMatch = true; }
        }
        if (!hasMatch && type) {
            var customOpt = selType.createEl('option', { text: type, value: type });
            customOpt.selected = true;
        }
        if (!selType.value && this.relTypes.length > 0) {
            selType.value = this.relTypes.indexOf('朋友') !== -1 ? '朋友' : this.relTypes[0];
        }
        var quickTypes = rowType.createEl('div', { cls: 'my-char-rel-quick-types' });
        quickTypes.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;';
        ['朋友','敌对','恋人','亲属','师徒','同盟'].forEach(function(t) {
            var chip = quickTypes.createEl('button', { text: t, cls: 'my-char-btn-ghost my-char-btn-xs' });
            chip.addEventListener('click', function() {
                var exists = Array.prototype.some.call(selType.options, function(o) { return o.value === t; });
                if (!exists) selType.add(new Option(t, t));
                selType.value = t;
            });
        });

        var rowIntimacy = el.createEl('div');
        rowIntimacy.style.cssText = 'margin:10px 0;';
        rowIntimacy.createEl('label', { text: '亲密度' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var selIntimacy = rowIntimacy.createEl('select');
        selIntimacy.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;';
        for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
            var lvl = INTIMACY_LEVELS[i];
            var opt = selIntimacy.createEl('option', { text: lvl.label + (lvl.value >= 0 ? ' (+' + lvl.value + ')' : ' (' + lvl.value + ')'), value: String(lvl.value) });
            if (lvl.value === intimacy) opt.selected = true;
        }

        var rowB = el.createEl('div');
        rowB.style.cssText = 'margin:10px 0;';
        rowB.createEl('label', { text: '人物 B' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var selB = rowB.createEl('input', { type: 'text', placeholder: '输入姓名或从建议中选择' });
        selB.style.cssText = 'width:100%;padding:8px;border:1px solid var(--background-modifier-border);border-radius:6px;';
        var listBId = 'rw-char-b-' + Math.random().toString(36).slice(2, 9);
        selB.setAttribute('list', listBId);
        var listB = rowB.createEl('datalist', { attr: { id: listBId } });
        for (var i = 0; i < this.chars.length; i++) listB.createEl('option', { value: this.chars[i].name });
        selB.value = charB || '';
        var swapRow = rowB.createEl('div');
        swapRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';
        var swapBtn = swapRow.createEl('button', { text: '⇄ 互换人物双方', cls: 'my-char-btn-ghost my-char-btn-xs' });
        swapBtn.addEventListener('click', function() { var tmp = selA.value; selA.value = selB.value; selB.value = tmp; });

        var rowStart = el.createEl('div');
        rowStart.style.cssText = 'margin:10px 0;';
        rowStart.createEl('label', { text: '关系开始时间（可选）' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var startInput = rowStart.createEl('input', { type: 'text', cls: 'my-char-form-input', placeholder: '如：301年春、登基后' });
        startInput.value = startTime || '';

        var rowEnd = el.createEl('div');
        rowEnd.style.cssText = 'margin:10px 0;';
        rowEnd.createEl('label', { text: '关系结束时间（可选）' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var endInput = rowEnd.createEl('input', { type: 'text', cls: 'my-char-form-input', placeholder: '如：305年秋、决裂后' });
        endInput.value = endTime || '';

        var rowDesc = el.createEl('div');
        rowDesc.style.cssText = 'margin:10px 0;';
        rowDesc.createEl('label', { text: '描述（可选）' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var descInput = rowDesc.createEl('textarea', { cls: 'my-char-form-input' });
        descInput.style.height = '60px';
        descInput.value = desc || '';

        var btnRow = el.createEl('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:15px;';

        var self = this;
        var saveBtn = btnRow.createEl('button', { text: '保存', type: 'button' });
        saveBtn.style.cssText = 'padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;';
        saveBtn.addEventListener('click', function () {
            // 以控件当前值为准，避免「看起来选了但变量仍为空」
            var a = selA.value;
            var b = selB.value;
            var t = selType.value;
            var intimacyVal = parseInt(selIntimacy.value, 10);
            if (isNaN(intimacyVal)) intimacyVal = 1;
            var knownNames = self.chars.map(function(c) { return c.name; });
            if (!a || !b) { new obsidian.Notice('请选择人物'); return; }
            if (knownNames.indexOf(a) === -1 || knownNames.indexOf(b) === -1) { new obsidian.Notice('请从人物建议中选择已存在的人物，或先创建人物档案'); return; }
            if (a === b) { new obsidian.Notice('不能选同一个人'); return; }
            if (!t) { new obsidian.Notice('请选择关系类型'); return; }
            self.onSubmit({
                charA: a,
                charB: b,
                type: t,
                desc: descInput.value.trim(),
                intimacy: intimacyVal,
                startTime: startInput.value.trim(),
                endTime: endInput.value.trim()
            });
            self.close();
        });

        var cancelBtn = btnRow.createEl('button', { text: '取消', type: 'button' });
        cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:white;';
        cancelBtn.addEventListener('click', function () { self.close(); });
    };

    RelationModal.prototype.onClose = function () { this.contentEl.empty(); };

    return RelationModal;
}(obsidian.Modal));

// ========== 批量操作弹窗 ==========
var BatchRelationModal = /** @class */ (function (_super) {
    __extends(BatchRelationModal, _super);
    function BatchRelationModal(app, relations, chars, onConfirm) {
        var _this = _super.call(this, app) || this;
        _this.relations = relations;
        _this.chars = chars;
        _this.onConfirm = onConfirm;
        return _this;
    }

    BatchRelationModal.prototype.onOpen = function () {
        var el = this.contentEl;
        el.style.cssText = 'padding:20px;min-width:300px;';
        
        el.createEl('h3', { text: '⚡ 批量操作' }).style.cssText = 'margin:0 0 15px;border-bottom:1px solid #eee;padding-bottom:8px;';
        
        var typeSet = {};
        for (var i = 0; i < this.relations.length; i++) {
            var t = this.relations[i].type || '其他';
            typeSet[t] = true;
        }
        var types = Object.keys(typeSet).sort();
        
        if (types.length > 0) {
            var deleteSection = el.createEl('div');
            deleteSection.style.cssText = 'margin-bottom:20px;padding:10px;background:#fef5f5;border-radius:6px;border-left:3px solid #e74c3c;';
            deleteSection.createEl('div', { text: '🗑️ 按类型批量删除' }).style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:8px;color:#e74c3c;';
            
            var typeSelect1 = deleteSection.createEl('select');
            typeSelect1.style.cssText = 'width:100%;padding:6px;margin-bottom:8px;border-radius:4px;border:1px solid #ddd;';
            for (var i = 0; i < types.length; i++) {
                typeSelect1.add(createOption(types[i], types[i]));
            }
            
            var delBtn = deleteSection.createEl('button', { text: '删除此类型所有关系' });
            delBtn.style.cssText = 'padding:6px 12px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
            var self = this;
            delBtn.addEventListener('click', function() {
                var selectedType = typeSelect1.value;
                if (confirmDestructiveAction('删除全部「' + selectedType + '」关系？', '该类型下的关系记录将被批量删除。')) {
                    self.onConfirm({ action: 'batch_delete_by_type', type: selectedType });
                    self.close();
                }
            });
        }
        
        if (types.length > 0) {
            var updateSection = el.createEl('div');
            updateSection.style.cssText = 'margin-bottom:20px;padding:10px;background:#f5fef5;border-radius:6px;border-left:3px solid #27ae60;';
            updateSection.createEl('div', { text: '📝 按类型批量更新亲密度' }).style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:8px;color:#27ae60;';
            
            var typeSelect2 = updateSection.createEl('select');
            typeSelect2.style.cssText = 'width:100%;padding:6px;margin-bottom:8px;border-radius:4px;border:1px solid #ddd;';
            for (var i = 0; i < types.length; i++) {
                typeSelect2.add(createOption(types[i], types[i]));
            }
            
            var intimacySelect = updateSection.createEl('select');
            intimacySelect.style.cssText = 'width:100%;padding:6px;margin-bottom:8px;border-radius:4px;border:1px solid #ddd;';
            for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
                var lvl = INTIMACY_LEVELS[i];
                intimacySelect.add(createOption(lvl.value.toString(), lvl.label));
            }
            
            var updateBtn = updateSection.createEl('button', { text: '更新此类型所有关系的亲密度' });
            updateBtn.style.cssText = 'padding:6px 12px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
            var self = this;
            updateBtn.addEventListener('click', function() {
                var selectedType = typeSelect2.value;
                var newIntimacy = parseInt(intimacySelect.value);
                if (confirm('确定将「' + selectedType + '」类型的所有关系亲密度改为 ' + getIntimacyLabel(newIntimacy) + ' 吗？')) {
                    self.onConfirm({ action: 'batch_update_intimacy', type: selectedType, newIntimacy: newIntimacy });
                    self.close();
                }
            });
        }
        
        var statsSection = el.createEl('div');
        statsSection.style.cssText = 'margin-bottom:20px;padding:10px;background:#f0f4ff;border-radius:6px;';
        statsSection.createEl('div', { text: '📊 统计信息' }).style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:8px;';
        
        var typeStats = {};
        for (var i = 0; i < this.relations.length; i++) {
            var t = this.relations[i].type || '其他';
            typeStats[t] = (typeStats[t] || 0) + 1;
        }
        var typeList = Object.keys(typeStats).sort();
        for (var i = 0; i < typeList.length; i++) {
            statsSection.createEl('div', { text: typeList[i] + ': ' + typeStats[typeList[i]] + '条' }).style.cssText = 'font-size:11px;color:#666;';
        }
        
        var dangerSection = el.createEl('div');
        dangerSection.style.cssText = 'margin-bottom:20px;padding:10px;background:#fff5f0;border-radius:6px;border-left:3px solid #e67e22;';
        var clearBtn = dangerSection.createEl('button', { text: '⚠️ 清空所有关系（不可恢复）' });
        clearBtn.style.cssText = 'padding:6px 12px;background:#e67e22;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
        var self = this;
        clearBtn.addEventListener('click', function() {
            self.onConfirm({ action: 'clear_all' });
            self.close();
        });
        
        var exportSection = el.createEl('div');
        exportSection.style.cssText = 'padding:10px;background:#f5f5f5;border-radius:6px;';
        var exportBtn = exportSection.createEl('button', { text: '📎 导出所有关系为 CSV' });
        exportBtn.style.cssText = 'padding:6px 12px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
        exportBtn.addEventListener('click', function() {
            self.onConfirm({ action: 'export_relations' });
            self.close();
        });
        
        var closeBtn = el.createEl('button', { text: '关闭' });
        closeBtn.style.cssText = 'margin-top:15px;padding:8px 16px;background:#888;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
        closeBtn.addEventListener('click', function() { self.close(); });
    };
    
    BatchRelationModal.prototype.onClose = function() {
        this.contentEl.empty();
    };
    
    return BatchRelationModal;
}(obsidian.Modal));

// ========== 人物详情弹窗 ==========
var DetailModal = /** @class */ (function (_super) {
    __extends(DetailModal, _super);
    function DetailModal(app, charData, events, relations, manualRels, view) {
        var _this = _super.call(this, app) || this;
        _this.charData = charData;
        _this.events = events;
        _this.relations = relations;
        _this.manualRels = manualRels;
        _this.view = view;
        _this._filterCoChar = null;
        _this._coAppearQuery = '';
        _this._timelineQuery = '';
        _this._timelineTag = '';
        _this._timelineYear = '';
        _this._timelineVolume = '';
        return _this;
    }

    DetailModal.prototype.getBaseEvents = function () {
        if (this._filterCoChar && this.relations[this._filterCoChar]) {
            return this.relations[this._filterCoChar];
        }
        return this.events || [];
    };

    DetailModal.prototype.getDisplayEvents = function () {
        var list = this.getBaseEvents();
        var q = (this._timelineQuery || '').trim().toLowerCase();
        var tag = this._timelineTag || '';
        var year = this._timelineYear || '';
        var volume = this._timelineVolume || '';
        if (!q && !tag && !year && !volume) return list;
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var evt = list[i];
            if (tag && (evt.tag || '') !== tag) continue;
            if (year && (evt.year || '') !== year) continue;
            if (volume && (evt.volume || '') !== volume) continue;
            if (q) {
                var hay = [
                    evt.event || '',
                    evt.year || '',
                    evt.month || '',
                    evt.volume || '',
                    evt.tag || '',
                    evt.plotLine || '',
                    evt.chapterNote || ''
                ].join(' ').toLowerCase();
                if (hay.indexOf(q) === -1) continue;
            }
            out.push(evt);
        }
        return out;
    };

    DetailModal.prototype.getSortedCoAppearNames = function () {
        var self = this;
        var names = Object.keys(this.relations || {});
        names.sort(function (a, b) {
            return (self.relations[b].length || 0) - (self.relations[a].length || 0);
        });
        var q = (this._coAppearQuery || '').trim().toLowerCase();
        if (!q) return names;
        return names.filter(function (n) {
            return n.toLowerCase().indexOf(q) !== -1;
        });
    };

    DetailModal.prototype.collectEventFacets = function (list) {
        var years = {};
        var volumes = {};
        var tags = {};
        for (var i = 0; i < list.length; i++) {
            var evt = list[i];
            if (evt.year) years[evt.year] = true;
            if (evt.volume) volumes[evt.volume] = true;
            if (evt.tag) tags[evt.tag] = true;
        }
        return {
            years: Object.keys(years).sort().reverse(),
            volumes: Object.keys(volumes).sort(),
            tags: Object.keys(tags).sort()
        };
    };

    DetailModal.prototype.setCoCharFilter = function (name) {
        if (this._filterCoChar === name) this._filterCoChar = null;
        else this._filterCoChar = name;
        this._timelineTag = '';
        this._timelineYear = '';
        this._timelineVolume = '';
        this.refreshInteractiveSections();
    };

    DetailModal.prototype.clearCoCharFilter = function () {
        this._filterCoChar = null;
        this.refreshInteractiveSections();
    };

    DetailModal.prototype.clearTimelineFilters = function () {
        this._timelineQuery = '';
        this._timelineTag = '';
        this._timelineYear = '';
        this._timelineVolume = '';
        this.refreshInteractiveSections();
    };

    DetailModal.prototype.refreshInteractiveSections = function () {
        if (!this._interactiveRoot) {
            this.onOpen();
            return;
        }
        this._interactiveRoot.empty();
        this.renderCoAppearSection(this._interactiveRoot);
        this.renderTimelineSection(this._interactiveRoot);
    };

    DetailModal.prototype.renderFieldRow = function (parent, key, value) {
        var row = parent.createEl('div', { cls: 'my-char-detail-field-row' });
        row.createEl('strong', { text: key + '：', cls: 'my-char-detail-field-label' });
        row.createEl('span', { text: value, cls: 'my-char-detail-field-value' });
    };

    DetailModal.prototype.fillCoAppearList = function () {
        var self = this;
        var listEl = this._coAppearListEl;
        var titleEl = this._coAppearTitleEl;
        if (!listEl) return;

        var allCount = Object.keys(this.relations || {}).length;
        var names = this.getSortedCoAppearNames();
        if (titleEl) {
            var q = (this._coAppearQuery || '').trim();
            titleEl.textContent = q
                ? '共同出场人物（显示 ' + names.length + ' / ' + allCount + '人）'
                : '共同出场人物 (' + allCount + '人)';
        }

        listEl.empty();
        if (names.length === 0) {
            listEl.createEl('p', {
                text: (this._coAppearQuery || '').trim() ? '没有匹配的共同出场人物' : '暂无共同出场人物',
                cls: 'my-char-detail-more-hint'
            });
            return;
        }

        for (var i = 0; i < names.length; i++) {
            (function (name) {
                var evts = self.relations[name] || [];
                var item = listEl.createEl('div', {
                    cls: 'my-char-coappear-item' + (self._filterCoChar === name ? ' is-active' : '')
                });
                item.title = '点击筛选共同出场事件；点人名可跳转';

                var nameEl = item.createEl('strong', { text: name, cls: 'my-char-coappear-name' });
                item.createEl('span', {
                    text: '共同出场 ' + evts.length + ' 次',
                    cls: 'my-char-coappear-count'
                });

                nameEl.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var targetChar = self.view.findChar(name);
                    if (targetChar) {
                        self.close();
                        self.view.showCharDetail(targetChar);
                    }
                });

                item.addEventListener('click', function () {
                    self.setCoCharFilter(name);
                });
            })(names[i]);
        }
    };

    DetailModal.prototype.renderCoAppearSection = function (el) {
        var self = this;
        var allNames = Object.keys(this.relations || {});
        if (allNames.length === 0) return;

        var section = el.createEl('details', { cls: 'my-char-detail-accordion' });
        var sectionSummary = section.createEl('summary'); sectionSummary.createEl('strong', { text: '👥 共同出场人物' }); sectionSummary.createEl('span', { text: allNames.length + ' 人', cls: 'my-char-muted' });
        var sectionBody = section.createEl('div', { cls: 'my-char-detail-accordion-body' });
        this._coAppearTitleEl = sectionBody.createEl('h3', {
            text: '共同出场人物 (' + allNames.length + '人)',
            cls: 'my-char-detail-section-title'
        });
        sectionBody.createEl('div', {
            text: '可搜索人名；点人名跳转档案；点整行筛选下方时间线',
            cls: 'my-char-coappear-hint'
        });

        var filterBar = sectionBody.createEl('div', { cls: 'my-char-detail-toolbar' });
        var searchInput = filterBar.createEl('input', {
            type: 'text',
            cls: 'my-char-detail-search',
            placeholder: '搜索共同出场人物…'
        });
        searchInput.value = this._coAppearQuery || '';
        searchInput.addEventListener('input', function () {
            self._coAppearQuery = searchInput.value;
            self.fillCoAppearList();
        });
        var clearBtn = filterBar.createEl('button', {
            text: '清除',
            cls: 'my-char-btn-ghost my-char-btn-sm'
        });
        clearBtn.addEventListener('click', function () {
            self._coAppearQuery = '';
            searchInput.value = '';
            self.fillCoAppearList();
            searchInput.focus();
        });

        this._coAppearListEl = sectionBody.createEl('div', { cls: 'my-char-detail-scroll-list' });
        this.fillCoAppearList();
    };

    DetailModal.prototype.fillTimelineList = function () {
        var self = this;
        var listEl = this._timelineListEl;
        var titleEl = this._timelineTitleEl;
        var metaEl = this._timelineMetaEl;
        if (!listEl) return;

        var base = this.getBaseEvents();
        var list = this.getDisplayEvents();
        if (titleEl) {
            if (this._filterCoChar) {
                titleEl.textContent = '时间线出场（与「' + this._filterCoChar + '」共同 ' + base.length + ' 次）';
            } else {
                titleEl.textContent = '时间线出场 (' + base.length + '次)';
            }
        }
        if (metaEl) {
            var hasExtra = !!(this._timelineQuery || this._timelineTag || this._timelineYear || this._timelineVolume);
            metaEl.textContent = hasExtra
                ? '当前显示 ' + list.length + ' / ' + base.length + ' 条'
                : (list.length > 50 ? '默认展示前 50 条，可用上方筛选缩小范围' : '');
            metaEl.style.display = metaEl.textContent ? '' : 'none';
        }

        listEl.empty();
        if (list.length === 0) {
            listEl.createEl('p', {
                text: base.length === 0
                    ? (this._filterCoChar ? '当前共同出场筛选下没有事件' : '暂无出场记录')
                    : '没有匹配的时间线事件，请调整筛选条件',
                cls: 'my-char-detail-more-hint'
            });
            return;
        }

        var showCount = Math.min(50, list.length);
        for (var i = 0; i < showCount; i++) {
            (function (evt) {
                var item = listEl.createEl('div', {
                    cls: 'my-char-timeline-event is-clickable'
                });
                item.title = '点击跳转到时间线';
                if (evt.tag) {
                    var tagColor = getTagColor(self.view.plugin, evt.tag);
                    item.style.setProperty('--event-accent', tagColor);
                }
                var loc = evt.volume ? evt.volume + ' / ' : '';
                item.createEl('small', {
                    text: '[' + loc + (evt.year || '') + ' ' + (evt.month || '') + '] ',
                    cls: 'my-char-detail-event-loc'
                });
                var evtSpan = item.createEl('span');
                evtSpan.textContent = evt.event || '';
                if (evt.chapterNote) {
                    var noteLink = item.createEl('span', {
                        text: ' → ' + evt.chapterNote,
                        cls: 'my-char-link my-char-timeline-note-link'
                    });
                    noteLink.addEventListener('click', function (e) {
                        e.stopPropagation();
                        var m = evt.chapterNote.match(/\[\[([^\]|]+)/);
                        if (m) self.app.workspace.openLinkText(m[1], '');
                    });
                }
                item.addEventListener('click', function () {
                    self.close();
                    self.view.focusTimelineEvent(evt);
                });
            })(list[i]);
        }
        if (list.length > 50) {
            listEl.createEl('p', {
                text: '...还有 ' + (list.length - 50) + ' 条，请继续用搜索/标签/年份缩小范围',
                cls: 'my-char-detail-more-hint'
            });
        }
    };

    DetailModal.prototype.renderTimelineSection = function (el) {
        var self = this;
        var base = this.getBaseEvents();
        if ((!base || base.length === 0) && !this._filterCoChar && (!this.events || this.events.length === 0)) {
            return;
        }

        var section = el.createEl('details', { cls: 'my-char-detail-accordion' });
        var sectionSummary = section.createEl('summary'); sectionSummary.createEl('strong', { text: '🗓 时间线出场' }); sectionSummary.createEl('span', { text: base.length + ' 次', cls: 'my-char-muted' });
        var sectionBody = section.createEl('div', { cls: 'my-char-detail-accordion-body' });
        this._timelineTitleEl = sectionBody.createEl('h3', {
            text: '时间线出场',
            cls: 'my-char-detail-section-title'
        });

        if (this._filterCoChar) {
            var coBar = sectionBody.createEl('div', { cls: 'my-char-detail-filter-bar' });
            coBar.createEl('span', { text: '已筛选：与「' + this._filterCoChar + '」共同出场' });
            var clearCoBtn = coBar.createEl('button', { text: '清除人物筛选', cls: 'my-char-filter-clear' });
            clearCoBtn.addEventListener('click', function () {
                self.clearCoCharFilter();
            });
        }

        var facets = this.collectEventFacets(base);
        var toolbar = sectionBody.createEl('div', { cls: 'my-char-detail-toolbar' });
        var searchInput = toolbar.createEl('input', {
            type: 'text',
            cls: 'my-char-detail-search',
            placeholder: '搜索事件内容 / 年份 / 卷名…'
        });
        searchInput.value = this._timelineQuery || '';
        searchInput.addEventListener('input', function () {
            self._timelineQuery = searchInput.value;
            self.fillTimelineList();
        });

        if (facets.years.length > 1) {
            var yearSelect = toolbar.createEl('select', { cls: 'my-char-detail-select' });
            yearSelect.createEl('option', { text: '全部年份', value: '' });
            for (var yi = 0; yi < facets.years.length; yi++) {
                var yOpt = yearSelect.createEl('option', {
                    text: facets.years[yi],
                    value: facets.years[yi]
                });
                if (this._timelineYear === facets.years[yi]) yOpt.selected = true;
            }
            yearSelect.value = this._timelineYear || '';
            yearSelect.addEventListener('change', function () {
                self._timelineYear = yearSelect.value || '';
                self.fillTimelineList();
            });
        }

        if (facets.volumes.length > 1) {
            var volSelect = toolbar.createEl('select', { cls: 'my-char-detail-select' });
            volSelect.createEl('option', { text: '全部卷', value: '' });
            for (var vi = 0; vi < facets.volumes.length; vi++) {
                var vOpt = volSelect.createEl('option', {
                    text: facets.volumes[vi],
                    value: facets.volumes[vi]
                });
                if (this._timelineVolume === facets.volumes[vi]) vOpt.selected = true;
            }
            volSelect.value = this._timelineVolume || '';
            volSelect.addEventListener('change', function () {
                self._timelineVolume = volSelect.value || '';
                self.fillTimelineList();
            });
        }

        var clearTlBtn = toolbar.createEl('button', {
            text: '清除筛选',
            cls: 'my-char-btn-ghost my-char-btn-sm'
        });
        clearTlBtn.addEventListener('click', function () {
            self.clearTimelineFilters();
        });

        if (facets.tags.length > 0) {
            var chipBar = sectionBody.createEl('div', { cls: 'my-char-detail-chip-bar' });
            var allChip = chipBar.createEl('button', { text: '全部标签', cls: 'my-char-chip' });
            setFilterChip(allChip, !this._timelineTag, '#4a90e2');
            allChip.addEventListener('click', function () {
                self._timelineTag = '';
                self.refreshInteractiveSections();
            });
            for (var ti = 0; ti < facets.tags.length; ti++) {
                (function (tagValue) {
                    var label = getTagLabel(self.view.plugin, tagValue) || tagValue;
                    var color = getTagColor(self.view.plugin, tagValue);
                    var chip = chipBar.createEl('button', { text: label, cls: 'my-char-chip' });
                    setFilterChip(chip, self._timelineTag === tagValue, color);
                    chip.addEventListener('click', function () {
                        self._timelineTag = (self._timelineTag === tagValue) ? '' : tagValue;
                        self.refreshInteractiveSections();
                    });
                })(facets.tags[ti]);
            }
        }

        this._timelineMetaEl = sectionBody.createEl('div', { cls: 'my-char-detail-filter-meta' });
        this._timelineListEl = sectionBody.createEl('div', { cls: 'my-char-detail-scroll-list my-char-detail-scroll-list-tall' });
        this.fillTimelineList();
    };

    DetailModal.prototype.renderOrgMembershipSection = function (el) {
        var self=this, view=this.view, name=this.charData.name;
        view.orgMemberships=normalizeOrgMemberships(view.orgMemberships||[]);
        var records=view.orgMemberships.filter(function(r){return r.character===name;});
        var progress=(view.plugin.settings.currentTimePoint||'').trim();
        var buckets={current:[],history:[],future:[],unknown:[]};
        records.forEach(function(r){buckets[classifyOrgMembershipAtProgress(r,progress)].push(r);});
        var sec=el.createEl('details',{cls:'my-char-detail-accordion rw-org-membership-section'});
        var summary=sec.createEl('summary'); summary.createEl('strong',{text:'🏛 组织任职履历'}); summary.createEl('span',{text:records.length+' 条',cls:'my-char-muted'});
        var body=sec.createEl('div',{cls:'my-char-detail-panel my-char-detail-accordion-body'});
        var top=body.createEl('div',{cls:'my-char-quick-actions'});
        top.createEl('span',{text:'当前写作进度：'+(progress||'未设置'),cls:'my-char-muted'});
        top.createEl('button',{text:'+ 添加履历',cls:'my-char-view-btn my-char-btn-sm'}).addEventListener('click',function(){
            new OrgMembershipModal(self.app,name,view.factions||[],null,function(result){
                pushUndoSnapshot(view,'新增组织任职履历'); view.orgMemberships=normalizeOrgMemberships(view.orgMemberships||[]); view.orgMemberships.push(result);
                view.saveFactionsAndRelations().then(function(){new obsidian.Notice('组织任职履历已保存');self.onOpen();}).catch(function(e){new obsidian.Notice('保存失败：'+(e.message||e),8000);});
            }).open();
        });
        [['current','当前任职'],['history','历史任职'],['future','待生效'],['unknown','待确认']].forEach(function(pair){
            var list=buckets[pair[0]]; var group=body.createEl('details',{cls:'rw-org-membership-group'}); group.open=pair[0]==='current';
            var sm=group.createEl('summary');sm.createEl('strong',{text:pair[1]});sm.createEl('span',{text:list.length+' 条',cls:'my-char-muted'});
            var rows=group.createEl('div',{cls:'rw-org-membership-list'});
            if(!list.length){rows.createEl('p',{text:'暂无记录',cls:'my-char-view-muted'});return;}
            list.sort(function(a,b){return compareOrgRelationTime(a,b);}).forEach(function(r){
                var card=rows.createEl('article',{cls:'rw-org-membership-card'});
                var title=card.createEl('div',{cls:'rw-org-membership-title'});title.createEl('strong',{text:r.organization});title.createEl('span',{text:r.type,cls:'rw-org-rel-type'});
                if(r.position)card.createEl('div',{text:'职位 / 身份：'+r.position,cls:'rw-org-membership-meta'});
                card.createEl('div',{text:(r.startTime||'开始时间未注明')+' — '+(r.endTime||'未记录结束时间'),cls:'rw-org-membership-meta'});
                if(r.reason)card.createEl('div',{text:'变动原因：'+r.reason,cls:'rw-org-membership-meta'});
                if(r.linkedEvent)card.createEl('div',{text:'关联事件：'+r.linkedEvent,cls:'rw-org-membership-meta'});
                if(r.notes)card.createEl('p',{text:r.notes,cls:'rw-org-membership-notes'});
                var actions=card.createEl('div',{cls:'rw-org-rel-actions'});
                actions.createEl('button',{text:'编辑',cls:'my-char-btn-ghost my-char-btn-xs'}).addEventListener('click',function(){
                    new OrgMembershipModal(self.app,name,view.factions||[],r,function(result){pushUndoSnapshot(view,'编辑组织任职履历');view.orgMemberships=normalizeOrgMemberships(view.orgMemberships||[]).map(function(x){return x.id===result.id?result:x;});view.saveFactionsAndRelations().then(function(){new obsidian.Notice('履历已更新');self.onOpen();}).catch(function(e){new obsidian.Notice('保存失败：'+(e.message||e),8000);});}).open();
                });
                actions.createEl('button',{text:'删除',cls:'my-char-btn-danger my-char-btn-xs'}).addEventListener('click',function(){
                    if(!confirmDestructiveAction('删除这条任职履历？','只删除这条履历，不会删除人物或组织。'))return;
                    var before=deepCloneJson(view.orgMemberships||[]);pushUndoSnapshot(view,'删除组织任职履历');view.orgMemberships=before.filter(function(x){return x.id!==r.id;});
                    view.saveFactionsAndRelations().then(async function(){var saved=await loadSavedData(view.plugin);if(normalizeOrgMemberships(saved.orgMemberships||[]).some(function(x){return x.id===r.id;}))throw new Error('保存校验未通过');new obsidian.Notice('履历已删除');self.onOpen();}).catch(async function(e){view.orgMemberships=before;try{await view.saveFactionsAndRelations();}catch(re){console.error(re);}new obsidian.Notice('删除失败，已尝试恢复：'+(e.message||e),8000);self.onOpen();});
                });
            });
        });
    };

    DetailModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.empty();
        el.className = 'my-char-modal-body';
        if (this._editMode === undefined) this._editMode = false;
        if (this._filterCoChar === undefined) this._filterCoChar = null;
        if (this._coAppearQuery === undefined) this._coAppearQuery = '';
        if (this._timelineQuery === undefined) this._timelineQuery = '';
        if (this._timelineTag === undefined) this._timelineTag = '';
        if (this._timelineYear === undefined) this._timelineYear = '';
        if (this._timelineVolume === undefined) this._timelineVolume = '';
        this._fieldInputs = {};
        this._interactiveRoot = null;
        this._coAppearListEl = null;
        this._timelineListEl = null;

        var headerRow = el.createEl('div', { cls: 'my-char-detail-header' });
        headerRow.createEl('h2', { text: this.charData.name, cls: 'my-char-section-title' });
        var editBtn = headerRow.createEl('button', {
            text: this._editMode ? '取消编辑' : '✏️ 编辑',
            cls: 'my-char-btn-ghost my-char-btn-sm'
        });
        editBtn.addEventListener('click', function () {
            self._editMode = !self._editMode;
            self.onOpen();
        });
        if (!this._editMode) {
            var quickActions = el.createEl('div', { cls: 'my-char-quick-actions' });
            var addRelBtn = quickActions.createEl('button', { text: '＋ 添加关系', cls: 'my-char-view-btn my-char-btn-sm' });
            addRelBtn.addEventListener('click', function() {
                self.close();
                self.view.showRelationDialog({ charA: self.charData.name, charB: '', type: '朋友', intimacy: 1, _new: true });
            });
            var factionBtn = quickActions.createEl('button', { text: '🏷 修改阵营', cls: 'my-char-btn-ghost my-char-btn-sm' });
            factionBtn.addEventListener('click', function() { self._editMode = true; self._focusField = '阵营'; self.onOpen(); });
            var addEventBtn = quickActions.createEl('button', { text: '＋ 添加事件', cls: 'my-char-btn-ghost my-char-btn-sm' });
            addEventBtn.addEventListener('click', function() { self.close(); self.view.showQuickAddEvent(self.charData.name + '：'); });
        }
        if (this._editMode) {
            this.renderEditForm(el);
            return;
        }

        var fields = this.charData.fields || {};
        var infoSec = el.createEl('details', { cls: 'my-char-detail-accordion rw-char-basic-accordion' });
        var infoSummary = infoSec.createEl('summary');
        infoSummary.createEl('strong', { text: '📋 基本资料' });
        infoSummary.createEl('span', { text: Object.keys(fields).length + ' 项', cls: 'my-char-muted' });
        var infoDiv = infoSec.createEl('div', { cls: 'my-char-detail-panel my-char-detail-accordion-body' });
        var customFields = this.view.plugin.settings.customFields || '';
        var fieldOrder = customFields ? customFields.split(',').map(function (s) { return s.trim(); }) :
            ['身份', '阵营', '首次出场', '死亡', '死亡时间', '出生', '出生时间', '年龄', '性别', '种族', '职业', '居住地', '别名', '亲密人物'];

        var displayed = [];
        for (var i = 0; i < fieldOrder.length; i++) {
            var key = fieldOrder[i];
            if (fields[key] || key === (this.view.plugin.settings.factionFieldName || '阵营')) {
                displayed.push(key);
                var displayValue = key === (this.view.plugin.settings.factionFieldName || '阵营')
                    ? this.view.getCharField(this.charData, key) : fields[key];
                this.renderFieldRow(infoDiv, key, displayValue || '暂无当前阵营');
            }
        }
        for (var fKey in fields) {
            if (fields.hasOwnProperty(fKey) && displayed.indexOf(fKey) === -1) {
                this.renderFieldRow(infoDiv, fKey, fields[fKey]);
            }
        }
        if (Object.keys(fields).length === 0) {
            infoDiv.createEl('p', { text: '暂无其他信息', cls: 'my-char-view-muted' });
        }

        this.renderOrgMembershipSection(el);

        var lc = getCharLifecycle(this.view, this.charData);
        if (lc.birth || lc.firstAppear || lc.death) {
            var lcSec = el.createEl('details', { cls: 'my-char-detail-accordion' });
            var lcSummary = lcSec.createEl('summary'); lcSummary.createEl('strong', { text: '⏳ 生命周期' }); lcSummary.createEl('span', { text: '展开查看', cls: 'my-char-muted' });
            var lcPanel = lcSec.createEl('div', { cls: 'my-char-detail-panel my-char-detail-accordion-body' });
            if (lc.birth) {
                var birthRow = lcPanel.createEl('div', { cls: 'my-char-lifecycle-row' });
                birthRow.createEl('strong', { text: '出生：' });
                birthRow.createEl('span', { text: lc.birth });
                if (lc.birthParsed && lc.birthParsed.sortValue !== null) {
                    birthRow.createEl('small', { text: ' (' + formatSortValue(lc.birthParsed.sortValue) + ')', cls: 'my-char-view-muted' });
                }
            }
            if (lc.firstAppear) {
                var appearRow = lcPanel.createEl('div', { cls: 'my-char-lifecycle-row' });
                appearRow.createEl('strong', { text: '首次出场：' });
                appearRow.createEl('span', { text: lc.firstAppear });
                if (lc.firstAppearParsed && lc.firstAppearParsed.sortValue !== null) {
                    appearRow.createEl('small', { text: ' (' + formatSortValue(lc.firstAppearParsed.sortValue) + ')', cls: 'my-char-view-muted' });
                }
            }
            if (lc.death) {
                var deathRow = lcPanel.createEl('div', { cls: 'my-char-lifecycle-row' });
                deathRow.createEl('strong', { text: '死亡：' });
                deathRow.createEl('span', { text: lc.death });
                if (lc.deathParsed && lc.deathParsed.sortValue !== null) {
                    deathRow.createEl('small', { text: ' (' + formatSortValue(lc.deathParsed.sortValue) + ')', cls: 'my-char-view-muted' });
                }
            }
        }

        // Worldbuilding backlinks: collapsed by default to keep long character dossiers compact.
        var linkedWorld=(this.view._rwWorldRecords||this.view.plugin.settings.worldRecords||[]).filter(function(r){return (r.people||[]).some(function(n){return n===self.charData.name;});});
        var worldSec=el.createEl('details',{cls:'rw-linked-world-section my-char-detail-accordion'});
        var worldSummary=worldSec.createEl('summary');worldSummary.createEl('strong',{text:'关联世界观资料'});worldSummary.createEl('span',{text:linkedWorld.length+' 条',cls:'my-char-muted'});
        var worldList=worldSec.createEl('div',{cls:'rw-linked-world-list'});
        if(!linkedWorld.length)worldList.createEl('p',{text:'暂无关联资料；可在世界观资料编辑页填写所属人物。',cls:'my-char-view-muted'});
        linkedWorld.forEach(function(r){var b=worldList.createEl('button',{cls:'rw-linked-world-item'});b.createEl('strong',{text:r.name||'未命名资料'});b.createEl('small',{text:(r.type||'世界观')+(r.summary?' · '+r.summary:''),cls:'my-char-muted'});b.setAttribute('data-world-link-id',String(r.id||''));b.addEventListener('click',function(){var targetId=r.id;self.close();openCharViewAndRun(self.app,function(view){view._rwLocateWorldId=targetId;view._worldSubtab='overview';view.tab='world';view.render();});});});

        if (this.manualRels.length > 0) {
            var relSec = el.createEl('details', { cls: 'my-char-detail-accordion' });
            var relSummary = relSec.createEl('summary'); relSummary.createEl('strong', { text: '🔗 人物关系' }); relSummary.createEl('span', { text: this.manualRels.length + ' 条', cls: 'my-char-muted' });
            var relBody = relSec.createEl('div', { cls: 'my-char-detail-accordion-body' });
            for (var ri = 0; ri < this.manualRels.length; ri++) {
                (function (rel) {
                    var other = rel.charA === self.charData.name ? rel.charB : rel.charA;
                    var item = relBody.createEl('div', { cls: 'my-char-detail-rel-card' });

                    var intimacyVal = (rel.intimacy !== undefined) ? rel.intimacy : 0;
                    var intimacyLabel = getIntimacyLabel(intimacyVal);
                    var intimacyColor = getIntimacyColor(intimacyVal);

                    var otherLink = item.createEl('strong', { text: other, cls: 'my-char-view-link' });
                    item.createEl('span', { text: rel.type, cls: 'my-char-rel-type-badge' });
                    var intimacyBadge = item.createEl('span', {
                        text: '❤️ ' + intimacyLabel,
                        cls: 'my-char-rel-intimacy-badge'
                    });
                    intimacyBadge.style.background = intimacyColor;
                    if (rel.desc) {
                        item.createEl('div', { text: rel.desc, cls: 'my-char-rel-desc' });
                    }
                    if (rel.startTime || rel.endTime) {
                        var timeText = '';
                        if (rel.startTime) timeText += '📅 始于 ' + rel.startTime;
                        if (rel.endTime) timeText += (timeText ? ' · ' : '') + '⌛ 止于 ' + rel.endTime;
                        item.createEl('div', { text: timeText, cls: 'my-char-rel-time' });
                    }

                    otherLink.addEventListener('click', function () {
                        var targetChar = self.view.findChar(other);
                        if (targetChar) {
                            self.close();
                            self.view.showCharDetail(targetChar);
                        }
                    });

                    var historySummary = getChangeSummary(getRelationHistory(self.view.plugin, rel.charA, rel.charB));
                    item.createEl('div', {
                        text: '📈 ' + historySummary,
                        cls: 'my-char-rel-history-summary'
                    });

                    var histBtn = item.createEl('button', {
                        text: '📊 查看变化历史',
                        cls: 'my-char-rel-history-btn'
                    });
                    histBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        self.view.showChangeHistory(rel);
                    });
                    var editRelBtn = item.createEl('button', { text: '✏️ 快速编辑关系', cls: 'my-char-btn-ghost my-char-btn-xs' });
                    editRelBtn.addEventListener('click', function(e) { e.stopPropagation(); self.close(); self.view.showRelationDialog(rel); });
                })(this.manualRels[ri]);
            }
        }

        this._interactiveRoot = el.createEl('div', { cls: 'my-char-detail-interactive' });
        this.renderCoAppearSection(this._interactiveRoot);
        this.renderTimelineSection(this._interactiveRoot);

        var closeBtn = el.createEl('button', {
            text: '关闭',
            cls: 'my-char-view-btn my-char-modal-close-btn'
        });
        closeBtn.addEventListener('click', function () { self.close(); });
        setTimeout(function () { rwHighlightCharacterMentions(el, self.view); }, 60);
    };

    DetailModal.prototype.renderEditForm = function (el) {
        var self = this;
        var form = el.createEl('div', { cls: 'my-char-detail-panel' });
        var fields = Object.assign({}, this.charData.fields);
        var defaultKeys = ['身份', '类型', '阵营', '首次出场', '出生', '亲密人物', '章节笔记', '别名', '拼音', '拼音首字母'];
        for (var dk = 0; dk < defaultKeys.length; dk++) {
            if (!fields[defaultKeys[dk]]) fields[defaultKeys[dk]] = '';
        }
        this._fieldInputs = {};
        for (var key in fields) {
            if (!fields.hasOwnProperty(key)) continue;
            var row = form.createEl('div', { cls: 'my-char-form-row' });
            row.createEl('label', { text: key, cls: 'my-char-form-label' });
            var inp = row.createEl('input', { type: 'text', cls: 'my-char-form-input' });
            var factionKey = this.view.plugin.settings.factionFieldName || '阵营';
            var hasMembershipHistory = key === factionKey && normalizeOrgMemberships(this.view.orgMemberships || []).some(function(r) { return r.character === self.charData.name; });
            inp.value = hasMembershipHistory ? this.view.getCharField(this.charData, factionKey) : (fields[key] || '');
            inp.style.pointerEvents = 'auto';
            inp.style.userSelect = 'text';
            inp.style.webkitUserSelect = 'text';
            if (hasMembershipHistory) {
                inp.readOnly = true;
                inp.title = '当前阵营由组织任职履历和全局写作进度自动计算，请使用「组织任职履历」新增或修改阵营。';
                row.createEl('small', { text: '由任职履历自动计算；请在人物档案的「组织任职履历」中修改。', cls: 'my-char-view-muted' });
            }
            this._fieldInputs[key] = inp;
        }
        if (this._focusField && this._fieldInputs[this._focusField]) {
            this._fieldInputs[this._focusField].focus();
            this._focusField = null;
        }
        var addRow = form.createEl('div', { cls: 'my-char-form-row' });
        addRow.createEl('label', { text: '新增字段名', cls: 'my-char-form-label' });
        var newKeyInput = addRow.createEl('input', { type: 'text', cls: 'my-char-form-input', placeholder: '如：外貌、性格' });
        var newValInput = addRow.createEl('input', { type: 'text', cls: 'my-char-form-input', placeholder: '字段值' });
        var saveBtn = el.createEl('button', { text: '💾 保存到人物索引', cls: 'my-char-view-btn my-char-btn-block' });
        saveBtn.addEventListener('click', async function () {
            var out = {};
            var factionKey = self.view.plugin.settings.factionFieldName || '阵营';
            var hasMembershipHistory = normalizeOrgMemberships(self.view.orgMemberships || []).some(function(r) { return r.character === self.charData.name; });
            for (var k in self._fieldInputs) {
                // 动态阵营由履历驱动；保存人物基础资料时保留旧字段原值，避免写入「暂无当前阵营」等展示文案。
                if (k === factionKey && hasMembershipHistory) {
                    if (self.charData.fields && self.charData.fields[k]) out[k] = self.charData.fields[k];
                    continue;
                }
                if (self._fieldInputs[k].value.trim()) out[k] = self._fieldInputs[k].value.trim();
            }
            if (newKeyInput.value.trim()) out[newKeyInput.value.trim()] = newValInput.value.trim();
            await novelExt.updateCharInMd(self.app, self.view.plugin, self.charData.name, out);
            await self.view.loadAllData({ silent: true });
            self.charData = self.view.findChar(self.charData.name) || self.charData;
            self._editMode = false;
            new obsidian.Notice('✅ 人物信息已保存');
            self.onOpen();
        });
    };

    DetailModal.prototype.onClose = function () { this.contentEl.empty(); };

    return DetailModal;
}(obsidian.Modal));

// ========== 自定义事件标签管理弹窗（完全自由版）==========
var EventTagModal = /** @class */ (function (_super) {
    __extends(EventTagModal, _super);
    function EventTagModal(app, plugin, onSave) {
        var _this = _super.call(this, app) || this;
        _this.plugin = plugin;
        _this.onSave = onSave;
        _this.originalTagValues = (Array.isArray(plugin.settings.customEventTags) ? plugin.settings.customEventTags : []).map(function(t) { var n = normalizeEventTag(t); return n ? n.value : ''; }).filter(Boolean);
        
        // 直接从设置加载（兼容误存为 id 字段的旧数据）
        var hasCustomTags = Object.prototype.hasOwnProperty.call(plugin.settings, 'customEventTags');
        var customTags = hasCustomTags && Array.isArray(plugin.settings.customEventTags) ? plugin.settings.customEventTags : null;
        if (customTags === null || (!plugin.settings.eventTagsCustomized && customTags.length === 0)) {
            _this.tempTags = JSON.parse(JSON.stringify(DEFAULT_EVENT_TAGS));
        } else {
            _this.tempTags = [];
            for (var i = 0; i < customTags.length; i++) {
                var nt = normalizeEventTag(customTags[i]);
                if (nt) _this.tempTags.push(nt);
            }
        }
        _this.originalTagValues = _this.tempTags.map(function(t) { return t.value; });
        return _this;
    }

    EventTagModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.style.cssText = 'padding:20px;min-width:500px;max-height:85vh;overflow-y:auto;';
        
        el.createEl('h3', { text: '🏷️ 管理事件标签' }).style.cssText = 'margin:0 0 10px;border-bottom:1px solid #eee;padding-bottom:8px;';
        
        var desc = el.createEl('p', { text: '完全自由管理所有标签。添加、编辑、删除任意标签，随心所欲。' });
        desc.style.cssText = 'font-size:12px;color:#666;margin-bottom:12px;';
        
        var tip = el.createEl('div');
        tip.style.cssText = 'background:#f0f7ff;padding:8px 12px;border-radius:6px;font-size:11px;color:#555;margin-bottom:15px;border-left:3px solid #4a90e2;';
        tip.innerHTML = '💡 在时间线文件中使用 <code>[标签值]</code> 格式标记事件，如：<code>- [战争] 张三出征</code><br>所有标签都可以自由添加、删除、修改！';

        var tagsContainer = el.createEl('div');
        tagsContainer.style.cssText = 'margin-bottom:12px;max-height:350px;overflow-y:auto;border:1px solid #e8e8e8;border-radius:6px;padding:10px;background:#fafafa;';
        
        function renderTagList() {
            tagsContainer.empty();
            
            if (self.tempTags.length === 0) {
                var emptyMsg = tagsContainer.createEl('div');
                emptyMsg.style.cssText = 'text-align:center;color:#999;padding:30px 10px;font-size:13px;';
                emptyMsg.innerHTML = '📭 暂无标签<br><span style="font-size:11px;">点击下方 "添加标签" 创建新标签</span>';
                return;
            }
            
            // 按标签值排序
            self.tempTags.sort(function(a, b) { return a.value.localeCompare(b.value); });
            
            for (var i = 0; i < self.tempTags.length; i++) {
                (function(idx) {
                    var tag = self.tempTags[idx];
                    
                    var row = tagsContainer.createEl('div');
                    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;padding:8px 10px;background:white;border-radius:6px;align-items:center;flex-wrap:wrap;border:1px solid #e8e8e8;';
                    
                    var colorPreview = row.createEl('span');
                    colorPreview.style.cssText = 'display:inline-block;width:16px;height:16px;border-radius:50%;background:' + (tag.color || '#4a90e2') + ';border:1px solid #ddd;flex-shrink:0;';
                    
                    var valueInput = row.createEl('input', { type: 'text', value: tag.value, placeholder: '标签值（唯一标识）' });
                    valueInput.style.cssText = 'flex:1;min-width:70px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
                    valueInput.addEventListener('change', function() {
                        var newValue = valueInput.value.trim();
                        if (newValue) {
                            // 检查冲突
                            var conflict = false;
                            for (var j = 0; j < self.tempTags.length; j++) {
                                if (j !== idx && self.tempTags[j].value === newValue) {
                                    conflict = true;
                                    break;
                                }
                            }
                            if (!conflict) {
                                self.tempTags[idx].value = newValue;
                            } else {
                                new obsidian.Notice('标签值 "' + newValue + '" 已存在');
                                valueInput.value = self.tempTags[idx].value;
                            }
                        }
                    });
                    
                    var labelInput = row.createEl('input', { type: 'text', value: tag.label || tag.value, placeholder: '显示文字' });
                    labelInput.style.cssText = 'flex:1;min-width:70px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
                    labelInput.addEventListener('change', function() {
                        self.tempTags[idx].label = labelInput.value.trim() || labelInput.value;
                    });
                    
                    var colorInput = row.createEl('input', { type: 'color', value: tag.color || '#4a90e2' });
                    colorInput.style.cssText = 'width:36px;height:30px;border:1px solid #ddd;border-radius:4px;cursor:pointer;padding:0;';
                    colorInput.addEventListener('change', function() {
                        self.tempTags[idx].color = colorInput.value;
                        colorPreview.style.background = colorInput.value;
                    });
                    
                    var delBtn = row.createEl('button', { text: '✕' });
                    delBtn.style.cssText = 'padding:2px 8px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;line-height:1.4;';
                    delBtn.addEventListener('click', function() {
                        self.tempTags.splice(idx, 1);
                        renderTagList();
                    });
                })(i);
            }
        }
        
        renderTagList();
        
        var btnRow1 = el.createEl('div');
        btnRow1.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;';
        
        var addBtn = btnRow1.createEl('button', { text: '+ 添加标签' });
        addBtn.style.cssText = 'flex:1;padding:8px 16px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;';
        addBtn.addEventListener('click', function() {
            self.tempTags.push({ value: '新标签_' + Date.now(), label: '🏷️ 新标签', color: '#4a90e2' });
            renderTagList();
            tagsContainer.scrollTop = tagsContainer.scrollHeight;
        });
        
        var resetBtn = btnRow1.createEl('button', { text: '↺ 重置为默认标签' });
        resetBtn.style.cssText = 'padding:8px 16px;background:#e67e22;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;';
        resetBtn.addEventListener('click', function() {
            if (confirm('重置将覆盖当前所有标签，确定吗？')) {
                self.tempTags = JSON.parse(JSON.stringify(DEFAULT_EVENT_TAGS));
                renderTagList();
            }
        });
        
        var btnRow2 = el.createEl('div');
        btnRow2.style.cssText = 'display:flex;gap:10px;margin-top:5px;';
        
        var saveBtn = btnRow2.createEl('button', { text: '✅ 保存' });
        saveBtn.style.cssText = 'flex:2;padding:10px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
        saveBtn.addEventListener('click', async function() {
            var validTags = [];
            for (var i = 0; i < self.tempTags.length; i++) {
                var tag = self.tempTags[i];
                if (tag.value && tag.value.trim()) {
                    validTags.push({
                        value: tag.value.trim(),
                        label: tag.label || tag.value.trim(),
                        color: tag.color || '#4a90e2'
                    });
                }
            }
            
            var retainedValues = validTags.map(function(t) { return t.value; });
            var removedValues = self.originalTagValues.filter(function(v) { return retainedValues.indexOf(v) < 0; });
            var tombstones = Array.isArray(self.plugin.settings.deletedEventTagValues) ? self.plugin.settings.deletedEventTagValues.slice() : [];
            removedValues.forEach(function(v) { if (tombstones.indexOf(v) < 0) tombstones.push(v); });
            // 新增/重新添加的标签解除删除标记
            retainedValues.forEach(function(v) { tombstones = tombstones.filter(function(x) { return x !== v; }); });
            self.plugin.settings.deletedEventTagValues = tombstones;
            self.plugin.settings.eventTagsCustomized = true;
            self.plugin.settings.customEventTags = validTags;
            await self.plugin.saveSettings();
            invalidateTagCache(self.plugin);
            if (self.onSave) self.onSave();
            self.close();
            new obsidian.Notice('标签已保存！共 ' + validTags.length + ' 个标签');
        });
        
        var cancelBtn = btnRow2.createEl('button', { text: '取消' });
        cancelBtn.style.cssText = 'flex:1;padding:10px;background:#888;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
        cancelBtn.addEventListener('click', function() { self.close(); });
    };
    
    EventTagModal.prototype.onClose = function() {
        this.contentEl.empty();
    };
    
    return EventTagModal;
}(obsidian.Modal));

// ========== 关系类型管理弹窗 ==========
var RelationTypeModal = /** @class */ (function (_super) {
    __extends(RelationTypeModal, _super);
    function RelationTypeModal(app, plugin, onSave) {
        var _this = _super.call(this, app) || this;
        _this.plugin = plugin;
        _this.onSave = onSave;
        var existing = plugin.settings.customRelationTypes || '';
        _this.tempTypes = existing ? existing.split(',').map(function(s) { return s.trim(); }) : 
            ['父子', '母子', '父女', '母女', '兄弟', '姐妹', '夫妻', '恋人', '朋友', '敌人'];
        return _this;
    }

    RelationTypeModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.style.cssText = 'padding:20px;min-width:400px;max-height:80vh;overflow-y:auto;';
        
        el.createEl('h3', { text: '📌 管理关系类型' }).style.cssText = 'margin:0 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;';
        
        var helpText = el.createEl('p', { text: '添加、编辑或删除关系类型。这些类型将显示在关系编辑下拉菜单中。' });
        helpText.style.cssText = 'font-size:12px;color:#666;margin-bottom:12px;';
        
        var container = el.createEl('div');
        container.style.cssText = 'margin-bottom:12px;max-height:300px;overflow-y:auto;border:1px solid #e8e8e8;border-radius:6px;padding:10px;background:#fafafa;';
        
        function renderList() {
            container.empty();
            if (self.tempTypes.length === 0) {
                var emptyMsg = container.createEl('div');
                emptyMsg.style.cssText = 'text-align:center;color:#999;padding:20px;';
                emptyMsg.createEl('span', { text: '暂无关系类型，点击下方按钮添加' });
                return;
            }
            for (var i = 0; i < self.tempTypes.length; i++) {
                (function(idx) {
                    var row = container.createEl('div');
                    row.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;align-items:center;';
                    
                    var input = row.createEl('input', { type: 'text', value: self.tempTypes[idx] });
                    input.style.cssText = 'flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:4px;font-size:13px;';
                    input.addEventListener('change', function() {
                        self.tempTypes[idx] = input.value.trim();
                    });
                    
                    var delBtn = row.createEl('button', { text: '✕' });
                    delBtn.style.cssText = 'padding:2px 10px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
                    delBtn.addEventListener('click', function() {
                        self.tempTypes.splice(idx, 1);
                        renderList();
                    });
                })(i);
            }
        }
        renderList();
        
        var addBtn = el.createEl('button', { text: '+ 添加类型' });
        addBtn.style.cssText = 'padding:8px 16px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;margin-bottom:12px;width:100%;font-size:13px;';
        addBtn.addEventListener('click', function() {
            self.tempTypes.push('新类型');
            renderList();
            container.scrollTop = container.scrollHeight;
        });
        
        var btnRow = el.createEl('div');
        btnRow.style.cssText = 'display:flex;gap:10px;margin-top:5px;';
        
        var saveBtn = btnRow.createEl('button', { text: '✅ 保存' });
        saveBtn.style.cssText = 'flex:2;padding:10px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
        saveBtn.addEventListener('click', function() {
            var validTypes = self.tempTypes.filter(function(t) { return t && t.trim(); });
            self.plugin.settings.customRelationTypes = validTypes.join(',');
            self.plugin.saveSettings();
            if (self.onSave) self.onSave();
            self.close();
            new obsidian.Notice('关系类型已保存');
        });
        
        var cancelBtn = btnRow.createEl('button', { text: '取消' });
        cancelBtn.style.cssText = 'flex:1;padding:10px;background:#888;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
        cancelBtn.addEventListener('click', function() { self.close(); });
    };
    
    RelationTypeModal.prototype.onClose = function() {
        this.contentEl.empty();
    };
    
    return RelationTypeModal;
}(obsidian.Modal));

// ========== 亲密度等级管理弹窗 ==========
var IntimacyLevelModal = /** @class */ (function (_super) {
    __extends(IntimacyLevelModal, _super);
    function IntimacyLevelModal(app, plugin, onSave) {
        var _this = _super.call(this, app) || this;
        _this.plugin = plugin;
        _this.onSave = onSave;
        var existing = plugin.settings.customIntimacyLevels || '';
        if (existing) {
            var parts = existing.split(',').map(function(s) { return s.trim(); });
            _this.tempLevels = [];
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i].split(':');
                if (p.length >= 3) {
                    _this.tempLevels.push({
                        value: parseInt(p[0]),
                        label: p[1],
                        color: p[2]
                    });
                }
            }
            if (_this.tempLevels.length === 0) {
                _this.tempLevels = [
                    { value: -3, label: '仇恨', color: '#c0392b' },
                    { value: -2, label: '厌恶', color: '#e67e22' },
                    { value: -1, label: '冷淡', color: '#f39c12' },
                    { value: 0, label: '陌生', color: '#95a5a6' },
                    { value: 1, label: '认识', color: '#4a90e2' },
                    { value: 2, label: '一般', color: '#2ecc71' },
                    { value: 3, label: '友好', color: '#27ae60' },
                    { value: 4, label: '亲密', color: '#e74c3c' },
                    { value: 5, label: '挚友', color: '#9b59b6' }
                ];
            }
        } else {
            _this.tempLevels = [
                { value: -3, label: '仇恨', color: '#c0392b' },
                { value: -2, label: '厌恶', color: '#e67e22' },
                { value: -1, label: '冷淡', color: '#f39c12' },
                { value: 0, label: '陌生', color: '#95a5a6' },
                { value: 1, label: '认识', color: '#4a90e2' },
                { value: 2, label: '一般', color: '#2ecc71' },
                { value: 3, label: '友好', color: '#27ae60' },
                { value: 4, label: '亲密', color: '#e74c3c' },
                { value: 5, label: '挚友', color: '#9b59b6' }
            ];
        }
        return _this;
    }

    IntimacyLevelModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.style.cssText = 'padding:20px;min-width:500px;max-height:80vh;overflow-y:auto;';
        
        el.createEl('h3', { text: '❤️ 管理亲密度等级' }).style.cssText = 'margin:0 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;';
        
        var helpText = el.createEl('p', { text: '添加、编辑或删除亲密度等级。数值越小表示关系越疏远，越大表示越亲密。' });
        helpText.style.cssText = 'font-size:12px;color:#666;margin-bottom:12px;';
        
        var container = el.createEl('div');
        container.style.cssText = 'margin-bottom:12px;max-height:350px;overflow-y:auto;border:1px solid #e8e8e8;border-radius:6px;padding:10px;background:#fafafa;';
        
        function renderList() {
            container.empty();
            
            if (self.tempLevels.length === 0) {
                var emptyMsg = container.createEl('div');
                emptyMsg.style.cssText = 'text-align:center;color:#999;padding:20px;';
                emptyMsg.createEl('span', { text: '暂无亲密度等级，点击下方按钮添加' });
                return;
            }
            
            self.tempLevels.sort(function(a, b) { return a.value - b.value; });
            
            for (var i = 0; i < self.tempLevels.length; i++) {
                (function(idx) {
                    var level = self.tempLevels[idx];
                    var row = container.createEl('div');
                    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;padding:8px 10px;background:white;border-radius:6px;align-items:center;flex-wrap:wrap;border:1px solid #e8e8e8;';
                    
                    var colorPreview = row.createEl('span');
                    colorPreview.style.cssText = 'display:inline-block;width:16px;height:16px;border-radius:50%;background:' + (level.color || '#4a90e2') + ';border:1px solid #ddd;flex-shrink:0;';
                    
                    var valueInput = row.createEl('input', { type: 'number', value: level.value, placeholder: '数值' });
                    valueInput.style.cssText = 'width:60px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
                    valueInput.addEventListener('change', function() {
                        self.tempLevels[idx].value = parseInt(valueInput.value) || 0;
                    });
                    
                    var labelInput = row.createEl('input', { type: 'text', value: level.label, placeholder: '标签（如：亲密）' });
                    labelInput.style.cssText = 'flex:1;min-width:80px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
                    labelInput.addEventListener('change', function() {
                        self.tempLevels[idx].label = labelInput.value.trim() || labelInput.value;
                    });
                    
                    var colorInput = row.createEl('input', { type: 'color', value: level.color || '#4a90e2' });
                    colorInput.style.cssText = 'width:36px;height:30px;border:1px solid #ddd;border-radius:4px;cursor:pointer;padding:0;';
                    colorInput.addEventListener('change', function() {
                        self.tempLevels[idx].color = colorInput.value;
                        colorPreview.style.background = colorInput.value;
                    });
                    
                    var delBtn = row.createEl('button', { text: '✕' });
                    delBtn.style.cssText = 'padding:2px 8px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
                    delBtn.addEventListener('click', function() {
                        self.tempLevels.splice(idx, 1);
                        renderList();
                    });
                })(i);
            }
        }
        
        renderList();
        
        var btnRow1 = el.createEl('div');
        btnRow1.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;';
        
        var addBtn = btnRow1.createEl('button', { text: '+ 添加等级' });
        addBtn.style.cssText = 'flex:1;padding:8px 16px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;';
        addBtn.addEventListener('click', function() {
            var maxVal = 0;
            for (var i = 0; i < self.tempLevels.length; i++) {
                if (self.tempLevels[i].value > maxVal) maxVal = self.tempLevels[i].value;
            }
            self.tempLevels.push({ value: maxVal + 1, label: '新等级', color: '#4a90e2' });
            renderList();
            container.scrollTop = container.scrollHeight;
        });
        
        var resetBtn = btnRow1.createEl('button', { text: '↺ 恢复默认' });
        resetBtn.style.cssText = 'padding:8px 16px;background:#e67e22;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;';
        resetBtn.addEventListener('click', function() {
            if (confirm('恢复默认将清除所有自定义等级，确定吗？')) {
                self.tempLevels = [
                    { value: -3, label: '仇恨', color: '#c0392b' },
                    { value: -2, label: '厌恶', color: '#e67e22' },
                    { value: -1, label: '冷淡', color: '#f39c12' },
                    { value: 0, label: '陌生', color: '#95a5a6' },
                    { value: 1, label: '认识', color: '#4a90e2' },
                    { value: 2, label: '一般', color: '#2ecc71' },
                    { value: 3, label: '友好', color: '#27ae60' },
                    { value: 4, label: '亲密', color: '#e74c3c' },
                    { value: 5, label: '挚友', color: '#9b59b6' }
                ];
                renderList();
            }
        });
        
        var btnRow2 = el.createEl('div');
        btnRow2.style.cssText = 'display:flex;gap:10px;margin-top:5px;';
        
        var saveBtn = btnRow2.createEl('button', { text: '✅ 保存' });
        saveBtn.style.cssText = 'flex:2;padding:10px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
        saveBtn.addEventListener('click', function() {
            var validLevels = [];
            for (var i = 0; i < self.tempLevels.length; i++) {
                var lvl = self.tempLevels[i];
                if (lvl.label && lvl.label.trim()) {
                    validLevels.push({
                        value: lvl.value,
                        label: lvl.label.trim(),
                        color: lvl.color || '#4a90e2'
                    });
                }
            }
            validLevels.sort(function(a, b) { return a.value - b.value; });
            
            var str = validLevels.map(function(l) {
                return l.value + ':' + l.label + ':' + l.color;
            }).join(',');
            
            self.plugin.settings.customIntimacyLevels = str;
            self.plugin.saveSettings();
            updateIntimacyLevels(str);
            if (self.onSave) self.onSave();
            self.close();
            new obsidian.Notice('亲密度等级已保存');
        });
        
        var cancelBtn = btnRow2.createEl('button', { text: '取消' });
        cancelBtn.style.cssText = 'flex:1;padding:10px;background:#888;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
        cancelBtn.addEventListener('click', function() { self.close(); });
    };
    
    IntimacyLevelModal.prototype.onClose = function() {
        this.contentEl.empty();
    };
    
    return IntimacyLevelModal;
}(obsidian.Modal));

// ========== 设置页 ==========
var SettingTab = /** @class */ (function (_super) {
    __extends(SettingTab, _super);
    function SettingTab(app, plugin) {
        var _this = _super.call(this, app, plugin) || this;
        _this.plugin = plugin;
        return _this;
    }

    SettingTab.prototype.display = function () {
        var el = this.containerEl;
        var self = this;
        el.empty();
        el.createEl('h2', { text: '人物关系谱系 - 设置' });

el.createEl('p', { 
    text: '💡 不同场景 = 不同文件夹。指定「数据文件夹」后，插件读取该文件夹下的 md 文件；留空则跟随当前打开的笔记所在文件夹。' 
}).style.cssText = 'background:var(--background-secondary);padding:12px 16px;border-radius:6px;border-left:3px solid var(--interactive-accent);margin-bottom:15px;font-size:13px;';

        new obsidian.Setting(el)
            .setName('实体数据文件夹')
            .setDesc('如：小说世界、生活日记、知识库（留空=当前笔记文件夹）')
            .addText(function(text) {
                text.setPlaceholder('小说世界')
                    .setValue(self.plugin.settings.charFolder || '')
                    .onChange(async function(value) {
                        self.plugin.settings.charFolder = value.trim();
                        await self.plugin.saveSettings();
                        self.updatePathHint();
                    });
            });

        new obsidian.Setting(el)
            .setName('实体索引文件名')
            .setDesc('默认：人物索引.md（知识场景可用 概念索引.md）')
            .addText(function(text) {
                text.setPlaceholder('人物索引.md')
                    .setValue(self.plugin.settings.charFile || '人物索引.md')
                    .onChange(async function(value) {
                        self.plugin.settings.charFile = value.trim() || '人物索引.md';
                        await self.plugin.saveSettings();
                        self.updatePathHint();
                    });
            });

        new obsidian.Setting(el)
            .setName('时间线数据文件夹')
            .setDesc('通常与实体文件夹相同；也可单独指定')
            .addText(function(text) {
                text.setPlaceholder('（默认同实体文件夹）')
                    .setValue(self.plugin.settings.timelineFolder || '')
                    .onChange(async function(value) {
                        self.plugin.settings.timelineFolder = value.trim();
                        await self.plugin.saveSettings();
                        self.updatePathHint();
                    });
            });

        new obsidian.Setting(el)
            .setName('时间线文件名')
            .setDesc('默认：时间线.md（日记可用 日记时间线.md）')
            .addText(function(text) {
                text.setPlaceholder('时间线.md')
                    .setValue(self.plugin.settings.timelineFile || '时间线.md')
                    .onChange(async function(value) {
                        self.plugin.settings.timelineFile = value.trim() || '时间线.md';
                        await self.plugin.saveSettings();
                        self.updatePathHint();
                    });
            });

        el.createEl('h3', { text: '资料文件位置' });
        el.createEl('p', { text: '为世界观资料、大纲和抽签池分别指定 Vault 内的 Markdown 文件路径。文件移动后只需更新这里；路径失效时插件不会自动创建同名副本。', cls: 'my-char-muted' });
        function addManagedMarkdownSetting(label, key, fallback, initial, desc) {
            var setting = new obsidian.Setting(el).setName(label).setDesc(desc + ' · 可填写相对 Vault 根目录的路径');
            setting.addText(function(text) { text.setPlaceholder(fallback).setValue(self.plugin.settings[key] || fallback).onChange(async function(value) { self.plugin.settings[key] = value.trim(); await self.plugin.saveSettings(); }); });
            setting.addButton(function(button) { button.setButtonText('创建文件').onClick(async function() { var path = rwConfiguredPath(self.plugin, key, fallback); try { var existing = rwGetVaultFile(self.app, path); if (existing) { new obsidian.Notice('文件已存在：' + path); return; } await rwCreateConfiguredMarkdown(self.app, path, initial); new obsidian.Notice('已创建：' + path); } catch (e) { showUserError('创建资料文件失败', e); } }); });
        }
        addManagedMarkdownSetting('世界观资料文件', 'worldbuildingFilePath', RW_WORLD_FILE, rwBuildWorldMarkdown([], ''), '世界观结构化资料卡');
        addManagedMarkdownSetting('抽签池文件', 'drawPoolFilePath', RW_DRAW_FILE, rwDefaultDrawMarkdown(), '抽签分类和候选内容');
        addManagedMarkdownSetting('故事大纲文件', 'outlineFilePath', RW_OUTLINE_FILE, '# 故事大纲\n\n## 第一幕：建置\n\n## 第二幕：对抗\n\n## 第三幕：解决\n', '章节、幕与情节结构');

        new obsidian.Setting(el)
            .setName('Obsidian 图谱节点文件夹')
            .setDesc('同步生成的独立笔记存放位置（含 [[双向链接]]，供原生图谱使用）')
            .addText(function(text) {
                text.setPlaceholder('（默认：数据文件夹/关系图谱节点）')
                    .setValue(self.plugin.settings.graphNotesFolder || '')
                    .onChange(async function(value) {
                        self.plugin.settings.graphNotesFolder = value.trim();
                        await self.plugin.saveSettings();
                        self.updatePathHint();
                    });
            });

        new obsidian.Setting(el)
            .setName('保存时自动同步图谱')
            .setDesc('默认关闭。开启后编辑关系/阵营会自动同步并创建人物独立笔记；关闭时只有手动点击同步按钮才会创建。')
            .addToggle(function(toggle) {
                toggle.setValue(self.plugin.settings.syncGraphOnSave === true && self.plugin.settings.graphAutoSyncExplicitlyEnabled === true);
                toggle.onChange(async function(value) {
                    self.plugin.settings.syncGraphOnSave = value;
                    self.plugin.settings.graphAutoSyncExplicitlyEnabled = true;
                    await self.plugin.saveSettings();
                });
            });

        new obsidian.Setting(el)
            .setName('图谱同步范围')
            .setDesc('选择哪些人物「类型」同步到 Obsidian 原生图谱（如只同步主角、配角，跳过龙套）')
            .addDropdown(function(dropdown) {
                dropdown.addOption('all', '全部类型');
                dropdown.addOption('selected', '仅同步选中的类型');
                dropdown.setValue(self.plugin.settings.graphSyncMode || 'all');
                dropdown.onChange(async function(value) {
                    self.plugin.settings.graphSyncMode = value;
                    await self.plugin.saveSettings();
                    self.display();
                });
            });

        var graphTypePanel = el.createEl('div', { cls: 'my-char-graph-sync-settings' });
        if (isGraphSyncModeSelected(self.plugin)) {
            graphTypePanel.createEl('p', { text: '勾选要同步到原生图谱的人物类型（基于人物文件中的「类型」字段）：' })
                .style.cssText = 'font-size:12px;color:var(--text-muted);margin:0 0 8px;';
            loadCharsForGraphSettings(self.app, self.plugin).then(function(chars) {
                graphTypePanel.empty();
                graphTypePanel.createEl('p', { text: '勾选要同步到原生图谱的人物类型（基于人物文件中的「类型」字段）：' })
                    .style.cssText = 'font-size:12px;color:var(--text-muted);margin:0 0 8px;';
                if (!chars || chars.length === 0) {
                    graphTypePanel.createEl('p', { text: '暂无人物数据，请先打开视图刷新或检查人物索引文件路径。' })
                        .style.cssText = 'font-size:12px;color:var(--text-muted);';
                    return;
                }
                var mockView = { chars: chars };
                var typeOptions = collectCharTypesForGraph(mockView);
                var selected = self.plugin.settings.graphSyncTypes || [];
                var checksWrap = graphTypePanel.createEl('div', { cls: 'my-char-graph-type-checks' });
                for (var ti = 0; ti < typeOptions.length; ti++) {
                    (function(opt) {
                        var label = checksWrap.createEl('label', { cls: 'my-char-graph-type-check' });
                        var cb = label.createEl('input', { type: 'checkbox' });
                        cb.checked = selected.indexOf(opt.label) !== -1;
                        label.createEl('span', { text: opt.label + ' (' + opt.count + ')' });
                        cb.addEventListener('change', async function() {
                            var list = (self.plugin.settings.graphSyncTypes || []).slice();
                            var idx = list.indexOf(opt.label);
                            if (cb.checked && idx === -1) list.push(opt.label);
                            if (!cb.checked && idx !== -1) list.splice(idx, 1);
                            self.plugin.settings.graphSyncTypes = list;
                            self.plugin.settings.graphSyncMode = 'selected';
                            await self.plugin.saveSettings();
                        });
                    })(typeOptions[ti]);
                }
                var quickRow = graphTypePanel.createEl('div');
                quickRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;';
                var selectAllBtn = quickRow.createEl('button', { text: '全选' });
                selectAllBtn.className = 'mod-cta';
                selectAllBtn.style.fontSize = '11px';
                selectAllBtn.addEventListener('click', async function() {
                    self.plugin.settings.graphSyncTypes = typeOptions.map(function(t) { return t.label; });
                    await self.plugin.saveSettings();
                    self.display();
                });
                var clearBtn = quickRow.createEl('button', { text: '清空' });
                clearBtn.style.fontSize = '11px';
                clearBtn.addEventListener('click', async function() {
                    self.plugin.settings.graphSyncTypes = [];
                    await self.plugin.saveSettings();
                    self.display();
                });
            });
        } else {
            graphTypePanel.createEl('p', { text: '当前为「全部类型」模式，所有人物都会同步到原生图谱。' })
                .style.cssText = 'font-size:12px;color:var(--text-muted);margin:0 0 12px;';
        }

        el.createEl('h3', { text: '📦 一键创建场景模板' }).style.cssText = 'margin-top:20px;font-size:14px;font-weight:bold;';
        el.createEl('p', { text: '在库中创建独立文件夹 + 示例 md + 图谱节点，并自动切换数据源路径。' })
            .style.cssText = 'font-size:12px;color:var(--text-muted);margin:0 0 10px;';

        var tplRow = el.createEl('div');
        tplRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:15px;';
        var tplModes = [
            { id: 'novel', label: '📖 小说' },
            { id: 'diary', label: '📔 日记' },
            { id: 'trpg', label: '🎲 跑团' },
            { id: 'knowledge', label: '🧠 知识库' }
        ];
        for (var tmi = 0; tmi < tplModes.length; tmi++) {
            (function(m) {
                var btn = tplRow.createEl('button', { text: m.label });
                btn.className = 'mod-cta';
                btn.style.cssText = 'padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;';
                btn.addEventListener('click', async function() {
                    if (!confirm('将在库根目录创建「' + SCENARIO_TEMPLATES[m.id].folder + '」文件夹及示例文件，是否继续？')) return;
                    var folder = await createScenarioTemplate(self.app, self.plugin, m.id);
                    if (folder) {
                        new obsidian.Notice('✅ 已创建「' + folder + '」并切换数据源');
                        self.updatePathHint();
                        self.display();
                    }
                });
            })(tplModes[tmi]);
        }

        var syncGraphBtn = el.createEl('button', { text: '🔄 立即同步到 Obsidian 图谱' });
        syncGraphBtn.style.cssText = 'margin-bottom:15px;padding:8px 16px;background:var(--interactive-accent);color:var(--text-on-accent);border:none;border-radius:4px;cursor:pointer;width:100%;';
        syncGraphBtn.addEventListener('click', async function() {
            var leaves = self.app.workspace.getLeavesOfType(VIEW_TYPE);
            if (leaves.length === 0) {
                new obsidian.Notice('请先打开人物关系视图并刷新数据');
                return;
            }
            var view = leaves[0].view;
            await view.loadAllData();
            var res = await syncGraphNotesToVault(self.plugin, view);
            new obsidian.Notice(formatGraphSyncNotice(res));
        });

        var openGraphBtn = el.createEl('button', { text: '🌐 打开 Obsidian 原生全局图谱' });
        openGraphBtn.style.cssText = 'margin-bottom:15px;padding:8px 16px;background:var(--background-modifier-border);color:var(--text-normal);border:none;border-radius:4px;cursor:pointer;width:100%;';
        openGraphBtn.addEventListener('click', async function() {
            await openObsidianGlobalGraph(self.app, getGraphNotesFolder(self.plugin));
        });

        el.createEl('hr');

        var pathHint = el.createEl('div');
        pathHint.style.cssText = 'margin:10px 0 15px;padding:10px;background:var(--background-secondary);border-radius:6px;font-size:12px;color:var(--text-normal);border-left:3px solid var(--interactive-accent);';
        
        this.updatePathHint = function() {
            var charFullPath = getCharFullPath(this.plugin);
            var timelineFullPath = getTimelineFullPath(this.plugin);
            var graphFolder = getGraphNotesFolder(this.plugin);
            pathHint.innerHTML = '📍 <strong>当前完整路径</strong><br>' +
                '• 实体文件：<code style="background:var(--background-modifier-border);padding:2px 4px;border-radius:3px;">' + charFullPath + '</code><br>' +
                '• 时间线文件：<code style="background:var(--background-modifier-border);padding:2px 4px;border-radius:3px;">' + timelineFullPath + '</code><br>' +
                '• 图谱节点：<code style="background:var(--background-modifier-border);padding:2px 4px;border-radius:3px;">' + graphFolder + '</code>';
        }.bind(this);
        this.updatePathHint();

        el.createEl('hr');

        el.createEl('h3', { text: '🏷️ 事件标签配置' }).style.cssText = 'margin-top:10px;font-size:14px;font-weight:bold;color:#9b59b6;';
        
        new obsidian.Setting(el)
            .setName('管理事件标签（可视化）')
            .setDesc('完全自由添加、编辑或删除时间线事件标签')
            .addButton(function (btn) {
                btn.setButtonText('🏷️ 管理标签')
                    .setCta()
                    .onClick(function () {
                        var modal = new EventTagModal(self.app, self.plugin, function() {
                            invalidateTagCache(self.plugin);
                            refreshCharView(self.app);
                        });
                        modal.open();
                    });
            });

        el.createEl('hr');

        el.createEl('h3', { text: '📌 关系类型配置' }).style.cssText = 'margin-top:10px;font-size:14px;font-weight:bold;color:#e67e22;';
        
        new obsidian.Setting(el)
            .setName('管理关系类型（可视化）')
            .setDesc('在可视化界面中添加、编辑或删除关系类型列表')
            .addButton(function (btn) {
                btn.setButtonText('📌 管理关系类型')
                    .setCta()
                    .onClick(function () {
                        var modal = new RelationTypeModal(self.app, self.plugin, function() {
                            refreshCharView(self.app);
                        });
                        modal.open();
                    });
            });

        el.createEl('hr');

        el.createEl('h3', { text: '❤️ 亲密度等级配置' }).style.cssText = 'margin-top:10px;font-size:14px;font-weight:bold;color:#e74c3c;';

        new obsidian.Setting(el)
            .setName('管理亲密度等级（可视化）')
            .setDesc('在可视化界面中添加、编辑或删除亲密度等级')
            .addButton(function (btn) {
                btn.setButtonText('❤️ 管理亲密度等级')
                    .setCta()
                    .onClick(function () {
                        var modal = new IntimacyLevelModal(self.app, self.plugin, function() {
                            refreshCharView(self.app);
                        });
                        modal.open();
                    });
            });

        el.createEl('hr');

        el.createEl('h3', { text: '⚙️ 其他配置' }).style.cssText = 'margin-top:10px;font-size:14px;font-weight:bold;color:#888;';

        new obsidian.Setting(el)
            .setName('从 MD 自动发现设定')
            .setDesc('加载时自动把人物字段、阵营、关系类型、事件标签同步到插件设定（无需手动逐个添加）')
            .addToggle(function (toggle) {
                toggle.setValue(self.plugin.settings.autoDiscoverFromMd !== false)
                    .onChange(async function (value) {
                        self.plugin.settings.autoDiscoverFromMd = value;
                        await self.plugin.saveSettings();
                    });
            });

        new obsidian.Setting(el)
            .setName('关系写入人物 MD')
            .setDesc('把关系与亲密度变化写成人物索引里的「### 关系 / ### 关系变化」表格，方便在 MD 里直接改；仍兼容旧的列表写法')
            .addToggle(function (toggle) {
                toggle.setValue(self.plugin.settings.syncRelationsToCharMd !== false)
                    .onChange(async function (value) {
                        self.plugin.settings.syncRelationsToCharMd = value;
                        await self.plugin.saveSettings();
                    });
            });

        new obsidian.Setting(el)
            .setName('时间线打开人物速查弹窗')
            .setDesc('进入时间线时显示可拖动的人物 Tab 弹窗，方便写作时查阅')
            .addToggle(function (toggle) {
                toggle.setValue(self.plugin.settings.timelineFloatChars !== false)
                    .onChange(async function (value) {
                        self.plugin.settings.timelineFloatChars = value;
                        await self.plugin.saveSettings();
                        refreshCharView(self.app);
                    });
            });

        new obsidian.Setting(el)
            .setName('人物字段显示顺序')
            .setDesc('自定义人物详情中字段的显示顺序，用逗号分隔')
            .addText(function (text) {
                text.setPlaceholder('身份,阵营,出生,死亡,亲密人物,首次出场')
                    .setValue(this.plugin.settings.customFields || '')
                    .onChange(async function (value) {
                        this.plugin.settings.customFields = value;
                        await this.plugin.saveSettings();
                    }.bind(this));
            }.bind(this));

        new obsidian.Setting(el)
            .setName('阵营字段名')
            .setDesc('人物文件中用于标识阵营的字段名')
            .addText(function (text) {
                text.setPlaceholder('阵营')
                    .setValue(this.plugin.settings.factionFieldName || '阵营')
                    .onChange(async function (value) {
                        this.plugin.settings.factionFieldName = value || '阵营';
                        await this.plugin.saveSettings();
                    }.bind(this));
            }.bind(this));

        new obsidian.Setting(el)
            .setName('死亡字段名')
            .setDesc('人物文件中用于标识死亡的字段名（支持多个，用逗号分隔）')
            .addText(function (text) {
                text.setPlaceholder('死亡,死亡时间')
                    .setValue(this.plugin.settings.deathFieldNames || '死亡,死亡时间')
                    .onChange(async function (value) {
                        this.plugin.settings.deathFieldNames = value || '死亡,死亡时间';
                        await this.plugin.saveSettings();
                    }.bind(this));
            }.bind(this));

        new obsidian.Setting(el)
            .setName('出生字段名')
            .setDesc('人物文件中用于标识出生的字段名（支持多个，用逗号分隔）')
            .addText(function (text) {
                text.setPlaceholder('出生,出生时间')
                    .setValue(this.plugin.settings.birthFieldNames || '出生,出生时间')
                    .onChange(async function (value) {
                        this.plugin.settings.birthFieldNames = value || '出生,出生时间';
                        await this.plugin.saveSettings();
                    }.bind(this));
            }.bind(this));

        new obsidian.Setting(el)
            .setName('首次出场字段名')
            .setDesc('人物文件中用于标识首次出场的字段名')
            .addText(function (text) {
                text.setPlaceholder('首次出场')
                    .setValue(this.plugin.settings.firstAppearFieldName || '首次出场')
                    .onChange(async function (value) {
                        this.plugin.settings.firstAppearFieldName = value || '首次出场';
                        await this.plugin.saveSettings();
                    }.bind(this));
            }.bind(this));

        new obsidian.Setting(el)
            .setName('亲密人物字段名')
            .setDesc('人物文件中用于标识亲密人物的字段名')
            .addText(function (text) {
                text.setPlaceholder('亲密人物')
                    .setValue(this.plugin.settings.intimateFieldName || '亲密人物')
                    .onChange(async function (value) {
                        this.plugin.settings.intimateFieldName = value || '亲密人物';
                        await this.plugin.saveSettings();
                    }.bind(this));
            }.bind(this));

        el.createEl('hr');

        el.createEl('h3', { text: '🎨 配置预设' }).style.cssText = 'margin-top:10px;font-size:14px;font-weight:bold;';
        
        new obsidian.Setting(el)
            .setName('快速切换预设')
            .setDesc('选择预设模板快速填充上面的配置（仅影响字段配置，不影响路径设置）')
            .addDropdown(function (dropdown) {
                dropdown.addOption('default', '默认（中国古风）');
                dropdown.addOption('fantasy', '西幻题材');
                dropdown.addOption('modern', '现代都市');
                dropdown.addOption('scifi', '科幻题材');
                dropdown.setValue(this.plugin.settings.preset || 'default');
                dropdown.onChange(async function (value) {
                    this.plugin.settings.preset = value;
                    
                    if (value === 'fantasy') {
                        this.plugin.settings.factionFieldName = '势力';
                        this.plugin.settings.customRelationTypes = '同盟,敌对,隶属,师徒,主仆,战友,宿敌';
                        this.plugin.settings.deathFieldNames = '陨落,死亡';
                        this.plugin.settings.birthFieldNames = '诞生,出生';
                        this.plugin.settings.firstAppearFieldName = '登场';
                        this.plugin.settings.intimateFieldName = '羁绊';
                    } else if (value === 'modern') {
                        this.plugin.settings.factionFieldName = '所属组织';
                        this.plugin.settings.customRelationTypes = '同事,上下级,朋友,恋人,家人,竞争对手';
                        this.plugin.settings.deathFieldNames = '去世,死亡';
                        this.plugin.settings.birthFieldNames = '出生';
                        this.plugin.settings.firstAppearFieldName = '首次出现';
                        this.plugin.settings.intimateFieldName = '亲密关系';
                    } else if (value === 'scifi') {
                        this.plugin.settings.factionFieldName = '所属势力';
                        this.plugin.settings.customRelationTypes = '同盟,敌对,从属,克隆,共生,竞争';
                        this.plugin.settings.deathFieldNames = '阵亡,销毁,死亡';
                        this.plugin.settings.birthFieldNames = '制造,出生,激活';
                        this.plugin.settings.firstAppearFieldName = '首次登场';
                        this.plugin.settings.intimateFieldName = '情感链接';
                    } else {
                        this.plugin.settings.factionFieldName = '阵营';
                        this.plugin.settings.customRelationTypes = '';
                        this.plugin.settings.deathFieldNames = '死亡,死亡时间';
                        this.plugin.settings.birthFieldNames = '出生,出生时间';
                        this.plugin.settings.firstAppearFieldName = '首次出场';
                        this.plugin.settings.intimateFieldName = '亲密人物';
                    }
                    
                    await this.plugin.saveSettings();
                    new obsidian.Notice('已切换预设，请刷新人物视图查看效果');
                }.bind(this));
            }.bind(this));

        var testBtn = el.createEl('button', { text: '🔍 测试文件路径' });
        testBtn.style.cssText = 'margin-top:15px;padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
        testBtn.addEventListener('click', async function() {
            var fullCharPath = getCharFullPath(this.plugin);
            var fullTimelinePath = getTimelineFullPath(this.plugin);
            
            var charExists = await this.app.vault.adapter.exists(fullCharPath);
            var timelineExists = await this.app.vault.adapter.exists(fullTimelinePath);
            
            var msg = '📁 路径测试结果：\n\n';
            msg += '👥 人物文件: ' + fullCharPath + '\n';
            msg += '   存在: ' + (charExists ? '✅ 是' : '❌ 否') + '\n\n';
            msg += '📅 时间线文件: ' + fullTimelinePath + '\n';
            msg += '   存在: ' + (timelineExists ? '✅ 是' : '❌ 否');
            
            new obsidian.Notice(msg, 8000);
        }.bind(this));

        el.createEl('h3', { text: '📖 文件格式示例' }).style.cssText = 'margin-top:20px;font-size:14px;font-weight:bold;';
        
        var formatNote = el.createEl('pre');
        formatNote.style.cssText = 'background:#f5f5f5;padding:10px;border-radius:6px;font-size:12px;overflow-x:auto;';
        formatNote.textContent = '## 张三\n' +
            '- 身份：皇帝\n' +
            '- 阵营：北境王国\n' +
            '- 首次出场：公元前300年\n' +
            '- 出生：公元前280年\n' +
            '- 死亡：前200年\n' +
            '- 亲密人物：李四\n' +
            '- 自定义字段：任意值\n\n' +
            '## 李四\n' +
            '- 身份：将军\n' +
            '- 阵营：北境王国\n' +
            '- 出生：290年\n\n' +
            '💡 时间支持：公元前280年、前100年、280年、公元100年';

        var timelineNote = el.createEl('pre');
        timelineNote.style.cssText = 'background:#f5f5f5;padding:10px;border-radius:6px;font-size:12px;overflow-x:auto;margin-top:10px;';
        timelineNote.textContent = '## 300年\n' +
            '### 春季：\n' +
            '- [战争] 张三率军出征\n' +
            '- [政治] 李四受封将军\n\n' +
            '### 秋季：\n' +
            '- [婚恋] 张三与某公主成婚\n\n' +
            '💡 标签使用 [标签名] 格式，标签名可在上方自定义';

        el.createEl('p', {
            text: '💾 阵营和关系数据保存在 .obsidian/plugins/' + this.plugin.manifest.id + '/data.json'
        }).style.cssText = 'color:#888;font-size:12px;margin-top:15px;';
    };

    return SettingTab;
}(obsidian.PluginSettingTab));

// ========== 主插件 ==========
var RelationWeaverPlugin = /** @class */ (function (_super) {
    __extends(RelationWeaverPlugin, _super);
    function RelationWeaverPlugin() {
        return _super !== null && _super.apply(this, arguments) || this;
    }

    RelationWeaverPlugin.prototype.onload = async function () {
        await this.loadSettings();

        this.registerView(VIEW_TYPE, function (leaf) {
            return new MyView(leaf, this);
        }.bind(this));

        this.addRibbonIcon('home', '创作工作台', function () {
            openCharView(this.app);
        }.bind(this));

        this.addCommand({
            id: 'open-char-view',
            name: '打开创作工作台',
            callback: function () {
                openCharView(this.app);
            }.bind(this)
        });

        this.addCommand({
            id: 'refresh-char-data',
            name: '刷新人物数据',
            callback: function () {
                refreshCharView(this.app);
            }.bind(this)
        });

        this.addCommand({
            id: 'sync-graph-notes',
            name: '同步关系到 Obsidian 原生图谱',
            callback: async function () {
                var leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
                if (leaves.length === 0) {
                    new obsidian.Notice('请先打开人物关系视图');
                    return;
                }
                var view = leaves[0].view;
                await view.loadAllData();
                var res = await syncGraphNotesToVault(this, view);
                new obsidian.Notice('✅ 已同步 ' + res.count + ' 个图谱节点');
            }.bind(this)
        });

        this.addCommand({
            id: 'open-native-graph',
            name: '打开 Obsidian 原生关系图谱',
            callback: async function () {
                await openObsidianGlobalGraph(this.app, getGraphNotesFolder(this));
            }.bind(this)
        });

        this.addCommand({
            id: 'open-global-search',
            name: '打开全局搜索',
            callback: function () {
                openCharViewAndRun(this.app, function(view) {
                    view.tab = 'search';
                    view.render();
                });
            }.bind(this)
        });

        this.addCommand({
            id: 'export-setting-collection',
            name: '导出设定集 Markdown',
            callback: function () {
                openCharViewAndRun(this.app, function(view) {
                    view.loadAllData().then(function() {
                        view.exportSettingCollection(false);
                    });
                });
            }.bind(this)
        });

        this.addCommand({
            id: 'print-setting-preview',
            name: '打开设定集打印预览',
            callback: function () {
                openCharViewAndRun(this.app, function(view) {
                    view.loadAllData().then(function() {
                        view.showPrintPreview();
                    });
                });
            }.bind(this)
        });

        this.addCommand({
            id: 'update-setting-collection',
            name: '一键更新设定集到 vault',
            callback: function () {
                openCharViewAndRun(this.app, function(view) {
                    view.loadAllData({ silent: true }).then(function() {
                        return view.updateSettingCollection();
                    });
                });
            }.bind(this)
        });

        this.addCommand({
            id: 'create-setting-snapshot',
            name: '创建设定快照（人物索引/时间线）',
            callback: function () {
                openCharViewAndRun(this.app, function(view) {
                    view.createDataSnapshot().catch(function(e) {
                        showUserError('创建快照失败', e);
                    });
                });
            }.bind(this)
        });

        this.addCommand({
            id: 'toggle-time-filter',
            name: '切换当前时间点过滤',
            callback: function () {
                var self = this;
                this.settings.timeFilterEnabled = !(this.settings.timeFilterEnabled !== false);
                this.saveSettings().then(function() {
                    new obsidian.Notice(self.settings.timeFilterEnabled !== false
                        ? '已开启时间过滤'
                        : '已关闭时间过滤');
                    refreshCharView(self.app, { silent: true });
                });
            }.bind(this)
        });

        var pluginRef = this;
        this.registerEvent(this.app.vault.on('modify', function(file) {
            var charPath = getCharFullPath(pluginRef);
            var timelinePath = getTimelineFullPath(pluginRef);
            if (file.path === charPath || file.path === timelinePath) {
                refreshCharView(pluginRef.app, { silent: true });
            }
        }));
        // 加载亲密度变化历史
        this._intimacyHistory = [];
        try {
            var historyPath = this.app.vault.configDir + '/plugins/' + this.manifest.id + '/intimacy_history.json';
            if (await this.app.vault.adapter.exists(historyPath)) {
                var content = await this.app.vault.adapter.read(historyPath);
                this._intimacyHistory = JSON.parse(content);
            }
        } catch(e) {
            console.log('读取变化历史失败:', e);
            this._intimacyHistory = [];
        }

        // 保存历史数据的函数
        this.saveIntimacyHistory = async function() {
            try {
                var dir = this.app.vault.configDir + '/plugins/' + this.manifest.id;
                if (!await this.app.vault.adapter.exists(dir)) {
                    await this.app.vault.adapter.mkdir(dir);
                }
                var path = dir + '/intimacy_history.json';
                await this.app.vault.adapter.write(path, JSON.stringify(this._intimacyHistory || [], null, 2));
            } catch(e) {
                console.log('保存变化历史失败:', e);
            }
        }.bind(this);
        this.addSettingTab(new SettingTab(this.app, this));
    };

    RelationWeaverPlugin.prototype.onunload = function () {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    };

    RelationWeaverPlugin.prototype.loadSettings = async function () {
        var defaults = { 
            charFile: '人物索引.md',
            charFolder: '',
            timelineFile: '时间线.md',
            timelineFolder: '',
            customFields: '',
            customRelationTypes: '',
            factionFieldName: '阵营',
            deathFieldNames: '死亡,死亡时间',
            birthFieldNames: '出生,出生时间',
            firstAppearFieldName: '首次出场',
            intimateFieldName: '亲密人物',
            preset: 'default',
            customEventTags: [],
            customIntimacyLevels: '',
            graphNotesFolder: '',
            worldbuildingFilePath: '', drawPoolFilePath: '', outlineFilePath: '', outlineTemplates: [{id:'general',name:'通用小说',fields:['本章目标','核心冲突','关键转折','出场人物','状态']}], activeOutlineTemplate: 'general',
            syncGraphOnSave: false, graphAutoSyncExplicitlyEnabled: false,
            graphSyncMode: 'all',
            graphSyncTypes: [],
            useCaseMode: 'novel',
            hiddenTabs: [],
            viewTitle: '',
            termLabels: {},
            tabLabels: {},
            currentTimePoint: '',
            timeFilterEnabled: true,
            settingCollectionFile: '设定集.md',
            novelCompactUI: true,
            topChromeCollapsed: false,
            timelineMode: 'auto',
            timelineEra: 'auto',
            syncRelationsToMd: true,
            syncFirstAppearOnEvent: true,
            relationMetaFile: '关系与阵营.md',
            novelTagPreset: 'gudai',
            autoDiscoverFromMd: true,
            syncRelationsToCharMd: true,
            timelineFloatChars: true,
            floatPanelPos: { x: 24, y: 120 }
        };
        this.settings = Object.assign({}, defaults, await this.loadData());
        ACTIVE_TIMELINE_ERA = this.settings.timelineEra || 'auto';
    };

    RelationWeaverPlugin.prototype.saveSettings = async function () {
        await this.saveData(this.settings);
    };

    return RelationWeaverPlugin;
}(obsidian.Plugin));
// ============================================================
// 🆕 亲密度动态演化 - 数据模型和工具函数
// ============================================================

// 生成唯一ID
function generateId() {
    return 'ih_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// 获取关系ID（用于关联变化记录）
function getRelationId(rel) {
    var names = [rel.charA, rel.charB].sort();
    return names[0] + '|||' + names[1];
}

// 获取关系的变化历史
function getRelationHistory(plugin, charA, charB) {
    var history = plugin._intimacyHistory || [];
    return history.filter(function(h) {
        return (h.charA === charA && h.charB === charB) || 
               (h.charA === charB && h.charB === charA);
    });
}

function getRecordSortValue(record) {
    var parsed = parseHistoricalDate(record.timestamp);
    if (parsed && parsed.sortValue !== null) return parsed.sortValue;
    if (record.eventYear) {
        var ep = parseHistoricalDate(record.eventYear);
        if (ep && ep.sortValue !== null) return ep.sortValue;
    }
    return null;
}

// 按时间排序（从旧到新；无法解析的时间排到最后）
function sortHistoryByTime(history) {
    return history.slice().sort(function(a, b) {
        var va = getRecordSortValue(a);
        var vb = getRecordSortValue(b);
        if (va !== null && vb !== null) return va - vb;
        if (va !== null) return -1;
        if (vb !== null) return 1;
        return (a.recordDate || '').localeCompare(b.recordDate || '');
    });
}

// 计算变化类型
function getChangeType(oldVal, newVal) {
    if (newVal > oldVal) return '提升 ⬆';
    if (newVal < oldVal) return '下降 ⬇';
    return '持平 ➡';
}

// 获取关系变化总数
function getChangeCount(history) {
    return history.length;
}

// 获取最近一次变化
function getLatestChange(history) {
    if (!history || history.length === 0) return null;
    var sorted = sortHistoryByTime(history);
    return sorted[sorted.length - 1];
}

// 获取关系变化摘要（用于显示）
function getChangeSummary(history) {
    if (!history || history.length === 0) return '无变化记录';
    var sorted = sortHistoryByTime(history);
    var metricSorted = sorted.filter(function(r) { return r.recordKind !== 'relation_type' && r.recordKind !== 'relation_pair'; });
    var latest = metricSorted.length ? metricSorted[metricSorted.length - 1] : sorted[sorted.length - 1];
    var changes = getChangeRecordsOnly(history);
    var total = changes.length;
    var label = getIntimacyLabel(latest.newValue);
    if (total === 0 && metricSorted.length === 0) return '有关系类型/双方调整记录';
    if (total === 0) return '已设起点，当前: ' + label;
    return '共' + total + '次变化，当前: ' + label;
}

function ensureIntimacyHistory(plugin) {
    if (!plugin._intimacyHistory) plugin._intimacyHistory = [];
    return plugin._intimacyHistory;
}

function addIntimacyRecord(plugin, record) {
    ensureIntimacyHistory(plugin).push(record);
}

function removeIntimacyRecord(plugin, recordId) {
    var history = ensureIntimacyHistory(plugin);
    var idx = history.findIndex(function(h) { return h.id === recordId; });
    if (idx !== -1) history.splice(idx, 1);
    return idx !== -1;
}

function recalcRelationIntimacyFromHistory(plugin, relation) {
    var history = getRelationHistory(plugin, relation.charA, relation.charB);
    if (history.length === 0) return relation.intimacy;
    var sorted = sortHistoryByTime(history);
    var latest = sorted[sorted.length - 1];
    relation.intimacy = latest.newValue;
    return relation.intimacy;
}

function isBaselineRecord(record) {
    return record.changeReason === '初始值设定';
}

function getBaselineValue(sorted) {
    for (var i = 0; i < sorted.length; i++) {
        if (isBaselineRecord(sorted[i])) return sorted[i].newValue;
    }
    return sorted.length > 0 ? sorted[0].oldValue : 0;
}

function getChangeRecordsOnly(history) {
    return history.filter(function(h) { return !isBaselineRecord(h) && h.recordKind !== 'relation_type' && h.recordKind !== 'relation_pair'; });
}

function buildTimelineEventOptions(view, charA, charB) {
    var timeline = view.timeline || [];
    var related = [];
    var other = [];
    for (var i = 0; i < timeline.length; i++) {
        var evt = timeline[i];
        var appeared = findCharsInEvent(evt.event, view.charNames || []);
        var hasA = appeared.indexOf(charA) !== -1;
        var hasB = appeared.indexOf(charB) !== -1;
        var item = {
            timelineIndex: i,
            volume: evt.volume,
            year: evt.year,
            month: evt.month,
            event: evt.event,
            tag: evt.tag || '',
            isRelated: hasA && hasB
        };
        if (item.isRelated) related.push(item);
        else other.push(item);
    }
    function sortEvents(list) {
        list.sort(function(a, b) {
            var ay = parseHistoricalDate(a.year);
            var by = parseHistoricalDate(b.year);
            var av = ay && ay.sortValue !== null ? ay.sortValue : 0;
            var bv = by && by.sortValue !== null ? by.sortValue : 0;
            return bv - av;
        });
    }
    sortEvents(related);
    sortEvents(other);
    return related.concat(other);
}

function createTimelineEventPicker(parent, view, charA, charB, onSelect) {
    var allEvents = buildTimelineEventOptions(view, charA, charB);
    var selectedEvt = null;
    var wrap = parent.createEl('div');
    wrap.style.cssText = 'border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;background:white;';

    var searchRow = wrap.createEl('div');
    searchRow.style.cssText = 'padding:6px 8px;border-bottom:1px solid #eee;background:#fafafa;';
    var searchInput = searchRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
    searchInput.placeholder = '搜索事件（支持全文）…';
    searchInput.style.cssText = 'width:100%;box-sizing:border-box;font-size:12px;';

    var hint = wrap.createEl('div');
    hint.style.cssText = 'padding:4px 10px;font-size:10px;color:#999;background:#fafafa;border-bottom:1px solid #eee;';
    var relatedCount = 0;
    for (var ri = 0; ri < allEvents.length; ri++) {
        if (allEvents[ri].isRelated) relatedCount++;
    }
    hint.textContent = relatedCount > 0
        ? '⭐ 优先显示两人共同出场的事件（' + relatedCount + ' 条），共 ' + allEvents.length + ' 条'
        : '共 ' + allEvents.length + ' 条事件，输入关键词筛选';

    var list = wrap.createEl('div');
    list.style.cssText = 'max-height:220px;overflow-y:auto;';

    function renderList(filter) {
        list.empty();
        var q = (filter || '').trim().toLowerCase();
        var shown = 0;
        var lastWasRelated = null;
        for (var i = 0; i < allEvents.length; i++) {
            var evt = allEvents[i];
            var hay = (evt.year + ' ' + evt.month + ' ' + evt.tag + ' ' + evt.event).toLowerCase();
            if (q && hay.indexOf(q) === -1) continue;
            if (lastWasRelated === true && !evt.isRelated && shown > 0) {
                var sep = list.createEl('div', { text: '— 其他事件 —' });
                sep.style.cssText = 'padding:4px 10px;font-size:10px;color:#bbb;background:#f5f5f5;text-align:center;';
            }
            lastWasRelated = evt.isRelated;
            shown++;
            (function(ev) {
                var row = list.createEl('div');
                var isSelected = selectedEvt && selectedEvt.timelineIndex === ev.timelineIndex;
                row.style.cssText = 'padding:8px 10px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:12px;line-height:1.4;' +
                    (isSelected ? 'background:#e8f4fd;' : (ev.isRelated ? 'background:#fffef5;' : 'background:white;'));
                row.title = ev.event;
                var timeSpan = document.createElement('span');
                timeSpan.style.cssText = 'color:#888;font-size:11px;margin-right:4px;';
                timeSpan.textContent = (ev.isRelated ? '⭐ ' : '') + ev.year + (ev.month && ev.month !== '未标注' ? '·' + ev.month : '') + ' ';
                row.appendChild(timeSpan);
                if (ev.tag) {
                    var tagSpan = document.createElement('span');
                    tagSpan.style.cssText = 'color:#9b59b6;font-size:10px;margin-right:4px;';
                    tagSpan.textContent = '[' + ev.tag + '] ';
                    row.appendChild(tagSpan);
                }
                row.appendChild(document.createTextNode(ev.event));
                row.addEventListener('click', function() {
                    selectedEvt = ev;
                    renderList(searchInput.value);
                    if (onSelect) onSelect(ev);
                });
            })(evt);
        }
        if (shown === 0) {
            list.createEl('div', { text: q ? '没有匹配的事件' : '暂无时间线事件' }).style.cssText = 'padding:20px;text-align:center;color:#999;font-size:12px;';
        }
    }

    searchInput.addEventListener('input', function() { renderList(searchInput.value); });
    renderList('');

    return {
        getSelected: function() { return selectedEvt; },
        clearSelection: function() { selectedEvt = null; renderList(searchInput.value); }
    };
}

function buildIntimacyCurvePoints(history) {
    var sorted = sortHistoryByTime(history);
    if (sorted.length === 0) return [];

    var points = [];
    var baselineRec = null;
    for (var bi = 0; bi < sorted.length; bi++) {
        if (isBaselineRecord(sorted[bi])) { baselineRec = sorted[bi]; break; }
    }

    if (baselineRec) {
        points.push({
            xLabel: baselineRec.timestamp || '起点',
            sortValue: getRecordSortValue(baselineRec),
            value: baselineRec.newValue,
            isBaseline: true,
            order: 0
        });
    } else {
        var first = sorted[0];
        points.push({
            xLabel: first.timestamp || '起点',
            sortValue: getRecordSortValue(first),
            value: first.oldValue !== undefined ? first.oldValue : first.newValue,
            isBaseline: false,
            order: 0
        });
    }

    var changeRecords = getChangeRecordsOnly(sorted);
    for (var i = 0; i < changeRecords.length; i++) {
        var rec = changeRecords[i];
        points.push({
            xLabel: rec.timestamp || ('变化' + (i + 1)),
            sortValue: getRecordSortValue(rec),
            value: rec.newValue,
            isBaseline: false,
            order: i + 1
        });
    }

    return points;
}

function assignChartXValues(points) {
    if (points.length === 0) return points;
    var dated = [];
    var undated = [];
    for (var i = 0; i < points.length; i++) {
        if (points[i].sortValue !== null && points[i].sortValue !== undefined) {
            dated.push(points[i]);
        } else {
            undated.push(points[i]);
        }
    }

    dated.sort(function(a, b) {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.order - b.order;
    });
    undated.sort(function(a, b) { return a.order - b.order; });

    var result = dated.slice();
    if (dated.length >= 2) {
        var minD = dated[0].sortValue;
        var maxD = dated[dated.length - 1].sortValue;
        var span = Math.max(maxD - minD, 1);
        var step = span / (undated.length + 1);
        for (var ui = 0; ui < undated.length; ui++) {
            undated[ui].chartX = maxD + step * (ui + 1);
            result.push(undated[ui]);
        }
        for (var di = 0; di < dated.length; di++) {
            dated[di].chartX = dated[di].sortValue;
        }
    } else if (dated.length === 1) {
        dated[0].chartX = dated[0].sortValue;
        for (var uj = 0; uj < undated.length; uj++) {
            undated[uj].chartX = dated[0].sortValue + (uj + 1);
            result.push(undated[uj]);
        }
    } else {
        for (var uk = 0; uk < undated.length; uk++) {
            undated[uk].chartX = uk;
            result.push(undated[uk]);
        }
    }

    result.sort(function(a, b) {
        if (a.chartX !== b.chartX) return a.chartX - b.chartX;
        return a.order - b.order;
    });
    return result;
}

function formatChartXLabel(sortValue, fallbackLabel) {
    if (sortValue === null || sortValue === undefined) return fallbackLabel || '?';
    return formatSortValue(sortValue);
}

function renderIntimacyCurveChart(container, history, options) {
    options = options || {};
    var width = options.width || 460;
    var height = options.height || 150;
    var compact = options.compact || false;
    var rawPoints = buildIntimacyCurvePoints(history);
    if (rawPoints.length === 0) return null;
    var points = assignChartXValues(rawPoints);
    if (points.length === 1) {
        var singleWrap = container.createEl('div');
        singleWrap.style.cssText = compact ? 'margin:4px 0;font-size:10px;color:#888;' : 'margin:12px 0;padding:10px;background:#fafbfc;border-radius:8px;border:1px solid #e8e8e8;font-size:12px;color:#666;';
        singleWrap.textContent = '📈 当前亲密度：' + getIntimacyLabel(points[0].value) + '（' + (points[0].xLabel || '仅一条记录') + '）';
        return singleWrap;
    }

    var minY = -3, maxY = 5;
    var padL = compact ? 24 : 36, padR = 12, padT = 10, padB = compact ? 14 : 36;
    var chartW = width - padL - padR;
    var chartH = height - padT - padB;

    var xVals = points.map(function(p) { return p.chartX; });
    var minX = Math.min.apply(null, xVals);
    var maxX = Math.max.apply(null, xVals);
    if (minX === maxX) { minX -= 1; maxX += 1; }

    function toX(v) { return padL + ((v - minX) / (maxX - minX)) * chartW; }
    function toY(v) { return padT + chartH - ((v - minY) / (maxY - minY)) * chartH; }

    var wrap = container.createEl('div');
    wrap.style.cssText = compact
        ? 'margin:4px 0 2px;'
        : 'margin:12px 0;padding:10px;background:#fafbfc;border-radius:8px;border:1px solid #e8e8e8;';
    if (!compact) {
        wrap.createEl('div', { text: '📈 亲密度变化曲线（按故事时间排序）' }).style.cssText = 'font-size:12px;font-weight:bold;margin-bottom:6px;color:#555;';
    }

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.style.cssText = 'display:block;max-width:100%;';

    for (var gv = minY; gv <= maxY; gv += 2) {
        var gy = toY(gv);
        var grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        grid.setAttribute('x1', String(padL));
        grid.setAttribute('y1', String(gy));
        grid.setAttribute('x2', String(width - padR));
        grid.setAttribute('y2', String(gy));
        grid.setAttribute('stroke', '#e8e8e8');
        grid.setAttribute('stroke-width', '1');
        svg.appendChild(grid);
        if (!compact) {
            var lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lbl.setAttribute('x', String(padL - 4));
            lbl.setAttribute('y', String(gy + 4));
            lbl.setAttribute('text-anchor', 'end');
            lbl.setAttribute('font-size', '9');
            lbl.setAttribute('fill', '#999');
            lbl.textContent = String(gv);
            svg.appendChild(lbl);
        }
    }

    var pathD = '';
    for (var pi = 0; pi < points.length; pi++) {
        pathD += (pi === 0 ? 'M' : 'L') + toX(points[pi].chartX) + ',' + toY(points[pi].value);
    }
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#4a90e2');
    path.setAttribute('stroke-width', compact ? '1.5' : '2.5');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);

    for (var ci = 0; ci < points.length; ci++) {
        var pt = points[ci];
        var cx = toX(pt.chartX);
        var cy = toY(pt.value);
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', compact ? '3' : '5');
        circle.setAttribute('fill', getIntimacyColor(pt.value));
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '1');
        svg.appendChild(circle);

        if (!compact) {
            var xLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            xLbl.setAttribute('x', String(cx));
            xLbl.setAttribute('y', String(height - 6));
            xLbl.setAttribute('text-anchor', 'middle');
            xLbl.setAttribute('font-size', '8');
            xLbl.setAttribute('fill', '#999');
            var labelText = pt.sortValue !== null ? formatChartXLabel(pt.sortValue, pt.xLabel) : (pt.xLabel || '?');
            if (labelText.length > 8) labelText = labelText.substring(0, 8) + '…';
            xLbl.textContent = labelText;
            svg.appendChild(xLbl);
        }
    }

    wrap.appendChild(svg);
    return wrap;
}

// ============================================================
// 🆕 亲密度变化弹窗
// ============================================================

var ChangeHistoryModal = /** @class */ (function (_super) {
    __extends(ChangeHistoryModal, _super);
    function ChangeHistoryModal(app, relation, view) {
        var _this = _super.call(this, app) || this;
        _this.relation = relation;
        _this.view = view;
        return _this;
    }

    ChangeHistoryModal.prototype.onOpen = function () {
        var self = this;
        this.contentEl.empty();
        var el = this.contentEl;
        el.style.cssText = 'padding:20px;max-height:80vh;overflow-y:auto;min-width:500px;';
        
        el.createEl('h3', { text: '📊 关系变化历史' }).style.cssText = 'margin:0 0 4px;';
        var sub = el.createEl('div');
        sub.style.cssText = 'font-size:13px;color:#555;margin-bottom:15px;';
        sub.innerHTML = '<strong>' + this.relation.charA + '</strong> ↔ <strong>' + this.relation.charB + '</strong> ｜ 当前：' + getIntimacyLabel(this.relation.intimacy || 0);
        
        var history = getRelationHistory(this.view.plugin, this.relation.charA, this.relation.charB);
        
        if (history.length === 0) {
            el.createEl('p', { text: '📭 该关系暂无变化记录', cls: 'my-char-view-empty' }).style.cssText = 'text-align:center;color:#888;padding:30px;';
            el.createEl('p', { text: '💡 点击关系卡片上的「📝 记录变化」，选择「初始值设定」可设定亲密度起点' }).style.cssText = 'text-align:center;color:#999;font-size:12px;margin-top:-10px;';
            var closeBtn = el.createEl('button', { text: '关闭' });
            closeBtn.style.cssText = 'margin-top:15px;padding:8px 16px;background:#888;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
            closeBtn.addEventListener('click', function() { self.close(); });
            return;
        }
        
        var sorted = sortHistoryByTime(history);
        var metricHistory = sorted.filter(function(r) { return r.recordKind !== 'relation_type' && r.recordKind !== 'relation_pair'; });
        var changeRecords = getChangeRecordsOnly(metricHistory);
        
        // 统计信息
        var stats = el.createEl('div');
        stats.style.cssText = 'display:flex;gap:15px;padding:10px;background:#f5f7fa;border-radius:6px;margin-bottom:12px;flex-wrap:wrap;';
        var upCount = 0, downCount = 0, flatCount = 0;
        for (var i = 0; i < changeRecords.length; i++) {
            var type = getChangeType(changeRecords[i].oldValue, changeRecords[i].newValue);
            if (type.indexOf('提升') !== -1) upCount++;
            else if (type.indexOf('下降') !== -1) downCount++;
            else flatCount++;
        }
        var hasBaseline = sorted.some(function(r) { return isBaselineRecord(r); });
        if (hasBaseline) {
            stats.createEl('span', { text: '📌 起点: ' + getIntimacyLabel(getBaselineValue(sorted)) }).style.cssText = 'font-size:12px;color:#888;';
        }
        stats.createEl('span', { text: '📋 共 ' + changeRecords.length + ' 次变化' }).style.cssText = 'font-size:12px;';
        if (changeRecords.length > 0) {
            stats.createEl('span', { text: '⬆ 提升 ' + upCount + ' 次' }).style.cssText = 'font-size:12px;color:#2ecc71;';
            stats.createEl('span', { text: '⬇ 下降 ' + downCount + ' 次' }).style.cssText = 'font-size:12px;color:#e74c3c;';
            stats.createEl('span', { text: '➡ 持平 ' + flatCount + ' 次' }).style.cssText = 'font-size:12px;color:#95a5a6;';
        }

        if (metricHistory.length > 0) renderIntimacyCurveChart(el, metricHistory, { width: 500, height: 170, compact: false });

        // 时间列表
        var list = el.createEl('div');
        list.style.cssText = 'max-height:400px;overflow-y:auto;';
        
        for (var i = 0; i < sorted.length; i++) {
            (function(record, idx) {
                var item = list.createEl('div');
                var isLatest = idx === sorted.length - 1;
                var isBaseline = isBaselineRecord(record);
                var borderColor = isBaseline ? '#95a5a6' : (isLatest ? '#4a90e2' : '#e8e8e8');
                item.style.cssText = 'padding:10px 12px;margin:4px 0;border-left:3px solid ' + borderColor + ';background:' + (isLatest ? '#f0f7ff' : 'white') + ';border-radius:4px;position:relative;';
                
                // 行1：时间和变化值
                var row1 = item.createEl('div');
                row1.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-right:60px;';
                
                var timeLabel = row1.createEl('span', { text: record.timestamp || '未标注时间' });
                timeLabel.style.cssText = 'font-size:12px;color:#888;font-weight:bold;';
                
                if (record.recordKind === 'relation_type') {
                    row1.createEl('span', { text: '关系类型：' + (record.oldType || '未设置') + ' → ' + (record.newType || '未设置') })
                        .style.cssText = 'font-size:12px;padding:3px 8px;border-radius:10px;background:#eee;color:#555;font-weight:bold;';
                } else if (record.recordKind === 'relation_pair') {
                    row1.createEl('span', { text: '双方调整：' + (record.oldCharA || '') + ' ↔ ' + (record.oldCharB || '') + ' → ' + (record.newCharA || '') + ' ↔ ' + (record.newCharB || '') })
                        .style.cssText = 'font-size:12px;padding:3px 8px;border-radius:10px;background:#eee;color:#555;font-weight:bold;';
                } else if (isBaseline) {
                    var baselineBadge = row1.createEl('span', { text: '📌 起点 ' + getIntimacyLabel(record.newValue) });
                    baselineBadge.style.cssText = 'font-size:12px;padding:2px 8px;border-radius:10px;background:#95a5a6;color:white;font-weight:bold;';
                } else {
                    var oldLabel = getIntimacyLabel(record.oldValue);
                    var newLabel = getIntimacyLabel(record.newValue);
                    var oldColor = getIntimacyColor(record.oldValue);
                    var newColor = getIntimacyColor(record.newValue);
                    var changeType = getChangeType(record.oldValue, record.newValue);
                    var arrowColor = record.newValue > record.oldValue ? '#2ecc71' : (record.newValue < record.oldValue ? '#e74c3c' : '#95a5a6');
                    
                    var oldSpan = row1.createEl('span', { text: oldLabel });
                    oldSpan.style.cssText = 'color:' + oldColor + ';font-weight:bold;font-size:13px;';
                    
                    var arrowSpan = row1.createEl('span', { text: ' → ' });
                    arrowSpan.style.cssText = 'color:' + arrowColor + ';font-weight:bold;';
                    
                    var newSpan = row1.createEl('span', { text: newLabel });
                    newSpan.style.cssText = 'color:' + newColor + ';font-weight:bold;font-size:13px;';
                    
                    var typeBadge = row1.createEl('span', { text: changeType });
                    typeBadge.style.cssText = 'font-size:10px;padding:1px 8px;border-radius:10px;background:' + (record.newValue > record.oldValue ? '#2ecc71' : (record.newValue < record.oldValue ? '#e74c3c' : '#95a5a6')) + ';color:white;';
                }
                
                if (isLatest) {
                    var latestBadge = row1.createEl('span', { text: '当前' });
                    latestBadge.style.cssText = 'font-size:9px;padding:1px 6px;border-radius:8px;background:#4a90e2;color:white;';
                }

                // 删除按钮
                var delBtn = item.createEl('button', { text: '🗑 删除' });
                delBtn.style.cssText = 'position:absolute;top:10px;right:10px;padding:2px 8px;border:1px solid #e74c3c;border-radius:4px;cursor:pointer;font-size:10px;background:white;color:#e74c3c;';
                delBtn.addEventListener('click', function() {
                    var confirmMsg = isBaseline
                        ? '确定删除这条起点设定吗？删除后曲线起点会重新计算。'
                        : '确定删除这条变化记录吗？删除后当前亲密度会回退到上一条记录的值。';
                    if (!confirmDestructiveAction(confirmMsg, '亲密度历史记录将被删除，关系当前值会重新计算。')) return;
                    removeIntimacyRecord(self.view.plugin, record.id);
                    recalcRelationIntimacyFromHistory(self.view.plugin, self.relation);
                    self.view.saveFactionsAndRelations({ skipGraphSync: true }).then(function() {
                        self.view.refreshRelationsIfVisible();
                        new obsidian.Notice('✅ 已删除该条记录');
                        self.onOpen();
                    });
                });
                
                // 行2：原因
                if (record.changeReason || record.customReason || record.eventId) {
                    var row2 = item.createEl('div');
                    row2.style.cssText = 'font-size:11px;color:#666;margin-top:4px;padding-left:4px;';
                    if (record.eventId && record.eventYear) {
                        var eventText = record.eventText || record.customReason || '';
                        row2.createEl('span', { text: '📎 ' + record.eventYear + ' · ' + eventText });
                        var eventLink = row2.createEl('span', { text: ' 查看' });
                        eventLink.style.cssText = 'color:#4a90e2;cursor:pointer;text-decoration:underline;margin-left:4px;';
                        (function(eid) {
                            eventLink.addEventListener('click', function() {
                                self.view.tab = 'timeline';
                                self.view._yearSearchText = record.eventYear || '';
                                self.view.render();
                                self.close();
                            });
                        })(record.eventId);
                    } else if (record.customReason && !isBaseline) {
                        row2.createEl('span', { text: '📝 ' + record.customReason });
                    } else if (isBaseline) {
                        row2.createEl('span', { text: '📌 亲密度起点设定' }).style.cssText = 'color:#999;';
                    }
                }
                
                // 行3：录入时间
                if (record.recordDate) {
                    var row3 = item.createEl('div');
                    row3.style.cssText = 'font-size:10px;color:#bbb;margin-top:2px;';
                    row3.textContent = '录入: ' + record.recordDate;
                }
            })(sorted[i], i);
        }
        
        // 关闭按钮
        var closeBtn2 = el.createEl('button', { text: '关闭' });
        closeBtn2.style.cssText = 'margin-top:15px;padding:8px 16px;background:#888;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
        closeBtn2.addEventListener('click', function() { self.close(); });
    };
    
    ChangeHistoryModal.prototype.onClose = function() {
        this.contentEl.empty();
    };
    
    return ChangeHistoryModal;
}(obsidian.Modal));

// ============================================================
// 🆕 记录变化弹窗
// ============================================================

var RecordChangeModal = /** @class */ (function (_super) {
    __extends(RecordChangeModal, _super);
    function RecordChangeModal(app, relation, view, onSave) {
        var _this = _super.call(this, app) || this;
        _this.relation = relation;
        _this.view = view;
        _this.onSave = onSave;
        return _this;
    }

    RecordChangeModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.addClass('my-char-modal-body');
        el.style.cssText = 'padding:20px;max-height:85vh;overflow-y:auto;min-width:480px;max-width:560px;';
        
        var currentIntimacy = this.relation.intimacy || 0;
        var newIntimacy = currentIntimacy;
        var mode = 'change';
        var selectedEvent = null;
        var eventPickerApi = null;

        el.createEl('h3', { text: '📝 记录关系变化' }).style.cssText = 'margin:0 0 4px;';
        var sub = el.createEl('div');
        sub.style.cssText = 'font-size:13px;color:#555;margin-bottom:12px;';
        sub.innerHTML = '<strong>' + this.relation.charA + '</strong> ↔ <strong>' + this.relation.charB + '</strong>';

        // 模式切换
        var modeRow = el.createEl('div');
        modeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:14px;';
        var changeModeBtn = modeRow.createEl('button', { text: '📈 记录变化', type: 'button' });
        var baselineModeBtn = modeRow.createEl('button', { text: '📌 设定起点', type: 'button' });
        function preventBtnFocusSteal(btn) {
            btn.addEventListener('mousedown', function(e) { e.preventDefault(); });
        }
        preventBtnFocusSteal(changeModeBtn);
        preventBtnFocusSteal(baselineModeBtn);
        function setModeStyle(active, inactive) {
            active.style.cssText = 'flex:1;padding:8px;border:2px solid #4a90e2;border-radius:6px;cursor:pointer;background:#e8f4fd;color:#4a90e2;font-weight:bold;font-size:12px;';
            inactive.style.cssText = 'flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;cursor:pointer;background:white;color:#666;font-size:12px;';
        }
        setModeStyle(changeModeBtn, baselineModeBtn);

        // 亲密度选择
        var intimacyRow = el.createEl('div');
        intimacyRow.style.cssText = 'margin:10px 0;padding:12px;background:#f8f9fa;border-radius:8px;';
        var intimacyLabel = intimacyRow.createEl('div');
        intimacyLabel.style.cssText = 'font-size:12px;color:#666;margin-bottom:6px;';
        intimacyLabel.textContent = '当前：' + getIntimacyLabel(currentIntimacy);
        var newSelect = intimacyRow.createEl('select');
        newSelect.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;';
        for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
            var lvl = INTIMACY_LEVELS[i];
            var opt = document.createElement('option');
            opt.value = lvl.value;
            opt.textContent = lvl.label + ' (' + lvl.value + ')';
            if (lvl.value === currentIntimacy) opt.selected = true;
            newSelect.appendChild(opt);
        }
        var deltaHint = intimacyRow.createEl('div');
        deltaHint.style.cssText = 'font-size:11px;color:#888;margin-top:6px;';
        function updateDeltaHint() {
            newIntimacy = parseInt(newSelect.value);
            if (mode === 'baseline') {
                deltaHint.textContent = '设为亲密度曲线的起点';
                intimacyLabel.textContent = '起点亲密度';
                return;
            }
            intimacyLabel.textContent = '当前：' + getIntimacyLabel(currentIntimacy);
            if (newIntimacy > currentIntimacy) {
                deltaHint.textContent = '⬆ 提升 ' + (newIntimacy - currentIntimacy) + ' 级';
                deltaHint.style.color = '#2ecc71';
            } else if (newIntimacy < currentIntimacy) {
                deltaHint.textContent = '⬇ 下降 ' + (currentIntimacy - newIntimacy) + ' 级';
                deltaHint.style.color = '#e74c3c';
            } else {
                deltaHint.textContent = '与当前相同';
                deltaHint.style.color = '#888';
            }
        }
        newSelect.addEventListener('change', updateDeltaHint);
        updateDeltaHint();

        // 故事时间（放在模式区域之前，设定起点时可直接输入）
        var timeRow = el.createEl('div');
        timeRow.style.cssText = 'margin:10px 0;';
        timeRow.createEl('label', { text: '故事内时间' }).style.cssText = 'display:block;font-size:12px;color:#666;margin-bottom:4px;';
        var timeInput = timeRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        timeInput.placeholder = '如：前280年冬（选事件会自动填入）';

        // 起点模式专属
        var baselineSection = el.createEl('div');
        baselineSection.style.cssText = 'display:none;margin-bottom:8px;';
        baselineSection.createEl('div', { text: '💡 设定这条关系最初的亲密度，不会计入变化次数' }).style.cssText = 'font-size:11px;color:#888;padding:8px;background:#f5f5f5;border-radius:6px;';

        // 变化模式专属区域
        var changeSection = el.createEl('div');

        var reasonTypeRow = changeSection.createEl('div');
        reasonTypeRow.style.cssText = 'display:flex;gap:6px;margin:10px 0;';
        var customReasonBtn = reasonTypeRow.createEl('button', { text: '✏️ 自定义描述', type: 'button' });
        var eventReasonBtn = reasonTypeRow.createEl('button', { text: '📎 关联时间线事件', type: 'button' });
        preventBtnFocusSteal(customReasonBtn);
        preventBtnFocusSteal(eventReasonBtn);
        var reasonMode = 'custom';
        function setReasonModeStyle(active, inactive) {
            active.style.cssText = 'flex:1;padding:7px;border:2px solid #4a90e2;border-radius:6px;cursor:pointer;background:#e8f4fd;color:#4a90e2;font-weight:bold;font-size:12px;';
            inactive.style.cssText = 'flex:1;padding:7px;border:1px solid #ddd;border-radius:6px;cursor:pointer;background:white;color:#666;font-size:12px;';
        }
        setReasonModeStyle(customReasonBtn, eventReasonBtn);

        var customReasonPanel = changeSection.createEl('div');
        customReasonPanel.style.cssText = 'margin-bottom:8px;';
        customReasonPanel.createEl('label', { text: '变化原因' }).style.cssText = 'display:block;font-size:12px;color:#666;margin-bottom:4px;';
        var customInput = customReasonPanel.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        customInput.placeholder = '描述这次关系变化的原因，如：共同经历了一次重大事件';

        var eventReasonPanel = changeSection.createEl('div');
        eventReasonPanel.style.cssText = 'display:none;margin-bottom:8px;';
        var eventPickerHost = eventReasonPanel.createEl('div');
        eventPickerHost.style.cssText = 'padding:0;';
        eventPickerApi = createTimelineEventPicker(eventPickerHost, self.view, self.relation.charA, self.relation.charB, function(evt) {
            selectedEvent = evt;
            timeInput.value = evt.year + (evt.month && evt.month !== '未标注' ? evt.month : '');
            customInput.value = evt.event;
        });

        function switchReasonMode(nextMode) {
            reasonMode = nextMode;
            if (reasonMode === 'event') {
                setReasonModeStyle(eventReasonBtn, customReasonBtn);
                customReasonPanel.style.display = 'none';
                eventReasonPanel.style.display = 'block';
            } else {
                setReasonModeStyle(customReasonBtn, eventReasonBtn);
                customReasonPanel.style.display = 'block';
                eventReasonPanel.style.display = 'none';
                selectedEvent = null;
                if (eventPickerApi) eventPickerApi.clearSelection();
            }
        }
        customReasonBtn.addEventListener('click', function() { switchReasonMode('custom'); });
        eventReasonBtn.addEventListener('click', function() { switchReasonMode('event'); });

        function switchMode(nextMode) {
            mode = nextMode;
            if (mode === 'baseline') {
                setModeStyle(baselineModeBtn, changeModeBtn);
                changeSection.style.display = 'none';
                baselineSection.style.display = 'block';
            } else {
                setModeStyle(changeModeBtn, baselineModeBtn);
                changeSection.style.display = 'block';
                baselineSection.style.display = 'none';
            }
            updateDeltaHint();
        }
        changeModeBtn.addEventListener('click', function() { switchMode('change'); });
        baselineModeBtn.addEventListener('click', function() { switchMode('baseline'); });

        // 按钮
        var btnRow = el.createEl('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;';
        
        var saveBtn = btnRow.createEl('button', { text: '💾 保存', type: 'button' });
        saveBtn.style.cssText = 'padding:10px 24px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;';
        saveBtn.addEventListener('click', function() {
            newIntimacy = parseInt(newSelect.value);
            var timeValue = timeInput.value.trim();
            var reasonText = customInput.value.trim();
            var reasonType = mode === 'baseline' ? '初始值设定' : (reasonMode === 'event' && selectedEvent ? '事件关联' : '自定义描述');

            if (mode === 'change' && newIntimacy === currentIntimacy && reasonMode === 'custom' && !reasonText) {
                new obsidian.Notice('亲密度没有变化时，请填写自定义描述');
                return;
            }
            if (mode === 'change' && reasonMode === 'event' && !selectedEvent) {
                new obsidian.Notice('请选择要关联的时间线事件');
                return;
            }

            if (mode === 'baseline') {
                var existingHistory = getRelationHistory(self.view.plugin, self.relation.charA, self.relation.charB);
                if (existingHistory.some(function(h) { return isBaselineRecord(h); })) {
                    if (!confirm('已有起点设定，继续将新增一条。建议先在历史中删除旧起点。继续？')) return;
                }
            }

            var recordOldValue = mode === 'baseline' ? newIntimacy : currentIntimacy;
            var record = {
                id: generateId(),
                charA: self.relation.charA,
                charB: self.relation.charB,
                oldValue: recordOldValue,
                newValue: newIntimacy,
                changeReason: reasonType,
                timestamp: timeValue || '未标注时间',
                recordDate: new Date().toISOString().split('T')[0],
                note: ''
            };

            if (reasonType === '事件关联' && selectedEvent) {
                record.eventId = 'tl_' + selectedEvent.timelineIndex;
                record.eventYear = selectedEvent.year;
                record.eventText = selectedEvent.event;
                record.customReason = reasonText || selectedEvent.event;
            } else if (reasonType === '自定义描述') {
                if (reasonText) record.customReason = reasonText;
            } else if (reasonType === '初始值设定') {
                record.customReason = '初始值设定';
            }

            if (self.onSave) self.onSave(record);
            self.close();
        });
        
        var cancelBtn = btnRow.createEl('button', { text: '取消', type: 'button' });
        cancelBtn.style.cssText = 'padding:10px 16px;border:1px solid #ddd;border-radius:6px;cursor:pointer;background:white;';
        cancelBtn.addEventListener('click', function() { self.close(); });
    };
    
    RecordChangeModal.prototype.onClose = function() {
        this.contentEl.empty();
    };
    
    return RecordChangeModal;
}(obsidian.Modal));

// ========== 关系变化历史（视图方法）==========
MyView.prototype.getRelationHistory = function(charA, charB) {
    return getRelationHistory(this.plugin, charA, charB);
};

MyView.prototype.showChangeHistory = function(relation) {
    var modal = new ChangeHistoryModal(this.app, relation, this);
    modal.open();
};

MyView.prototype.showRecordChange = function(relation, callback) {
    var self = this;
    var modal = new RecordChangeModal(this.app, relation, this, function(record) {
        addIntimacyRecord(self.plugin, record);
        if (record.changeReason === '初始值设定') {
            var changes = getChangeRecordsOnly(getRelationHistory(self.plugin, relation.charA, relation.charB));
            if (changes.length === 0) {
                relation.intimacy = record.newValue;
            }
        } else {
            relation.intimacy = record.newValue;
        }
        self.saveFactionsAndRelations({ skipGraphSync: true }).then(function() {
            if (callback) callback(record);
            self.refreshRelationsIfVisible();
            if (record.changeReason === '初始值设定') {
                new obsidian.Notice('✅ 起点已设定：' + getIntimacyLabel(record.newValue));
            } else {
                new obsidian.Notice('✅ 变化已记录：' + getIntimacyLabel(record.oldValue) + ' → ' + getIntimacyLabel(record.newValue));
            }
        });
    });
    modal.open();
};

MyView.prototype.getPersonChangeSummary = function(charName) {
    var result = [];
    for (var i = 0; i < this.relations.length; i++) {
        var rel = this.relations[i];
        if (rel.charA === charName || rel.charB === charName) {
            var history = getRelationHistory(this.plugin, rel.charA, rel.charB);
            var other = rel.charA === charName ? rel.charB : rel.charA;
            result.push({
                relation: rel,
                other: other,
                history: history,
                count: history.length,
                latest: getLatestChange(history),
                summary: getChangeSummary(history)
            });
        }
    }
    return result;
};

// ============================================================
// 功能：状态徽章（基于时间点）+ 可交互仪表盘 + 筛选横幅 + 类型筛选
// ============================================================

// ========== 状态判断 ==========
function getCharStatusAtTime(view, charData, currentTimeStr) {
    var settings = view.plugin.settings;
    var deathFieldNames = settings.deathFieldNames || '死亡,死亡时间';
    var birthFieldNames = settings.birthFieldNames || '出生,出生时间';
    var death = view.getFieldValue(charData, deathFieldNames);
    var birth = view.getFieldValue(charData, birthFieldNames);
    var currentParsed = parseHistoricalDate(currentTimeStr);
    var currentSort = currentParsed && currentParsed.sortValue !== null ? currentParsed.sortValue : null;
    var birthParsed = parseHistoricalDate(birth);
    var deathParsed = parseHistoricalDate(death);
    var birthSort = birthParsed && birthParsed.sortValue !== null ? birthParsed.sortValue : null;
    var deathSort = deathParsed && deathParsed.sortValue !== null ? deathParsed.sortValue : null;
    if (currentSort === null) {
        if (death && death.trim()) {
            var dLower = death.trim().toLowerCase();
            if (dLower.indexOf('失踪') !== -1 || dLower.indexOf('未知') !== -1) return 'missing';
            return 'dead';
        }
        if (birth && birth.trim()) return 'alive';
        return 'unknown';
    }
    if (deathSort !== null && currentSort >= deathSort) return 'dead';
    if (birthSort !== null && currentSort >= birthSort) return 'alive';
    if (birthSort !== null && currentSort < birthSort) return 'unborn';
    if (deathSort !== null && currentSort < deathSort) return 'alive';
    return 'unknown';
}

function getStatusLabel(status) {
    var map = { alive: '🟢 存活', dead: '🔴 已故', missing: '⚪ 失踪', unknown: '🟡 未知', unborn: '🔵 未出生' };
    return map[status] || '🟡 未知';
}

function getStatusColor(status) {
    var map = { alive: '#2ecc71', dead: '#e74c3c', missing: '#95a5a6', unknown: '#f39c12', unborn: '#3498db' };
    return map[status] || '#95a5a6';
}

// ========== 筛选辅助方法（带横幅） ==========

MyView.prototype.filterCharsByCondition = function(conditionFn, label, detailInfo) {
    this.tab = 'chars';
    this.searchText = '';
    this._statusFilter = 'all';
    this._typeFilter = 'all';
    this._activeFilter = {
        label: label,
        detail: detailInfo || '',
        condition: conditionFn
    };
    this.render();
};

MyView.prototype.clearActiveFilter = function() {
    this._activeFilter = null;
    this.searchText = '';
    this._statusFilter = 'all';
    this._typeFilter = 'all';
    this.render();
    new obsidian.Notice('已清除筛选');
};

MyView.prototype.showUnappearedChars = function() {
    var charsAppeared = {};
    for (var i = 0; i < this.timeline.length; i++) {
        var appeared = findCharsInEvent(this.timeline[i].event, this.charNames);
        for (var j = 0; j < appeared.length; j++) {
            charsAppeared[appeared[j]] = true;
        }
    }
    var matchedNames = [];
    for (var i = 0; i < this.chars.length; i++) {
        if (!charsAppeared[this.chars[i].name]) {
            matchedNames.push(this.chars[i].name);
        }
    }
    if (matchedNames.length === 0) {
        new obsidian.Notice('所有人物都已出场');
        return;
    }
    this.filterCharsByCondition(
        function(c) { return !charsAppeared[c.name]; },
        '📌 尚未出场的人物',
        '共 ' + matchedNames.length + ' 人'
    );
};

MyView.prototype.showIsolatedChars = function() {
    var terms = getTermSet(this.plugin);
    var charsWithRelations = {};
    for (var i = 0; i < this.relations.length; i++) {
        charsWithRelations[this.relations[i].charA] = true;
        charsWithRelations[this.relations[i].charB] = true;
    }
    var matchedNames = [];
    for (var i = 0; i < this.chars.length; i++) {
        if (!charsWithRelations[this.chars[i].name]) {
            matchedNames.push(this.chars[i].name);
        }
    }
    if (matchedNames.length === 0) {
        new obsidian.Notice('所有' + terms.entity + '都已建立' + terms.relation);
        return;
    }
    this.filterCharsByCondition(
        function(c) { return !charsWithRelations[c.name]; },
        '🔗 无任何' + terms.relation + '的' + terms.entity,
        '共 ' + matchedNames.length + ' 个'
    );
};

MyView.prototype.showDeadAfterAppear = function() {
    var settings = this.plugin.settings;
    var currentTimeStr = settings.currentTimePoint || '';
    var problemChars = [];
    var problemDetails = [];

    if (!currentTimeStr) {
        new obsidian.Notice('请先在设置中设置「当前时间点」');
        return;
    }

    for (var i = 0; i < this.chars.length; i++) {
        var c = this.chars[i];
        var status = getCharStatusAtTime(this, c, currentTimeStr);
        if (status === 'dead') {
            var death = this.getFieldValue(c, settings.deathFieldNames || '死亡,死亡时间');
            var deathParsed = parseHistoricalDate(death);
            var deathSort = deathParsed && deathParsed.sortValue !== null ? deathParsed.sortValue : null;
            if (deathSort !== null) {
                for (var j = 0; j < this.timeline.length; j++) {
                    var yearParsed = parseHistoricalDate(this.timeline[j].storyYear || this.timeline[j].year);
                    var yearSort = yearParsed && yearParsed.sortValue !== null ? yearParsed.sortValue : null;
                    if (yearSort !== null && yearSort > deathSort) {
                        var appeared = findCharsInEvent(this.timeline[j].event, [c.name]);
                        if (appeared.length > 0) {
                            problemChars.push(c.name);
                            problemDetails.push(c.name + '（卒于 ' + death + '，' + this.timeline[j].year + ' 仍出场）');
                            break;
                        }
                    }
                }
            }
        }
    }

    if (problemChars.length === 0) {
        new obsidian.Notice('没有发现已故后仍出场的人物');
        return;
    }

    this.filterCharsByCondition(
        function(c) { return problemChars.indexOf(c.name) !== -1; },
        '⚠️ 已故后仍出场的人物',
        '共 ' + problemChars.length + ' 人'
    );
    this._deadAfterAppearDetails = problemDetails;
};

// ============================================================
// ⭐ 仪表盘
// ============================================================
// ===== Novel workspace tabs: complete missing renderers and make them actionable =====
MyView.prototype.renderDeskTab = function(container) {
    var self = this;
    container.empty();
    container.classList.add('my-char-scroll-section', 'rw-workspace-home');

    var hero = container.createEl('div', { cls: 'rw-home-hero' });
    hero.createEl('div', { text: 'NOVEL WORKSPACE', cls: 'rw-home-eyebrow' });
    hero.createEl('h2', { text: '创作工作台', cls: 'rw-home-title' });
    hero.createEl('p', { text: '把人物、故事、世界设定与逻辑检查放在清晰的工作区里。选择一个模块继续创作。', cls: 'rw-home-subtitle' });

    var overview = container.createEl('div', { cls: 'rw-home-overview' });
    [
        { value: this.chars.length, label: '人物', tab: 'chars' },
        { value: this.timeline.length, label: '事件', tab: 'timeline' },
        { value: this.relations.length, label: '关系', tab: 'relations' },
        { value: this.factions.length, label: '阵营', tab: 'factions' }
    ].forEach(function (item) {
        var stat = overview.createEl('button', { cls: 'rw-home-stat' });
        stat.createEl('strong', { text: String(item.value) });
        stat.createEl('span', { text: item.label });
        stat.addEventListener('click', function () { self.tab = item.tab; self.render(); });
    });

    var visible = getVisibleTabs(this.plugin);
    var visibleIds = {};
    visible.forEach(function (t) { visibleIds[t.id] = true; });
    var groups = [
        { title: '人物与关系', desc: '管理角色档案、关系网络和情感变化', ids: ['chars', 'factions', 'relations', 'intimacy', 'graph'] },
        { title: '故事结构', desc: '组织事件、伏笔、章节与人物时间轨迹', ids: ['timeline', 'plots', 'outline', 'chapterStatus', 'lifecycle'] },
        { title: '世界设定与校验', desc: '维护世界规则，并检查设定之间的冲突', ids: ['world', 'continuity'] },
        { title: '分析与辅助', desc: '查看数据概况、检索内容和管理资料', ids: ['dashboard', 'statistics', 'heatmap', 'search'] }
    ];
    var labels = {
        chars: ['人物档案', '人物资料、出场与生平', '👥'],
        factions: ['阵营管理', '势力、组织与人物归属', '🏰'],
        relations: ['人物关系', '查看关系网络与亲密度', '🔗'],
        intimacy: ['亲密度历史', '追踪关系变化及原因', '💗'],
        graph: ['关系图谱', '可视化人物之间的联系', '🕸️'],
        timeline: ['时间线', '按年代浏览和编辑事件', '📅'],
        plots: ['伏笔管理', '追踪埋设、推进与回收', '🧵'],
        outline: ['故事大纲', '章节目录、三幕式与节拍', '📖'],
        chapterStatus: ['章节情况', '当前正文的事件时间线、故事设计、人物、阵营与伏笔', '🗂️'],
        lifecycle: ['人物生命周期', '出生、出场与死亡时间轴', '⏳'],
        world: ['世界观资料库', '地点、道具、组织与规则', '🌍'],
        continuity: ['故事逻辑检查', '检查年龄、出场与时间冲突', '🛡️'],
        dashboard: ['数据仪表盘', '待办提醒与数据健康度', '📊'],
        statistics: ['统计分析', '人物与事件数据汇总', '📈'],
        heatmap: ['出场热力图', '查看人物出场频率', '🔥'],
        search: ['全局搜索', '跨模块查找人物与事件', '🔍'],
        importexport: ['备份与迁移', '导入、导出与快照恢复', '💾']
    };
    groups.forEach(function (group) {
        var ids = group.ids.filter(function (id) { return !!visibleIds[id] && !!labels[id]; });
        if (!ids.length) return;
        var section = container.createEl('section', { cls: 'rw-home-section' });
        var sectionHead = section.createEl('div', { cls: 'rw-home-section-head' });
        sectionHead.createEl('h3', { text: group.title });
        sectionHead.createEl('p', { text: group.desc });
        var grid = section.createEl('div', { cls: 'rw-home-grid' });
        ids.forEach(function (id) {
            var item = labels[id];
            var card = grid.createEl('button', { cls: 'rw-home-card' });
            card.setAttribute('type', 'button');
            var icon = card.createEl('span', { text: item[2], cls: 'rw-home-card-icon' });
            var copy = card.createEl('span', { cls: 'rw-home-card-copy' });
            copy.createEl('strong', { text: item[0] });
            copy.createEl('small', { text: item[1] });
            card.createEl('span', { text: '›', cls: 'rw-home-card-arrow' });
            card.addEventListener('click', function () { self.tab = id; self.searchText = ''; self.selectedTag = ''; self.render(); });
        });
    });

    var tools = ['importexport'].filter(function (id) { return !!visibleIds[id]; });
    if (tools.length) {
        var toolSection = container.createEl('section', { cls: 'rw-home-tools' });
        toolSection.createEl('h3', { text: '工具箱' });
        tools.forEach(function (id) {
            var tool = toolSection.createEl('button', { text: '备份、导入与导出  ›', cls: 'rw-home-tool-link' });
            tool.addEventListener('click', function () { self.tab = id; self.render(); });
        });
    }
};
MyView.prototype.renderDesk = MyView.prototype.renderDeskTab;
MyView.prototype.renderIntimacyHistoryTab = function(container) {
    var self=this; container.empty(); container.classList.add('my-char-scroll-section');
    container.createEl('h3',{text:'❤️ 亲密度史',cls:'my-char-section-title'});
    var history=getRecentIntimacyHistory(this.plugin); var rels=this.relations||[];
    var pairSelect=container.createEl('select',{cls:'my-char-select'}); pairSelect.createEl('option',{text:'全部关系',attr:{value:'*'}});
    var pairs={}; rels.forEach(function(r){pairs[r.charA+' ⇄ '+r.charB]=true;});
    Object.keys(pairs).sort().forEach(function(k){pairSelect.createEl('option',{text:k,attr:{value:k}});});
    var search=container.createEl('input',{type:'text',placeholder:'搜索人物、原因或关联事件…',cls:'my-char-form-input'}); search.style.cssText='width:100%;margin:8px 0;box-sizing:border-box;';
    var chart=container.createEl('div'); var list=container.createEl('div');
    function draw(){chart.empty();list.empty();var q=search.value.trim().toLowerCase(), pair=pairSelect.value;
      var rows=history.filter(function(h){var names=[h.charA,h.charB].filter(Boolean);var pairName=names.join(' ⇄ '), rev=names.slice().reverse().join(' ⇄ ');return (pair==='*'||pair===pairName||pair===rev)&&(!q||[h.charA,h.charB,h.changeReason,h.reason,h.eventName,h.recordDate,h.timestamp].join(' ').toLowerCase().indexOf(q)>=0);});
      var pairHistory=pair==='*'?rows:rows.filter(function(h){return true;});
      if(pairHistory.length) renderIntimacyCurveChart(chart,pairHistory,{width:560,height:180,compact:false});
      var summary=list.createEl('div',{cls:'my-char-muted'});summary.textContent='共 '+rows.length+' 条记录';
      rows.forEach(function(h){var card=list.createEl('div',{cls:'my-char-panel-card'});card.style.margin='8px 0';var head=card.createEl('div');head.style.cssText='display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;';head.createEl('strong',{text:(h.charA||'未知')+' ⇄ '+(h.charB||'未知')});head.createEl('span',{text:String(h.recordDate||h.timestamp||'未注明时间')});card.createEl('div',{text:(h.oldValue==null?'—':h.oldValue)+' → '+(h.newValue==null?'—':h.newValue)+' · '+(h.changeReason||h.reason||'未填写原因')});if(h.eventName||h.event)card.createEl('div',{text:'关联事件：'+(h.eventName||h.event),cls:'my-char-muted'});});
      if(!rows.length) list.createEl('div',{text:'暂无匹配记录。可在人物关系详情中修改亲密度并填写变化原因，系统会逐步积累历史。',cls:'my-char-muted'});
    }
    pairSelect.addEventListener('change',draw);search.addEventListener('input',draw);draw();
};
MyView.prototype.renderPlotsTab = function(container) {
    var self = this;
    container.empty();
    container.classList.add('my-char-scroll-section', 'rw-plots-view');
    container.createEl('h3', { text: '伏笔管理', cls: 'my-char-section-title' });
    container.createEl('p', { text: '伏笔节点直接来自时间线事件：在事件中填写相同的情节线名称，即可汇总埋设、推进与回收。时间线是事实来源，伏笔页负责聚合与追踪。', cls: 'my-char-muted' });
    var groups = novelExt.getPlotLineGroups(this.timeline || []);
    var warnings = novelExt.validatePlotLines(this.timeline || []);
    var filter = container.createEl('select', { cls: 'my-char-select' });
    [['all', '全部情节线'], ['open', '未回收'], ['closed', '已回收']].forEach(function (x) {
        filter.createEl('option', { text: x[1], attr: { value: x[0] } });
    });
    var search = container.createEl('input', { type: 'text', placeholder: '搜索伏笔名称或事件…', cls: 'my-char-form-input' });
    search.style.cssText = 'width:100%;max-width:100%;margin:8px 0;box-sizing:border-box;';
    var list = container.createEl('div', { cls: 'rw-plot-list' });
    function draw() {
        list.empty();
        var q = (search.value || '').trim().toLowerCase();
        var shown = groups.filter(function (g) {
            var haystack = (g.plotLine + ' ' + g.events.map(function (e) { return e.event || ''; }).join(' ')).toLowerCase();
            return (filter.value === 'all' || (filter.value === 'open' && !g.isRedeemed) || (filter.value === 'closed' && g.isRedeemed)) && (!q || haystack.indexOf(q) !== -1);
        });
        list.createEl('div', { text: '情节线 ' + groups.length + ' 条 · 未回收 ' + novelExt.getUnredeemedPlotLines(self.timeline || []).length + ' 条 · 逻辑提醒 ' + warnings.length + ' 条', cls: 'rw-plot-summary' });
        shown.forEach(function (g) {
            var card = list.createEl('section', { cls: 'rw-plot-card' });
            var head = card.createEl('div', { cls: 'rw-plot-card-head' });
            var titleWrap = head.createEl('div', { cls: 'rw-plot-title-wrap' });
            titleWrap.createEl('strong', { text: g.plotLine || '未命名情节线' });
            titleWrap.createEl('small', { text: g.events.length + ' 个时间线节点 · 最新状态：' + (g.latestStatus || '未标注') });
            head.createEl('span', { text: g.isRedeemed ? '已回收' : '进行中', cls: 'rw-plot-status' + (g.isRedeemed ? ' is-done' : '') });
            g.events.forEach(function (e, index) {
                var details = card.createEl('details', { cls: 'rw-plot-event' });
                var summary = details.createEl('summary', { cls: 'rw-plot-event-summary' });
                summary.createEl('span', { text: (e.storyYear || e.year || '未注明时间') + ' · ' + (e.plotStatus || '未标状态'), cls: 'rw-plot-event-meta' });
                var previewText = String(e.event || '（该节点没有填写事件内容）').replace(/\s+/g, ' ').trim();
                summary.createEl('span', { text: previewText, cls: 'rw-plot-event-preview' });
                var body = details.createEl('div', { cls: 'rw-plot-event-body' });
                body.createEl('p', { text: e.event || '（该节点没有填写事件内容）', cls: 'rw-plot-event-fulltext' });
                var refs=normalizeChapterNotes(e.chapterNotes&&e.chapterNotes.length?e.chapterNotes:e.chapterNote);
                if(refs.length) body.createEl('p',{text:'呈现章节：'+refs.join('、'),cls:'my-char-muted'});
                var edit = body.createEl('button', { text: '在时间线中查看 / 编辑', cls: 'rw-plot-edit-link' });
                edit.addEventListener('click', function () { self.tab = 'timeline'; self.render(); self.showEditEvent(e); });
            });
        });
        if (!shown.length) list.createEl('div', { text: '没有符合筛选条件的情节线。请在时间线事件中填写“情节线”和“伏笔状态”。', cls: 'my-char-muted' });
    }
    filter.addEventListener('change', draw);
    search.addEventListener('input', draw);
    draw();
};
MyView.prototype.renderContinuityTab = function(container) {
    var self = this;
    container.empty();
    container.classList.add('my-char-scroll-section');
    container.createEl('h3', { text: '🧬 P2 故事逻辑体检', cls: 'my-char-section-title' });
    container.createEl('p', { text: '检查人物出场、出生/死亡、年龄、关系时段、伏笔状态与时间线顺序。结果仅作提示，不会自动修改设定。', cls: 'my-char-muted' });
    var all = collectStoryLogicIssues(this);
    var counts = {};
    all.forEach(function(x) { counts[x.kind] = (counts[x.kind] || 0) + 1; });
    var summary = container.createEl('div', { cls: 'my-char-panel-card' });
    summary.createEl('strong', { text: '检查摘要 · ' + all.length + ' 条提醒' });
    var grid = summary.createEl('div', { cls: 'my-char-p2-summary' });
    ['人物首次出场','人物出生时间','人物死亡时间','年龄与事件时间','人物关系变化','伏笔回收检查','时间线冲突'].forEach(function(k) {
        var chip = grid.createEl('span', { text: k + ' ' + (counts[k] || 0), cls: 'my-char-p2-chip' });
    });
    var filters = container.createEl('div', { cls: 'my-char-p2-filters' });
    var select = filters.createEl('select', { cls: 'my-char-select' });
    [['all','全部类型'],['人物首次出场','人物首次出场'],['人物出生时间','出生时间'],['人物死亡时间','死亡时间'],['年龄与事件时间','年龄检查'],['人物关系变化','关系变化'],['伏笔回收检查','伏笔回收'],['时间线冲突','时间线冲突']].forEach(function(x) { select.createEl('option', { text: x[1], attr: { value: x[0] } }); });
    var search = filters.createEl('input', { type: 'text', placeholder: '搜索人物、伏笔或事件…', cls: 'my-char-form-input' });
    search.style.flex = '1';
    var list = container.createEl('div');
    function draw() {
        list.empty();
        var q = (search.value || '').toLowerCase();
        var rows = all.filter(function(x) { return (select.value === 'all' || x.kind === select.value) && (!q || (x.message + ' ' + x.kind + ' ' + (x.charName || '') + ' ' + (x.plotLine || '')).toLowerCase().indexOf(q) !== -1); });
        if (!rows.length) { list.createEl('div', { text: all.length ? '没有符合筛选条件的提醒。' : '✅ 暂未发现结构化设定中的明显冲突。建议继续补全人物出生/死亡时间、关系起止时间和伏笔状态。', cls: 'my-char-todo-ok' }); return; }
        rows.forEach(function(x) {
            var row = list.createEl('button', { cls: 'my-char-todo-item' + (x.severity === 'high' ? ' is-high' : '') });
            row.style.cssText = 'display:block;width:100%;text-align:left;white-space:normal;margin:6px 0;';
            var level = x.severity === 'high' ? '高优先级' : (x.severity === 'low' ? '待确认' : (x.severity === 'info' ? '提示' : '建议核对'));
            row.createEl('strong', { text: '【' + x.kind + ' · ' + level + '】' });
            row.appendText(' ' + x.message);
            row.addEventListener('click', function() {
                if (x.firstIssue) {
                    if (x.firstIssue.type === 'mismatch') self.fixFirstAppearIssue(x.firstIssue, true);
                    else self.fixFirstAppearIssue(x.firstIssue);
                } else if (x.event) {
                    self.tab = 'timeline'; self.render(); self.showEditEvent(x.event);
                } else if (x.charName) {
                    self.tab = 'chars'; self.render();
                    var c = self.findChar(x.charName); if (c) self.showCharDetail(c);
                } else if (x.plotLine) {
                    self.tab = 'timeline'; self._plotLineFilter = x.plotLine; self.render();
                }
            });
        });
    }
    select.addEventListener('change', draw);
    search.addEventListener('input', draw);
    draw();
    var refresh = container.createEl('button', { text: '🔄 重新读取并检查', cls: 'my-char-view-btn' });
    refresh.addEventListener('click', function() { self.loadAllData({ silent: true }).then(function() { self.render(); }).catch(function(e) { showUserError('检查失败', e); }); });
};
// ===== 世界设定 / 大纲：以 Vault Markdown 为主数据，界面负责交互管理 =====
var RW_WORLD_FILE = '世界观资料库.md';
var RW_DRAW_FILE = '抽签池.md';
var RW_OUTLINE_FILE = '故事大纲.md';
var RW_WORLD_TYPES = ['法宝道具', '地点秘境', '组织宗门', '功法术式', '种族历史', '世界规则', '其他'];

function rwGetVaultFile(app, path) { return app.vault.getAbstractFileByPath(path); }
function rwConfiguredPath(plugin, key, fallback) {
    var value = String((plugin.settings || {})[key] || '').trim();
    return (value || fallback).replace(/^\/+|\/+$/g, '');
}
function rwGetWorldPath(plugin) { return rwConfiguredPath(plugin, 'worldbuildingFilePath', RW_WORLD_FILE); }
function rwGetDrawPath(plugin) { return rwConfiguredPath(plugin, 'drawPoolFilePath', RW_DRAW_FILE); }
function rwGetOutlinePath(plugin) { return rwConfiguredPath(plugin, 'outlineFilePath', RW_OUTLINE_FILE); }
async function rwResolveConfiguredFile(plugin, key, fallback) {
    var path = rwConfiguredPath(plugin, key, fallback);
    var exact = plugin.app.vault.getAbstractFileByPath(path);
    if (exact) return exact;
    var base = path.split('/').pop();
    var matches = plugin.app.vault.getMarkdownFiles().filter(function(f) { return f.name === base; });
    if (matches.length === 1) {
        plugin.settings[key] = matches[0].path;
        await plugin.saveSettings();
        new obsidian.Notice('已找到移动后的资料文件，并更新路径：' + matches[0].path);
        return matches[0];
    }
    return null;
}
async function rwCreateConfiguredMarkdown(app, path, initial) {
    var file = rwGetVaultFile(app, path);
    if (file) return file;
    var folder = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : '';
    if (folder) {
        var parts = folder.split('/'); var current = '';
        for (var i = 0; i < parts.length; i++) { current = current ? current + '/' + parts[i] : parts[i]; if (!await app.vault.adapter.exists(current)) await app.vault.createFolder(current); }
    }
    return await app.vault.create(path, initial || '');
}
function rwMissingFileMessage(container, label, path) {
    container.empty();
    container.createEl('div', { text: '找不到已设置的资料文件：' + path, cls: 'rw-world-hint' });
    container.createEl('p', { text: '插件不会擅自在原位置重新创建同名文件。请在插件设置 → 资料文件位置中更新路径；如果确实需要新建，请在那里点击「创建文件」。', cls: 'my-char-muted' });
}
function rwExtractJsonBlock(text, tag) {
    var re = new RegExp('```' + tag + '\\s*([\\s\\S]*?)```', 'i');
    var m = String(text || '').match(re);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
}
function rwBuildWorldMarkdown(records, notes) {
    return '# 世界观资料库\n\n> 由人物关系谱系插件管理。可在插件界面新增、编辑资料；下方数据区请勿手动改坏 JSON 格式。\n\n## 资料索引\n\n' +
        (records || []).map(function(r){ return '- **' + (r.name || '未命名') + '** · ' + (r.type || '其他') + (r.summary ? ' — ' + r.summary : ''); }).join('\n') +
        '\n\n## 自由笔记\n\n' + (notes || '可在这里补充不适合归类为单条设定卡的世界背景。') + '\n\n## 插件结构化数据\n\n```world-data\n' + JSON.stringify(records || [], null, 2) + '\n```\n';
}
function rwParseDrawPools(text) {
    var pools = {}, current = '';
    String(text || '').split(/\r?\n/).forEach(function(line){
        var h = line.match(/^#{1,3}\s*(.+?)\s*$/);
        if (h) { current = h[1].replace(/[（(].*?[）)]/g, '').trim(); if (!pools[current]) pools[current] = []; return; }
        if (!current) return;
        var item = line.match(/^\s*(?:[-*+] |\d+[.、)）]\s*)(.+?)\s*$/);
        if (item && item[1] && item[1] !== '（在此处添加条目）') pools[current].push(item[1].trim());
    });
    return pools;
}
function rwDefaultDrawMarkdown() {
    return '# 抽签池\n\n> 每个分类使用二级标题，下面每行写一个候选项。插件会读取本文件进行随机抽取。可直接在 Obsidian 编辑本文件。\n\n## 姓名池\n- 林照雪\n- 沈观澜\n- 谢无咎\n\n## 法宝池\n- 玄霜剑\n- 山河印\n- 照夜珠\n\n## 地点池\n- 落星谷\n- 归墟海\n- 天游城\n\n## 组织池\n- 太虚剑宗\n- 玄天盟\n- 听雨楼\n';
}
// 3.8.0：轻量 Markdown 资料导入、模板与抽签池联动
function rwParseSimpleWorldMarkdown(source, defaultType) {
    var rows=[], currentType=defaultType||'其他设定', current=null;
    var aliases={'地点':'地点与区域','地点秘境':'地点与区域','秘境':'地点与区域','人物':'人物与种族','种族':'人物与种族','组织':'组织与势力','组织宗门':'组织与势力','宗门':'组织与势力','功法':'功法与能力','功法术式':'功法与能力','术法':'功法与能力','法宝':'法宝与道具','道具':'法宝与道具','历史':'历史与事件','事件':'历史与事件','规则':'规则与体系'};
    function flush(){if(current&&current.name)rows.push(current);current=null;}
    String(source||'').split(/\r?\n/).forEach(function(line){
        var h=line.match(/^\s*(#{1,6})\s*(.+?)\s*$/);
        if(h){var level=h[1].length,title=h[2].trim();if(level===1){flush();return;}if(level===2){flush();currentType=aliases[title]||title;return;}if(level>=3){flush();current={id:'world-'+Date.now()+'-'+Math.floor(Math.random()*1e7),type:currentType,name:title,summary:'',description:'',fields:{},tags:[],drawEnabled:false,createdAt:new Date().toISOString()};return;}}
        if(!current)return;
        if(/^\s*---+\s*$/.test(line))return;
        var kv=line.match(/^\s*(?:[-*+]\s*)?([^：:]+)[：:]\s*(.*)$/);
        if(kv){var key=kv[1].trim(),val=kv[2].trim();if(/^(简介|摘要|概述)$/.test(key))current.summary=val;else if(/^(详细描述|详细内容|正文|内容)$/i.test(key))current.description+=(current.description?'\n':'')+val;else if(/^(别名|曾用名|别称)$/i.test(key))current.aliases=val.split(/[、,，;；]/).map(function(x){return x.trim();}).filter(Boolean);else if(/^(所属人物|人物|持有者|使用者)$/i.test(key))current.people=val.split(/[、,，;；]/).map(function(x){return x.trim();}).filter(Boolean);else if(/^(关联势力或地点|关联地点|关联势力|所属地点)$/i.test(key))current.links=val.split(/[、,，;；]/).map(function(x){return x.trim();}).filter(Boolean);else if(/^(标签|tag|tags)$/i.test(key))current.tags=val.split(/[、,，]/).map(function(x){return x.trim();}).filter(Boolean);else if(/^(加入抽签|抽签)$/i.test(key))current.drawEnabled=/^(是|true|yes|开启|加入)$/i.test(val);else current.fields[key]=val;return;}
        var bullet=line.match(/^\s*[-*+]\s+(.+)$/);if(bullet)current.description+=(current.description?'\n':'')+bullet[1].trim();else if(line.trim()){if(!current.summary&&!current.description)current.summary=line.trim();else current.description+=(current.description?'\n':'')+line.trim();}
    });
    flush();return rows;
}

function rwWorldMarkdownValue(value) {
    if (Array.isArray(value)) return value.map(function(x){return String(x);}).join('、');
    if (value && typeof value === 'object') return Object.keys(value).map(function(k){return k+'：'+rwWorldMarkdownValue(value[k]);}).join('；');
    return value == null ? '' : String(value).replace(/\r?\n/g, '<br>');
}
function rwBuildWorldExportMarkdown(records) {
    var rowsAll=Array.isArray(records)?records:[];
    var lines=['# 世界观资料库','','> 本文件由「人物关系谱系 · World Building Studio」导出。采用普通 Markdown 标题、列表和引用格式，可直接阅读、编辑，并重新导入。','','---'];
    var types=Array.from(new Set(rowsAll.map(function(r){return String(r.type||'其他设定');})));
    types.forEach(function(type){var rows=rowsAll.filter(function(r){return String(r.type||'其他设定')===type;});if(!rows.length)return;lines.push('','## '+type,'','> '+rows.length+' 条资料');rows.forEach(function(r){
        lines.push('','### '+(r.name||'未命名资料'));
        if(r.summary) lines.push('',String(r.summary));
        if(r.aliases&&r.aliases.length)lines.push('','别名：'+r.aliases.join('、'));
        if(r.people&&r.people.length)lines.push('','所属人物：'+r.people.join('、'));
        if(r.links&&r.links.length)lines.push('','关联势力或地点：'+r.links.join('、'));
        var fields=r.fields&&typeof r.fields==='object'?Object.keys(r.fields):[];
        if(fields.length){lines.push('');fields.forEach(function(k){var v=rwWorldMarkdownValue(r.fields[k]);if(v)lines.push('- '+k+'：'+v);});}
        if(r.description){lines.push('','详细描述：','');String(r.description).split(/\r?\n/).forEach(function(line){if(line.trim())lines.push(line.trim());});}
        if(r.tags&&r.tags.length)lines.push('- 标签：'+r.tags.join('、'));
        lines.push('- 加入抽签：'+(r.drawEnabled?'是':'否'));
        lines.push('');
    });lines.push('','---');});
    return lines.join('\n').replace(/\n{4,}/g,'\n\n\n')+'\n';
}

function rwMergeWorldRecords(existing, incoming) {
    var result=existing.slice(), added=0, updated=0, duplicates=[];
    incoming.forEach(function(item){var old=result.filter(function(r){return String(r.name||'').trim().toLowerCase()===String(item.name||'').trim().toLowerCase()&&r.type===item.type;})[0];
        if(old){duplicates.push(item.name);if(item.summary)old.summary=item.summary;if(item.description)old.description=item.description;old.fields=Object.assign({},old.fields||{},item.fields||{});if(item.tags&&item.tags.length)old.tags=Array.from(new Set((old.tags||[]).concat(item.tags)));if(item.aliases&&item.aliases.length)old.aliases=Array.from(new Set((old.aliases||[]).concat(item.aliases)));if(item.people&&item.people.length)old.people=Array.from(new Set((old.people||[]).concat(item.people)));if(item.links&&item.links.length)old.links=Array.from(new Set((old.links||[]).concat(item.links)));if(item.drawEnabled)old.drawEnabled=true;updated++;}
        else{result.push(item);added++;}});
    return {records:result,added:added,updated:updated,duplicates:duplicates};
}
function rwSyncWorldRecordsToDrawPool(worldRecords, poolText) {
    var pools=rwParseDrawPools(poolText), map={'地点秘境':'地点池','地点':'地点池','法宝道具':'法宝池','法宝':'法宝池','组织宗门':'组织池','组织':'组织池','功法术式':'功法池','功法':'功法池','种族历史':'种族池','世界规则':'规则池'};
    (worldRecords||[]).forEach(function(r){var type=String(r.type||'其他').trim();var key=map[type]||((type.slice(-1)==='池')?type:type+'池');if(!pools[key])pools[key]=[];if(r.name&&pools[key].indexOf(r.name)<0)pools[key].push(r.name);});
    var lines=['# 抽签池','', '> 世界观资料可按分类同步进入对应抽签池；原有候选项会保留。'];
    Object.keys(pools).forEach(function(k){lines.push('','## '+k);pools[k].forEach(function(v){lines.push('- '+v);});});
    return lines.join('\n')+'\n';
}

function rwGetOutlineTemplates(plugin){var defaults=[{id:'general',name:'通用小说',fields:['本章目标','核心冲突','关键转折','出场人物','状态']}];var source=Array.isArray(plugin.settings.outlineTemplates)&&plugin.settings.outlineTemplates.length?plugin.settings.outlineTemplates:defaults;return source.map(function(t,i){return {id:String(t.id||('tpl-'+i+'-'+Date.now().toString(36))),name:String(t.name||('未命名模板 '+(i+1))),fields:(Array.isArray(t.fields)?t.fields:[]).map(function(x){return String(x||'').trim();}).filter(Boolean)};}).filter(function(t){return t.fields.length>0;});}
function rwGetActiveOutlineTemplate(plugin){var list=rwGetOutlineTemplates(plugin),id=plugin.settings.activeOutlineTemplate||list[0].id;return list.filter(function(t){return t.id===id;})[0]||list[0];}
function rwRenderMarkdown(app, markdown, target, component){
    target.empty();
    if(obsidian.MarkdownRenderer&&obsidian.MarkdownRenderer.render){obsidian.MarkdownRenderer.render(app,markdown||'（暂无内容）',target,'',component);}
    else {target.createEl('pre',{text:markdown||'（暂无内容）'});}
}
function rwGetOutlineLinkedEventIds(body) {
    var m = String(body || '').match(/<!--\s*rw-timeline-events:([^>]*)-->/i);
    return m ? m[1].split(',').map(function(x){return x.trim();}).filter(Boolean) : [];
}
function rwSetOutlineLinkedEventIds(body, ids) {
    var text = String(body || '');
    text = text.replace(/\n?<!--\s*rw-timeline-events:[^>]*-->\s*/ig, '\n').trim();
    ids = Array.from(new Set((ids || []).filter(Boolean)));
    if (ids.length) text += (text ? '\n\n' : '') + '<!-- rw-timeline-events:' + ids.join(',') + ' -->';
    return text;
}
async function rwPersistTimelineEventIds(app, plugin, events) {
    // Event IDs must live in the plugin sidecar registry, never in timeline Markdown.
    // The previous implementation generated IDs only in memory, then stored those
    // transient IDs in the outline comment; after reload the association broke.
    // Use the exact same canonical path as loadAllData()/rwReconcileTimelineEventRegistry.
    // A different fallback path creates a second registry bucket and breaks IDs after reload.
    var path = getTimelineFullPath(plugin);
    var registry = rwGetEventRegistry(plugin);
    var entries = Array.isArray(registry[path]) ? registry[path] : (registry[path] = []);
    var occurrence = {}, changed = false;
    (events || []).forEach(function (evt) {
        var fp = rwEventFingerprint(evt, path);
        var n = occurrence[fp] || 0; occurrence[fp] = n + 1;
        var key = fp + ':' + n;
        var entry = entries.find(function (x) { return x.key === key; });
        if (!entry && evt.eventId) entry = entries.find(function (x) { return x.id === evt.eventId; });
        if (!entry) {
            entry = { id: evt.eventId || createTimelineEventId(), fingerprint: fp, key: key, lineIndex: evt._lineIndex, storyDesigns: evt.storyDesigns || {} };
            entries.push(entry); changed = true;
        }
        if (evt.eventId !== entry.id) { evt.eventId = entry.id; changed = true; }
        if (entry.fingerprint !== fp || entry.key !== key || entry.lineIndex !== evt._lineIndex) {
            entry.fingerprint = fp; entry.key = key; entry.lineIndex = evt._lineIndex; changed = true;
        }
        if (evt.storyDesigns && Object.keys(evt.storyDesigns).length && (!entry.storyDesigns || !Object.keys(entry.storyDesigns).length)) { entry.storyDesigns = evt.storyDesigns; changed = true; }
        evt.storyDesigns = entry.storyDesigns || {};
    });
    if (changed) await rwSaveEventRegistry(plugin);
    return changed;
}

var OutlineTemplateModal = /** @class */ (function (_super) {
    __extends(OutlineTemplateModal, _super);
    function OutlineTemplateModal(app, plugin, view) { var _this = _super.call(this, app) || this; _this.plugin=plugin; _this.view=view; return _this; }
    OutlineTemplateModal.prototype.onOpen = function () {
        var self=this, el=this.contentEl, plugin=this.plugin; el.className='my-char-modal-body';
        el.createEl('h3',{text:'管理章节模板',cls:'my-char-section-title'});
        el.createEl('p',{text:'可以新增、修改、删除模板，并设置新建章节时默认使用的模板。模板只影响新建章节，不会改写已有大纲。',cls:'my-char-muted'});
        var list=rwGetOutlineTemplates(plugin); if(!list.length)list=[{id:'general',name:'通用小说',fields:['本章目标','核心冲突','关键转折','出场人物','状态']}];
        plugin.settings.outlineTemplates=list.map(function(t){return {id:t.id,name:t.name,fields:t.fields.slice()};});
        var active=plugin.settings.activeOutlineTemplate||list[0].id; if(!list.some(function(t){return t.id===active;}))active=list[0].id; var defaultId=active;
        var selectRow=el.createEl('div',{cls:'my-char-form-row'});selectRow.createEl('label',{text:'选择模板',cls:'my-char-form-label'});var select=selectRow.createEl('select',{cls:'my-char-form-input'});
        var nameRow=el.createEl('div',{cls:'my-char-form-row'});nameRow.createEl('label',{text:'模板名称',cls:'my-char-form-label'});var name=nameRow.createEl('input',{type:'text',cls:'my-char-form-input'});
        var fieldsRow=el.createEl('div',{cls:'my-char-form-row'});fieldsRow.createEl('label',{text:'模板字段（每行一个）',cls:'my-char-form-label'});var fields=fieldsRow.createEl('textarea',{cls:'my-char-form-input'});fields.rows=9;
        var isDefault=el.createEl('label',{cls:'rw-outline-template-default'});var defaultCheck=isDefault.createEl('input',{type:'checkbox'});isDefault.appendText(' 设为新建章节的默认模板');
        function refresh(){select.empty();list.forEach(function(t){select.createEl('option',{text:t.name,attr:{value:t.id}});});select.value=active;load();}
        function current(){return list.filter(function(t){return t.id===active;})[0]||null;}
        function load(){var t=current();name.value=t?t.name:'';fields.value=t?t.fields.join('\n'):'';defaultCheck.checked=defaultId===active;}
        select.addEventListener('change',function(){active=select.value;load();});
        var actions=el.createEl('div',{cls:'my-char-form-actions'});
        var add=actions.createEl('button',{text:'＋ 新建模板',cls:'my-char-btn-ghost'});add.addEventListener('click',function(){var id='tpl-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);list.push({id:id,name:'新模板',fields:['本章目标','核心冲突','关键转折','出场人物','状态']});active=id;refresh();name.focus();name.select();});
        var remove=actions.createEl('button',{text:'删除模板',cls:'my-char-btn-ghost'});remove.addEventListener('click',function(){if(list.length<=1){new obsidian.Notice('至少保留一个章节模板');return;}var t=current();if(!t||!confirmDestructiveAction('删除模板「'+t.name+'」？','不会影响已经创建的章节内容。'))return;var removedId=active;list=list.filter(function(x){return x.id!==active;});active=list[0].id;if(defaultId===removedId)defaultId=active;refresh();});
        var save=actions.createEl('button',{text:'保存模板',cls:'my-char-view-btn'});save.style.flex='1';save.addEventListener('click',async function(){var t=current();if(!t){new obsidian.Notice('请先新建或选择模板');return;}var n=name.value.trim();var fs=fields.value.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);if(!n){new obsidian.Notice('请填写模板名称');return;}if(!fs.length){new obsidian.Notice('至少填写一个模板字段');return;}t.name=n;t.fields=fs;if(defaultCheck.checked)defaultId=active;else if(defaultId===active)defaultId=list[0].id;plugin.settings.activeOutlineTemplate=defaultId;plugin.settings.outlineTemplates=list.map(function(x){return {id:x.id,name:x.name,fields:x.fields.slice()};});try{await plugin.saveSettings();new obsidian.Notice('章节模板已保存');if(self.view)self.view.render();self.close();}catch(e){showUserError('保存章节模板失败',e);}});
        var close=actions.createEl('button',{text:'关闭',cls:'my-char-btn-ghost'});close.addEventListener('click',function(){self.close();});
        refresh();
    };
    OutlineTemplateModal.prototype.onClose=function(){this.contentEl.empty();};
    return OutlineTemplateModal;
}(obsidian.Modal));

MyView.prototype.renderOutlineTab = function(container) {
    var self = this; container.empty(); container.classList.add('my-char-scroll-section','rw-outline-manager');
    var head=container.createEl('div',{cls:'rw-module-hero'}); head.createEl('div',{text:'STORY BLUEPRINT',cls:'rw-module-eyebrow'}); head.createEl('h3',{text:'故事大纲',cls:'my-char-section-title'}); head.createEl('p',{text:'把章节、目标、冲突和转折变成可浏览、可维护的创作结构。资料保存在 Vault 的 Markdown 文件中。',cls:'my-char-muted'});
    var actions=head.createEl('div',{cls:'rw-module-actions'});
    var fileLink=actions.createEl('button',{text:'打开大纲 Markdown',cls:'my-char-btn-ghost'});
    fileLink.addEventListener('click',async function(){try{var f=await rwResolveConfiguredFile(self.plugin,'outlineFilePath',RW_OUTLINE_FILE);if(!f){new obsidian.Notice('找不到故事大纲文件，请检查设置中的文件路径；插件不会自动重建。');return;}await self.app.workspace.getLeaf(false).openFile(f);}catch(e){showUserError('打开大纲失败',e);}});
    var area=container.createEl('div',{cls:'rw-outline-content'}); area.createEl('div',{text:'正在读取故事大纲…',cls:'my-char-muted'});
    (async function(){try{
        var initial='# 故事大纲\n\n'+(self.plugin.settings.novelOutlineText||'## 第一幕：建置\n\n- 核心目标：\n- 引爆事件：\n- 第一转折：\n\n## 第二幕：对抗\n\n- 主要阻碍：\n- 中点反转：\n- 最低谷：\n\n## 第三幕：解决\n\n- 高潮选择：\n- 结局变化：\n');
        var outlinePath=rwGetOutlinePath(self.plugin); var file=await rwResolveConfiguredFile(self.plugin,'outlineFilePath',RW_OUTLINE_FILE); if(!file){rwMissingFileMessage(area,'故事大纲',outlinePath);return;} var md=await self.app.vault.read(file); area.empty();
        var sections=[]; var re=/^##\s+(.+)\s*$/gm, m, matches=[]; while((m=re.exec(md))) matches.push({title:m[1].trim(),start:m.index,end:re.lastIndex});
        matches.forEach(function(x,i){sections.push({title:x.title,body:md.slice(x.end,i+1<matches.length?matches[i+1].start:md.length).trim(),start:x.start,headingEnd:x.end,end:i+1<matches.length?matches[i+1].start:md.length,index:i});});
        var stats=area.createEl('div',{cls:'rw-outline-stats'}); stats.createEl('strong',{text:String(sections.length)}); stats.createEl('span',{text:'个大纲章节 / 幕'});
        var add=area.createEl('div',{cls:'rw-inline-create'}); var title=add.createEl('input',{type:'text',placeholder:'新增章节或情节段标题…',cls:'my-char-form-input'}); var addBtn=add.createEl('button',{text:'＋ 添加',cls:'my-char-view-btn'});
        addBtn.addEventListener('click',async function(){var v=title.value.trim();if(!v)return;var latest=await self.app.vault.read(file);var tpl=rwGetOutlineTemplates(self.plugin).filter(function(t){return t.id===templateSelect.value;})[0]||rwGetActiveOutlineTemplate(self.plugin);var bodyText=tpl.fields.map(function(f){return '- '+f+'：'+(/状态/.test(f)?'待写':'');}).join('\n');await self.app.vault.modify(file,latest.trimEnd()+'\n\n## '+v+'\n\n'+bodyText+'\n');title.value='';self.render();});
        var templateBar=area.createEl('div',{cls:'rw-outline-template-bar'});templateBar.createEl('span',{text:'新章节模板'});var templateSelect=templateBar.createEl('select',{cls:'my-char-select'});rwGetOutlineTemplates(self.plugin).forEach(function(t){templateSelect.createEl('option',{text:t.name,attr:{value:t.id}});});templateSelect.value=rwGetActiveOutlineTemplate(self.plugin).id;
        templateSelect.addEventListener('change',function(){self.plugin.settings.activeOutlineTemplate=templateSelect.value;self.plugin.saveSettings();});
        var manageTemplate=templateBar.createEl('button',{text:'管理章节模板',cls:'my-char-btn-ghost'});manageTemplate.addEventListener('click',function(){new OutlineTemplateModal(self.app,self.plugin,self).open();});
        var outlineFoldBar=area.createEl('div',{cls:'rw-outline-fold-bar'});
        var outlineCards=[];
        var expandOutlines=outlineFoldBar.createEl('button',{text:'▼ 全部展开',cls:'my-char-btn-ghost my-char-btn-xs'});
        var collapseOutlines=outlineFoldBar.createEl('button',{text:'▶ 全部收起',cls:'my-char-btn-ghost my-char-btn-xs'});
        expandOutlines.addEventListener('click',function(){outlineCards.forEach(function(card){card.open=true;});});
        collapseOutlines.addEventListener('click',function(){outlineCards.forEach(function(card){card.open=false;});});
        outlineFoldBar.createEl('span',{text:'默认收起 · 可按需展开章节',cls:'my-char-muted'});
        var list=area.createEl('div',{cls:'rw-outline-list'});
        if(!sections.length) list.createEl('div',{text:'还没有大纲章节。可以从上方添加，或直接编辑 Markdown 文件。',cls:'my-char-view-empty'});
        sections.forEach(function(sec,i){
            var card=list.createEl('details',{cls:'rw-outline-card'});card.open=false;outlineCards.push(card);
            var sum=card.createEl('summary');sum.createEl('strong',{text:sec.title});sum.createEl('span',{text:'展开内容',cls:'rw-outline-open-hint'});
            var body=card.createEl('div',{cls:'rw-outline-card-body'});
            var sectionTools=body.createEl('div',{cls:'rw-module-actions'});var deleteSection=sectionTools.createEl('button',{text:'删除本章大纲',cls:'my-char-btn-ghost'});deleteSection.addEventListener('click',async function(ev){ev.preventDefault();ev.stopPropagation();if(!confirm('删除章节大纲「'+sec.title+'」？\n\n将删除该标题下的全部大纲内容及其事件关联；不会删除时间线事件或故事线设计。此操作不可自动撤销。'))return;try{var latest=await self.app.vault.read(file);var fresh=[],rr=/^##\s+(.+)\s*$/gm,mm2;while((mm2=rr.exec(latest)))fresh.push({title:mm2[1].trim(),start:mm2.index,end:rr.lastIndex});var target=fresh[sec.index];if(!target||target.title!==sec.title){var same=fresh.filter(function(x){return x.title===sec.title;});if(same.length===1)target=same[0];else{new obsidian.Notice('大纲结构已变化或存在同名章节，请刷新后重试');return;}}var end=fresh[fresh.indexOf(target)+1]?fresh[fresh.indexOf(target)+1].start:latest.length;var before=latest.slice(0,target.start);var after=latest.slice(end);var nextText=(before.replace(/\n+$/,'\n\n')+after.replace(/^\n+/, '')).replace(/\n{4,}/g,'\n\n\n');await self.app.vault.modify(file,nextText.trimEnd()+'\n');new obsidian.Notice('已删除章节大纲：'+sec.title);self.render();}catch(err){showUserError('删除章节大纲失败',err);}});
            var linkedIds=rwGetOutlineLinkedEventIds(sec.body);
            var linkedEvents=(self.timeline||[]).filter(function(e){return e.eventId&&linkedIds.indexOf(e.eventId)>=0;});
            var linkedBox=body.createEl('section',{cls:'rw-outline-linked-events'});
            var linkedHead=linkedBox.createEl('div',{cls:'rw-outline-linked-head'});
            linkedHead.createEl('strong',{text:'关联的时间线事件'});
            linkedHead.createEl('span',{text:String(linkedEvents.length)+' 条',cls:'rw-outline-linked-count'});
            if(linkedEvents.length){
                var linkedList=linkedBox.createEl('div',{cls:'rw-outline-linked-list'});
                linkedEvents.forEach(function(evt,index){
                    var item=linkedList.createEl('article',{cls:'rw-outline-linked-event'});
                    var eventTop=item.createEl('div',{cls:'rw-outline-event-main'});
                    eventTop.createEl('span',{text:(evt.year||'未标注时间')+(evt.month&&evt.month!=='未标注'?' · '+evt.month:''),cls:'rw-outline-event-date'});
                    eventTop.createEl('div',{text:evt.event||'未命名事件',cls:'rw-outline-event-title'});
                    var eventActions=item.createEl('div',{cls:'rw-outline-event-actions'});
                    var jump=eventActions.createEl('button',{text:'查看事件',cls:'rw-outline-text-action'});
                    jump.addEventListener('click',function(){self.tab='timeline';self._pendingFocusEvent=evt;self._pendingHighlightLineIndex=evt._lineIndex!=null?evt._lineIndex:null;self.render();});
                    var designs = rwGetStoryDesignEntries(evt).filter(function (d) {
                        var chapter = String(d.chapter || '').replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].replace(/\.md$/i, '').trim();
                        var sectionTitle = String(sec.title || '').trim();
                        return chapter && (chapter === sectionTitle || chapter.toLowerCase() === sectionTitle.toLowerCase() || sectionTitle.toLowerCase().indexOf(chapter.toLowerCase()) === 0 || chapter.toLowerCase().indexOf(sectionTitle.toLowerCase()) === 0);
                    });
                    if(designs.length){
                        var designList=item.createEl('div',{cls:'rw-outline-design-list'});
                        designs.forEach(function (design) {
                            var designRow = designList.createEl('div', { cls: 'rw-outline-design-link' });
                            var designText=designRow.createEl('div',{cls:'rw-outline-design-text'});
                            designText.createEl('strong', { text: '✦ ' + (design.title || '故事设计') });
                            designText.createEl('div', { text: design.content || '（尚未填写内容）', cls: 'rw-outline-design-preview' });
                            var editDesign = designRow.createEl('button', { text: '编辑', cls: 'rw-outline-text-action' });
                            editDesign.addEventListener('click', function () { new StoryDesignModal(self.app, self.plugin, self, evt, design.id).open(); });
                        });
                    }
                    var addDesign = eventActions.createEl('button', { text: '＋ 新增故事线设计', cls: 'rw-outline-text-action' });
                    addDesign.addEventListener('click', function () { new StoryDesignModal(self.app, self.plugin, self, evt, null, sec.title).open(); });
                });
            } else linkedBox.createEl('p',{text:'尚未关联事件。大纲是计划，时间线是实际发生的事实；关联不会自动改写任何一方。',cls:'my-char-muted'});
            var associate=body.createEl('button',{text:'＋ 关联时间线事件',cls:'my-char-btn-ghost'});
            associate.addEventListener('click',async function(){
                try{
                    var allEvents=(self.timeline||[]).slice();
                    if(!allEvents.length){new obsidian.Notice('当前时间线还没有事件');return;}
                    await rwPersistTimelineEventIds(self.app,self.plugin,allEvents);
                    var ids=await chooseTimelineEvents(self.app,allEvents,linkedEvents.map(function(e){return e.eventId;}));
                    if(ids===null)return;
                    var latest=await self.app.vault.read(file);
                    var sectionRe=/^##\s+(.+)\s*$/gm, mm, starts=[];while((mm=sectionRe.exec(latest)))starts.push({title:mm[1].trim(),start:mm.index,end:sectionRe.lastIndex});
                    var target=starts[sec.index];if(!target||target.title!==sec.title){var same=starts.filter(function(x){return x.title===sec.title;});if(same.length===1)target=same[0];else{new obsidian.Notice('大纲章节位置已变化或存在同名章节，请刷新后重试');return;}}
                    var next=starts.filter(function(x){return x.start>target.start;})[0];
                    var sectionEnd=next?next.start:latest.length;
                    var sectionText=latest.slice(target.end,sectionEnd);
                    var newBody=rwSetOutlineLinkedEventIds(sectionText,ids);
                    latest=latest.slice(0,target.end)+'\n'+newBody+'\n\n'+latest.slice(sectionEnd);
                    await self.app.vault.modify(file,latest);
                    new obsidian.Notice('已更新大纲与时间线事件关联');self.render();
                }catch(err){showUserError('关联时间线事件失败',err);}
            });
            var rendered=body.createEl('div',{cls:'rw-outline-rendered markdown-rendered'});rwRenderMarkdown(self.app,sec.body||'尚未填写内容',rendered,self);
            var row=body.createEl('div',{cls:'rw-module-actions'});var edit=row.createEl('button',{text:'在 Obsidian 中编辑',cls:'my-char-btn-ghost'});edit.addEventListener('click',async function(){await self.app.workspace.getLeaf(false).openFile(file);});
        });
    }catch(e){area.empty();area.createEl('div',{text:'大纲资料读取失败：'+(e&&e.message?e.message:String(e)),cls:'my-char-view-empty'});}})();
};

// World Building Studio 2.0 — local-first structured worldbuilding workspace.
MyView.prototype.renderWorldTab = function(container) {
    var self=this; container.empty(); container.classList.add('my-char-scroll-section','rw-world-manager','rw-world-studio-v2');
    var settings=this.plugin.settings;
    var defaultCats=[
        {id:'wb-locations',name:'地点与区域',icon:'⌖'},
        {id:'wb-characters',name:'人物与种族',icon:'♙'},
        {id:'wb-factions',name:'组织与势力',icon:'⚑'},
        {id:'wb-skills',name:'功法与能力',icon:'✧'},
        {id:'wb-items',name:'法宝与道具',icon:'◇'},
        {id:'wb-history',name:'历史与事件',icon:'◷'},
        {id:'wb-rules',name:'规则与体系',icon:'▤'},
        {id:'wb-other',name:'其他设定',icon:'＋'}
    ];
    var cats=Array.isArray(settings.worldCategories)&&settings.worldCategories.length?settings.worldCategories:defaultCats.map(function(c){return Object.assign({},c);});
    var records=Array.isArray(settings.worldRecords)?settings.worldRecords:[];
    function normalize(){
        cats=cats.map(function(c){return {id:c.id||('cat-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)),name:String(c.name||'未命名分类'),icon:c.icon||'▤'};});
        records=records.map(function(r){var x=Object.assign({},r);x.id=x.id||('world-'+Date.now()+'-'+Math.random().toString(36).slice(2,8));x.name=String(x.name||'未命名资料');x.type=String(x.type||'其他设定');x.summary=x.summary||'';x.description=x.description||'';x.fields=x.fields&&typeof x.fields==='object'?x.fields:{};x.tags=Array.isArray(x.tags)?x.tags:[];x.aliases=Array.isArray(x.aliases)?x.aliases:(x.aliases?String(x.aliases).split(/[、,，;；]/).map(function(v){return v.trim();}).filter(Boolean):[]);x.people=Array.isArray(x.people)?x.people:(x.owner?[String(x.owner)]:[]);x.links=Array.isArray(x.links)?x.links:(x.related?[String(x.related)]:[]);if(!x.people.length){var legacyPeople=x.fields['所属人物']||x.fields['归属']||x.fields['持有者']||x.fields['使用者'];if(legacyPeople)x.people=String(legacyPeople).split(/[、,，;；]/).map(function(v){return v.trim();}).filter(Boolean);}if(!x.links.length){var legacyLinks=x.fields['关联地点']||x.fields['关联势力']||x.fields['关联势力或地点'];if(legacyLinks)x.links=String(legacyLinks).split(/[、,，;；]/).map(function(v){return v.trim();}).filter(Boolean);}x.drawEnabled=!!x.drawEnabled;return x;});
        records.forEach(function(r){if(!cats.some(function(c){return c.name===r.type;}))cats.push({id:'cat-'+Math.random().toString(36).slice(2,10),name:r.type,icon:'▤'});});
    }
    normalize();
    self._rwWorldRecords=records;
    async function persist(){settings.worldCategories=cats;settings.worldRecords=records;settings.worldDataSchemaVersion=3;await self.plugin.saveSettings();self._rwWorldRecords=records;}
    function catFor(name){return cats.filter(function(c){return c.name===name;})[0];}
    function make(tag,parent,cls){return parent.createEl(tag,{cls:cls||''});}
    var hero=make('section',container,'rw-wb-hero');
    hero.createEl('div',{text:'WORLD BUILDING STUDIO 2.0',cls:'rw-module-eyebrow'});
    hero.createEl('h3',{text:'世界观工作室',cls:'my-char-section-title'});
    hero.createEl('p',{text:'把人物、地点、势力、功法与世界规则整理成可搜索、可关联、可抽取的本地资料库。资料保存在插件本地数据中，Markdown 仅用于导入和导出。',cls:'my-char-muted'});
    var stats=make('div',hero,'rw-wb-stats');
    [[records.length,'资料条目'],[cats.length,'资料分类'],[records.filter(function(r){return r.drawEnabled;}).length,'抽签候选']].forEach(function(x){var box=make('div',stats,'rw-wb-stat');box.createEl('strong',{text:String(x[0])});box.createEl('span',{text:x[1]});});
    var toolbar=make('div',container,'rw-wb-toolbar');
    var exportBtn=toolbar.createEl('button',{text:'导出 Markdown',cls:'my-char-btn-ghost'});
    var importFileBtn=toolbar.createEl('button',{text:'导入 Markdown 文件',cls:'my-char-btn-ghost'});
    var tabs=make('div',container,'rw-wb-tabs');
    var active=self._worldSubtab||'draw';
    if(['artifacts','places','organizations','systems','lore','rules'].indexOf(active)>=0||active.indexOf('custom:')===0) active='overview';
    var tabDefs=[['draw','🎲 灵感抽签'],['overview','资料总览'],['categories','分类管理'],['import','批量导入'],['backup','数据管理']];
    tabDefs.forEach(function(t){var b=tabs.createEl('button',{text:t[1],cls:'rw-world-subtab'});b.classList.toggle('is-active',active===t[0]);b.addEventListener('click',function(){self._worldSubtab=t[0];self.render();});});
    var body=make('div',container,'rw-wb-body');
    function renderEntryList(categoryName,query){
        body.empty();var head=make('div',body,'rw-wb-section-head rw-wb-list-head');head.createEl('h4',{text:categoryName||'全部资料'});head.createEl('span',{text:records.filter(function(r){return !categoryName||r.type===categoryName;}).length+' 条'});
        var filter=head.createEl('select',{cls:'my-char-form-input'});filter.createEl('option',{text:'全部分类',attr:{value:''}});cats.forEach(function(c){filter.createEl('option',{text:c.name,attr:{value:c.name}});});if(categoryName)filter.value=categoryName;
        var search=head.createEl('input',{type:'search',placeholder:'搜索名称、简介、正文、别名、扩展属性…',cls:'my-char-form-input'});
        var extBar=make('div',body,'rw-wb-advanced-filter');var fieldKey=extBar.createEl('select',{cls:'my-char-form-input'});fieldKey.createEl('option',{text:'扩展字段：不限',attr:{value:''}});var allKeys=Array.from(new Set(records.reduce(function(a,r){return a.concat(Object.keys(r.fields||{}));},[]))).sort();allKeys.forEach(function(k){fieldKey.createEl('option',{text:k,attr:{value:k}});});var fieldValue=extBar.createEl('input',{type:'search',placeholder:'字段内容包含…',cls:'my-char-form-input'});
        var grid=make('div',body,'rw-world-card-grid');var selected=new Set();var batch=make('div',body,'rw-wb-batch-toolbar');var selectAll=batch.createEl('button',{text:'全选当前结果',cls:'my-char-btn-ghost'});var batchDraw=batch.createEl('button',{text:'批量加入抽签',cls:'my-char-btn-ghost'});var batchUndraw=batch.createEl('button',{text:'批量移出抽签',cls:'my-char-btn-ghost'});var batchMove=batch.createEl('button',{text:'批量移动分类',cls:'my-char-btn-ghost'});var batchTags=batch.createEl('button',{text:'批量添加标签',cls:'my-char-btn-ghost'});var batchField=batch.createEl('button',{text:'批量设置扩展字段',cls:'my-char-btn-ghost'});var batchDelete=batch.createEl('button',{text:'批量删除',cls:'my-char-btn-ghost'});var selectedInfo=batch.createEl('span',{text:'已选 0 条',cls:'my-char-muted'});var visibleRows=[];
        function updateSelected(){selectedInfo.textContent='已选 '+selected.size+' 条';}
        function draw(){grid.empty();var q=(search.value||'').trim().toLowerCase(),fk=fieldKey.value,fv=(fieldValue.value||'').trim().toLowerCase();var chosenCategory=filter.value||categoryName;var rows=records.filter(function(r){var hay=[r.name,r.summary,r.description,(r.aliases||[]).join(' '),(r.people||[]).join(' '),(r.links||[]).join(' '),(r.tags||[]).join(' '),JSON.stringify(r.fields||{})].join(' ').toLowerCase();var fieldOk=!fk||!fv||String((r.fields||{})[fk]||'').toLowerCase().indexOf(fv)>=0;return (!chosenCategory||r.type===chosenCategory)&&(!q||hay.indexOf(q)>=0)&&fieldOk;});visibleRows=rows;head.querySelector('span').textContent=rows.length+' 条';
            if(!rows.length){grid.createEl('div',{text:'暂无符合条件的资料。可以新建资料，或调整搜索与筛选条件。',cls:'my-char-view-empty'});return;}
            rows.forEach(function(r){var card=make('article',grid,'rw-world-card rw-wb-entry-card rw-wb-compact-card');card.dataset.worldId=r.id;card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-label','打开资料：'+r.name);var ch=make('div',card,'rw-world-card-head');var left=make('div',ch,'rw-wb-card-title');var check=left.createEl('input',{type:'checkbox',attr:{'aria-label':'选择 '+r.name}});check.checked=selected.has(r.id);check.addEventListener('click',function(e){e.stopPropagation();});check.addEventListener('change',function(){if(check.checked)selected.add(r.id);else selected.delete(r.id);updateSelected();});left.createEl('strong',{text:r.name});ch.createEl('span',{text:r.type,cls:'rw-world-type-pill'});
                if(r.summary)card.createEl('div',{text:r.summary,cls:'rw-world-card-summary'});var meta=[];if(r.aliases&&r.aliases.length)meta.push('别名：'+r.aliases.join('、'));if(r.people&&r.people.length)meta.push('人物：'+r.people.join('、'));if(r.links&&r.links.length)meta.push('关联：'+r.links.join('、'));if(meta.length)card.createEl('div',{text:meta.join('　·　'),cls:'rw-wb-card-meta'});var keys=Object.keys(r.fields||{});if(keys.length){var fieldPreview=keys.slice(0,2).map(function(k){return k+'：'+rwWorldMarkdownValue(r.fields[k]);}).join('　·　');card.createEl('div',{text:fieldPreview,cls:'rw-wb-card-meta'});}var tags=make('div',card,'rw-wb-tags');(r.tags||[]).slice(0,5).forEach(function(t){tags.createEl('span',{text:t});});var foot=make('div',card,'rw-world-card-actions');var edit=foot.createEl('button',{text:'查看 / 编辑',cls:'my-char-btn-ghost'}),drawToggle=foot.createEl('button',{text:r.drawEnabled?'已加入抽签':'加入抽签',cls:'my-char-btn-ghost'}),del=foot.createEl('button',{text:'删除',cls:'my-char-btn-ghost'});
                card.addEventListener('click',function(e){if(e.target.closest('button,input,select,textarea,a'))return;openEditor(r);});card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openEditor(r);}});edit.addEventListener('click',function(e){e.stopPropagation();openEditor(r);});drawToggle.addEventListener('click',async function(e){e.stopPropagation();r.drawEnabled=!r.drawEnabled;await persist();new obsidian.Notice(r.drawEnabled?'已加入灵感抽签':'已从灵感抽签中移除');self.render();});del.addEventListener('click',async function(e){e.stopPropagation();if(!confirm('确定删除「'+r.name+'」？此操作只删除插件本地资料。'))return;records=records.filter(function(x){return x.id!==r.id;});selected.delete(r.id);await persist();self.render();});});updateSelected();}
        selectAll.addEventListener('click',function(){visibleRows.forEach(function(r){selected.add(r.id);});draw();});
        batchDraw.addEventListener('click',async function(){var ids=Array.from(selected);if(!ids.length){new obsidian.Notice('请先勾选资料');return;}records.forEach(function(r){if(ids.indexOf(r.id)>=0)r.drawEnabled=true;});await persist();new obsidian.Notice('已将 '+ids.length+' 条资料加入抽签');self.render();});
        batchUndraw.addEventListener('click',async function(){var ids=Array.from(selected);if(!ids.length){new obsidian.Notice('请先勾选资料');return;}records.forEach(function(r){if(ids.indexOf(r.id)>=0)r.drawEnabled=false;});await persist();new obsidian.Notice('已将 '+ids.length+' 条资料移出抽签');self.render();});
        batchMove.addEventListener('click',async function(){var ids=Array.from(selected);if(!ids.length){new obsidian.Notice('请先勾选资料');return;}var target=await requestTextInput(self.app,'输入目标分类名称（不存在时将自动创建）','');if(!target||!target.trim())return;target=target.trim();if(!catFor(target))cats.push({id:'cat-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:target,icon:'▤'});records.forEach(function(r){if(ids.indexOf(r.id)>=0)r.type=target;});await persist();new obsidian.Notice('已移动 '+ids.length+' 条资料');self.render();});
        batchTags.addEventListener('click',async function(){var ids=Array.from(selected);if(!ids.length){new obsidian.Notice('请先勾选资料');return;}var raw=await requestTextInput(self.app,'输入要追加的标签，多个标签用顿号或逗号分隔','');if(raw===null)return;var ts=raw.split(/[、,，;；]/).map(function(x){return x.trim();}).filter(Boolean);records.forEach(function(r){if(ids.indexOf(r.id)>=0)r.tags=Array.from(new Set((r.tags||[]).concat(ts)));});await persist();new obsidian.Notice('已为 '+ids.length+' 条资料添加标签');self.render();});
        batchField.addEventListener('click',async function(){var ids=Array.from(selected);if(!ids.length){new obsidian.Notice('请先勾选资料');return;}var key=await requestTextInput(self.app,'扩展字段名称（例如：品质、等级、危险程度）','');if(!key||!key.trim())return;var val=await requestTextInput(self.app,'统一设置的字段内容','');if(val===null)return;records.forEach(function(r){if(ids.indexOf(r.id)>=0){r.fields=r.fields||{};r.fields[key.trim()]=val;}});await persist();new obsidian.Notice('已为 '+ids.length+' 条资料设置扩展字段');self.render();});
        batchDelete.addEventListener('click',async function(){var ids=Array.from(selected);if(!ids.length){new obsidian.Notice('请先勾选资料');return;}if(!confirm('确定删除选中的 '+ids.length+' 条资料？建议先导出备份。'))return;records=records.filter(function(r){return ids.indexOf(r.id)<0;});selected.clear();await persist();new obsidian.Notice('批量删除完成');self.render();});
        search.addEventListener('input',draw);filter.addEventListener('change',draw);fieldKey.addEventListener('change',draw);fieldValue.addEventListener('input',draw);draw();var add=body.createEl('button',{text:'＋ 新建资料',cls:'my-char-view-btn'});add.addEventListener('click',function(){openEditor(null,categoryName);});
    }

    function makeLabeledField(parent,label,control,help){var wrap=make('label',parent,'rw-wb-form-field');wrap.createEl('span',{text:label,cls:'rw-wb-field-label'});wrap.appendChild(control);if(help)wrap.createEl('small',{text:help,cls:'rw-wb-field-help'});return control;}
    function listInputValue(value){return Array.isArray(value)?value.join('、'):(value||'');}
    function openEditor(record,categoryName){
        var old=body.querySelector('.rw-wb-editor-modal');if(old)old.remove();var panel=make('section',body,'rw-wb-editor-modal');panel.createEl('h4',{text:record?'编辑资料':'新建资料'});panel.createEl('p',{text:'填写常用信息即可；不需要的项目可以留空。更多属性收纳在扩展设置中。',cls:'my-char-muted'});
        var name=makeLabeledField(panel,'资料名称',panel.createEl('input',{type:'text',placeholder:'例如：紫金红葫芦',cls:'my-char-form-input'}));name.value=record?record.name:'';
        var category=makeLabeledField(panel,'所属分类',panel.createEl('select',{cls:'my-char-form-input'}));cats.forEach(function(c){category.createEl('option',{text:c.name,attr:{value:c.name}});});category.value=record?record.type:(categoryName||cats[0].name);
        var summary=makeLabeledField(panel,'资料简介',panel.createEl('textarea',{placeholder:'用于资料总览的简短介绍',cls:'my-char-form-input'}));summary.value=record?record.summary:'';summary.rows=2;
        // Link world records to the existing character archive, faction manager and location records by their canonical names.
        var peopleWrap=make('div',panel,'rw-wb-form-field');peopleWrap.createEl('span',{text:'所属人物（关联人物档案）',cls:'rw-wb-field-label'});
        var people=peopleWrap.createEl('select',{cls:'my-char-form-input rw-wb-link-select',attr:{multiple:'multiple','aria-label':'选择人物档案'}});people.size=Math.min(4,Math.max(2,self.chars.length));
        var knownPeople=(self.chars||[]).map(function(c){return c.name;}).filter(Boolean);var oldPeople=record?(record.people||[]):[];
        Array.from(new Set(knownPeople.concat(oldPeople))).forEach(function(n){var o=people.createEl('option',{text:n,attr:{value:n}});o.selected=oldPeople.indexOf(n)>=0;});
        var manualPeople=makeLabeledField(peopleWrap,'手动补充人物',peopleWrap.createEl('input',{type:'text',placeholder:'未建档人物可直接填写，多个名称用顿号或逗号分隔',cls:'my-char-form-input'}));
        var archivedSet={};knownPeople.forEach(function(n){archivedSet[n]=true;});manualPeople.value=oldPeople.filter(function(n){return !archivedSet[n];}).join('、');
        peopleWrap.createEl('small',{text:'可多选人物档案，也可填写尚未建立档案的人物；手动填写不会自动创建人物档案。',cls:'rw-wb-field-help'});
        var linksWrap=make('div',panel,'rw-wb-form-field');linksWrap.createEl('span',{text:'关联势力 / 地点',cls:'rw-wb-field-label'});
        var links=linksWrap.createEl('select',{cls:'my-char-form-input rw-wb-link-select',attr:{multiple:'multiple','aria-label':'选择阵营或地点'}});var knownLinks=(self.factions||[]).map(function(f){return f.name;}).filter(Boolean).concat(records.filter(function(r){return /地点|区域|秘境|城市|山脉/.test(r.type||'');}).map(function(r){return r.name;}));var oldLinks=record?(record.links||[]):[];
        Array.from(new Set(knownLinks.concat(oldLinks))).forEach(function(n){var o=links.createEl('option',{text:n,attr:{value:n}});o.selected=oldLinks.indexOf(n)>=0;});
        linksWrap.createEl('small',{text:'来源：阵营管理中的势力，以及世界观资料库中的地点类资料。可按住 Ctrl / Cmd 多选。',cls:'rw-wb-field-help'});
        var desc=makeLabeledField(panel,'详细内容',panel.createEl('textarea',{placeholder:'自由记录完整设定、背景、能力、规则、弱点等内容',cls:'my-char-form-input'}));desc.value=record?record.description:'';desc.rows=6;
        var advanced=make('details',panel,'rw-wb-advanced-settings');advanced.open=!!(record&&((record.aliases||[]).length||(record.tags||[]).length||Object.keys(record.fields||{}).length||record.drawEnabled));var advSummary=advanced.createEl('summary');advSummary.createEl('strong',{text:'扩展设置'});advSummary.createEl('span',{text:'别名、标签、自定义属性與抽签',cls:'rw-wb-advanced-hint'});
        var aliases=makeLabeledField(advanced,'别名 / 曾用名',advanced.createEl('input',{type:'text',placeholder:'多个名称用顿号或逗号分隔',cls:'my-char-form-input'}));aliases.value=record?listInputValue(record.aliases||[]):'';
        var tags=makeLabeledField(advanced,'标签',advanced.createEl('input',{type:'text',placeholder:'多个标签用顿号或逗号分隔',cls:'my-char-form-input'}));tags.value=record?listInputValue(record.tags||[]):'';
        var fieldsWrap=make('div',advanced,'rw-wb-custom-fields');var fieldsTitle=make('div',fieldsWrap,'rw-wb-custom-fields-head');fieldsTitle.createEl('strong',{text:'自定义属性'});fieldsTitle.createEl('span',{text:'可增加品质、等级、稀有度等字段'});var fieldRows=make('div',fieldsWrap,'rw-wb-custom-field-rows');
        function addFieldRow(key,val){var row=make('div',fieldRows,'rw-wb-custom-field-row');var k=row.createEl('input',{type:'text',placeholder:'字段名称',cls:'my-char-form-input'});k.value=key||'';var v=row.createEl('input',{type:'text',placeholder:'字段内容',cls:'my-char-form-input'});v.value=val||'';var rm=row.createEl('button',{text:'移除',cls:'my-char-btn-ghost'});rm.addEventListener('click',function(){row.remove();});}
        Object.keys(record&&record.fields||{}).forEach(function(k){addFieldRow(k,rwWorldMarkdownValue(record.fields[k]));});var addField=fieldsWrap.createEl('button',{text:'＋ 添加自定义属性',cls:'my-char-btn-ghost'});addField.addEventListener('click',function(){addFieldRow('','');});
        var drawLabel=make('label',advanced,'rw-wb-check');var draw=drawLabel.createEl('input',{type:'checkbox'});draw.checked=record?!!record.drawEnabled:false;drawLabel.appendText(' 加入灵感抽签');
        var actions=make('div',panel,'rw-module-actions');var save=actions.createEl('button',{text:'保存资料',cls:'my-char-view-btn'}),cancel=actions.createEl('button',{text:'取消',cls:'my-char-btn-ghost'});cancel.addEventListener('click',function(){panel.remove();});
        save.addEventListener('click',async function(){var n=name.value.trim();if(!n){new obsidian.Notice('请填写资料名称');name.focus();return;}var f={};var invalid=false;fieldRows.querySelectorAll('.rw-wb-custom-field-row').forEach(function(row){var inputs=row.querySelectorAll('input');var k=inputs[0].value.trim(),v=inputs[1].value.trim();if(k&&v)f[k]=v;else if(k||v)invalid=true;});if(invalid){new obsidian.Notice('自定义属性的字段名称和内容都需要填写，或删除空行');return;}var obj=record||{id:'world-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),createdAt:new Date().toISOString()};obj.name=n;obj.type=category.value;obj.summary=summary.value.trim();obj.people=Array.from(new Set(Array.from(people.selectedOptions).map(function(o){return o.value;}).concat(manualPeople.value.split(/[、,，;；\n]/).map(function(x){return x.trim();}).filter(Boolean))));obj.links=Array.from(links.selectedOptions).map(function(o){return o.value;});obj.description=desc.value.trim();obj.aliases=aliases.value.split(/[、,，;；]/).map(function(x){return x.trim();}).filter(Boolean);obj.tags=tags.value.split(/[、,，;；]/).map(function(x){return x.trim();}).filter(Boolean);obj.fields=f;obj.drawEnabled=draw.checked;obj.updatedAt=new Date().toISOString();if(!record)records.push(obj);if(!catFor(obj.type))cats.push({id:'cat-'+Math.random().toString(36).slice(2,9),name:obj.type,icon:'▤'});try{await persist();new obsidian.Notice('资料已保存到插件本地数据');self.render();}catch(e){showUserError('保存世界观资料失败',e);}});
        panel.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
    function renderDraw(){body.empty();var panel=make('section',body,'rw-draw-panel rw-wb-draw');panel.createEl('h4',{text:'灵感抽签'});panel.createEl('p',{text:'这里同时读取世界观资料库中已加入抽签的资料，以及「抽签池.md」中的 Markdown 候选项。编辑 Markdown 后点击刷新即可同步显示。',cls:'my-char-muted'});var controls=make('div',panel,'rw-draw-controls');var sourceSelect=controls.createEl('select',{cls:'my-char-form-input'});var drawBtn=controls.createEl('button',{text:'🎲 随机抽取',cls:'my-char-view-btn'});var refresh=controls.createEl('button',{text:'刷新抽签池 MD',cls:'my-char-btn-ghost'});var result=make('div',panel,'rw-draw-result');result.createEl('span',{text:'等待抽取',cls:'rw-draw-result-label'});result.createEl('strong',{text:'—',cls:'rw-draw-result-value'});var detail=make('p',panel,'rw-wb-draw-detail');var mdView=make('section',panel,'rw-draw-md-preview');mdView.createEl('h5',{text:'抽签池 Markdown 内容'});var poolData={};var file=null;
        async function loadPools(){mdView.empty();mdView.createEl('p',{text:'正在读取抽签池.md…',cls:'my-char-muted'});try{file=await rwResolveConfiguredFile(self.plugin,'drawPoolFilePath',RW_DRAW_FILE);if(!file){mdView.empty();rwMissingFileMessage(mdView,'抽签池',rwGetDrawPath(self.plugin));poolData={};}else{var text=await self.app.vault.read(file);poolData=rwParseDrawPools(text);mdView.empty();var keys=Object.keys(poolData);if(!keys.length)mdView.createEl('p',{text:'抽签池文件中暂无分类或候选项。',cls:'my-char-muted'});keys.forEach(function(k){var d=mdView.createEl('details',{cls:'rw-draw-md-category'});var sm=d.createEl('summary');sm.createEl('strong',{text:k});sm.createEl('span',{text:poolData[k].length+' 项',cls:'my-char-muted'});var ul=d.createEl('ul');poolData[k].forEach(function(v){ul.createEl('li',{text:v});});});}}catch(e){mdView.empty();mdView.createEl('p',{text:'抽签池读取失败：'+(e.message||e),cls:'rw-world-hint'});}rebuildOptions();}
        function rebuildOptions(){var worldCats=Array.from(new Set(records.filter(function(r){return r.drawEnabled;}).map(function(r){return r.type;})));var mdCats=Object.keys(poolData);var all=Array.from(new Set(mdCats.concat(worldCats)));sourceSelect.empty();all.forEach(function(c){sourceSelect.createEl('option',{text:c,attr:{value:c}});});drawBtn.disabled=!all.some(function(c){return (poolData[c]||[]).length||records.some(function(r){return r.drawEnabled&&r.type===c;});});if(!all.length)sourceSelect.createEl('option',{text:'暂无候选分类',attr:{value:''}});}
        drawBtn.addEventListener('click',function(){var c=sourceSelect.value;var pool=(poolData[c]||[]).map(function(n){return {name:n,summary:'来源：抽签池.md · '+c};}).concat(records.filter(function(r){return r.drawEnabled&&r.type===c;}).map(function(r){return {name:r.name,summary:r.summary||r.description||'来源：世界观资料库'};}));if(!pool.length){new obsidian.Notice('当前分类没有候选项');return;}var chosen=pool[Math.floor(Math.random()*pool.length)];result.empty();result.createEl('span',{text:c+' · 本次结果',cls:'rw-draw-result-label'});result.createEl('strong',{text:chosen.name,cls:'rw-draw-result-value'});detail.textContent=chosen.summary||'';});refresh.addEventListener('click',loadPools);loadPools();}
    function renderCategories(){body.empty();var panel=make('section',body,'rw-wb-category-manager');panel.createEl('h4',{text:'分类管理'});panel.createEl('p',{text:'展开分类即可查看和打开其中的资料。重命名会同步更新资料分类；删除分类只会移动资料，不会删除资料本身。',cls:'my-char-muted'});var form=make('div',panel,'rw-wb-category-add');var input=form.createEl('input',{type:'text',placeholder:'新分类名称',cls:'my-char-form-input'});var add=form.createEl('button',{text:'＋ 添加分类',cls:'my-char-view-btn'});var list=make('div',panel,'rw-wb-category-list');function draw(){list.empty();cats.forEach(function(c){var entries=records.filter(function(r){return r.type===c.name;});var details=make('details',list,'rw-wb-category-accordion');details.open=self._rwExpandedWorldCats?!!self._rwExpandedWorldCats[c.id]:false;var summary=details.createEl('summary',{cls:'rw-wb-category-summary'});summary.createEl('strong',{text:(c.icon||'▤')+' '+c.name});summary.createEl('small',{text:entries.length+' 条资料'});var tools=make('div',details,'rw-wb-category-tools');var rename=tools.createEl('button',{text:'重命名',cls:'my-char-btn-ghost'}),remove=tools.createEl('button',{text:'删除分类',cls:'my-char-btn-ghost'});rename.addEventListener('click',async function(e){e.preventDefault();e.stopPropagation();var next=await requestTextInput(self.app,'输入新的分类名称',c.name);if(!next||!next.trim()||cats.some(function(x){return x.id!==c.id&&x.name===next.trim();}))return;records.forEach(function(r){if(r.type===c.name)r.type=next.trim();});c.name=next.trim();await persist();draw();});remove.addEventListener('click',async function(e){e.preventDefault();e.stopPropagation();if(cats.length<=1){new obsidian.Notice('至少保留一个分类');return;}if(!confirm('删除分类「'+c.name+'」？其中资料会移动到「其他设定」，不会删除资料。'))return;var fallback=catFor('其他设定')||cats.filter(function(x){return x.id!==c.id;})[0];records.forEach(function(r){if(r.type===c.name)r.type=fallback.name;});cats=cats.filter(function(x){return x.id!==c.id;});await persist();draw();});details.addEventListener('toggle',function(){self._rwExpandedWorldCats=self._rwExpandedWorldCats||{};self._rwExpandedWorldCats[c.id]=details.open;});var contents=make('div',details,'rw-wb-category-entries');if(!entries.length)contents.createEl('p',{text:'这个分类还没有资料。',cls:'my-char-muted'});entries.forEach(function(r){var item=make('button',contents,'rw-wb-category-entry');item.type='button';item.createEl('strong',{text:r.name});if(r.summary)item.createEl('span',{text:r.summary,cls:'my-char-muted'});item.addEventListener('click',function(){self._rwLocateWorldId=r.id;self._worldSubtab='overview';self.tab='world';self.render();});});});}add.addEventListener('click',async function(){var n=input.value.trim();if(!n)return;if(cats.some(function(c){return c.name===n;})){new obsidian.Notice('该分类已经存在');return;}cats.push({id:'cat-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:n,icon:'▤'});input.value='';await persist();draw();});draw();}
    function renderImport(){body.empty();var panel=make('section',body,'rw-world-import-panel rw-wb-import');panel.createEl('h4',{text:'Markdown 批量导入'});panel.createEl('p',{text:'支持 ## 分类、### 条目名称、- 字段：内容。分类可自定义；导入前先预览，不会写入原 Markdown 文件。',cls:'my-char-muted'});var area=panel.createEl('textarea',{cls:'my-char-form-input',attr:{placeholder:'## 功法\n\n### 火眼金睛\n- 详情：能看穿妖魔伪装\n- 使用者：孙悟空\n\n## 地点与区域\n\n### 花果山\n- 类型：山脉'}});area.style.minHeight='190px';var preview=make('div',panel,'rw-world-import-preview');var actions=make('div',panel,'rw-module-actions');var parse=actions.createEl('button',{text:'解析预览',cls:'my-char-btn-ghost'}),merge=actions.createEl('button',{text:'确认导入本地资料库',cls:'my-char-view-btn'});var parsed=[];parse.addEventListener('click',function(){parsed=rwParseSimpleWorldMarkdown(area.value,'其他设定').map(function(r){var m=Object.assign({},r);m.fields=m.fields||{};m.tags=m.tags||[];m.drawEnabled=false;return m;});preview.empty();preview.createEl('strong',{text:'识别 '+parsed.length+' 条资料'});var counts={};parsed.forEach(function(r){counts[r.type]=(counts[r.type]||0)+1;});Object.keys(counts).forEach(function(k){preview.createEl('div',{text:k+'：'+counts[k]+' 条'});});parsed.slice(0,40).forEach(function(r){preview.createEl('div',{text:'• '+r.type+' / '+r.name+(r.summary?' — '+r.summary:''),cls:'my-char-muted'});});if(!parsed.length)preview.createEl('p',{text:'没有识别到条目，请检查标题层级。'});});merge.addEventListener('click',async function(){if(!parsed.length){new obsidian.Notice('请先解析预览');return;}var merged=rwMergeWorldRecords(records,parsed);if(!confirm('将新增 '+merged.added+' 条、更新 '+merged.updated+' 条。确认导入？'))return;records=merged.records;records.forEach(function(r){if(!catFor(r.type))cats.push({id:'cat-'+Math.random().toString(36).slice(2,9),name:r.type,icon:'▤'});});await persist();new obsidian.Notice('导入完成：新增 '+merged.added+' 条，更新 '+merged.updated+' 条');self._worldSubtab='overview';self.render();});}
    function renderBackup(){body.empty();var panel=make('section',body,'rw-wb-backup');panel.createEl('h4',{text:'数据管理'});panel.createEl('p',{text:'世界观资料保存在插件本地数据中。Markdown 导出用于阅读和交换；JSON 快照用于完整备份与恢复。',cls:'my-char-muted'});var json=JSON.stringify({schemaVersion:3,categories:cats,entries:records},null,2);var backup=panel.createEl('textarea',{cls:'my-char-form-input'});backup.value=json;backup.style.minHeight='180px';var actions=make('div',panel,'rw-module-actions');var copy=actions.createEl('button',{text:'复制 JSON 备份',cls:'my-char-btn-ghost'});var restore=actions.createEl('button',{text:'从 JSON 恢复',cls:'my-char-view-btn'});copy.addEventListener('click',async function(){try{await navigator.clipboard.writeText(backup.value);new obsidian.Notice('JSON 备份已复制');}catch(e){backup.select();new obsidian.Notice('请手动复制文本框内容');}});restore.addEventListener('click',async function(){try{var data=JSON.parse(backup.value);if(!data||!Array.isArray(data.entries)||!Array.isArray(data.categories))throw new Error('备份结构不正确');if(!confirm('将以此备份替换当前世界观资料与分类，建议先复制当前 JSON。继续？'))return;records=data.entries;cats=data.categories;normalize();await persist();new obsidian.Notice('世界观资料已从 JSON 恢复');self.render();}catch(e){showUserError('恢复备份失败',e);}});}
    exportBtn.addEventListener('click',async function(){try{var md=rwBuildWorldExportMarkdown(records);var path=rwGetWorldPath(self.plugin);var file=self.app.vault.getAbstractFileByPath(path);if(file&&file.extension==='md'){if(!confirm('将用格式化后的世界观资料替换现有文件：\n'+path+'\n\n建议先备份原文件。是否继续？'))return;await self.app.vault.modify(file,md);}else{await self.app.vault.create(path,md);}new obsidian.Notice('已导出可读 Markdown：'+path);}catch(e){showUserError('导出 Markdown 失败',e);}});
    importFileBtn.addEventListener('click',async function(){try{var f=await rwResolveConfiguredFile(self.plugin,'worldbuildingFilePath',RW_WORLD_FILE);if(!f){new obsidian.Notice('未找到已设置的 Markdown 文件，请先检查路径');return;}var md=await self.app.vault.read(f);self._worldSubtab='import';self.render();setTimeout(function(){var ta=container.querySelector('.rw-wb-import textarea');if(ta)ta.value=md;},50);}catch(e){showUserError('读取 Markdown 文件失败',e);}});
    // One-time, non-destructive migration from legacy Markdown world-data block.
    (async function(){try{if(!settings.worldDataMigrated){var legacy=await rwResolveConfiguredFile(self.plugin,'worldbuildingFilePath',RW_WORLD_FILE);if(legacy){var oldMd=await self.app.vault.read(legacy);var oldRows=rwExtractJsonBlock(oldMd,'world-data');if(Array.isArray(oldRows)&&oldRows.length){var merged=rwMergeWorldRecords(records,oldRows);records=merged.records;}}settings.worldDataMigrated=true;await persist();}}catch(e){new obsidian.Notice('旧版世界观数据迁移未完成：'+(e.message||e));}})();
    if(active==='draw')renderDraw();else if(active==='categories')renderCategories();else if(active==='import')renderImport();else if(active==='backup')renderBackup();else renderEntryList(null,'');
    if(active==='overview'&&self._rwLocateWorldId){var locateId=String(self._rwLocateWorldId);self._rwLocateWorldId=null;var locateAttempts=0;var locateTimer=function(){locateAttempts++;var target=null;container.querySelectorAll('[data-world-id]').forEach(function(node){if(String(node.dataset.worldId||'')===locateId)target=node;});if(target){target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('is-highlighted');target.setAttribute('tabindex','-1');try{target.focus({preventScroll:true});}catch(e){}window.setTimeout(function(){target.classList.remove('is-highlighted');},3000);}else if(locateAttempts<30){window.setTimeout(locateTimer,160);}else new obsidian.Notice('已打开世界观资料库，但未能定位目标条目；请检查该资料是否被删除');};window.setTimeout(locateTimer,220);}
};

MyView.prototype.renderDashboard = function(container) {
    var self = this;
    container.empty();
    container.classList.add('my-char-scroll-section');

    var totalChars = this.chars.length;
    var totalEvents = this.timeline.length;
    var totalRels = this.relations.length;
    var totalFactions = this.factions.length;

    var dashboardIntro = container.createEl('div', { cls: 'rw-dashboard-intro' });
    dashboardIntro.createEl('strong', { text: '创作数据总览' });
    dashboardIntro.createEl('span', { text: '点击数字卡片可直接进入对应模块；待办提醒可定位到具体人物或事件。', cls: 'my-char-muted' });

    var settings = this.plugin.settings;
    var currentTimeStr = settings.currentTimePoint || '';
    var statusCounts = { alive: 0, dead: 0, unborn: 0, unknown: 0, missing: 0 };
    for (var i = 0; i < this.chars.length; i++) {
        var status = getCharStatusAtTime(this, this.chars[i], currentTimeStr);
        if (statusCounts[status] !== undefined) statusCounts[status]++;
        else statusCounts.unknown++;
    }

    var charsWithRelations = {};
    for (var i = 0; i < this.relations.length; i++) {
        charsWithRelations[this.relations[i].charA] = true;
        charsWithRelations[this.relations[i].charB] = true;
    }
    var isolatedChars = 0;
    for (var i = 0; i < this.chars.length; i++) {
        if (!charsWithRelations[this.chars[i].name]) isolatedChars++;
    }

    var charsAppeared = {};
    for (var i = 0; i < this.timeline.length; i++) {
        var appeared = findCharsInEvent(this.timeline[i].event, this.charNames, this);
        for (var j = 0; j < appeared.length; j++) charsAppeared[appeared[j]] = true;
    }
    var notAppearedChars = 0;
    for (var i = 0; i < this.chars.length; i++) {
        if (!charsAppeared[this.chars[i].name]) notAppearedChars++;
    }

    var deadAfterAppearNames = [];
    if (currentTimeStr) {
        for (var i = 0; i < this.chars.length; i++) {
            var c = this.chars[i];
            var status = getCharStatusAtTime(this, c, currentTimeStr);
            if (status === 'dead') {
                var death = this.getFieldValue(c, settings.deathFieldNames || '死亡,死亡时间');
                var deathParsed = parseHistoricalDate(death);
                var deathSort = deathParsed && deathParsed.sortValue !== null ? deathParsed.sortValue : null;
                if (deathSort !== null) {
                    for (var j = 0; j < this.timeline.length; j++) {
                        var yearParsed = parseHistoricalDate(this.timeline[j].storyYear || this.timeline[j].year);
                        var yearSort = yearParsed && yearParsed.sortValue !== null ? yearParsed.sortValue : null;
                        if (yearSort !== null && yearSort > deathSort) {
                            var appeared2 = findCharsInEvent(this.timeline[j].event, [c.name]);
                            if (appeared2.length > 0) { deadAfterAppearNames.push(c.name); break; }
                        }
                    }
                }
            }
        }
    }

    container.createEl('h3', { text: '📊 写作仪表盘', cls: 'my-char-section-title' });

    var timeBar = container.createEl('div');
    timeBar.className = 'my-char-time-bar';
    timeBar.createEl('span', { text: '⏱️ 当前时间点：', cls: 'my-char-time-label' });
    timeBar.createEl('span', { text: currentTimeStr || '（未设置）', cls: 'my-char-time-value' + (currentTimeStr ? ' is-set' : '') });
    var setTimeBtn = timeBar.createEl('button', { text: '⚙️ 设置' });
    setTimeBtn.className = 'my-char-btn-ghost my-char-btn-xs';
    setTimeBtn.addEventListener('click', function() { self.app.setting.open(); self.app.setting.openTabById(self.plugin.manifest.id); });

    var statsGrid = container.createEl('div');
    statsGrid.className = 'my-char-stats-grid';
    var statCards = [
        { label: '👥 人物', value: totalChars, color: '#4a90e2' },
        { label: '📅 事件', value: totalEvents, color: '#2ecc71' },
        { label: '🔗 关系', value: totalRels, color: '#e74c3c' },
        { label: '🏰 阵营', value: totalFactions, color: '#9b59b6' }
    ];
    var statTargets = ['chars', 'timeline', 'relations', 'factions'];
    for (var i = 0; i < statCards.length; i++) {
        var card = statsGrid.createEl('button', { cls: 'my-char-stat-card rw-dashboard-stat-card', attr: { type: 'button', title: '打开' + statCards[i].label.substring(2) } });
        card.innerHTML = '<div class="my-char-stat-icon">' + statCards[i].label.split(' ')[0] + '</div><div class="my-char-stat-value" style="color:' + statCards[i].color + ';">' + statCards[i].value + '</div><div class="my-char-stat-label">' + statCards[i].label.substring(2) + '</div>';
        (function(target) { card.addEventListener('click', function() { self.tab = target; self.render(); }); })(statTargets[i]);
    }

    var statusGrid = container.createEl('div');
    statusGrid.className = 'my-char-status-grid';
    var statusItems = [
        { key: 'alive', label: '🟢 存活', count: statusCounts.alive || 0 },
        { key: 'dead', label: '🔴 已故', count: statusCounts.dead || 0 },
        { key: 'unborn', label: '🔵 未出生', count: statusCounts.unborn || 0 },
        { key: 'missing', label: '⚪ 失踪', count: statusCounts.missing || 0 },
        { key: 'unknown', label: '🟡 未知', count: statusCounts.unknown || 0 }
    ];
    for (var i = 0; i < statusItems.length; i++) {
        var item = statusItems[i];
        var card = statusGrid.createEl('div', { cls: 'my-char-status-card' });
        var color = getStatusColor(item.key);
        card.style.setProperty('--status-color', color);
        card.innerHTML = '<div class="my-char-stat-value" style="font-size:20px;color:' + color + ';">' + item.count + '</div><div class="my-char-stat-label">' + item.label + '</div>';
    }

    // ===== 待办提醒（可点击，带横幅） =====
    var todoSection = container.createEl('div');
    todoSection.className = 'my-char-todo-panel';
    todoSection.createEl('div', { text: '⚠️ 待办提醒（点击条目查看）', cls: 'my-char-todo-title' });

    var todoList = todoSection.createEl('div');
    todoList.className = 'my-char-section';

    var todos = [];
    if (notAppearedChars > 0) {
        todos.push({ text: '📌 ' + notAppearedChars + ' 个人物尚未出场 → 点击查看', severity: 'medium', action: function() { self.showUnappearedChars(); } });
    }
    if (isolatedChars > 0) {
        todos.push({ text: '📌 ' + isolatedChars + ' 个人物没有任何关系 → 点击查看', severity: 'medium', action: function() { self.showIsolatedChars(); } });
    }
    if (deadAfterAppearNames.length > 0) {
        todos.push({ text: '⚠️ ' + deadAfterAppearNames.length + ' 个角色已故后仍出场 → 点击查看', severity: 'high', action: function() { self.showDeadAfterAppear(); } });
    }

    var firstAppearIssues = novelExt.auditFirstAppearSync(this);
    if (firstAppearIssues.length > 0) {
        var missingCount = firstAppearIssues.filter(function(i) { return i.type === 'missing_on_char'; }).length;
        if (missingCount > 0) {
            todos.push({
                text: '📌 ' + missingCount + ' 个人物时间线已出场但档案未填 → 点击一键补全',
                severity: 'medium',
                action: function() { self.fixAllMissingFirstAppear(); }
            });
        }
        var mismatchCount = firstAppearIssues.filter(function(i) { return i.type === 'mismatch'; }).length;
        if (mismatchCount > 0) {
            todos.push({
                text: '⚠️ ' + mismatchCount + ' 个首次出场与时间线不一致 → 点击查看',
                severity: 'high',
                action: function() {
                    self.tab = 'dashboard';
                    self.render();
                }
            });
        }
    }

    var unbornIssues = auditUnbornAppearances(this);
    if (unbornIssues.length > 0) {
        todos.push({
            text: '⚠️ ' + unbornIssues.length + ' 处「出生前出场」穿帮 → 见下方一致性列表',
            severity: 'high',
            action: function() {
                var el = container.querySelector('.my-char-consistency-panel');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    var mdParseErrors = this._mdParseErrors || [];
    if (mdParseErrors.length > 0) {
        todos.push({
            text: '⚠ ' + mdParseErrors.length + ' 行人物 MD 关系/变化解析失败 → 点击查看',
            severity: 'high',
            action: function() {
                var el = container.querySelector('.my-char-parse-error-panel');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    if (todos.length === 0) {
        todoList.createEl('div', { text: '✅ 暂无待办事项', cls: 'my-char-todo-ok' });
    } else {
        for (var i = 0; i < todos.length; i++) {
            (function(todo) {
                var row = todoList.createEl('div', { cls: 'my-char-todo-item' + (todo.severity === 'high' ? ' is-high' : '') });
                row.textContent = todo.text;
                row.addEventListener('click', function() { todo.action(); });
            })(todos[i]);
        }
    }

    if (firstAppearIssues.length > 0) {
        var faSection = container.createEl('div', { cls: 'my-char-todo-panel' });
        faSection.style.borderLeftColor = 'var(--char-accent)';
        var faTitle = faSection.createEl('div', { text: '🔵 首次出场联动（' + firstAppearIssues.length + ' 条）', cls: 'my-char-todo-title' });
        faTitle.style.color = 'var(--char-accent)';
        var faList = faSection.createEl('div', { cls: 'my-char-section' });

        var missingItems = firstAppearIssues.filter(function(i) { return i.type === 'missing_on_char'; });
        if (missingItems.length > 0) {
            var batchBtn = faSection.createEl('button', { text: '⚡ 一键补全 ' + missingItems.length + ' 个缺失', cls: 'my-char-view-btn my-char-btn-sm' });
            batchBtn.style.marginBottom = '8px';
            batchBtn.addEventListener('click', function() { self.fixAllMissingFirstAppear(); });
        }

        var showFa = Math.min(8, firstAppearIssues.length);
        for (var fai = 0; fai < showFa; fai++) {
            (function(issue) {
                var row = faList.createEl('div', { cls: 'my-char-todo-item' + (issue.severity === 'high' ? ' is-high' : '') });
                row.textContent = issue.message;
                if (issue.type === 'missing_on_char') {
                    row.title = '点击写入人物档案';
                } else if (issue.type === 'mismatch') {
                    row.title = '点击用时间线「' + issue.timelineValue + '」覆盖档案';
                } else {
                    row.title = '点击跳转时间线';
                }
                row.addEventListener('click', function() {
                    if (issue.type === 'mismatch') {
                        self.fixFirstAppearIssue(issue, true);
                    } else {
                        self.fixFirstAppearIssue(issue);
                    }
                });
            })(firstAppearIssues[fai]);
        }
        if (firstAppearIssues.length > showFa) {
            faList.createEl('div', { text: '…还有 ' + (firstAppearIssues.length - showFa) + ' 条', cls: 'my-char-muted' });
        }
    }

    var unredeemedLines = novelExt.getUnredeemedPlotLines(this.timeline);
    if (unredeemedLines.length > 0) {
        var plotSection = container.createEl('div', { cls: 'my-char-todo-panel' });
        plotSection.style.borderLeftColor = 'var(--char-purple)';
        plotSection.createEl('div', { text: '🧵 未回收伏笔 / 情节线（' + unredeemedLines.length + ' 条）', cls: 'my-char-todo-title' });
        plotSection.lastChild.style.color = 'var(--char-purple)';
        var plotList = plotSection.createEl('div', { cls: 'my-char-section' });
        var showPlots = Math.min(8, unredeemedLines.length);
        for (var pi = 0; pi < showPlots; pi++) {
            (function(grp) {
                var row = plotList.createEl('div', { cls: 'my-char-todo-item' });
                var lastEvt = grp.events[grp.events.length - 1];
                var loc = (lastEvt.volume ? lastEvt.volume + ' / ' : '') + lastEvt.year;
                row.textContent = grp.plotLine + ' · ' + (grp.latestStatus || '进行中') + ' · ' + grp.events.length + '个节点 — 最新：' + lastEvt.event.substring(0, 24);
                row.title = '最新位置：' + loc;
                row.addEventListener('click', function() {
                    self.tab = 'timeline';
                    self._plotLineFilter = grp.plotLine;
                    self.render();
                });
            })(unredeemedLines[pi]);
        }
    }

    var plotWarnings = novelExt.validatePlotLines(this.timeline);
    if (plotWarnings.length > 0) {
        var warnSection = container.createEl('div', { cls: 'my-char-todo-panel' });
        warnSection.style.borderLeftColor = 'var(--color-orange, #e67e22)';
        warnSection.createEl('div', { text: '⚠️ 伏笔逻辑提醒（' + plotWarnings.length + ' 条）', cls: 'my-char-todo-title' });
        warnSection.lastChild.style.color = 'var(--color-orange, #e67e22)';
        var warnList = warnSection.createEl('div', { cls: 'my-char-section' });
        var showWarns = Math.min(6, plotWarnings.length);
        for (var wi = 0; wi < showWarns; wi++) {
            (function(w) {
                var wrow = warnList.createEl('div', { cls: 'my-char-todo-item' + (w.severity === 'high' ? ' is-high' : '') });
                wrow.textContent = w.message;
                if (w.event) {
                    wrow.addEventListener('click', function() {
                        self.tab = 'timeline';
                        if (w.plotLine) self._plotLineFilter = w.plotLine;
                        self.render();
                        self.showEditEvent(w.event);
                    });
                } else if (w.plotLine) {
                    wrow.addEventListener('click', function() {
                        self.tab = 'timeline';
                        self._plotLineFilter = w.plotLine;
                        self.render();
                    });
                }
            })(plotWarnings[wi]);
        }
    }

    // ===== 出场一致性：出生前出场 =====
    if (unbornIssues.length > 0) {
        var consSection = container.createEl('div', { cls: 'my-char-todo-panel my-char-consistency-panel' });
        consSection.style.borderLeftColor = '#e74c3c';
        consSection.createEl('div', { text: '🧬 出场一致性：出生前出场（' + unbornIssues.length + ' 条）', cls: 'my-char-todo-title' });
        consSection.lastChild.style.color = '#e74c3c';
        var consList = consSection.createEl('div', { cls: 'my-char-section' });
        var showUb = Math.min(8, unbornIssues.length);
        for (var ubi = 0; ubi < showUb; ubi++) {
            (function(issue) {
                var row = consList.createEl('div', { cls: 'my-char-todo-item is-high' });
                row.textContent = issue.message;
                row.title = '点击编辑该事件';
                row.addEventListener('click', function() {
                    self.tab = 'timeline';
                    self.render();
                    if (issue.event) self.showEditEvent(issue.event);
                });
            })(unbornIssues[ubi]);
        }
        if (unbornIssues.length > showUb) {
            consList.createEl('div', { text: '…还有 ' + (unbornIssues.length - showUb) + ' 条', cls: 'my-char-muted' });
        }
    }

    // ===== MD 解析失败提示 =====
    if (mdParseErrors.length > 0) {
        var parseSection = container.createEl('div', { cls: 'my-char-todo-panel my-char-parse-error-panel' });
        parseSection.style.borderLeftColor = '#e67e22';
        parseSection.createEl('div', { text: '📝 人物索引格式校验（' + mdParseErrors.length + ' 行失败）', cls: 'my-char-todo-title' });
        parseSection.lastChild.style.color = '#e67e22';
        parseSection.createEl('p', {
            text: '这些行写了但没进关系 Tab。按提示改格式后刷新即可。',
            cls: 'my-char-muted'
        }).style.margin = '0 0 8px';
        var parseList = parseSection.createEl('div', { cls: 'my-char-section' });
        var showPe = Math.min(12, mdParseErrors.length);
        for (var pei = 0; pei < showPe; pei++) {
            (function(err) {
                var row = parseList.createEl('div', { cls: 'my-char-todo-item is-high' });
                row.innerHTML = '<strong>L' + err.line + '</strong> · ' + escapeHtml(err.char) + ' / ' + escapeHtml(err.section) +
                    '<br><code style="font-size:11px;">' + escapeHtml(err.text) + '</code>' +
                    '<br><span style="font-size:11px;color:#888;">' + escapeHtml(err.reason) + '</span>';
                row.title = '点击打开人物索引并定位';
                row.addEventListener('click', function() {
                    var path = getCharFullPath(self.plugin);
                    self.app.workspace.openLinkText(path, '', false);
                });
            })(mdParseErrors[pei]);
        }
        if (mdParseErrors.length > showPe) {
            parseList.createEl('div', { text: '…还有 ' + (mdParseErrors.length - showPe) + ' 行', cls: 'my-char-muted' });
        }
    }

    // ===== 时间线进度 =====
    var progressSection = container.createEl('div');
    progressSection.className = 'my-char-panel-card';
    progressSection.createEl('div', { text: '⏳ 时间线进度' }).style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;';

    var allYears = [];
    for (var i = 0; i < this.timeline.length; i++) {
        var y = parseHistoricalDate(this.timeline[i].storyYear || this.timeline[i].year);
        if (y && y.sortValue !== null) allYears.push(y.sortValue);
    }
    for (var i = 0; i < this.chars.length; i++) {
        var lc = getCharLifecycle(this, this.chars[i]);
        if (lc.birthParsed && lc.birthParsed.sortValue !== null) allYears.push(lc.birthParsed.sortValue);
        if (lc.deathParsed && lc.deathParsed.sortValue !== null) allYears.push(lc.deathParsed.sortValue);
        if (lc.firstAppearParsed && lc.firstAppearParsed.sortValue !== null) allYears.push(lc.firstAppearParsed.sortValue);
    }

    if (allYears.length > 0) {
        allYears.sort(function(a, b) { return a - b; });
        var minYear = allYears[0];
        var maxYear = allYears[allYears.length - 1];
        var currentSort = null;
        if (currentTimeStr) {
            var cp = parseHistoricalDate(currentTimeStr);
            if (cp && cp.sortValue !== null) currentSort = cp.sortValue;
        }
        var progressPct = 0;
        var progressText = '';
        if (currentSort !== null && (maxYear - minYear) > 0) {
            progressPct = Math.min(Math.max(((currentSort - minYear) / (maxYear - minYear)) * 100, 0), 100);
            progressText = '已覆盖 ' + Math.round(progressPct) + '%（' + formatSortValue(minYear) + ' → ' + formatSortValue(currentSort) + '）';
        } else {
            progressPct = 100;
            progressText = formatSortValue(minYear) + ' → ' + formatSortValue(maxYear);
        }
        var progressRow = progressSection.createEl('div');
        progressRow.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
        var barContainer = progressRow.createEl('div');
        barContainer.style.cssText = 'flex:1;min-width:100px;height:16px;background:#e8e8e8;border-radius:8px;overflow:hidden;';
        var barFill = barContainer.createEl('div');
        var barColor = progressPct > 80 ? '#2ecc71' : (progressPct > 40 ? '#f39c12' : '#e74c3c');
        barFill.style.cssText = 'height:100%;width:' + progressPct + '%;background:' + barColor + ';border-radius:8px;';
        progressRow.createEl('span', { text: progressText }).style.cssText = 'font-size:12px;color:#666;';
        progressSection.createEl('div', { text: '时间跨度：' + formatSortValue(minYear) + ' ～ ' + formatSortValue(maxYear) + '（共 ' + (maxYear - minYear) + ' 年）' }).style.cssText = 'font-size:11px;color:#888;margin-top:4px;';
    } else {
        progressSection.createEl('div', { text: '暂无时间数据' }).style.cssText = 'font-size:12px;color:#999;padding:8px 0;';
    }

    // ===== 最近活动（基于当前时间点） =====
    var recentSection = container.createEl('div');
    recentSection.className = 'my-char-panel-card';
    recentSection.createEl('div', { text: '📝 最近活动（当前时间点之前）' }).style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;';

    // 获取当前时间点的数值
    var currentSortRecent = null;
    if (currentTimeStr) {
        var cpRecent = parseHistoricalDate(currentTimeStr);
        if (cpRecent && cpRecent.sortValue !== null) currentSortRecent = cpRecent.sortValue;
    }

    var recentList = recentSection.createEl('div');
    var recentEvents = this.timeline.slice();

    // 筛选出当前时间点之前的事件
    if (currentSortRecent !== null) {
        recentEvents = recentEvents.filter(function(evt) {
            var evtParsed = parseHistoricalDate(evt.storyYear || evt.year);
            var evtSort = evtParsed && evtParsed.sortValue !== null ? evtParsed.sortValue : null;
            return evtSort !== null && evtSort <= currentSortRecent;
        });
    }

    // 按年份从晚到早排序
    recentEvents.sort(function(a, b) {
        var ay = parseHistoricalDate(a.storyYear || a.year);
        var by = parseHistoricalDate(b.storyYear || b.year);
        var av = ay && ay.sortValue !== null ? ay.sortValue : -Infinity;
        var bv = by && by.sortValue !== null ? by.sortValue : -Infinity;
        return bv - av;
    });

    var showCount = Math.min(8, recentEvents.length);
    if (showCount > 0) {
        for (var i = 0; i < showCount; i++) {
            var evt = recentEvents[i];
            var row = recentList.createEl('div');
            row.style.cssText = 'padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;';
            var left = row.createEl('span');
            var tagLabel = evt.tag ? getTagLabel(self.plugin, evt.tag) : '📋';
            left.textContent = '[' + (evt.storyYear || evt.year || '未标注') + '] ' + tagLabel + ' ' + String(evt.event || '').substring(0, 40) + (String(evt.event || '').length > 40 ? '...' : '');
            row.style.cursor = 'pointer';
            row.title = '点击打开该事件';
            row.addEventListener('click', function() { self.tab = 'timeline'; self.render(); self.showEditEvent(evt); });
            row.createEl('span', { text: evt.month || '' }).style.cssText = 'color:#aaa;font-size:10px;';
        }
    } else {
        recentList.createEl('div', { text: '当前时间点之前暂无事件记录' }).style.cssText = 'font-size:12px;color:#999;padding:4px 0;';
    }

    var actionRow = container.createEl('div', { cls: 'my-char-btn-group' });
    actionRow.style.cssText = 'margin-top:15px;display:flex;flex-direction:column;gap:8px;';

    var refreshBtn = actionRow.createEl('button', { text: '🔄 刷新仪表盘', cls: 'my-char-view-btn' });
    refreshBtn.style.width = '100%';
    refreshBtn.addEventListener('click', function() { refreshBtn.disabled = true; refreshBtn.textContent = '⏳ 正在刷新…'; self.loadAllData({ silent: true }).then(function() { self.render(); new obsidian.Notice('仪表盘已刷新'); }).catch(function(e) { showUserError('刷新仪表盘失败', e); }).finally(function() { refreshBtn.disabled = false; }); });

    var updateSetBtn = actionRow.createEl('button', { text: '⚡ 一键更新设定集（人物卡+关系图+伏笔）', cls: 'my-char-btn-success' });
    updateSetBtn.style.width = '100%';
    updateSetBtn.addEventListener('click', function() {
        self.loadAllData({ silent: true }).then(function() { return self.updateSettingCollection(); });
    });

    var snapDashBtn = actionRow.createEl('button', { text: '🧊 创建设定快照', cls: 'my-char-btn-warning' });
    snapDashBtn.style.width = '100%';
    snapDashBtn.addEventListener('click', function() {
        self.createDataSnapshot().catch(function(e) { showUserError('创建快照失败', e); });
    });
    var manageDashSnapBtn = actionRow.createEl('button', { text: '📚 管理 / 恢复快照', cls: 'my-char-btn-ghost' });
    manageDashSnapBtn.style.width = '100%';
    manageDashSnapBtn.addEventListener('click', function() { self.openSnapshotManager(); });

    var reportBtn = actionRow.createEl('button', { text: '📄 导出仪表盘报告', cls: 'my-char-btn-purple' });
    reportBtn.style.width = '100%';
    reportBtn.addEventListener('click', function() {
        var report = '# 📊 写作仪表盘报告\n\n';
        report += '> 生成时间：' + new Date().toLocaleString() + '\n> 当前时间点：' + (currentTimeStr || '未设置') + '\n\n';
        report += '## 数据概览\n\n| 指标 | 数值 |\n|------|------|\n';
        report += '| 人物 | ' + totalChars + ' |\n| 事件 | ' + totalEvents + ' |\n| 关系 | ' + totalRels + ' |\n| 阵营 | ' + totalFactions + ' |\n\n';
        report += '## 人物状态分布\n\n| 状态 | 人数 |\n|------|------|\n';
        var statusLabels = { alive: '🟢 存活', dead: '🔴 已故', unborn: '🔵 未出生', missing: '⚪ 失踪', unknown: '🟡 未知' };
        for (var key in statusCounts) { if (statusCounts[key] > 0) { report += '| ' + (statusLabels[key] || key) + ' | ' + statusCounts[key] + ' |\n'; } }
        report += '\n## 待办提醒\n\n';
        if (todos.length === 0) { report += '✅ 暂无待办事项\n\n'; } else { for (var i = 0; i < todos.length; i++) { report += '- ' + todos[i].text + '\n'; } report += '\n'; }
        if (unbornIssues.length > 0) {
            report += '## 出生前出场\n\n';
            for (var ui = 0; ui < unbornIssues.length; ui++) report += '- ' + unbornIssues[ui].message + '\n';
            report += '\n';
        }
        if (plotWarnings.length > 0) {
            report += '## 伏笔逻辑提醒\n\n';
            for (var pwi = 0; pwi < plotWarnings.length; pwi++) report += '- ' + plotWarnings[pwi].message + '\n';
            report += '\n';
        }
        if (mdParseErrors.length > 0) {
            report += '## MD 解析失败\n\n';
            for (var mei = 0; mei < mdParseErrors.length; mei++) {
                var me = mdParseErrors[mei];
                report += '- L' + me.line + ' · ' + me.char + ' / ' + me.section + '：`' + me.text + '` — ' + me.reason + '\n';
            }
            report += '\n';
        }
        novelExt.downloadTextFile(report, 'dashboard-report.md', 'text/markdown;charset=utf-8');
        new obsidian.Notice('✅ 仪表盘报告已下载');
    });
};

// ========== 扩展设置（使用场景、Tab 显示、术语、当前时间点） ==========

var __origDisplayFinal = SettingTab.prototype.display;
SettingTab.prototype.display = function() {
    __origDisplayFinal.call(this);
    var el = this.containerEl;
    var self = this;

    var sceneSection = el.createEl('div');
    sceneSection.style.cssText = 'margin-top:16px;padding-top:8px;border-top:2px solid var(--background-modifier-border);';
    sceneSection.createEl('h3', { text: '🎯 使用场景与界面' }).style.cssText = 'margin:0 0 8px;font-size:15px;font-weight:bold;';
    sceneSection.createEl('p', { text: '同一套数据可用于小说、日记、跑团、知识图谱等不同场景。选择场景后会自动隐藏不常用的 Tab。' })
        .style.cssText = 'font-size:12px;color:var(--text-muted);margin:0 0 12px;';

    if (!this.plugin.settings.hiddenTabs) this.plugin.settings.hiddenTabs = [];
    if (!this.plugin.settings.useCaseMode) this.plugin.settings.useCaseMode = 'novel';

    new obsidian.Setting(sceneSection)
        .setName('使用场景')
        .setDesc('快速切换界面布局与字段预设（选「自定义」后可单独开关下方 Tab）')
        .addDropdown(function(dropdown) {
            dropdown.addOption('novel', USE_CASE_PRESETS.novel.label);
            dropdown.addOption('diary', USE_CASE_PRESETS.diary.label);
            dropdown.addOption('trpg', USE_CASE_PRESETS.trpg.label);
            dropdown.addOption('knowledge', USE_CASE_PRESETS.knowledge.label);
            dropdown.addOption('custom', USE_CASE_PRESETS.custom.label);
            dropdown.setValue(self.plugin.settings.useCaseMode || 'novel');
            dropdown.onChange(async function(value) {
                if (value !== 'custom') {
                    applyUseCaseMode(self.plugin, value);
                } else {
                    self.plugin.settings.useCaseMode = 'custom';
                }
                await self.plugin.saveSettings();
                refreshCharView(self.app);
                new obsidian.Notice('已切换为：' + (USE_CASE_PRESETS[value] ? USE_CASE_PRESETS[value].label : value));
                self.display();
            });
        });

    new obsidian.Setting(sceneSection)
        .setName('视图标题')
        .setDesc('主界面顶部名称。留空则使用场景默认（如「知识关系图谱」）')
        .addText(function(text) {
            text.setPlaceholder('人物关系谱系')
                .setValue(self.plugin.settings.viewTitle || '')
                .onChange(async function(value) {
                    self.plugin.settings.viewTitle = value.trim();
                    await self.plugin.saveSettings();
                    refreshCharView(self.app);
                });
        });

    sceneSection.createEl('h4', { text: '术语自定义（留空则用场景默认）' }).style.cssText = 'margin:16px 0 8px;font-size:13px;font-weight:bold;color:var(--text-muted);';
    var termFields = [
        { key: 'entity', label: '实体', placeholder: '人物 / 概念 / 角色' },
        { key: 'faction', label: '分组', placeholder: '阵营 / 分类' },
        { key: 'relation', label: '关联', placeholder: '关系 / 关联' },
        { key: 'timeline', label: '时间轴', placeholder: '时间线 / 日记 / 脉络' },
        { key: 'event', label: '事件', placeholder: '事件 / 记录 / 节点' }
    ];
    if (!this.plugin.settings.termLabels) this.plugin.settings.termLabels = {};
    for (var tfi = 0; tfi < termFields.length; tfi++) {
        (function(field) {
            new obsidian.Setting(sceneSection)
                .setName(field.label + '名称')
                .setDesc('界面中「' + field.label + '」的显示用词')
                .addText(function(text) {
                    text.setPlaceholder(field.placeholder)
                        .setValue(self.plugin.settings.termLabels[field.key] || '')
                        .onChange(async function(value) {
                            if (!self.plugin.settings.termLabels) self.plugin.settings.termLabels = {};
                            self.plugin.settings.termLabels[field.key] = value.trim();
                            self.plugin.settings.useCaseMode = 'custom';
                            await self.plugin.saveSettings();
                            refreshCharView(self.app);
                        });
                });
        })(termFields[tfi]);
    }

    new obsidian.Setting(sceneSection)
        .setName('小说精简 Tab')
        .setDesc('开启后默认只显示人物/时间线/关系/仪表盘等核心 Tab，其余收在「更多功能」')
        .addToggle(function(toggle) {
            toggle.setValue(self.plugin.settings.novelCompactUI !== false);
            toggle.onChange(async function(value) {
                self.plugin.settings.novelCompactUI = value;
                await self.plugin.saveSettings();
                refreshCharView(self.app);
            });
        });

    new obsidian.Setting(sceneSection)
        .setName('默认收起顶栏')
        .setDesc('小屏幕时可收起标题、工具栏、故事进度与 Tab，仅保留一行精简栏（视图中也可随时切换）')
        .addToggle(function(toggle) {
            toggle.setValue(!!self.plugin.settings.topChromeCollapsed);
            toggle.onChange(async function(value) {
                self.plugin.settings.topChromeCollapsed = value;
                await self.plugin.saveSettings();
                refreshCharView(self.app);
            });
        });

    new obsidian.Setting(sceneSection)
        .setName('出场事件自动同步首次出场')
        .setDesc('时间线事件标签为 [出场]/[登场] 时，自动写入人物档案中的「首次出场」字段（已有值且不一致时跳过，可在仪表盘修复）')
        .addToggle(function(toggle) {
            toggle.setValue(self.plugin.settings.syncFirstAppearOnEvent !== false);
            toggle.onChange(async function(value) {
                self.plugin.settings.syncFirstAppearOnEvent = value;
                await self.plugin.saveSettings();
            });
        });

    new obsidian.Setting(sceneSection)
        .setName('时间线结构模式')
        .setDesc('auto=自动识别卷章；chapter=分卷分章；historical=历史年代表')
        .addDropdown(function(dropdown) {
            dropdown.addOption('auto', '自动识别');
            dropdown.addOption('chapter', '分卷 / 分章');
            dropdown.addOption('historical', '历史年份');
            dropdown.setValue(self.plugin.settings.timelineMode || 'auto');
            dropdown.onChange(async function(value) {
                self.plugin.settings.timelineMode = value;
                await self.plugin.saveSettings();
                refreshCharView(self.app);
            });
        });

    new obsidian.Setting(sceneSection)
        .setName('时间线纪年方式')
        .setDesc('古代小说若年份只写“300年”而未写“公元前”，可选择公元前；明确写有公元前/BC 的日期始终优先按显式纪年解析。')
        .addDropdown(function(dropdown) {
            dropdown.addOption('auto', '自动识别（未注明按公元后）');
            dropdown.addOption('bc', '公元前（裸年份按公元前）');
            dropdown.addOption('ad', '公元后（裸年份按公元后）');
            dropdown.setValue(self.plugin.settings.timelineEra || 'auto');
            dropdown.onChange(async function(value) {
                self.plugin.settings.timelineEra = value;
                ACTIVE_TIMELINE_ERA = value;
                await self.plugin.saveSettings();
                refreshCharView(self.app);
            });
        });

    new obsidian.Setting(sceneSection)
        .setName('关系同步到 Markdown')
        .setDesc('保存关系/阵营时写入「关系与阵营.md」，与 json 双备份')
        .addToggle(function(toggle) {
            toggle.setValue(self.plugin.settings.syncRelationsToMd !== false);
            toggle.onChange(async function(value) {
                self.plugin.settings.syncRelationsToMd = value;
                await self.plugin.saveSettings();
            });
        });

    sceneSection.createEl('h4', { text: '📖 小说事件标签预设' }).style.cssText = 'margin:16px 0 8px;font-size:13px;font-weight:bold;color:var(--text-muted);';
    var tagPresetRow = sceneSection.createEl('div');
    tagPresetRow.className = 'my-char-btn-group';
    var presetKeys = Object.keys(novelExt.NOVEL_TAG_PRESETS);
    for (var pi = 0; pi < presetKeys.length; pi++) {
        (function(key) {
            var p = novelExt.NOVEL_TAG_PRESETS[key];
            var btn = tagPresetRow.createEl('button', { text: p.label });
            btn.className = 'my-char-view-btn my-char-btn-sm';
            btn.addEventListener('click', async function() {
                novelExt.applyNovelTagPreset(self.plugin, key);
                await self.plugin.saveSettings();
                invalidateTagCache(self.plugin);
                refreshCharView(self.app);
                new obsidian.Notice('已应用标签预设：' + p.label);
            });
        })(presetKeys[pi]);
    }

    sceneSection.createEl('h4', { text: 'Tab 显示开关' }).style.cssText = 'margin:16px 0 8px;font-size:13px;font-weight:bold;color:var(--text-muted);';
    var tabToggleBox = sceneSection.createEl('div');
    tabToggleBox.style.cssText = 'padding:8px 12px;background:var(--background-secondary);border-radius:8px;';

    for (var ti = 0; ti < ALL_VIEW_TABS.length; ti++) {
        (function(tab) {
            if (tab.alwaysShow) return;
            new obsidian.Setting(tabToggleBox)
                .setName(tab.label)
                .setDesc(tab.desc)
                .addToggle(function(toggle) {
                    var hidden = self.plugin.settings.hiddenTabs || [];
                    toggle.setValue(hidden.indexOf(tab.id) === -1);
                    toggle.onChange(async function(show) {
                        var list = (self.plugin.settings.hiddenTabs || []).slice();
                        var idx = list.indexOf(tab.id);
                        if (show && idx !== -1) list.splice(idx, 1);
                        if (!show && idx === -1) list.push(tab.id);
                        self.plugin.settings.hiddenTabs = list;
                        self.plugin.settings.useCaseMode = 'custom';
                        await self.plugin.saveSettings();
                        refreshCharView(self.app);
                    });
                });
        })(ALL_VIEW_TABS[ti]);
    }

    var allSettings = el.querySelectorAll('.setting-item');
    var lastSetting = allSettings[allSettings.length - 1];
    if (lastSetting) {
        var hr = el.createEl('hr');
        if (lastSetting.parentNode) { lastSetting.parentNode.insertBefore(hr, lastSetting.nextSibling); }
        var settingDiv = el.createEl('div', { cls: 'setting-item' });
        settingDiv.style.cssText = 'border-top:1px solid var(--background-modifier-border);padding:12px 0;';
        var infoDiv = settingDiv.createEl('div', { cls: 'setting-item-info' });
        infoDiv.createEl('div', { cls: 'setting-item-name', text: '⏱️ 当前时间点' });
        infoDiv.createEl('div', { cls: 'setting-item-description', text: '设置故事当前时间点，用于判断人物状态。格式：公元前280年、前100年、280年、公元100年' });
        var controlDiv = settingDiv.createEl('div', { cls: 'setting-item-control' });
        var textInput = controlDiv.createEl('input', { type: 'text' });
        textInput.style.cssText = 'width:200px;padding:6px 10px;border-radius:4px;border:1px solid var(--background-modifier-border);';
        textInput.placeholder = '如：300年、公元前280年';
        textInput.value = this.plugin.settings.currentTimePoint || '';
        textInput.addEventListener('change', async function() {
            var val = textInput.value.trim();
            self.plugin.settings.currentTimePoint = val;
            await self.plugin.saveSettings();
            refreshCharView(self.app);
            new obsidian.Notice('已更新当前时间点：' + (val || '（未设置）'));
        });

        new obsidian.Setting(el)
            .setName('启用当前时间点过滤')
            .setDesc('开启后：关系按开始/结束时间过滤，时间线隐藏未来事件（人物状态徽章始终按当前时间点判断）')
            .addToggle(function(toggle) {
                toggle.setValue(self.plugin.settings.timeFilterEnabled !== false)
                    .onChange(async function(value) {
                        self.plugin.settings.timeFilterEnabled = value;
                        await self.plugin.saveSettings();
                        refreshCharView(self.app, { silent: true });
                    });
            });

        new obsidian.Setting(el)
            .setName('设定集文件名')
            .setDesc('「一键更新设定集」写入人物文件夹下的固定文件名，便于共创随时打开')
            .addText(function(text) {
                text.setPlaceholder('设定集.md')
                    .setValue(self.plugin.settings.settingCollectionFile || '设定集.md')
                    .onChange(async function(value) {
                        self.plugin.settings.settingCollectionFile = (value || '设定集.md').trim();
                        await self.plugin.saveSettings();
                    });
            });
    }
};

// ========== 扩展默认设置 ==========

var __origLoadSettingsFinal = RelationWeaverPlugin.prototype.loadSettings;
RelationWeaverPlugin.prototype.loadSettings = async function() {
    var defaults = {
        charFile: '人物索引.md', charFolder: '', timelineFile: '时间线.md', timelineFolder: '',
        customFields: '', customRelationTypes: '', factionFieldName: '阵营',
        deathFieldNames: '死亡,死亡时间', birthFieldNames: '出生,出生时间',
        firstAppearFieldName: '首次出场', intimateFieldName: '亲密人物',
        preset: 'default', customEventTags: [], customIntimacyLevels: '',
        currentTimePoint: '', timeFilterEnabled: true, settingCollectionFile: '设定集.md',
        useCaseMode: 'novel', hiddenTabs: [], viewTitle: '',
        termLabels: {}, tabLabels: {}, graphNotesFolder: '', worldbuildingFilePath: '', drawPoolFilePath: '', outlineFilePath: '', outlineTemplates: [{id:'general',name:'通用小说',fields:['本章目标','核心冲突','关键转折','出场人物','状态']}], activeOutlineTemplate: 'general', syncGraphOnSave: false, graphAutoSyncExplicitlyEnabled: false,
        graphSyncMode: 'all', graphSyncTypes: [], worldRecords: [], worldCategories: [], worldDataSchemaVersion: 2, worldDataMigrated: false,
        novelCompactUI: true, topChromeCollapsed: false, timelineMode: 'auto', timelineEra: 'auto', syncRelationsToMd: true,
        syncFirstAppearOnEvent: true,
        relationMetaFile: '关系与阵营.md', novelTagPreset: 'gudai',
        autoDiscoverFromMd: true, syncRelationsToCharMd: true,
        timelineFloatChars: true, floatPanelPos: { x: 24, y: 120 }
    };
    var loaded = await this.loadData() || {};
    this.settings = Object.assign({}, defaults, loaded);
};
// ============================================================
// 🔥 热力图
// ============================================================

// ========== 辅助函数：获取当前时间线所有年份 ==========
function getTimelineYears(view) {
    var years = [];
    var yearSet = {};
    for (var i = 0; i < view.timeline.length; i++) {
        var y = view.timeline[i].year;
        if (!yearSet[y]) {
            yearSet[y] = true;
            years.push(y);
        }
    }
    years.sort();
    return years;
}

// ========== 按粒度拆分年份 ==========
function splitByGranularity(allYears, granularity) {
    var slots = [];
    for (var i = 0; i < allYears.length; i++) {
        var year = allYears[i];
        if (granularity === '年') {
            slots.push({ label: year, year: year, sub: '' });
        } else if (granularity === '半年') {
            slots.push({ label: year + '上', year: year, sub: '上' });
            slots.push({ label: year + '下', year: year, sub: '下' });
        } else if (granularity === '季度') {
            slots.push({ label: year + 'Q1', year: year, sub: 'Q1' });
            slots.push({ label: year + 'Q2', year: year, sub: 'Q2' });
            slots.push({ label: year + 'Q3', year: year, sub: 'Q3' });
            slots.push({ label: year + 'Q4', year: year, sub: 'Q4' });
        } else if (granularity === '月') {
            var months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
            for (var mi = 0; mi < months.length; mi++) {
                slots.push({ label: year + months[mi], year: year, sub: months[mi] });
            }
        }
    }
    return slots;
}

// ========== 获取某个事件属于哪个时间段 ==========
function getSlotLabel(eventYear, granularity, eventMonth) {
    // 简化版：根据年份返回标签
    // 如果有月份信息会更精确
    return eventYear;
}

// ========== 热力图颜色 ==========
function getHeatColor(count, maxCount) {
    if (count === 0) return { bg: '#f0f0f0', text: '#bbb' };
    var ratio = count / maxCount;
    if (ratio < 0.2) return { bg: '#fff7e6', text: '#bf8f00' };
    if (ratio < 0.4) return { bg: '#ffd591', text: '#d46b08' };
    if (ratio < 0.6) return { bg: '#ffa940', text: '#d46b08' };
    if (ratio < 0.8) return { bg: '#fa8c16', text: '#fff' };
    return { bg: '#cf1322', text: '#fff' };
}

// ========== 构建热力图数据 ==========
function buildHeatmapData(view, options) {
    options = options || {};
    var mode = options.mode || '集中';
    var granularity = options.granularity || '年';
    var page = options.page || 1;
    var pageSize = options.pageSize || 20;
    var filterType = options.filterType || '全部';
    var searchText = options.searchText || '';
    var startYearIdx = options.startYearIdx || 0;
    var endYearIdx = options.endYearIdx || 2;
    var selectedPerson = options.selectedPerson || '';
    var selectedPeople = options.selectedPeople || [];

    // 1. 获取所有年份
    var allYears = getTimelineYears(view);
    if (allYears.length === 0) {
        return { timeSlots: [], rows: [], maxCount: 0, totalPeople: 0, totalPages: 0, currentPage: 1 };
    }

    // 2. 限制范围
    if (startYearIdx < 0) startYearIdx = 0;
    if (endYearIdx >= allYears.length) endYearIdx = allYears.length - 1;
    if (startYearIdx > endYearIdx) { var tmp = startYearIdx; startYearIdx = endYearIdx; endYearIdx = tmp; }

    var displayYears = allYears.slice(startYearIdx, endYearIdx + 1);
    var timeSlots = splitByGranularity(displayYears, granularity);

    // 3. 获取人物列表
    var people = view.chars.slice();

    // 4. 模式过滤
    if (mode === '单人' && selectedPerson) {
        people = people.filter(function(c) {
            return c.name === selectedPerson;
        });
    } else if (mode === '多人' && selectedPeople.length > 0) {
        people = people.filter(function(c) {
            return selectedPeople.indexOf(c.name) !== -1;
        });
    }

    // 5. 按类型筛选（仅集中模式）
    if (mode === '集中' && filterType !== '全部') {
        people = people.filter(function(c) {
            var type = view.getCharField(c, '类型');
            return type && type.trim() === filterType;
        });
    }

    // 6. 搜索筛选（仅集中模式）
    if (mode === '集中' && searchText) {
        var kw = searchText.toLowerCase();
        people = people.filter(function(c) {
            return c.name.toLowerCase().indexOf(kw) !== -1;
        });
    }

    // 7. 分页（仅集中模式）
    var totalPeople = people.length;
    var totalPages = 1;
    var pagePeople = people;

    if (mode === '集中') {
        totalPages = Math.max(1, Math.ceil(totalPeople / pageSize));
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        var startIdx = (page - 1) * pageSize;
        pagePeople = people.slice(startIdx, startIdx + pageSize);
    } else {
        pagePeople = people;
        totalPages = 1;
        page = 1;
    }

    // 8. 统计出场
    var rows = [];
    var maxCount = 0;

    var eventsByYear = {};
    for (var ti = 0; ti < view.timeline.length; ti++) {
        var evt = view.timeline[ti];
        if (!eventsByYear[evt.year]) eventsByYear[evt.year] = [];
        eventsByYear[evt.year].push(evt);
    }

    for (var pi = 0; pi < pagePeople.length; pi++) {
        var char = pagePeople[pi];
        var row = {
            name: char.name,
            type: view.getCharField(char, '类型') || '',
            faction: view.getCharField(char, view.plugin.settings.factionFieldName || '阵营') || '',
            counts: {}
        };

        for (var si = 0; si < timeSlots.length; si++) {
            var slot = timeSlots[si];
            row.counts[slot.label] = 0;
            var yearEvents = eventsByYear[slot.year] || [];
            for (var ei = 0; ei < yearEvents.length; ei++) {
                var appeared = findCharsInEvent(yearEvents[ei].event, [char.name]);
                if (appeared.length > 0) {
                    row.counts[slot.label]++;
                }
            }
            if (row.counts[slot.label] > maxCount) maxCount = row.counts[slot.label];
        }
        rows.push(row);
    }

    return {
        timeSlots: timeSlots,
        rows: rows,
        maxCount: maxCount || 1,
        totalPeople: totalPeople,
        totalPages: totalPages,
        currentPage: page,
        pageSize: pageSize,
        allYears: allYears,
        displayYears: displayYears,
        startYearIdx: startYearIdx,
        endYearIdx: endYearIdx
    };
}

// ========== 渲染热力图主函数 ==========
MyView.prototype.renderHeatmap = function(container) {
    var self = this;
    container.empty();
    container.classList.add('my-char-scroll-section');

    // 检查是否有数据
    if (this.timeline.length === 0 || this.chars.length === 0) {
        container.createEl('p', {
            text: '📭 没有数据。请在当前文件夹创建「人物索引.md」和「时间线.md」',
            cls: 'my-char-view-empty'
        }); /* empty state via cls */
        return;
    }

    // ===== 获取所有年份 =====
    var allYears = getTimelineYears(this);
    if (allYears.length === 0) {
        container.createEl('p', { text: '📭 时间线中没有年份数据' }); /* empty state via cls */
        return;
    }

    // ===== 初始化年份范围 =====
    if (this.heatmapYearRange === null) {
        var endIdx = allYears.length - 1;
        var startIdx = Math.max(0, endIdx - 2);
        this.heatmapYearRange = { start: startIdx, end: endIdx };
    }

    // ===== 标题 =====
    var titleRow = container.createEl('div');
    titleRow.className = 'my-char-faction-header';
    titleRow.createEl('h3', { text: '🔥 出场热力图' });

    var modeHint = titleRow.createEl('span');
    modeHint.className = 'my-char-muted';
    if (this.heatmapMode === '集中') modeHint.textContent = '📋 集中视图 · 显示所有人物';
    else if (this.heatmapMode === '单人') modeHint.textContent = '👤 单人深度视图 · 查看单个角色出场轨迹';
    else modeHint.textContent = '👥 多人对比视图 · 对比多个角色出场频率';

    // ===== 工具栏 =====
    var toolbar = container.createEl('div');
    toolbar.className = 'my-char-heatmap-toolbar';

    // 模式切换
    toolbar.createEl('span', { text: '📐 模式:', cls: 'my-char-filter-label' });
    var modeSelect = toolbar.createEl('select');
    modeSelect.className = 'my-char-select';
    var modes = ['集中', '单人', '多人'];
    for (var mi = 0; mi < modes.length; mi++) {
        var opt = document.createElement('option');
        opt.value = modes[mi];
        opt.textContent = modes[mi];
        if (modes[mi] === this.heatmapMode) opt.selected = true;
        modeSelect.appendChild(opt);
    }
    modeSelect.addEventListener('change', function() {
        self.heatmapMode = modeSelect.value;
        if (self.heatmapMode === '单人') {
            if (!self.heatmapSelectedPerson && self.chars.length > 0) {
                self.heatmapSelectedPerson = self.chars[0].name;
            }
        } else if (self.heatmapMode === '多人') {
            if (!self.heatmapSelectedPeople || self.heatmapSelectedPeople.length === 0) {
                self.heatmapSelectedPeople = [];
                for (var ci = 0; ci < Math.min(3, self.chars.length); ci++) {
                    self.heatmapSelectedPeople.push(self.chars[ci].name);
                }
            }
        }
        self.heatmapPage = 1;
        self.renderHeatmap(container);
    });

    // 粒度切换
    toolbar.createEl('span', { text: '粒度:', cls: 'my-char-filter-label' }); toolbar.lastChild.style.marginLeft = '8px';
    var granularitySelect = toolbar.createEl('select');
    granularitySelect.className = 'my-char-select';
    var granularities = ['年', '半年', '季度'];
    for (var gi = 0; gi < granularities.length; gi++) {
        var opt2 = document.createElement('option');
        opt2.value = granularities[gi];
        opt2.textContent = granularities[gi];
        if (granularities[gi] === this.heatmapGranularity) opt2.selected = true;
        granularitySelect.appendChild(opt2);
    }
    granularitySelect.addEventListener('change', function() {
        self.heatmapGranularity = granularitySelect.value;
        self.renderHeatmap(container);
    });

    // 类型筛选（集中模式才有）
    if (this.heatmapMode === '集中') {
        toolbar.createEl('span', { text: '类型:', cls: 'my-char-filter-label' }); toolbar.lastChild.style.marginLeft = '8px';
        var typeSelect = toolbar.createEl('select');
        typeSelect.className = 'my-char-select';

        var typeSet = {};
        for (var i = 0; i < this.chars.length; i++) {
            var typeVal = this.getCharField(this.chars[i], '类型');
            if (typeVal && typeVal.trim()) {
                typeSet[typeVal.trim()] = true;
            }
        }
        var sortOrder = ['⭐ 主角', '主角', '🔶 配角', '配角', '👤 龙套', '龙套'];
        var sortedTypes = [];
        for (var si = 0; si < sortOrder.length; si++) {
            if (typeSet[sortOrder[si]]) {
                sortedTypes.push(sortOrder[si]);
                delete typeSet[sortOrder[si]];
            }
        }
        var remaining = Object.keys(typeSet).sort();
        for (var ri = 0; ri < remaining.length; ri++) {
            sortedTypes.push(remaining[ri]);
        }

        var allOpt = document.createElement('option');
        allOpt.value = '全部';
        allOpt.textContent = '📋 全部';
        if (this.heatmapFilterType === '全部') allOpt.selected = true;
        typeSelect.appendChild(allOpt);

        for (var ti2 = 0; ti2 < sortedTypes.length; ti2++) {
            var opt3 = document.createElement('option');
            opt3.value = sortedTypes[ti2];
            opt3.textContent = sortedTypes[ti2];
            if (sortedTypes[ti2] === this.heatmapFilterType) opt3.selected = true;
            typeSelect.appendChild(opt3);
        }

        typeSelect.addEventListener('change', function() {
            self.heatmapFilterType = typeSelect.value;
            self.heatmapPage = 1;
            self.renderHeatmap(container);
        });
    }

    // 搜索框（集中模式）
    if (this.heatmapMode === '集中') {
        toolbar.createEl('span', { text: '🔍', cls: 'my-char-filter-label' }); toolbar.lastChild.style.marginLeft = '8px';
        var searchInput = toolbar.createEl('input', { type: 'text', placeholder: '搜索人物...' });
        searchInput.className = 'my-char-input-inline'; searchInput.style.flex = '1';
        searchInput.value = this.heatmapSearchText || '';
        searchInput.addEventListener('input', debounce(function() {
            self.heatmapSearchText = searchInput.value;
            self.heatmapPage = 1;
            self.renderHeatmap(container);
        }, 300));
    }

    // ===== 年份滑块 =====
    var sliderRow = container.createEl('div');
    sliderRow.className = 'my-char-heatmap-slider';

    sliderRow.createEl('span', { text: '📅 年份范围:', cls: 'my-char-filter-label' });

    var startYearDisplay = sliderRow.createEl('span');
    startYearDisplay.className = 'my-char-heatmap-year';

    var sliderWrapper = sliderRow.createEl('div');
    sliderWrapper.style.cssText = 'flex:1;min-width:150px;display:flex;align-items:center;gap:8px;';

    var startSlider = sliderWrapper.createEl('input', { type: 'range' });
    startSlider.style.cssText = 'flex:1;';
    startSlider.min = 0;
    startSlider.max = allYears.length - 1;
    startSlider.value = this.heatmapYearRange.start;
    startSlider.step = 1;

    var endSlider = sliderWrapper.createEl('input', { type: 'range' });
    endSlider.style.cssText = 'flex:1;';
    endSlider.min = 0;
    endSlider.max = allYears.length - 1;
    endSlider.value = this.heatmapYearRange.end;
    endSlider.step = 1;

    var endYearDisplay = sliderRow.createEl('span');
    endYearDisplay.className = 'my-char-heatmap-year';

    function updateSliderDisplay() {
        var s = parseInt(startSlider.value);
        var e = parseInt(endSlider.value);
        if (s > e) {
            if (document.activeElement === startSlider) {
                endSlider.value = s;
            } else {
                startSlider.value = e;
            }
            s = parseInt(startSlider.value);
            e = parseInt(endSlider.value);
        }
        startYearDisplay.textContent = allYears[s] || '';
        endYearDisplay.textContent = allYears[e] || '';
        self.heatmapYearRange = { start: s, end: e };
    }

    startSlider.addEventListener('input', function() {
        updateSliderDisplay();
        self.heatmapPage = 1;
        self.renderHeatmap(container);
    });

    endSlider.addEventListener('input', function() {
        updateSliderDisplay();
        self.heatmapPage = 1;
        self.renderHeatmap(container);
    });
    updateSliderDisplay();

    // ===== 单人模式：人物选择器 =====
    if (this.heatmapMode === '单人') {
        var personRow = container.createEl('div');
        personRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:8px 14px;background:#f0f7ff;border-radius:6px;flex-wrap:wrap;border-left:3px solid #4a90e2;';

        personRow.createEl('span', { text: '👤 选择人物:' }).style.cssText = 'font-size:13px;font-weight:bold;color:#4a90e2;';

        var personSelect = personRow.createEl('select');
        personSelect.style.cssText = 'flex:1;min-width:120px;padding:6px 12px;border:1px solid #4a90e2;border-radius:4px;font-size:13px;background:white;';

        for (var ci = 0; ci < this.chars.length; ci++) {
            var opt = document.createElement('option');
            opt.value = this.chars[ci].name;
            opt.textContent = this.chars[ci].name;
            if (this.chars[ci].name === this.heatmapSelectedPerson) {
                opt.selected = true;
            }
            personSelect.appendChild(opt);
        }

        personSelect.addEventListener('change', function() {
            self.heatmapSelectedPerson = personSelect.value;
            self.renderHeatmap(container);
        });

        if (this.heatmapSelectedPerson) {
            var charData = this.findChar(this.heatmapSelectedPerson);
            if (charData) {
                var infoSpan = personRow.createEl('span');
                infoSpan.style.cssText = 'font-size:12px;color:#666;';
                var type = this.getCharField(charData, '类型');
                var faction = this.getCharField(charData, this.plugin.settings.factionFieldName || '阵营');
                var info = [];
                if (type) info.push('📌 ' + type);
                if (faction) info.push('🏰 ' + faction);
                infoSpan.textContent = info.join(' · ');
            }
        }
    }

// ===== 多人模式：人物选择器（搜索下拉） =====
if (this.heatmapMode === '多人') {
    if (!this.heatmapSelectedPeople || this.heatmapSelectedPeople.length === 0) {
        this.heatmapSelectedPeople = [];
        for (var ci = 0; ci < Math.min(3, this.chars.length); ci++) {
            this.heatmapSelectedPeople.push(this.chars[ci].name);
        }
    }

    var multiRow = container.createEl('div');
    multiRow.style.cssText = 'margin-bottom:12px;padding:10px 14px;background:#f5f0ff;border-radius:6px;border-left:3px solid #6c5ce7;';

    var multiHeader = multiRow.createEl('div');
    multiHeader.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;';
    multiHeader.createEl('span', { text: '👥 已选对比人物 (' + this.heatmapSelectedPeople.length + '人):' }).style.cssText = 'font-size:13px;font-weight:bold;color:#6c5ce7;';

    // 已选人物标签（可点击移除）
    var selectedContainer = multiRow.createEl('div');
    selectedContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;';

    function renderSelectedTags() {
        selectedContainer.empty();
        if (self.heatmapSelectedPeople.length === 0) {
            selectedContainer.createEl('span', { text: '（请从下方搜索添加人物）' }).style.cssText = 'font-size:12px;color:#999;';
            return;
        }
        for (var si2 = 0; si2 < self.heatmapSelectedPeople.length; si2++) {
            var tag = selectedContainer.createEl('span');
            tag.textContent = '✕ ' + self.heatmapSelectedPeople[si2];
            tag.style.cssText = 'padding:3px 12px;background:#6c5ce7;color:white;border-radius:14px;font-size:12px;cursor:pointer;';
            (function(idx) {
                tag.addEventListener('click', function() {
                    self.heatmapSelectedPeople.splice(idx, 1);
                    self.renderHeatmap(container);
                });
            })(si2);
        }
    }

    // 添加人物的搜索框
    var addRow = multiRow.createEl('div');
    addRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%;';

    addRow.createEl('span', { text: '➕ 搜索添加:' }).style.cssText = 'font-size:12px;color:#666;';

    var personSearchInput = addRow.createEl('input', { type: 'text', placeholder: '输入人物名搜索...' });
    personSearchInput.style.cssText = 'flex:1;min-width:150px;padding:4px 10px;border:1px solid #ddd;border-radius:4px;font-size:12px;';

    // 下拉列表容器
    var dropdownContainer = multiRow.createEl('div');
    dropdownContainer.style.cssText = 'position:relative;width:100%;';

    var dropdownList = dropdownContainer.createEl('div');
    dropdownList.style.cssText = 'display:none;position:absolute;top:0;left:0;right:0;max-height:200px;overflow-y:auto;background:white;border:1px solid #ddd;border-radius:4px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.15);';

    function updateDropdown(filter) {
        dropdownList.empty();
        var matched = [];
        var filterLower = (filter || '').toLowerCase();
        for (var ci2 = 0; ci2 < self.chars.length; ci2++) {
            var name = self.chars[ci2].name;
            var isSelected = self.heatmapSelectedPeople.indexOf(name) !== -1;
            if (isSelected) continue;
            if (filterLower && name.toLowerCase().indexOf(filterLower) === -1) continue;
            matched.push(name);
        }
        if (matched.length === 0) {
            var emptyItem = dropdownList.createEl('div');
            emptyItem.textContent = filterLower ? '没有匹配 "' + filter + '" 的人物' : '输入关键词搜索人物';
            emptyItem.style.cssText = 'padding:8px 12px;color:#999;font-size:12px;';
        } else {
            var showCount = Math.min(matched.length, 50);
            for (var mi = 0; mi < showCount; mi++) {
                (function(charName) {
                    var item = dropdownList.createEl('div');
                    item.textContent = charName;
                    item.style.cssText = 'padding:6px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f5f5f5;';
                    item.addEventListener('mouseenter', function() { item.style.background = '#f0f0ff'; });
                    item.addEventListener('mouseleave', function() { item.style.background = 'white'; });
                    item.addEventListener('click', function() {
                        if (self.heatmapSelectedPeople.length < 10) {
                            self.heatmapSelectedPeople.push(charName);
                            dropdownList.style.display = 'none';
                            personSearchInput.value = '';
                            self.renderHeatmap(container);
                        } else {
                            new obsidian.Notice('最多选择10人');
                        }
                    });
                })(matched[mi]);
            }
            if (matched.length > 50) {
                var moreItem = dropdownList.createEl('div');
                moreItem.textContent = '...还有 ' + (matched.length - 50) + ' 人，请输入更精确的关键词';
                moreItem.style.cssText = 'padding:8px 12px;color:#999;font-size:11px;font-style:italic;';
            }
        }
    }

    personSearchInput.addEventListener('input', function() {
        var val = personSearchInput.value;
        if (val.trim()) {
            updateDropdown(val);
            dropdownList.style.display = 'block';
        } else {
            dropdownList.style.display = 'none';
        }
    });

    personSearchInput.addEventListener('focus', function() {
        if (personSearchInput.value.trim()) {
            updateDropdown(personSearchInput.value);
            dropdownList.style.display = 'block';
        }
    });

    // 点击其他地方关闭下拉
    document.addEventListener('click', function(e) {
        if (!multiRow.contains(e.target)) {
            dropdownList.style.display = 'none';
        }
    });

    // 清空所有
    var clearAllBtn = addRow.createEl('button', { text: '清空所有' });
    clearAllBtn.style.cssText = 'padding:3px 12px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;';
    clearAllBtn.addEventListener('click', function() {
        self.heatmapSelectedPeople = [];
        self.renderHeatmap(container);
    });

    renderSelectedTags();
}

    // ===== 构建数据 =====
    var data = buildHeatmapData(this, {
        mode: this.heatmapMode,
        granularity: this.heatmapGranularity,
        page: this.heatmapPage,
        pageSize: this.heatmapPageSize,
        filterType: this.heatmapFilterType,
        searchText: this.heatmapSearchText,
        startYearIdx: this.heatmapYearRange.start,
        endYearIdx: this.heatmapYearRange.end,
        selectedPerson: this.heatmapSelectedPerson || '',
        selectedPeople: this.heatmapSelectedPeople || []
    });

    // ===== 渲染热力图 =====
    if (data.rows.length === 0) {
        var emptyMsg = container.createEl('div');
        emptyMsg.style.cssText = 'text-align:center;color:#888;padding:40px;border:1px dashed #ddd;border-radius:8px;';
        if (this.heatmapMode === '单人' && this.heatmapSelectedPerson) {
            emptyMsg.innerHTML = '👤 <strong>' + this.heatmapSelectedPerson + '</strong><br><span style="font-size:12px;">该角色在选中的时间范围内没有出场记录</span>';
        } else if (this.heatmapMode === '多人') {
            emptyMsg.innerHTML = '👥 选中的角色在选中的时间范围内没有出场记录<br><span style="font-size:12px;">请尝试扩大年份范围或选择其他角色</span>';
        } else {
            emptyMsg.innerHTML = '📭 没有匹配的人物<br><span style="font-size:12px;">请调整筛选条件</span>';
        }
        return;
    }

    // ===== 绘制表格 =====
    var tableWrapper = container.createEl('div');
    tableWrapper.style.cssText = 'overflow-x:auto;margin-bottom:10px;border:1px solid #e8e8e8;border-radius:8px;background:white;';

    var table = tableWrapper.createEl('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';

    // ===== 表头 =====
    var thead = table.createEl('thead');
    var headerRow = thead.createEl('tr');
    headerRow.style.cssText = 'background:linear-gradient(135deg,#f0f4ff,#e8edf5);';

    var thName = headerRow.createEl('th');
    thName.textContent = this.heatmapMode === '单人' ? '👤 角色' : (this.heatmapMode === '多人' ? '👥 角色' : '👤 人物');
    thName.style.cssText = 'padding:8px 12px;text-align:left;font-weight:bold;position:sticky;left:0;background:#f0f4ff;z-index:2;border-bottom:2px solid #d0d7e5;min-width:80px;';

    for (var si3 = 0; si3 < data.timeSlots.length; si3++) {
        var slot = data.timeSlots[si3];
        var th = headerRow.createEl('th');
        th.textContent = slot.label;
        th.style.cssText = 'padding:6px 8px;text-align:center;font-weight:bold;font-size:10px;border-bottom:2px solid #d0d7e5;cursor:pointer;min-width:32px;';
        (function(year) {
            th.addEventListener('click', function() {
                self.selectedTag = '';
                self.tab = 'timeline';
                self._yearSearchText = year;
                self.render();
            });
        })(slot.year);
        th.title = '点击查看 ' + slot.year + ' 年事件';
    }

    // ===== 计算每个角色的最大出场次数（用于热力颜色） =====
    var maxCount = data.maxCount || 1;

    // ===== 表体 =====
    var tbody = table.createEl('tbody');

    for (var ri = 0; ri < data.rows.length; ri++) {
        var rowData = data.rows[ri];
        var tr = tbody.createEl('tr');
        if (ri % 2 === 0) {
            tr.style.background = '#fafcff';
        }

        var tdName = tr.createEl('td');
        tdName.style.cssText = 'padding:4px 10px;font-weight:bold;white-space:nowrap;position:sticky;left:0;background:' + (ri % 2 === 0 ? '#fafcff' : 'white') + ';z-index:1;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:13px;';

        var nameSpan = tdName.createEl('span', { text: rowData.name });
        nameSpan.style.cssText = 'color:#2c3e50;';

        var totalCount = 0;
        for (var key in rowData.counts) {
            totalCount += rowData.counts[key] || 0;
        }
        var countBadge = tdName.createEl('span', { text: ' (' + totalCount + '次)' });
        countBadge.style.cssText = 'font-size:10px;color:#999;font-weight:normal;';

        (function(charName) {
            tdName.addEventListener('click', function() {
                var charData = self.findChar(charName);
                if (charData) self.showCharDetail(charData);
            });
        })(rowData.name);

        // 删除 maxRowCount 相关的计算，直接用 data.maxCount

for (var si5 = 0; si5 < data.timeSlots.length; si5++) {
    var slot3 = data.timeSlots[si5];
    var count2 = rowData.counts[slot3.label] || 0;

    var color = getHeatColor(count2, data.maxCount);
 

            var td = tr.createEl('td');
            td.textContent = count2 > 0 ? count2 : '';
            td.style.cssText = 'text-align:center;padding:6px 2px;background:' + color.bg + ';color:' + color.text + ';font-weight:bold;font-size:12px;border-bottom:1px solid #f0f0f0;cursor:pointer;min-width:28px;';

            if (count2 > 0) {
                td.style.borderRadius = '3px';
                (function(charName, year, cnt) {
                    td.addEventListener('mouseenter', function(e) {
                        var events = [];
                        for (var ti3 = 0; ti3 < self.timeline.length; ti3++) {
                            var evt = self.timeline[ti3];
                            if (evt.year === year) {
                                var appeared = findCharsInEvent(evt.event, [charName]);
                                if (appeared.length > 0) {
                                    events.push(evt.event);
                                }
                            }
                        }
                        var msg = '📅 ' + charName + ' 在 ' + year + ' 出场 ' + cnt + ' 次';
                        if (events.length > 0 && events.length <= 3) {
                            msg += '\n' + events.join('\n');
                        } else if (events.length > 3) {
                            msg += '\n' + events.slice(0, 3).join('\n') + '\n...还有 ' + (events.length - 3) + ' 件';
                        }
                        new obsidian.Notice(msg, 3000);
                    });
                })(rowData.name, slot3.year, count2);
            }
        }
    }

    // ===== 底部 =====
    var footer = container.createEl('div');
    footer.className = 'my-char-heatmap-footer';

    var statsLeft = footer.createEl('div');
    statsLeft.className = 'my-char-chip-list'; statsLeft.style.fontSize = '12px';
    statsLeft.createEl('span', { text: '👥 显示 ' + data.rows.length + ' 人' });
    statsLeft.createEl('span', { text: '📅 ' + data.timeSlots.length + ' 个时间段' });
    statsLeft.createEl('span', { text: '🔥 最大出场 ' + maxCount + ' 次' });

    // 分页（仅集中模式）
    if (this.heatmapMode === '集中') {
        var pagination = footer.createEl('div');
        pagination.className = 'my-char-pagination';

        var prevBtn = pagination.createEl('button', { text: '◀' });
        prevBtn.className = 'my-char-page-btn';
        prevBtn.addEventListener('click', function() {
            if (data.currentPage > 1) {
                self.heatmapPage = data.currentPage - 1;
                self.renderHeatmap(container);
            }
        });

        var maxPages = Math.min(data.totalPages, 10);
        var startPage = Math.max(1, data.currentPage - 4);
        var endPage = Math.min(data.totalPages, startPage + 9);
        if (endPage - startPage < 9) {
            startPage = Math.max(1, endPage - 9);
        }

        for (var pi2 = startPage; pi2 <= endPage; pi2++) {
            (function(pg) {
                var btn = pagination.createEl('button', { text: pg });
                var isActive = pg === data.currentPage;
                btn.className = 'my-char-page-btn' + (isActive ? ' is-active' : '');
                btn.addEventListener('click', function() {
                    self.heatmapPage = pg;
                    self.renderHeatmap(container);
                });
            })(pi2);
        }

        var nextBtn = pagination.createEl('button', { text: '▶' });
        nextBtn.className = 'my-char-page-btn';
        nextBtn.addEventListener('click', function() {
            if (data.currentPage < data.totalPages) {
                self.heatmapPage = data.currentPage + 1;
                self.renderHeatmap(container);
            }
        });

        pagination.createEl('span', {
            text: ' 共 ' + data.totalPages + ' 页'
        }).style.cssText = 'font-size:11px;color:#999;margin-left:4px;';
    }

    // ===== 图例 =====
    var legend = container.createEl('div');
    legend.className = 'my-char-heatmap-legend';
    legend.createEl('span', { text: '🎨 热度图例:', cls: 'my-char-filter-label' });

    var legendItems = [
        { label: '0次', color: '#f0f0f0', textColor: '#bbb' },
        { label: '低 (1-2次)', color: '#fff7e6', textColor: '#bf8f00' },
        { label: '中 (3-4次)', color: '#ffd591', textColor: '#d46b08' },
        { label: '高 (5-7次)', color: '#ffa940', textColor: '#d46b08' },
        { label: '极高 (8+次)', color: '#cf1322', textColor: '#fff' }
    ];
    for (var li = 0; li < legendItems.length; li++) {
        var item = legendItems[li];
        var dot = legend.createEl('span');
        dot.className = 'my-char-heatmap-legend-dot'; dot.style.background = item.color; dot.style.color = item.textColor;
        legend.createEl('span', { text: item.label, cls: 'my-char-muted' }); legend.lastChild.style.marginRight = '6px'; legend.lastChild.style.fontSize = '10px';
    }

    var hint = legend.createEl('span', { text: '💡 点击表头年份查看事件 · 点击人物名查看详情 · 悬停数字查看具体事件' });
    hint.className = 'my-char-muted'; hint.style.fontSize = '10px'; hint.style.marginLeft = 'auto';
};

// v3.2 enhance injected below
console.log('✅ 人物关系谱系插件主体加载完成');

// Obsidian 插件入口：导出主插件类
module.exports = RelationWeaverPlugin;
