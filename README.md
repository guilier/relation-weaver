# Relation Weaver · 人物关系谱系

**A local creation workbench for Obsidian, built for novel writing, tabletop RPG campaigns, and worldbuilding.**

Characters · Relationships · Factions · Organizations · Positions · Territories · Timeline · Chapters · Foreshadowing · Story Logic Checks · Worldbuilding · Story Outline

- **Plugin ID:** `relation-weaver`
- **Current Version:** `3.68.6`
- **Author:** [guilier](https://github.com/guilier)
- **Repository:** https://github.com/guilier/relation-weaver
- **License:** MIT
- **Minimum Obsidian Version:** `1.4.0` (see compatibility notes at the end)

---

## 中文说明 / Chinese Notes

### 这是什么？ / What Is This?

**人物关系谱系（Relation Weaver）** 是一款运行在 Obsidian 内部的本地化小说创作管理插件。它将人物档案、人物关系、阵营与组织、职位任职、领地变迁、故事时间线、章节管理、伏笔与情节线、故事逻辑检查、世界观资料和故事大纲整合到一个可视化工作台中。

**Relation Weaver** is a localized novel-writing management plugin that runs entirely inside Obsidian. It integrates character profiles, character relationships, factions and organizations, position appointments, territory changes, story timelines, chapter management, foreshadowing and plotlines, story logic checks, worldbuilding materials, and story outlines into a single visual workbench.

它适合需要长期维护复杂人物群像、跨章节时间线、组织体系、历史变迁和庞大世界设定的小说作者，也可用于跑团资料、原创世界观、系列故事和角色设定管理。

It is designed for novelists who need to maintain large casts, cross-chapter timelines, organizational systems, historical changes, and extensive world settings over the long term. It can also be used for tabletop RPG materials, original worldbuilding, series bibles, and character-setting management.

插件以当前 Obsidian Vault 为工作空间，尽量沿用 Markdown 文件，并将结构化关系数据保存在本地。资料可以继续使用 Obsidian 搜索、双链、备份和同步；插件不要求注册外部账号，也不依赖在线服务。

The plugin uses the current Obsidian Vault as its workspace, works with Markdown files wherever possible, and stores structured relationship data locally. Your materials remain compatible with Obsidian search, wikilinks, backups, and sync. The plugin requires no external account registration and does not depend on online services.

### 功能地图 / Feature Map

| 模块 / Module | 主要能力 / Main Capabilities | 适用场景 / Use Cases |
|---|---|---|
| **创作工作台** / Creation Workbench | 汇总人物、关系、事件、阵营等项目数据；通过分区入口进入人物与关系、故事结构、世界设定与校验、分析辅助等模块 / Aggregates project data for characters, relationships, events, factions, and more; provides section-based entry points to Characters & Relationships, Story Structure, World Settings & Validation, Analysis Aids, and other modules | 快速了解项目状态，减少模块间跳转 / Quickly grasp project status and reduce module switching |
| **人物档案** / Character Profiles | 以 Markdown 人物档案为基础管理姓名、身份、阵营、出生、首次出场、死亡等字段；支持自定义字段、别名搜索、类型与状态筛选、分组折叠和快捷操作 / Manages fields such as name, identity, faction, birth, first appearance, and death based on Markdown character profiles; supports custom fields, alias search, type and status filters, grouped collapsing, and quick actions | 管理主角团、配角、历史人物与群像 / Manage protagonists, supporting cast, historical figures, and large ensembles |
| **人物关系** / Character Relationships | 创建和编辑人物双方关系、关系类型与亲密度；记录关系变化历史，支持关系快速编辑、上下文操作和双方互换 / Create and edit bidirectional relationships, relationship types, and intimacy; record relationship change history; supports quick editing, contextual actions, and swapping both sides | 追踪亲属、盟友、师徒、敌对、感情等关系 / Track kinship, alliances, master–disciple bonds, rivalries, romance, and more |
| **关系图谱** / Relationship Graph | 可视化展示人物网络；支持缩放、拖拽、滚轮缩放、适应视图、搜索定位、关系类型筛选和人物聚焦；节点颜色可关联当前阵营 / Visualizes character networks; supports zoom, drag, wheel zoom, fit-to-view, search and locate, relationship-type filtering, and character focus; node colors can reflect current factions | 查看人物网络、核心角色和关系结构 / Inspect character networks, core characters, and relationship structures |
| **亲密度历史** / Intimacy History | 记录人物关系亲密度变化，按故事时间查看演化曲线；可定位关联事件，删除记录后重新计算当前值 / Records intimacy changes in relationships and displays evolution curves by story time; can locate related events and recalculate current values after deleting records | 追踪角色感情、信任和关系进展 / Track affection, trust, and relationship development |
| **阵营管理** / Faction Management | 管理国家、宗门、家族、派系、组织等阵营资料，并与人物、关系和时间线视图关联 / Manages factions such as nations, sects, families, factions, and organizations, linked with characters, relationships, and timeline views | 维护人物所属势力及阵营资料 / Maintain character affiliations and faction data |
| **组织架构** / Organizational Structure | 支持多层级组织父子架构、组织关系树和组织间关系；关系具有起止时间，并可按当前写作进度区分当前、历史、待生效和待确认状态 / Supports multi-level parent–child organizational structures, organization relationship trees, and inter-organization relationships; relationships have start and end times and can be classified by current writing progress as current, historical, pending, or unconfirmed | 管理国家机构、宗门体系、家族分支、军政组织和派系关系 / Manage state institutions, sect hierarchies, family branches, military and administrative organizations, and faction relations |
| **组织关系图谱** / Organization Relationship Graph | 展示组织层级与组织之间的关系；支持关系类型筛选、搜索定位、节点聚焦、直接关系高亮、画布平移和缩放浏览 / Displays organizational hierarchies and inter-organizational relationships; supports relationship-type filtering, search and locate, node focus, direct-relationship highlighting, canvas panning, and zoom browsing | 查看复杂组织网络及其历史状态 / Inspect complex organizational networks and their historical states |
| **职位与编制** / Positions & Staffing | 按组织定义职位、等级、人数编制、职责、兼任规则和上下级关系；支持职位归档、层级校验及继任规则 / Defines positions, ranks, headcount, duties, concurrent-role rules, and superior–subordinate relationships per organization; supports position archiving, hierarchy validation, and succession rules | 管理官制、宗门职位、军职、家族职务和组织岗位 / Manage official systems, sect positions, military ranks, family roles, and organizational posts |
| **人物任职履历** / Character Appointment History | 记录加入、任职、晋升、调任、退出、被逐、叛变、投诚、组织解散等变化；支持正式任命、代理、暂代、留任、荣誉头衔和临时委派等任职性质 / Records joins, appointments, promotions, transfers, exits, expulsions, defections, surrenders, organizational dissolutions, and more; supports appointment natures such as formal, acting, temporary, retained, honorary, and ad hoc | 追踪人物在不同时期的所属组织、职位与身份变化 / Track a character's organizations, positions, and identity changes across periods |
| **领地与地域** / Territories & Regions | 独立记录领地取得、占领、收复、割让、失守、归还、独立和合并等变迁；记录原归属、新归属、生效时间、关联事件与说明 / Independently records territory changes such as acquisition, occupation, recapture, cession, loss, return, independence, and merger; records former owner, new owner, effective time, related events, and notes | 管理国家疆域、家族领地、城池和势力控制范围 / Manage national borders, family domains, cities, and spheres of control |
| **故事时间线** / Story Timeline | 按故事时间组织事件；支持事件标签、情节线状态、搜索筛选、人物速查、时间点概览、当前时间过滤、阵营颜色同步和长正文折叠 / Organizes events by story time; supports event tags, plotline status, search filtering, character quick reference, time-point overview, current-time filtering, faction color sync, and long-body collapsing | 整理跨章节事件、战争进程和人物经历 / Organize cross-chapter events, war progress, and character experiences |
| **自定义故事历法** / Custom Story Calendar | 自定义岁首月份和月份名称；识别正月、冬月、腊月、中文数字月份、阿拉伯数字月份、ISO 日期及自定义月份；统一处理故事年归属与时间排序 / Customizes the first month of the year and month names; recognizes first month, winter month, twelfth month, Chinese numeral months, Arabic numeral months, ISO dates, and custom months; uniformly handles story-year attribution and time sorting | 古代、架空历史、奇幻及自定义纪年体系 / Ancient, alternate-history, fantasy, and custom chronological systems |
| **公元前 / 公元后纪年** / BCE / CE Chronology | 识别 BCE / CE 日期并按历史时间顺序比较；统一用于事件排序、人物生卒、年龄、关系有效期和组织任职等时间判断 / Recognizes BCE/CE dates and compares them in historical chronological order; uniformly used for event sorting, character birth/death, age, relationship validity, organizational appointments, and other temporal judgments | 古代历史、跨纪元和架空历史故事 / Ancient history, cross-era, and alternate-history stories |
| **人物生命周期** / Character Lifecycle | 结合出生、首次出场和死亡字段查看人物生命时间轴；首次出场可读取章节库中的故事时间 / Displays a character's life timeline using birth, first appearance, and death fields; first appearance can read story time from the chapter library | 检查人物年龄、出场阶段与生命节点 / Check character age, appearance stages, and life milestones |
| **完整历史履历** / Complete Historical Record | 将出生、首次出场、死亡、阵营与组织任职、职位变化、人物关系变化、重要时间线事件和章节出场记录按时间汇总；支持搜索、筛选、折叠及跳转 / Aggregates birth, first appearance, death, faction and organizational appointments, position changes, relationship changes, important timeline events, and chapter appearances chronologically; supports search, filtering, collapsing, and navigation | 纵览人物一生经历，核对人物设定与剧情进度 / Survey a character's life and verify consistency between character settings and plot progress |
| **章节库与故事时间** / Chapter Library & Story Time | 扫描指定正文文件夹中的 Markdown 章节，为章节设置故事时间；支持章节编号、标题和文件路径匹配；扫描建立索引，不直接改写正文 / Scans Markdown chapters in a specified body-text folder and assigns story time to chapters; supports matching by chapter number, title, and file path; scanning builds an index without directly rewriting body text | 管理章节顺序及章节在故事世界中的发生时间 / Manage chapter order and when chapters occur in the story world |
| **章节情况** / Chapter Overview | 打开正文时汇总本章时间、关联事件、涉及人物、涉及阵营、相关伏笔和大纲预览；涉及阵营按阵营归类汇总 / When body text is opened, summarizes the chapter's time, related events, involved characters, involved factions, related foreshadowing, and outline preview; involved factions are grouped by faction | 写作时核对本章剧情、人物和势力信息 / Verify chapter plot, characters, and faction information while writing |
| **章节与事件关联** / Chapter–Event Linking | 支持章节与时间线事件多对多关联；同一章节可关联多个事件，同一事件也可关联多个章节；章节时间可作为未单独填写事件时间时的回退依据 / Supports many-to-many links between chapters and timeline events; one chapter can link to multiple events, and one event can link to multiple chapters; chapter time can serve as a fallback when event time is not separately specified | 处理跨章节事件、同一事件的多视角呈现和非线性叙事 / Handle cross-chapter events, multi-perspective presentations of the same event, and nonlinear narratives |
| **伏笔与情节线** / Foreshadowing & Plotlines | 管理埋设、推进、升级、假回收、并入、回收和搁置等状态；提供情节线轨道视图及状态逻辑提示 / Manages states such as planted, advanced, escalated, false payoff, merged, paid off, and shelved; provides plotline track views and state-logic hints | 管理悬念、线索、支线和长期回收点 / Manage suspense, clues, subplots, and long-term payoff points |
| **故事逻辑检查** / Story Logic Checks | 检查首次出场、出生前出场、死亡后出场、年龄线索、关系时间范围、伏笔状态、时间线顺序和重复事件；支持忽略或标记为作者刻意安排，并可筛选处理状态 / Checks first appearances, appearances before birth, appearances after death, age clues, relationship time ranges, foreshadowing states, timeline order, and duplicate events; supports ignoring or marking items as intentional author choices and filtering by handling status | 章节调整、剧情梳理和完稿前的结构审校 / Chapter revision, plot organization, and structural review before completion |
| **全局搜索** / Global Search | 跨人物、关系、事件、情节线、阵营、组织关系、任职履历和世界观资料检索；支持字段检索与快捷定位 / Searches across characters, relationships, events, plotlines, factions, organizational relationships, appointment histories, and worldbuilding materials; supports field-based search and quick navigation | 快速查找设定，减少页面跳转 / Quickly find settings and reduce page switching |
| **世界观工作室** / Worldbuilding Studio | 管理分类资料卡，关联人物、阵营和地点；支持批量操作、Markdown 导入预览、JSON 备份恢复、搜索和扩展字段筛选 / Manages categorized information cards linked to characters, factions, and locations; supports batch operations, Markdown import preview, JSON backup and restore, search, and extended-field filtering | 管理世界设定百科、物品、地点、组织和背景资料 / Manage worldbuilding encyclopedias, items, locations, organizations, and background materials |
| **灵感抽签** / Inspiration Draw | 读取本地 Markdown 抽签池及已加入抽签的世界观资料，按分类随机抽取，结果可复制 / Reads local Markdown draw pools and worldbuilding materials added to the draw pool, randomly draws by category, and allows copying results | 随机生成姓名、地点、道具、组织或创作灵感 / Randomly generate names, locations, props, organizations, or creative inspiration |
| **故事大纲** / Story Outline | 按章节、幕或情节段组织大纲；支持章节模板、大纲与时间线事件双向关联，并可在插件内预览或打开 Markdown 原文 / Organizes outlines by chapter, act, or plot segment; supports chapter templates, bidirectional links between outlines and timeline events, and in-plugin preview or opening of Markdown source text | 规划卷、章、幕和情节段落 / Plan volumes, chapters, acts, and plot segments |
| **设定集导出** / Setting Collection Export | 汇总人物卡、关系表、关系图、未回收伏笔和一致性检查结果，生成可归档的设定资料 / Aggregates character cards, relationship tables, relationship graphs, unresolved foreshadowing, and consistency check results to generate archivable setting materials | 项目归档、审阅或分享设定摘要 / Project archiving, review, or sharing setting summaries |
| **导入与智能合并** / Import & Smart Merge | 导入前预览新增、重复和冲突；按人物、事件、阵营及关系规则识别重复；合并前创建快照，失败时尝试回滚 / Previews additions, duplicates, and conflicts before import; identifies duplicates by character, event, faction, and relationship rules; creates snapshots before merging and attempts rollback on failure | 合并不同阶段或不同文件中的设定数据 / Merge setting data from different stages or files |
| **快照与恢复** / Snapshots & Restore | 创建数据快照、预览文件内容与差异、校验快照；恢复前备份当前状态，恢复后回读校验，失败时尝试回滚 / Creates data snapshots, previews file contents and differences, and validates snapshots; backs up current state before restore, verifies after restore, and attempts rollback on failure | 大规模修改前留档，必要时恢复 / Archive before large-scale changes and restore when necessary |
| **撤销 / 重做** / Undo / Redo | 对已接入操作历史的模块提供撤销栈与重做栈；覆盖范围随版本持续扩展 / Provides undo and redo stacks for modules integrated with operation history; coverage expands with each version | 误操作后的快速恢复 / Quickly recover from accidental operations |
| **自由浮动工作台** / Free-Floating Workbench | 支持固定、自由浮动及混合布局；窗口可拖动、调整大小、吸附、置顶、最小化、最大化和关闭；支持场景预设与状态保存 / Supports fixed, free-floating, and mixed layouts; windows can be dragged, resized, snapped, pinned, minimized, maximized, and closed; supports scene presets and state saving | 同时查看人物、组织、时间线和图谱等多个工作模块 / View multiple work modules such as characters, organizations, timelines, and graphs at the same time |

> 说明：功能地图描述的是当前版本所包含的主要工作流。部分能力由多个版本逐步完善；并非所有功能都在 3.48.5 首次新增。各模块的具体字段和可用操作以当前插件界面为准。
>
> Note: The feature map describes the main workflows included in the current version. Some capabilities were refined across multiple versions; not all features were first introduced in 3.48.5. Specific fields and available operations in each module are subject to the current plugin interface.
### 3.68.6 管理多本小说
此版本修复多世界线渲染，并增加管理多本小说。

### 3.51.2 增加多事件线支持
此版本适用于重生文/无限流等小说大纲需要。

### 3.48.5 版本演进与功能对照 / Version Evolution & Feature Comparison

3.48.5 并不是一次单纯的图谱补丁。它建立在此前人物、关系、组织、职位、领地、章节、历法、逻辑检查和数据安全能力的基础上，进一步完善应用级自由工作台、图谱专注浏览和组织关系图谱交互。

3.48.5 is not merely a graph patch. Building on earlier capabilities in characters, relationships, organizations, positions, territories, chapters, calendars, logic checks, and data safety, it further refines the application-level free workbench, focused graph browsing, and organization relationship graph interactions.

| 能力维度 / Capability Area | 此前版本基础 / Previous Foundation | 3.48.5 版本演进重点 / 3.48.5 Focus |
|---|---|---|
| 人物与历史履历 / Characters & Historical Records | 人物档案、生命周期、任职履历、关系变化 / Character profiles, lifecycle, appointment history, relationship changes | 延续完整历史履历与章节出场联动；本次未改变人物数据结构 / Continues complete historical records and chapter-appearance linkage; character data structures unchanged in this release |
| 组织与职位 / Organizations & Positions | 多层级组织、职位编制、任职性质、继任规则 / Multi-level organizations, position staffing, appointment natures, succession rules | 保留组织关系和任职历史；强化组织关系图谱节点交互与阵营档案定位 / Retains organizational relationships and appointment history; strengthens organization graph node interactions and faction-profile navigation |
| 领地管理 / Territory Management | 独立领地变迁台账及组织关联 / Independent territory change ledger and organizational links | 保留原有领地与组织联动，不改变领地数据结构 / Retains existing territory–organization linkage; territory data structures unchanged |
| 章节与时间线 / Chapters & Timeline | 章节库、故事时间、多对多事件关联、章节情况 / Chapter library, story time, many-to-many event links, chapter overview | 保留章节关联与时间解析工作流；本次重点转向工作台和图谱交互 / Retains chapter linking and time-parsing workflows; this release focuses on the workbench and graph interactions |
| 故事历法 / Story Calendar | 全局自定义岁首、月份名称及统一时间解析 / Global custom first month, month names, and unified time parsing | 延续 BCE / CE 与自定义故事历法能力，不另建时间系统 / Continues BCE/CE and custom story calendar capabilities without creating a separate time system |
| 故事逻辑检查 / Story Logic Checks | 首次出场、年龄、关系时间、伏笔与时间线检查 / First appearance, age, relationship time, foreshadowing, and timeline checks | 保留忽略和作者刻意安排等处理状态；本次未改变检查规则 / Retains handling states such as ignored and intentional author choice; check rules unchanged in this release |
| 图谱浏览 / Graph Browsing | 搜索、筛选、聚焦、拖拽、缩放和适应视图 / Search, filtering, focus, drag, zoom, and fit-to-view | 人物与组织图谱可进入独立专注浏览；放大镜直接作用于关系网络画布，减少页面工具栏干扰 / Character and organization graphs can enter independent focused browsing; the magnifier acts directly on the relationship network canvas, reducing page toolbar interference |
| 组织图谱交互 / Organization Graph Interaction | 组织节点、组织关系和历史状态视图 / Organization nodes, organizational relationships, and historical state views | 单击聚焦组织及直接关系，再次单击取消；双击跳转并定位阵营档案；修正节点指针捕获和拖动行为 / Single-click focuses an organization and its direct relationships, single-click again cancels; double-click navigates to and locates the faction profile; fixes node pointer capture and drag behavior |
| 自由工作台 / Free Workbench | 固定、浮动、混合布局与多窗口管理 / Fixed, floating, mixed layouts and multi-window management | 完善浮动工具栏位置、短标签、窗口关闭清理和窗口状态管理 / Refines floating toolbar positioning, short labels, window-close cleanup, and window state management |
| 数据安全 / Data Safety | 本地数据、备份、快照、导入预览和恢复校验 / Local data, backups, snapshots, import preview, and restore validation | 延续现有数据保存与恢复方式；3.48.5 不要求数据迁移 / Continues existing data saving and restore methods; 3.48.5 requires no data migration |

#### 3.48.0—3.48.5 近期版本变化 / Recent Changes 3.48.0–3.48.5

**3.48.0｜图谱交互与应用级自由工作台 / Graph Interaction & Application-Level Free Workbench**
- 人物关系图谱单击节点聚焦人物及直接关系，再次单击取消聚焦。/ In the character relationship graph, single-clicking a node focuses the character and direct relationships; single-clicking again cancels focus.
- 组织关系图谱单击节点聚焦组织及直接上下游关系。/ In the organization relationship graph, single-clicking a node focuses the organization and its direct upstream/downstream relationships.
- 图谱可进入专注覆盖层，保留原有节点、连线、筛选和视图状态。/ Graphs can enter a focused overlay while preserving existing nodes, edges, filters, and view state.
- 增加应用级自由工作台，支持固定、浮动和混合布局，以及窗口拖动、调整大小、吸附、置顶、最小化、最大化和关闭。/ Adds an application-level free workbench supporting fixed, floating, and mixed layouts, plus window dragging, resizing, snapping, pinning, minimizing, maximizing, and closing.
- 工作台窗口采用单实例管理，避免重复创建图谱数据源。/ Workbench windows use single-instance management to avoid duplicate graph data sources.

**3.48.1｜工作台工具栏与图谱一览模式 / Workbench Toolbar & Graph Overview Mode**
- 桌面端浮动工作台工具栏改为左侧竖向排列，可拖动标题移动整组控件。/ On desktop, the floating workbench toolbar is arranged vertically on the left; dragging the title moves the entire control group.
- 人物与组织关系图谱增加放大镜入口，可将现有图谱 DOM 临时移入全窗口专注层。/ Character and organization relationship graphs gain a magnifier entry that temporarily moves the existing graph DOM into a full-window focus layer.
- 压缩图谱页面顶部切换栏和组织图谱标题区域，减少浏览图谱前的纵向占用。/ Compresses the graph page's top switcher and the organization graph title area to reduce vertical space before browsing graphs.
- 手机端保留紧凑顶部导航，不使用桌面竖向浮动栏。/ Mobile retains compact top navigation and does not use the desktop vertical floating bar.

**3.48.2｜浮动工具栏生命周期与文字优化 / Floating Toolbar Lifecycle & Text Refinements**
- 修复最后一个浮动窗口关闭后工具栏仍残留的问题。/ Fixes the toolbar remaining after the last floating window is closed.
- 空工作台关闭时清理浮动层及窗口监听器；重新打开时按需创建。/ Cleans up the floating layer and window listeners when an empty workbench is closed; recreates them on demand when reopened.
- 工具栏改用短标签和符号按钮，完整功能说明通过悬停提示提供。/ The toolbar uses short labels and icon buttons, with full descriptions available via hover tooltips.
- 缩短布局模式、场景预设和模块选择器文字，改善窄栏显示。/ Shortens text for layout modes, scene presets, and the module selector to improve display in narrow columns.

**3.48.3｜关系网络画布全图浏览 / Full-Graph Browsing for Relationship Network Canvas**
- 人物关系预览的放大镜直接作用于关系网络画布，不再放大整页说明和筛选区域。/ The magnifier in the character relationship preview now acts directly on the relationship network canvas instead of enlarging the entire page's explanations and filter area.
- 组织关系预览的放大镜只展开网络视口，时间选择和筛选栏仍留在原页面。/ The magnifier in the organization relationship preview expands only the network viewport; time selection and filter bars remain on the original page.
- 全图适配按当前可见节点范围重新计算，改善密集关系网络的整体浏览。/ Fit-to-view recalculates based on the currently visible node range, improving overall browsing of dense relationship networks.
- 退出专注模式后恢复原画布 DOM 和视图状态。/ Exiting focus mode restores the original canvas DOM and view state.

**3.48.4｜组织关系图谱单击与双击行为 / Organization Graph Single-Click & Double-Click Behavior**
- 修复组织节点单击聚焦及再次单击取消聚焦的判定。/ Fixes detection of single-click focus and single-click-again unfocus for organization nodes.
- 双击节点不再打开编辑弹窗，改为切换到「势力与组织」工作空间并定位对应阵营卡片。/ Double-clicking a node no longer opens an edit dialog; instead, it switches to the "Factions & Organizations" workspace and locates the corresponding faction card.
- 对只有关系节点、尚未建立正式阵营档案的组织给出提示，避免错误跳转。/ Provides a prompt for organizations that exist only as relationship nodes without a formal faction profile, avoiding incorrect navigation.

**3.48.5｜组织关系图谱指针事件修复 / Organization Graph Pointer Event Fixes**
- 修复节点错误显示抓手光标的问题，恢复普通鼠标箭头。/ Fixes nodes incorrectly showing a grab cursor; restores the normal mouse arrow.
- 修正节点拖动时的 Pointer Capture 处理，避免 SVG 画布接管指针后节点无法正常接收单击和双击事件。/ Fixes Pointer Capture handling during node dragging, preventing the SVG canvas from taking over the pointer and causing nodes to fail to receive single-click and double-click events.
- 节点拖动时先更新位置，在释放鼠标后再重绘关系网络。/ Updates node position during dragging first, then redraws the relationship network after the mouse is released.
- 保留单击聚焦、再次单击取消聚焦、双击定位阵营档案，以及空白画布拖动平移功能。/ Retains single-click focus, single-click-again unfocus, double-click faction-profile navigation, and blank-canvas drag panning.

### 数据安全设计 / Data Safety Design

- 关系数据使用独立数据文件保存，避免与 Obsidian 插件设置文件混用。/ Relationship data is stored in a separate data file to avoid mixing with Obsidian plugin settings files.
- 保存流程包含串行写入、原子替换和最近有效备份等保护措施。/ The save process includes serialized writes, atomic replacement, and a most-recent-valid backup.
- 检测到损坏数据时保留损坏文件供排查，并尝试从有效备份恢复。/ When corrupted data is detected, the corrupted file is preserved for investigation and recovery from a valid backup is attempted.
- 快照支持完整性检查；恢复前创建当前状态备份，恢复后进行回读校验，失败时尝试回滚。/ Snapshots support integrity checks; a backup of the current state is created before restore, a read-back verification is performed after restore, and rollback is attempted on failure.
- 导入合并前预览变更并创建快照；合并失败时尝试恢复到导入前状态。/ Changes are previewed and a snapshot is created before import merging; on merge failure, restoration to the pre-import state is attempted.
- 对已接入操作历史的功能提供撤销 / 重做；具体覆盖范围以当前版本已接入的操作入口为准。/ Undo/redo is provided for features integrated with operation history; specific coverage depends on the operation entry points integrated in the current version.
- 删除重要数据时根据操作类型提供确认步骤。/ Confirmation steps are provided when deleting important data, depending on the operation type.

这些保护措施用于降低误覆盖和误删除风险，但**不能替代 Vault 的独立备份**。建议使用 Git、系统备份或 Obsidian Sync 等方式另行备份整个 Vault。

These safeguards reduce the risk of accidental overwrites and deletions but **cannot replace independent Vault backups**. It is recommended to back up the entire Vault separately using Git, system backups, Obsidian Sync, or similar methods.

### 隐私与本地处理 / Privacy & Local Processing

- 不集成云端 AI，不需要 API Key，也不要求注册插件外部账号。/ No cloud AI integration, no API key required, and no external plugin account registration required.
- 人物、关系、时间线、世界观和大纲资料在当前 Obsidian Vault 内处理。/ Character, relationship, timeline, worldbuilding, and outline materials are processed within the current Obsidian Vault.
- 插件不以远程服务器作为资料存储或分析服务。/ The plugin does not use remote servers for data storage or analysis services.
- 插件会按功能需要在 Vault 中读写 Markdown、JSON 和快照文件；部分资料路径可以在设置中调整。/ The plugin reads and writes Markdown, JSON, and snapshot files in the Vault as needed for its features; some data paths can be adjusted in settings.

请勿将包含个人创作内容的 Vault 数据文件、备份或快照提交到公开 GitHub 仓库。

Do not commit Vault data files, backups, or snapshots containing personal creative content to public GitHub repositories.

### 快速开始 / Quick Start

1. 在 Obsidian 中安装并启用 Relation Weaver / 人物关系谱系。/ Install and enable Relation Weaver in Obsidian.
2. 进入人物模块，创建或连接人物 Markdown 档案；按需要填写姓名、身份、阵营、出生、首次出场和死亡等字段。/ Open the Characters module and create or link Markdown character profiles; fill in fields such as name, identity, faction, birth, first appearance, and death as needed.
3. 在关系模块中选择已有的人物，创建关系类型和亲密度记录。/ In the Relationships module, select existing characters and create relationship types and intimacy records.
4. 在势力与组织模块中建立阵营、组织架构、职位和人物任职履历。/ In the Factions & Organizations module, establish factions, organizational structures, positions, and character appointment histories.
5. 在时间线模块中添加事件，并按需要填写故事日期、事件标签、情节线状态和关联章节。/ In the Timeline module, add events and fill in story dates, event tags, plotline status, and linked chapters as needed.
6. 在章节库中扫描正文文件夹，为章节设置故事时间；打开正文后可查看章节情况。/ In the Chapter Library, scan the body-text folder and set story time for chapters; after opening body text, you can view the chapter overview.
7. 在伏笔与故事逻辑检查模块查看未回收线索和规则提示。/ In the Foreshadowing and Story Logic Checks modules, review unresolved clues and rule hints.
8. 在世界观工作室、灵感抽签和故事大纲模块补充项目资料。/ Supplement project materials in the Worldbuilding Studio, Inspiration Draw, and Story Outline modules.
9. 大规模导入、批量修改或恢复前，先创建快照并备份 Vault。/ Before large-scale imports, batch modifications, or restores, create a snapshot and back up the Vault.

### 文件与路径 / Files & Paths

插件资料保存在当前 Vault 中。部分默认文件名及路径如下，具体以设置中配置的路径为准：

Plugin data is stored in the current Vault. Some default file names and paths are listed below; the paths configured in settings take precedence.

| 文件 / 目录 / File / Directory | 用途 / Purpose |
|---|---|
| `data.json` | Obsidian 插件设置 / Obsidian plugin settings |
| `relations-data.json` | 人物关系、阵营、组织关系、职位、任职履历及相关结构化数据 / Character relationships, factions, organizational relationships, positions, appointment histories, and related structured data |
| `relations-data.json.bak` | 最近一次有效关系数据备份 / Most recent valid relationship data backup |
| `intimacy_history.json` | 亲密度变化历史 / Intimacy change history |
| `时间线.md` | 时间线事件资料（使用当前设置的路径）/ Timeline event materials (uses the currently configured path) |
| `世界观资料库.md` | 分类世界观资料库（可自定义路径）/ Categorized worldbuilding database (customizable path) |
| `抽签池.md` | 灵感抽签候选池（可自定义路径）/ Inspiration draw candidate pool (customizable path) |
| `故事大纲.md` | 故事大纲（可自定义路径）/ Story outline (customizable path) |
| `设定快照/` | 数据快照与恢复索引 / Data snapshots and restore index |

**抽签池格式示例 / Draw Pool Format Example:**

```markdown
## 姓名池
- 沈知微
- 顾长风

## 地点池
- 归云渡
- 白石城
```

**故事大纲格式示例 / Story Outline Format Example:**

```markdown
## 第一卷：风起
章节核心目标、主要冲突与人物变化……

## 第二卷：入局
新的线索、阵营变化与阶段性转折……
```

### 故事逻辑检查的边界 / Boundaries of Story Logic Checks

故事逻辑检查是**基于字段和明确文本线索的规则辅助检查**，不是能够理解整部小说语义的 AI 编辑器。例如：

Story logic checks are **rule-based辅助 checks based on fields and explicit textual clues**; they are not an AI editor capable of understanding the semantics of an entire novel. For example:

- 年龄检查需要人物出生时间，并且事件或章节中存在可识别的年龄线索。/ Age checks require a character's birth time and recognizable age clues in events or chapters.
- 关系时间检查需要填写关系开始 / 结束时间。/ Relationship time checks require relationship start/end times to be filled in.
- 首次出场检查会结合人物首次出场字段与时间线事件、章节内容中的人物提及进行判断；具体匹配方式受姓名和索引内容影响。/ First-appearance checks combine the character's first-appearance field with character mentions in timeline events and chapter content; specific matching is affected by names and indexed content.
- 时间线顺序提示可能把倒叙、插叙识别为疑似顺序问题；作者应结合叙事意图判断。/ Timeline order hints may identify flashbacks or interjections as suspected order issues; authors should judge in light of narrative intent.
- 伏笔提示依据情节线状态与记录节点，不能自动判断文学意义上的伏笔是否真正回收。/ Foreshadowing hints are based on plotline status and recorded nodes and cannot automatically determine whether foreshadowing has truly been paid off in a literary sense.
- 忽略或标记为「作者刻意安排」的提醒可按状态筛选；这些状态用于辅助作者管理检查结果，不代表插件理解了情节意图。/ Hints ignored or marked as "intentional author choice" can be filtered by status; these states help authors manage check results and do not mean the plugin understands plot intent.

所有检查结果都是提示，不会自动替作者修改人物、关系或事件数据。

All check results are hints and will not automatically modify character, relationship, or event data on the author's behalf.

### 安装与升级 / Installation & Upgrade

#### 从 Obsidian 社区插件市场安装 / Install from the Obsidian Community Plugin Market

若插件已上架 Obsidian 社区插件目录：/ If the plugin is available in the Obsidian Community Plugin directory:

1. 打开 **设置 → 第三方插件 → 浏览**。/ Open **Settings → Third-party plugins → Browse**.
2. 搜索 **Relation Weaver** 或 **人物关系谱系**。/ Search for **Relation Weaver** or **人物关系谱系**.
3. 安装并启用。/ Install and enable.

#### 手动安装 / Manual Installation

1. 从 [GitHub Releases](https://github.com/guilier/relation-weaver/releases) 下载对应版本的 `main.js`、`manifest.json` 和 `styles.css`。/ Download the corresponding version's `main.js`, `manifest.json`, and `styles.css` from [GitHub Releases](https://github.com/guilier/relation-weaver/releases).
2. 在当前 Vault 的 `.obsidian/plugins/` 下创建或打开 `relation-weaver/` 文件夹。/ Create or open the `relation-weaver/` folder under `.obsidian/plugins/` in the current Vault.
3. 将上述三个文件放入该文件夹。/ Place the three files into that folder.
4. 在 Obsidian 设置 → 第三方插件中启用插件；升级时可关闭后重新启用，必要时重启 Obsidian。/ Enable the plugin in Obsidian Settings → Third-party plugins; when upgrading, you can disable and re-enable it, and restart Obsidian if necessary.

#### 从旧版本升级到 3.48.5 / Upgrading from an Older Version to 3.48.5

升级前建议备份：/ It is recommended to back up the following before upgrading:

- `.obsidian/plugins/relation-weaver/` 插件目录，包括 `data.json`；/ The `.obsidian/plugins/relation-weaver/` plugin directory, including `data.json`;
- 人物档案、时间线、关系与阵营数据文件，包括 `relations-data.json` 和 `relations-data.json.bak`；/ Character profiles, timeline, relationship, and faction data files, including `relations-data.json` and `relations-data.json.bak`;
- 亲密度历史、世界观资料库、抽签池、故事大纲和设定快照；/ Intimacy history, worldbuilding database, draw pool, story outline, and setting snapshots;
- 在设置中自定义资料文件路径下的相关 Markdown / JSON 文件；/ Relevant Markdown/JSON files under custom data paths configured in settings;
- 如果曾启用图谱同步，相关图谱节点笔记也应一并备份。/ If graph sync was enabled, related graph node notes should also be backed up.

3.48.5 的组织关系图谱修复不要求迁移数据，不修改人物、阵营及组织关系的数据结构，也不改变现有 Markdown 数据格式。升级时请保留原有数据文件，不要将其与插件程序文件一并删除。

The organization relationship graph fixes in 3.48.5 require no data migration, do not modify the data structures of characters, factions, or organizational relationships, and do not change existing Markdown data formats. When upgrading, please retain your existing data files and do not delete them together with plugin program files.

### 兼容性与已知限制 / Compatibility & Known Limitations

- Manifest 声明 `minAppVersion: 1.4.0`、`isDesktopOnly: false`。这表示清单声明的最低版本和平台标记，不等同于已在所有 Obsidian 桌面端、移动端及主题组合中完成验证。/ The manifest declares `minAppVersion: 1.4.0` and `isDesktopOnly: false`. This indicates the manifest's declared minimum version and platform flag; it does not mean the plugin has been verified across all Obsidian desktop, mobile, and theme combinations.
- 界面已针对窄侧栏和笔记本布局做优化，但这不等于声明完整移动端支持；移动端体验仍建议先在 Vault 副本中验证。/ The interface has been optimized for narrow sidebars and notebook layouts, but this does not constitute a claim of full mobile support; for mobile experience, it is still recommended to test in a Vault copy first.
- JavaScript 静态语法检查不能替代真实 Obsidian Vault 的端到端测试。/ JavaScript static syntax checks cannot replace end-to-end testing in a real Obsidian Vault.
- 建议首次升级先在 Vault 副本中验证保存、导入、快照恢复、图谱交互、章节情况和自定义路径。/ For the first upgrade, it is recommended to verify saving, importing, snapshot restore, graph interactions, chapter overview, and custom paths in a Vault copy first.
- 大型 Vault、第三方同步工具、特殊文件系统行为及自定义主题可能影响实际体验。/ Large Vaults, third-party sync tools, special file system behavior, and custom themes may affect the actual experience.

### 反馈与问题 / Feedback & Issues

请通过 [GitHub Issues](https://github.com/guilier/relation-weaver/issues) 提交问题或功能建议。反馈时请说明 Obsidian 版本、操作系统、插件版本和复现步骤。

Please submit issues or feature suggestions via [GitHub Issues](https://github.com/guilier/relation-weaver/issues). When reporting, please include the Obsidian version, operating system, plugin version, and reproduction steps.

请勿上传包含私人小说正文或个人资料的 Vault 文件，也不要上传 `relations-data.json`、`data.json`、`intimacy_history.json`、快照文件或备份文件。

Do not upload Vault files containing private novel text or personal information, and do not upload `relations-data.json`, `data.json`, `intimacy_history.json`, snapshot files, or backup files.

---

## 开发说明 / Development Notes

- `main.js`：打包后的 Obsidian 插件入口。/ Bundled Obsidian plugin entry point.
- `styles.css`：插件样式。/ Plugin styles.
- `manifest.json`：Obsidian 插件清单。/ Obsidian plugin manifest.
- `modules/`：开发阶段使用的本地模块；当前构建所需运行逻辑会打包进 `main.js`。/ Local modules used during development; runtime logic required for the current build is bundled into `main.js`.

项目仓库 / Repository: https://github.com/guilier/relation-weaver
