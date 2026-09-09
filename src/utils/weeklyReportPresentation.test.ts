import { weeklyContextIllustration, weeklyReadingBlocks } from './weeklyReportPresentation';

describe('weekly reading blocks', () => {
  it('keeps every sentence, decimal measurement and quoted ending intact', () => {
    const prose = 'Your weight was 80.5 kg. Your note says “felt easier.” Keep the same scale! Was the timing similar?';
    const blocks = weeklyReadingBlocks(prose);
    expect(blocks).toEqual(['Your weight was 80.5 kg.', 'Your note says “felt easier.”', 'Keep the same scale!', 'Was the timing similar?']);
    expect(blocks.join(' ')).toBe(prose);
  });

  it('preserves abbreviations, line breaks and long legacy text without clipping', () => {
    expect(weeklyReadingBlocks('Discuss this with Dr. Rao.\n\nRecord how you feel.')).toEqual(['Discuss this with Dr. Rao.', 'Record how you feel.']);
    const legacy = 'A saved observation '.repeat(50).trim();
    expect(weeklyReadingBlocks(legacy)).toEqual([legacy]);
    expect(weeklyReadingBlocks('  ')).toEqual([]);
  });

  it('uses contextual art with a safe fallback for future report domains', () => {
    expect(weeklyContextIllustration('diet', 'Describe your lunch')).toBe('diaryCapture');
    expect(weeklyContextIllustration('nutrition', 'Make breakfast repeatable')).toBe('mealBreakfast');
    expect(weeklyContextIllustration('body')).toBe('measurements');
    expect(weeklyContextIllustration('recovery')).toBe('recovery');
    expect(weeklyContextIllustration('new-domain')).toBe('reportFocus');
  });
});
