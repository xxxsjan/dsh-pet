/**
 * 人设拼装（宿主半侧，纯逻辑）：碎碎念与对话共用的 system 提示词只在这一处拼好。
 *
 * 四段，顺序固定：人设正文（实例 whisperPrompt → 条目 whisperPrompt → 空串）、名字声明、
 * 时间背景（timeContextOf 现算，不缓存）、历史时间说明（仅在对话且有历史时追加）。
 * 不碰 IO、不读时钟，Date 由调用方传入；也不负责取字段与
 * 发起生成（index.ts 的 petSystemPrompt 只做「取字段 → 调这里」）。
 * 必须始终成立：拼装点唯一——不给名字与时间开占位符配置，否则等于出现第二个拼装点。
 * @module dsh-pet/src/host/persona
 */
import { timeContextOf } from './time-context.ts';

/**
 * 历史时间说明：历史消息带 `[月日 时:分]` 前缀时追加，让模型知道那些时刻可以用来算跨度。
 *
 * 时间前缀现在加在 user（主人）消息上，而不是 assistant（宠物）消息上。
 * 因为模型会照抄 assistant 历史消息的格式，导致回复也带时间前缀。
 * 这里必须明确：前缀只标在主人的话上，宠物自己的回复不要写时间、不要加方括号前缀。
 */
const HISTORY_TIMES_LINE =
  '【历史】主人的话前面可能标着类似 [10月31日 22:53] 的时间，那是主人说那句话的时刻，用于帮助你理解”这句话是多久之前说的”。\n' +
  '重要：你的回复必须直接从正文开始，严禁在回复中添加任何时间戳或方括号前缀！\n' +
  '正确示例：好的，我明白了。\n' +
  '错误示例：[11月6日 14:30] 好的，我明白了。\n' +
  '绝对不要在回复里写时间、不要加方括号前缀！';

/**
 * 某宠物最终生效的人设正文（不含名字与时间）：实例 whisperPrompt → 条目 whisperPrompt → 空串。
 *
 * 语义是替换而不是拼接：两段人设同时生效会让模型收到两个身份。
 * 实例级的值合并器已过滤过，这里仍 trim 判空——petPersona 也是导出函数，不能假设调用方走了合并器。
 */
export function petPersona(conf: Record<string, unknown>, pet: Record<string, unknown>): string {
  const own = pet.whisperPrompt;
  if (typeof own === 'string' && own.trim() !== '') return own;
  const entry = conf.whisperPrompt;
  return typeof entry === 'string' ? entry : '';
}

/** composeSystemPrompt 的入参 */
export interface SystemPromptParts {
  /** 已回落到生效值的人设正文（petPersona 的结果；空串 = 没有人设，只有名字 + 时间） */
  prompt: string;
  /** 显示名（pets[].name；缺失/空按 id 处理） */
  name: string;
  /** 宠物 id（name 为空时的兜底；两者都空 = 整段名字声明省略） */
  id: string;
  /** 生成这一刻（生产传 new Date()，测试传固定日期） */
  now: Date;
  /** 历史消息是否带时间前缀；缺省 false（碎碎念没有历史，不该出现【历史】段） */
  historyTimes?: boolean;
}

/**
 * 拼出最终 system 提示词：人设正文 + 名字声明 + 时间背景 +（对话时）历史时间说明。
 *
 * 边界：prompt 为空时不留前导换行；name 与 id 都取不到时整段名字声明省略；
 * now 非法（NaN）时 timeContextOf 返回空串，时间背景与【历史】整行不加
 * （宁缺，也不把 NaN 拼进提示词；没有时间背景时【历史】的“现在”无从对照，留着只会自相矛盾）。
 */
export function composeSystemPrompt(parts: SystemPromptParts): string {
  const name = String(parts.name || parts.id);
  const nameLine = name ? '你的名字是“' + name + '”。' : '';
  const lines = [parts.prompt, nameLine].filter((line) => line !== '');
  const time = timeContextOf(parts.now);
  if (time) {
    lines.push(time);
    // 【历史】跟着时间背景走：它整句都在引用“现在”，没有时间背景时不成立
    if (parts.historyTimes === true) lines.push(HISTORY_TIMES_LINE);
  }
  return lines.join('\n');
}
