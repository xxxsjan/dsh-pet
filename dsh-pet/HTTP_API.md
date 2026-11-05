# dsh-pet · 本机 HTTP API（对接说明）

给弹幕机、桌面端、其它本机程序调用。本文按「对接常用能力」写细，完整接口一览与字段契约以仓库根目录 [`API.md`](../API.md)、[`openapi.yaml`](../openapi.yaml) 为准。

> 实现以源码为准；本文不承诺与蓝色大肥鱼 `19265` 端口或根路径 `/say`、`/chat` 兼容。

## 基本信息

| 项                   | 值                                              |
| -------------------- | ----------------------------------------------- |
| 端口（桌面应用）     | 固定 **`3080`**；被占用则**启动失败**，不换端口 |
| 端口（CLI 独立模式） | 首选 `3080`；被占用时向后顺延（最多约 25 个）   |
| 业务前缀             | `/blue-fish`                                    |
| 绑定                 | 本机回环（`127.0.0.1` / `localhost`）           |
| 编码                 | UTF-8                                           |
| 请求体               | `Content-Type: application/json`（写接口）      |

**Base URL 示例（桌面应用）**

```text
http://127.0.0.1:3080
```

业务接口完整路径形如：

```text
http://127.0.0.1:3080/blue-fish/chat?pet=main&surface=desktop
```

桌宠未运行、`3080` 被占用导致启动失败、或鉴权失败时，接口不可用。可先请求 `GET /health` 确认进程与端口。

> 作为 **DSH 插件**挂到宿主 Web 服务时：前缀同样是 `/blue-fish`，端口跟宿主走；插件侧文档写明「只听 127.0.0.1、无鉴权」。独立应用则另有本机令牌（见下）。

---

## 鉴权与访问边界（独立应用 / standalone）

独立 HTTP 服务启用本机能力令牌与来源校验：

1. **Host 必须是当前回环地址**：`127.0.0.1:<实际端口>` 或 `localhost:<实际端口>`。
2. **跨站 Origin / `Sec-Fetch-Site: cross-site` 会被拒绝**（`403`）。
3. **令牌**：请求头 `X-Blue-Fish-Token: <token>`（或同进程浏览器会话 cookie `blue_fish_token`）。

### 哪些路径要令牌

| 类别                                  | 是否需要令牌 |
| ------------------------------------- | ------------ |
| `GET /`、`GET /health`                | 否           |
| `GET /blue-fish/state` 等多数只读     | 否           |
| `GET/POST/DELETE /blue-fish/chat*`    | **是**       |
| `POST /blue-fish/whisper`             | **是**       |
| 其它所有写操作（含 `broadcast`）      | **是**       |

鉴权失败时 HTTP 状态码为真实的 `403`/`400`，体类似：

```json
{ "error": "请从桌宠菜单重新打开设置" }
```

### 如何拿到 token / 端口

启动后会写入运行状态文件（进程退出后删除），内含 `port`、`token`、`settingsUrl`。外部程序读此文件即可对接；**不要**依赖 `/health`（其中不含 token）。

| 模式         | 运行状态路径                                       | 端口                          |
| ------------ | -------------------------------------------------- | ----------------------------- |
| 桌面应用     | `{用户主目录}/.blue-fish6/standalone-runtime.json` | 固定 `3080`（占用即无法启动） |
| CLI 独立模式 | `{DSH_HOME}/blue-fish6/standalone-runtime.json`    | 首选 `3080`，占用可顺延       |

Windows 常见示例：

- 桌面：`C:\Users\<你>\.blue-fish6\standalone-runtime.json`
- CLI：`C:\Users\<你>\.dsh\blue-fish6\standalone-runtime.json`（未设置 `DSH_HOME` 时）

设置页仍可通过右键桌宠 →「打开 AI 设置」打开（URL 短暂含 `#token=`，页面加载后会清掉地址栏 hash）；对接请优先读对应模式的 runtime 文件。

---

## 统一响应约定

插件业务路由（`/blue-fish/...`）约定：

| 情况                                     | HTTP 状态                | 响应体                                                          |
| ---------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| 业务成功                                 | `200`                    | `{ "ok": true, ... }`                                           |
| 业务失败（缺参、未知宠物、模型不可用等） | **`200`**                | `{ "ok": false, "reason": "...", "message": "..." }`            |
| 协议失败（非法 JSON、方法不对、体过大）  | `400` / `405` / `413` 等 | 同上失败实体形状                                                |
| 未预期内部错误                           | `500`                    | `{ "ok": false, "reason": "internal-error", "message": "..." }` |

对接方请以 **`ok` 字段** 判断成败，不要只看 HTTP 状态码。

常见 `reason`：`bad-request`、`pet-required`、`unknown-pet`、`pet-not-displayed`、`provider-missing`、`generate-error`、`locked`、`lock-required`、`lock-lost`、`sleeping`、`invalid-json`、`method-not-allowed`。

### 查询参数惯例

| 参数      | 说明                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pet`     | 宠物 id，**多数动作接口必填**且必须在配置中真实存在；不默认落到列表第一只                                                            |
| `surface` | **写接口普遍必填**：`web` / `desktop` / `both` / `any`。缺省或非法 → `bad-request`；与宠物 `display` 对不上 → `pet-not-displayed`（带回实际 `display`） |
| `lock`    | 占用锁编号（取自 `POST /lock` 返回的 `lockId`）。无锁时不传照旧；有锁时动作端点必须带对，否则 `lock-required` / `lock-lost`         |

`surface` 是前置校验，不是「按面分发」：指令仍写进同一份状态。桌面端对接常用 `surface=desktop`；不关心显示面时用 `any`。

**不要求 `surface` 的例外**：`POST /lock/release`、`GET /chat`（及同类纯读记忆）。

睡觉中的宠物会对一批「打扰类」写接口返回 `sleeping`（含 `POST /chat`、`broadcast`、`whisper` 等）；持锁调用可绕过睡觉限制。

### 占用锁（第三方联动）

- `POST /blue-fish/lock?pet=&surface=`：取锁 / 续期（body 里 `lockId` 有=续期、无=新建），回 `lockId` + `expiresAt`。
- `POST /blue-fish/lock/release?pet=`：释放；body 里 `lockId` 与 `force` **恰好给一个**。
- 标了「需锁」的动作（`broadcast`、`bubble/clear`、`anim`、`position`、`throw`）：**当前有占用时**必须带 `?lock=<lockId>`。
- 占用期间桌宠完全静止（自己不动、不弹气泡）；用户拖拽 / 隐藏会强制撤锁。

---

## GET `/health`

检查独立服务是否在听。`GET /` 行为相同（落地页为 HTML 时除外；JSON 状态由 status 提供者给出）。

### 请求

```http
GET http://127.0.0.1:3080/health
```

无需令牌。

### 成功响应 `200`

独立应用大致包含（字段随模式略有增减）：

```json
{
  "name": "blue-fish-app",
  "version": "…",
  "pid": 12345,
  "port": 3080,
  "configFile": "…",
  "pets": [{ "id": "main", "name": "…", "display": "desktop" }]
}
```

可用 `pets[].id` 作为后续接口的 `?pet=`；请对照 `display` 选择合适的 `surface`。

独立模式下另有根路径 `POST /shutdown`（优雅停机，需令牌）。`/blue-fish` 下依赖宿主模型的接口在独立模式会结构化降级：`POST /whisper`、`POST /chat` → `provider-missing`，`POST /balance` → `unsupported`（配置了可用模型时 chat/whisper 仍可走通）。

---

## 对话

前缀：`/blue-fish`。独立模式下 **读写均需令牌**。

### POST `/blue-fish/chat?pet=&surface=`

把用户文本交给已配置的模型生成回复；成功时写入对话记忆，并通常会推到桌宠气泡。响应额外带回 `text`（配图时另有 `image`）——与写进 `/state` 的是同一份。

适合：观众弹幕 / 外部程序 → 桌宠回话。

#### 请求

```http
POST http://127.0.0.1:3080/blue-fish/chat?pet=main&surface=desktop
Content-Type: application/json
X-Blue-Fish-Token: <token>

{
  "text": "你好呀"
}
```

| 字段         | 类型   | 必填 | 说明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `text`       | string | 是   | trim 后非空，最长 **2000** 字                                        |
| `attachment` | object | 否   | 随本轮送一张图；**独立模式通常不支持**（无附件服务 → `bad-request`） |

`attachment` 形状（仅宿主提供附件服务时可用）：

```json
{
  "mediaType": "image/png",
  "data": "<base64>"
}
```

`mediaType` 白名单：`image/png` / `image/jpeg` / `image/webp` / `image/gif`。`data` 为规范 base64，**不要**带 `data:` 前缀。

图片会**记进记忆**（只存附件引用，不存本体），只影响这一轮展示、**不进气泡**，也不进后续上下文。不传时行为与旧版逐字一致。

配置 `chatAnimationEnabled`（默认开）时，模型可在回复末尾写 `[动作:名称]`；宿主采纳后与 `POST /anim` 同链路点播，标记会从气泡正文与记忆里剥掉。

#### 成功 `200`

```json
{
  "ok": true,
  "text": "唔，你好呀～"
}
```

| 字段    | 说明                                 |
| ------- | ------------------------------------ |
| `text`  | 模型生成的回复正文（已开始显示流程） |
| `image` | 可选，配图名                         |

生成超时量级约 **60s**，调用方请设置足够超时。

#### 失败（仍多为 HTTP 200）

```json
{
  "ok": false,
  "reason": "provider-missing",
  "message": "…"
}
```

| reason 示例                    | 情况                                      |
| ------------------------------ | ----------------------------------------- |
| `bad-request`                  | 空消息、过长、缺/非法 `surface`、图片非法 |
| `pet-required` / `unknown-pet` | 未传或找不到宠物                          |
| `pet-not-displayed`            | `surface` 与宠物 `display` 不匹配         |
| `provider-missing`             | 未配置可用模型                            |
| `generate-error`               | 生成/IO 失败                              |
| `sleeping`                     | 宠物在睡                                  |

非法 JSON → HTTP `400` + `invalid-json`。

---

### GET `/blue-fish/chat?pet=`

读该宠物最近对话记忆窗口（一次读取，不是轮询）。**不要求 `surface`**。

```http
GET http://127.0.0.1:3080/blue-fish/chat?pet=main&rounds=20
X-Blue-Fish-Token: <token>
```

| 查询     | 说明                                                       |
| -------- | ---------------------------------------------------------- |
| `pet`    | 必填                                                       |
| `rounds` | 可选，`0–200` 整数；不传则用配置里的记忆轮数；`0` = 空窗口 |

#### 成功 `200`

```json
{
  "ok": true,
  "rounds": 20,
  "messages": [
    {
      "role": "user",
      "content": "你好呀",
      "ts": 1730000000000
    },
    {
      "role": "assistant",
      "content": "唔，你好呀～",
      "ts": 1730000000000,
      "meme": "可选表情包名",
      "action": "可选动作名"
    }
  ]
}
```

同一轮 user/assistant 共享同一个 `ts`（毫秒）。记忆里的配图可通过 `GET /blue-fish/attachment?id=`（`sha256:…`）取回。

---

### DELETE `/blue-fish/chat?pet=`

删除记忆。

```http
DELETE http://127.0.0.1:3080/blue-fish/chat?pet=main
X-Blue-Fish-Token: <token>
```

| 查询  | 说明                                            |
| ----- | ----------------------------------------------- |
| `pet` | 必填                                            |
| `ts`  | 可重复；只删命中的轮（一轮两条共享 `ts`，成对删）。不传 = 清空该宠物全部记忆 |

#### 成功 `200`

```json
{ "ok": true, "removed": 2 }
```

---

### GET `/blue-fish/chat/memory`

列出**已删宠物**残留的对话历史摘要（宠物删了但历史还在，`GET /chat` 读不到；不含正文）。

```http
GET http://127.0.0.1:3080/blue-fish/chat/memory
X-Blue-Fish-Token: <token>
```

```json
{
  "ok": true,
  "orphans": [{ "entry": "main", "petId": "gone", "messages": 4, "lastTs": 1730000000000 }]
}
```

### DELETE `/blue-fish/chat/memory`

一次性清空全部孤儿记忆。

```json
{ "ok": true, "pets": 1, "messages": 4 }
```

---

## 气泡（不经过 / 经过模型）

### POST `/blue-fish/broadcast?pet=&surface=`（需锁）

让桌宠**原样显示**调用方给定的文字。不调用模型，只搬运进气泡。

适合：播报弹幕原文、固定话术、外部已生成好的回复。  
（能力上接近其它桌宠项目的「say」，但路径与字段不同。）

```http
POST http://127.0.0.1:3080/blue-fish/broadcast?pet=main&surface=desktop
Content-Type: application/json
X-Blue-Fish-Token: <token>

{
  "text": "大家好呀～",
  "duration": 10000,
  "anim": true
}
```

| 字段       | 类型    | 必填 | 说明                                                |
| ---------- | ------- | ---- | --------------------------------------------------- |
| `text`     | string  | 是   | trim 后非空；**不设服务端长度上限**（由调用方自控） |
| `duration` | number  | 否   | 气泡毫秒；缺省 **10000**；`0` = 不显示；负数非法    |
| `anim`     | boolean | 否   | 仅严格 `false` 关闭动画联动；缺省视为开启           |
| `image`    | string  | 否   | 表情包池内名称（与 `url` 二选一）                   |
| `url`      | string  | 否   | 外部图片 `http`/`https` 地址（与 `image` 二选一）   |

查询：`pet`、`surface` 必填；当前有占用时还须 `lock=<lockId>`。

#### 成功 `200`

```json
{ "ok": true }
```

成功表示已写入气泡状态；不保证用户已看完。要看实况请随后 `GET /blue-fish/state`。

#### 失败 reason 示例

`bad-request`、`pet-required`、`unknown-pet`、`unknown-image`、`pet-not-displayed`、`locked`、`lock-required`、`lock-lost`、`sleeping`。

---

### POST `/blue-fish/whisper?pet=&surface=`

立即让桌宠**自己生成**一句碎碎念（走模型），写入气泡并在响应中带回正文。

```http
POST http://127.0.0.1:3080/blue-fish/whisper?pet=main&surface=desktop
X-Blue-Fish-Token: <token>
```

可选查询：`image=`（指定池内表情包名）。

#### 成功 `200`

```json
{
  "ok": true,
  "text": "今天天气不错呢～",
  "image": "可选"
}
```

失败常见：`provider-missing`、`generate-error`、`unknown-pet`、`unknown-image`、`pet-not-displayed`、`sleeping`、`bad-request`。

---

### POST `/blue-fish/bubble/clear?pet=&surface=`（需锁）

收起该宠物当前说话气泡（只动气泡，不动动画）。幂等：没有气泡也返回成功。

```http
POST http://127.0.0.1:3080/blue-fish/bubble/clear?pet=main&surface=desktop
X-Blue-Fish-Token: <token>
```

```json
{ "ok": true }
```

当前有占用时须带 `?lock=`。

---

## 最小对接示例

### 1）先探活并拿宠物 id

```js
const base = 'http://127.0.0.1:3080';
const health = await fetch(`${base}/health`).then((r) => r.json());
const pet = health.pets?.[0]?.id;
if (!pet) throw new Error('没有可用宠物');
```

### 2）原样播报（需 token；桌面端带 surface=desktop）

```js
await fetch(
  `${base}/blue-fish/broadcast?pet=${encodeURIComponent(pet)}&surface=desktop`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Blue-Fish-Token': token,
    },
    body: JSON.stringify({ text: '大家好呀～' }),
  },
);
```

### 3）对话生成（需 token）

```js
const res = await fetch(
  `${base}/blue-fish/chat?pet=${encodeURIComponent(pet)}&surface=desktop`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Blue-Fish-Token': token,
    },
    body: JSON.stringify({ text: '鱼鱼你好' }),
  },
);
const body = await res.json();
if (!body.ok) throw new Error(`${body.reason}: ${body.message}`);
console.log(body.text); // 回复
```

---

## 其它接口一览

路径均相对于 `/blue-fish`。独立模式下写操作普遍需要令牌。细节见 [`API.md`](../API.md)。

### 读状态

| 路径              | 方法 | 一句话                                                                 |
| ----------------- | ---- | ---------------------------------------------------------------------- |
| `/state`          | GET  | **轮询唯一数据源**；`?since=&timeout=` 可长轮询（成对必填，上限 10s）  |
| `/config`         | GET  | 读合并后的成品配置                                                     |
| `/config/meta`    | GET  | 配置/日志/落盘路径与卸载 profile                                       |
| `/models`         | GET  | 可用服务商与模型清单                                                   |
| `/pose?pet=`      | GET  | 读**桌面端**宠物实况（位置 + 朝向）；网页端不走这条                    |

### 占用锁

| 路径                    | 方法 | 一句话                                      |
| ----------------------- | ---- | ------------------------------------------- |
| `/lock?pet=`            | POST | 取锁 / 续期，回 `lockId` + `expiresAt`      |
| `/lock/release?pet=`    | POST | 释放占用（`lockId` 或 `force`）             |

### 动作 / 位置

| 路径                         | 方法 | 一句话                                                         |
| ---------------------------- | ---- | -------------------------------------------------------------- |
| `/anim?pet=`                 | POST | **点播动画**（需锁）；回 `playbackId`                          |
| `/playback/{id}`             | GET  | 播放回执；`?wait=&timeout=` 可挂起等待                         |
| `/playback/{id}/report`      | POST | 渲染端上报（内部）                                             |
| `/pose/report?pet=`          | POST | 桌面渲染端上报实况（内部）                                     |
| `/position?pet=`             | POST | **位置控制**（需锁）                                           |
| `/throw?pet=`                | POST | **原生抛掷**（需锁）                                           |
| `/sleep?pet=` / `/wake?pet=` | POST | 睡下 / 叫醒                                                    |
| `/focus-session`             | POST | 跳到指定会话                                                   |
| `/balance`                   | POST | 立即刷新余额（气泡 + 档位动画）                                |

### 配置

| 路径           | 方法     | 一句话                                       |
| -------------- | -------- | -------------------------------------------- |
| `/config`      | PUT      | 保存用户层配置                               |
| `/config`      | POST     | 恢复默认                                     |
| `/pet-display` | POST     | 改单只显示位置（`web`/`desktop`/`both`/`none`） |
| `/pet-config`  | POST     | 按种类写回全部实例                           |
| `/reload`      | POST     | 重载桌面端                                   |
| `/obs-capture` | POST     | OBS 窗口捕获开关                             |
| `/quit`        | POST     | 退出（桌面）                                 |

### 菜单 / 语音 / 待办 / 工作状态

| 路径                                      | 方法            | 一句话                                      |
| ----------------------------------------- | --------------- | ------------------------------------------- |
| `/menu/item`                              | POST/DELETE     | 注册 / 清除第三方菜单项（收在「更多」下）   |
| `/menu/events?owner=&wait=`               | GET             | 查询菜单触发（读即清空，可长轮询）          |
| `/menu/click`                             | POST            | 渲染端上报点击（内部）                      |
| `/voice/speak`、`/voice/hear`、`/voice/voices` | POST/POST/GET | 合成 mp3 / 语音识别 / 音色列表              |
| `/todos`、`/todos/{id}`                   | GET/POST/PATCH/DELETE | 待办读写                              |
| `/work-status`                            | POST/DELETE     | 外部写入 / 清空工作状态                     |

### 素材

| 路径                          | 方法 | 一句话                                                      |
| ----------------------------- | ---- | ----------------------------------------------------------- |
| `/thumb/{petId}/{file}`       | GET  | 动画素材                                                    |
| `/font/{file}`                | GET  | 字体                                                        |
| `/pic/{file}`                 | GET  | 通知图标 / 表情包                                           |
| `/attachment?id=`             | GET  | 按记忆里的 `attachmentId` 取图                              |
| `/logo?root=`                 | GET  | 宠物头像；带 `root=` 取 pet pack 头像                       |
| `/pet-avatar?root=`           | POST | 上传头像（`root=main` 内置被拒）                            |

独立应用根路径另有：

| 路径               | 方法     | 一句话          |
| ------------------ | -------- | --------------- |
| `/`、`/health`     | GET      | 探活 / 状态     |
| `/shutdown`        | POST     | 停机（需令牌）  |
| `/standalone-ai/*` | GET/POST | AI 设置页与测试 |

---

## 与「蓝色大肥鱼」HTTP API 的差异（对接时注意）

| 点       | 蓝色大肥鱼         | dsh-pet                                                 |
| -------- | ------------------ | ------------------------------------------------------- |
| 端口     | 固定 `19265`       | 桌面应用固定 `3080`（占用失败）；CLI 首选 `3080` 可顺延 |
| 业务前缀 | 无 / 根路径        | **`/blue-fish`**                                        |
| 原样说话 | `POST /say`        | `POST /blue-fish/broadcast?pet=&surface=`               |
| 模型对话 | `POST /chat`       | `POST /blue-fish/chat?pet=&surface=`                    |
| 宠物参数 | 单宠，无 `pet`     | **几乎都要 `?pet=`**，写接口还要 **`?surface=`**        |
| 业务失败 | 常 `400`/`503`     | 常 **`200` + `ok:false`**                               |
| 鉴权     | 文档以本机开放为主 | 独立模式写接口 / chat / whisper **要令牌**              |

---

## 维护说明

- 业务前缀常量：`src/shared/constants.ts` → `ROUTE_SEGMENT`（`/blue-fish`）
- 对话路由：`src/host/routes/chat.ts`
- 气泡路由：`src/host/routes/interaction.ts`
- 独立鉴权：`src/standalone/request-security.ts`
- 默认端口：`src/standalone/server/options.ts` → `DEFAULT_STANDALONE_PORT`
- 完整契约：仓库根 [`API.md`](../API.md)、[`openapi.yaml`](../openapi.yaml)
