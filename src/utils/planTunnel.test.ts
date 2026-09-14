import { planTunnelCopy, planTunnelStages, resolvePlanBuildPhase } from './planTunnel';

const setup = { questionnaireCompleted: true, trainerAssigned: true };
const valueFor = (label: string, ...args: Parameters<typeof planTunnelStages>) =>
  planTunnelStages(...args).find((stage) => stage.label === label);

it('reads the phase from the build state, with checking only while nothing is running', () => {
  expect(resolvePlanBuildPhase('completed', true)).toBe('ready');
  expect(resolvePlanBuildPhase('building', true)).toBe('building');
  expect(resolvePlanBuildPhase('failed', false)).toBe('failed');
  expect(resolvePlanBuildPhase('idle', true)).toBe('checking');
  expect(resolvePlanBuildPhase('idle', false)).toBe('idle');
});

it('reports only the setup that has actually happened', () => {
  // Nothing saved yet: no tile may claim progress.
  expect(planTunnelStages('idle').every((stage) => !stage.done)).toBe(true);
  expect(valueFor('Profile', 'idle')?.value).toBe('Pending');
  expect(valueFor('Coach', 'idle', { questionnaireCompleted: true, trainerAssigned: false })?.value).toBe('Pending');
  expect(valueFor('Profile', 'idle', setup)?.done).toBe(true);
  expect(valueFor('Coach', 'idle', setup)?.done).toBe(true);
});

it('tracks the sessions tile through the build', () => {
  expect(valueFor('Sessions', 'checking', setup)?.value).toBe('Checking');
  expect(valueFor('Sessions', 'idle', setup)?.value).toBe('Queued');
  expect(valueFor('Sessions', 'building', setup)?.value).toBe('Writing');
  expect(valueFor('Sessions', 'failed', setup)?.value).toBe('Retry');
  expect(valueFor('Sessions', 'ready', setup)?.value).toBe('Ready');
  // Only a finished build marks the tile done.
  expect(valueFor('Sessions', 'building', setup)?.done).toBe(false);
  expect(valueFor('Sessions', 'ready', setup)?.done).toBe(true);
});

it('gives every phase its own words', () => {
  const titles = (['checking', 'idle', 'building', 'ready', 'failed'] as const).map((phase) => planTunnelCopy(phase).title);
  expect(new Set(titles).size).toBe(titles.length);
  expect(planTunnelCopy('failed').body).toContain('saved');
});
