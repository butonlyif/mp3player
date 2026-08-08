// ===== 歌词滚动逻辑工具函数 =====
import type { LyricLine } from '../lib/api';

/**
 * 二分查找当前播放行索引。
 * 返回最后一个 time <= currentTime 的行索引；若无时间戳则返回 -1。
 */
export function findCurrentLine(lines: LyricLine[], time: number): number {
  if (lines.length === 0) return -1;

  // 收集有时间的行
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const lineTime = lines[mid].time;
    if (lineTime === null) {
      // 无时间戳行：向前看
      hi = mid - 1;
      continue;
    }
    if (lineTime <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}
