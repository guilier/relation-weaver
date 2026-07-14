function __extends(d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}var obsidian = require('obsidian');
var debounce = obsidian.debounce;
var NOVEL_COMPACT_HIDDEN = ['graph', 'heatmap', 'statistics', 'lifecycle'];

var NOVEL_PRIMARY_TAB_IDS = ['chars', 'search', 'timeline', 'relations', 'dashboard', 'factions'];

var PLOT_STATUSES = ['埋设', '推进', '回收'];

var LIMITS = {
    TIMELINE_AUTO_EXPAND_YEAR_COUNT: 3,
    TIMELINE_AUTO_EXPAND_MONTH_EVENT_COUNT: 8,
    DETAIL_MODAL_EVENT_PREVIEW: 50,
    CHAR_LIST_VIRTUAL_THRESHOLD: 80,
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

function pushUndoSnapshot(view, label) {
    if (!view || !view.plugin) return;
    if (!view.plugin._undoStack) view.plugin._undoStack = [];
    view.plugin._undoStack.push({
        label: label || '操作',
        factions: deepCloneJson(view.factions || []),
        relations: deepCloneJson(view.relations || [])
    });
    if (view.plugin._undoStack.length > LIMITS.UNDO_HISTORY_MAX) {
        view.plugin._undoStack.shift();
    }
    view.plugin._redoStack = [];
}

function restoreRelationsSnapshot(view, snapshot) {
    view.factions = deepCloneJson(snapshot.factions);
    view.relations = deepCloneJson(snapshot.relations);
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

function parseEventMeta(eventText) {
    var text = eventText;
    var plotLine = '';
    var plotStatus = '';
    var chapterNote = '';
    var m1 = text.match(/\|\s*情节线\s*[:：]\s*([^|]+)/);
    if (m1) { plotLine = m1[1].trim(); text = text.replace(m1[0], ''); }
    var m2 = text.match(/\|\s*状态\s*[:：]\s*([^|]+)/);
    if (m2) { plotStatus = m2[1].trim(); text = text.replace(m2[0], ''); }
    var m3 = text.match(/\|\s*笔记\s*[:：]\s*(\[\[[^\]]+\]\]|[^\|]+)/);
    if (m3) { chapterNote = m3[1].trim(); text = text.replace(m3[0], ''); }
    text = text.replace(/\s+\|\s*$/g, '').trim();
    return { event: text.trim(), plotLine: plotLine, plotStatus: plotStatus, chapterNote: chapterNote };
}

function serializeEventMeta(rec) {
    var parts = [rec.event];
    if (rec.plotLine) parts.push('情节线:' + rec.plotLine);
    if (rec.plotStatus) parts.push('状态:' + rec.plotStatus);
    if (rec.chapterNote) parts.push('笔记:' + rec.chapterNote);
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
            currentMonth = trimmed.substring(4).replace(/[：:]/g, '').trim();
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
            records.push({
                volume: currentVolume,
                year: currentYear,
                month: currentMonth || '未标注',
                event: meta.event,
                tag: tag,
                plotLine: meta.plotLine,
                plotStatus: meta.plotStatus,
                chapterNote: meta.chapterNote,
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

function getTimelineTimePoints(timeline, settings) {
    var points = [];
    var seen = {};
    var mode = (settings && settings.timelineMode) || 'auto';
    for (var i = 0; i < timeline.length; i++) {
        var evt = timeline[i];
        var label = '';
        if (mode === 'chapter' && evt.volume) {
            label = evt.volume + ' / ' + evt.year;
        } else {
            label = evt.year;
        }
        if (label && !seen[label]) {
            seen[label] = true;
            points.push({ label: label, year: evt.year, volume: evt.volume || '' });
        }
    }
    return points;
}

function getSortedTimelineEvents(timeline) {
    return timeline.slice().sort(function(a, b) {
        var av = a.volume || '';
        var bv = b.volume || '';
        if (av !== bv) return av.localeCompare(bv);
        return (a.year || '').localeCompare(b.year || '');
    });
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
        return acc.concat(g.events.filter(function(e) { return e.plotStatus !== '回收'; }));
    }, []);
}

function getPlotLineGroups(timeline) {
    var groups = {};
    for (var i = 0; i < timeline.length; i++) {
        var e = timeline[i];
        if (!e.plotLine) continue;
        if (!groups[e.plotLine]) {
            groups[e.plotLine] = { plotLine: e.plotLine, events: [], latestStatus: '', isRedeemed: false };
        }
        groups[e.plotLine].events.push(e);
    }
    var result = [];
    for (var key in groups) {
        if (!groups.hasOwnProperty(key)) continue;
        var g = groups[key];
        var lastEvt = g.events[g.events.length - 1];
        g.latestStatus = lastEvt.plotStatus || '';
        g.isRedeemed = lastEvt.plotStatus === '回收';
        result.push(g);
    }
    result.sort(function(a, b) { return a.plotLine.localeCompare(b.plotLine, 'zh-CN'); });
    return result;
}

function getUnredeemedPlotLines(timeline) {
    return getPlotLineGroups(timeline).filter(function(g) { return !g.isRedeemed; });
}

function isSimilarPlotLineName(a, b) {
    if (a === b) return false;
    var na = a.replace(/[-_\s·]/g, '').toLowerCase();
    var nb = b.replace(/[-_\s·]/g, '').toLowerCase();
    if (na === nb) return true;
    if (na.length > 2 && nb.length > 2 && (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1)) return true;
    return false;
}

function validatePlotLines(timeline) {
    var warnings = [];
    var groups = getPlotLineGroups(timeline);
    var statusOrder = { '埋设': 1, '推进': 2, '回收': 3 };

    for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi];
        var events = g.events;
        var firstIdx = { '埋设': -1, '推进': -1, '回收': -1 };
        var recycleIdx = -1;

        for (var i = 0; i < events.length; i++) {
            var st = events[i].plotStatus;
            if (st && firstIdx[st] === -1) firstIdx[st] = i;
            if (st === '回收' && recycleIdx === -1) recycleIdx = i;
            if (recycleIdx !== -1 && i > recycleIdx && st && st !== '回收') {
                warnings.push({
                    type: 'after_recycle',
                    severity: 'high',
                    plotLine: g.plotLine,
                    message: '「' + g.plotLine + '」已在「' + events[recycleIdx].year + '」回收，但「' + events[i].year + '」仍有「' + st + '」',
                    event: events[i]
                });
            }
        }

        if (firstIdx['回收'] !== -1 && firstIdx['埋设'] !== -1 && firstIdx['回收'] < firstIdx['埋设']) {
            warnings.push({
                type: 'recycle_before_plant',
                severity: 'high',
                plotLine: g.plotLine,
                message: '「' + g.plotLine + '」的「回收」出现在「埋设」之前',
                event: events[firstIdx['回收']]
            });
        }
        if (firstIdx['推进'] !== -1 && firstIdx['埋设'] !== -1 && firstIdx['推进'] < firstIdx['埋设']) {
            warnings.push({
                type: 'advance_before_plant',
                severity: 'medium',
                plotLine: g.plotLine,
                message: '「' + g.plotLine + '」的「推进」出现在「埋设」之前',
                event: events[firstIdx['推进']]
            });
        }

        for (var j = 1; j < events.length; j++) {
            var prevSt = events[j - 1].plotStatus;
            var curSt = events[j].plotStatus;
            if (prevSt && curSt && statusOrder[prevSt] && statusOrder[curSt] && statusOrder[curSt] < statusOrder[prevSt]) {
                warnings.push({
                    type: 'status_regress',
                    severity: 'medium',
                    plotLine: g.plotLine,
                    message: '「' + g.plotLine + '」状态从「' + prevSt + '」回退到「' + curSt + '」（' + events[j].year + '）',
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
                    message: '情节线名称相似：「' + groups[a].plotLine + '」与「' + groups[b].plotLine + '」，是否要合并？'
                });
            }
        }
    }
    return warnings;
}

function buildEventMdLine(evt) {
    var tagPart = evt.tag ? '[' + evt.tag + '] ' : '';
    return '- ' + tagPart + serializeEventMeta({
        event: evt.event,
        plotLine: evt.plotLine || '',
        plotStatus: evt.plotStatus || '',
        chapterNote: evt.chapterNote || ''
    });
}

async function deleteEventFromMd(app, plugin, lineIndex) {
    var fullPath = getTimelineFullPathForExt(plugin);
    var file = app.vault.getAbstractFileByPath(fullPath);
    if (!file || lineIndex == null || lineIndex < 0) return false;
    var content = await app.vault.read(file);
    var lines = content.split('\n');
    if (lineIndex >= lines.length) return false;
    lines.splice(lineIndex, 1);
    await app.vault.modify(file, lines.join('\n'));
    return true;
}

async function updateEventInMd(app, plugin, originalEvt, newEvt) {
    var locChanged = (originalEvt.volume || '') !== (newEvt.volume || '') ||
        originalEvt.year !== newEvt.year ||
        (originalEvt.month || '未标注') !== (newEvt.month || '未标注');
    if (locChanged) {
        await deleteEventFromMd(app, plugin, originalEvt._lineIndex);
        await appendEventToMd(app, plugin, newEvt);
    } else {
        var fullPath = getTimelineFullPathForExt(plugin);
        var file = app.vault.getAbstractFileByPath(fullPath);
        if (!file || originalEvt._lineIndex == null) return false;
        var content = await app.vault.read(file);
        var lines = content.split('\n');
        if (originalEvt._lineIndex >= lines.length) return false;
        lines[originalEvt._lineIndex] = buildEventMdLine(newEvt);
        await app.vault.modify(file, lines.join('\n'));
    }
    return true;
}

function getPlotLineGroup(timeline, plotLineName) {
    var groups = getPlotLineGroups(timeline);
    for (var i = 0; i < groups.length; i++) {
        if (groups[i].plotLine === plotLineName) return groups[i];
    }
    return null;
}

function buildCharMdBlock(name, fields) {
    var lines = ['## ' + name];
    for (var k in fields) {
        if (fields.hasOwnProperty(k) && fields[k]) {
            lines.push('- ' + k + '：' + fields[k]);
        }
    }
    return lines.join('\n');
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
    var replaced = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.trim().startsWith('## ') && !line.trim().startsWith('### ')) {
            if (inTarget) {
                inTarget = false;
                if (!replaced) {
                    for (var k in fields) {
                        if (fields.hasOwnProperty(k) && fields[k]) out.push('- ' + k + '：' + fields[k]);
                    }
                    replaced = true;
                }
            }
            if (line.trim() === '## ' + name) {
                inTarget = true;
                out.push(line);
                for (var k2 in fields) {
                    if (fields.hasOwnProperty(k2) && fields[k2]) out.push('- ' + k2 + '：' + fields[k2]);
                }
                replaced = true;
                continue;
            }
        }
        if (inTarget && (line.trim().startsWith('- ') || line.trim().startsWith('* '))) {
            continue;
        }
        out.push(line);
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

    if (plugin.settings.timelineMode === 'chapter' && evt.volume) {
        section += '# ' + evt.volume + '\n\n';
    }
    section += '## ' + evt.year + '\n';
    if (evt.month && evt.month !== '未标注') section += '### ' + evt.month + '：\n';
    section += line + '\n';

    if (existing) {
        var content = await app.vault.read(existing);
        if (content.indexOf('## ' + evt.year) !== -1) {
            var idx = content.indexOf('## ' + evt.year);
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

function performGlobalSearch(view, query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) {
        return { chars: [], relations: [], timeline: [], plotLines: [], factions: [] };
    }
    var chars = view.chars.filter(function(c) {
        if (c.name.toLowerCase().indexOf(q) !== -1) return true;
        var fields = c.fields || {};
        for (var k in fields) {
            if (fields.hasOwnProperty(k) && String(fields[k] || '').toLowerCase().indexOf(q) !== -1) return true;
        }
        return false;
    });
    var relations = view.relations.filter(function(r) {
        return (r.charA || '').toLowerCase().indexOf(q) !== -1 ||
            (r.charB || '').toLowerCase().indexOf(q) !== -1 ||
            (r.type || '').toLowerCase().indexOf(q) !== -1 ||
            (r.desc || '').toLowerCase().indexOf(q) !== -1;
    });
    var timeline = view.timeline.filter(function(e) {
        return (e.event || '').toLowerCase().indexOf(q) !== -1 ||
            (e.year || '').toLowerCase().indexOf(q) !== -1 ||
            (e.month || '').toLowerCase().indexOf(q) !== -1 ||
            (e.plotLine || '').toLowerCase().indexOf(q) !== -1 ||
            (e.tag || '').toLowerCase().indexOf(q) !== -1 ||
            (e.volume || '').toLowerCase().indexOf(q) !== -1;
    });
    var plotLines = getPlotLineGroups(view.timeline).filter(function(g) {
        if (g.plotLine.toLowerCase().indexOf(q) !== -1) return true;
        for (var i = 0; i < g.events.length; i++) {
            if ((g.events[i].event || '').toLowerCase().indexOf(q) !== -1) return true;
        }
        return false;
    });
    var factions = view.factions.filter(function(f) {
        return (f.name || '').toLowerCase().indexOf(q) !== -1 ||
            (f.desc || '').toLowerCase().indexOf(q) !== -1;
    });
    return { chars: chars, relations: relations, timeline: timeline, plotLines: plotLines, factions: factions };
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
            if (inTarget) foundChar = true;
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
    openCharView(app);
    window.setTimeout(function() {
        var leaves = app.workspace.getLeavesOfType(VIEW_TYPE);
        if (leaves.length > 0 && leaves[0].view) fn(leaves[0].view);
    }, 80);
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
    getTimelineFullPathForExt: getTimelineFullPathForExt
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
    { id: 'chars', desc: '实体列表与详情', alwaysShow: true },
    { id: 'search', desc: '跨模块统一搜索', alwaysShow: true },
    { id: 'factions', desc: '分组/势力/分类' },
    { id: 'relations', desc: '实体之间的关联' },
    { id: 'graph', desc: '关系网络可视化' },
    { id: 'timeline', desc: '事件与日记按时间排列' },
    { id: 'lifecycle', desc: '出生/出场/死亡时间轴' },
    { id: 'statistics', desc: '数据汇总分析' },
    { id: 'dashboard', desc: '写作进度与待办' },
    { id: 'heatmap', desc: '出场频率热力图' },
    { id: 'importexport', desc: '备份与迁移数据', alwaysShow: true }
];

var USE_CASE_TERMS = {
    novel: { entity: '人物', faction: '阵营', relation: '关系', timeline: '时间线', event: '事件' },
    diary: { entity: '人物', faction: '分组', relation: '关系', timeline: '日记', event: '记录' },
    trpg: { entity: '角色', faction: '阵营', relation: '关系', timeline: '冒险日志', event: '事件' },
    knowledge: { entity: '概念', faction: '分类', relation: '关联', timeline: '脉络', event: '节点' }
};

var TAB_LABEL_TEMPLATES = {
    chars: '👥 ',
    search: '🔍 ',
    factions: '🏰 ',
    relations: '🔗 ',
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
        viewTitle: '人物关系谱系',
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
    if (plugin.settings.tabLabels && plugin.settings.tabLabels[tabId]) {
        return plugin.settings.tabLabels[tabId];
    }
    var terms = getTermSet(plugin);
    if (tabId === 'chars') return TAB_LABEL_TEMPLATES.chars + terms.entity;
    if (tabId === 'search') return TAB_LABEL_TEMPLATES.search + '全局搜索';
    if (tabId === 'factions') return TAB_LABEL_TEMPLATES.factions + terms.faction;
    if (tabId === 'relations') return TAB_LABEL_TEMPLATES.relations + terms.relation;
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
    return '人物关系谱系';
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
    if (ids.indexOf(view.tab) === -1) view.tab = 'chars';
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

// ========== 【修复】直接使用保存的标签，不再强制合并默认标签 ==========
function getEventTags(plugin) {
    var customTags = plugin.settings.customEventTags || [];
    var cacheKey = JSON.stringify(customTags);
    if (plugin._eventTagsCache && plugin._eventTagsCacheKey === cacheKey) {
        return plugin._eventTagsCache;
    }
    var result;
    if (customTags.length === 0) {
        result = deepCloneJson(DEFAULT_EVENT_TAGS);
    } else {
        result = deepCloneJson(customTags);
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
            map[tags[i].value] = tags[i];
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

function getDataPath(plugin) {
    return plugin.app.vault.configDir + '/plugins/' + plugin.manifest.id + '/data.json';
}

async function loadSavedData(plugin) {
    var path = getDataPath(plugin);
    try {
        if (await plugin.app.vault.adapter.exists(path)) {
            var content = await plugin.app.vault.adapter.read(path);
            return JSON.parse(content);
        }
    } catch (e) {
        console.log('读取数据文件失败:', e);
    }
    return { factions: [], relations: [] };
}

async function saveData(plugin, data) {
    var path = getDataPath(plugin);
    try {
        var dir = plugin.app.vault.configDir + '/plugins/' + plugin.manifest.id;
        if (!await plugin.app.vault.adapter.exists(dir)) {
            await plugin.app.vault.adapter.mkdir(dir);
        }
        await plugin.app.vault.adapter.write(path, JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('保存数据失败:', e);
    }
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

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('## ') && !line.startsWith('### ')) {
            if (current && current.name) chars.push(current);
            current = { name: line.substring(3).trim(), fields: {} };
            continue;
        }

        if (line.startsWith('# ')) continue;
        if (line.startsWith('---')) continue;

        if (current) {
            var text = line;
            var hasDash = line.startsWith('- ');
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
    var msg = '✅ 已同步 ' + res.count + ' 个节点到 ' + res.folder;
    if (res.skipped > 0) msg += '（跳过 ' + res.skipped + ' 个）';
    if (res.removed > 0) msg += '（移除 ' + res.removed + ' 个旧节点）';
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
    var charsToSync = getCharsForGraphSync(plugin, view);
    var syncedNames = {};
    for (var sn = 0; sn < charsToSync.length; sn++) {
        syncedNames[charsToSync[sn].name] = true;
    }
    var synced = 0;

    for (var ci = 0; ci < charsToSync.length; ci++) {
        var c = charsToSync[ci];
        var notePath = folder + '/' + sanitizeNoteName(c.name) + '.md';
        var lines = ['---', 'tags: [relation-weaver]', 'entity: ' + c.name];
        if (c.fields && c.fields[factionField]) {
            lines.push(factionField + ': ' + c.fields[factionField]);
        }
        var typeVal = getCharTypeForGraph(c);
        if (typeVal) lines.push('类型: ' + typeVal);
        lines.push('---', '', '# ' + c.name, '');
        if (c.fields) {
            var keys = Object.keys(c.fields);
            for (var ki = 0; ki < keys.length; ki++) {
                lines.push('- ' + keys[ki] + '：' + c.fields[keys[ki]]);
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
            await plugin.app.vault.modify(existing, content);
        } else {
            await plugin.app.vault.create(notePath, content);
        }
        synced++;
    }

    var removed = 0;
    for (var cj = 0; cj < view.chars.length; cj++) {
        var excluded = view.chars[cj];
        if (syncedNames[excluded.name]) continue;
        var stalePath = folder + '/' + sanitizeNoteName(excluded.name) + '.md';
        var staleFile = plugin.app.vault.getAbstractFileByPath(stalePath);
        if (staleFile) {
            await plugin.app.vault.delete(staleFile);
            removed++;
        }
    }

    return {
        folder: folder,
        count: synced,
        skipped: view.chars.length - synced,
        removed: removed
    };
}

async function openObsidianGlobalGraph(app, folderPath) {
    var leaf = app.workspace.getLeaf('tab', 'vertical');
    var state = {};
    if (folderPath) {
        state.search = 'path:"' + folderPath + '"';
    }
    await leaf.setViewState({ type: 'graph', state: state, active: true });
}

async function openObsidianLocalGraph(app, file) {
    if (!file) return false;
    var leaf = app.workspace.getLeaf('tab', 'vertical');
    await leaf.openFile(file);
    var graphLeaf = app.workspace.getLeaf('split', 'vertical');
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
        await syncGraphNotesToVault(plugin, view);
        file = app.vault.getAbstractFileByPath(path);
    }
    if (!file) {
        new obsidian.Notice('无法找到「' + charName + '」的图谱节点，请先同步');
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
        if (plugin.settings.syncGraphOnSave !== false) {
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
        return { sortValue: year, display: s, era: 'ad', year: year };
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
        return { sortValue: yearEn, display: s, era: 'ad', year: yearEn };
    }

    // ===== 原有格式 =====
    var bcMatch = s.match(/(?:公元前|前|BC|B\.C\.?)\s*(\d+(?:\.\d+)?)\s*(?:年)?/i);
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
        return { sortValue: y1, display: s, era: 'ad', year: y1 };
    }

    var numMatch = s.match(/^(\d+(?:\.\d+)?)$/);
    if (numMatch) {
        var y2 = parseFloat(numMatch[1]);
        return { sortValue: y2, display: s, era: 'ad', year: y2 };
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
        return { sortValue: adSuf, display: s, era: 'ad', year: adSuf };
    }

    return { sortValue: null, display: s, era: 'unknown', raw: s };
}

function formatSortValue(sortValue) {
    if (sortValue === null || sortValue === undefined || isNaN(sortValue)) return '?';
    if (sortValue < 0) return '前' + Math.abs(Math.round(sortValue)) + '年';
    if (sortValue === 0) return '公元元年';
    return Math.round(sortValue) + '年';
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
            if (!data.factions[i].name) return { ok: false, error: '阵营第 ' + (i + 1) + ' 项缺少 name' };
        }
    }
    if (data.relations !== undefined) {
        if (!Array.isArray(data.relations)) return { ok: false, error: 'relations 必须是数组' };
        for (var j = 0; j < data.relations.length; j++) {
            var rel = data.relations[j];
            if (!rel.charA || !rel.charB) return { ok: false, error: '关系第 ' + (j + 1) + ' 项缺少 charA 或 charB' };
        }
    }
    return { ok: true };
}

function openCharView(app) {
    var leaf = app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
        app.workspace.getRightLeaf(false).setViewState({ type: VIEW_TYPE, active: true });
    } else {
        app.workspace.revealLeaf(leaf);
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
        _this.tab = 'chars';
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
    MyView.prototype.getViewType = function () { return VIEW_TYPE; };
    MyView.prototype.getDisplayText = function () { return '人物关系谱系'; };
    MyView.prototype.getIcon = function () { return 'users'; };

    MyView.prototype.onOpen = function () {
        var self = this;
        this.contentEl.empty();
        this.contentEl.addClass('my-char-view-root');
        this.loadAllData().then(function() {
            self.render();
        });
    };

    MyView.prototype.getCharField = function (charData, fieldName) {
        return charData.fields ? charData.fields[fieldName] : '';
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
        var topCollapsed = !!this.plugin.settings.topChromeCollapsed;

        if (topCollapsed) {
            this.renderCompactTopBar(container);
        }

        var topChrome = container.createEl('div', { cls: 'my-char-top-chrome' + (topCollapsed ? ' is-collapsed' : '') });

        var headerRow = topChrome.createEl('div', { cls: 'my-char-view-header' });
        headerRow.createEl('h2', { text: getViewTitle(this.plugin) });

        var headerActions = headerRow.createEl('div', { cls: 'my-char-header-actions' });

        if (this.tab !== 'chars' && this.tab !== 'dashboard') {
            var backBtn = headerActions.createEl('button', { text: '🏠 返回主页', cls: 'my-char-view-btn my-char-view-btn-secondary my-char-btn-xs' });
            backBtn.addEventListener('click', function() {
                self.tab = 'chars';
                self.searchText = '';
                self.selectedTag = '';
                self.render();
            });
        }

        var collapseBtn = headerActions.createEl('button', {
            text: '▲ 收起顶栏',
            cls: 'my-char-view-btn my-char-view-btn-secondary my-char-btn-xs my-char-top-toggle-btn'
        });
        collapseBtn.title = '收起标题、工具栏与 Tab，腾出内容空间';
        collapseBtn.addEventListener('click', async function () {
            self.plugin.settings.topChromeCollapsed = true;
            await self.plugin.saveSettings();
            self.render();
        });

        var toolbar = topChrome.createEl('div', { cls: 'my-char-view-toolbar' });
        toolbar.createEl('button', { text: '🔄 刷新数据', cls: 'my-char-view-btn' })
            .addEventListener('click', function() { self.loadAllData().then(function() { self.render(); }); });
        toolbar.createEl('button', { text: '🔍 搜索', cls: 'my-char-view-btn my-char-view-btn-secondary' })
            .addEventListener('click', function() { self.tab = 'search'; self.render(); });
        toolbar.createEl('button', { text: '应用字段设置', cls: 'my-char-view-btn my-char-view-btn-success' })
            .addEventListener('click', function() {
                self.loadAllData().then(function() { self.render(); });
                new obsidian.Notice('已重新加载并应用字段设置');
            });
        toolbar.createEl('span', { text: getToolbarStatsText(this), cls: 'my-char-view-stats' });

        self.renderGlobalTimeBar(topChrome);

        var tabs = topChrome.createEl('div', { cls: 'my-char-view-tabs' });
        ensureValidTab(this);
        var tabNames = getVisibleTabs(this.plugin);
        var tabSplit = novelExt.splitTabsForNovelUI(this.plugin, tabNames, this._showMoreTabs);
        var tabsToRender = tabSplit.primary.slice();
        if (tabSplit.compact && tabSplit.showMore) {
            tabsToRender = tabsToRender.concat(tabSplit.secondary);
        }
        for (var i = 0; i < tabsToRender.length; i++) {
            (function(tab) {
                var btn = tabs.createEl('button', { text: tab.label });
                btn.className = 'my-char-view-tab-btn' + (self.tab === tab.id ? ' is-active' : '');
                btn.addEventListener('click', function() {
                    self.tab = tab.id;
                    self.searchText = '';
                    self.selectedTag = '';
                    self.render();
                });
            })(tabsToRender[i]);
        }
        if (tabSplit.compact && tabSplit.secondary.length > 0) {
            var moreBtn = tabs.createEl('button', { text: self._showMoreTabs ? '▲ 收起' : '▼ 更多功能' });
            moreBtn.className = 'my-char-view-tab-btn my-char-tab-more';
            moreBtn.addEventListener('click', function() {
                self._showMoreTabs = !self._showMoreTabs;
                self.render();
            });
        }

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
            text: '还没有检测到' + terms.entity + '或' + terms.timeline + '数据。跟着下面几步，几分钟就能用起来：',
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
        actionRow.createEl('button', { text: '📋 看仪表盘', cls: 'my-char-btn-ghost my-char-btn-sm' })
            .addEventListener('click', function() {
                self.tab = 'dashboard';
                self.render();
            });

        var tipBox = guide.createEl('div', { cls: 'my-char-empty-tip' });
        tipBox.createEl('strong', { text: '💡 小提示' });
        tipBox.createEl('p', {
            text: '顶栏可「收起顶栏」腾出空间；时间线支持情节线与伏笔追踪；「🔍 全局搜索」可跨模块查找；「设定集导出」可生成完整文档。',
            cls: 'my-char-muted'
        });
    };

    MyView.prototype.renderCurrentTab = function (container) {
        container.empty();
        var tabContent = container.createEl('div');
        tabContent.className = 'tab-content';
        /* tab-content styled in CSS */

        switch (this.tab) {
            case 'chars': this.renderChars(tabContent); break;
            case 'search': this.renderGlobalSearch(tabContent); break;
            case 'factions': this.renderFactions(tabContent); break;
            case 'relations': this.renderRelations(tabContent); break;
            case 'graph': this.renderGraph(tabContent); break;
            case 'timeline': this.renderTimeline(tabContent); break;
            case 'lifecycle': this.renderLifecycle(tabContent); break;
            case 'statistics': this.renderStatistics(tabContent); break;
            case 'dashboard': this.renderDashboard(tabContent); break;
            case 'heatmap': this.renderHeatmap(tabContent); break;
            case 'importexport': this.renderImportExport(tabContent); break;
            default: this.renderChars(tabContent);
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
                this.timeline = this.parseTimeline(timelineContent);
            } else if (!silent) {
                console.log('时间线文件未找到:', fullTimelinePath);
                new obsidian.Notice('未找到时间线文件: ' + fullTimelinePath);
            }
        }

        var savedData = await loadSavedData(this.plugin);
        // 🆕 加载亲密度变化历史
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
        var mdData = await novelExt.loadRelationsFromMd(this.plugin);
        if (mdData && (mdData.relations.length > 0 || mdData.factions.length > 0)) {
            this.factions = mdData.factions;
            this.relations = mdData.relations;
        }

        if (this.plugin.settings.customIntimacyLevels) {
            updateIntimacyLevels(this.plugin.settings.customIntimacyLevels);
        }

        invalidateTagCache(this.plugin);
        this.buildIndexes();

        if (!silent) {
            new obsidian.Notice('加载完成：' + this.chars.length + '人物，' + this.factions.length + '阵营，' + this.relations.length + '关系');
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
            relations: this.relations
        });
        await novelExt.saveRelationsToMd(this.plugin, this.factions, this.relations);
        if (this.plugin.saveIntimacyHistory) {
            await this.plugin.saveIntimacyHistory();
        }
        if (!options.skipGraphSync && this.plugin.settings.syncGraphOnSave !== false) {
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
        var dashBtn = bar.createEl('button', { text: '📋 仪表盘', cls: 'my-char-btn-ghost my-char-btn-xs' });
        dashBtn.addEventListener('click', function() {
            self.tab = 'dashboard';
            self.render();
        });
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
    searchInput.addEventListener('input', debounce(function() {
        self.searchText = searchInput.value;
        if (self._activeFilter && self.searchText) {
            self._activeFilter = null;
        }
        var parentContainer = container.parentElement;
        if (parentContainer) self.renderCurrentTab(parentContainer);
    }, 200));

    var quickRow = container.createEl('div', { cls: 'my-char-quick-actions' });
    quickRow.createEl('button', { text: '+ 快速添加人物', cls: 'my-char-view-btn my-char-btn-sm' })
        .addEventListener('click', function() { self.showQuickAddChar(); });

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
        listContainer.createEl('h3', { text: gname + ' (' + members.length + '人)', cls: 'my-char-view-group-title' });

        for (var j = 0; j < members.length; j++) {
            var c = members[j];
            var card = listContainer.createEl('div', { cls: 'my-char-view-card' });
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

        if (this.factions.length === 0) {
            container.createEl('p', { text: '暂无阵营，点击上方按钮添加', cls: 'my-char-view-empty' });
            return;
        }

        for (var i = 0; i < this.factions.length; i++) {
            (function (faction, index) {
                var isExpanded = self.expandedFactions[faction.name] || false;

                var members = [];
                for (var ci = 0; ci < self.chars.length; ci++) {
                    if (self.getCharField(self.chars[ci], factionField) === faction.name) {
                        members.push(self.chars[ci]);
                    }
                }

                var card = container.createEl('div', { cls: 'my-char-faction-card' });
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
                    if (confirm('确定删除阵营 "' + faction.name + '"？')) {
                        self.factions.splice(index, 1);
                        self.saveFactionsAndRelations();
                        self.renderCurrentTab(container.parentElement);
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
        
        var contentArea = container.createEl('div');
        contentArea.className = 'relations-content-area';
        /* relations-content-area in CSS */
        
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
        
        filteredRelations = this.sortRelations(filteredRelations, this.relationSortBy);
        
        if (filteredRelations.length === 0) {
            var emptyMsg = contentArea.createEl('div');
            emptyMsg.className = 'my-char-view-empty';
            emptyMsg.innerHTML = '📭 暂无关系数据<br><small>点击上方"添加关系"按钮添加</small>';
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
                    if (confirm('确定删除 ' + rel.charA + ' 与 ' + rel.charB + ' 的「' + rel.type + '」关系？')) {
                        var realIdx = self.relations.indexOf(rel);
                        if (realIdx !== -1) {
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

                    var delRelBtn = actRow.createEl('button', { text: '删除' });
                    delRelBtn.className = 'my-char-btn-danger my-char-btn-xs';
                    delRelBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (confirm('确定删除 ' + rel.charA + ' 与 ' + rel.charB + ' 的「' + rel.type + '」关系？')) {
                            var realIdx = self.relations.indexOf(rel);
                            if (realIdx !== -1) {
                                self.relations.splice(realIdx, 1);
                                self.saveFactionsAndRelations();
                                self.render();
                            }
                        }
                    });

                    if (rel.desc) {
                        subCard.createEl('div', { text: rel.desc, cls: 'my-char-rel-desc' });
                    }

                    var editIcon = subCard.createEl('span', { text: '✏️' });
                    editIcon.className = 'my-char-muted'; editIcon.style.float = 'right'; editIcon.style.cursor = 'pointer'; editIcon.style.opacity = '0.5'; editIcon.style.fontSize = '11px';
                    editIcon.addEventListener('click', function(e) {
                        e.stopPropagation();
                        self.showRelationDialog(rel);
                    });
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

        var hint = toolbar.createEl('span', { text: '推荐用原生图谱拖拽探索；下方为简易预览' });
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

        container.createEl('div', { cls: 'my-char-view-muted', text: '▼ 简易预览（环形布局，点击节点打开 Obsidian 本地图谱）' }).style.margin = '8px 0 4px';

        var wrap = container.createEl('div', { cls: 'my-char-graph-canvas-wrap' });
        var width = Math.max(480, wrap.clientWidth || 600);
        var height = Math.max(400, Math.min(600, width * 0.75));

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.classList.add('my-char-graph-svg');

        var n = graphChars.length;
        if (n === 0) {
            container.createEl('p', { text: '当前同步范围内没有' + terms.entity + '，请调整类型筛选后重试', cls: 'my-char-view-empty' });
            return;
        }
        var cx = width / 2, cy = height / 2;
        var radius = Math.min(width, height) * 0.36;
        var nodePositions = {};
        var graphCharNames = {};
        for (var gi = 0; gi < graphChars.length; gi++) {
            graphCharNames[graphChars[gi].name] = true;
        }
        for (var i = 0; i < n; i++) {
            var angle = (2 * Math.PI * i) / n - Math.PI / 2;
            nodePositions[graphChars[i].name] = {
                x: cx + radius * Math.cos(angle),
                y: cy + radius * Math.sin(angle),
                char: graphChars[i]
            };
        }

        var edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (var ri = 0; ri < this.relations.length; ri++) {
            var rel = this.relations[ri];
            if (!graphCharNames[rel.charA] || !graphCharNames[rel.charB]) continue;
            var pa = nodePositions[rel.charA], pb = nodePositions[rel.charB];
            if (!pa || !pb) continue;
            var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(pa.x));
            line.setAttribute('y1', String(pa.y));
            line.setAttribute('x2', String(pb.x));
            line.setAttribute('y2', String(pb.y));
            line.setAttribute('stroke', getIntimacyColor(rel.intimacy || 0));
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-opacity', '0.55');
            line.setAttribute('class', 'my-char-graph-edge');
            edgeGroup.appendChild(line);
        }
        svg.appendChild(edgeGroup);

        var nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        var names = Object.keys(nodePositions);
        for (var ni = 0; ni < names.length; ni++) {
            (function(name) {
                var pos = nodePositions[name];
                var faction = self.getCharField(pos.char, self.plugin.settings.factionFieldName || '阵营');
                var nodeColor = '#4a90e2';
                for (var fi = 0; fi < self.factions.length; fi++) {
                    if (self.factions[fi].name === faction) {
                        nodeColor = self.factions[fi].color || nodeColor;
                        break;
                    }
                }
                var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.setAttribute('class', 'my-char-graph-node');
                g.style.cursor = 'pointer';
                var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', String(pos.x));
                circle.setAttribute('cy', String(pos.y));
                circle.setAttribute('r', '18');
                circle.setAttribute('fill', nodeColor);
                circle.setAttribute('stroke', 'var(--background-primary, #fff)');
                circle.setAttribute('stroke-width', '2');
                g.appendChild(circle);
                var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', String(pos.x));
                label.setAttribute('y', String(pos.y + 32));
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('font-size', '11');
                label.setAttribute('fill', 'var(--text-normal, #333)');
                label.textContent = name.length > 6 ? name.substring(0, 5) + '…' : name;
                g.appendChild(label);
                g.addEventListener('click', function() {
                    openLocalGraphForEntity(self.app, self.plugin, self, name);
                });
                nodeGroup.appendChild(g);
            })(names[ni]);
        }
        svg.appendChild(nodeGroup);
        wrap.appendChild(svg);
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
        
        if (newAutoRels.length > 0) {
            var suggestDiv = container.createEl('div');
            suggestDiv.className = 'my-char-section'; suggestDiv.style.borderTop = '2px solid var(--char-border)'; suggestDiv.style.paddingTop = '12px';
            suggestDiv.createEl('div', { text: '💡 建议添加的关系（基于共同出场次数）', cls: 'my-char-muted' }); suggestDiv.lastChild.style.marginBottom = '8px';
            
            newAutoRels.sort(function(a, b) { return b.count - a.count; });
            var showCount = Math.min(10, newAutoRels.length);
            
            for (var i = 0; i < showCount; i++) {
                var rel = newAutoRels[i];
                var card = suggestDiv.createEl('div');
                card.className = 'my-char-rel-subcard'; card.style.borderStyle = 'dashed'; card.style.display = 'flex'; card.style.alignItems = 'center'; card.style.justifyContent = 'space-between';
                card.innerHTML = '<div><strong>' + rel.charA + '</strong> <span style="color:#888;">↔</span> <strong>' + rel.charB + '</strong><br><small style="color:#888;">共同出现 ' + rel.count + ' 次</small></div>';
                var addBtn = card.createEl('button', { text: '+ 添加关系' });
                addBtn.className = 'my-char-btn-ghost my-char-btn-xs'; addBtn.style.color = 'var(--char-accent)'; addBtn.style.borderColor = 'var(--char-accent)';
                addBtn.addEventListener('click', (function(rd) {
                    return function(e) {
                        e.stopPropagation();
                        self.showRelationDialog({
                            charA: rd.charA,
                            charB: rd.charB,
                            type: '同期出场',
                            desc: '自动检测：共同出现 ' + rd.count + ' 次',
                            intimacy: 1
                        });
                    };
                })(rel));
            }
            
            if (newAutoRels.length > 10) {
                suggestDiv.createEl('div', { text: '...还有 ' + (newAutoRels.length - 10) + ' 条建议', cls: 'my-char-muted' }); suggestDiv.lastChild.style.textAlign = 'center';
            }
            
            var addAllBtn = suggestDiv.createEl('button', { text: '📌 一键添加所有建议关系' });
            addAllBtn.className = 'my-char-btn-success my-char-btn-block'; addAllBtn.style.marginTop = '8px'; addAllBtn.style.fontSize = '11px';
            addAllBtn.addEventListener('click', function() {
                var addedCount = 0;
                for (var i = 0; i < newAutoRels.length; i++) {
                    var rel = newAutoRels[i];
                    var exists = false;
                    for (var j = 0; j < self.relations.length; j++) {
                        if ((self.relations[j].charA === rel.charA && self.relations[j].charB === rel.charB) ||
                            (self.relations[j].charA === rel.charB && self.relations[j].charB === rel.charA)) {
                            exists = true;
                            break;
                        }
                    }
                    if (!exists) {
                        self.relations.push({
                            charA: rel.charA,
                            charB: rel.charB,
                            type: '同期出场',
                            desc: '自动检测：共同出现 ' + rel.count + ' 次',
                            intimacy: 1
                        });
                        addedCount++;
                    }
                }
                self.saveFactionsAndRelations();
                self.render();
                new obsidian.Notice('已添加 ' + addedCount + ' 条关系');
            });
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
                if (confirm('⚠️ 确定删除所有关系吗？此操作不可撤销！')) {
                    self.relations = [];
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

    MyView.prototype.renderGlobalSearch = function (container) {
        var self = this;
        container.empty();
        container.classList.add('my-char-scroll-section');
        var terms = getTermSet(this.plugin);

        container.createEl('h3', { text: '🔍 全局搜索', cls: 'my-char-section-title' });
        container.createEl('p', {
            text: '同时搜索' + terms.entity + '、' + terms.relation + '、' + terms.timeline + '与情节线，点击结果可跳转。',
            cls: 'my-char-muted'
        }).style.margin = '0 0 12px';

        var searchBar = container.createEl('div', { cls: 'my-char-search-bar' });
        var input = searchBar.createEl('input', {
            type: 'text',
            placeholder: '输入姓名、事件、情节线、阵营…',
            cls: 'my-char-view-search'
        });
        input.value = this._globalSearchText || '';
        input.focus();

        var debouncedSearch = debounce(function() {
            self._globalSearchText = input.value;
            self.renderGlobalSearch(container);
        }, 250);
        input.addEventListener('input', debouncedSearch);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                self._globalSearchText = input.value;
                self.renderGlobalSearch(container);
            }
        });

        var q = (this._globalSearchText || '').trim();
        if (!q) {
            container.createEl('p', { text: '输入关键词开始搜索', cls: 'my-char-view-empty' });
            return;
        }

        var results = performGlobalSearch(this, q);
        var total = results.chars.length + results.relations.length + results.timeline.length + results.plotLines.length + results.factions.length;
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
                    row.addEventListener('click', function() {
                        self.tab = 'relations';
                        self.render();
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
                    row.addEventListener('click', function() {
                        self.tab = 'factions';
                        self.render();
                    });
                })(results.factions[i]);
            }
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
        var customTypes = this.plugin.settings.customRelationTypes || '';
        var relTypes = customTypes ? customTypes.split(',').map(function(s) { return s.trim(); }) : 
            ['父子', '母子', '父女', '母女', '兄弟', '姐妹', '兄妹', '姐弟', '夫妻', '恋人', '朋友', '挚友', '战友', '师生', '师徒', '君臣', '主仆', '敌人', '对手', '仇人', '同事', '同盟', '同期出场', '其他'];
        
        var modal = new RelationModal(this.app, this.chars, prefill, relTypes, function (result) {
            var oldIntimacy = (prefill && prefill.intimacy !== undefined) ? prefill.intimacy : null;
            var newIntimacy = result.intimacy !== undefined ? result.intimacy : 1;
            var timePoint = self.plugin.settings.currentTimePoint || result.startTime || '未标注时间';

            if (prefill && prefill.charA !== undefined) {
                var idx = self.relations.findIndex(function (r) {
                    return r.charA === prefill.charA && r.charB === prefill.charB && r.type === prefill.type;
                });
                if (idx !== -1) {
                    self.relations[idx] = result;
                } else {
                    self.relations.push(result);
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
            self.saveFactionsAndRelations();
            self.render();
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

    var currentTags = getEventTags(this.plugin);
    if (currentTags.length > 0) {
        var tagDisplay = tagToolbar.createEl('div');
        tagDisplay.className = 'my-char-chip-list'; tagDisplay.style.marginLeft = '8px';
        for (var i = 0; i < currentTags.length; i++) {
            var tag = currentTags[i];
            var chip = tagDisplay.createEl('span', { text: tag.label });
            chip.className = 'my-char-tag-chip'; chip.style.setProperty('--tag-bg', tag.color); chip.style.background = tag.color;
        }
    }

    var filterBar = container.createEl('div');
    filterBar.className = 'my-char-filter-bar';

    var allBtn = filterBar.createEl('button', { text: '全部' });
    setFilterChip(allBtn, this.selectedTag === '', '#4a90e2');
    allBtn.addEventListener('click', function() {
        self.selectedTag = '';
        self.renderTimeline(container);
    });

    for (var i = 0; i < currentTags.length; i++) {
        (function(tag) {
            var btn = filterBar.createEl('button', { text: tag.label });
            setFilterChip(btn, self.selectedTag === tag.value, tag.color);
            btn.addEventListener('click', function() {
                self.selectedTag = tag.value;
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

    // ===== 年份搜索筛选 =====
    if (this._yearSearchText) {
        var searchText = this._yearSearchText.trim().toLowerCase();
        filteredTimeline = filteredTimeline.filter(function(evt) {
            var yearLower = evt.year.toLowerCase();
            // 匹配年份字符串
            if (yearLower.indexOf(searchText) !== -1) {
                return true;
            }
            // 尝试解析年份进行数值匹配
            var parsed = parseHistoricalDate(evt.year);
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

    if (filteredTimeline.length === 0) {
        var emptyMsg = '暂无时间线事件';
        if (this.selectedTag) emptyMsg = '没有匹配标签的事件';
        if (this._yearSearchText) emptyMsg = '没有匹配 "' + this._yearSearchText + '" 的事件';
        container.createEl('p', { text: emptyMsg, cls: 'my-char-view-empty' });
        return;
    }

    var yearGroups = {};
    for (var i = 0; i < filteredTimeline.length; i++) {
        var y = filteredTimeline[i].year;
        if (!yearGroups[y]) yearGroups[y] = [];
        yearGroups[y].push(filteredTimeline[i]);
    }

    var years = Object.keys(yearGroups).sort().reverse();

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
                eventDiv.style.setProperty('--event-accent', tagColor);
                eventDiv.style.borderLeftColor = tagColor;

                if (eventData.tag) {
                    var tagSpan = eventDiv.createEl('span', { text: getTagLabel(self.plugin, eventData.tag), cls: 'my-char-tag-chip my-char-tag-chip-inline' });
                    tagSpan.style.background = tagColor;
                }

                var eventBody = eventDiv.createEl('span', { cls: 'my-char-timeline-event-text' });
                var eventText = eventData.event;
                for (var ci = 0; ci < self.chars.length; ci++) {
                    var cn = self.chars[ci].name;
                    if (eventText.indexOf(cn) !== -1) {
                        eventText = eventText.split(cn).join(
                            '<span class="clink my-char-link" data-name="' + cn + '">' + cn + '</span>'
                        );
                    }
                }
                eventBody.innerHTML = eventText;

                if (eventData.plotLine) {
                    var plotText = eventData.plotLine + (eventData.plotStatus ? '(' + eventData.plotStatus + ')' : '');
                    eventDiv.createEl('span', { text: plotText, cls: 'my-char-plot-chip my-char-plot-chip-inline' });
                }
                if (eventData.chapterNote) {
                    var noteSpan = eventDiv.createEl('span', { text: eventData.chapterNote, cls: 'my-char-link my-char-timeline-note-link' });
                    noteSpan.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var nm = eventData.chapterNote.match(/\[\[([^\]|]+)/);
                        if (nm) self.app.workspace.openLinkText(nm[1], '');
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
            timeline: this.timeline
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
        settingBtnRow.createEl('button', { text: '📄 下载设定集 Markdown', cls: 'my-char-view-btn' })
            .addEventListener('click', function() { self.exportSettingCollection(false); });
        settingBtnRow.createEl('button', { text: '💾 保存到 vault', cls: 'my-char-btn-success' })
            .addEventListener('click', function() { self.exportSettingCollection(true); });
        settingBtnRow.createEl('button', { text: '🖨️ 打印预览', cls: 'my-char-btn-purple' })
            .addEventListener('click', function() { self.showPrintPreview(); });

        var importDiv = container.createEl('div');
        importDiv.className = 'my-char-panel';

        importDiv.createEl('h4', { text: '导入数据', cls: 'my-char-subsection-title' }); importDiv.lastChild.style.margin = '0 0 10px';

        var fileInput = importDiv.createEl('input', { type: 'file', accept: '.json' });
        fileInput.style.marginBottom = '10px';

        var importBtn = importDiv.createEl('button', { text: '📂 导入 JSON 文件' });
        importBtn.className = 'my-char-btn-warning';
        importBtn.addEventListener('click', function() {
            if (!fileInput.files || fileInput.files.length === 0) {
                new obsidian.Notice('请选择文件');
                return;
            }
            importFromJSON(fileInput.files[0], function(data) {
                var validation = validateImportData(data);
                if (!validation.ok) {
                    new obsidian.Notice('导入失败：' + validation.error);
                    return;
                }
                if (data.factions) self.factions = data.factions;
                if (data.relations) self.relations = data.relations;
                self.saveFactionsAndRelations().then(function() {
                    return self.loadAllData();
                }).then(function() {
                    new obsidian.Notice('导入成功');
                    self.render();
                });
            });
        });

        var warning = importDiv.createEl('p', { text: '⚠️ 注意：导入会覆盖现有的阵营和关系数据（人物和时间线不会被覆盖）。关系/阵营也会同步到「关系与阵营.md」' });
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

    MyView.prototype.showQuickAddEvent = function () {
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
        });
        modal.open();
    };

    MyView.prototype.showEditEvent = function (existingEvent) {
        var self = this;
        if (existingEvent._lineIndex == null) {
            new obsidian.Notice('无法定位该事件，请刷新数据后重试');
            return;
        }
        var modal = new QuickAddEventModal(this.app, this.plugin, this, function(newEvt) {
            novelExt.updateEventInMd(self.app, self.plugin, existingEvent, newEvt).then(function() {
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
            });
        }, existingEvent, function(evt) {
            novelExt.deleteEventFromMd(self.app, self.plugin, evt._lineIndex).then(function() {
                return self.loadAllData({ silent: true });
            }).then(function() {
                self.render();
                new obsidian.Notice('已删除事件');
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

        var warnPanel = container.createEl('div', { cls: 'my-char-banner my-char-banner-warn my-char-plot-warn-panel' });
        warnPanel.createEl('span', { text: '⚠️', cls: 'my-char-banner-icon' });
        var warnTextWrap = warnPanel.createEl('div', { cls: 'my-char-plot-warn-body' });
        warnTextWrap.createEl('div', {
            text: '伏笔逻辑提醒（' + warnings.length + ' 条）',
            cls: 'my-char-banner-text'
        });
        var warnBody = warnTextWrap.createEl('div', { cls: 'my-char-plot-warn-list' });
        var showCount = Math.min(5, warnings.length);
        for (var wi = 0; wi < showCount; wi++) {
            (function(w) {
                var row = warnBody.createEl('div', { cls: 'my-char-plot-warn-item' + (w.severity === 'high' ? ' is-high' : '') });
                row.textContent = w.message;
                if (w.event) {
                    row.style.cursor = 'pointer';
                    row.title = '点击编辑相关事件';
                    row.addEventListener('click', function() { self.showEditEvent(w.event); });
                }
            })(warnings[wi]);
        }
        if (warnings.length > showCount) {
            warnBody.createEl('div', { text: '…还有 ' + (warnings.length - showCount) + ' 条', cls: 'my-char-muted' });
        }
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

// ========== 快速添加/编辑事件弹窗 ==========
var QuickAddEventModal = /** @class */ (function (_super) {
    __extends(QuickAddEventModal, _super);
    function QuickAddEventModal(app, plugin, view, onSubmit, existingEvent, onDelete) {
        var _this = _super.call(this, app) || this;
        _this.plugin = plugin;
        _this.view = view;
        _this.onSubmit = onSubmit;
        _this.existingEvent = existingEvent || null;
        _this.onDelete = onDelete || null;
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
        yearRow.createEl('label', { text: mode === 'chapter' ? '章节 *' : '年份/章节 *', cls: 'my-char-form-label' });
        yearInput = yearRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        yearInput.placeholder = mode === 'chapter' ? '第三章' : '公元前300年';
        if (isEdit) yearInput.value = evt.year || '';
        var monthRow = el.createEl('div', { cls: 'my-char-form-row' });
        monthRow.createEl('label', { text: '场景/月份（可选）', cls: 'my-char-form-label' });
        monthInput = monthRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        if (isEdit && evt.month && evt.month !== '未标注') monthInput.value = evt.month;
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
        noteRow.createEl('label', { text: '章节笔记链接', cls: 'my-char-form-label' });
        var noteInput = noteRow.createEl('input', { type: 'text', cls: 'my-char-form-input' });
        noteInput.placeholder = '[[第三章]]';
        if (isEdit && evt.chapterNote) noteInput.value = evt.chapterNote;

        var btnRow = el.createEl('div', { cls: 'my-char-form-actions' });
        var saveBtn = btnRow.createEl('button', { text: isEdit ? '💾 保存修改' : '添加到时间线', cls: 'my-char-view-btn' });
        saveBtn.style.flex = '1';
        saveBtn.addEventListener('click', function() {
            if (!yearInput.value.trim() || !eventInput.value.trim()) {
                new obsidian.Notice('请填写章节/年份和事件内容');
                return;
            }
            self.onSubmit({
                volume: volumeInput ? volumeInput.value.trim() : '',
                year: yearInput.value.trim(),
                month: monthInput.value.trim() || '未标注',
                tag: tagSelect.value,
                event: eventInput.value.trim(),
                plotLine: plotInput.value.trim(),
                plotStatus: statusSelect.value,
                chapterNote: noteInput.value.trim()
            });
            self.close();
        });
        if (isEdit && this.onDelete) {
            var deleteBtn = btnRow.createEl('button', { text: '🗑 删除', cls: 'my-char-btn-danger my-char-btn-sm' });
            deleteBtn.addEventListener('click', function() {
                if (confirm('确定删除这条时间线事件？此操作不可撤销。')) {
                    self.onDelete(self.existingEvent);
                    self.close();
                }
            });
        }
    };
    QuickAddEventModal.prototype.onClose = function () { this.contentEl.empty(); };
    return QuickAddEventModal;
}(obsidian.Modal));

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

        el.createEl('h3', { text: this.prefill ? '编辑人物关系' : '添加人物关系' });

        var charA = this.prefill ? this.prefill.charA : (this.chars[0] ? this.chars[0].name : '');
        var charB = this.prefill ? this.prefill.charB : (this.chars[1] ? this.chars[1].name : '');
        var type = this.prefill ? (this.prefill.type || '') : '';
        var desc = this.prefill ? (this.prefill.desc || '') : '';
        var intimacy = (this.prefill && this.prefill.intimacy !== undefined) ? this.prefill.intimacy : 1;
        var startTime = this.prefill ? (this.prefill.startTime || '') : '';
        var endTime = this.prefill ? (this.prefill.endTime || '') : '';

        var rowA = el.createEl('div');
        rowA.style.cssText = 'margin:10px 0;';
        rowA.createEl('label', { text: '人物 A' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var selA = rowA.createEl('select');
        selA.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;';
        for (var i = 0; i < this.chars.length; i++) {
            var opt = selA.createEl('option', { text: this.chars[i].name, value: this.chars[i].name });
            if (this.chars[i].name === charA) opt.selected = true;
        }
        selA.addEventListener('change', function () { charA = selA.value; });

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
            selType.createEl('option', { text: type, value: type }).selected = true;
        }
        selType.addEventListener('change', function () { type = selType.value; });

        var rowIntimacy = el.createEl('div');
        rowIntimacy.style.cssText = 'margin:10px 0;';
        rowIntimacy.createEl('label', { text: '亲密度' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var selIntimacy = rowIntimacy.createEl('select');
        selIntimacy.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;';
        for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
            var lvl = INTIMACY_LEVELS[i];
            var opt = selIntimacy.createEl('option', { text: lvl.label + (lvl.value >= 0 ? ' (+' + lvl.value + ')' : ' (' + lvl.value + ')'), value: lvl.value });
            if (lvl.value === intimacy) opt.selected = true;
        }
        selIntimacy.addEventListener('change', function () { intimacy = parseInt(selIntimacy.value); });

        var rowB = el.createEl('div');
        rowB.style.cssText = 'margin:10px 0;';
        rowB.createEl('label', { text: '人物 B' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var selB = rowB.createEl('select');
        selB.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;';
        for (var i = 0; i < this.chars.length; i++) {
            var opt = selB.createEl('option', { text: this.chars[i].name, value: this.chars[i].name });
            if (this.chars[i].name === charB) opt.selected = true;
        }
        selB.addEventListener('change', function () { charB = selB.value; });

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
            if (!charA || !charB) { new obsidian.Notice('请选择人物'); return; }
            if (charA === charB) { new obsidian.Notice('不能选同一个人'); return; }
            if (!type) { new obsidian.Notice('请选择关系类型'); return; }
            self.onSubmit({
                charA: charA,
                charB: charB,
                type: type,
                desc: descInput.value.trim(),
                intimacy: intimacy,
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
                if (confirm('确定删除所有「' + selectedType + '」类型的关系吗？')) {
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
        return _this;
    }

    DetailModal.prototype.onOpen = function () {
        var self = this;
        var el = this.contentEl;
        el.empty();
        el.className = 'my-char-modal-body';
        if (this._editMode === undefined) this._editMode = false;
        this._fieldInputs = {};

        var headerRow = el.createEl('div', { cls: 'my-char-detail-header' });
        headerRow.createEl('h2', { text: this.charData.name, cls: 'my-char-section-title' });
        var editBtn = headerRow.createEl('button', { text: '✏️ 编辑', cls: 'my-char-btn-ghost my-char-btn-sm' });
        editBtn.addEventListener('click', function() {
            self._editMode = !self._editMode;
            editBtn.textContent = self._editMode ? '取消编辑' : '✏️ 编辑';
            self.onOpen();
        });
        if (this._editMode) {
            this.renderEditForm(el);
            return;
        }

        var infoDiv = el.createEl('div', { cls: 'my-char-detail-panel' });

        var fields = this.charData.fields;
        var customFields = this.view.plugin.settings.customFields || '';
        var fieldOrder = customFields ? customFields.split(',').map(function(s) { return s.trim(); }) : 
            ['身份', '阵营', '首次出场', '死亡', '死亡时间', '出生', '出生时间', '年龄', '性别', '种族', '职业', '居住地', '别名', '亲密人物'];
        
        var displayed = [];

        for (var i = 0; i < fieldOrder.length; i++) {
            var key = fieldOrder[i];
            if (fields[key]) {
                displayed.push(key);
                var row = infoDiv.createEl('div');
                row.style.cssText = 'margin-bottom:6px;font-size:13px;';
                row.createEl('strong', { text: key + '：' }).style.cssText = 'display:inline-block;width:70px;color:#555;';
                row.createEl('span', { text: fields[key] });
            }
        }
        for (var key in fields) {
            if (fields.hasOwnProperty(key) && displayed.indexOf(key) === -1) {
                var row = infoDiv.createEl('div');
                row.style.cssText = 'margin-bottom:6px;font-size:13px;';
                row.createEl('strong', { text: key + '：' }).style.cssText = 'display:inline-block;width:70px;color:#555;';
                row.createEl('span', { text: fields[key] });
            }
        }

        if (Object.keys(fields).length === 0) {
            infoDiv.createEl('p', { text: '暂无其他信息' }).style.cssText = 'color:var(--text-muted);font-size:12px;text-align:center;';
        }

        var lc = getCharLifecycle(this.view, this.charData);
        if (lc.birth || lc.firstAppear || lc.death) {
            el.createEl('h3', { text: '⏳ 生命周期' }).style.cssText = 'margin:12px 0 6px;font-size:15px;';
            var lcPanel = el.createEl('div', { cls: 'my-char-detail-panel' });
            if (lc.birth) {
                var birthRow = lcPanel.createEl('div');
                birthRow.createEl('strong', { text: '出生：' });
                birthRow.createEl('span', { text: lc.birth });
                if (lc.birthParsed && lc.birthParsed.sortValue !== null) {
                    birthRow.createEl('small', { text: ' (' + formatSortValue(lc.birthParsed.sortValue) + ')', cls: 'my-char-view-muted' });
                }
            }
            if (lc.firstAppear) {
                var appearRow = lcPanel.createEl('div');
                appearRow.createEl('strong', { text: '首次出场：' });
                appearRow.createEl('span', { text: lc.firstAppear });
                if (lc.firstAppearParsed && lc.firstAppearParsed.sortValue !== null) {
                    appearRow.createEl('small', { text: ' (' + formatSortValue(lc.firstAppearParsed.sortValue) + ')', cls: 'my-char-view-muted' });
                }
            }
            if (lc.death) {
                var deathRow = lcPanel.createEl('div');
                deathRow.createEl('strong', { text: '死亡：' });
                deathRow.createEl('span', { text: lc.death });
                if (lc.deathParsed && lc.deathParsed.sortValue !== null) {
                    deathRow.createEl('small', { text: ' (' + formatSortValue(lc.deathParsed.sortValue) + ')', cls: 'my-char-view-muted' });
                }
            }
        }

        if (this.manualRels.length > 0) {
            el.createEl('h3', { text: '人物关系 (' + this.manualRels.length + ')' }).style.cssText = 'margin:12px 0 6px;font-size:15px;';
            for (var i = 0; i < this.manualRels.length; i++) {
                var rel = this.manualRels[i];
                var other = rel.charA === this.charData.name ? rel.charB : rel.charA;
                var item = el.createEl('div');
                item.style.cssText = 'padding:8px 10px;margin:3px 0;border:1px solid #e0e0e0;border-radius:4px;';
                
                var intimacyVal = (rel.intimacy !== undefined) ? rel.intimacy : 0;
                var intimacyLabel = getIntimacyLabel(intimacyVal);
                var intimacyColor = getIntimacyColor(intimacyVal);

                var otherLink = item.createEl('strong', { text: other, cls: 'my-char-view-link' });
                var typeBadge = item.createEl('span', { text: rel.type });
                typeBadge.style.cssText = 'background:var(--interactive-accent);color:var(--text-on-accent);padding:2px 8px;border-radius:10px;font-size:11px;margin-left:6px;';
                var intimacyBadge = item.createEl('span', { text: '❤️ ' + intimacyLabel });
                intimacyBadge.style.cssText = 'padding:2px 6px;border-radius:8px;font-size:10px;color:white;background:' + intimacyColor + ';margin-left:4px;';
                if (rel.desc) {
                    item.createEl('div', { text: rel.desc }).style.cssText = 'font-size:12px;color:#666;margin-top:4px;';
                }
                if (rel.startTime || rel.endTime) {
                    var timeText = '';
                    if (rel.startTime) timeText += '📅 始于 ' + rel.startTime;
                    if (rel.endTime) timeText += (timeText ? ' · ' : '') + '⌛ 止于 ' + rel.endTime;
                    item.createEl('div', { text: timeText }).style.cssText = 'font-size:10px;color:#888;margin-top:2px;';
                }
                
                otherLink.addEventListener('click', (function(targetName) {
                    return function() {
                        var targetChar = self.view.findChar(targetName);
                        if (targetChar) {
                            self.close();
                            self.view.showCharDetail(targetChar);
                        }
                    };
                })(other));
                // 🆕 新增：变化摘要
                var historySummary = getChangeSummary(getRelationHistory(self.view.plugin, rel.charA, rel.charB));
                var histSummarySpan = item.createEl('div');
                histSummarySpan.style.cssText = 'font-size:10px;color:#888;margin-top:2px;';
                histSummarySpan.textContent = '📈 ' + historySummary;

                // 🆕 新增：查看历史按钮
                var histBtn = item.createEl('button', { text: '📊 查看变化历史' });
                histBtn.style.cssText = 'margin-top:4px;padding:2px 8px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:10px;background:white;color:#9b59b6;';
                histBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.view.showChangeHistory(rel);
                });
            }
        }

        var relNames = Object.keys(this.relations);
        if (relNames.length > 0) {
            el.createEl('h3', { text: '共同出场人物 (' + relNames.length + '人)' }).style.cssText = 'margin:12px 0 6px;font-size:15px;';
            for (var i = 0; i < relNames.length; i++) {
                var name = relNames[i];
                var evts = this.relations[name];
                var item = el.createEl('div');
                item.style.cssText = 'padding:6px 10px;margin:3px 0;background:#f9f9f9;border-radius:4px;';
                item.createEl('strong', { text: name }).style.cssText = 'cursor:pointer;color:#4a90e2;text-decoration:underline;';
                item.createEl('div', { text: '共同出场: ' + evts.length + '次' }).style.cssText = 'font-size:12px;color:#666;';
                
                item.querySelector('strong').addEventListener('click', (function(targetName) {
                    return function() {
                        var targetChar = self.view.findChar(targetName);
                        if (targetChar) {
                            self.close();
                            self.view.showCharDetail(targetChar);
                        }
                    };
                })(name));
            }
        }

        if (this.events.length > 0) {
            el.createEl('h3', { text: '时间线出场 (' + this.events.length + '次)' }).style.cssText = 'margin:12px 0 6px;font-size:15px;';
            var showCount = Math.min(50, this.events.length);
            for (var i = 0; i < showCount; i++) {
                var item = el.createEl('div', { cls: 'my-char-timeline-event' });
                var loc = this.events[i].volume ? this.events[i].volume + ' / ' : '';
                item.createEl('small', { text: '[' + loc + this.events[i].year + ' ' + this.events[i].month + '] ' }).style.color = '#999';
                var evtSpan = item.createEl('span');
                evtSpan.textContent = this.events[i].event;
                if (this.events[i].chapterNote) {
                    item.createEl('span', { text: ' → ' + this.events[i].chapterNote, cls: 'my-char-link' })
                        .addEventListener('click', (function(note) {
                            return function() {
                                var m = note.match(/\[\[([^\]|]+)/);
                                if (m) self.app.workspace.openLinkText(m[1], '');
                            };
                        })(this.events[i].chapterNote));
                }
            }
            if (this.events.length > 50) {
                el.createEl('p', { text: '...还有 ' + (this.events.length - 50) + ' 条' }).style.cssText = 'color:#888;font-size:12px;';
            }
        }
        
        var closeBtn = el.createEl('button', { text: '关闭', cls: 'my-char-view-btn' });
        closeBtn.style.cssText = 'margin-top:15px;width:100%;';
        closeBtn.addEventListener('click', function () { self.close(); });
    };

    DetailModal.prototype.renderEditForm = function(el) {
        var self = this;
        var form = el.createEl('div', { cls: 'my-char-detail-panel' });
        var fields = Object.assign({}, this.charData.fields);
        var defaultKeys = ['身份', '类型', '阵营', '首次出场', '出生', '亲密人物', '章节笔记'];
        for (var dk = 0; dk < defaultKeys.length; dk++) {
            if (!fields[defaultKeys[dk]]) fields[defaultKeys[dk]] = '';
        }
        this._fieldInputs = {};
        for (var key in fields) {
            if (!fields.hasOwnProperty(key)) continue;
            var row = form.createEl('div', { cls: 'my-char-form-row' });
            row.createEl('label', { text: key, cls: 'my-char-form-label' });
            var inp = row.createEl('input', { type: 'text', cls: 'my-char-form-input' });
            inp.value = fields[key] || '';
            this._fieldInputs[key] = inp;
        }
        var addRow = form.createEl('div', { cls: 'my-char-form-row' });
        addRow.createEl('label', { text: '新增字段名', cls: 'my-char-form-label' });
        var newKeyInput = addRow.createEl('input', { type: 'text', cls: 'my-char-form-input', placeholder: '如：外貌、性格' });
        var newValInput = addRow.createEl('input', { type: 'text', cls: 'my-char-form-input', placeholder: '字段值' });
        var saveBtn = el.createEl('button', { text: '💾 保存到人物索引', cls: 'my-char-view-btn my-char-btn-block' });
        saveBtn.addEventListener('click', async function() {
            var out = {};
            for (var k in self._fieldInputs) {
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
        
        // 直接从设置加载，没有默认限制
        var customTags = plugin.settings.customEventTags || [];
        if (customTags.length === 0) {
            // 首次使用，预置默认标签
            _this.tempTags = JSON.parse(JSON.stringify(DEFAULT_EVENT_TAGS));
        } else {
            _this.tempTags = JSON.parse(JSON.stringify(customTags));
        }
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
        saveBtn.addEventListener('click', function() {
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
            
            self.plugin.settings.customEventTags = validTags;
            self.plugin.saveSettings();
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
            .setDesc('编辑关系/阵营后，自动更新「关系图谱节点」中的笔记与双向链接')
            .addToggle(function(toggle) {
                toggle.setValue(self.plugin.settings.syncGraphOnSave !== false);
                toggle.onChange(async function(value) {
                    self.plugin.settings.syncGraphOnSave = value;
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
var MyPlugin = /** @class */ (function (_super) {
    __extends(MyPlugin, _super);
    function MyPlugin() {
        return _super !== null && _super.apply(this, arguments) || this;
    }

    MyPlugin.prototype.onload = async function () {
        await this.loadSettings();

        this.registerView(VIEW_TYPE, function (leaf) {
            return new MyView(leaf, this);
        }.bind(this));

        this.addRibbonIcon('users', '人物关系', function () {
            openCharView(this.app);
        }.bind(this));

        this.addCommand({
            id: 'open-char-view',
            name: '打开人物关系视图',
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

    MyPlugin.prototype.onunload = function () {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    };

    MyPlugin.prototype.loadSettings = async function () {
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
            syncGraphOnSave: true,
            graphSyncMode: 'all',
            graphSyncTypes: [],
            useCaseMode: 'novel',
            hiddenTabs: [],
            viewTitle: '',
            termLabels: {},
            tabLabels: {},
            currentTimePoint: '',
            novelCompactUI: true,
            topChromeCollapsed: false,
            timelineMode: 'auto',
            syncRelationsToMd: true,
            syncFirstAppearOnEvent: true,
            relationMetaFile: '关系与阵营.md',
            novelTagPreset: 'gudai'
        };
        this.settings = Object.assign({}, defaults, await this.loadData());
    };

    MyPlugin.prototype.saveSettings = async function () {
        await this.saveData(this.settings);
    };

    return MyPlugin;
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
    var latest = sorted[sorted.length - 1];
    var changes = getChangeRecordsOnly(history);
    var total = changes.length;
    var label = getIntimacyLabel(latest.newValue);
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
    return history.filter(function(h) { return !isBaselineRecord(h); });
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
        
        el.createEl('h3', { text: '📊 亲密度变化历史' }).style.cssText = 'margin:0 0 4px;';
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
        var changeRecords = getChangeRecordsOnly(sorted);
        
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

        renderIntimacyCurveChart(el, sorted, { width: 500, height: 170, compact: false });

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
                
                if (isBaseline) {
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
                    if (!confirm(confirmMsg)) return;
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
                    var yearParsed = parseHistoricalDate(this.timeline[j].year);
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
MyView.prototype.renderDashboard = function(container) {
    var self = this;
    container.empty();
    container.classList.add('my-char-scroll-section');

    var totalChars = this.chars.length;
    var totalEvents = this.timeline.length;
    var totalRels = this.relations.length;
    var totalFactions = this.factions.length;

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
        var appeared = findCharsInEvent(this.timeline[i].event, this.charNames);
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
                        var yearParsed = parseHistoricalDate(this.timeline[j].year);
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
    for (var i = 0; i < statCards.length; i++) {
        var card = statsGrid.createEl('div', { cls: 'my-char-stat-card' });
        card.innerHTML = '<div class="my-char-stat-icon">' + statCards[i].label.split(' ')[0] + '</div><div class="my-char-stat-value" style="color:' + statCards[i].color + ';">' + statCards[i].value + '</div><div class="my-char-stat-label">' + statCards[i].label.substring(2) + '</div>';
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

    // ===== 时间线进度 =====
    var progressSection = container.createEl('div');
    progressSection.className = 'my-char-panel-card';
    progressSection.createEl('div', { text: '⏳ 时间线进度' }).style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;';

    var allYears = [];
    for (var i = 0; i < this.timeline.length; i++) {
        var y = parseHistoricalDate(this.timeline[i].year);
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
            var evtParsed = parseHistoricalDate(evt.year);
            var evtSort = evtParsed && evtParsed.sortValue !== null ? evtParsed.sortValue : null;
            return evtSort !== null && evtSort <= currentSortRecent;
        });
    }

    // 按年份从晚到早排序
    recentEvents.sort(function(a, b) {
        var ay = parseHistoricalDate(a.year);
        var by = parseHistoricalDate(b.year);
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
            left.innerHTML = '<span style="color:#888;">[' + evt.year + ']</span> ' + tagLabel + ' ' + evt.event.substring(0, 40) + (evt.event.length > 40 ? '...' : '');
            row.createEl('span', { text: evt.month || '' }).style.cssText = 'color:#aaa;font-size:10px;';
        }
    } else {
        recentList.createEl('div', { text: '当前时间点之前暂无事件记录' }).style.cssText = 'font-size:12px;color:#999;padding:4px 0;';
    }

    var refreshBtn = container.createEl('button', { text: '🔄 刷新仪表盘' });
    refreshBtn.style.cssText = 'margin-top:15px;padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
    refreshBtn.addEventListener('click', function() { self.loadAllData().then(function() { self.renderDashboard(container); }); });

    var reportBtn = container.createEl('button', { text: '📄 导出仪表盘报告' });
    reportBtn.style.cssText = 'margin-top:8px;padding:8px 16px;background:#9b59b6;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
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
        var blob = new Blob([report], { type: 'text/markdown' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'dashboard-report.md';
        a.click();
        URL.revokeObjectURL(url);
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
    }
};

// ========== 扩展默认设置 ==========

var __origLoadSettingsFinal = MyPlugin.prototype.loadSettings;
MyPlugin.prototype.loadSettings = async function() {
    var defaults = {
        charFile: '人物索引.md', charFolder: '', timelineFile: '时间线.md', timelineFolder: '',
        customFields: '', customRelationTypes: '', factionFieldName: '阵营',
        deathFieldNames: '死亡,死亡时间', birthFieldNames: '出生,出生时间',
        firstAppearFieldName: '首次出场', intimateFieldName: '亲密人物',
        preset: 'default', customEventTags: [], customIntimacyLevels: '',
        currentTimePoint: '', useCaseMode: 'novel', hiddenTabs: [], viewTitle: '',
        termLabels: {}, tabLabels: {}, graphNotesFolder: '', syncGraphOnSave: true,
        graphSyncMode: 'all', graphSyncTypes: [],
        novelCompactUI: true, topChromeCollapsed: false, timelineMode: 'auto', syncRelationsToMd: true,
        syncFirstAppearOnEvent: true,
        relationMetaFile: '关系与阵营.md', novelTagPreset: 'gudai'
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

module.exports = MyPlugin;
console.log('✅ 人物关系谱系插件加载完成');
