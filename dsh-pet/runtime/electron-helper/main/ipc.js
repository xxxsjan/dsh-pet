'use strict';
const path = require('node:path');
const { BrowserWindow, desktopCapturer, screen } = require('electron');
const { decideWindowIgnore } = require('../pointer-target.js');
/**
 * 渲染端到主进程的 ipc：窗口跟随、飞行状态、碰撞转发、穿透翻转、输入租约与菜单首项（打开软件 / 打开 AI 设置）。
 *
 * 唯一的窗口状态入口是 windows 模块导出的方法与 state；本模块不自己存任何状态（设置窗口是独立普通窗口，不算宠物窗）。
 * @module dsh-pet/runtime/electron-helper/main/ipc
 */

/**
 * 注册全部 ipc 处理器。
 *
 * @param deps.ipcMain - Electron ipcMain。
 * @param deps.petWindows - 窗口能力（state 与方法）。
 * @param deps.shell - Electron shell（打开站点 / 唤起应用）。
 * @param deps.openTarget - 菜单首项的去向：desktop 唤起桌面应用；standalone 应用内窗口打开本机设置页；web 交给默认浏览器。
 * @param deps.petRoute - 宠物路由前缀。
 * @param deps.dpi - DPI 能力（forcedScale / primaryScale）：设置窗口按真实主屏缩放还原。
 */
function registerIpc({ ipcMain, petWindows, shell, openTarget, petRoute, dpi }) {
  // 宠物窗口跟随：renderer 逐帧上报窗口内容区位置/尺寸
  ipcMain.on('pet:set-bounds', (event, bounds) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const x = Number(bounds?.x);
    const y = Number(bounds?.y);
    const width = Number(bounds?.width);
    const height = Number(bounds?.height);
    if (![x, y, width, height].every(Number.isFinite)) return;
    // 去重必须比较我们上一次请求的值，绝不能拿 win.getContentBounds() 的回读值来比：
    // 跨缩放屏的 DIP↔物理往返有向外取整与原点舍入，读回值永远不等于设定值，去重就永远不生效。
    const rect = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    const key = rect.x + ',' + rect.y + ',' + rect.width + ',' + rect.height;
    if (petWindows.state.lastRequestedBounds.get(win.id) !== key) {
      petWindows.state.lastRequestedBounds.set(win.id, key);
      win.setContentBounds(rect, false);
    }
    // 窗口余量（左右/上）：命中区判定的依据，余量四边不再相等。
    const ml = Number(bounds?.marginL);
    const mt = Number(bounds?.marginT);
    if (Number.isFinite(ml) && Number.isFinite(mt)) petWindows.state.winMargins.set(win.id, { l: ml, t: mt });
    // 碰撞站场的位置必须用包围盒左上角（渲染端显式上报 boxX/boxY）：窗口坐标 = 包围盒 − margin，
    // 直接拿窗口坐标会让跨窗检测整体错位。
    const petId = [...petWindows.state.windows.keys()].find((id) => petWindows.state.windows.get(id) === win);
    if (petId) {
      const bx = Number(bounds?.boxX);
      const by = Number(bounds?.boxY);
      const size = Number(bounds?.size);
      const bottomPad = Number(bounds?.bottomPad);
      const vx = Number(bounds?.vx);
      const vy = Number(bounds?.vy);
      // 位置 + 尺寸 + 速度一并登记：set-bounds 每次位置变化都会触发，带上尺寸静止宠物才能被
      // 跨窗碰撞检测看见；速度取渲染端上报值（飞行中实时、静止/拖拽 = 0），落地后不残留旧速度。
      petWindows.updatePetState(petId, {
        x: Number.isFinite(bx) ? bx : x,
        y: Number.isFinite(by) ? by : y,
        size: Number.isFinite(size) && size > 0 ? size : petWindows.state.petStates.get(petId)?.size || 0,
        bottomPad:
          Number.isFinite(bottomPad) && bottomPad > 0
            ? bottomPad
            : petWindows.state.petStates.get(petId)?.bottomPad || 0,
        vx: Number.isFinite(vx) ? vx : 0,
        vy: Number.isFinite(vy) ? vy : 0,
      });
    }
  });

  // 飞行状态上报（碰撞站场）：renderer 飞行中每 ~30ms 上报一次自己的位置/速度/尺寸
  ipcMain.on('pet:report-flight', (event, state) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const petId = [...petWindows.state.windows.keys()].find((id) => petWindows.state.windows.get(id) === win);
    if (!petId) return;
    const s = state || {};
    const x = Number(s.x);
    const y = Number(s.y);
    const vx = Number(s.vx);
    const vy = Number(s.vy);
    const size = Number(s.size);
    const bottomPad = Number(s.bottomPad);
    if (![x, y, vx, vy, size, bottomPad].every(Number.isFinite)) return;
    petWindows.updatePetState(petId, { x, y, vx, vy, size, bottomPad });
  });

  // 碰撞结果转发：飞行方窗口检测到撞到 targetId → 把动量结果（目标新初速）转发给目标窗口
  ipcMain.on('pet:collide-result', (event, payload) => {
    const targetId = payload && typeof payload === 'object' ? String(payload.targetId || '') : '';
    const vx = Number(payload?.vx);
    const vy = Number(payload?.vy);
    if (!targetId || !Number.isFinite(vx) || !Number.isFinite(vy)) return;
    const targetWin = petWindows.state.windows.get(targetId);
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('pet:hit', { vx, vy });
    }
  });

  // 点击穿透翻转：渲染端在光标进出身体命中区时上报；穿透期间仍保留 forward。
  // 兜底轮询也走同一个出口 setWindowIgnore，两条通道共享同一份镜像状态。
  ipcMain.on('pet:set-interactive', (event, interactive) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const input = petWindows.state.inputRegions.get(win.id);
    // 渲染端的旧 menuOpen/chatOpen 守卫会请求整窗可交互；这里按真实光标和控件矩形裁定。
    const ignoring =
      interactive && input && petWindows.state.inputBusy.get(win.id)
        ? decideWindowIgnore(
            win.getContentBounds(),
            screen.getCursorScreenPoint(),
            false,
            true,
            0,
            input,
            petWindows.state.winMargins.get(win.id),
          )
        : !interactive;
    petWindows.setWindowIgnore(win, ignoring);
  });

  // 拖拽持有完整输入租约；菜单/对话则由 petWindows.state.inputRegions 把交互限制在实际控件矩形内。
  // 这里只存标记、不直接翻窗口——唯一出口仍是 setWindowIgnore，否则两条通道会抢着翻同一个窗口。
  ipcMain.on('pet:input-busy', (event, busy) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    petWindows.state.inputBusy.set(win.id, !!busy);
  });

  ipcMain.on('pet:input-regions', (event, input) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || !input || !Array.isArray(input.rects)) return;
    const rects = input.rects.filter(
      (r) => r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0,
    );
    petWindows.state.inputRegions.set(win.id, { dragging: input.dragging === true, rects });
  });

  // 文本输入框拿到 DOM 焦点不等于窗口拿到键盘焦点：窗口是 showInactive 显示的，从不主动请求焦点，
  // 于是光标在闪、按键却落到上一个窗口（Linux/X11 上必现）。这里补一次激活请求；
  // 已聚焦或已销毁时跳过，避免把焦点从别的应用抢过来。
  ipcMain.on('pet:request-keyboard-focus', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || win.isFocused()) return;
    win.focus();
    win.webContents.focus();
  });

  // 宿主注入的已鉴权站点 URL（含本进程启动令牌）：DSH 只在 GET / 接受它并换发浏览器 Cookie，
  // 裸 origin 在默认浏览器里必然 401。令牌等价登录态，只在与目标同 origin 时启用，
  // 绝不让它被带去别的站点；取不到该变量时行为与以前一致。
  const resolveSiteUrl = (url) => {
    let target = url;
    const authed = process.env.BLUE_FISH_SITE_URL || '';
    if (/^https?:[/][/]/.test(authed)) {
      try {
        if (new URL(authed).origin === new URL(url).origin) target = authed;
      } catch {
        /* 形状不对：保持裸地址（原行为） */
      }
    }
    return target;
  };

  // 右键菜单首项（打开网站 / 回落路径）：交给系统默认浏览器（等效网页里 Ctrl+点击链接），不建专属窗口——
  // 宠物窗口是透明小窗，不该承载常规网页浏览。URL 由渲染端从 configUrl 推导。
  const openSite = (url) => {
    const target = resolveSiteUrl(url);
    shell.openExternal(target).catch((error) => {
      console.error('[blue-fish-desktop-helper] openExternal failed:', error);
    });
  };

  // 全局 DPI 线性化把 device scale factor 锁成 1：宠物窗靠 setZoomFactor 补偿，普通窗口没有这层补偿，
  // 设置页就会按 1 物理像素 = 1 CSS 像素渲染，在 125%/150% 的屏幕上比浏览器里小一圈。
  // 这里按真实主屏缩放还原：窗口尺寸是 DIP 单位，同样要乘上去，否则内容放大后可用布局反而变窄。
  const uiScale = () => {
    const forced = Number(dpi && dpi.forcedScale) || 0;
    const primary = Number(dpi && dpi.primaryScale) || 0;
    return forced > 0 && primary > 0 ? primary / forced : 1;
  };

  // 独立模式的「打开 AI 设置」：本机设置页是带令牌的地址，交给系统浏览器会另开一个标签，关掉后
  // 很难找回来。这里改用应用内的普通窗口承载；重复点击只把已开的窗口提到前台，不重新载入——
  // 页面里可能有还没保存的表单。
  let settingsWindow = null;
  const openSettingsWindow = (url) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.show();
      settingsWindow.focus();
      return;
    }
    const target = resolveSiteUrl(url);
    const scale = uiScale();
    const win = new BrowserWindow({
      width: Math.round(1040 * scale),
      height: Math.round(780 * scale),
      minWidth: Math.round(720 * scale),
      minHeight: Math.round(520 * scale),
      autoHideMenuBar: true,
      backgroundColor: '#0f1115',
      title: '桌宠设置',
      // 与宠物窗同一份图标：任务栏按钮不该显示 Electron 默认原子图
      icon: path.join(__dirname, '..', '..', '..', 'assets', 'logo.png'),
      webPreferences: {
        // 独立 App 模式会给 defaultSession 装「只对 file:// 渲染页补令牌、其余请求一律剥掉令牌头」
        // 的出站拦截；设置页恰恰靠自带令牌头访问本机接口，必须换一个独立会话，否则一律 403。
        partition: 'blue-fish-settings',
        // 与窗口尺寸同源：DPI 线性化下补回系统缩放
        zoomFactor: scale,
        contextIsolation: true,
        nodeIntegration: false,
        // 与宠物窗/签名窗同口径：本机沙箱初始化不可靠（宿主进程靠 --no-sandbox 兜底，同进程应用
        // 没有这条退路），sandbox:true 的渲染进程在打包形态起不来，loadURL 直接 ERR_FAILED (-2)。
        // 页面无 preload、只载本机服务，contextIsolation + nodeIntegration:false 已够。
        sandbox: false,
      },
    });
    win.on('closed', () => {
      if (settingsWindow === win) settingsWindow = null;
    });
    // 与宠物窗同一处境：页面加载完成才是设置缩放的可靠时机（webPreferences 的值作为首帧兜底）
    win.webContents.on('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.setZoomFactor(scale);
    });
    // 设置页里的外链仍交给系统浏览器；窗口本身只承载本机设置页。
    win.webContents.setWindowOpenHandler(({ url: next }) => {
      if (/^https?:[/][/]/.test(next)) {
        shell.openExternal(next).catch((error) => {
          console.error('[blue-fish-desktop-helper] openExternal failed:', error);
        });
      }
      return { action: 'deny' };
    });
    win.loadURL(target).catch((error) => {
      console.error('[blue-fish-desktop-helper] settings load failed:', error);
      win.destroy();
    });
    settingsWindow = win;
  };

  // 应用自注册的 dsh:// 协议：已运行时把主窗口提到前台，未运行则直接把应用拉起来。
  // 只有 desktop 形态能发——协议是系统级注册的，dsh web 形态下发它会把桌面版 DSH 拉起来。
  const focusDesktopApp = () => shell.openExternal('dsh://open');

  // 去向由宿主形态决定：standalone 在应用内窗口打开本机设置页，desktop 把主窗口叫回前台，
  // web 则是原行为：系统默认浏览器打开站点。
  ipcMain.on('pet:open-site', (event, payload) => {
    const url = payload && typeof payload === 'object' ? String(payload.url || '') : '';
    if (!/^https?:[/][/]/.test(url)) return;
    if (openTarget === 'standalone') {
      // 独立模式：设置页在应用内窗口里打开，不接管系统浏览器。
      openSettingsWindow(url);
      return;
    }
    if (openTarget === 'desktop') {
      // 协议未注册（绿色版 / 注册表被清）时回落成打开站点，至少不是"点了没反应"
      focusDesktopApp().catch((error) => {
        console.error('[blue-fish-desktop-helper] open dsh:// failed, falling back to site:', error);
        openSite(url);
      });
      return;
    }
    openSite(url);
  });

  // 只叫窗口、不改去向：被别的窗口挡住时把主窗口提到前台。
  ipcMain.on('pet:focus-host', () => {
    if (openTarget !== 'desktop') return;
    focusDesktopApp().catch((error) => {
      console.warn('[blue-fish-desktop-helper] focus host failed:', error && error.message);
    });
  });

  /**
   * 截一帧桌面：只取宠物所在那块屏，按物理像素请求缩略图，回一次 JPEG base64。
   * 不做流、不落盘；渲染端拿到后与上传图片走同一条预算编码。
   */
  ipcMain.handle('pet:capture-screen', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const display = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
    const scale = display.scaleFactor || 1;
    const size = {
      width: Math.max(1, Math.min(4096, Math.round(display.size.width * scale))),
      height: Math.max(1, Math.min(4096, Math.round(display.size.height * scale))),
    };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    // display_id 是字符串；取不到对应屏时退回第一块，总比"点了没反应"好
    const source = sources.find((item) => String(item.display_id) === String(display.id)) ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) return null;
    const thumbnail = source.thumbnail;
    const { width, height } = thumbnail.getSize();
    const data = thumbnail.toJPEG(85).toString('base64');
    return { mediaType: 'image/jpeg', data, width, height, bytes: Math.floor((data.length * 3) / 4) };
  });
}

module.exports = { registerIpc };
