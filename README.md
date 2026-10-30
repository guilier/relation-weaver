# Relation Weaver · 人物关系谱系

**A local-first story planning and worldbuilding workspace for Obsidian.**  
**一款面向小说创作、跑团与世界观构建的 Obsidian 本地创作工作台。**

[中文](#中文说明) · [English](#english) · [功能对照](#版本演进与功能对照--feature-evolution) · [安装](#安装--installation) · [隐私与数据安全](#隐私与数据安全--privacy--data-safety)

<p align="center">
  <strong>Characters · Relationships · Factions · Timeline · Plot Threads · Story Audit · Worldbuilding · Outlines</strong>
</p>

- **Plugin ID:** `relation-weaver`
- **Current version:** `3.7.8`
- **Latest release / 最新版本下载:** [GitHub Releases · v3.7.8](https://github.com/guilier/relation-weaver/releases/latest)
- **Author:** [guilier](https://github.com/guilier)
- **Repository:** https://github.com/guilier/relation-weaver
- **License:** [MIT](./LICENSE)
- **Minimum Obsidian version declared:** `1.4.0`（请阅读下方兼容性说明）

---

## 中文说明

### 这是什么？

**人物关系谱系（Relation Weaver）** 是一个运行在 Obsidian 内部的小说创作辅助插件。它把人物档案、人物关系、阵营、时间线、情节线 / 伏笔、故事逻辑检查、世界观资料和故事大纲整合到一个工作台中。

它适合需要长期维护复杂人物群像、跨章节时间线、阵营关系和世界设定的小说作者，也可用于跑团资料、原创世界观、系列故事和角色设定管理。

插件以当前 Vault 为工作空间，尽量沿用 Markdown 文件，让设定可以被 Obsidian 搜索、链接、备份和同步。它不是在线写作平台，也不要求注册账号。

### 功能地图

| 模块 | 能做什么 | 适用场景 |
|---|---|---|
| **创作工作台 / Dashboard** | 汇总人物、事件、关系、阵营等数据；提供项目统计卡片、最近活动、模块分类导航和快捷跳转 | 打开插件后快速了解项目状态 |
| **人物档案 / Characters** | 以 Markdown 人物档案为基础管理姓名、身份、阵营、出生、首次出场、死亡等字段；支持自定义字段、别名搜索和人物工作台快捷操作 | 管理主角团、配角、历史人物与群像 |
| **人物关系 / Relationships** | 创建和编辑人物双方关系、关系类型、亲密度；记录关系变化历史，支持关系快速编辑、上下文操作和双方互换 | 追踪亲属、盟友、师徒、敌对、感情等关系 |
| **阵营 / Factions** | 管理阵营资料，并将阵营信息与人物、关系及时间线视图关联 | 管理国家、组织、宗门、家族、派系 |
| **关系图谱 / Relationship Graph** | 将人物关系呈现为网络图；布局突出关系较多的人物；支持节点交互，并可由用户选择同步到 Obsidian 原生图谱；自动同步默认关闭，需要手动触发 | 查看人物网络、核心角色和关系结构 |
| **亲密度历史 / Intimacy History** | 记录人物关系亲密度变化，查看变化轨迹 | 追踪角色感情、信任或关系进展 |
| **故事时间线 / Timeline** | 按事件组织故事时间；支持事件标签、情节线状态、搜索与筛选、人物速查、时间点概览、当前时间过滤、阵营颜色同步和自适应正文展示 | 整理跨章节事件、战争进程、角色经历 |
| **古代纪年 / BCE & CE Dating** | 识别公元前 / 公元后日期；公元前年份按历史时间顺序比较；支持自动或指定纪年方式 | 古代、架空历史和跨纪元故事 |
| **人物生命周期 / Character Lifecycle** | 结合出生、首次出场、死亡字段查看人物时间节点 | 检查角色年龄与出场阶段 |
| **伏笔与情节线 / Plot Threads** | 记录情节线状态，查看埋设、推进和回收情况，并提示未完成的伏笔 | 管理悬念、线索、支线和长期回收点 |
| **故事逻辑体检 / Story Audit** | 检查首次出场、出生前出场、死亡后出场、年龄线索、关系时间范围、伏笔状态和时间线顺序等潜在问题 | 在章节调整或完稿前进行结构审校 |
| **全局搜索 / Global Search** | 跨人物、关系、事件、情节线和阵营搜索；支持字段筛选与快捷编辑 | 快速定位设定，减少页面跳转 |
| **世界观资料库 / Worldbuilding Library** | 分类新增、搜索、编辑和删除设定卡，涵盖道具、地点、组织、功法、种族历史和世界规则 | 管理世界设定百科 |
| **灵感抽签 / Inspiration Draw** | 从本地 Markdown 抽签池按分类随机抽取候选项，结果可复制 | 随机生成姓名、地点、道具、组织或灵感 |
| **故事大纲 / Story Outline** | 按章节或情节段组织大纲，在插件中查看并打开 Markdown 原文编辑 | 规划卷、章、幕和情节段落 |
| **设定集导出 / Compendium Export** | 汇总人物卡、关系表、Mermaid 关系图、未回收伏笔和一致性检查，生成可归档的设定集 | 项目归档、审阅或分享设定摘要 |
| **导入与智能合并 / Import & Merge** | 导入前预览新增、重复和冲突；按人物、事件、阵营及关系规则识别重复；默认保留现有冲突项；合并前自动创建快照 | 合并不同阶段或不同文件中的设定数据 |
| **快照与恢复 / Snapshots & Restore** | 创建数据快照、预览文件内容与差异、校验快照；恢复前先备份当前状态；恢复后回读校验，失败时尝试回滚 | 大规模修改前留档，必要时回退 |
| **自定义资料路径 / Custom File Paths** | 为世界观资料库、抽签池和故事大纲设置 Vault 相对路径；文件移动后可尝试唯一同名文件定位 | 按个人 Vault 目录结构组织资料 |

> 数据保存层面还包含：关系数据独立保存、串行写入、安全写入、最近有效备份、损坏文件留档和写入校验。这些能力贯穿多个模块，不在上表单列。

### 从 3.3.3 到 3.7.8：版本演进与功能对照

3.7.8 不是一次简单的界面换肤，而是在原有人物、关系和故事资料管理基础上，逐步补上数据安全、导入合并、故事逻辑检查、时间线能力、工作台导航和世界观工具。下表按项目版本记录归纳主要变化；原有核心资料管理仍是插件基础。

| 能力维度 | 3.3.x 基线 | 3.7.8 当前版本 |
|---|---|---|
| 人物与关系管理 | 已有的人物、关系和阵营资料管理 | 保留原有管理，并增加人物工作台快捷操作、关系快速编辑、上下文操作、双方互换、关系变化历史与字段搜索 |
| 数据保存 | 早期数据保存与关系数据耦合，缺少完整的恢复工作流 | 关系数据独立保存、串行写入、备份回退、损坏留档、写入校验、快照校验与恢复前备份 |
| 导入 | 基础数据导入 | 导入预览、重复识别、冲突处理、智能合并；合并前自动创建快照 |
| 搜索 | 基础查找 | 跨人物、关系、事件、情节线、阵营搜索；字段筛选和快捷编辑 |
| 故事逻辑 | 主要依赖作者人工检查 | 新增规则辅助体检，检查出场、出生 / 死亡、年龄线索、关系时间、伏笔与时间线问题 |
| 时间线 | 基础事件时间线 | 公元前 / 公元后纪年、当前时间过滤、时间点概览、事件搜索、阵营颜色同步与自适应正文展示 |
| 人物关系可视化 | 以关系资料管理为主 | 关系网络布局、核心人物突出、可选同步 Obsidian 原生图谱；自动同步默认关闭 |
| 创作工作台 | 以功能页面和侧栏操作为主 | 统一首页、分类导航、数据统计卡片、模块快捷跳转 |
| 世界观资料 | 以文本设定为主 | 分类设定卡，可搜索、编辑和删除；支持自定义资料文件路径 |
| 灵感与大纲 | 无独立互动工作台 | Markdown 抽签池、分类随机抽取、章节 / 情节段大纲工作台 |
| 文件控制 | 部分资料使用固定默认位置 | 世界观、抽签池和大纲文件可自定义路径；移动后尝试定位；缺失文件由用户明确创建 |
| 图谱笔记生成 | 可通过同步功能生成节点笔记 | 节点笔记不再默认批量生成；必须由用户主动执行同步 |
| 界面与小屏 | 早期布局 | 紧凑玻璃质感界面、浅色 / 深色主题适配、窄侧栏与笔记本布局优化 |

**重要说明：** 表格概括的是版本演进重点，并不意味着 3.3.x 的所有能力都已被替换。3.7.8 延续人物、关系、阵营和时间线等原有核心工作流，并在其上增加新能力与保护措施。

### 数据安全设计

- 关系与阵营数据使用独立数据文件，避免与 Obsidian 插件设置文件混用。
- 保存采用串行队列和安全写入流程，并保留最近一次有效数据备份。
- 检测到损坏数据时尝试从备份恢复，同时保留损坏文件供排查。
- 快照包含结构化索引和完整性校验；不完整或路径不可信的快照不会允许恢复。
- 恢复前会先创建当前状态快照；恢复后会回读校验，失败时尝试回滚。
- 删除重要关系、阵营、事件或历史记录时提供二次确认。
- 导入合并前会预览变更，并自动创建快照。
- 3.7.8 中图谱自动同步默认关闭；批量生成或同步节点笔记需要用户主动操作。

这些保护措施用于降低误覆盖和误删除风险，但**不能替代 Vault 的独立备份**。建议使用 Git、系统备份或 Obsidian Sync 等方式另行备份整个 Vault。

### 隐私与本地处理

- 不集成云端 AI，不需要 API Key，也不要求注册插件外部账号。
- 小说人物、关系、时间线、世界观和大纲资料在当前 Obsidian Vault 内处理。
- 插件不以远程服务器作为资料存储或分析服务。
- 插件会按功能需要在 Vault 中读写 Markdown、JSON 和快照文件；用户可以在设置中指定部分资料文件的位置。

请勿将包含个人创作内容的 Vault 数据文件、备份或快照提交到公开 GitHub 仓库。

### 快速开始

1. 在 Obsidian 中启用插件并打开 **Relation Weaver / 人物关系谱系**。
2. 进入人物模块，创建或连接人物 Markdown 档案；按需要填写姓名、身份、阵营、出生、首次出场和死亡等字段。
3. 在关系模块中选择已有的人物，创建关系类型和亲密度记录。
4. 在时间线模块中添加事件，并按需要填写年份、事件标签和情节线状态。
5. 在伏笔 / 故事逻辑检查模块查看未回收线索和规则提示。
6. 在世界观资料库、灵感抽签和故事大纲模块补充项目资料。
7. 大规模导入、批量修改或恢复前，先创建快照并备份 Vault。

### 文件与路径

插件的资料文件位于当前 Vault 中。部分默认文件名及路径如下（可在设置中调整的项目以插件设置为准）：

| 文件 / 目录 | 用途 |
|---|---|
| `data.json` | Obsidian 插件设置 |
| `relations-data.json` | 人物关系与阵营数据 |
| `relations-data.json.bak` | 最近一次有效关系数据备份 |
| `时间线.md` | 时间线事件资料（使用当前设置的路径） |
| `世界观资料库.md` | 分类世界观资料库（可自定义路径） |
| `抽签池.md` | 灵感抽签候选池（可自定义路径） |
| `故事大纲.md` | 故事大纲（可自定义路径） |
| `设定快照/` | 数据快照与恢复索引 |

**抽签池格式示例：**

```markdown
## 姓名池
- 沈知微
- 顾长风

## 地点池
- 归云渡
- 白石城
```

**故事大纲格式示例：**

```markdown
## 第一卷：风起
章节核心目标、主要冲突与人物变化……

## 第二卷：入局
新的线索、阵营变化与阶段性转折……
```

插件支持的具体字段名称可在设置中调整。对于人物出生、首次出场、死亡和关系时间等自动检查，建议使用清晰、稳定且可解析的日期表达。

### 规则检查的边界

故事逻辑体检是**基于字段和明确文本线索的规则辅助检查**，不是能够理解整部小说语义的 AI 编辑器。例如：

- 年龄检查需要人物出生年份，并且事件文本明确出现“18岁”等年龄表达。
- 关系时间检查需要填写关系开始 / 结束时间。
- 首次出场检查依赖人物字段和时间线中的 `[出场]` 事件标记。
- 时间线顺序提示可能把倒叙、插叙识别为疑似顺序问题；作者应结合叙事意图判断。
- 伏笔提示依据情节线状态与记录节点，不能自动判断文学意义上的伏笔是否真正回收。

所有检查结果都是提示，不会自动替作者修改人物、关系或事件数据。

### 安装与升级

#### 从 Obsidian 社区插件市场安装

> 状态说明：若插件已上架社区目录，请使用下方步骤；若尚未上架，请使用“手动安装”。

1. 打开 **设置 → 第三方插件 → 浏览**。
2. 搜索 **Relation Weaver**。
3. 安装并启用。

#### 手动安装

1. 从 [GitHub Releases](https://github.com/guilier/relation-weaver/releases) 下载对应版本的 `main.js`、`manifest.json` 和 `styles.css`。
2. 在当前 Vault 的 `.obsidian/plugins/` 下创建或打开 `relation-weaver/` 文件夹。
3. 将这三个文件放入该文件夹。
4. 在 Obsidian 设置 → 第三方插件中启用插件；升级时可关闭后重新启用，必要时重启 Obsidian。

插件版本以 `manifest.json` 和 GitHub Releases 为准；README 中的版本号仅作当前文档快照。

#### 从旧版本升级

升级前请备份：

- `.obsidian/plugins/relation-weaver/` 插件目录，包括 `data.json`；
- 人物档案、时间线、关系与阵营数据文件，包括 `relations-data.json` 和 `relations-data.json.bak`；
- 亲密度历史、世界观资料库、抽签池、故事大纲和设定快照；
- 你在设置中自定义的资料文件路径下的所有相关 Markdown / JSON 文件；
- 如果你曾启用图谱同步，相关图谱节点笔记也应一并备份。

3.7.8 的重要行为变化：

- 世界观资料库、抽签池和故事大纲支持自定义 Vault 相对路径。
- 模块打开或刷新时不再自动创建缺失资料文件；需要时请通过明确的创建操作生成。
- 文件移动后，只有在 Vault 中找到唯一同名 Markdown 文件时才自动重新定位；多个同名候选需要用户手动指定。
- 人物图谱节点笔记默认不再自动批量生成；需要时由用户主动执行同步。
- 图谱自动同步默认关闭。请检查设置，不要假设旧版本的自动同步开关会继续生效。
- 不会主动删除已有文件，也不会批量迁移或覆盖人物、关系、阵营和时间线数据。

### 兼容性与已知限制

- Manifest 当前声明 `minAppVersion: 1.4.0`、`isDesktopOnly: false`。这表示清单声明的最低版本和平台标记，不等同于已经在所有 Obsidian 桌面端、移动端及主题组合中完成验证。
- 界面已针对窄侧栏和笔记本布局做优化，但这不等于声明完整移动端支持；移动端体验仍建议先在 Vault 副本中验证。
- 发布前已进行 JavaScript 静态语法检查；静态检查不能替代真实 Obsidian Vault 的端到端测试。
- 建议首次升级先在 Vault 副本中验证导入、保存、快照恢复、图谱同步和自定义路径。
- 大型 Vault、第三方同步工具、特殊文件系统行为及自定义主题可能影响实际体验。

### 反馈与问题

请通过 [GitHub Issues](https://github.com/guilier/relation-weaver/issues) 提交问题或功能建议。反馈时请说明 Obsidian 版本、操作系统、插件版本和复现步骤。

请勿上传包含私人小说正文或个人资料的 Vault 文件，也不要上传 `relations-data.json`、`data.json`、快照文件或备份文件。

---

## English

### What is Relation Weaver?

**Relation Weaver** is a local-first Obsidian plugin for novel planning, tabletop campaign management, and fictional-world development. It brings character profiles, relationships, factions, timelines, plot threads, rule-based story checks, worldbuilding notes, and story outlines into one workspace.

It is designed for writers who need to maintain large casts, interconnected character arcs, long-running timelines, faction structures, and extensive world lore. Project data stays in your current Obsidian vault and can be managed as Markdown or local data files.

### Feature overview

| Area | Features |
|---|---|
| **Dashboard** | A central creative workspace with project statistics, recent activity, module navigation, and quick links. |
| **Characters** | Markdown-based character profiles with configurable fields, aliases, faction, birth, first appearance, and death information. Includes contextual character actions. |
| **Relationships** | Create and edit character-to-character relationships, relationship types, intimacy values, and relationship change history. Swap relationship endpoints and edit records from contextual actions. |
| **Factions** | Manage factions and connect faction information with character and timeline views. |
| **Relationship Graph** | Visualize the character network, emphasize highly connected characters, interact with graph nodes, and optionally sync notes to Obsidian's native graph. Automatic sync is off by default and must be triggered manually. |
| **Intimacy History** | Track changes in relationship intimacy over time. |
| **Timeline** | Organize events by date, search and filter events, use event labels and plot-line states, inspect timeline points and character references, filter by current time, sync faction colors, and display adaptive event text. |
| **BCE / CE Dating** | Parse BCE and CE dates and compare BCE years in historical chronological order. Useful for ancient and historical fiction. |
| **Character Lifecycle** | Review birth, first-appearance, and death milestones using character profile fields. |
| **Plot Threads** | Track planted, developing, and resolved plot threads, and review unresolved hooks. |
| **Story Audit** | Rule-based checks for first appearances, appearances before birth or after death, explicit age clues, relationship date ranges, plot-thread states, and possible timeline ordering issues. |
| **Global Search** | Search characters, relationships, events, plot threads, and factions; use field filters and contextual editing actions. |
| **Worldbuilding Library** | Organize searchable editable entries for items, locations, organizations, abilities, species history, and world rules. |
| **Inspiration Draw** | Randomly draw entries from user-maintained, category-based local Markdown pools. Copy the result into your notes. |
| **Story Outline** | Organize outlines by chapters, acts, or story sections and open the source Markdown for editing in Obsidian. |
| **Compendium Export** | Generate a reference document containing character profiles, relationship tables, a Mermaid relationship diagram, unresolved plot threads, and consistency notes. |
| **Import & Merge** | Preview additions, duplicates, and conflicts before merging. Detect duplicates by character, event, faction, and relationship rules. Existing conflicting data is preserved by default; a snapshot is created before applying the merge. |
| **Snapshots & Restore** | Create snapshots, preview saved content and differences, verify snapshot integrity, restore with a pre-restore backup, and verify after restore with rollback attempts on failure. |
| **Custom File Paths** | Configure vault-relative paths for the worldbuilding library, inspiration pool, and story outline. The plugin can relocate a moved file when exactly one matching Markdown filename is found. |

> Persistence-level capabilities also include separate relationship data storage, serialized writes, safe replacement, recent valid backup, corruption preservation, and write verification. These span multiple modules and are not listed as a separate row above.

### Version evolution: 3.3.3 to 3.7.8

Version 3.7.8 builds on the original character, relationship, faction, and timeline workflows. The project has since added safer persistence, import preview and merging, story-logic checks, BCE/CE chronology, a redesigned workspace, and dedicated worldbuilding tools.

| Area | Early 3.3.x baseline | Version 3.7.8 |
|---|---|---|
| Character and relationship management | Core character, relationship, and faction records | Retains the core workflows; adds contextual character actions, faster relationship editing, endpoint swapping, change history, and field-aware search |
| Data persistence | Earlier data storage and fewer recovery safeguards | Separate relationship data, serialized writes, safe replacement, backups, corruption preservation, verified snapshots, and guarded restore |
| Import | Basic data import workflow | Import preview, duplicate detection, conflict handling, smart merge, and automatic pre-merge snapshots |
| Search | Basic lookup | Cross-module search across characters, relationships, events, plot threads, and factions, with field filters and quick actions |
| Story consistency | Primarily manual review | Rule-based checks for appearances, birth/death chronology, explicit age clues, relationship periods, plot threads, and timeline order |
| Timeline | Basic event timeline | BCE/CE chronology, current-time filtering, timeline overview, event search, faction-colored character names, and adaptive event text display |
| Relationship visualization | Relationship records as the primary view | Network layout and optional sync to the native Obsidian graph; automatic sync is off by default |
| Workspace | Earlier sidebar and module navigation | Unified creative dashboard, grouped navigation, statistics, and quick module access |
| Worldbuilding | Primarily text-based notes | Categorized, searchable, editable worldbuilding entries with configurable file paths |
| Inspiration and outline | No dedicated interactive workspace | Markdown-based random inspiration pool and chapter/section outline workspace |
| File management | Some fixed default file locations | Configurable vault-relative paths, cautious relocation of uniquely named files, and explicit file creation |
| Graph note generation | Graph sync could generate node notes | No default bulk generation; users explicitly trigger graph-note synchronization |
| Interface | Earlier layout | Compact refined UI, light/dark theme adaptation, and improved narrow-pane and laptop layouts |

This table summarizes the major development milestones; it does not imply that every feature from earlier releases was replaced. The original character, relationship, faction, and timeline workflows remain the foundation.

### Privacy and local-first design

- No cloud AI integration, API key, or external account is required.
- Character, relationship, timeline, worldbuilding, and outline data are processed within the current Obsidian vault.
- The plugin does not use a remote server as a storage or analysis service.
- The plugin reads and writes local Markdown, JSON, and snapshot files as required by its features.

Do not commit private vault data, story drafts, backups, or snapshots to a public repository.

### Data safety

Relation Weaver includes serialized relationship-data writes, safe file replacement, backup fallback, corruption preservation, snapshot integrity checks, pre-restore backups, post-restore verification, and confirmation steps for destructive actions. Import merging also previews changes and creates a snapshot before applying them.

These safeguards reduce accidental data loss but are **not a substitute for backing up your entire vault**. Keep an independent backup of your vault before major imports, migrations, or restores.

### Quick start

1. Install and enable Relation Weaver in Obsidian.
2. Open the Relation Weaver workspace.
3. Create or connect Markdown character profiles and fill in relevant fields such as faction, birth, first appearance, and death.
4. Add relationships between existing characters and optionally record intimacy changes.
5. Add timeline events with dates, labels, and plot-thread states.
6. Review plot threads and the Story Audit results.
7. Add worldbuilding entries, configure an inspiration pool, and organize your story outline.
8. Create a snapshot and back up your vault before large imports or structural changes.

### Local files

The plugin stores data in the current vault. Default names may include:

| File / folder | Purpose |
|---|---|
| `data.json` | Obsidian plugin settings |
| `relations-data.json` | Relationship and faction data |
| `relations-data.json.bak` | Previous valid relationship-data backup |
| `时间线.md` | Timeline events, using the configured path |
| `世界观资料库.md` | Categorized worldbuilding library; configurable path |
| `抽签池.md` | Inspiration draw pool; configurable path |
| `故事大纲.md` | Story outline; configurable path |
| `设定快照/` | Data snapshots and restore indexes |

The inspiration pool uses Markdown level-two headings for categories and bullet items for candidates:

```markdown
## Name Pool
- Shen Zhiwei
- Gu Changfeng

## Location Pool
- Guiyun Ferry
- Baishi City
```

The outline uses headings to organize chapters or story sections:

```markdown
## Volume 1: Rising Wind
Core chapter goals, main conflicts, and character changes...

## Volume 2: Entering the Game
New clues, faction changes, and turning points...
```

You can edit these files directly in Obsidian.

### Story Audit: scope and limitations

Story Audit is a **rule-based assistant, not an AI semantic editor**. It relies on structured profile fields and explicit text patterns:

- Age checks require a parseable birth year and an explicit age expression in an event (for example, “18 years old”).
- Relationship-period checks require start and/or end dates.
- First-appearance checks rely on the configured profile field and `[出场]` timeline events.
- Timeline-order warnings may flag flashbacks or non-linear storytelling; review them in context.
- Plot-thread checks use recorded statuses and milestones and cannot determine literary meaning automatically.

Results are read-only suggestions. The plugin does not automatically rewrite character, relationship, or event data based on audit findings.

### Installation

#### Community plugins

> Status note: if the plugin is already accepted into the Obsidian Community Plugins directory, use the steps below; otherwise use manual installation.

1. Open **Settings → Community plugins → Browse**.
2. Search for **Relation Weaver**.
3. Install and enable the plugin.

#### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from [GitHub Releases](https://github.com/guilier/relation-weaver/releases).
2. Place the three files in `<your-vault>/.obsidian/plugins/relation-weaver/`.
3. Enable the plugin in **Settings → Community plugins**. When upgrading, disable and re-enable it or restart Obsidian if needed.

The plugin version is defined by `manifest.json` and GitHub Releases; the version shown in this README is a documentation snapshot.

### Upgrade notes for 3.7.8

- The worldbuilding library, inspiration pool, and story outline now support custom vault-relative paths.
- Missing files are no longer created automatically when a module opens or refreshes. Use the explicit create-file action when needed.
- When a file has moved, automatic relocation occurs only if exactly one Markdown file with the same name is found. Multiple matches require manual path selection.
- Character graph node notes are no longer generated in bulk by default. Use the explicit graph synchronization action when you want them.
- Automatic graph synchronization is off by default. Review the setting instead of assuming an older preference remains enabled.
- Existing files are not proactively deleted, and character, relationship, faction, or timeline data is not bulk-migrated or overwritten by these changes.

Before upgrading, back up the plugin folder (including `data.json`), all related Markdown / JSON files (including `relations-data.json` and `relations-data.json.bak`), files stored at custom paths, and any graph node notes generated by previous graph synchronization.

### Compatibility and testing

The current manifest declares `minAppVersion: 1.4.0` and `isDesktopOnly: false`. These are manifest declarations, not a guarantee that every desktop/mobile device, theme, or sync setup has been tested.

The interface has been optimized for narrow panes and laptop layouts, but this does not constitute a full mobile-support claim. Test on mobile in a copy of your vault first.

JavaScript syntax checks do not replace end-to-end testing inside Obsidian. Test the plugin in a copy of your vault first, especially import, save, snapshot restore, graph synchronization, and custom file paths.

### Support

Please report bugs and feature requests through [GitHub Issues](https://github.com/guilier/relation-weaver/issues). Include your Obsidian version, operating system, plugin version, and reproduction steps.

Do not attach private story drafts, your full vault, `relations-data.json`, `data.json`, snapshot files, or backup files.

---

## Development

- `main.js` — bundled Obsidian plugin entry point.
- `styles.css` — plugin styles.
- `manifest.json` — Obsidian plugin manifest.
- `modules/` — maintainable local source modules used for development and testing; runtime logic required by the current build is bundled into `main.js`.

Build instructions: see the `scripts` section of `package.json` (for example, the project’s build/watch commands). If no build script is present, `main.js` is the distributed bundle and `modules/` is the maintainable source layout.

## License

MIT. See [LICENSE](./LICENSE).
