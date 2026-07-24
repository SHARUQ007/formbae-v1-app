export type WellnessAdvice = {
  title: string;
  body: string;
  icon: string;
  context: 'morning' | 'midday' | 'evening' | 'night' | 'any';
};

export const wellnessAdvice: WellnessAdvice[] = [
  { title: 'Drink water', body: 'Have a glass of water before the next screen loads.', icon: 'droplet', context: 'morning' },
  { title: 'Get daylight', body: 'Step near a window or outside for a minute if it is morning.', icon: 'sun', context: 'morning' },
  { title: 'Plan your session', body: 'Pick a workout time now so the day does not decide for you.', icon: 'calendar', context: 'morning' },
  { title: 'Protein first', body: 'Anchor your next meal with a clear protein source.', icon: 'target', context: 'morning' },
  { title: 'Walk break', body: 'Stand up and walk for two minutes between long sitting blocks.', icon: 'navigation', context: 'midday' },
  { title: 'Relax your shoulders', body: 'Drop your shoulders, unclench your jaw, then take three slow breaths.', icon: 'wind', context: 'midday' },
  { title: 'Log lunch honestly', body: 'A rough meal note is better than losing the entry completely.', icon: 'edit-3', context: 'midday' },
  { title: 'Check posture', body: 'Keep feet flat, ribs stacked, and screen close to eye level.', icon: 'user-check', context: 'midday' },
  { title: 'Short session counts', body: 'If you are busy, do the quick workout instead of skipping.', icon: 'clock', context: 'evening' },
  { title: 'Prep dinner', body: 'Decide dinner before hunger makes the decision harder.', icon: 'shopping-bag', context: 'evening' },
  { title: 'Recovery check', body: 'If energy is low, reduce load before you reduce consistency.', icon: 'activity', context: 'evening' },
  { title: 'Close the loop', body: 'Log one meal or one set now to keep the day accounted for.', icon: 'check-circle', context: 'evening' },
  { title: 'Sleep runway', body: 'Dim the screen and stop caffeine late if sleep has been light.', icon: 'moon', context: 'night' },
  { title: 'Tomorrow is easier planned', body: 'Choose tomorrow’s workout window before you sleep.', icon: 'bookmark', context: 'night' },
  { title: 'Low friction wins', body: 'Keep shoes, bottle, or workout clothes ready for the next session.', icon: 'zap', context: 'night' },
  { title: 'Reflect briefly', body: 'One honest note helps your next plan fit real life better.', icon: 'message-circle', context: 'night' },
  { title: 'Breathe through the nose', body: 'Use five calm nasal breaths to bring your heart rate down.', icon: 'smile', context: 'any' },
  { title: 'Add steps casually', body: 'Take calls standing or walking when you can.', icon: 'trending-up', context: 'any' },
  { title: 'Do the next rep well', body: 'Quality beats rushing. Make the next set technically clean.', icon: 'award', context: 'any' },
  { title: 'Keep it visible', body: 'Open FormBae before meals or workouts so logging is easy.', icon: 'home', context: 'any' },
];

function contextForHour(hour: number): WellnessAdvice['context'] {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export function getContextualAdvice(date = new Date()) {
  const context = contextForHour(date.getHours());
  const candidates = wellnessAdvice.filter((item) => item.context === context || item.context === 'any');
  const index = Math.floor((date.getTime() / 60000) % candidates.length);
  return candidates[index] || wellnessAdvice[0];
}

