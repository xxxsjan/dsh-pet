# dsh-pet · 本机 HTTP API（对接说明）

给弹幕机、桌面端、其它本机程序调用。本文按「对接常用能力」写细，其余接口只列一览。

> 实现以源码为准；本文不承诺与蓝色大肥鱼 `19265` 端口或根路径 `/say`、`/chat` 兼容。

## 基本信息

| 项                   | 值                                              |
| -------------------- | ----------------------------------------------- |
| 端口（桌面应用）     | 固定 **`3080`**；被占用则**启动失败**，不换端口 |
| 端口（CLI 独立模式） | 首选 `3080`；被占用时向后顺延（最多约 25 个）   |
| 业务前缀             | `/dsh-pet-7340`                                 |
| 绑定                 | 本机回环（`127.0.0.1` / `localhost`）           |
| 编码                 | UTF-8                                           |
| 请求体               | `Content-Type: application/json`（写接口）      |

**Base URL 示例（桌面应用）**

```text
http://127.0.0.1:3080
```

业务接口完整路径形如：

```text
http://127.0.0.1:3080/dsh-pet-7340/chat?pet=main
```

桌宠未运行、`3080` 被占用导致启动失败、或鉴权失败时，接口不可用。可先请求 `GET /health` 确认进程与端口。

---

## 鉴权与访问边界（独立应用 / standalone）

独立 HTTP 服务启用本机能力令牌与来源校验：

1. **Host 必须是当前回环地址**：`127.0.0.1:<实际端口>` 或 `localhost:<实际端口>`。
2. **跨站 Origin / `Sec-Fetch-Site: cross-site` 会被拒绝**（`403`）。
3. **令牌**：请求头 `X-DSH-Pet-Token: <token>`（或同进程浏览器会话 cookie `dsh_pet_token`）。

### 哪些路径要令牌

| 类别                                  | 是否需要令牌 |
| ------------------------------------- | ------------ |
| `GET /`、`GET /health`                | 否           |
| `GET /dsh-pet-7340/state` 等多数只读  | 否           |
| `GET/POST/DELETE /dsh-pet-7340/chat*` | **是**       |
| `POST /dsh-pet-7340/whisper`          | **是**       |
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

- **作为 DSH 插件运行**：前缀仍是 `/dsh-pet-7340`，鉴权由宿主侧决定，不一定走上述 standalone 令牌模型。

---

## 统一响应约定

插件业务路由（`/dsh-pet-7340/...`）约定：

| 情况                                     | HTTP 状态                | 响应体                                                          |
| ---------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| 业务成功                                 | `200`                    | `{ "ok": true, ... }`                                           |
| 业务失败（缺参、未知宠物、模型不可用等） | **`200`**                | `{ "ok": false, "reason": "...", "message": "..." }`            |
| 协议失败（非法 JSON、方法不对、体过大）  | `400` / `405` / `413` 等 | 同上失败实体形状                                                |
| 未预期内部错误                           | `500`                    | `{ "ok": false, "reason": "internal-error", "message": "..." }` |

对接方请以 **`ok` 字段** 判断成败，不要只看 HTTP 状态码。

常见 `reason`：`bad-request`、`pet-required`、`unknown-pet`、`pet-not-displayed`、`provider-missing`、`generate-error`、`locked`、`sleeping`、`invalid-json`、`method-not-allowed`。

### 查询参数惯例

| 参数      | 说明                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `pet`     | 宠物 id，**多数动作接口必填**且必须在配置中真实存在                      |
| `surface` | 可选：`web` / `desktop` 等；部分写接口用来校验显示面、决定语音由哪一端念 |
| `lockId`  | 占用锁场景；持锁期间其它调用方可能被拒                                   |

睡觉中的宠物会对一批「打扰类」写接口返回 `sleeping`（含 `POST /chat`、`broadcast`、`whisper` 等）。

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
  "name": "dsh-pet-app",
  "version": "…",
  "pid": 12345,
  "port": 3080,
  "configFile": "…",
  "pets": [{ "id": "main", "name": "…", "display": "desktop" }]
}
```

可用 `pets[].id` 作为后续接口的 `?pet=`。

---

## 对话

前缀：`/dsh-pet-7340`。独立模式下 **读写均需令牌**。

### POST `/dsh-pet-7340/chat?pet=`

把用户文本交给已配置的模型生成回复；成功时写入对话记忆，并通常会推到桌宠气泡。

适合：观众弹幕 / 外部程序 → 桌宠回话。

#### 请求

```http
POST http://127.0.0.1:3080/dsh-pet-7340/chat?pet=main
Content-Type: application/json
X-DSH-Pet-Token: <token>

{
  "text": "你好呀"
}
```

| 字段         | 类型   | 必填 | 说明                                             |
| ------------ | ------ | ---- | ------------------------------------------------ |
| `text`       | string | 是   | trim 后非空，最长 **2000** 字                    |
| `attachment` | object | 否   | 配图；**独立模式通常不支持**（缺附件服务会失败） |

`attachment` 形状（仅宿主提供附件服务时可用）：

```json
{
  "mediaType": "image/png",
  "data": "<base64>"
}
```

`mediaType` 白名单：`image/png` / `image/jpeg` / `image/webp` / `image/gif`。

可选查询：`surface=`（POST 会校验宠物是否显示在该面）。

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

| reason 示例                    | 情况                         |
| ------------------------------ | ---------------------------- |
| `bad-request`                  | 空消息、过长、图片参数非法等 |
| `pet-required` / `unknown-pet` | 未传或找不到宠物             |
| `provider-missing`             | 未配置可用模型               |
| `generate-error`               | 生成/IO 失败                 |
| `sleeping`                     | 宠物在睡                     |

非法 JSON → HTTP `400` + `invalid-json`。

---

### GET `/dsh-pet-7340/chat?pet=`

读该宠物最近对话记忆窗口（一次读取，不是轮询）。

```http
GET http://127.0.0.1:3080/dsh-pet-7340/chat?pet=main&rounds=20
X-DSH-Pet-Token: <token>
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

同一轮 user/assistant 共享同一个 `ts`（毫秒）。

---

### DELETE `/dsh-pet-7340/chat?pet=`

删除记忆。

```http
DELETE http://127.0.0.1:3080/dsh-pet-7340/chat?pet=main
X-DSH-Pet-Token: <token>
```

| 查询  | 说明                                            |
| ----- | ----------------------------------------------- |
| `pet` | 必填                                            |
| `ts`  | 可重复；只删命中的轮。不传 = 清空该宠物全部记忆 |

#### 成功 `200`

```json
{ "ok": true, "removed": 2 }
```

---

### GET `/dsh-pet-7340/chat/memory`

列出**配置里已不存在**的宠物残留记忆摘要（不含正文）。

```http
GET http://127.0.0.1:3080/dsh-pet-7340/chat/memory
X-DSH-Pet-Token: <token>
```

```json
{
  "ok": true,
  "orphans": [{ "entry": "main", "petId": "gone", "messages": 4, "lastTs": 1730000000000 }]
}
```

### DELETE `/dsh-pet-7340/chat/memory`

一次性清空全部孤儿记忆。

```json
{ "ok": true, "pets": 1, "messages": 4 }
```

---

## 气泡（不经过 / 经过模型）

### POST `/dsh-pet-7340/broadcast?pet=`

让桌宠**原样显示**调用方给定的文字。不调用模型。

适合：播报弹幕原文、固定话术、外部已生成好的回复。  
（能力上接近其它桌宠项目的「say」，但路径与字段不同。）

```http
POST http://127.0.0.1:3080/dsh-pet-7340/broadcast?pet=main
Content-Type: application/json
X-DSH-Pet-Token: <token>

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

可选查询：`surface=`、`lockId=`（有锁时仅持锁方可投喂）。

#### 成功 `200`

```json
{ "ok": true }
```

成功表示已写入气泡状态；不保证用户已看完。

#### 失败 reason 示例

`bad-request`、`pet-required`、`unknown-pet`、`unknown-image`、`pet-not-displayed`、`locked`、`sleeping`。

---

### POST `/dsh-pet-7340/whisper?pet=`

立即让桌宠**自己生成**一句碎碎念（走模型），写入气泡并在响应中带回正文。

```http
POST http://127.0.0.1:3080/dsh-pet-7340/whisper?pet=main
X-DSH-Pet-Token: <token>
```

可选查询：`image=`（指定池内表情包名）、`surface=`。

#### 成功 `200`

```json
{
  "ok": true,
  "text": "今天天气不错呢～",
  "image": "可选"
}
```

失败常见：`provider-missing`、`generate-error`、`unknown-pet`、`unknown-image`、`sleeping`。

---

### POST `/dsh-pet-7340/bubble/clear?pet=`

收起该宠物当前说话气泡。幂等：没有气泡也返回成功。

```http
POST http://127.0.0.1:3080/dsh-pet-7340/bubble/clear?pet=main
X-DSH-Pet-Token: <token>
```

```json
{ "ok": true }
```

---

## 最小对接示例

### 1）先探活并拿宠物 id

```js
const base = 'http://127.0.0.1:3080';
const health = await fetch(`${base}/health`).then((r) => r.json());
const pet = health.pets?.[0]?.id;
if (!pet) throw new Error('没有可用宠物');
```

### 2）原样播报（需 token）

```js
await fetch(`${base}/dsh-pet-7340/broadcast?pet=${encodeURIComponent(pet)}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-DSH-Pet-Token': token,
  },
  body: JSON.stringify({ text: '大家好呀～' }),
});
```

### 3）对话生成（需 token）

```js
const res = await fetch(`${base}/dsh-pet-7340/chat?pet=${encodeURIComponent(pet)}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-DSH-Pet-Token': token,
  },
  body: JSON.stringify({ text: '鱼鱼你好' }),
});
const body = await res.json();
if (!body.ok) throw new Error(`${body.reason}: ${body.message}`);
console.log(body.text); // 回复
```

---

## 其它接口一览

路径均相对于 `/dsh-pet-7340`（素材类除外说明）。独立模式下写操作普遍需要令牌。

| 路径                                           | 方法            | 一句话                           |
| ---------------------------------------------- | --------------- | -------------------------------- |
| `/state`                                       | GET             | 轮询快照（气泡、动画、锁等叶子） |
| `/models`                                      | GET             | 模型相关状态                     |
| `/work-status`                                 | GET/相关        | 工作状态                         |
| `/balance`                                     | GET/刷新相关    | 余额展示                         |
| `/config`                                      | GET/PUT 等      | 读写配置                         |
| `/config/meta`                                 | GET             | 配置元信息                       |
| `/pet-display`                                 | POST            | 改单只宠物显示位置               |
| `/pet-config`                                  | POST            | 写宠物层配置                     |
| `/obs-capture`                                 | POST            | OBS 窗口捕获开关                 |
| `/lock`、`/lock/release`                       | POST            | 占用锁取锁/续期/释放             |
| `/anim`                                        | POST            | 点播动画                         |
| `/position`、`/throw`                          | POST            | 位置 / 抛掷                      |
| `/pose`、`/pose/report`                        | POST            | 姿势                             |
| `/playback`、`/playback/...`                   | GET/POST        | 点播回执与等待                   |
| `/sleep`、`/wake`                              | POST            | 睡觉 / 叫醒                      |
| `/menu/item`、`/menu/events`、`/menu/click`    | 各异            | 右键菜单                         |
| `/voice/voices`、`/voice/speak`、`/voice/hear` | GET/POST        | 语音相关                         |
| `/todos`                                       | GET/POST/DELETE | 待办                             |
| `/attachment`                                  | GET 等          | 附件取回（宿主模式）             |
| `/pet-avatar`                                  | POST            | 上传头像                         |
| `/focus-session`                               | 相关            | 专注会话                         |
| `/reload`、`/quit`                             | POST            | 重载 / 退出（桌面）              |
| `/logo`、`/pic/...`                            | GET             | Logo / 通知图 / 表情包静态资源   |

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
| 原样说话 | `POST /say`        | `POST /dsh-pet-7340/broadcast?pet=`                     |
| 模型对话 | `POST /chat`       | `POST /dsh-pet-7340/chat?pet=`                          |
| 宠物参数 | 单宠，无 `pet`     | **几乎都要 `?pet=`**                                    |
| 业务失败 | 常 `400`/`503`     | 常 **`200` + `ok:false`**                               |
| 鉴权     | 文档以本机开放为主 | 独立模式写接口 / chat / whisper **要令牌**              |

---

## 维护说明

- 业务前缀常量：`src/shared/constants.ts` → `ROUTE_SEGMENT`
- 对话路由：`src/host/routes/chat.ts`
- 气泡路由：`src/host/routes/interaction.ts`
- 独立鉴权：`src/standalone/request-security.ts`
- 默认端口：`src/standalone/server/options.ts` → `DEFAULT_STANDALONE_PORT`
