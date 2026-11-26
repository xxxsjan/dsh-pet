/**
 * OBS 浏览器源的页面外壳：透明底、无交互，只挂一个宠物舞台与同源脚本。
 *
 * 样式与桌面端气泡同源（同一套字号与白泡尾巴），但不含菜单、拖拽与聊天面板；
 * 页面不内联脚本，素材与接口都按文档地址相对解析，因此反代挂子路径时同样可用。
 * @module dsh-pet/src/host/obs-page
 */

/** OBS 浏览器源页面 HTML；脚本与素材都相对页面地址解析。 */
export function obsPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; media-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self'">
<title>dsh-pet OBS 浏览器源</title>
<style>
@font-face{font-family:"ShangshouSoftCandy";src:url("font/上首软糖体.ttf") format("truetype");font-display:swap;font-weight:400}
html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden;user-select:none}
#obs-stage{position:fixed;inset:0;display:flex;align-items:flex-end;justify-content:center;gap:24px;padding:0 24px 24px;box-sizing:border-box;pointer-events:none}
.obs-pet{position:relative;flex:0 0 auto;pointer-events:none}
.obs-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:0;transition:opacity .18s ease}
.obs-video.is-front{opacity:1}
.obs-pet.is-pet-hidden .obs-video{visibility:hidden}
.obs-bubble{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% - var(--obs-size,462px)*0.108);width:max-content;min-width:calc(var(--f,21px)*5.7143);max-width:min(calc(var(--f,21px)*16),100%);box-sizing:content-box;padding:calc(var(--f,21px)*0.4835) calc(var(--f,21px)*0.6593);border-radius:calc(var(--f,21px)*0.7692);background:rgba(255,255,255,.92);color:#2b2b2b;font-family:"ShangshouSoftCandy","Yuanti SC","YouYuan","幼圆","Comic Sans MS","PingFang SC","Microsoft YaHei",sans-serif;font-size:var(--f,21px);line-height:1.6;z-index:3;pointer-events:none;box-shadow:0 calc(var(--f,21px)*0.1978) calc(var(--f,21px)*0.7692) rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08);backdrop-filter:blur(6px);opacity:0;transition:opacity .25s ease;white-space:normal;overflow-wrap:break-word}
.obs-bubble::after{content:"";position:absolute;left:50%;bottom:calc(var(--f,21px)*-0.3736);transform:translateX(-50%);border:calc(var(--f,21px)*0.3736) solid transparent;border-top-color:rgba(255,255,255,.92);border-bottom:none}
.obs-bubble.is-on{opacity:1}
.obs-bubble.is-compact{font-size:calc(var(--f,21px)*0.7473);min-width:calc(var(--f,21px)*2.1978);max-width:min(calc(var(--f,21px)*10.989),100%)}
</style>
</head>
<body>
<div id="obs-stage" role="img" aria-label="桌宠直播画面"></div>
<script src="obs.js" defer></script>
</body>
</html>`;
}
