function __extends(d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}var obsidian = require('obsidian');
var debounce = obsidian.debounce;

var VIEW_TYPE = 'my-char-view';

// ========== Tab 配置（支持按场景隐藏）==========
var ALL_VIEW_TABS = [
    { id: 'chars', label: '👥 人物', desc: '人物列表与详情', alwaysShow: true },
    { id: 'factions', label: '🏰 阵营', desc: '分组/势力/分类' },
    { id: 'relations', label: '🔗 关系', desc: '人物或概念之间的关联' },
    { id: 'timeline', label: '📅 时间线', desc: '事件与日记按时间排列' },
    { id: 'lifecycle', label: '⏳ 生命周期', desc: '出生/出场/死亡时间轴' },
    { id: 'statistics', label: '📊 统计', desc: '数据汇总分析' },
    { id: 'dashboard', label: '📋 仪表盘', desc: '写作进度与待办' },
    { id: 'heatmap', label: '🔥 热力图', desc: '人物出场频率' },
    { id: 'importexport', label: '💾 导入导出', desc: '备份与迁移数据', alwaysShow: true }
];

var USE_CASE_PRESETS = {
    novel: {
        label: '小说 / 历史创作',
        viewTitle: '人物关系谱系',
        hiddenTabs: [],
        preset: 'default'
    },
    diary: {
        label: '日常日记',
        viewTitle: '人物与事件',
        hiddenTabs: ['factions', 'lifecycle', 'heatmap', 'dashboard', 'statistics'],
        preset: 'modern'
    },
    trpg: {
        label: '跑团 / TRPG',
        viewTitle: '角色与冒险',
        hiddenTabs: ['heatmap'],
        preset: 'fantasy'
    },
    knowledge: {
        label: '知识 / 概念关系',
        viewTitle: '知识关系图谱',
        hiddenTabs: ['lifecycle', 'heatmap', 'dashboard'],
        preset: 'default'
    },
    custom: {
        label: '自定义',
        viewTitle: '',
        hiddenTabs: null,
        preset: null
    }
};

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
    } else if (presetKey === 'modern') {
        plugin.settings.factionFieldName = '所属组织';
        plugin.settings.customRelationTypes = '同事,上下级,朋友,恋人,家人,竞争对手';
        plugin.settings.deathFieldNames = '去世,死亡';
        plugin.settings.birthFieldNames = '出生';
        plugin.settings.firstAppearFieldName = '首次出现';
        plugin.settings.intimateFieldName = '亲密关系';
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
    
    // 如果没有任何标签，使用默认标签作为初始值
    if (customTags.length === 0) {
        return JSON.parse(JSON.stringify(DEFAULT_EVENT_TAGS));
    }
    
    // 直接返回保存的标签列表，不做任何合并
    return JSON.parse(JSON.stringify(customTags));
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

function getCharFullPath(plugin) {
    var folder = getCurrentFolder(plugin.app);
    var filename = '人物索引.md';
    if (folder) {
        return folder + '/' + filename;
    }
    return filename;
}

function getTimelineFullPath(plugin) {
    var folder = getCurrentFolder(plugin.app);
    var filename = '时间线.md';
    if (folder) {
        return folder + '/' + filename;
    }
    return filename;
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

    MyView.prototype.render = function () {
        if (this._rendering) {
            return;
        }
        this._rendering = true;
        
        var container = this.contentEl;
        container.empty();
        container.addClass('my-char-view-root');

        var self = this;

        var headerRow = container.createEl('div', { cls: 'my-char-view-header' });
        
        headerRow.createEl('h2', { text: getViewTitle(this.plugin) });
        
        if (this.tab !== 'chars') {
            var backBtn = headerRow.createEl('button', { text: '🏠 返回主页', cls: 'my-char-view-btn my-char-view-btn-secondary' });
            backBtn.addEventListener('click', function() {
                self.tab = 'chars';
                self.searchText = '';
                self.selectedTag = '';
                self.render();
            });
        }

        var toolbar = container.createEl('div', { cls: 'my-char-view-toolbar' });

        var refreshBtn = toolbar.createEl('button', { text: '🔄 刷新数据', cls: 'my-char-view-btn' });
        refreshBtn.addEventListener('click', function() {
            self.loadAllData().then(function() { self.render(); });
        });

        var applyConfigBtn = toolbar.createEl('button', { text: '应用字段设置', cls: 'my-char-view-btn my-char-view-btn-success' });
        applyConfigBtn.addEventListener('click', function() {
            self.loadAllData().then(function() { self.render(); });
            new obsidian.Notice('已重新加载并应用字段设置');
        });

        toolbar.createEl('span', {
            text: '人物:' + this.chars.length + ' | 阵营:' + this.factions.length + ' | 关系:' + this.relations.length,
            cls: 'my-char-view-stats'
        });

        var tabs = container.createEl('div', { cls: 'my-char-view-tabs' });
        ensureValidTab(this);

        var tabNames = getVisibleTabs(this.plugin);

        for (var i = 0; i < tabNames.length; i++) {
            (function (tab) {
                var btn = tabs.createEl('button', { text: tab.label });
                btn.className = 'my-char-view-tab-btn' + (self.tab === tab.id ? ' is-active' : '');
                btn.addEventListener('click', function() {
                    self.tab = tab.id;
                    self.searchText = '';
                    self.selectedTag = '';
                    self.render();
                });
            })(tabNames[i]);
        }

        var content = container.createEl('div', { cls: 'my-char-view-content' });

        if (this.chars.length === 0 && this.tab !== 'importexport') {
            content.createEl('p', { text: '点击"刷新数据"加载文件', cls: 'my-char-view-empty' });
        } else {
            try {
                this.renderCurrentTab(content);
            } catch (err) {
                throw err;
            }
        }
        
        this._rendering = false;
    };

    MyView.prototype.renderCurrentTab = function (container) {
        container.empty();
        var tabContent = container.createEl('div');
        tabContent.className = 'tab-content';
        tabContent.style.cssText = 'flex:1;overflow-y:auto;min-height:0;';
        
        switch (this.tab) {
            case 'chars': this.renderChars(tabContent); break;
            case 'factions': this.renderFactions(tabContent); break;
            case 'relations': this.renderRelations(tabContent); break;
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
        var chars = [];
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
                if (hasDash) {
                    text = line.substring(2);
                }
              
                var sep = text.indexOf('：');
                if (sep === -1) sep = text.indexOf(':');
              
                if (sep !== -1) {
                    var key = text.substring(0, sep).trim();
                    var value = text.substring(sep + 1).trim();
                    if (value !== undefined) {
                        current.fields[key] = value;
                    }
                }
            }
        }
        if (current && current.name) chars.push(current);
        return chars;
    };

    MyView.prototype.parseTimeline = function (content) {
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

    MyView.prototype.saveFactionsAndRelations = async function () {
    await saveData(this.plugin, {
        factions: this.factions,
        relations: this.relations
    });
    // 🆕 同时保存亲密度变化历史
    if (this.plugin.saveIntimacyHistory) {
        await this.plugin.saveIntimacyHistory();
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
        var banner = container.createEl('div');
        banner.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;margin-bottom:10px;background:#e8f4fd;border-radius:6px;border-left:4px solid #4a90e2;flex-wrap:wrap;';
        
        var iconSpan = banner.createEl('span', { text: this._activeFilter.label.split(' ')[0] });
        iconSpan.style.cssText = 'font-size:18px;';
        
        var textSpan = banner.createEl('span');
        textSpan.style.cssText = 'font-size:13px;font-weight:bold;color:#2c3e50;';
        textSpan.textContent = this._activeFilter.label;
        
        if (this._activeFilter.detail) {
            var detailSpan = banner.createEl('span');
            detailSpan.style.cssText = 'font-size:12px;color:#555;';
            detailSpan.textContent = this._activeFilter.detail;
        }
        
        var clearBtn = banner.createEl('button', { text: '✕ 清除筛选' });
        clearBtn.style.cssText = 'margin-left:auto;padding:4px 14px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
        clearBtn.addEventListener('click', function() {
            self.clearActiveFilter();
        });
        
        if (this._deadAfterAppearDetails && this._deadAfterAppearDetails.length > 0) {
            var detailBtn = banner.createEl('button', { text: '📋 查看详情' });
            detailBtn.style.cssText = 'padding:4px 14px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
            detailBtn.addEventListener('click', function() {
                var msg = '⚠️ 已故后仍出场的人物详情：\n\n' + self._deadAfterAppearDetails.join('\n');
                new obsidian.Notice(msg, 10000);
            });
        }
    }

    // ===== 搜索栏 =====
    var searchBar = container.createEl('div');
    searchBar.style.cssText = 'margin-bottom:10px;flex-shrink:0;';
    
    var timeDisplay = searchBar.createEl('div');
    timeDisplay.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;';
    timeDisplay.createEl('span', { text: '⏱️ 当前时间点：' }).style.cssText = 'font-size:12px;font-weight:bold;color:#555;';
    var timeValue = timeDisplay.createEl('span', { text: currentTimeStr || '（未设置）' });
    timeValue.style.cssText = 'font-size:12px;color:' + (currentTimeStr ? '#4a90e2' : '#999') + ';font-weight:bold;';
    var setTimeBtn = timeDisplay.createEl('button', { text: '⚙️ 设置' });
    setTimeBtn.style.cssText = 'padding:2px 10px;font-size:11px;border-radius:4px;border:1px solid #ddd;cursor:pointer;background:white;';
    setTimeBtn.addEventListener('click', function() { self.app.setting.open(); self.app.setting.openTabById(self.plugin.manifest.id); });

    var searchInput = searchBar.createEl('input', { type: 'text', placeholder: '搜索人物名、身份、阵营、死亡...' });
    searchInput.style.cssText = 'width:100%;padding:8px;border:1px solid var(--background-modifier-border);border-radius:4px;font-size:14px;box-sizing:border-box;';
    searchInput.value = this.searchText || '';
    searchInput.addEventListener('input', debounce(function() {
        self.searchText = searchInput.value;
        if (self._activeFilter && self.searchText) {
            self._activeFilter = null;
        }
        var parentContainer = container.parentElement;
        if (parentContainer) self.renderCurrentTab(parentContainer);
    }, 200));

    // ===== 状态筛选 =====
    var filterBar = container.createEl('div');
    filterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;padding:6px 10px;background:#f5f5f5;border-radius:6px;align-items:center;flex-shrink:0;';
    filterBar.createEl('span', { text: '状态筛选：' }).style.cssText = 'font-size:12px;color:#666;font-weight:bold;';

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
            btn.style.cssText = 'padding:3px 12px;border-radius:14px;border:1px solid #ddd;cursor:pointer;font-size:11px;background:' + (isActive ? activeColor : 'white') + ';color:' + (isActive ? 'white' : '#333') + ';';
            btn.addEventListener('click', function() {
                self._statusFilter = opt.id;
                if (self._activeFilter) {
                    self._activeFilter = null;
                }
                for (var j = 0; j < filterButtons.length; j++) {
                    var fb = filterButtons[j];
                    var fActive = fb.optId === self._statusFilter;
                    var fColor = fb.optId === 'all' ? '#4a90e2' : getStatusColor(fb.optId);
                    fb.btn.style.background = fActive ? fColor : 'white';
                    fb.btn.style.color = fActive ? 'white' : '#333';
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
    typeFilterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;padding:6px 10px;background:#f0f4ff;border-radius:6px;align-items:center;flex-shrink:0;';
    typeFilterBar.createEl('span', { text: '📌 类型筛选：' }).style.cssText = 'font-size:12px;color:#666;font-weight:bold;';

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
            var activeColor = opt.id === 'all' ? '#6c5ce7' : '#6c5ce7';
            btn.style.cssText = 'padding:3px 12px;border-radius:14px;border:1px solid #ddd;cursor:pointer;font-size:11px;background:' + (isActive ? activeColor : 'white') + ';color:' + (isActive ? 'white' : '#333') + ';';
            btn.addEventListener('click', function() {
                self._typeFilter = opt.id;
                if (self._activeFilter) {
                    self._activeFilter = null;
                }
                for (var j = 0; j < typeFilterButtons.length; j++) {
                    var fb = typeFilterButtons[j];
                    var fActive = fb.optId === self._typeFilter;
                    fb.btn.style.background = fActive ? '#6c5ce7' : 'white';
                    fb.btn.style.color = fActive ? 'white' : '#333';
                }
                var parentContainer = container.parentElement;
                if (parentContainer) self.renderCurrentTab(parentContainer);
            });
            typeFilterButtons.push({ btn: btn, optId: opt.id });
        })(typeOptions[i]);
    }

    if (typeKeys.length === 0) {
        var hint = typeFilterBar.createEl('span', { text: '（暂无类型数据，请在人物文件中添加「类型」字段）' });
        hint.style.cssText = 'font-size:11px;color:#999;margin-left:4px;';
    }

    // ===== 人物列表 =====
    var listContainer = container.createEl('div');
    listContainer.style.cssText = 'flex:1;overflow-y:auto;';

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
        listContainer.createEl('p', { text: '没有匹配的人物', cls: 'my-char-view-empty' }).style.cssText = 'text-align:center;color:#888;padding:30px;';
        return;
    }

    for (var gi = 0; gi < groupNames.length; gi++) {
        var gname = groupNames[gi];
        var members = groups[gname];
        listContainer.createEl('h3', { text: gname + ' (' + members.length + '人)' }).style.cssText = 'margin:10px 0 6px;padding:6px 10px;background:#f0f4ff;border-radius:4px;font-size:14px;';

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
            headerRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
            
            // 状态徽章
            var badge = headerRow.createEl('span', { text: getStatusLabel(status) });
            badge.style.cssText = 'display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:bold;color:white;background:' + getStatusColor(status) + ';';
            
            // 名字
            var titleEl = headerRow.createEl('strong');
            titleEl.style.fontSize = '15px';
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
                typeBadge.style.cssText = 'display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:bold;color:white;background:' + typeColor + ';';
            }
            
            if (identity) {
                var idEl = headerRow.createEl('small');
                idEl.className = 'my-char-view-muted';
                idEl.textContent = ' ' + identity;
            }
            if (death) {
                var deathEl = headerRow.createEl('span');
                deathEl.style.cssText = 'background:var(--background-modifier-border);padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px;';
                deathEl.textContent = '💀' + death;
            }

            card.createEl('br');
            var timeMeta = card.createEl('small');
            timeMeta.style.cssText = 'font-size:10px;color:#888;';
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
        headerBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;flex-shrink:0;';

        headerBar.createEl('h3', { text: '阵营管理' }).style.cssText = 'margin:0;';

        var btnGroup = headerBar.createEl('div');
        btnGroup.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';

        var expandAllBtn = btnGroup.createEl('button', { text: '全部展开' });
        expandAllBtn.style.cssText = 'padding:6px 10px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:12px;background:white;';
        expandAllBtn.addEventListener('click', function () {
            for (var i = 0; i < self.factions.length; i++) {
                self.expandedFactions[self.factions[i].name] = true;
            }
            self.renderCurrentTab(container.parentElement);
        });

        var collapseAllBtn = btnGroup.createEl('button', { text: '全部折叠' });
        collapseAllBtn.style.cssText = 'padding:6px 10px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:12px;background:white;';
        collapseAllBtn.addEventListener('click', function () {
            self.expandedFactions = {};
            self.renderCurrentTab(container.parentElement);
        });

        var addBtn = btnGroup.createEl('button', { text: '+ 添加阵营' });
        addBtn.style.cssText = 'padding:6px 12px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
        addBtn.addEventListener('click', function () {
            self.showFactionDialog(null);
        });

        if (this.factions.length === 0) {
            container.createEl('p', { text: '暂无阵营，点击上方按钮添加' }).style.cssText = 'text-align:center;color:#888;padding:20px;';
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

                var card = container.createEl('div');
                card.style.cssText = 'margin:6px 0;border:1px solid #e0e0e0;border-radius:6px;background:white;overflow:hidden;';
                if (faction.color) {
                    card.style.borderLeft = '4px solid ' + faction.color;
                }

                var header = card.createEl('div');
                header.style.cssText = 'padding:12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:' + (isExpanded ? '#fafafa' : 'white') + ';';
                if (isExpanded) {
                    header.style.borderBottom = '1px solid #eee';
                }

                var leftSide = header.createEl('div');
                leftSide.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

                var arrow = leftSide.createEl('span', { text: isExpanded ? '▼' : '▶' });
                arrow.style.cssText = 'font-size:10px;color:#888;width:12px;';

                leftSide.createEl('strong', { text: faction.name }).style.cssText = 'font-size:15px;';
                
                if (faction.color) {
                    var dot = leftSide.createEl('span');
                    dot.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' + faction.color + ';';
                }

                leftSide.createEl('span', { text: members.length + '人' }).style.cssText = 'font-size:12px;color:#888;';

                var rightSide = header.createEl('div');
                rightSide.style.cssText = 'display:flex;gap:4px;';

                var editBtn = rightSide.createEl('button', { text: '编辑' });
                editBtn.style.cssText = 'padding:3px 8px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:11px;background:white;';
                editBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self.showFactionDialog(faction);
                });

                var delBtn = rightSide.createEl('button', { text: '删除' });
                delBtn.style.cssText = 'padding:3px 8px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:11px;background:white;color:#e74c3c;';
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
                    var body = card.createEl('div');
                    body.style.cssText = 'padding:8px;';

                    if (faction.desc) {
                        body.createEl('div', { text: faction.desc }).style.cssText = 'font-size:12px;color:#666;margin-bottom:8px;font-style:italic;padding:6px;background:#f9f9f9;border-radius:3px;';
                    }

                    if (members.length === 0) {
                        body.createEl('p', { text: '暂无人物属于此阵营' }).style.cssText = 'color:#aaa;font-size:12px;text-align:center;padding:10px;';
                    } else {
                        for (var mi = 0; mi < members.length; mi++) {
                            var m = members[mi];
                            var mRow = body.createEl('div');
                            mRow.style.cssText = 'padding:6px 8px;margin:2px 0;border-bottom:1px solid #f5f5f5;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;';

                            var mLeft = mRow.createEl('div');
                            mLeft.createEl('strong', { text: m.name });
                            var mIdentity = self.getCharField(m, '身份');
                            if (mIdentity) {
                                mLeft.createEl('small', { text: ' - ' + mIdentity }).style.cssText = 'color:#888;';
                            }

                            var deathFieldNames = settings.deathFieldNames || '死亡,死亡时间';
                            var mDeath = self.getFieldValue(m, deathFieldNames);
                            if (mDeath) {
                                mRow.createEl('span', { text: '💀 ' + mDeath }).style.cssText = 'font-size:10px;color:#999;background:#f0f0f0;padding:1px 6px;border-radius:8px;';
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
        
        container.empty();
        container.style.cssText = 'display:flex;flex-direction:column;height:100%;';
        
        var toolbar = container.createEl('div');
        toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:15px;padding:10px;background:#f9f9f9;border-radius:8px;align-items:center;flex-shrink:0;';
        
        var titleArea = toolbar.createEl('div');
        titleArea.style.cssText = 'display:flex;align-items:center;gap:10px;';
        titleArea.createEl('strong', { text: '人物关系' }).style.cssText = 'font-size:16px;';
        
        var addBtn = titleArea.createEl('button', { text: '+ 添加关系' });
        addBtn.style.cssText = 'padding:4px 10px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
        addBtn.addEventListener('click', function () {
            if (self.chars.length < 2) {
                new obsidian.Notice('至少需要两个人物');
                return;
            }
            self.showRelationDialog(null);
        });

        var statsSpan = toolbar.createEl('span', { text: '共 ' + this.relations.length + ' 条关系' });
        statsSpan.style.cssText = 'margin-left:auto;color:#888;font-size:12px;';
        
        var filterBar = container.createEl('div');
        filterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:8px;background:#f5f5f5;border-radius:6px;align-items:center;flex-shrink:0;';
        
        filterBar.createEl('span', { text: '筛选：' }).style.cssText = 'font-size:12px;color:#666;';
        
        var typeSelect = filterBar.createEl('select');
        typeSelect.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid #ddd;font-size:12px;';
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
        intimacySelect.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid #ddd;font-size:12px;';
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
        
        filterBar.createEl('span', { text: '排序：' }).style.cssText = 'font-size:12px;color:#666;margin-left:8px;';
        
        var sortSelect = filterBar.createEl('select');
        sortSelect.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid #ddd;font-size:12px;';
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
        viewModeBtn.style.cssText = 'padding:4px 10px;border-radius:4px;border:1px solid #ddd;background:white;cursor:pointer;font-size:12px;margin-left:auto;';
        viewModeBtn.addEventListener('click', function() {
            self.relationViewMode = self.relationViewMode === 'list' ? 'group' : 'list';
            self.renderRelations(container);
        });
        
        var batchBtn = filterBar.createEl('button', { text: '⚡ 批量操作' });
        batchBtn.style.cssText = 'padding:4px 10px;border-radius:4px;border:1px solid #ddd;background:#e67e22;color:white;cursor:pointer;font-size:12px;';
        batchBtn.addEventListener('click', function() {
            self.showBatchRelationDialog();
        });
        
        var contentArea = container.createEl('div');
        contentArea.className = 'relations-content-area';
        contentArea.style.cssText = 'flex:1;overflow-y:auto;min-height:200px;padding-right:4px;';
        
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
            emptyMsg.style.cssText = 'text-align:center;color:#888;padding:40px;';
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
                card.style.cssText = 'padding:10px;margin:6px 0;border:1px solid #e0e0e0;border-radius:8px;background:white;';
                card.style.borderLeft = '4px solid ' + getIntimacyColor(rel.intimacy || 0);

                var mainLine = card.createEl('div');
                mainLine.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
                var nameA = mainLine.createEl('strong', { text: rel.charA });
                nameA.style.cssText = 'font-size:14px;cursor:pointer;color:#4a90e2;text-decoration:underline;';
                nameA.addEventListener('click', function() {
                    var cd = self.findChar(rel.charA);
                    if (cd) self.showCharDetail(cd);
                });

                var typeBadge = mainLine.createEl('span', { text: rel.type });
                typeBadge.style.cssText = 'background:#4a90e2;color:white;padding:2px 10px;border-radius:12px;font-size:11px;';

                var intimacyLabel = getIntimacyLabel(rel.intimacy || 0);
                var intimacyColor = getIntimacyColor(rel.intimacy || 0);
                var intimacyBadge = mainLine.createEl('span', { text: '❤️ ' + intimacyLabel });
                intimacyBadge.style.cssText = 'padding:2px 8px;border-radius:10px;font-size:10px;color:white;background:' + intimacyColor + ';';

                var nameB = mainLine.createEl('strong', { text: rel.charB });
                nameB.style.cssText = 'font-size:14px;cursor:pointer;color:#4a90e2;text-decoration:underline;';
                nameB.addEventListener('click', function() {
                    var cd = self.findChar(rel.charB);
                    if (cd) self.showCharDetail(cd);
                });

                if (rel.desc) {
                    card.createEl('div', { text: rel.desc }).style.cssText = 'font-size:12px;color:#666;margin-top:4px;margin-left:4px;';
                }

                if (rel.startTime || rel.endTime) {
                    var timeRange = card.createEl('div');
                    timeRange.style.cssText = 'font-size:10px;color:#888;margin-top:2px;margin-left:4px;';
                    var timeText = '';
                    if (rel.startTime) timeText += '📅 始于 ' + rel.startTime;
                    if (rel.endTime) timeText += (timeText ? ' · ' : '') + '⌛ 止于 ' + rel.endTime;
                    timeRange.textContent = timeText;
                }

                var relHistory = getRelationHistory(self.plugin, rel.charA, rel.charB);
                var historySummary = getChangeSummary(relHistory);
                var summaryRow = card.createEl('div');
                summaryRow.style.cssText = 'font-size:11px;color:#666;margin-top:6px;padding:4px 8px;background:#f8f9fa;border-radius:4px;';
                summaryRow.textContent = '📈 ' + historySummary;
                if (relHistory.length > 0) {
                    renderIntimacyCurveChart(card, relHistory, { width: 300, height: 56, compact: true });
                }

                var btnRow = card.createEl('div');
                btnRow.style.cssText = 'display:flex;gap:4px;margin-top:8px;';

                var editRelBtn = btnRow.createEl('button', { text: '编辑' });
                editRelBtn.style.cssText = 'padding:2px 8px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:11px;background:white;';
                editRelBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.showRelationDialog(rel);
                });

                // 🆕 新增：查看变化历史按钮
                var historyBtn = btnRow.createEl('button', { text: '📊 历史' });
                historyBtn.style.cssText = 'padding:2px 8px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:11px;background:white;color:#9b59b6;';
                historyBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.showChangeHistory(rel);
                });

                // 🆕 新增：记录变化按钮
                var recordBtn = btnRow.createEl('button', { text: '📝 记录变化' });
                recordBtn.style.cssText = 'padding:2px 8px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:11px;background:#4a90e2;color:white;';
                recordBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.showRecordChange(rel, function() {
                        self.renderRelations(container);
                    });
                });

                var delRelBtn = btnRow.createEl('button', { text: '删除' });
                delRelBtn.style.cssText = 'padding:2px 8px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:11px;background:white;color:#e74c3c;';
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
            groupHeader.style.cssText = 'margin-top:15px;margin-bottom:8px;padding:6px 12px;background:#e8f0fe;border-radius:6px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;';
            
            if (this.expandedRelationGroups[type] === undefined) this.expandedRelationGroups[type] = true;
            var arrow = groupHeader.createEl('span', { text: this.expandedRelationGroups[type] ? '▼' : '▶' });
            arrow.style.cssText = 'font-size:10px;color:#888;margin-right:6px;';
            
            groupHeader.createEl('strong', { text: type }).style.cssText = 'font-size:14px;';
            groupHeader.createEl('span', { text: typeRels.length + '条' }).style.cssText = 'font-size:12px;color:#888;';
            
            var sumIntimacy = 0;
            for (var i = 0; i < typeRels.length; i++) {
                sumIntimacy += (typeRels[i].intimacy || 0);
            }
            var avgIntimacy = typeRels.length > 0 ? (sumIntimacy / typeRels.length).toFixed(1) : 0;
            var avgLabel = getIntimacyLabel(Math.round(avgIntimacy));
            groupHeader.createEl('span', { text: '平均: ' + avgLabel }).style.cssText = 'font-size:10px;color:#666;margin-left:8px;';
            
            groupHeader.addEventListener('click', (function(t) {
                return function() {
                    self.expandedRelationGroups[t] = !self.expandedRelationGroups[t];
                    self.render();
                };
            })(type));
            
            if (this.expandedRelationGroups[type]) {
                var groupBody = container.createEl('div');
                groupBody.style.cssText = 'margin-left:16px;margin-bottom:10px;';
                
                var sortedRels = typeRels.slice().sort(function(a, b) {
                    return (b.intimacy || 0) - (a.intimacy || 0);
                });
                
                for (var i = 0; i < sortedRels.length; i++) {
                    (function(rel) {
                    var subCard = groupBody.createEl('div');
                    subCard.style.cssText = 'padding:6px 10px;margin:3px 0;border-left:3px solid ' + getIntimacyColor(rel.intimacy || 0) + ';background:#fafafa;border-radius:4px;';

                    var subLine = subCard.createEl('div');
                    subLine.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

                    var nameA = subLine.createEl('span', { text: rel.charA });
                    nameA.style.cssText = 'cursor:pointer;color:#4a90e2;text-decoration:underline;font-size:13px;';
                    nameA.addEventListener('click', function() {
                        var cd = self.findChar(rel.charA);
                        if (cd) self.showCharDetail(cd);
                    });

                    subLine.createEl('span', { text: '→' }).style.cssText = 'color:#999;font-size:11px;';

                    var nameB = subLine.createEl('span', { text: rel.charB });
                    nameB.style.cssText = 'cursor:pointer;color:#4a90e2;text-decoration:underline;font-size:13px;';
                    nameB.addEventListener('click', function() {
                        var cd = self.findChar(rel.charB);
                        if (cd) self.showCharDetail(cd);
                    });

                    var intimacyLabel = getIntimacyLabel(rel.intimacy || 0);
                    var intimacyColor = getIntimacyColor(rel.intimacy || 0);
                    subLine.createEl('span', { text: '❤️ ' + intimacyLabel }).style.cssText = 'font-size:9px;padding:1px 6px;border-radius:8px;color:white;background:' + intimacyColor + ';';

                    var relHistory = getRelationHistory(self.plugin, rel.charA, rel.charB);
                    var historySummary = getChangeSummary(relHistory);
                    var summarySpan = subCard.createEl('div');
                    summarySpan.style.cssText = 'font-size:10px;color:#888;margin-top:4px;';
                    summarySpan.textContent = '📈 ' + historySummary;
                    if (relHistory.length > 0) {
                        renderIntimacyCurveChart(subCard, relHistory, { width: 260, height: 48, compact: true });
                    }

                    var actRow = subCard.createEl('div');
                    actRow.style.cssText = 'display:flex;gap:4px;margin-top:4px;';
                    var histBtn = actRow.createEl('button', { text: '📊 历史' });
                    histBtn.style.cssText = 'padding:1px 6px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:9px;background:white;color:#9b59b6;';
                    histBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        self.showChangeHistory(rel);
                    });
                    var recBtn = actRow.createEl('button', { text: '📝 记录变化' });
                    recBtn.style.cssText = 'padding:1px 6px;border:1px solid #ddd;border-radius:3px;cursor:pointer;font-size:9px;background:#4a90e2;color:white;';
                    recBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        self.showRecordChange(rel, function() {
                            self.renderRelations(container);
                        });
                    });

                    if (rel.desc) {
                        subCard.createEl('div', { text: rel.desc }).style.cssText = 'font-size:11px;color:#888;margin-top:2px;margin-left:4px;';
                    }

                    var editIcon = subCard.createEl('span', { text: '✏️' });
                    editIcon.style.cssText = 'float:right;cursor:pointer;opacity:0.5;font-size:11px;';
                    editIcon.addEventListener('click', function(e) {
                        e.stopPropagation();
                        self.showRelationDialog(rel);
                    });
                    })(sortedRels[i]);
                }
            }
        }
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
            suggestDiv.style.cssText = 'margin-top:20px;border-top:2px solid #e0e0e0;padding-top:12px;';
            suggestDiv.createEl('div', { text: '💡 建议添加的关系（基于共同出场次数）' }).style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;';
            
            newAutoRels.sort(function(a, b) { return b.count - a.count; });
            var showCount = Math.min(10, newAutoRels.length);
            
            for (var i = 0; i < showCount; i++) {
                var rel = newAutoRels[i];
                var card = suggestDiv.createEl('div');
                card.style.cssText = 'padding:6px 10px;margin:4px 0;border:1px dashed #ddd;border-radius:6px;background:#fafafa;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;';
                card.innerHTML = '<div><strong>' + rel.charA + '</strong> <span style="color:#888;">↔</span> <strong>' + rel.charB + '</strong><br><small style="color:#888;">共同出现 ' + rel.count + ' 次</small></div>';
                var addBtn = card.createEl('button', { text: '+ 添加关系' });
                addBtn.style.cssText = 'padding:2px 10px;border:1px solid #4a90e2;border-radius:3px;cursor:pointer;font-size:11px;background:white;color:#4a90e2;';
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
                suggestDiv.createEl('div', { text: '...还有 ' + (newAutoRels.length - 10) + ' 条建议' }).style.cssText = 'font-size:11px;color:#aaa;text-align:center;padding:4px;';
            }
            
            var addAllBtn = suggestDiv.createEl('button', { text: '📌 一键添加所有建议关系' });
            addAllBtn.style.cssText = 'margin-top:8px;padding:4px 12px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;width:100%;';
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

    // ========== 时间线视图 ==========
MyView.prototype.renderTimeline = function (container) {
    var self = this;
    container.empty();
    container.style.cssText = 'padding:10px;overflow-y:auto;';

    // ===== 年份搜索框 =====
    var searchToolbar = container.createEl('div');
    searchToolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:8px 12px;background:#f5f5f5;border-radius:6px;align-items:center;flex-shrink:0;';
    searchToolbar.createEl('span', { text: '📅 年份搜索：' }).style.cssText = 'font-size:12px;color:#666;font-weight:bold;';

    var yearInput = searchToolbar.createEl('input', { type: 'text' });
    yearInput.style.cssText = 'flex:1;min-width:120px;padding:6px 10px;border:1px solid #ddd;border-radius:4px;font-size:13px;';
    yearInput.placeholder = '输入年份/年号/关键词搜索';
    yearInput.value = this._yearSearchText || '';

    var searchBtn = searchToolbar.createEl('button', { text: '🔍 搜索' });
    searchBtn.style.cssText = 'padding:6px 14px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
    searchBtn.addEventListener('click', function() {
        self._yearSearchText = yearInput.value.trim();
        self.renderTimeline(container);
    });

    var clearBtn = searchToolbar.createEl('button', { text: '✕ 清除' });
    clearBtn.style.cssText = 'padding:6px 14px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
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
    tagToolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:10px;background:#f5f5f5;border-radius:6px;align-items:center;flex-shrink:0;';

    tagToolbar.createEl('span', { text: '🏷️ 标签管理：' }).style.cssText = 'font-weight:bold;font-size:13px;color:#555;';

    var tagManageBtn = tagToolbar.createEl('button', { text: '✏️ 管理标签' });
    tagManageBtn.style.cssText = 'padding:4px 12px;background:#9b59b6;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
    tagManageBtn.addEventListener('click', function() {
        var modal = new EventTagModal(self.plugin.app, self.plugin, function() {
            self.loadAllData().then(function() {
                self.renderTimeline(container);
            });
        });
        modal.open();
    });

    var currentTags = getEventTags(this.plugin);
    if (currentTags.length > 0) {
        var tagDisplay = tagToolbar.createEl('div');
        tagDisplay.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-left:8px;';
        for (var i = 0; i < currentTags.length; i++) {
            var tag = currentTags[i];
            var chip = tagDisplay.createEl('span', { text: tag.label });
            chip.style.cssText = 'padding:2px 8px;border-radius:12px;font-size:11px;color:white;background:' + tag.color + ';';
        }
    }

    var filterBar = container.createEl('div');
    filterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:15px;padding:8px;background:#f9f9f9;border-radius:6px;flex-shrink:0;';

    var allBtn = filterBar.createEl('button', { text: '全部' });
    allBtn.style.cssText = 'padding:4px 12px;border-radius:16px;border:1px solid #ddd;cursor:pointer;background:' + (this.selectedTag === '' ? '#4a90e2' : 'white') + ';color:' + (this.selectedTag === '' ? 'white' : '#333') + ';';
    allBtn.addEventListener('click', function() {
        self.selectedTag = '';
        self.renderTimeline(container);
    });

    for (var i = 0; i < currentTags.length; i++) {
        (function(tag) {
            var btn = filterBar.createEl('button', { text: tag.label });
            btn.style.cssText = 'padding:4px 12px;border-radius:16px;border:1px solid #ddd;cursor:pointer;background:' + (self.selectedTag === tag.value ? tag.color : 'white') + ';color:' + (self.selectedTag === tag.value ? 'white' : '#333') + ';';
            btn.addEventListener('click', function() {
                self.selectedTag = tag.value;
                self.renderTimeline(container);
            });
        })(currentTags[i]);
    }

    // ===== 筛选数据 =====
    var filteredTimeline = this.timeline;

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
        container.createEl('p', { text: emptyMsg }).style.cssText = 'text-align:center;color:#888;padding:40px;';
        return;
    }

    var yearGroups = {};
    for (var i = 0; i < filteredTimeline.length; i++) {
        var y = filteredTimeline[i].year;
        if (!yearGroups[y]) yearGroups[y] = [];
        yearGroups[y].push(filteredTimeline[i]);
    }

    var years = Object.keys(yearGroups).sort().reverse();

    for (var yi = 0; yi < years.length; yi++) {
        var year = years[yi];
        var records = yearGroups[year];
        var yearNode = container.createEl('div');
        yearNode.style.cssText = 'margin-bottom:15px;';

        yearNode.createEl('h3', { text: year })
            .style.cssText = 'margin:0 0 8px;padding:4px 10px;background:#f0f4ff;border-radius:4px;display:inline-block;font-size:15px;';

        var monthGroups = {};
        for (var i = 0; i < records.length; i++) {
            var m = records[i].month || '未标注';
            if (!monthGroups[m]) monthGroups[m] = [];
            monthGroups[m].push(records[i]);
        }

        var months = Object.keys(monthGroups);
        for (var mi = 0; mi < months.length; mi++) {
            var month = months[mi];
            var events = monthGroups[month];
            var monthNode = yearNode.createEl('div');
            monthNode.style.cssText = 'margin-left:16px;margin-bottom:8px;';

            monthNode.createEl('div', { text: month })
                .style.cssText = 'font-size:13px;color:#666;margin-bottom:4px;font-weight:bold;';

            for (var ei = 0; ei < events.length; ei++) {
                var eventDiv = monthNode.createEl('div');
                var tagColor = events[ei].tag ? getTagColor(self.plugin, events[ei].tag) : '#4a90e2';
                eventDiv.style.cssText = 'padding:4px 8px;margin:2px 0;border-left:2px solid ' + tagColor + ';font-size:13px;line-height:1.6;';

                if (events[ei].tag) {
                    var tagSpan = eventDiv.createEl('span', { text: getTagLabel(self.plugin, events[ei].tag) });
                    tagSpan.style.cssText = 'background:' + tagColor + ';color:white;padding:0px 6px;border-radius:10px;font-size:10px;margin-right:6px;';
                }

                var eventText = events[ei].event;
                for (var ci = 0; ci < this.chars.length; ci++) {
                    var cn = this.chars[ci].name;
                    if (eventText.indexOf(cn) !== -1) {
                        eventText = eventText.split(cn).join(
                            '<span class="clink" data-name="' + cn + '" style="color:#4a90e2;cursor:pointer;font-weight:bold;text-decoration:underline;">' + cn + '</span>'
                        );
                    }
                }
                eventDiv.innerHTML += eventText;
            }
        }
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
        container.style.cssText = 'padding:10px;overflow-y:auto;';

        container.createEl('h3', { text: '⏳ 人物生命周期' }).style.cssText = 'margin:0 0 8px;';
        container.createEl('p', {
            text: '支持公元前/公元时间排序。出生、首次出场、死亡字段可在设置中配置。时间格式示例：公元前280年、前100年、280年、公元100年'
        }).style.cssText = 'font-size:11px;color:var(--text-muted);margin:0 0 12px;';

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
                    track.createEl('span', { text: '无时间数据' }).style.cssText = 'font-size:11px;color:var(--text-muted);padding:4px 8px;';
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
        container.empty();
        container.style.cssText = 'padding:10px;overflow-y:auto;';

        container.createEl('h3', { text: '📊 数据统计' }).style.cssText = 'margin:0 0 15px;';

        var statsGrid = container.createEl('div');
        statsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;';

        var totalChars = this.chars.length;
        var totalEvents = this.timeline.length;
        var totalRels = this.relations.length;
        var totalFactions = this.factions.length;

        var cards = [
            { label: '人物', value: totalChars, icon: '👥', color: '#4a90e2' },
            { label: '事件', value: totalEvents, icon: '📅', color: '#2ecc71' },
            { label: '关系', value: totalRels, icon: '🔗', color: '#e74c3c' },
            { label: '阵营', value: totalFactions, icon: '🏰', color: '#9b59b6' }
        ];

        for (var i = 0; i < cards.length; i++) {
            var card = statsGrid.createEl('div');
            card.style.cssText = 'background:white;border-radius:8px;padding:12px;text-align:center;border:1px solid #e0e0e0;';
            card.innerHTML = '<div style="font-size:24px;">' + cards[i].icon + '</div>' +
                '<div style="font-size:22px;font-weight:bold;color:' + cards[i].color + ';">' + cards[i].value + '</div>' +
                '<div style="font-size:11px;color:#888;">' + cards[i].label + '</div>';
        }

        if (this.relations.length > 0) {
            container.createEl('h4', { text: '❤️ 亲密度分布' }).style.cssText = 'margin:15px 0 8px;font-size:14px;';
            var intimacyCounts = {};
            for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
                intimacyCounts[INTIMACY_LEVELS[i].value] = 0;
            }
            for (var i = 0; i < this.relations.length; i++) {
                var val = this.relations[i].intimacy || 0;
                intimacyCounts[val] = (intimacyCounts[val] || 0) + 1;
            }
            
            var intimacyChart = container.createEl('div');
            intimacyChart.style.cssText = 'background:#f9f9f9;border-radius:6px;padding:12px;margin-bottom:15px;';
            
            for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
                var lvl = INTIMACY_LEVELS[i];
                var cnt = intimacyCounts[lvl.value] || 0;
                if (cnt === 0 && this.relations.length === 0) continue;
                var percent = (cnt / (this.relations.length || 1)) * 100;
                var row = intimacyChart.createEl('div');
                row.style.cssText = 'margin:5px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
                row.createEl('span', { text: lvl.label }).style.cssText = 'width:60px;font-size:11px;color:' + lvl.color + ';font-weight:bold;';
                var bar = row.createEl('div');
                bar.style.cssText = 'height:16px;background:' + lvl.color + ';border-radius:8px;width:' + percent + '%;max-width:150px;';
                row.createEl('span', { text: cnt + '个' }).style.cssText = 'font-size:11px;color:#666;';
            }
        }

        container.createEl('h4', { text: '🏷️ 事件标签分布' }).style.cssText = 'margin:15px 0 8px;font-size:14px;';
        var tagCounts = {};
        for (var i = 0; i < this.timeline.length; i++) {
            var tag = this.timeline[i].tag || '其他';
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
        
        var tagContainer = container.createEl('div');
        tagContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:15px;';
        
        var sortedTags = Object.keys(tagCounts).sort(function(a,b) {
            return tagCounts[b] - tagCounts[a];
        });
        
        for (var i = 0; i < sortedTags.length; i++) {
            var tag = sortedTags[i];
            var cnt = tagCounts[tag];
            var percent = totalEvents > 0 ? Math.round((cnt / totalEvents) * 100) : 0;
            var tagChip = tagContainer.createEl('div');
            var tagColor = getTagColor(this.plugin, tag);
            tagChip.style.cssText = 'padding:6px 12px;border-radius:20px;font-size:12px;color:white;background:' + tagColor + ';display:flex;align-items:center;gap:6px;';
            tagChip.innerHTML = getTagLabel(this.plugin, tag) + ' <strong style="font-size:14px;">' + cnt + '</strong> <span style="font-size:10px;opacity:0.8;">(' + percent + '%)</span>';
        }

        container.createEl('h4', { text: '🏆 出场排行榜' }).style.cssText = 'margin:15px 0 8px;font-size:14px;';
        var sortedAppear = Object.keys(this.appearCounts).map(function(k) {
            return { name: k, count: self.appearCounts[k] || 0 };
        }).filter(function(c) { return c.count > 0; }).sort(function(a, b) { return b.count - a.count; }).slice(0, 10);

        var rankList = container.createEl('div', { cls: 'my-char-view-panel' });
        
        var medals = ['🥇', '🥈', '🥉'];
        for (var i = 0; i < sortedAppear.length; i++) {
            var row = rankList.createEl('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #eee;';
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

        container.createEl('h4', { text: '📈 年份事件趋势' }).style.cssText = 'margin:15px 0 8px;font-size:14px;';
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
        chartDiv.style.cssText = 'background:#f9f9f9;border-radius:6px;padding:12px;overflow-x:auto;';
        var chartInner = chartDiv.createEl('div');
        chartInner.style.cssText = 'min-width:300px;';
        
        for (var i = 0; i < years.length; i++) {
            var y = years[i];
            var cnt = yearCounts[y];
            var barWidth = (cnt / maxCount) * 100;
            var row = chartInner.createEl('div');
            row.style.cssText = 'margin:6px 0;display:flex;align-items:center;gap:8px;';
            row.createEl('span', { text: y }).style.cssText = 'width:70px;font-size:12px;font-weight:bold;';
            var bar = row.createEl('div');
            bar.style.cssText = 'height:22px;background:linear-gradient(90deg,var(--interactive-accent),#6c5ce7);border-radius:4px;';
            bar.style.width = Math.max(barWidth, 4) + '%';
            row.createEl('span', { text: cnt + '件' }).style.cssText = 'font-size:11px;color:#666;min-width:40px;';
        }

        var reportBtn = container.createEl('button', { text: '📄 导出统计报告 (Markdown)' });
        reportBtn.style.cssText = 'margin-top:20px;padding:8px 16px;background:#9b59b6;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
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
        container.style.cssText = 'padding:10px;overflow-y:auto;';

        container.createEl('h3', { text: '💾 数据导入/导出' }).style.cssText = 'margin:0 0 15px;';

        var exportDiv = container.createEl('div');
        exportDiv.style.cssText = 'background:#f9f9f9;border-radius:8px;padding:15px;margin-bottom:20px;';

        exportDiv.createEl('h4', { text: '导出数据' }).style.cssText = 'margin:0 0 10px;font-size:14px;';

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
        exportJSONBtn.style.cssText = 'padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:10px;';
        exportJSONBtn.addEventListener('click', function() {
            exportToJSON(exportData, 'char-relation-data.json');
            new obsidian.Notice('导出成功');
        });

        var exportCSVBtn = exportDiv.createEl('button', { text: '📊 导出关系为 CSV' });
        exportCSVBtn.style.cssText = 'padding:8px 16px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;';
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

        var importDiv = container.createEl('div');
        importDiv.style.cssText = 'background:#f9f9f9;border-radius:8px;padding:15px;';

        importDiv.createEl('h4', { text: '导入数据' }).style.cssText = 'margin:0 0 10px;font-size:14px;';

        var fileInput = importDiv.createEl('input', { type: 'file', accept: '.json' });
        fileInput.style.cssText = 'margin-bottom:10px;';

        var importBtn = importDiv.createEl('button', { text: '📂 导入 JSON 文件' });
        importBtn.style.cssText = 'padding:8px 16px;background:#e67e22;color:white;border:none;border-radius:4px;cursor:pointer;';
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

        var warning = importDiv.createEl('p', { text: '⚠️ 注意：导入会覆盖现有的阵营和关系数据（人物和时间线不会被覆盖）' });
        warning.style.cssText = 'color:#e67e22;font-size:11px;margin-top:10px;';
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
        el.style.cssText = 'padding:20px;';

        el.createEl('h3', { text: this.faction ? '编辑阵营' : '添加阵营' });

        var nameValue = this.faction ? this.faction.name : '';
        var colorValue = this.faction ? this.faction.color || '#4a90e2' : '#4a90e2';
        var descValue = this.faction ? this.faction.desc || '' : '';

        var nameRow = el.createEl('div');
        nameRow.style.cssText = 'margin:10px 0;';
        nameRow.createEl('label', { text: '阵营名称' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
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
        var startInput = rowStart.createEl('input', { type: 'text', value: startTime, placeholder: '如：301年春、登基后' });
        startInput.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
        startInput.addEventListener('input', function () { startTime = startInput.value; });

        var rowEnd = el.createEl('div');
        rowEnd.style.cssText = 'margin:10px 0;';
        rowEnd.createEl('label', { text: '关系结束时间（可选）' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var endInput = rowEnd.createEl('input', { type: 'text', value: endTime, placeholder: '如：305年秋、决裂后' });
        endInput.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
        endInput.addEventListener('input', function () { endTime = endInput.value; });

        var rowDesc = el.createEl('div');
        rowDesc.style.cssText = 'margin:10px 0;';
        rowDesc.createEl('label', { text: '描述（可选）' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;';
        var descInput = rowDesc.createEl('textarea', { value: desc });
        descInput.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;height:60px;box-sizing:border-box;';
        descInput.addEventListener('input', function () { desc = descInput.value; });

        var btnRow = el.createEl('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:15px;';

        var self = this;
        var saveBtn = btnRow.createEl('button', { text: '保存' });
        saveBtn.style.cssText = 'padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;';
        saveBtn.addEventListener('click', function () {
            if (!charA || !charB) { new obsidian.Notice('请选择人物'); return; }
            if (charA === charB) { new obsidian.Notice('不能选同一个人'); return; }
            if (!type) { new obsidian.Notice('请选择关系类型'); return; }
            self.onSubmit({ charA: charA, charB: charB, type: type, desc: desc.trim(), intimacy: intimacy, startTime: startTime, endTime: endTime });
            self.close();
        });

        var cancelBtn = btnRow.createEl('button', { text: '取消' });
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
        el.style.cssText = 'padding:20px;max-height:70vh;overflow-y:auto;min-width:300px;';

        el.createEl('h2', { text: this.charData.name }).style.cssText = 'margin:0 0 15px;border-bottom:2px solid var(--interactive-accent);padding-bottom:6px;';

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
                var item = el.createEl('div');
                item.style.cssText = 'padding:4px 8px;margin:2px 0;background:#fafafa;border-radius:3px;font-size:12px;';
                item.createEl('small', { text: '[' + this.events[i].year + ' ' + this.events[i].month + '] ' }).style.color = '#999';
                item.createEl('span', { text: this.events[i].event });
            }
            if (this.events.length > 50) {
                el.createEl('p', { text: '...还有 ' + (this.events.length - 50) + ' 条' }).style.cssText = 'color:#888;font-size:12px;';
            }
        }
        
        var closeBtn = el.createEl('button', { text: '关闭', cls: 'my-char-view-btn' });
        closeBtn.style.cssText = 'margin-top:15px;width:100%;';
        closeBtn.addEventListener('click', function () { self.close(); });
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
    text: '💡 插件会自动读取你当前打开的文件夹下的「人物索引.md」和「时间线.md」' 
}).style.cssText = 'background:#f0f7ff;padding:12px 16px;border-radius:6px;border-left:3px solid #4a90e2;margin-bottom:15px;';

        var pathHint = el.createEl('div');
        pathHint.style.cssText = 'margin:10px 0 15px;padding:10px;background:#f0f4ff;border-radius:6px;font-size:12px;color:#333;border-left:3px solid #4a90e2;';
        
        this.updatePathHint = function() {
            var charFullPath = getCharFullPath(this.plugin);
            var timelineFullPath = getTimelineFullPath(this.plugin);
            pathHint.innerHTML = '📍 <strong>当前完整路径</strong><br>' +
                '• 👥 人物文件：<code style="background:#e0e0e0;padding:2px 4px;border-radius:3px;">' + charFullPath + '</code><br>' +
                '• 📅 时间线文件：<code style="background:#e0e0e0;padding:2px 4px;border-radius:3px;">' + timelineFullPath + '</code>';
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
            customIntimacyLevels: ''
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

// 按时间排序（从旧到新）
function sortHistoryByTime(history) {
    return history.slice().sort(function(a, b) {
        var ta = parseHistoricalDate(a.timestamp);
        var tb = parseHistoricalDate(b.timestamp);
        var va = ta && ta.sortValue !== null ? ta.sortValue : 0;
        var vb = tb && tb.sortValue !== null ? tb.sortValue : 0;
        return va - vb;
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
    var total = history.length;
    var label = getIntimacyLabel(latest.newValue);
    return '共' + total + '次变化，当前: ' + label;
}

function ensureIntimacyHistory(plugin) {
    if (!plugin._intimacyHistory) plugin._intimacyHistory = [];
    return plugin._intimacyHistory;
}

function addIntimacyRecord(plugin, record) {
    ensureIntimacyHistory(plugin).push(record);
}

function buildIntimacyCurvePoints(history) {
    var sorted = sortHistoryByTime(history);
    if (sorted.length === 0) return [];
    var points = [{ xLabel: '起点', sortValue: null, value: sorted[0].oldValue, idx: 0 }];
    for (var i = 0; i < sorted.length; i++) {
        var rec = sorted[i];
        var parsed = parseHistoricalDate(rec.timestamp);
        points.push({
            xLabel: rec.timestamp || ('变化' + (i + 1)),
            sortValue: parsed && parsed.sortValue !== null ? parsed.sortValue : null,
            value: rec.newValue,
            idx: i + 1
        });
    }
    return points;
}

function renderIntimacyCurveChart(container, history, options) {
    options = options || {};
    var width = options.width || 460;
    var height = options.height || 150;
    var compact = options.compact || false;
    var points = buildIntimacyCurvePoints(history);
    if (points.length < 2) return null;

    var minY = -3, maxY = 5;
    var padL = compact ? 24 : 36, padR = 12, padT = 10, padB = compact ? 14 : 28;
    var chartW = width - padL - padR;
    var chartH = height - padT - padB;
    var hasTime = false;
    for (var hi = 0; hi < points.length; hi++) {
        if (points[hi].sortValue !== null) { hasTime = true; break; }
    }
    var xVals = points.map(function(p, i) {
        return hasTime && p.sortValue !== null ? p.sortValue : i;
    });
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
        wrap.createEl('div', { text: '📈 亲密度变化曲线' }).style.cssText = 'font-size:12px;font-weight:bold;margin-bottom:6px;color:#555;';
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
        pathD += (pi === 0 ? 'M' : 'L') + toX(xVals[pi]) + ',' + toY(points[pi].value);
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
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(toX(xVals[ci])));
        circle.setAttribute('cy', String(toY(points[ci].value)));
        circle.setAttribute('r', compact ? '3' : '5');
        circle.setAttribute('fill', getIntimacyColor(points[ci].value));
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '1');
        svg.appendChild(circle);
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
        var el = this.contentEl;
        el.style.cssText = 'padding:20px;max-height:80vh;overflow-y:auto;min-width:500px;';
        
        el.createEl('h3', { text: '📊 亲密度变化历史' }).style.cssText = 'margin:0 0 4px;';
        var sub = el.createEl('div');
        sub.style.cssText = 'font-size:13px;color:#555;margin-bottom:15px;';
        sub.innerHTML = '<strong>' + this.relation.charA + '</strong> ↔ <strong>' + this.relation.charB + '</strong> ｜ 当前：' + getIntimacyLabel(this.relation.intimacy || 0);
        
        var history = getRelationHistory(this.view.plugin, this.relation.charA, this.relation.charB);
        
        if (history.length === 0) {
            el.createEl('p', { text: '📭 该关系暂无变化记录', cls: 'my-char-view-empty' }).style.cssText = 'text-align:center;color:#888;padding:30px;';
            var closeBtn = el.createEl('button', { text: '关闭' });
            closeBtn.style.cssText = 'margin-top:15px;padding:8px 16px;background:#888;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
            closeBtn.addEventListener('click', function() { self.close(); });
            return;
        }
        
        var sorted = sortHistoryByTime(history);
        
        // 统计信息
        var stats = el.createEl('div');
        stats.style.cssText = 'display:flex;gap:15px;padding:10px;background:#f5f7fa;border-radius:6px;margin-bottom:12px;flex-wrap:wrap;';
        var upCount = 0, downCount = 0, flatCount = 0;
        for (var i = 0; i < sorted.length; i++) {
            var type = getChangeType(sorted[i].oldValue, sorted[i].newValue);
            if (type.indexOf('提升') !== -1) upCount++;
            else if (type.indexOf('下降') !== -1) downCount++;
            else flatCount++;
        }
        stats.createEl('span', { text: '📋 共 ' + sorted.length + ' 次' }).style.cssText = 'font-size:12px;';
        stats.createEl('span', { text: '⬆ 提升 ' + upCount + ' 次' }).style.cssText = 'font-size:12px;color:#2ecc71;';
        stats.createEl('span', { text: '⬇ 下降 ' + downCount + ' 次' }).style.cssText = 'font-size:12px;color:#e74c3c;';
        stats.createEl('span', { text: '➡ 持平 ' + flatCount + ' 次' }).style.cssText = 'font-size:12px;color:#95a5a6;';

        renderIntimacyCurveChart(el, sorted, { width: 500, height: 170, compact: false });

        // 时间列表
        var list = el.createEl('div');
        list.style.cssText = 'max-height:400px;overflow-y:auto;';
        
        for (var i = 0; i < sorted.length; i++) {
            (function(record, idx) {
                var item = list.createEl('div');
                var isLatest = idx === sorted.length - 1;
                var borderColor = isLatest ? '#4a90e2' : '#e8e8e8';
                item.style.cssText = 'padding:10px 12px;margin:4px 0;border-left:3px solid ' + borderColor + ';background:' + (isLatest ? '#f0f7ff' : 'white') + ';border-radius:4px;';
                
                // 行1：时间和变化值
                var row1 = item.createEl('div');
                row1.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
                
                var timeLabel = row1.createEl('span', { text: record.timestamp || '未标注时间' });
                timeLabel.style.cssText = 'font-size:12px;color:#888;font-weight:bold;';
                
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
                
                if (isLatest) {
                    var latestBadge = row1.createEl('span', { text: '当前' });
                    latestBadge.style.cssText = 'font-size:9px;padding:1px 6px;border-radius:8px;background:#4a90e2;color:white;';
                }
                
                // 行2：原因
                if (record.changeReason || record.customReason || record.eventId) {
                    var row2 = item.createEl('div');
                    row2.style.cssText = 'font-size:11px;color:#666;margin-top:4px;padding-left:4px;';
                    if (record.eventId && record.eventYear) {
                        row2.createEl('span', { text: '📎 ' + record.eventYear + ' · ' });
                        var eventLink = row2.createEl('span', { text: '查看事件' });
                        eventLink.style.cssText = 'color:#4a90e2;cursor:pointer;text-decoration:underline;';
                        (function(eid) {
                            eventLink.addEventListener('click', function() {
                                // 跳转到时间线并定位到该事件
                                self.view.tab = 'timeline';
                                self.view._yearSearchText = record.eventYear || '';
                                self.view.render();
                                self.close();
                            });
                        })(record.eventId);
                    } else if (record.customReason) {
                        row2.createEl('span', { text: '📝 ' + record.customReason });
                    } else if (record.changeReason === '初始值设定') {
                        row2.createEl('span', { text: '📌 初始值设定' }).style.cssText = 'color:#999;';
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
        el.style.cssText = 'padding:20px;max-height:80vh;overflow-y:auto;min-width:450px;';
        
        el.createEl('h3', { text: '📝 记录关系变化' }).style.cssText = 'margin:0 0 4px;';
        var sub = el.createEl('div');
        sub.style.cssText = 'font-size:13px;color:#555;margin-bottom:15px;';
        sub.innerHTML = '<strong>' + this.relation.charA + '</strong> ↔ <strong>' + this.relation.charB + '</strong> ｜ 当前：' + getIntimacyLabel(this.relation.intimacy || 0);
        
        var currentIntimacy = this.relation.intimacy || 0;
        var newIntimacy = currentIntimacy;
        var changeReason = '自定义描述';
        var customReason = '';
        var timestamp = '';
        var note = '';
        
        // 变化前（自动填充当前值）
        var rowOld = el.createEl('div');
        rowOld.style.cssText = 'margin:10px 0;';
        rowOld.createEl('label', { text: '变化前亲密度' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;font-size:13px;';
        var oldDisplay = rowOld.createEl('span');
        var oldColor = getIntimacyColor(currentIntimacy);
        oldDisplay.style.cssText = 'padding:6px 12px;border-radius:4px;background:' + oldColor + ';color:white;font-weight:bold;display:inline-block;';
        oldDisplay.textContent = getIntimacyLabel(currentIntimacy) + ' (' + currentIntimacy + ')';
        
        // 变化后
        var rowNew = el.createEl('div');
        rowNew.style.cssText = 'margin:10px 0;';
        rowNew.createEl('label', { text: '变化后亲密度' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;font-size:13px;';
        var newSelect = rowNew.createEl('select');
        newSelect.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;';
        for (var i = 0; i < INTIMACY_LEVELS.length; i++) {
            var lvl = INTIMACY_LEVELS[i];
            var opt = document.createElement('option');
            opt.value = lvl.value;
            opt.textContent = lvl.label + ' (' + lvl.value + ')';
            if (lvl.value === currentIntimacy) opt.selected = true;
            newSelect.appendChild(opt);
        }
        newSelect.addEventListener('change', function() {
            newIntimacy = parseInt(newSelect.value);
        });
        
        // 变化原因 - 三种模式
        el.createEl('div', { text: '变化原因' }).style.cssText = 'font-weight:bold;margin:12px 0 4px;font-size:13px;';
        
        var reasonContainer = el.createEl('div');
        reasonContainer.style.cssText = 'padding:10px;background:#f8f9fa;border-radius:6px;';
        
        var reasonType = '自定义描述';
        
        // 选项：事件关联
        var eventRow = reasonContainer.createEl('div');
        eventRow.style.cssText = 'margin-bottom:8px;';
        var eventRadio = eventRow.createEl('input', { type: 'radio', name: 'reasonType', value: '事件关联' });
        eventRadio.style.cssText = 'margin-right:6px;';
        eventRow.createEl('span', { text: '📎 关联时间线事件' });
        
        var eventSelectRow = reasonContainer.createEl('div');
        eventSelectRow.style.cssText = 'margin-left:24px;margin-bottom:8px;';
        var eventSelect = eventSelectRow.createEl('select');
        eventSelect.style.cssText = 'width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- 请选择事件 --';
        eventSelect.appendChild(defaultOpt);
        
        var timelineEvents = self.view.timeline || [];
        // 收集所有事件，按年份排序
        var eventList = [];
        for (var i = 0; i < timelineEvents.length; i++) {
            var evt = timelineEvents[i];
            // 只保留有人物出场的事件（简化处理，全部显示）
            eventList.push(evt);
        }
        eventList.sort(function(a, b) {
            var ay = parseHistoricalDate(a.year);
            var by = parseHistoricalDate(b.year);
            var av = ay && ay.sortValue !== null ? ay.sortValue : 0;
            var bv = by && by.sortValue !== null ? by.sortValue : 0;
            return bv - av; // 最新在前
        });
        for (var i = 0; i < Math.min(eventList.length, 100); i++) {
            var evt = eventList[i];
            var opt = document.createElement('option');
            opt.value = i;
            opt.textContent = '[' + evt.year + '] ' + evt.event.substring(0, 30) + (evt.event.length > 30 ? '...' : '');
            opt.setAttribute('data-year', evt.year);
            opt.setAttribute('data-event', evt.event);
            eventSelect.appendChild(opt);
        }
        eventSelectRow.style.display = 'none';
        
        // 选项：自定义描述
        var customRow = reasonContainer.createEl('div');
        customRow.style.cssText = 'margin-bottom:8px;';
        var customRadio = customRow.createEl('input', { type: 'radio', name: 'reasonType', value: '自定义描述' });
        customRadio.checked = true;
        customRadio.style.cssText = 'margin-right:6px;';
        customRow.createEl('span', { text: '✏️ 自定义描述' });
        
        var customTextRow = reasonContainer.createEl('div');
        customTextRow.style.cssText = 'margin-left:24px;';
        var customInput = customTextRow.createEl('input', { type: 'text' });
        customInput.style.cssText = 'width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
        customInput.placeholder = '输入变化原因，如：共同经历了一次重大事件';
        customInput.addEventListener('input', function() { customReason = customInput.value; });
        
        // 选项：初始值设定
        var initRow = reasonContainer.createEl('div');
        var initRadio = initRow.createEl('input', { type: 'radio', name: 'reasonType', value: '初始值设定' });
        initRadio.style.cssText = 'margin-right:6px;';
        initRow.createEl('span', { text: '📌 初始值设定（仅记录起点，不触发变化波动）' });
        
        // 事件关联切换
        eventRadio.addEventListener('change', function() {
            if (eventRadio.checked) {
                eventSelectRow.style.display = 'block';
                customTextRow.style.display = 'none';
                reasonType = '事件关联';
            }
        });
        customRadio.addEventListener('change', function() {
            if (customRadio.checked) {
                eventSelectRow.style.display = 'none';
                customTextRow.style.display = 'block';
                reasonType = '自定义描述';
            }
        });
        initRadio.addEventListener('change', function() {
            if (initRadio.checked) {
                eventSelectRow.style.display = 'none';
                customTextRow.style.display = 'none';
                reasonType = '初始值设定';
            }
        });
        
        // 时间
        var timeRow = el.createEl('div');
        timeRow.style.cssText = 'margin:10px 0;';
        timeRow.createEl('label', { text: '故事内时间（可选）' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;font-size:13px;';
        var timeInput = timeRow.createEl('input', { type: 'text' });
        timeInput.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
        timeInput.placeholder = '如：前280年冬、300年春';
        timeInput.addEventListener('input', function() { timestamp = timeInput.value; });
        
        // 备注
        var noteRow = el.createEl('div');
        noteRow.style.cssText = 'margin:10px 0;';
        noteRow.createEl('label', { text: '备注（可选）' }).style.cssText = 'display:block;font-weight:bold;margin-bottom:4px;font-size:13px;';
        var noteInput = noteRow.createEl('textarea');
        noteInput.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;height:50px;box-sizing:border-box;';
        noteInput.placeholder = '额外说明...';
        noteInput.addEventListener('input', function() { note = noteInput.value; });
        
        // 按钮
        var btnRow = el.createEl('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:15px;';
        
        var saveBtn = btnRow.createEl('button', { text: '💾 保存变化' });
        saveBtn.style.cssText = 'padding:8px 20px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;';
        saveBtn.addEventListener('click', function() {
            // 验证
            if (newIntimacy === currentIntimacy && reasonType !== '初始值设定') {
                if (!confirm('亲密度值没有变化，确定要记录吗？')) return;
            }
            
            // 构建变化记录
            var record = {
                id: generateId(),
                charA: self.relation.charA,
                charB: self.relation.charB,
                oldValue: currentIntimacy,
                newValue: newIntimacy,
                changeReason: reasonType,
                timestamp: timestamp || '未标注时间',
                recordDate: new Date().toISOString().split('T')[0],
                note: note || ''
            };
            
            if (reasonType === '事件关联') {
                var selectedIdx = parseInt(eventSelect.value);
                if (!isNaN(selectedIdx) && eventList[selectedIdx]) {
                    var evt = eventList[selectedIdx];
                    record.eventId = 'evt_' + selectedIdx;
                    record.eventYear = evt.year;
                    record.customReason = evt.event.substring(0, 50);
                } else {
                    new obsidian.Notice('请选择事件');
                    return;
                }
            } else if (reasonType === '自定义描述') {
                if (!customReason.trim()) {
                    new obsidian.Notice('请输入自定义描述');
                    return;
                }
                record.customReason = customReason.trim();
            } else if (reasonType === '初始值设定') {
                record.customReason = '初始值设定';
            }
            
            if (self.onSave) self.onSave(record);
            self.close();
        });
        
        var cancelBtn = btnRow.createEl('button', { text: '取消' });
        cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:white;';
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
        relation.intimacy = record.newValue;
        self.saveFactionsAndRelations().then(function() {
            if (callback) callback(record);
            self.render();
            new obsidian.Notice('✅ 变化已记录：' + getIntimacyLabel(record.oldValue) + ' → ' + getIntimacyLabel(record.newValue));
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
        new obsidian.Notice('所有人物都已建立关系');
        return;
    }
    this.filterCharsByCondition(
        function(c) { return !charsWithRelations[c.name]; },
        '🔗 无任何关系的人物',
        '共 ' + matchedNames.length + ' 人'
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
    container.style.cssText = 'padding:10px;overflow-y:auto;';

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

    container.createEl('h3', { text: '📊 写作仪表盘' }).style.cssText = 'margin:0 0 15px;border-bottom:2px solid var(--interactive-accent);padding-bottom:6px;';

    var timeBar = container.createEl('div');
    timeBar.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:15px;padding:8px 12px;background:#f0f7ff;border-radius:6px;border-left:3px solid #4a90e2;flex-wrap:wrap;';
    timeBar.createEl('span', { text: '⏱️ 当前时间点：' }).style.cssText = 'font-weight:bold;font-size:13px;';
    timeBar.createEl('span', { text: currentTimeStr || '（未设置）' }).style.cssText = 'font-size:13px;color:' + (currentTimeStr ? '#4a90e2' : '#999') + ';';
    var setTimeBtn = timeBar.createEl('button', { text: '⚙️ 设置' });
    setTimeBtn.style.cssText = 'padding:2px 12px;font-size:11px;border-radius:4px;border:1px solid #ddd;cursor:pointer;background:white;';
    setTimeBtn.addEventListener('click', function() { self.app.setting.open(); self.app.setting.openTabById(self.plugin.manifest.id); });

    var statsGrid = container.createEl('div');
    statsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px;';
    var statCards = [
        { label: '👥 人物', value: totalChars, color: '#4a90e2' },
        { label: '📅 事件', value: totalEvents, color: '#2ecc71' },
        { label: '🔗 关系', value: totalRels, color: '#e74c3c' },
        { label: '🏰 阵营', value: totalFactions, color: '#9b59b6' }
    ];
    for (var i = 0; i < statCards.length; i++) {
        var card = statsGrid.createEl('div');
        card.style.cssText = 'background:white;border-radius:8px;padding:12px;text-align:center;border:1px solid #e0e0e0;';
        card.innerHTML = '<div style="font-size:24px;">' + statCards[i].label.split(' ')[0] + '</div><div style="font-size:22px;font-weight:bold;color:' + statCards[i].color + ';">' + statCards[i].value + '</div><div style="font-size:11px;color:#888;">' + statCards[i].label.substring(2) + '</div>';
    }

    var statusGrid = container.createEl('div');
    statusGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;margin-bottom:20px;';
    var statusItems = [
        { key: 'alive', label: '🟢 存活', count: statusCounts.alive || 0 },
        { key: 'dead', label: '🔴 已故', count: statusCounts.dead || 0 },
        { key: 'unborn', label: '🔵 未出生', count: statusCounts.unborn || 0 },
        { key: 'missing', label: '⚪ 失踪', count: statusCounts.missing || 0 },
        { key: 'unknown', label: '🟡 未知', count: statusCounts.unknown || 0 }
    ];
    for (var i = 0; i < statusItems.length; i++) {
        var item = statusItems[i];
        var card = statusGrid.createEl('div');
        var color = getStatusColor(item.key);
        card.style.cssText = 'background:white;border-radius:6px;padding:8px;text-align:center;border:1px solid #e0e0e0;border-left:3px solid ' + color + ';';
        card.innerHTML = '<div style="font-size:20px;font-weight:bold;color:' + color + ';">' + item.count + '</div><div style="font-size:11px;color:#888;">' + item.label + '</div>';
    }

    // ===== 待办提醒（可点击，带横幅） =====
    var todoSection = container.createEl('div');
    todoSection.style.cssText = 'background:#fef9f0;border-radius:8px;padding:12px 16px;margin-bottom:20px;border-left:4px solid #f39c12;';
    todoSection.createEl('div', { text: '⚠️ 待办提醒（点击条目查看）' }).style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;color:#e67e22;';

    var todoList = todoSection.createEl('div');
    todoList.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

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

    if (todos.length === 0) {
        todoList.createEl('div', { text: '✅ 暂无待办事项' }).style.cssText = 'color:#27ae60;font-size:13px;padding:4px 0;';
    } else {
        for (var i = 0; i < todos.length; i++) {
            (function(todo) {
                var row = todoList.createEl('div');
                row.style.cssText = 'font-size:12px;padding:6px 10px;border-bottom:1px solid #f0e8d8;cursor:pointer;border-radius:4px;';
                row.style.color = todo.severity === 'high' ? '#e74c3c' : '#555';
                row.style.fontWeight = todo.severity === 'high' ? 'bold' : 'normal';
                row.textContent = todo.text;
                row.addEventListener('mouseenter', function() { row.style.background = '#f0e8d8'; });
                row.addEventListener('mouseleave', function() { row.style.background = 'transparent'; });
                row.addEventListener('click', function() { todo.action(); });
            })(todos[i]);
        }
    }

    // ===== 时间线进度 =====
    var progressSection = container.createEl('div');
    progressSection.style.cssText = 'background:white;border-radius:8px;padding:12px 16px;margin-bottom:20px;border:1px solid #e0e0e0;';
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
    recentSection.style.cssText = 'background:white;border-radius:8px;padding:12px 16px;border:1px solid #e0e0e0;';
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

// ========== 修改 renderCurrentTab（添加 dashboard） ==========

var __origRenderCurrentTabFinal = MyView.prototype.renderCurrentTab;
MyView.prototype.renderCurrentTab = function(container) {
    container.empty();
    var tabContent = container.createEl('div');
    tabContent.className = 'tab-content';
    tabContent.style.cssText = 'flex:1;overflow-y:auto;min-height:0;';
    switch (this.tab) {
        case 'chars': this.renderChars(tabContent); break;
        case 'factions': this.renderFactions(tabContent); break;
        case 'relations': this.renderRelations(tabContent); break;
        case 'timeline': this.renderTimeline(tabContent); break;
        case 'lifecycle': this.renderLifecycle(tabContent); break;
        case 'statistics': this.renderStatistics(tabContent); break;
        case 'importexport': this.renderImportExport(tabContent); break;
        case 'dashboard': this.renderDashboard(tabContent); break;
        case 'heatmap': this.renderHeatmap(tabContent); break;
        default: this.renderChars(tabContent);
    }
};

// ========== 修改 render（添加仪表盘 Tab） ==========

var __origRenderFinal = MyView.prototype.render;
MyView.prototype.render = function() {
    if (this._rendering) return;
    this._rendering = true;
    var container = this.contentEl;
    container.empty();
    container.addClass('my-char-view-root');
    var self = this;

    var headerRow = container.createEl('div', { cls: 'my-char-view-header' });
    headerRow.createEl('h2', { text: getViewTitle(this.plugin) });
    if (this.tab !== 'chars' && this.tab !== 'dashboard') {
        var backBtn = headerRow.createEl('button', { text: '🏠 返回主页', cls: 'my-char-view-btn my-char-view-btn-secondary' });
        backBtn.addEventListener('click', function() { self.tab = 'chars'; self.searchText = ''; self.selectedTag = ''; self.render(); });
    }

    var toolbar = container.createEl('div', { cls: 'my-char-view-toolbar' });
    var refreshBtn = toolbar.createEl('button', { text: '🔄 刷新数据', cls: 'my-char-view-btn' });
    refreshBtn.addEventListener('click', function() { self.loadAllData().then(function() { self.render(); }); });
    var applyConfigBtn = toolbar.createEl('button', { text: '应用字段设置', cls: 'my-char-view-btn my-char-view-btn-success' });
    applyConfigBtn.addEventListener('click', function() { self.loadAllData().then(function() { self.render(); }); new obsidian.Notice('已重新加载并应用字段设置'); });
    toolbar.createEl('span', { text: '人物:' + this.chars.length + ' | 阵营:' + this.factions.length + ' | 关系:' + this.relations.length, cls: 'my-char-view-stats' });

    var tabs = container.createEl('div', { cls: 'my-char-view-tabs' });
    ensureValidTab(this);
    var tabNames = getVisibleTabs(this.plugin);
    for (var i = 0; i < tabNames.length; i++) {
        (function(tab) {
            var btn = tabs.createEl('button', { text: tab.label });
            btn.className = 'my-char-view-tab-btn' + (self.tab === tab.id ? ' is-active' : '');
            btn.addEventListener('click', function() { self.tab = tab.id; self.searchText = ''; self.selectedTag = ''; self.render(); });
        })(tabNames[i]);
    }

    var content = container.createEl('div', { cls: 'my-char-view-content' });
    if (this.chars.length === 0 && this.tab !== 'importexport' && this.tab !== 'dashboard') {
        content.createEl('p', { text: '点击"刷新数据"加载文件', cls: 'my-char-view-empty' });
    } else {
        try { this.renderCurrentTab(content); } catch (err) { console.error('渲染错误:', err); content.createEl('p', { text: '渲染出错，请查看控制台', cls: 'my-char-view-empty' }); }
    }
    this._rendering = false;
};

// ========== 扩展设置（使用场景、Tab 显示、当前时间点） ==========

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
        currentTimePoint: '', useCaseMode: 'novel', hiddenTabs: [], viewTitle: ''
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
    container.style.cssText = 'padding:10px;overflow-y:auto;';

    // 检查是否有数据
    if (this.timeline.length === 0 || this.chars.length === 0) {
        container.createEl('p', {
            text: '📭 没有数据。请在当前文件夹创建「人物索引.md」和「时间线.md」',
            cls: 'my-char-view-empty'
        }).style.cssText = 'text-align:center;color:#888;padding:40px;';
        return;
    }

    // ===== 获取所有年份 =====
    var allYears = getTimelineYears(this);
    if (allYears.length === 0) {
        container.createEl('p', { text: '📭 时间线中没有年份数据' }).style.cssText = 'text-align:center;color:#888;padding:40px;';
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
    titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;';
    titleRow.createEl('h3', { text: '🔥 出场热力图' }).style.cssText = 'margin:0;';

    var modeHint = titleRow.createEl('span');
    modeHint.style.cssText = 'font-size:11px;color:#888;';
    if (this.heatmapMode === '集中') modeHint.textContent = '📋 集中视图 · 显示所有人物';
    else if (this.heatmapMode === '单人') modeHint.textContent = '👤 单人深度视图 · 查看单个角色出场轨迹';
    else modeHint.textContent = '👥 多人对比视图 · 对比多个角色出场频率';

    // ===== 工具栏 =====
    var toolbar = container.createEl('div');
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:10px 14px;background:#f8f9fa;border-radius:8px;align-items:center;border:1px solid #e8e8e8;';

    // 模式切换
    toolbar.createEl('span', { text: '📐 模式:' }).style.cssText = 'font-size:12px;color:#666;font-weight:bold;';
    var modeSelect = toolbar.createEl('select');
    modeSelect.style.cssText = 'padding:4px 10px;border-radius:4px;border:1px solid #ddd;font-size:12px;background:white;';
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
    toolbar.createEl('span', { text: '粒度:' }).style.cssText = 'font-size:12px;color:#666;font-weight:bold;margin-left:8px;';
    var granularitySelect = toolbar.createEl('select');
    granularitySelect.style.cssText = 'padding:4px 10px;border-radius:4px;border:1px solid #ddd;font-size:12px;background:white;';
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
        toolbar.createEl('span', { text: '类型:' }).style.cssText = 'font-size:12px;color:#666;font-weight:bold;margin-left:8px;';
        var typeSelect = toolbar.createEl('select');
        typeSelect.style.cssText = 'padding:4px 10px;border-radius:4px;border:1px solid #ddd;font-size:12px;background:white;';

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
        toolbar.createEl('span', { text: '🔍' }).style.cssText = 'font-size:12px;color:#666;margin-left:8px;';
        var searchInput = toolbar.createEl('input', { type: 'text', placeholder: '搜索人物...' });
        searchInput.style.cssText = 'flex:1;min-width:100px;padding:4px 10px;border:1px solid #ddd;border-radius:4px;font-size:12px;';
        searchInput.value = this.heatmapSearchText || '';
        searchInput.addEventListener('input', debounce(function() {
            self.heatmapSearchText = searchInput.value;
            self.heatmapPage = 1;
            self.renderHeatmap(container);
        }, 300));
    }

    // ===== 年份滑块 =====
    var sliderRow = container.createEl('div');
    sliderRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:8px 14px;background:#f5f7fa;border-radius:6px;flex-wrap:wrap;border:1px solid #e8e8e8;';

    sliderRow.createEl('span', { text: '📅 年份范围:' }).style.cssText = 'font-size:12px;color:#666;font-weight:bold;';

    var startYearDisplay = sliderRow.createEl('span');
    startYearDisplay.style.cssText = 'font-size:13px;font-weight:bold;color:#4a90e2;min-width:60px;';

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
    endYearDisplay.style.cssText = 'font-size:13px;font-weight:bold;color:#4a90e2;min-width:60px;';

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
    footer.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;padding:10px 0;align-items:center;justify-content:space-between;border-top:1px solid #eee;margin-top:8px;';

    var statsLeft = footer.createEl('div');
    statsLeft.style.cssText = 'display:flex;gap:16px;font-size:12px;color:#666;flex-wrap:wrap;';
    statsLeft.createEl('span', { text: '👥 显示 ' + data.rows.length + ' 人' });
    statsLeft.createEl('span', { text: '📅 ' + data.timeSlots.length + ' 个时间段' });
    statsLeft.createEl('span', { text: '🔥 最大出场 ' + maxCount + ' 次' });

    // 分页（仅集中模式）
    if (this.heatmapMode === '集中') {
        var pagination = footer.createEl('div');
        pagination.style.cssText = 'display:flex;gap:4px;align-items:center;';

        var prevBtn = pagination.createEl('button', { text: '◀' });
        prevBtn.style.cssText = 'padding:2px 12px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:white;font-size:12px;';
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
                btn.style.cssText = 'padding:2px 12px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:' + (isActive ? '#4a90e2' : 'white') + ';color:' + (isActive ? 'white' : '#333') + ';font-size:12px;';
                btn.addEventListener('click', function() {
                    self.heatmapPage = pg;
                    self.renderHeatmap(container);
                });
            })(pi2);
        }

        var nextBtn = pagination.createEl('button', { text: '▶' });
        nextBtn.style.cssText = 'padding:2px 12px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:white;font-size:12px;';
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
    legend.style.cssText = 'display:flex;gap:14px;padding:8px 0;font-size:11px;color:#666;align-items:center;border-top:1px solid #eee;margin-top:4px;flex-wrap:wrap;';
    legend.createEl('span', { text: '🎨 热度图例:' }).style.cssText = 'font-weight:bold;';

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
        dot.style.cssText = 'display:inline-block;width:24px;height:16px;background:' + item.color + ';border:1px solid #ddd;border-radius:3px;text-align:center;line-height:16px;font-size:9px;color:' + item.textColor + ';';
        legend.createEl('span', { text: item.label }).style.cssText = 'margin-right:6px;font-size:10px;';
    }

    var hint = legend.createEl('span', { text: '💡 点击表头年份查看事件 · 点击人物名查看详情 · 悬停数字查看具体事件' });
    hint.style.cssText = 'font-size:10px;color:#999;margin-left:auto;';
};

module.exports = MyPlugin;
console.log('✅ 人物关系谱系插件加载完成');
