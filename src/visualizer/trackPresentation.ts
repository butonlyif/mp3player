import type { ParsedLyrics } from '../lib/api';
import { findCurrentLine } from '../lyrics/LyricsScroller';

const AUDIO_EXTENSION = /\.(mp3|flac|wav|m4a|aac|ogg|opus|wma|aiff?)$/i;

export function stripAudioExtension(title: string): string {
  return title.replace(AUDIO_EXTENSION, '');
}

export interface ImmersiveLyrics {
  current: string;
  next: string | null;
}

export function getImmersiveLyrics(
  lyrics: ParsedLyrics | null,
  currentTime: number,
  duration: number,
): ImmersiveLyrics {
  if (!lyrics?.lines.length) return { current: '♪ 跟随音乐流动', next: null };

  let index = 0;
  if (lyrics.type === 'synced') {
    const timedIndex = findCurrentLine(lyrics.lines, currentTime);
    if (timedIndex < 0) {
      return { current: '♪ 跟随音乐流动', next: lyrics.lines[0]?.text || null };
    }
    index = timedIndex;
  } else if (duration > 0) {
    index = Math.min(
      lyrics.lines.length - 1,
      Math.floor(Math.min(1, currentTime / duration) * lyrics.lines.length),
    );
  }

  return {
    current: lyrics.lines[index]?.text || '♪ 跟随音乐流动',
    next: lyrics.lines[index + 1]?.text || null,
  };
}
