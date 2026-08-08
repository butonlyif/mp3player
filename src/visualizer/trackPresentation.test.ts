import { describe, expect, it } from 'vitest';
import { getImmersiveLyrics, stripAudioExtension } from './trackPresentation';

describe('stripAudioExtension', () => {
  it('removes common audio extensions without changing dotted titles', () => {
    expect(stripAudioExtension('风景与你.mp3')).toBe('风景与你');
    expect(stripAudioExtension('Live.Version.FLAC')).toBe('Live.Version');
    expect(stripAudioExtension('Chapter 1.2')).toBe('Chapter 1.2');
  });
});

describe('getImmersiveLyrics', () => {
  it('returns the current and next synced lyric', () => {
    const lyrics = {
      type: 'synced' as const,
      lines: [
        { time: 0, text: '第一句' },
        { time: 10, text: '第二句' },
        { time: 20, text: '第三句' },
      ],
    };

    expect(getImmersiveLyrics(lyrics, 12, 30)).toEqual({ current: '第二句', next: '第三句' });
  });

  it('does not show the first timed lyric before it starts', () => {
    const lyrics = {
      type: 'synced' as const,
      lines: [{ time: 8, text: '第一句' }, { time: 16, text: '第二句' }],
    };
    expect(getImmersiveLyrics(lyrics, 2, 30)).toEqual({
      current: '♪ 跟随音乐流动',
      next: '第一句',
    });
  });

  it('uses a quiet fallback when no lyrics are available', () => {
    expect(getImmersiveLyrics(null, 0, 0)).toEqual({ current: '♪ 跟随音乐流动', next: null });
  });
});
