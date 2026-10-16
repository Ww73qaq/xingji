# 星迹 vs mochi —— 对比优化 & 缺陷修复报告

> 生成时间：2026-10-16
> 星迹当前版本：v3.27.5 / APK code23（初稿基于 v3.27.0，已同步复核至最新）
> 对比对象：`ling233330-star/mochi`（v8.67，已停更）
> 说明：星迹缺陷部分基于对 30+ 源文件的逐一审读，均给出 `文件:行号` 证据。

---

## 一、一句话结论

星迹**功能形态**已经和 mochi 同一量级（聊天/朋友圈/通话/日历/问卷/房间等都很像），真正的差距在**工程体系**：
mochi 有 **895 个回归验证脚本 + CI 自动验证 + 单源构建 + 哨兵机制 + 完整文档**，而星迹目前是**零测试、零 README、CI 只打包不验证**。
所以「APK 用着有问题」不是巧合——是缺少自动化验证 + 几处真实的异步竞态/存储口径缺陷共同导致的。

---

## 二、工程化对比（差距最大的地方）

| 维度 | 星迹 | mochi | 差距 |
|---|---|---|---|
| 验证脚本 | **0 个** | **895 个 `verify-*.mjs`** | 🔴 致命 |
| CI 质量门禁 | 只 `assembleRelease` 打包 APK | `verify.yml`：构建 + Chrome 布局 + WebKit 引擎 + 设备回归 + 全量套件 | 🔴 致命 |
| 源码组织 | 手写多文件，直接进产线 | `src/` 拆分 → `build.mjs` 单源合并成单文件 | 🟡 中 |
| 构建闸门 | 无 | 「打回体检」硬闸：检测工作树是否停在旧底，防误回滚已入库修复 | 🟡 中 |
| 文档 | 交接文档 308KB（人读） | README + docs/ + AGENTS 约定 | 🟡 中 |
| 问题追踪 | 提交信息 + 交接文档章节 | 全局问题编号体系（#1213…）+ 根因分析 | 🟡 中 |
| 真机性能证据 | 无 | `__mochiPhase` 冻结探针 + iPhone 实测归档 | 🟢 低 |
| 诊断页 | 无独立页 | `diag-storage.html` / `diag-ask-records.html` | 🟢 低 |
| 数据存储 | IndexedDB + 本地 | LocalStorage→IndexedDB 分层 + 存储瘦身 | 🟢 低 |

### 直接可抄的 3 件事（性价比最高）

1. **建回归脚本目录 + CI 验证**（最高优先级）
   mochi 的核心竞争力就是「改完自动验证」。你不需要 895 个，先建 `tools/`，写 10~20 个针对**高频易坏路径**的 Playwright 脚本（发送消息、reload 后状态恢复、备份导入导出、切换联系人、返回键），挂到 GitHub Actions 上。这一步能直接拦住你 80% 的「发完才发现坏」。

2. **单一版本源 + CI 一致性校验**
   你现在版本号要手工同步 **四处**（`index.html` 的 `?v=` / `js/config.js` 的 `APP_VERSION` / `sw.js` 的 `SW_VERSION` / `version.json`），历史已连续漏升过（v3.23.x）。
   → 发版脚本从 `version.json` 一处分发，CI 里 `grep` 四处必须一致，否则标红退出。

3. **CI 里加「防止把半成品打进包」的闸门**
   mochi 的 `build.mjs` 构建前会检查工作树脏不脏。你的 `build-apk.yml` 目前 push 即打包，建议加一步：版本四件套一致性 + 关键锚点存在性检查。

---

## 三、APK 逻辑缺陷清单（这是「用着有问题」的根因）

### 🔴 严重（会导致重复数据 / 数据丢失 / 状态错乱）

#### S1. 回前台可能「回复两遍」
- **证据**：`js/app.js:137,146,149,150,151,154` 共 **5 个触发器**（DOMContentLoaded / visibilitychange / focus / pageshow / openApp('chat')）都调用 `resumeScheduledJobs()`；而 `js/scheduler.js:293` 无条件 `_scheduler.activeJob=job;` 覆盖当前任务。
- **成因**：回前台时 `visibilitychange` 与 `focus` 常在同一帧先后触发，两次都在持久化 job 尚未被异步删除（`_clearPersistJob` 是异步事务）时读到同一 job，第二次把状态重置回 `waiting`，绕过 `_executeJob` 的 `status` 守卫 → **同一轮回复重复执行**。
- **影响**：TA 对同一消息回两遍、字卡 `useCount` 翻倍、通知重复、偶发难复现。
- **修复**：`resumeScheduledJobs` 开头加幂等锁 `if(_scheduler.activeJob||_resuming)return`；用 `job.id` 去重；把 5 个触发器收敛为「仅 visibilitychange→visible」。

#### S2. 信件回信并发 → 同封信生成两封回信
- **证据**：`js/features/envelope.js:59-69` 的 `processPendingReplies()` 无锁；调用点有两个——心跳 `js/app.js:95`（每 15s）与打开信箱 `js/ui/mailbox.js:26`。
- **成因**：两者都先 `dbGetAll('letters')` 过滤出同一批 `waiting`，在任一写回 `replied` 之前并发进入循环 → 重复回信。
- **影响**：收件箱重复回信、未读徽标虚高。
- **修复**：模块内加执行锁 `let _lock=false`（`try/finally` 复位）；或先把信标记为 `replying` 再生成。

#### S3. 备份/恢复口径与真实数据库版本号不一致（**已修正，非"音乐丢失"**）
> ⚠️ 初版报告曾误判为「本地音乐必丢」。经核实：**当前主线无本地音乐功能**（v3.25.0 已下线冻结，代码在 `feature/music-beta`），`STORES` 不含 `music` 是**正确**的，不存在音乐丢失问题。以下为修正后的真实问题。
- **证据**：`js/db.js:28` 实际 `indexedDB.open('xingji',6)`，但 `js/config.js:347` 的 `SCHEMA_VERSION=5` 与之不符（注释还写「跟随 db.js 的 5」）。
- **影响**：备份文件里记录的 `schemaVersion` 自描述错误；因导入侧不据此拦截，**影响低**，但会误导后续迁移逻辑。
- **修复**：`SCHEMA_VERSION` 改为 6。
- **附带（代码卫生）**：`js/db.js:59` 仍创建 `music` object store，但**全仓无任何代码读写它**（纯孤儿表）；`js/config.js:55` / `js/ui/chat.js:25,93` 仍保留 `music` 消息类型渲染。若确认不再需要，应在下次版本升级时 `deleteObjectStore('music')` 清理；若为兼容历史/接收消息而刻意保留，建议加注释说明。

#### S4. 全局 `mediaStream` 被「聊天录音」与「通话」共享 → 互相踩踏
- **证据**：`js/ui/chat.js:557` `let ...mediaStream=null...` 是全局变量；`js/features/call.js:25,42-47,363` 全程复用**同一个变量**，通话结束 `call.js:363` 会 `getTracks().forEach(t=>t.stop())`。
- **影响**：视频通话中若触发语音录音路径（或反之），一方会 stop 掉另一方的轨道 → 黑屏/静音/录音失败。
- **修复**：改名隔离（`callStream` / `voiceStream`），或各自在模块内独立声明；**不要把跨模块共享的流放在全局 `let`**。

---

### 🟡 中等

#### M1. `saveKey` 非原子读改写，并发保存丢写
- **证据**：`js/state.js:85` `dbGet`→改→`dbPut` 三步非事务。
- **影响**：心跳每 60s 存 `stats`、通知、TA 发朋友圈等高频并发时，同一 key 交错写入，后写覆盖先写。
- **修复**：直接 `dbPut('settings',{key,value:state[key]})` 整体覆盖（`value` 本就是引用，无需先读）。

#### M2. TA 状态双份存储但 `taStatus` 未持久化
- **证据**：`js/features/mood.js:33-36` 写了 `state.taStatus` 却只 `saveKey('other')` 和 `saveKey('taStatusUntil')`；`js/state.js:74` 的 `loadSettings` keys 列表**没有 `taStatus`**。
- **影响**：刷新后 `state.taStatus` 变 `undefined`，`maybeTaStatusChange`（mood.js:68）漏掉「到期回在线」分支，TA 状态可能卡住或立即跳回在线。
- **修复**：单点化——要么持久化并加入 keys，要么删掉、全部读写 `state.other.status`。

#### M3. APK 内仍注册 Service Worker（冗余 + 陈旧缓存风险）
- **证据**：`js/app.js:115` 无条件注册 `sw.js`；但 Capacitor `androidScheme:'https'` 本地加载 `www`，资源由 WebView 拦截，SW 离线能力无意义；且 `sw.js:26` 自带警告「SW_VERSION 漏改会导致旧壳缓存不换新」。
- **影响**：安装新 APK 后可能仍命中旧 `index.html` 壳。
- **修复**：`if(!inApp() && 'serviceWorker' in navigator)` 才注册；APK 内直接 `unregister` 已有注册。

#### M4. APK 返回键未接 Capacitor → 「再按一次退出」常失效
- **证据**：`js/nav.js:138-161` 的 popstate 里「再按一次退出」走 `history.go(-1)`；全仓 **grep 无** `App.addListener('backButton')` / `App.exitApp()`；`MainActivity` 也没覆盖返回键。
- **影响**：APK 内返回键最终由 WebView `canGoBack()` 决定，到底时既不退出也不报错，用户以为卡死。
- **修复**：装 `@capacitor/app`，监听 `backButton`，`goBack()` 返回 false（已在桌面）时调 `App.exitApp()`。

#### M5. APK 后台挂起 → 纯内存定时任务丢失
- **证据**：`js/ui/diary.js:119` 用 `setTimeout(…,5000+随机)` 生成 TA 日记回复，页面被冻结/杀后回调永不执行；`js/ui/companion.js:31` 陪伴会话只在内存、`companionTick` 是 `setInterval`，后台期计时不动、杀进程即消失。
- **影响**：切后台再回，陪伴时长/日记回复/回信静默丢失或错位。
- **修复**：凡「到点必须发生」的行为先落库（参考 scheduler 的 job 持久化），回前台用时间戳 catch-up。

#### M6. `dbPut` 内存缓存残留无 id 幻影条目
- **证据**：`js/ui/chat.js:488-491` `const rec=await dbPut(...)` 后**没把 `rec` 写回 `message.id`**（其它路径都写了）；而 `js/db.js:88-96` 的 `dbPut` 写库前已把对象压入 `_dbMemo`。
- **影响**：`_dbMemo.messages` 留一条 `id===undefined` 记录 → 被 `_getRecentUsed` 等读到幽灵条目；极端下再 `dbPut` 会因 `id` 为 undefined 而**插入重复消息**。
- **修复**：`message.id=rec;` 后再入缓存。

---

### 🟢 轻微

- **L1** 撤回后「修改并重发」拿不到原文：`js/ui/chat.js:443` 先置 `m.recalled=1` 再调 `msgPreviewText`，而后者首行 `if(m.recalled)return ''` → `ref.text` 恒空。修：先取文本再置位。
- **L2** `js/ui/memory.js:44` 用 `Math.min(...msgs.map(...))`，消息数万条时可能 `RangeError` 崩溃。修：改 `reduce`。
- **L3** 朋友圈回评队列 `replyToIndex` 用数组下标（`js/ui/moments.js:106,246`），到期前插入新评论即错位。修：改存评论稳定 id。
- **L4** `js/ui/chat.js:295` `renderChat` 每次全量读表 + 重建 DOM，历史长时卡顿。修：走增量/缓存渲染。
- **L5** `js/nav.js:36,140` 的 `skipPops` 只减不增是死变量；`js/utils.js:15` `taOutputBlocked()` 恒返回 `false`，全站静音门控已成死代码，建议物理清理以免后人误判。

---

## 四、建议执行顺序（按性价比）

| 顺序 | 事项 | 理由 |
|---|---|---|
| 1 | 修 **S1 / S2**（加幂等锁） | 直接消除「回复两遍/重复回信」，改动小、收益大 |
| 2 | 修 **S4**（mediaStream 隔离） | 通话/录音互踩是硬伤，改动小 |
| 3 | 修 **S3**（SCHEMA_VERSION 改 6 + 清理孤儿 music 表） | 低风险卫生项，顺手做 |
| 4 | 加 **版本四件套 CI 校验** + 迁移到单一源 | 防止老毛病复发 |
| 5 | 建 `tools/` 回归脚本 + CI `verify` 工作流 | 长期防止「发完才发现坏」 |
| 6 | 补 `README.md`（含免责声明/署名/二改说明） | mochi 靠 README 管理用户预期与版权，你缺 |
| 7 | M4/M5 APK 专项（backButton + 内存任务落库） | APK 体验关键 |

---

## 五、mochi 值得学、但不建议照抄的点

- **值得学**：CI 自动验证、单源构建、哨兵/回归、README 的预期管理与版权声明、诊断页。
- **不必照抄**：895 个 verify 脚本对个人项目是过重的负担（作者也承认「功能太多抬高门槛」）；mochi 的分层存储/冻结探针属于其规模下的取舍，星迹目前不必。
- **注意合规**：mochi 的 README 明确要求「借鉴功能/代码必须标注灵感来源」。星迹若参考了 mochi/星言/milk 的设计，请在 README/设置页做**灵感来源标注**，既是尊重，也避免 DMCA 风险。
