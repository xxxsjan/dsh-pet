'use strict';
/**
 * DPI 与指针：主屏缩放的探测与缓存、强制缩放开关、渲染端 scale 换算、光标位置。
 *
 * 线性化必须赶在 ready 之前 appendSwitch，所以工厂在 main.js 顶层调用；探测子进程复用同一个
 * main.js（mainPath 传入），只打一行 scaleFactor 就退出。
 * @module dsh-pet/runtime/electron-helper/main-dpi
 */

const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { shouldLinearize, resolveForcedScale, resolvePetScale } = require('../dpi-linearization.js');

/**
 * 造 DPI/指针能力。
 *
 * @param deps.app - Electron app（userData 路径与命令行开关）。
 * @param deps.screen - Electron screen（主屏缩放与光标兜底）。
 * @param deps.mainPath - main.js 的绝对路径：探测子进程要重新拉起同一份脚本。
 * @param deps.linuxPointer - Linux 的 X11 指针提供者；其它平台传 null。
 * @param deps.dpiProbe - 本次是否是「只打印缩放」的探测子进程。
 * @param deps.dpiMark - 探测输出里的标记前缀。
 * @param deps.forceDsf - BLUE_FISH_FORCE_DSF 原始值（未设置即 undefined）。
 */
function createDpi({ app, screen, mainPath, linuxPointer, dpiProbe, dpiMark, forceDsf }) {
  /**
   * 当前光标位置（DIP）。
   * Linux：X11 QueryPointer 的实时值（物理像素 ÷ 缩放）；其余平台或查询尚未就绪：Electron 原生 API。
   */
  function currentPointer() {
    const raw = linuxPointer && linuxPointer.get();
    if (!raw) return screen.getCursorScreenPoint();
    const scale = screen.getPrimaryDisplay().scaleFactor || 1;
    return scale === 1 ? raw : { x: Math.round(raw.x / scale), y: Math.round(raw.y / scale) };
  }

  /** 主屏缩放缓存文件（userData 在 ready 前即可用） */
  function dpiCacheFile() {
    return path.join(app.getPath('userData'), 'primary-scale.json');
  }

  function readCachedPrimaryScale() {
    try {
      const v = Number(JSON.parse(readFileSync(dpiCacheFile(), 'utf8')).scaleFactor);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0; // 首次启动/文件损坏：当作无缓存，重新探测
    }
  }

  function writeCachedPrimaryScale(value) {
    try {
      writeFileSync(dpiCacheFile(), JSON.stringify({ scaleFactor: value }), 'utf8');
    } catch (e) {
      console.error('[blue-fish-desktop-helper] write dpi cache failed:', String(e && e.message ? e.message : e));
    }
  }

  /** 从探测子进程的输出里抓 scaleFactor（0 = 没抓到） */
  function parseProbeOutput(text) {
    const m = new RegExp(dpiMark + '([0-9.]+)').exec(String(text || ''));
    const v = m ? Number(m[1]) : 0;
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  /** 探测子进程的公共启动参数（同步冷启动与异步刷新共用，保证两边的开关一致） */
  function probeOptions() {
    return {
      env: { ...process.env, BLUE_FISH_DPI_PROBE: '1', BLUE_FISH_BRIDGE: '0', BLUE_FISH_SMOKE: '0' },
      timeout: 20000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    };
  }

  function probeArgs() {
    // 探测子进程必须和主进程用同一套开关：沙箱起不来的机器上宿主的自动回退会改用 --no-sandbox，
    // 不带上的话探测子进程一启动就 0x80000003，主进程活着、缓存却永远写不出来，每次开机都要白探一次。
    const sandboxArgs = app.commandLine.hasSwitch('no-sandbox') ? ['--no-sandbox'] : [];
    return [...sandboxArgs, mainPath, '--blue-fish-dpi-probe'];
  }

  /** 探测失败时拼一行可读的细节（status/stderr），stdio 都是 pipe 拿得到 */
  function probeErrorDetail(e) {
    return [
      e && e.status !== undefined ? 'status=' + e.status : '',
      e && e.stderr ? 'stderr=' + String(e.stderr).trim().slice(0, 300) : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * 同步探测：只给 ready 之前用（线性化的 appendSwitch 必须赶在 ready 前，没别的选择）。
   *
   * 运行期绝不能调它：同步会堵死主进程事件循环，而点击穿透窗口的 WH_MOUSE_LL 全局鼠标钩子
   * 回调就跑在主进程线程上——堵多久，整机鼠标就卡多久（打包版探测子进程起不来时会直接堵满 20s 超时）。
   */
  function probePrimaryScale() {
    let out = '';
    try {
      out = execFileSync(process.execPath, probeArgs(), probeOptions());
    } catch (e) {
      // 只认 stdout，不认退出码：不开窗口的 Electron 进程调 app.exit() 在 Windows 上偶发
      // 0xC0000005（退出期访问违例），但那时值早就写出来了，丢掉它纯属浪费一次冷启动。
      out = e && e.stdout ? String(e.stdout) : '';
      if (!parseProbeOutput(out)) {
        console.error(
          '[blue-fish-desktop-helper] dpi probe failed:',
          String(e && e.message ? e.message : e).split('\n')[0],
          probeErrorDetail(e),
        );
        return 0; // 探测失败：不加 switch，退回逐屏 DIP 行为
      }
    }
    const v = parseProbeOutput(out);
    if (v > 0) writeCachedPrimaryScale(v);
    return v;
  }

  /** 异步刷新在途标记：显示器事件会连发，同一时间只探一次 */
  let asyncProbeInFlight = false;

  /**
   * 异步探测：运行期只用来刷新缩放缓存（供下次启动），不阻塞事件循环。
   *
   * @param onResult - 拿到结果后的回调（0 = 没探到）；可不传。
   */
  function probePrimaryScaleAsync(onResult) {
    if (asyncProbeInFlight) return;
    asyncProbeInFlight = true;
    execFile(process.execPath, probeArgs(), probeOptions(), (e, stdout) => {
      asyncProbeInFlight = false;
      // 同同步版：只认 stdout，超时/退出违例时值往往已经打出来了
      const v = parseProbeOutput(stdout);
      if (v > 0) writeCachedPrimaryScale(v);
      else if (e) {
        console.error(
          '[blue-fish-desktop-helper] dpi probe failed (async):',
          String(e && e.message ? e.message : e).split('\n')[0],
          probeErrorDetail(e),
        );
      }
      if (onResult) onResult(v);
    });
  }

  /** 真实主屏 scaleFactor（探测所得；0 = 未知）。开启线性化后 screen API 只会报 1，只能靠它。 */
  let PRIMARY_SCALE = 0;
  /** 实际生效的强制缩放（0 = 未启用，坐标系维持修复前的逐屏 DIP） */
  let FORCED_SCALE = 0;
  if (shouldLinearize({ platform: process.platform, dpiProbe, forceDsf })) {
    // 探测失败只能退化为"不补偿"，不能把整个 helper 带走：受限令牌下
    // getPath('userData') 与探测子进程都可能失败，进程会在 ready 之前直接结束且无日志。
    try {
      PRIMARY_SCALE = readCachedPrimaryScale() || probePrimaryScale();
      const forced = resolveForcedScale({ forceDsf, primaryScale: PRIMARY_SCALE });
      if (forced > 0) {
        app.commandLine.appendSwitch('force-device-scale-factor', String(forced));
        FORCED_SCALE = forced;
      }
    } catch (error) {
      console.error(
        '[blue-fish-desktop-helper] dpi 探测失败，按不补偿继续:',
        String(error && error.message ? error.message : error),
      );
      PRIMARY_SCALE = 0;
      FORCED_SCALE = 0;
    }
  }

  /**
   * 渲染端的 CONFIG.scale：宿主给的基准 × 物理像素补偿。
   * 线性化开启后 1 逻辑像素 = 1 物理像素，宠物按主屏缩放放大回原来的观感。
   */
  function petScale() {
    return resolvePetScale({
      baseScale: process.env.BLUE_FISH_SCALE,
      primaryScale: PRIMARY_SCALE,
      forcedScale: FORCED_SCALE,
    });
  }

  return {
    currentPointer,
    petScale,
    probePrimaryScaleAsync,
    readCachedPrimaryScale,
    get primaryScale() {
      return PRIMARY_SCALE;
    },
    get forcedScale() {
      return FORCED_SCALE;
    },
  };
}

module.exports = { createDpi };
