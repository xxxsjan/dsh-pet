/**
 * 桌面托盘的行为契约（runtime/electron-helper/main/tray.js）。
 *
 * 三条行为必须成立：勾选来自配置、点一下写回相反的一档、退出项按运行形态决定自己退还是交给宿主。
 * 依赖全由调用方注入（含 Electron 的 Tray/Menu/nativeImage），所以这里不需要真的 Electron。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/** 托盘模块是给 Helper 用的 CJS，没有类型声明：这里按用到的形状窄化。 */
interface TrayModule {
  createTray(deps: Record<string, unknown>): {
    start(): Promise<void>;
    refresh(): Promise<void>;
    exists(): boolean;
    destroy(): void;
  };
}

/** 一条菜单项：只断言用到的字段。 */
interface MenuItem {
  label: string;
  type?: string;
  checked?: boolean;
  click?: () => void;
}

const { createTray } = createRequire(import.meta.url)('../../runtime/electron-helper/main/tray.js') as TrayModule;

/** 造一套假依赖：记录宿主请求、菜单模板与退出调用。 */
function harness(options: {
  appMode?: boolean;
  isBridge?: boolean;
  canQuit?: boolean;
  pets?: Array<Record<string, unknown>>;
  obsCaptureEnabled?: boolean;
}) {
  const requests: string[] = [];
  const bodies: string[] = [];
  const quits: string[] = [];
  const menus: MenuItem[][] = [];
  const shows: string[] = [];

  class FakeTray {
    setToolTip(): void {}
    setContextMenu(menu: unknown): void {
      menus.push((menu as { template: MenuItem[] }).template);
    }
    on(): void {}
    popUpContextMenu(): void {}
    destroy(): void {}
  }

  const deps = {
    app: { quit: () => quits.push('app.quit') },
    Tray: FakeTray,
    Menu: { buildFromTemplate: (template: MenuItem[]) => ({ template }) },
    nativeImage: {
      createFromPath: () => ({ isEmpty: () => false, resize: () => ({ setTemplateImage: () => {} }) }),
    },
    hostRequest: async (method: string, url: string, body?: string) => {
      requests.push(method + ' ' + url);
      if (body !== undefined) bodies.push(body);
      if (url.endsWith('/config')) {
        return {
          status: 200,
          body: JSON.stringify({
            main: {
              pets: options.pets ?? [],
              ...(options.obsCaptureEnabled !== undefined ? { obsCaptureEnabled: options.obsCaptureEnabled } : {}),
            },
          }),
        };
      }
      if (url.endsWith('/quit')) {
        return { status: 200, body: JSON.stringify({ canQuit: options.canQuit === true }) };
      }
      return { status: 200, body: '{}' };
    },
    callbackUrl: () => 'http://127.0.0.1:1/bridge',
    isBridge: options.isBridge ?? false,
    appMode: options.appMode ?? false,
    petRoute: '/pet-233',
    platform: { templateImage: false, leftClickPopsMenu: false },
    helperDir: '.',
    showPets: () => shows.push('showPets'),
  };

  const tray = createTray(deps);
  return { tray, requests, bodies, quits, menus, shows };
}

/** 取最后一次构建出来的菜单模板。 */
function lastMenu(menus: MenuItem[][]): MenuItem[] {
  const menu = menus[menus.length - 1];
  assert.ok(menu, '托盘应已构建出菜单');
  return menu;
}

describe('createTray —— 勾选与点击', () => {
  test('菜单第一项是「显示宠物」，点一下调用 showPets', async () => {
    const { tray, menus, shows } = harness({
      pets: [{ label: 'a', id: 'a', display: 'both' }],
    });
    await tray.start();
    const menu = lastMenu(menus);
    assert.equal(menu[0]?.label, '显示宠物');
    assert.ok(menu[0]?.click, '显示宠物必须可点');
    menu[0].click!();
    assert.deepEqual(shows, ['showPets']);
  });

  test('勾选状态来自配置：含 desktop / both 的两只被打勾', async () => {
    const { tray, menus } = harness({
      pets: [
        { label: 'a', id: 'a', display: 'both' },
        { label: 'b', id: 'b', display: 'web' },
        { label: 'c', id: 'c', display: 'desktop' },
      ],
    });
    await tray.start();
    const petItems = lastMenu(menus).filter((item) => item.type === 'checkbox' && item.label !== '窗口模式');
    assert.deepEqual(
      petItems.map((item) => item.checked),
      [true, false, true],
    );
  });

  test('点一下写回相反的一档：both→web，web→both，desktop→none，none→desktop', async () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['both', 'web'],
      ['web', 'both'],
      ['desktop', 'none'],
      ['none', 'desktop'],
    ];
    for (const [from, to] of cases) {
      const { tray, menus, requests, bodies } = harness({ pets: [{ label: 'a', id: 'a', display: from }] });
      await tray.start();
      const item = lastMenu(menus).find((entry) => entry.type === 'checkbox' && entry.label !== '窗口模式');
      assert.ok(item?.click, '每只宠物都应有可点的开关项');
      item.click();
      assert.ok(requests.includes('POST /pet-233/pet-display'), `display=${from} 时应把新值写回宿主`);
      assert.equal(
        (JSON.parse(bodies[0] ?? '{}') as { display?: string }).display,
        to,
        `display=${from} 应写成 ${to}（浏览器位保持不动）`,
      );
    }
  });

  test('窗口模式勾选来自配置，点一下 POST /obs-capture', async () => {
    const { tray, menus, requests, bodies } = harness({
      pets: [{ label: 'a', id: 'a', display: 'both' }],
      obsCaptureEnabled: true,
    });
    await tray.start();
    const item = lastMenu(menus).find((entry) => entry.label === '窗口模式');
    assert.ok(item?.type === 'checkbox' && item.click, '必须有窗口模式开关');
    assert.equal(item.checked, true);
    item.click();
    assert.ok(requests.includes('POST /pet-233/obs-capture'));
    assert.equal((JSON.parse(bodies[0] ?? '{}') as { enabled?: boolean }).enabled, false);
  });
});

describe('createTray —— 退出项的分支', () => {
  test('应用模式：自己 app.quit()，不请求宿主', async () => {
    const { tray, menus, quits, requests } = harness({
      appMode: true,
      pets: [{ label: 'a', id: 'a', display: 'both' }],
    });
    await tray.start();
    const quit = lastMenu(menus).find((item) => item.label === '退出');
    assert.ok(quit?.click, '应用模式必须有退出项');
    quit.click();
    assert.deepEqual(quits, ['app.quit']);
    assert.equal(
      requests.some((request) => request.startsWith('POST') && request.endsWith('/quit')),
      false,
    );
  });

  test('bridge 且宿主允许：把退出交给宿主（自己退会被当成崩溃重启）', async () => {
    const { tray, menus, quits, requests } = harness({
      isBridge: true,
      canQuit: true,
      pets: [{ label: 'a', id: 'a', display: 'both' }],
    });
    await tray.start();
    const quit = lastMenu(menus).find((item) => item.label === '退出');
    assert.ok(quit?.click, '宿主允许时应有退出项');
    quit.click();
    assert.deepEqual(quits, [], 'bridge 下不得自己退');
    assert.ok(requests.includes('POST /pet-233/quit'), '必须把退出请求交给宿主');
  });

  test('bridge 且宿主不允许：不出现退出项', async () => {
    const { tray, menus } = harness({
      isBridge: true,
      canQuit: false,
      pets: [{ label: 'a', id: 'a', display: 'both' }],
    });
    await tray.start();
    assert.equal(
      lastMenu(menus).some((item) => item.label === '退出'),
      false,
    );
  });
});

describe('createTray —— 重建后刷新', () => {
  test('refresh 重读配置：勾选跟着变，菜单被替换', async () => {
    const pets: Array<Record<string, unknown>> = [{ label: 'a', id: 'a', display: 'both' }];
    const { tray, menus } = harness({ pets });
    await tray.start();
    const petItem = (menu: MenuItem[]) => menu.find((item) => item.label === 'a');
    assert.equal(petItem(lastMenu(menus))?.checked, true);
    pets[0] = { label: 'a', id: 'a', display: 'web' };
    await tray.refresh();
    assert.equal(menus.length, 2, 'refresh 应重新设置一次菜单');
    assert.equal(petItem(lastMenu(menus))?.checked, false, '配置变了勾选要跟着变');
  });

  test('没建托盘时 refresh 什么都不做（托盘开关关掉的情况）', async () => {
    const { tray, menus } = harness({ pets: [] });
    await tray.refresh();
    assert.equal(menus.length, 0);
  });
});
