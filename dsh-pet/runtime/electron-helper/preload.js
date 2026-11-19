/**
 * preload 桥：向渲染端暴露窗口控制与跨窗碰撞的原语。
 *
 * 只做 IPC 转发，不持有状态、不做判定；翻转与判定都在主进程。依赖 Electron 的
 * contextBridge/ipcRenderer，频道名必须与主进程逐字一致。
 *
 * @module dsh-pet/runtime/electron-helper/preload
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  // 宠物窗口逐帧跟随：x/y/width/height 是窗口内容区坐标（用于移动窗口），
  // boxX/boxY 是宠物包围盒左上角的工作区坐标——碰撞站场必须用包围盒，窗口坐标差半只宠物宽。
  // size/bottomPad 让静止宠物也登记进碰撞站场，vx/vy 是当前速度（静止/拖拽为 0）。
  // marginL/marginT 是窗口左右/上余量：上边距按气泡最大高度加高后余量不再四边相等，
  // 主进程不能按「窗口宽/4」反推命中区，所以必须上报。
  setBounds(x, y, width, height, boxX, boxY, size, bottomPad, vx, vy, marginL, marginT) {
    ipcRenderer.send('pet:set-bounds', {
      x,
      y,
      width,
      height,
      boxX,
      boxY,
      size,
      bottomPad,
      vx,
      vy,
      marginL,
      marginT,
    });
  },
  // 点击穿透翻转：窗口默认整窗穿透，渲染端在光标进出身体命中区时上报。
  setInteractive(interactive) {
    ipcRenderer.send('pet:set-interactive', !!interactive);
  },
  // 我正在用这个窗口的鼠标输入（拖拽中/菜单开/弹窗开）。主进程光看光标与窗口位移分不清
  // 拖拽跟手与漫游/抛掷，而渲染端知道；busy 期间兜底通道绝不翻回穿透，否则输入链会断。
  // 只在状态翻转时发一次，不逐帧。
  setInputBusy(busy) {
    ipcRenderer.send('pet:input-busy', !!busy);
  },
  // 控件矩形：菜单/聊天框只让自己那块接收点击，其余透明区域继续穿透。
  setInputRegions(input) {
    ipcRenderer.send('pet:input-regions', input);
  },
  // 鼠标按键位掩码：mousemove 时幂等上报（变化才发）。主进程据此识别外部拖拽并抑制穿透翻转。
  setPointerButtons(buttons) {
    ipcRenderer.send('pet:pointer-buttons', Number(buttons) >>> 0);
  },
  // 文本输入拿到 DOM 焦点时向主进程要一次系统键盘焦点：X11 上 DOM 焦点不等于 X 键盘焦点，
  // 窗口又是 showInactive 显示的，不要就一直打不了字（处理在 main/ipc.js）。
  requestKeyboardFocus() {
    ipcRenderer.send('pet:request-keyboard-focus');
  },
  // 右键菜单「打开网站」：去向由主进程按宿主形态决定——桌面应用宿主唤起主窗口，否则用系统浏览器打开站点。
  openDshSite(url) {
    ipcRenderer.send('pet:open-site', { url });
  },
  // 右键菜单「桌宠控制台」：独立模式在应用内独立窗口打开本机控制台页；地址由主进程从环境变量取，渲染端不传。
  openConsole() {
    ipcRenderer.send('pet:open-console');
  },
  // 控制台页内「直播间弹幕」入口：独立模式另开一个无边框桌面窗口承载直播间界面；地址由主进程从控制台地址派生。
  openLive() {
    ipcRenderer.send('pet:open-live');
  },
  // 直播间独立窗口内的关闭按钮：通知主进程关闭自己所在的窗口。
  closeLive() {
    ipcRenderer.send('pet:close-live');
  },
  // 控制台「开始监听」成功后开的弹幕小窗：platform 决定小窗里显示哪个平台的弹幕，窗内不再切平台。
  openLiveMini(platform) {
    ipcRenderer.send('pet:open-live-mini', platform ? { platform: String(platform) } : null);
  },
  // 控制台「停止监听」成功后同步关小窗：主进程只关正在展示该平台的小窗，别的平台不误关。
  closeLiveMini(platform) {
    ipcRenderer.send('pet:close-live-mini', platform ? { platform: String(platform) } : null);
  },
  // 无边框窗口的头部拖动：渲染端只报阶段（start/move/end）与屏幕坐标，窗口位移在主进程做。
  // 不走 -webkit-app-region:drag 是因为系统拖动区会把光标接管成箭头，抓手样式挂不上去。
  windowDrag(phase, screenX, screenY) {
    ipcRenderer.send('pet:window-drag', {
      phase: String(phase || ''),
      x: Number(screenX),
      y: Number(screenY),
    });
  },
  // 直播间配置页「打开直播间」：用系统默认浏览器打开直播间地址（只接受 http(s) 链接）。
  openExternal(url) {
    ipcRenderer.send('pet:open-external', url ? { url: String(url) } : null);
  },
  // 只把 DSH 主窗口提到前台：走应用自注册的 dsh:// 协议（单实例锁会让它聚焦），被别的窗口挡住也有效。
  // 主进程按宿主形态门控：只有桌面应用宿主才真发，web 形态下发它会把桌面版拉起来。
  focusDshHost() {
    ipcRenderer.send('pet:focus-host');
  },
  // 截一帧桌面（宠物所在那块屏）：一次性读取，不建流、不留存。
  // 返回 { mediaType, data, width, height, bytes } 或 null（取不到画面）。
  captureScreen() {
    return ipcRenderer.invoke('pet:capture-screen');
  },
  // 宠物间碰撞（跨窗 broker）：飞行方上报状态，主进程汇聚广播；被撞方收 pet:hit 后按新初速抛出。
  reportFlight(state) {
    ipcRenderer.send('pet:report-flight', state);
  },
  onFlightStates(cb) {
    ipcRenderer.on('pet:flight-states', (e, states) => cb(states));
  },
  reportCollide(targetId, vx, vy) {
    ipcRenderer.send('pet:collide-result', { targetId, vx, vy });
  },
  onPetHit(cb) {
    ipcRenderer.on('pet:hit', (e, payload) => cb(payload));
  },
  // 显示器热更新：分辨率/缩放变化、插拔屏、旋转后主进程重算并推来桌面几何（屏幕坐标），
  // 渲染端就地重挂视口与边界。
  onDisplays(cb) {
    ipcRenderer.on('pet:displays', (e, geo) => cb(geo));
  },
});
