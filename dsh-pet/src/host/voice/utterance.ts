/**
 * 语音播报回执：受理一句朗读、渲染端上报、进程内等待真正读完。
 *
 * 与 ./playback 同类：宿主只知道「写了 say」，不知道念没念完——音频在渲染端播，
 * 只有那一端知道真相。弹幕队列靠 {@link VoiceUtteranceStore.waitUntilDone} 串行下一条。
 * @module dsh-pet/src/host/voice/utterance
 */

/** 一句朗读的状态：pending = 已写叶子等上报；其余均为终态。 */
export type VoiceUtteranceStatus = 'pending' | 'ended' | 'skipped' | 'failed';

/** 渲染端可上报的终态（pending 只能由宿主写入）。 */
const REPORTABLE = new Set<string>(['ended', 'skipped', 'failed']);

/** 终态判定。 */
const isTerminal = (s: VoiceUtteranceStatus): boolean => s !== 'pending';

/** 一次朗读记录。 */
export interface VoiceUtteranceRecord {
  utteranceId: string;
  petId: string;
  status: VoiceUtteranceStatus;
  createdAt: number;
  updatedAt: number;
  reason?: string;
}

/** report 结论（路由据此映射 HTTP）。 */
export type VoiceUtteranceReportOutcome = 'ok' | 'ignored' | 'unknown' | 'invalid';

/** 终态记录保留时长（ms）：调用方来得及等完；之后惰性清掉。 */
const KEEP_MS = 60 * 1000;

/**
 * 弹幕队列等「真正读完」的上限（ms）。
 *
 * 合成客户端兜底约 95s，最长念 60 字约十几秒，再留一点余量；超时仍放行下一条，避免卡死。
 */
export const VOICE_UTTERANCE_WAIT_MS = 120 * 1000;

/**
 * 语音播报回执表（一个插件实例一个；进程内内存态）。
 *
 * 单线程事件循环，方法同步完成；`waitUntilDone` 的 Promise 在 report / 超时 / cancel 时 resolve。
 */
export class VoiceUtteranceStore {
  declare private readonly records: Map<string, VoiceUtteranceRecord>;
  declare private readonly waiters: Map<string, Set<(record: VoiceUtteranceRecord) => void>>;
  /** 每只宠物当前未终态的那一句（新一句受理时把上一句标成 skipped/superseded）。 */
  declare private readonly activeByPet: Map<string, string>;
  declare private seq: number;

  constructor() {
    this.records = new Map();
    this.waiters = new Map();
    this.activeByPet = new Map();
    this.seq = 0;
  }

  /**
   * 受理一句朗读：建 pending 记录；同宠上一句若仍 pending 则标 skipped/superseded。
   * @returns 新建记录（调用方把 utteranceId 写进 say 叶子）。
   */
  create(petId: string): VoiceUtteranceRecord {
    this.sweep();
    const prev = this.activeByPet.get(petId);
    if (prev !== undefined) this.finish(prev, 'skipped', 'superseded');
    const now = Date.now();
    const record: VoiceUtteranceRecord = {
      utteranceId: 'vu-' + now.toString(36) + '-' + (++this.seq).toString(36),
      petId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.utteranceId, record);
    this.activeByPet.set(petId, record.utteranceId);
    return record;
  }

  /** 查记录；不存在 / 已过期返回 undefined。 */
  get(utteranceId: string): VoiceUtteranceRecord | undefined {
    this.sweep();
    return this.records.get(utteranceId);
  }

  /**
   * 渲染端上报终态。
   * 终态之后的上报 ignored；非法 status → invalid；编号不存在 → unknown。
   */
  report(utteranceId: string, status: unknown, reason?: unknown): VoiceUtteranceReportOutcome {
    this.sweep();
    const record = this.records.get(utteranceId);
    if (!record) return 'unknown';
    const next = typeof status === 'string' ? status : '';
    if (!REPORTABLE.has(next)) return 'invalid';
    if (isTerminal(record.status) || record.status === next) return 'ignored';
    const why = typeof reason === 'string' && reason !== '' ? reason : undefined;
    this.finish(utteranceId, next as Exclude<VoiceUtteranceStatus, 'pending'>, why);
    return 'ok';
  }

  /**
   * 等到终态或超时。编号不存在 → 立刻 matched:false。
   * 永远 resolve，不 reject——调用方只关心能不能进下一条。
   */
  waitUntilDone(
    utteranceId: string,
    timeoutMs: number = VOICE_UTTERANCE_WAIT_MS,
  ): Promise<{ record: VoiceUtteranceRecord | undefined; matched: boolean }> {
    this.sweep();
    const record = this.records.get(utteranceId);
    if (!record) return Promise.resolve({ record: undefined, matched: false });
    if (isTerminal(record.status)) return Promise.resolve({ record, matched: true });

    return new Promise((resolve) => {
      let settled = false;
      const settle = (matched: boolean): void => {
        if (settled) return;
        settled = true;
        resolve({ record: this.records.get(utteranceId) ?? record, matched });
      };

      let set = this.waiters.get(utteranceId);
      if (!set) {
        set = new Set();
        this.waiters.set(utteranceId, set);
      }
      const onWake = (): void => {
        clearTimeout(timer);
        set!.delete(onWake);
        if (set!.size === 0) this.waiters.delete(utteranceId);
        settle(true);
      };
      set.add(onWake);

      // 不 unref：弹幕队列故意挂着等读完；unref 会让空闲进程在超时前就退出，单测也会被掐掉。
      const timer = setTimeout(() => {
        set!.delete(onWake);
        if (set!.size === 0) this.waiters.delete(utteranceId);
        settle(false);
      }, Math.max(0, timeoutMs));
    });
  }

  /** 插件卸载：唤醒全部等待者（matched 由调用方用终态与否自判；这里直接让 Promise resolve）。 */
  cancelAll(): void {
    for (const [id, set] of [...this.waiters]) {
      for (const wake of [...set]) {
        set.delete(wake);
        wake(this.records.get(id)!);
      }
      this.waiters.delete(id);
    }
  }

  /** 当前记录数（测试用）。 */
  count(): number {
    return this.records.size;
  }

  private finish(
    utteranceId: string,
    status: Exclude<VoiceUtteranceStatus, 'pending'>,
    reason?: string,
  ): void {
    const record = this.records.get(utteranceId);
    if (!record || isTerminal(record.status)) return;
    record.status = status;
    record.updatedAt = Date.now();
    if (reason !== undefined) record.reason = reason;
    if (this.activeByPet.get(record.petId) === utteranceId) this.activeByPet.delete(record.petId);
    const set = this.waiters.get(utteranceId);
    if (!set) return;
    for (const wake of [...set]) {
      set.delete(wake);
      wake(record);
    }
    this.waiters.delete(utteranceId);
  }

  private sweep(now: number = Date.now()): void {
    for (const [id, record] of this.records) {
      if (!isTerminal(record.status)) continue;
      if (now - record.updatedAt < KEEP_MS) continue;
      const set = this.waiters.get(id);
      if (set) {
        for (const wake of [...set]) wake(record);
        this.waiters.delete(id);
      }
      this.records.delete(id);
    }
  }
}
