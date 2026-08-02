# 📚 Relation Weaver (人物关系谱系)

> An Obsidian plugin for managing characters, factions, relationships, and timelines in novels, TTRPG campaigns, and worldbuilding projects.
>
> 一个 Obsidian 插件，用于管理小说、跑团、世界构建中的人物、阵营、关系和时间线。

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/guilier/relation-weaver)](https://github.com/guilier/relation-weaver/releases)
[![Obsidian Community](https://img.shields.io/badge/Obsidian-Community%20Plugin-7c3aed)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📖 Table of Contents / 目录

- [About / 插件简介](#about--插件简介)
- [Installation / 安装与使用](#installation--安装与使用)
- [What's New in v3.0.1 / v301-新功能](#whats-new-in-v301--v301-新功能)
- [Data Format / 数据文件格式](#data-format--数据文件格式)
- [Features Overview / 功能详解](#features-overview--功能详解)
- [Customization / 自定义配置](#customization--自定义配置)
- [FAQ / 常见问题](#faq--常见问题)
- [Changelog / 更新日志](#changelog--更新日志)

---

## About / 插件简介

### What is Relation Weaver? / 这是什么？

**Relation Weaver** helps you track character connections, analyze appearance frequency, visualize intimacy changes over time, and maintain a consistent narrative timeline — all within your Obsidian vault.

**「人物关系谱系」** 是一款专为创作者设计的 Obsidian 插件，特别适合：

| English | 中文 |
|---------|------|
| ✍️ **Novelists** — Manage character relationships, track appearance frequency, plant and resolve plot threads | ✍️ **小说作者** — 管理小说人物关系，追踪出场频率，埋设与回收伏笔 |
| 🎮 **Game Masters / DMs** — Record NPC connections, adventure timelines, and faction politics | 🎮 **跑团主持人 (GM/DM)** — 记录 NPC 关系和冒险时间线，管理势力阵营 |
| 📚 **Worldbuilders** — Map out character networks and historical timelines | 📚 **世界构建者** — 梳理世界观中的人物网络与历史脉络 |
| 📝 **Reading Notes** — Analyze character interactions and relationship dynamics in books | 📝 **读书笔记** — 分析书中人物关系与互动频率 |
| 🧠 **Knowledge Management** — Concept association and knowledge graph building | 🧠 **知识管理** — 概念关联与知识图谱构建 |

### Key Advantages / 核心优势

| Feature | 说明 |
|---------|------|
| 📁 **Pure Markdown Storage** — All data stored in `.md` files, editable manually anytime | 📁 **纯 Markdown 存储** — 所有数据都是 `.md` 文件，你随时可以手动编辑 |
| 🔄 **Bidirectional Sync** — Relationships and factions backed up in both Markdown and JSON | 🔄 **双向同步** — 关系与阵营在 Markdown 和 JSON 之间双备份 |
| 🕸️ **Native Graph Integration** — One-click sync to Obsidian's native graph view | 🕸️ **原生图谱集成** — 一键同步到 Obsidian 原生关系图谱，拖拽探索 |
| 📱 **Cross-Platform** — Works on both desktop and mobile | 📱 **全平台支持** — 桌面端和移动端均可使用 |
| 🎨 **Highly Customizable** — Field names, tags, intimacy levels, and relation types are all configurable | 🎨 **高度可定制** — 字段名、标签、亲密度等级、关系类型全部可自定义 |

---

## Installation / 安装与使用

### Method 1: Obsidian Community Plugin Marketplace (Recommended) / 方式一：Obsidian 社区插件市场（推荐）

1. Open Obsidian Settings → Community Plugins → Browse
2. Search for `Relation Weaver`
3. Click Install and Enable

> 1. 打开 Obsidian 设置 → 社区插件 → 浏览
> 2. 搜索 `Relation Weaver`
> 3. 点击安装并启用

### Method 2: Manual Installation / 方式二：手动安装

1. Download the latest release from [Releases](https://github.com/guilier/relation-weaver/releases)
2. Extract to your vault's `.obsidian/plugins/relation-weaver/` directory
3. Enable the plugin in Obsidian settings

> 1. 从 [Releases](https://github.com/guilier/relation-weaver/releases) 下载最新版本
> 2. 解压到 Vault 的 `.obsidian/plugins/relation-weaver/` 目录
> 3. 在 Obsidian 中启用插件

---

## What's New in v3.0.1 / v3.0.1 新功能

### 📌 Markdown Bidirectional Sync for Relationships / 关系与阵营 Markdown 双写

Relationship data is now stored in both JSON and Markdown:

- New `关系与阵营.md` (Relationships & Factions) file in human-readable Markdown format
- Edit the file directly in Obsidian — the plugin automatically syncs changes
- JSON + Markdown dual backup for extra data safety

关系数据现在同时保存在 JSON 和 Markdown 中：

- 新增 `关系与阵营.md` 文件，采用易读的 Markdown 格式
- 在 Obsidian 中直接编辑该文件，插件会自动同步
- JSON + MD 双备份，数据更安全

**Format Example / 格式示例**：
```markdown
# Factions / 阵营

## Northern Kingdom / 北境王国
- Color / 颜色：#4a90e2
- Description / 描述：The icy kingdom of the north

# Relationships / 关系

## Zhang San · Li Si / 张三 · 李四
- Type / 类型：Close Friend / 挚友
- Intimacy / 亲密度：4
- Description / 描述：Grew up together / 从小一起长大的生死之交
- Start / 开始：280 BC / 前280年
```

### 📌 Visual Relation Type Manager / 关系类型管理 UI

A new UI panel in Settings for managing relation types:

- Freely add, edit, or delete relation types
- Changes take effect immediately — no restart required

设置页新增「管理关系类型」可视化面板：

- 自由添加/编辑/删除关系类型
- 实时生效，无需重启

### 📌 Visual Intimacy Level Manager / 亲密度等级管理 UI

A new UI panel in Settings for managing intimacy levels:

- Freely add, edit, or delete intimacy levels
- Customize numeric values, display names, and colors
- Changes take effect immediately

设置页新增「管理亲密度等级」可视化面板：

- 自由添加/编辑/删除亲密度等级
- 自定义数值、显示名称、颜色
- 实时生效

### 📌 Enhanced Setting Collection / 设定集增强

- **One-click Update Setting Collection**: Overwrites `设定集.md` in your character folder for easy collaboration
- Setting collection now includes **Mermaid relationship diagrams**
- Setting collection includes **first appearance consistency check** results
- Setting collection includes **plot thread validation** results

- **一键更新设定集**：覆盖人物文件夹下的 `设定集.md`，方便共创编辑
- 设定集新增 **Mermaid 关系图**
- 设定集新增 **首次出场一致性检查** 结果
- 设定集新增 **伏笔逻辑校验** 结果

### 📌 Enhanced Dashboard / 仪表盘增强

- **MD Parse Error Panel**: Invalid relationship lines in character index are displayed with fix suggestions
- **Appearance Consistency Check**: Detects "appeared before birth" timeline contradictions
- **One-click Fix Missing First Appearances**: Automatically writes first appearance to character profiles when a `[出场]` event exists in the timeline
- **Create Snapshot**: Backup directly from the dashboard

- **MD 解析错误面板**：人物索引中格式错误的关系行会显示并提示修复方法
- **出场一致性检查**：检测「出生前出场」的穿帮问题
- **一键补全首次出场**：时间线已有 `[出场]` 事件但档案未填的人物，一键写入
- **创建设定快照**：直接从仪表盘备份

### 📌 Floating Character Quick Reference Panel / 时间线人物速查浮窗

- A draggable character tab panel in the timeline view
- Click character names to quickly view details
- Supports search filtering
- Toggle on/off as needed

- 时间线视图显示可拖动的人物 Tab 弹窗
- 点击人物名快速查看详情
- 支持搜索过滤
- 可开启/关闭

### 📌 Event Tag Manager UI Rewrite / 事件标签管理 UI 重写

- Completely free management of event tags — add, edit, or delete any tag
- Tag value uniqueness validation
- No longer forced to keep default tags

- 完全自由添加/编辑/删除事件标签
- 标签值唯一性校验
- 不再强制保留默认标签

### 📌 Bug Fixes / 修复

- Character index MD parsing: Now correctly handles `* ` list items
- Bidirectional relationship sync: Editing relationships now correctly writes to character MD
- Relationship deletion cascade: Deleting a relationship now cleans up records in character MD

- 人物索引 MD 解析：现在正确处理 `* ` 开头的列表项
- 关系双向同步：编辑关系时正确写入人物 MD
- 关系删除联动：删除关系时同步清除人物 MD 中的记录

---

## Data Format / 数据文件格式

### Character Index / 人物索引（`人物索引.md`）

```markdown
## Character Name / 姓名
- Field1: Value1 / 字段1：值1
- Field2: Value2 / 字段2：值2
- Type: Protagonist/Supporting/Extra / 类型：主角/配角/龙套

### Relationships / 关系
- Other: Li Si | Type: Close Friend | Intimacy: 4
- 对方：李四｜类型：挚友｜亲密度：4

### Relationship Changes / 关系变化
- Other: Li Si | Old: 3 | New: 4 | Reason: Survived a crisis together | Time: 280 BC
- 对方：李四｜旧：3｜新：4｜原因：共同经历生死｜时间：前280年
```

### Timeline / 时间线（`时间线.md`）

```markdown
## Year/Chapter / 年份/章节

### Month/Scene: / 月份/场景：
- [Tag] Event description | Plot: Main-A | Status: Plant/Advance/Resolve | Note: [[Link]]
- [标签] 事件内容 | 情节线:xxx | 状态:埋设/推进/回收 | 笔记:[[链接]]
```

### Relationships & Factions / 关系与阵营（`关系与阵营.md`）

```markdown
# Factions / 阵营

## Faction Name / 阵营名
- Color / 颜色：#4a90e2
- Description / 描述：Description text

# Relationships / 关系

## Character A · Character B / 人物A · 人物B
- Type / 类型：Relationship type
- Intimacy / 亲密度：Number
- Description / 描述：Description text
- Start / 开始：Start time
- End / 结束：End time
```

---

## Features Overview / 功能详解

### 👥 Character Management / 人物管理

| English | 中文 |
|---------|------|
| Markdown-based character index (`## Name` + `- Field: Value`) | 基于 Markdown 的人物索引（`## 姓名` + `- 字段：值`） |
| Customizable fields (identity, faction, birth, death, first appearance, etc.) | 自定义字段（身份、阵营、出生、死亡、首次出场……） |
| Auto-updating status badges (Alive/Deceased/Unborn/Unknown) based on the **current timeline point** | 人物状态徽章（存活/已故/未出生/未知），基于**当前时间点**自动判断 |

### 🔗 Relationship Graph / 关系图谱

| English | 中文 |
|---------|------|
| Bidirectional character relationships (fully customizable) | 双向人物关系（父子、师徒、恋人、敌人……完全自定义） |
| Intimacy system (-3 to 5 levels, fully customizable) | 亲密度系统（-3 ~ 5 级，支持自定义等级） |
| **Intimacy Evolution**: Track relationship changes over time with visual intimacy curves | **亲密度动态演化**：记录关系变化历史，可视化亲密度曲线 |
| Relationship time ranges (start/end dates) with timeline filtering | 关系时间范围（开始/结束时间），配合时间点过滤 |

### 📅 Timeline / 时间线

| English | 中文 |
|---------|------|
| Year + month structure with auto-parsing | 支持「年份+月份」结构，自动解析 |
| Fully customizable event tag system | 事件标签系统（完全自定义） |
| **Plot Thread Tracking**: Plant → Advance → Resolve | **情节线追踪**：埋设 → 推进 → 回收 |
| Auto-validation of plot logic (events after resolution, status regression, etc.) | 伏笔逻辑自动校验（回收后仍有事件、状态倒退等） |

### 🔥 Appearance Heatmap / 出场热力图

| English | 中文 |
|---------|------|
| Three modes: Consolidated / Single Character / Multiple Characters | 集中/单人/多人 三种视图模式 |
| Granularity: Year / Half-year / Quarter | 年/半年/季度 粒度切换 |
| Selectable year range | 年份范围自由选择 |
| Hover to see specific events | 悬停显示具体事件 |

### 🔍 Global Search / 全局搜索

- Search across characters, relationships, events, plot threads, and factions simultaneously
- Click results to jump directly

- 同时搜索人物、关系、事件、情节线、阵营
- 点击结果直接跳转

### 🎯 Current Timeline Point Filtering / 当前时间点过滤

- Set the current narrative progress
- Relationships filtered by start/end dates
- Timeline hides "future" events
- Character status auto-updates

- 设置故事当前进度
- 关系按开始/结束时间过滤
- 时间线隐藏「未来」事件
- 人物状态自动更新

### 🕸️ Obsidian Native Graph Sync / Obsidian 原生图谱同步

- Filter sync scope by character "Type" (Protagonist/Supporting/Extra)
- Generates independent notes with `[[wikilinks]]`
- One-click open native graph (global/local)

- 按人物「类型」筛选同步范围（主角/配角/龙套）
- 生成含 `[[双向链接]]` 的独立笔记
- 一键打开原生图谱（全局/本地）

### 📊 Writing Dashboard / 写作仪表盘

- Data overview (characters/events/relationships/factions)
- Character status distribution
- Action items (unappeared characters, isolated characters, deceased but still appearing issues)
- First appearance consistency check
- Unresolved plot thread list
- Timeline progress bar
- **MD Format Validation**: Parse errors displayed in dashboard with fix suggestions

- 数据概览（人物/事件/关系/阵营）
- 人物状态分布
- 待办提醒（未出场人物、孤立人物、已故后出场穿帮）
- 首次出场联动检查
- 未回收伏笔清单
- 时间线进度条
- **MD 格式校验**：解析失败的行会显示在仪表盘

### 📚 Setting Collection Export / 设定集导出

- One-click complete setting collection Markdown (character cards + relationship tables + timelines + plot threads)
- Includes Mermaid relationship diagrams
- Print preview (with PDF export support)
- Save to vault or download

- 一键生成完整设定集 Markdown（人物卡 + 关系表 + 时间线 + 伏笔）
- 包含 Mermaid 关系图
- 打印预览（支持另存为 PDF）
- 支持保存到 Vault 或下载

### 🧊 Setting Snapshots / 设定快照

- One-click backup of character index + timeline + relationships & factions
- Timestamped archives — a safety net before major changes

- 一键备份人物索引 + 时间线 + 关系与阵营
- 按时间戳存档，大改设定前的安全网

### 🎨 Multi-Scene Presets / 多场景预设

- 📖 Novel / Historical Writing / 小说 / 历史创作
- 📔 Daily Journal / 日常日记
- 🎲 TTRPG / Campaigns / 跑团 / TRPG
- 🧠 Knowledge / Concept Relationships / 知识 / 概念关系

---

## Customization / 自定义配置

| Setting / 配置项 | Description / 说明 |
|------------------|-------------------|
| Data Folder / 实体数据文件夹 | Directory for character index and related files / 存放人物索引等文件的目录 |
| Timeline Mode / 时间线结构模式 | auto / chapter / historical |
| Current Timeline Point / 当前时间点 | Current narrative progress for status and filtering / 故事当前进度，用于状态判断和过滤 |
| Graph Sync Scope / 图谱同步范围 | All types / Selected types only / 全部类型 / 仅选中类型 |
| Auto-sync First Appearance / 出场事件自动同步首次出场 | `[出场]` tag auto-writes to character profiles / `[出场]` 标签自动写入人物档案 |
| Default Collapse Top Bar / 默认收起顶栏 | Save space on small screens / 小屏幕省空间 |

---

## FAQ / 常见问题

### Q: Can I edit the data files manually? / 可以手动编辑数据文件吗？

**A:** Yes! All data is stored in standard Markdown files. You can edit them in Obsidian or any text editor. The plugin will automatically sync changes on refresh.

**A:** 可以！所有数据都存储在标准 Markdown 文件中。你可以在 Obsidian 或任何文本编辑器中编辑，插件会在刷新时自动同步更改。

### Q: How do I migrate from v2.x? / 如何从 v2.x 迁移？

**A:** v3.0 uses the same data format as v2.x. Simply install the new version — your existing data will work without migration.

**A:** v3.0 使用与 v2.x 相同的数据格式。直接安装新版本即可，现有数据无需迁移。

### Q: Does this work with Obsidian Mobile? / 支持 Obsidian 移动端吗？

**A:** Yes, the plugin is fully compatible with Obsidian Mobile.

**A:** 支持，插件完全兼容 Obsidian 移动端。

### Q: Can I use this for non-fiction knowledge management? / 可以用于非虚构类的知识管理吗？

**A:** Absolutely. Switch to the "Knowledge" scene preset to rename entities as "Concepts", factions as "Categories", and relationships as "Associations".

**A:** 当然可以。切换到「知识库」场景预设，实体将显示为「概念」，阵营为「分类」，关系为「关联」。

---

## Changelog / 更新日志

### v3.0.1 (2026-08-02)

**New Features / 新增功能：**
- Markdown bidirectional sync for relationships & factions / 关系与阵营 Markdown 双写
- Visual relation type manager / 关系类型管理可视化界面
- Visual intimacy level manager / 亲密度等级管理可视化界面
- Floating character quick reference panel / 时间线人物速查浮窗
- Event tag manager UI rewrite / 事件标签管理界面重写

**Enhancements / 功能增强：**
- Setting collection now includes Mermaid diagrams and consistency checks / 设定集新增 Mermaid 关系图和一致性检查
- Dashboard now shows MD parse errors and appearance consistency issues / 仪表盘新增 MD 解析错误和出场一致性检查
- One-click fix for missing first appearances / 一键补全缺失的首次出场

**Bug Fixes / 问题修复：**
- Fixed MD parsing for `* ` list items / 修复 `* ` 列表项的 MD 解析
- Fixed bidirectional relationship sync / 修复关系双向同步
- Fixed relationship deletion cascade / 修复关系删除联动清理

---

## License / 开源协议

MIT License

---

**If this plugin helps you, give it a ⭐ on GitHub! / 如果这个插件对你有帮助，给个 ⭐ 支持一下吧！**
