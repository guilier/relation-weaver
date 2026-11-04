# Relation Weaver · 人物关系谱系

**A local-first story planning and worldbuilding workspace for Obsidian.**  
**一款面向小说创作、跑团与世界观构建的 Obsidian 本地创作工作台。**

[中文](#中文说明) · [English](#english) · [版本演进](#版本演进与功能对照--feature-evolution) · [安装](#安装--installation) · [隐私与数据安全](#隐私与数据安全--privacy--data-safety)

<p align="center">
  <strong>Characters · Relationships · Factions · Timeline · Plot Threads · Story Audit · Worldbuilding · Outlines</strong>
</p>

- **Plugin ID:** `relation-weaver`
- **Current version:** `3.15.10`
- **Latest release / 最新版本下载:** <a href="https://github.com/guilier/relation-weaver/releases/latest"><img src="https://img.shields.io/badge/Download-v3.15.9-2ea44f?logo=github&logoColor=white" alt="Download v3.15.9"></a>
- **Author:** [guilier](https://github.com/guilier)
- **Repository:** https://github.com/guilier/relation-weaver
- **License:** [MIT](./LICENSE)
- **Minimum Obsidian version declared:** `1.4.0`（请阅读下方兼容性说明）

---

## 中文说明

### 这是什么？

**人物关系谱系（Relation Weaver）** 是一个运行在 Obsidian 内部的小说创作辅助插件。它把人物档案、人物关系、阵营与组织、时间线、情节线 / 伏笔、故事逻辑检查、世界观资料和故事大纲整合到一个工作台中。

它适合需要长期维护复杂人物群像、跨章节时间线、阵营关系和世界设定的小说作者，也可用于跑团资料、原创世界观、系列故事和角色设定管理。

插件以当前 Vault 为工作空间，尽量沿用 Markdown 文件，让设定可以被 Obsidian 搜索、链接、备份和同步。它不是在线写作平台，也不要求注册账号。

### 功能地图

| 模块 | 能做什么 | 适用场景 |
|---|---|---|
| **创作工作台 / Dashboard** | 首页汇总人物、事件、关系、阵营数据；按"人物与关系 / 故事结构 / 世界设定与校验 / 分析辅助"分区提供卡片入口与实时统计 | 打开插件后快速了解项目状态并进入模块 |
| **人物档案 / Characters** | 以 Markdown 人物档案为基础管理姓名、身份、阵营、出生、首次出场、死亡等字段；支持自定义字段、别名搜索、类型/状态筛选、分组折叠与人物工作台快捷操作 | 管理主角团、配角、历史人物与群像 |
| **人物关系 / Relationships** | 创建和编辑人物双方关系、关系类型、亲密度；记录关系变化历史并绘制亲密度演化曲线；支持关系快速编辑、上下文操作、双方互换 | 追踪亲属、盟友、师徒、敌对、感情等关系 |
| **阵营 / Factions** | 管理阵营资料，并将阵营信息与人物、关系及时间线视图关联 | 管理国家、组织、宗门、家族、派系 |
| **组织关系 / Org Relations** | 联盟/敌对/附属/从属/中立/竞争六类组织关系，带起止时间；按当前写作进度自动分类为当前 / 历史 / 待生效 / 待确认 | 处理势力之间的长期博弈与变化 |
| **人物任职履历 / Membership History** | 加入/任职/晋升/调任/退出/被逐/叛变/投诚/组织解散等履历；人物当前阵营由当前有效履历自动计算；删除阵营时历史履历保留并标记"组织解散" | 追踪角色在不同时期的所属与职位 |
| **关系图谱 / Relationship Graph** | 可缩放（40%–320%）、拖拽、滚轮缩放、适应视图；搜索定位、关系类型筛选、人物聚焦；HTML 常驻姓名层；按阵营着色；可选同步到 Obsidian 原生图谱（自动同步默认关闭） | 查看人物网络、核心角色和关系结构 |
| **亲密度历史 / Intimacy History** | 记录人物关系亲密度变化，按故事时间绘制曲线，支持点击跳转事件、删除单条记录后自动回算当前值 | 追踪角色感情、信任或关系进展 |
| **故事时间线 / Timeline** | 按事件组织故事时间；支持事件标签、情节线状态、搜索与筛选、人物速查弹窗、时间点概览、当前时间过滤、阵营颜色同步和长正文自适应折叠 | 整理跨章节事件、战争进程、角色经历 |
| **古代纪年 / BCE & CE Dating** | 识别公元前 / 公元后日期；公元前年份按历史时间顺序比较；支持自动或指定纪年方式 | 古代、架空历史和跨纪元故事 |
| **人物生命周期 / Character Lifecycle** | 结合出生、首次出场、死亡字段查看人物时间节点 | 检查角色年龄与出场阶段 |
| **伏笔与情节线 / Plot Threads** | 情节线卡片覆盖埋设 / 推进 / 升级 / 假回收 / 并入 / 回收 / 搁置；逻辑校验提示回收早于埋设、回收后再推进、状态回退、情节线名称近似；情节线轨道视图 | 管理悬念、线索、支线和长期回收点 |
| **章节情况 / Chapter Dashboard** | 打开一篇正文 Markdown 后自动汇总本章关联事件、涉及人物、涉及阵营、相关伏笔与本章大纲实时预览 | 写作时对照本章剧情与设定 |
| **故事逻辑体检 / Story Audit** | 规则检查首次出场、出生前出场、死亡后出场、年龄线索、关系时间范围、伏笔状态、时间线顺序与重复事件；每条提醒可点击定位 | 章节调整或完稿前的结构审校 |
| **全局搜索 / Global Search** | 跨人物、关系、事件、情节线、阵营、组织关系、任职履历、世界观资料搜索；支持"字段名:关键词"检索与快捷编辑 | 快速定位设定，减少页面跳转 |
| **世界观工作室 / World Building Studio 2.0** | 动态分类、资料卡编辑、双向关联人物 / 阵营 / 地点、批量加抽签 / 移出抽签 / 移动分类 / 加标签 / 设字段 / 删除、Markdown 导入预览、JSON 备份恢复、搜索与扩展字段筛选 | 管理世界设定百科 |
| **灵感抽签 / Inspiration Draw** | 同时读取抽签池 Markdown 与资料库中已加入抽签的资料，按分类随机抽取，结果可复制 | 随机生成姓名、地点、道具、组织或灵感 |
| **故事大纲 / Story Outline** | 按章节 / 幕 / 情节段组织大纲；章节模板管理；大纲 ↔ 时间线事件双向关联；在插件中查看渲染内容并打开 Markdown 原文编辑 | 规划卷、章、幕和情节段落 |
| **设定集导出 / Compendium Export** | 汇总人物卡、关系表、Mermaid 关系图、未回收伏笔和一致性检查，生成可归档的设定集 | 项目归档、审阅或分享设定摘要 |
| **导入与智能合并 / Import & Merge** | 导入前预览新增、重复和冲突；按人物、事件、阵营及关系规则识别重复；默认保留现有冲突项；合并前自动创建快照，失败自动回滚 | 合并不同阶段或不同文件中的设定数据 |
| **快照与恢复 / Snapshots & Restore** | 创建数据快照、预览文件内容与差异、校验快照；恢复前先备份当前状态；恢复后逐文件回读校验，失败时尝试回滚 | 大规模修改前留档，必要时回退 |
| **撤销 / 重做 / Undo & Redo** | 关系域操作支持撤销栈（最多 50 步） | 误操作后的快速恢复 |
| **自定义资料路径 / Custom File Paths** | 为世界观资料库、抽签池和故事大纲设置 Vault 相对路径；路径失效时不自动重建同名文件，文件移动后尝试唯一同名文件定位 | 按个人 Vault 目录结构组织资料 |

> 数据保存层面还包含：关系数据独立保存、串行写入、原子替换、最近有效备份、损坏文件留档、写入校验、快照完整性校验和恢复回滚。这些能力贯穿多个模块，不在上表单列。

### 从 3.7.8 到 3.15.4：版本演进与功能对照

3.15.4 不是一次简单的界面换肤。它在 3.7.8 已完成的数据安全、导入合并、故事逻辑检查、时间线能力、工作台导航和世界观工具基础上，进一步把插件扩展为覆盖"人物 → 关系 → 章节 → 世界"的完整创作工作台。下表按能力维度归纳主要变化；原有核心资料管理仍是插件基础。

| 能力维度 | 3.7.8 | 3.15.4 |
|---|---|---|
| 定位与首页 | 统一首页与分组导航 | **创作工作台首页**：四大功能分区卡片 + 实时数据概览 + 工具箱 |
| 人物档案 | 人物工作台快捷操作、字段搜索 | **人物档案手风琴折叠**、类型 / 状态筛选、按分组折叠展开、人物档案编辑字段交互兜底 |
| 人物关系 | 关系变化历史 | **亲密度动态演化曲线**、关系类型变更与双方调整记录、记录删除后自动回算当前值 |
| 关系图谱 | 网络布局、核心人物突出、可选同步原生图谱 | **缩放 / 拖拽 / 滚轮 / 适应视图**、搜索定位、关系类型筛选、人物聚焦、**HTML 常驻姓名层** |
| 阵营与组织 | 阵营资料管理 | **组织关系（六类 + 起止时间）**、**人物任职履历**、按写作进度自动分类、阵营删除时履历保留 |
| 时间线 | 公元前 / 公元后纪年、当前时间过滤、时间点概览、事件搜索 | **长正文自适应折叠与展开**、故事内时间与章节定位分离、事件身份侧车注册表、人物速查浮窗 |
| 伏笔 | 情节线状态与未回收提示 | **情节线卡片 + 逻辑校验**、情节线轨道视图、**章节化故事设计（同一事件多方案）** |
| 章节 | 无独立章节视图 | **章节情况仪表盘**：关联事件 / 人物 / 阵营 / 伏笔 + 本章大纲实时预览 |
| 故事逻辑 | 规则体检 | **P2 故事逻辑体检**扩展：年龄与事件时间、关系时间范围、伏笔回收、时间线顺序与重复 |
| 世界观 | 分类设定卡 | **World Building Studio 2.0**：动态分类、双向关联、批量操作、Markdown 导入、JSON 备份恢复、搜索与扩展字段筛选 |
| 灵感与大纲 | 抽签池、章节 / 情节段大纲 | **资料库抽签联动**、章节模板管理、大纲 ↔ 时间线事件双向关联 |
| 数据保存 | 独立数据文件、安全写入、备份回退、快照校验与恢复前备份 | **原子替换 + .bak + 快照完整性校验 + 恢复回读校验 + 失败回滚 + 撤销/重做** |
| 导入 | 导入预览、重复识别、冲突处理、智能合并 | 保留并强化：**合并前自动快照，失败自动回滚** |
| 文件控制 | 世界观 / 抽签池 / 大纲可自定义路径 | 保留并强化：**路径失效不自动重建同名文件**，提示用户更新路径 |
| 界面与小屏 | 紧凑玻璃质感、浅深色适配、窄侧栏优化 | **统一设计令牌、响应式面板收窄、长文本不溢出、可折叠手风琴、焦点态与无障碍改进** |

**重要说明：** 表格概括的是版本演进重点，并不意味着 3.7.8 的所有能力都已被替换。3.15.4 延续人物、关系、阵营、时间线、世界观和大纲等原有核心工作流，并在其上增加新能力与保护措施。

### 数据安全设计

- 关系与阵营数据使用独立数据文件，避免与 Obsidian 插件设置文件混用。
- 保存采用串行队列和**原子替换流程**，并保留最近一次有效数据备份（`.bak`）。
- 检测到损坏数据时尝试从备份恢复，同时保留损坏文件供排查。
- 快照包含结构化索引和完整性校验（含文本哈希）；不完整或路径不可信的快照不会允许恢复。
- 恢复前会先创建当前状态快照；恢复后会逐文件回读校验，失败时尝试回滚。
- 删除重要关系、阵营、事件、组织关系、任职履历或历史记录时提供二次确认。
- 导入合并前会预览变更，并自动创建快照；失败时尝试回滚到导入前快照。
- 关系域操作支持撤销 / 重做（最多 50 步）。
- 图谱自动同步默认关闭；批量生成或同步节点笔记需要用户主动操作。

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
3. 在关系模块中选择已有的人物，创建关系类型和亲密度记录；随后可在关系卡片上记录变化并查看亲密度曲线。
4. 在时间线模块中添加事件，并按需要填写年份、事件标签、情节线状态和关联章节。
5. 在伏笔 / 故事逻辑检查模块查看未回收线索和规则提示。
6. 在世界观工作室、灵感抽签和故事大纲模块补充项目资料。
7. 打开正文 Markdown 时，切到"章节情况"查看本章关联剧情。
8. 大规模导入、批量修改或恢复前，先创建快照并备份 Vault。

### 文件与路径

插件的资料文件位于当前 Vault 中。部分默认文件名及路径如下（可在设置中调整的项目以插件设置为准）：

| 文件 / 目录 | 用途 |
|---|---|
| `data.json` | Obsidian 插件设置 |
| `relations-data.json` | 人物关系、阵营、组织关系与任职履历数据 |
| `relations-data.json.bak` | 最近一次有效关系数据备份 |
| `intimacy_history.json` | 亲密度变化历史 |
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

- 年龄检查需要人物出生年份，并且事件文本明确出现"18岁"等年龄表达。
- 关系时间检查需要填写关系开始 / 结束时间。
- 首次出场检查依赖人物字段和时间线中的 `[出场]` 事件标记。
- 时间线顺序提示可能把倒叙、插叙识别为疑似顺序问题；作者应结合叙事意图判断。
- 伏笔提示依据情节线状态与记录节点，不能自动判断文学意义上的伏笔是否真正回收。

所有检查结果都是提示，不会自动替作者修改人物、关系或事件数据。

### 安装与升级

#### 从 Obsidian 社区插件市场安装

> 状态说明：若插件已上架社区目录，请使用下方步骤；若尚未上架，请使用"手动安装"。

1. 打开 **设置 → 第三方插件 → 浏览**。
2. 搜索 **Relation Weaver**。
3. 安装并启用。

#### 手动安装

1. 从 [GitHub Releases](https://github.com/guilier/relation-weaver/releases) 下载对应版本的 `main.js`、`manifest.json` 和 `styles.css`。
2. 在当前 Vault 的 `.obsidian/plugins/` 下创建或打开 `relation-weaver/` 文件夹。
3. 将这三个文件放入该文件夹。
4. 在 Obsidian 设置 → 第三方插件中启用插件；升级时可关闭后重新启用，必要时重启 Obsidian。

插件版本以 `manifest.json` 和 GitHub Releases 为准；README 中的版本号仅作当前文档快照。

#### 从 3.7.8 升级到 3.15.4

升级前请备份：

- `.obsidian/plugins/relation-weaver/` 插件目录，包括 `data.json`；
- 人物档案、时间线、关系与阵营数据文件，包括 `relations-data.json` 和 `relations-data.json.bak`；
- 亲密度历史、世界观资料库、抽签池、故事大纲和设定快照；
- 你在设置中自定义的资料文件路径下的所有相关 Markdown / JSON 文件；
- 如果你曾启用图谱同步，相关图谱节点笔记也应一并备份。

3.15.4 的重要变化：

- 关系图谱支持缩放、拖拽、搜索定位与关系类型筛选；节点姓名改用独立 HTML 顶层图层常驻显示。
- 新增组织关系与人物任职履历；人物当前阵营可由任职履历与当前写作进度自动计算。
- 新增章节情况仪表盘与故事大纲章节化关联。
- 新增 P2 故事逻辑体检，覆盖年龄与事件时间、关系时间范围、伏笔回收与时间线顺序。
- 世界观工作室升级为 2.0：动态分类、双向关联、批量操作、Markdown 导入、JSON 备份恢复。
- 关系数据写入改为原子替换流程，并保留 `.bak` 备份；关系域操作支持撤销 / 重做。
- 路径失效时不自动重建同名文件；文件移动后仅在 Vault 中找到唯一同名 Markdown 文件时才自动重新定位。
- 图谱自动同步默认关闭；批量生成或同步节点笔记需要用户主动操作。

从 3.7.8 升级无需迁移脚本：旧关系数据、人物索引、时间线 Markdown、世界观资料、抽签池和大纲均可直接读取。旧版 `data.json` 中的关系数据会在首次加载时自动迁移到独立文件。

### 兼容性与已知限制

- Manifest 当前声明 `minAppVersion: 1.4.0`、`isDesktopOnly: false`。这表示清单声明的最低版本和平台标记，不等同于已经在所有 Obsidian 桌面端、移动端及主题组合中完成验证。
- 界面已针对窄侧栏和笔记本布局做优化，但这不等于声明完整移动端支持；移动端体验仍建议先在 Vault 副本中验证。
- 发布前已进行 JavaScript 静态语法检查；静态检查不能替代真实 Obsidian Vault 的端到端测试。
- 建议首次升级先在 Vault 副本中验证导入、保存、快照恢复、图谱同步、章节情况与自定义路径。
- 大型 Vault、第三方同步工具、特殊文件系统行为及自定义主题可能影响实际体验。

### 反馈与问题

请通过 [GitHub Issues](https://github.com/guilier/relation-weaver/issues) 提交问题或功能建议。反馈时请说明 Obsidian 版本、操作系统、插件版本和复现步骤。

请勿上传包含私人小说正文或个人资料的 Vault 文件，也不要上传 `relations-data.json`、`data.json`、`intimacy_history.json`、快照文件或备份文件。

---

## English

### What is Relation Weaver?

**Relation Weaver** is a local-first Obsidian plugin for novel planning, tabletop campaign management, and fictional-world development. It brings character profiles, relationships, factions and organizations, timelines, plot threads, rule-based story checks, worldbuilding notes, and story outlines into one workspace.

It is designed for writers who need to maintain large casts, interconnected character arcs, long-running timelines, faction structures, and extensive world lore. Project data stays in your current Obsidian vault and can be managed as Markdown or local data files.

### Feature overview

| Area | Features |
|---|---|
| **Dashboard** | A creative workspace home with project statistics, grouped module navigation across characters & relationships, story structure, world & audit, and analysis, plus quick links and a toolbox. |
| **Characters** | Markdown-based character profiles with configurable fields, aliases, faction, birth, first appearance, and death information. Type/status filters, grouped collapsible lists, and contextual character actions. |
| **Relationships** | Create and edit character-to-character relationships, relationship types, intimacy values, and relationship change history. Includes an intimacy evolution curve, type-change and pair-adjustment records, and endpoint swapping. |
| **Factions** | Manage factions and connect faction information with character and timeline views. |
| **Org Relations** | Six organization-relationship types (alliance, hostile, subordinate, vassal, neutral, rival) with start/end times, auto-classified as current / historical / future / unconfirmed by the current writing progress. |
| **Membership History** | Character membership history (join, serve, promote, transfer, leave, expelled, defect, surrender, dissolved). A character's current faction is derived from active memberships; deleting a faction preserves history as "dissolved". |
| **Relationship Graph** | Zoomable (40%–320%), draggable, wheel-zoom, fit-to-view character network. Search-to-locate, relation-type filter, focus mode, faction-colored nodes, an always-on HTML name layer, and optional sync to Obsidian's native graph (auto-sync off by default). |
| **Intimacy History** | Track changes in relationship intimacy over time with a story-time-ordered curve, click-to-jump to events, and recalculation after deleting a record. |
| **Timeline** | Organize events by date, search and filter events, use event labels and plot-line states, inspect timeline points and character references, filter by current time, sync faction colors, and display adaptive event text with long-text collapsing. |
| **BCE / CE Dating** | Parse BCE and CE dates and compare BCE years in historical chronological order. Useful for ancient and historical fiction. |
| **Character Lifecycle** | Review birth, first-appearance, and death milestones using character profile fields. |
| **Plot Threads** | Plot-line cards covering plant / advance / escalate / fake-resolve / merge / resolve / shelve, logic validation (resolve before plant, advance after resolve, status regression, near-duplicate names), and a plot-track view. |
| **Chapter Dashboard** | With a chapter Markdown open, automatically aggregates linked events, characters, factions, and plot threads, plus a live outline preview for the chapter. |
| **Story Audit** | Rule-based checks for first appearances, appearances before birth or after death, explicit age clues, relationship date ranges, plot-thread states, timeline ordering, and duplicate events. Every warning is clickable. |
| **Global Search** | Search characters, relationships, events, plot threads, factions, org relations, membership history, and worldbuilding records; supports field-qualified queries and contextual editing actions. |
| **World Building Studio 2.0** | Dynamic categories, record editing, bidirectional links to characters / factions / locations, batch draw/move/tag/field/delete operations, Markdown import with preview, JSON backup/restore, search and extended-field filters. |
| **Inspiration Draw** | Randomly draw entries from user-maintained, category-based local Markdown pools plus draw-enabled worldbuilding records. Copy the result into your notes. |
| **Story Outline** | Organize outlines by chapters, acts, or story sections. Chapter templates, outline ↔ timeline event linking, rendered preview in-plugin, and one-click open of the source Markdown. |
| **Compendium Export** | Generate a reference document containing character profiles, relationship tables, a Mermaid relationship diagram, unresolved plot threads, and consistency notes. |
| **Import & Merge** | Preview additions, duplicates, and conflicts before merging. Detect duplicates by character, event, faction, and relationship rules. Existing conflicting data is preserved by default; a snapshot is created before applying the merge, with automatic rollback on failure. |
| **Snapshots & Restore** | Create snapshots, preview saved content and differences, verify snapshot integrity (including text hashes), restore with a pre-restore backup, and verify after restore with rollback attempts on failure. |
| **Undo / Redo** | Relation-domain operations support an undo stack (up to 50 steps). |
| **Custom File Paths** | Configure vault-relative paths for the worldbuilding library, inspiration pool, and story outline. The plugin does not recreate a missing file at the old path; it can relocate a moved file when exactly one matching Markdown filename is found. |

> Persistence-level capabilities also include separate relationship data storage, serialized writes, atomic replacement, recent valid backup, corruption preservation, write verification, snapshot integrity checks, and restore rollback. These span multiple modules and are not listed as a separate row above.

### Version evolution: 3.7.8 to 3.15.4

Version 3.15.4 builds on the character, relationship, faction, timeline, and worldbuilding workflows established in 3.7.8. It extends the plugin into a full writing workspace spanning characters, relationships, chapters, and the wider world.

| Area | 3.7.8 | 3.15.4 |
|---|---|---|
| Positioning & home | Unified workspace home with grouped navigation | **Creative workspace home**: four grouped zones, live stats, and a toolbox |
| Character dossiers | Contextual character actions, field-aware search | **Collapsible dossier accordions**, type/status filters, grouped expand/collapse, input-interaction hardening |
| Relationships | Relationship change history | **Intimacy evolution curve**, type-change and pair-adjustment records, automatic recalculation after record deletion |
| Relationship graph | Network layout, core-character emphasis, optional native-graph sync | **Zoom / pan / wheel / fit-to-view**, search-to-locate, relation-type filter, focus mode, **always-on HTML name layer** |
| Factions & orgs | Faction records | **Org relations (six types + start/end times)**, **character membership history**, auto-classification by writing progress, history preserved when a faction is deleted |
| Timeline | BCE/CE dating, current-time filter, timeline overview, event search | **Adaptive long-text collapsing/expanding**, in-story time separated from chapter anchoring, event-identity sidecar registry, character lookup float panel |
| Plot threads | Plot-line states and unresolved-thread hints | **Plot cards + logic validation**, plot-track view, **chapter-scoped story designs (multiple plans per event)** |
| Chapters | No dedicated chapter view | **Chapter dashboard**: linked events / characters / factions / plot threads plus a live chapter outline preview |
| Story audit | Rule-based audit | **Extended P2 story audit**: age vs. event time, relationship date ranges, plot-thread resolution, timeline ordering, and duplicate events |
| Worldbuilding | Categorized records | **World Building Studio 2.0**: dynamic categories, bidirectional links, batch operations, Markdown import, JSON backup/restore, search and extended-field filters |
| Inspiration & outline | Inspiration pool, chapter/section outline | **Worldbuilding-draw linkage**, chapter template manager, outline ↔ timeline event linking |
| Data persistence | Separate data files, safe writes, backup fallback, snapshot checks and pre-restore backup | **Atomic replacement + .bak + snapshot integrity checks + post-restore verification + rollback + undo/redo** |
| Import | Import preview, duplicate detection, conflict handling, smart merge | Retained and strengthened: **automatic pre-merge snapshot, automatic rollback on failure** |
| File management | Configurable paths for worldbuilding / inspiration / outline | Retained and strengthened: **missing files are not recreated at the old path**; the plugin prompts the user to update the path |
| Interface & narrow panes | Compact refined UI, light/dark adaptation, narrow-pane optimization | **Unified design tokens, responsive panel narrowing, long-text overflow prevention, collapsible accordions, focus states and accessibility improvements** |

This table summarizes the major development milestones; it does not imply that every feature from 3.7.8 was replaced. The original character, relationship, faction, timeline, worldbuilding, and outline workflows remain the foundation.

### Privacy and local-first design

- No cloud AI integration, API key, or external account is required.
- Character, relationship, timeline, worldbuilding, and outline data are processed within the current Obsidian vault.
- The plugin does not use a remote server as a storage or analysis service.
- The plugin reads and writes local Markdown, JSON, and snapshot files as required by its features.

Do not commit private vault data, story drafts, backups, or snapshots to a public repository.

### Data safety

Relation Weaver includes serialized relationship-data writes, atomic file replacement, backup fallback, corruption preservation, snapshot integrity checks (including text hashes), pre-restore backups, post-restore verification, rollback attempts, and confirmation steps for destructive actions. Import merging also previews changes, creates a snapshot before applying them, and attempts to roll back on failure. Relation-domain operations support undo/redo.

These safeguards reduce accidental data loss but are **not a substitute for backing up your entire vault**. Keep an independent backup of your vault before major imports, migrations, or restores.

### Quick start

1. Install and enable Relation Weaver in Obsidian.
2. Open the Relation Weaver workspace.
3. Create or connect Markdown character profiles and fill in relevant fields such as faction, birth, first appearance, and death.
4. Add relationships between existing characters, then record intimacy changes and review the intimacy curve.
5. Add timeline events with dates, labels, plot-thread states, and chapter links.
6. Review plot threads and the Story Audit results.
7. Add worldbuilding entries, configure an inspiration pool, and organize your story outline.
8. With a chapter Markdown open, switch to the Chapter Dashboard to review linked events, characters, factions, and plot threads.
9. Create a snapshot and back up your vault before large imports or structural changes.

### Local files

The plugin stores data in the current vault. Default names may include:

| File / folder | Purpose |
|---|---|
| `data.json` | Obsidian plugin settings |
| `relations-data.json` | Relationship, faction, org-relation, and membership data |
| `relations-data.json.bak` | Previous valid relationship-data backup |
| `intimacy_history.json` | Intimacy change history |
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

- Age checks require a parseable birth year and an explicit age expression in an event (for example, "18 years old").
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

### Upgrade notes: 3.7.8 → 3.15.4

- The relationship graph now supports zoom, pan, search-to-locate, and relation-type filtering; node names use a dedicated top-layer HTML name layer that stays visible across zoom levels and themes.
- Organization relations and character membership history are now available; a character's current faction can be derived from active memberships and the current writing progress.
- A Chapter Dashboard and chapter-scoped outline linking have been added.
- A P2 Story Audit covers age vs. event time, relationship date ranges, plot-thread resolution, and timeline ordering.
- World Building Studio has been upgraded to 2.0: dynamic categories, bidirectional links, batch operations, Markdown import, and JSON backup/restore.
- Relationship data writes now use atomic replacement with a `.bak` backup; relation-domain operations support undo/redo.
- Missing files are no longer created automatically at the old path. When a file has moved, automatic relocation occurs only if exactly one Markdown file with the same name is found.
- Automatic graph synchronization is off by default. Use the explicit graph synchronization action when you want node notes.

Upgrading from 3.7.8 needs no migration script: existing relationship data, character index, timeline Markdown, worldbuilding library, inspiration pool, and outline all load as-is. Legacy relationship data in the old `data.json` is auto-migrated to a dedicated file on first load.

Before upgrading, back up the plugin folder (including `data.json`), all related Markdown / JSON files (including `relations-data.json`, `relations-data.json.bak`, and `intimacy_history.json`), files stored at custom paths, and any graph node notes generated by previous graph synchronization.

### Compatibility and testing

The current manifest declares `minAppVersion: 1.4.0` and `isDesktopOnly: false`. These are manifest declarations, not a guarantee that every desktop/mobile device, theme, or sync setup has been tested.

The interface has been optimized for narrow panes and laptop layouts, but this does not constitute a full mobile-support claim. Test on mobile in a copy of your vault first.

JavaScript syntax checks do not replace end-to-end testing inside Obsidian. Test the plugin in a copy of your vault first, especially import, save, snapshot restore, graph synchronization, the Chapter Dashboard, and custom file paths.

### Support

Please report bugs and feature requests through [GitHub Issues](https://github.com/guilier/relation-weaver/issues). Include your Obsidian version, operating system, plugin version, and reproduction steps.

Do not attach private story drafts, your full vault, `relations-data.json`, `data.json`, `intimacy_history.json`, snapshot files, or backup files.

---

## Development

- `main.js` — bundled Obsidian plugin entry point.
- `styles.css` — plugin styles.
- `manifest.json` — Obsidian plugin manifest.
- `modules/` — maintainable local source modules used for development and testing; runtime logic required by the current build is bundled into `main.js`.

Build instructions: see the `scripts` section of `
