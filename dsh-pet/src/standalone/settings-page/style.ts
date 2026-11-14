/**
 * 设置页样式：iOS 风浅/深色令牌（手动 `data-theme`，默认亮色），布局仍是侧栏 + 内容区。
 *
 * 选择器继续用 `--dsw-*` 名字，方便对话面板 PANEL_CSS 共用；色值对齐直播弹幕页。
 * 不内联样式、不引 CDN：页面 CSP 是 default-src 'none'。
 * @module dsh-pet/src/standalone/settings-page/style
 */
import { PANEL_CSS } from '../../client/chat/panel-css.ts';

/** 设置页样式表。 */
export const settingsStyle = `:root{
  color-scheme:light;
  --dsw-static-neutral-bluish-00:#ffffff;--dsw-static-neutral-bluish-50:#f2f2f7;--dsw-static-neutral-bluish-75:#ebebf0;
  --dsw-static-neutral-bluish-100:#e5e5ea;--dsw-static-neutral-bluish-200:#d1d1d6;--dsw-static-neutral-bluish-300:#c7c7cc;
  --dsw-static-neutral-bluish-600:#8e8e93;--dsw-static-neutral-bluish-700:#636366;--dsw-static-neutral-bluish-1000:#1c1c1e;
  --dsw-static-blue-500:#007aff;--dsw-static-red-500:#ff3b30;--dsw-static-green-600:#34c759;
  --dsw-alias-bg-base:#f2f2f7;--dsw-alias-bg-layer-2:#ffffff;
  --dsw-alias-label-primary:#1c1c1e;--dsw-alias-label-secondary:#3a3a3c;
  --dsw-alias-label-tertiary:#8e8e93;
  --dsw-alias-border-l1:rgba(60,60,67,.08);--dsw-alias-border-l2:rgba(60,60,67,.12);--dsw-alias-border-l3:rgba(60,60,67,.18);--dsw-alias-border-l4:rgba(60,60,67,.22);
  --dsw-alias-interactive-bg-hover:rgba(120,120,128,.12);--dsw-alias-interactive-bg-active:rgba(120,120,128,.18);
  --dsw-alias-settings-card-fill:#ffffff;--dsw-alias-settings-card-stroke:transparent;
  --dsw-specific-sidebar-nav-item-active:rgba(120,120,128,.16);
  --dsw-elevation-prominent:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06);
  --dsw-alias-bg-mask-1:rgba(0,0,0,.42);
  --dsw-radius-xs:6px;--dsw-radius-sm:10px;--dsw-radius-md:12px;--dsw-radius-lg:16px;--dsw-radius-panel:28px;
  --dsw-font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","PingFang SC","Helvetica Neue","Segoe UI","Microsoft YaHei",sans-serif;
  --dsh-scrollbar-thumb:rgba(60,60,67,.28);--dsh-scrollbar-thumb-hover:rgba(60,60,67,.42);
  --dsh-sidebar-width:208px;--dsh-content-width:880px;
  --dsw-static-neutral-00:#ffffff;--dsw-alias-bg-layer-1:#ffffff;
  --dsw-font-s-14:14px/1.55 var(--dsw-font-family);--dsw-font-xxs-12:12px/1.55 var(--dsw-font-family);
  --dsw-font-xxxs-11:11px/1.45 var(--dsw-font-family);
  --dsw-radius-xl:20px;
  --dsw-specific-bubble:#e8f0fe;--dsw-specific-input-major:var(--dsw-alias-bg-layer-2);
  --dsw-alias-bg-module-platform:#ebebf0;--dsw-alias-bg-multi-select:rgba(0,122,255,.14);
  --dsw-alias-button-info-fill:#007aff;--dsw-alias-button-info-hover:#0062cc;
  --dsw-alias-interactive-bg-hover-danger:rgba(255,59,48,.14);
  --dsw-alias-label-caption:#8e8e93;
  --dsw-alias-label-primary-foreground:#ffffff;
  --dsw-alias-state-business-primary:#007aff;
  --dsw-alias-state-error-primary:#ff3b30;--dsw-alias-state-error-secondary:#ff3b30;
  --dsw-alias-tooltip-bg:#1c1c1e;
  --ds-ease-in-out:cubic-bezier(.4,0,.2,1);--ds-transition-duration-fast:.12s;
}
html[data-theme=dark]{
    color-scheme:dark;
    --dsw-static-neutral-bluish-00:#1c1c1e;--dsw-static-neutral-bluish-50:#000000;--dsw-static-neutral-bluish-75:#2c2c2e;
    --dsw-static-neutral-bluish-100:#3a3a3c;--dsw-static-neutral-bluish-200:#48484a;--dsw-static-neutral-bluish-300:#636366;
    --dsw-static-neutral-bluish-600:#98989d;--dsw-static-neutral-bluish-700:#aeaeb2;--dsw-static-neutral-bluish-1000:#f5f5f7;
    --dsw-static-blue-500:#0a84ff;--dsw-static-red-500:#ff453a;--dsw-static-green-600:#30d158;
    --dsw-alias-bg-base:#000000;--dsw-alias-bg-layer-2:#1c1c1e;
    --dsw-alias-label-primary:#f5f5f7;--dsw-alias-label-secondary:#ebebf5;
    --dsw-alias-label-tertiary:#98989d;
    --dsw-alias-border-l1:rgba(84,84,88,.36);--dsw-alias-border-l2:rgba(84,84,88,.48);--dsw-alias-border-l3:rgba(84,84,88,.58);--dsw-alias-border-l4:rgba(84,84,88,.65);
    --dsw-alias-interactive-bg-hover:rgba(120,120,128,.24);--dsw-alias-interactive-bg-active:rgba(120,120,128,.32);
    --dsw-alias-settings-card-fill:#1c1c1e;--dsw-alias-settings-card-stroke:transparent;
    --dsw-specific-sidebar-nav-item-active:rgba(120,120,128,.32);
    --dsw-elevation-prominent:0 1px 2px rgba(0,0,0,.35),0 8px 28px rgba(0,0,0,.45);
    --dsw-alias-bg-mask-1:rgba(0,0,0,.58);
    --dsh-scrollbar-thumb:rgba(235,235,245,.28);--dsh-scrollbar-thumb-hover:rgba(235,235,245,.42);
    --dsw-static-neutral-00:#1c1c1e;--dsw-alias-bg-layer-1:#2c2c2e;
    --dsw-specific-bubble:#1a2f4d;--dsw-specific-input-major:var(--dsw-alias-bg-layer-2);
    --dsw-alias-bg-module-platform:#2c2c2e;--dsw-alias-bg-multi-select:rgba(10,132,255,.22);
    --dsw-alias-button-info-fill:#0a84ff;--dsw-alias-button-info-hover:#409cff;
    --dsw-alias-interactive-bg-hover-danger:rgba(255,69,58,.18);
    --dsw-alias-label-caption:#98989d;
    --dsw-alias-label-primary-foreground:#ffffff;
    --dsw-alias-state-business-primary:#0a84ff;
    --dsw-alias-state-error-primary:#ff453a;--dsw-alias-state-error-secondary:#ff453a;
    --dsw-alias-tooltip-bg:#2c2c2e;
}
.topbarTrail{display:flex;align-items:center;gap:10px;flex:none}
.themeBtn{width:40px;height:40px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:980px}
.themeBtn .themeIcon{width:22px;height:22px;display:block}
.themeBtn .themeIcon--sun{display:none}
html[data-theme=dark] .themeBtn .themeIcon--moon{display:none}
html[data-theme=dark] .themeBtn .themeIcon--sun{display:block}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{height:100%}
body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:15px/1.47 var(--dsw-font-family);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--dsw-static-blue-500)}
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--dsh-scrollbar-thumb);border-radius:99px;border:3px solid transparent;background-clip:content-box}::-webkit-scrollbar-thumb:hover{background:var(--dsh-scrollbar-thumb-hover);background-clip:content-box}
.shell{display:grid;grid-template-columns:var(--dsh-sidebar-width) minmax(0,1fr);width:100vw;height:100vh;overflow:hidden;background:var(--dsw-alias-bg-base)}
.side{display:flex;flex-direction:column;min-width:0;min-height:0;padding:14px 10px 10px;background:var(--dsw-alias-bg-layer-2);border-right:.5px solid var(--dsw-alias-border-l2)}
.brand{display:flex;align-items:center;gap:9px;padding:2px 8px 14px;font-size:15px;font-weight:650;line-height:22px;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.brandLogo{flex:none;width:24px;height:24px;border-radius:var(--dsw-radius-sm);object-fit:cover;background:var(--dsw-alias-bg-layer-1)}
.nav{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}
.navList{display:flex;flex-direction:column;gap:2px;min-height:0;overflow-y:auto}
.navCell{display:flex;align-items:center;gap:9px;height:36px;padding:0 10px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
a.navCell{text-decoration:none;color:inherit;box-sizing:border-box}
.navCell:hover{background:var(--dsw-alias-interactive-bg-hover)}
.navCell[aria-selected=true]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:560}
.navGlyph{flex:none;width:16px;height:16px;display:block}
.navLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sideFoot{flex:none;margin-top:10px;padding:9px 10px 2px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.main{display:flex;flex-direction:column;min-width:0;min-height:0}
.topbar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;height:56px;padding:0 30px;background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.topbarLead{display:flex;align-items:center;gap:12px;min-width:0}
.pageTitle{margin:0;font-size:17px;font-weight:650;line-height:24px;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.dirty{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.saveHint{font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.saveHint[data-ok=true]{color:var(--dsw-static-green-600)}
.saveHint[data-error=true]{color:var(--dsw-static-red-500)}
.options{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}
.panel{display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden}
.scroll{flex:1;min-height:0;overflow-y:auto;padding:22px 30px 4px}
.scroll>*{width:100%;max-width:var(--dsh-content-width);margin-left:auto;margin-right:auto}
/* 对话面板自己管内边距与滚动，这里只负责给它一个确定高度的容器；宽度收窄到对话合适的尺寸。 */
.pet-chat-host{display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden;width:100%;max-width:640px;margin-left:auto;margin-right:auto}
/* 配置面板：Tab 与内容区共用一个居中容器，宽度适配两列宠物卡片。 */
.scroll>.configContent{width:100%;max-width:720px;margin-left:auto;margin-right:auto}
/* 配置页多列瀑布流：桌宠/全局卡同列填；条目 tabs / 空态通栏。
   窄屏 1 列、常态 2 列；视口够宽时放宽内容区并升到 3 列（见下方 media）。 */
#pet-cards{display:flex;flex-direction:column;gap:14px}
#pet-cards>.card{width:100%}
#pet-cards>.tabs,#pet-cards>.empty{width:100%}
.card{background:var(--dsw-alias-settings-card-fill);border:0;border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-prominent);padding:18px 20px;margin-bottom:14px}
#pet-cards>.card:first-child{margin-top:2px}
/* 模型 / 语音设置：嵌入配置 Tab 内，宽度与容器一致 */
#model-settings-host,#voice-settings-host{width:100%}
#model-settings-host #settings,#voice-settings-host #voice-host{margin:0}
#model-settings-host .card,#voice-settings-host .card{margin-bottom:12px}
.cardHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 4px}
.cardTitle{margin:0;font-size:15px;font-weight:650;line-height:22px}
.cardHint{margin:0 0 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}
.field{margin:12px 0 0}
.field>label,.fieldLabel{display:block;margin:0 0 6px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary);letter-spacing:.01em}
.fieldHint{margin:6px 0 0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}
input[type=text],input[type=url],input[type=password],input[type=number],select,textarea{display:block;width:100%;min-height:36px;padding:8px 12px;border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:15px}
textarea{min-height:72px;resize:vertical;line-height:1.55}
input:hover,select:hover,textarea:hover{background:var(--dsw-alias-interactive-bg-active)}
/* :where() 把元素选择器权重降到 0：对话面板用「外层容器 focus-within 变色」代替逐控件焦点环，
   保持 input:focus-visible 的 (0,1,1) 会压过面板里的 .pet-chat-input{outline:none}，把焦点环画进输入框。 */
:where(input,select,textarea,button):focus-visible,.navCell:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-static-blue-500) 55%,transparent);outline-offset:1px}
input:disabled,select:disabled,textarea:disabled{opacity:.55;cursor:not-allowed}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.rowCheck{display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-top:.5px solid var(--dsw-alias-border-l1);cursor:pointer}
.rowCheck:first-of-type{border-top:0}
.rowCheck input{width:16px;height:16px;margin:3px 0 0;accent-color:var(--dsw-static-blue-500);flex:none}
.rowCheckText{min-width:0}
.rowCheckTitle{display:block;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);line-height:1.5}
.rowCheckHint{display:block;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}
.btn{height:32px;padding:0 14px;border:0;border-radius:980px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-static-blue-500);font:560 13px/1 var(--dsw-font-family);cursor:pointer;white-space:nowrap}
.btn:hover{background:var(--dsw-alias-interactive-bg-active)}
.btn:active{transform:scale(.98)}
.btn.primary{background:var(--dsw-static-blue-500);border-color:transparent;color:#fff}
.btn.primary:hover{background:var(--dsw-alias-button-info-hover);opacity:1}
.btn.ghost{border-color:transparent;background:transparent;color:var(--dsw-static-blue-500)}
.btn.ghost:hover{background:var(--dsw-alias-interactive-bg-hover)}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.configTabs{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 16px;padding-bottom:2px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.configTab{height:30px;padding:0 14px;border:0;border-radius:980px 980px 0 0;background:transparent;color:var(--dsw-alias-label-secondary);font:560 13px/1 var(--dsw-font-family);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-.5px}
.configTab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.configTab[aria-selected=true]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-static-blue-500)}
.tab{height:30px;padding:0 12px;border:0;border-radius:980px;background:transparent;color:var(--dsw-alias-label-secondary);font:560 13px/1 var(--dsw-font-family);cursor:pointer}
.tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.tab[aria-selected=true]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary)}
.footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-top:.5px solid var(--dsw-alias-border-l1)}
.status{margin:0;min-height:20px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}
.status[data-error=true]{color:var(--dsw-static-red-500)}
.status[data-ok=true]{color:var(--dsw-static-green-600)}
.pathRow{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;color:var(--dsw-alias-label-secondary);border-top:.5px solid var(--dsw-alias-border-l1)}
.pathRow:first-child{border-top:0}
.pathKey{flex:none;width:80px;color:var(--dsw-alias-label-tertiary)}
.pathValue{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:11.5px}
.hintInline{font-weight:400;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.testRow{display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap}
.combo{position:relative;display:flex;align-items:center}
.combo input{padding-right:40px}
.comboToggle{position:absolute;right:4px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:var(--dsw-radius-xs);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.comboToggle:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.comboToggle:disabled{opacity:.45;cursor:not-allowed}
.keyActions{display:flex;justify-content:flex-end;margin-top:8px}
.keyActions .btn{height:26px;padding:0 10px;font-size:12px}
.avatarRow{display:flex;align-items:center;gap:12px;margin:0 0 14px}
.avatarImg{flex:none;width:56px;height:56px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);object-fit:cover;background:var(--dsw-alias-bg-layer-1)}
.avatarBox{display:flex;flex-direction:column;gap:6px;min-width:0;align-items:flex-start}
.avatarBox .fieldHint{margin:0}
.avatarBox .status{margin:0;min-height:0}
.gridTight{margin-top:14px}
.fieldTight{margin:0}
.fineprint{margin:8px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.petBar{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.select{position:relative}
.selectTrigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:36px;padding:8px 12px;border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:15px;text-align:left;cursor:pointer}
.selectTrigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.selectTrigger:disabled{opacity:.55;cursor:not-allowed}
.selectValue{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.selectChevron{flex:none;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);transition:transform .1s ease}
.selectTrigger[aria-expanded=true] .selectChevron{transform:rotate(180deg)}
.selectMenu{position:fixed;z-index:60;margin:0;padding:4px;list-style:none;overflow-y:auto;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-elevation-prominent)}
.selectItem{padding:7px 10px;border-radius:var(--dsw-radius-sm);font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.selectItem:hover,.selectItem.active{background:var(--dsw-alias-interactive-bg-hover)}
.selectItem[aria-selected=true]{background:var(--dsw-specific-sidebar-nav-item-active);font-weight:560}
.dialogMask{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1)}
.dialog{width:min(420px,100%);padding:20px 22px 16px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.dialogTitle{margin:0 0 8px;font-size:17px;font-weight:650;line-height:22px}
.dialogText{margin:0;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-line;word-break:break-word}
.dialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.personaWrap{position:relative}
.personaWrap textarea{min-height:150px;resize:vertical}
.personaCount{position:absolute;right:10px;bottom:8px;padding:2px 5px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-2);font-size:11px;line-height:1.2;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.btn.danger{background:color-mix(in srgb,var(--dsw-static-red-500) 14%,transparent);border-color:transparent;color:var(--dsw-static-red-500)}
.btn.danger:hover{background:color-mix(in srgb,var(--dsw-static-red-500) 22%,transparent);opacity:1}
.petBar .select{flex:1;min-width:0}
.empty{padding:16px 0;font-size:13px;color:var(--dsw-alias-label-tertiary)}
/* 抖音弹幕分区：表单沿用设置页控件，状态与弹幕流各自成卡。 */
.dmLabelRow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px}
.dmLabelRow .fieldLabel{margin:0}
.dmLinkBtn{height:26px;padding:0 10px;font-size:12px}
.dmPersist{display:inline-flex;align-items:center;gap:8px;margin:8px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary);cursor:pointer;user-select:none}
.dmPersist input{flex:none;width:16px;height:16px;margin:0;accent-color:var(--dsw-static-blue-500)}
.dmSwitches{margin:14px 0 0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}
.dmSwitch{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;font-size:14px;color:var(--dsw-alias-label-primary);cursor:pointer;user-select:none;border-top:.5px solid var(--dsw-alias-border-l2)}
.dmSwitch:first-child{border-top:0}
.dmSwitch input{position:relative;flex:none;width:42px;height:24px;margin:0;border-radius:999px;background:var(--dsw-alias-border-l3);-webkit-appearance:none;appearance:none;cursor:pointer;transition:background-color .15s ease}
.dmSwitch input::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s ease}
.dmSwitch input:checked{background:var(--dsw-static-green-600)}
.dmSwitch input:checked::after{transform:translateX(18px)}
.dmActions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 0}
.dmCardHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 10px}
.dmCardHead .cardTitle{margin:0}
.dmFeedMeta{flex:none;padding:2px 9px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dmStatusBox{padding:12px 14px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary);word-break:break-word}
.dmPill{display:inline-flex;align-items:center;margin:0 0 6px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-tertiary)}
.dmPill.on{background:color-mix(in srgb,var(--dsw-static-green-600) 16%,transparent);color:var(--dsw-static-green-600)}
.dmPill.off{background:color-mix(in srgb,var(--dsw-static-red-500) 12%,transparent);color:var(--dsw-static-red-500)}
.dmStatusLine{display:block;white-space:pre-line}
.dmFeed{display:flex;flex-direction:column;gap:8px;min-height:120px;overflow-y:auto;padding:10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);font-size:13px;line-height:1.5}
.dmFeed:empty::before{content:"开始监听后，弹幕会出现在这里";margin:auto;padding:20px 12px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dmFeedItem{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:start;padding:9px 11px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);box-shadow:0 1px 2px rgba(0,0,0,.05)}
.dmFeedItem.gift{background:color-mix(in srgb,#ff9500 12%,var(--dsw-alias-bg-layer-2))}
.dmFeedKind{padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;background:color-mix(in srgb,var(--dsw-static-blue-500) 14%,transparent);color:var(--dsw-static-blue-500)}
.dmFeedItem.gift .dmFeedKind{background:color-mix(in srgb,#ff9500 18%,transparent);color:#c96a00}
.dmFeedBody{display:flex;flex-direction:column;gap:2px;min-width:0}
.dmFeedNick{font-size:12px;font-weight:560;color:var(--dsw-alias-label-tertiary);word-break:break-word}
.dmFeedText{color:var(--dsw-alias-label-primary);word-break:break-word}
.dmFeedTime{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dmGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
.dmLeft{display:flex;flex-direction:column;gap:14px;min-width:0}
.dmRight{display:flex;flex-direction:column;min-width:0}
.dmRight .card{display:flex;flex-direction:column;min-height:0}
.dmRight .dmFeed{min-height:200px;max-height:60vh;overflow-y:auto}
#panel-danmaku .scroll{overflow-y:auto;padding-bottom:22px}
/* 宽屏：内容区加宽到约三列舒适宽度（侧栏约 208 + 内边距后，视口 ≥1400 才够用）。 */
@media(min-width:1400px){
  :root{--dsh-content-width:1240px}
}
@media(max-width:767px){
  .shell{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .side{padding:10px 8px 8px;border-right:0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
  .brand{padding:0 6px 10px}
  .nav{flex:none}
  .navList{flex-direction:row;gap:4px;padding-bottom:2px;overflow-x:auto;overflow-y:hidden}
  .navCell{flex:0 0 auto;padding:0 12px}
  .navLabel{flex:none}
  .sideFoot{display:none}
  .topbar{height:48px;padding:0 16px}
  .scroll{padding:16px 16px 4px}
  .grid2,.grid3{grid-template-columns:1fr}
  .dmGrid{grid-template-columns:1fr}
  .dmRight .dmFeed{min-height:200px;max-height:42vh}
}
@media(prefers-reduced-motion:no-preference){.navCell,.btn,.tab{transition:background-color .12s ease,color .12s ease,opacity .12s ease}}
${PANEL_CSS}
`;
