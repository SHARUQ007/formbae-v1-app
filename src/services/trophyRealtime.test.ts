import type { TrophySummary } from '../types/api';
import { publishTrophySummary, subscribeToTrophySummary } from './trophyRealtime';

const summary: TrophySummary = {
  score: 31,
  change: 1,
  safeZone: 25,
  nextMilestone: 50,
  pointsToNext: 19,
  workoutCount: 2,
  starCount: 5,
  currentStreak: 1,
  breakdown: {
    workouts: 20,
    stars: 5,
    streakAchievement: 4,
    streakMomentum: 2,
    weeklyPace: 0,
    foodPace: 0,
  },
};

describe('trophyRealtime', () => {
  it('publishes new totals immediately and replays the latest total to late subscribers', () => {
    const activeListener = jest.fn();
    const unsubscribe = subscribeToTrophySummary(activeListener);

    publishTrophySummary(summary);
    expect(activeListener).toHaveBeenLastCalledWith(summary);
    unsubscribe();

    const lateListener = jest.fn();
    const unsubscribeLate = subscribeToTrophySummary(lateListener);
    expect(lateListener).toHaveBeenCalledWith(summary);
    unsubscribeLate();
  });
});
