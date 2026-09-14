import type { UserStatus } from '../types/api';

/** Where the first-plan build has actually got to, as the screen already polls it. */
export type PlanBuildPhase = 'checking' | 'idle' | 'building' | 'ready' | 'failed';

export type PlanTunnelStage = { label: string; value: string; done: boolean };

type SetupStatus = Pick<UserStatus, 'questionnaireCompleted' | 'trainerAssigned'>;

export function resolvePlanBuildPhase(
  state: 'idle' | 'building' | 'completed' | 'failed',
  checking: boolean,
): PlanBuildPhase {
  if (state === 'completed') return 'ready';
  if (state === 'building') return 'building';
  if (state === 'failed') return 'failed';
  return checking ? 'checking' : 'idle';
}

/**
 * The three things the trainee is waiting on, each reporting what is true right now.
 *
 * Every value comes from state the screen already has, so the tunnel never claims progress
 * that has not happened.
 */
export function planTunnelStages(phase: PlanBuildPhase, status?: SetupStatus): PlanTunnelStage[] {
  const built = phase === 'ready';
  const sessions = built
    ? 'Ready'
    : phase === 'building'
      ? 'Writing'
      : phase === 'failed'
        ? 'Retry'
        : phase === 'checking'
          ? 'Checking'
          : 'Queued';
  return [
    { label: 'Profile', value: status?.questionnaireCompleted ? 'Read' : 'Pending', done: !!status?.questionnaireCompleted },
    { label: 'Coach', value: status?.trainerAssigned ? 'Matched' : 'Pending', done: !!status?.trainerAssigned },
    { label: 'Sessions', value: sessions, done: built },
  ];
}

export function planTunnelCopy(phase: PlanBuildPhase) {
  switch (phase) {
    case 'ready':
      return {
        eyebrow: 'READY FOR YOU',
        title: 'Your first week is ready.',
        body: 'Opening FormBae for you…',
      };
    case 'building':
      return {
        eyebrow: 'WRITING YOUR WEEK',
        title: 'Building your sessions.',
        body: 'Turning your answers and your coach’s approach into a week you can repeat. This finishes on its own.',
      };
    case 'failed':
      return {
        eyebrow: 'ONE MORE GO',
        title: 'That build didn’t finish.',
        body: 'Nothing was lost. Your membership, profile and coach are saved to your account.',
      };
    case 'checking':
      return {
        eyebrow: 'CHECKING YOUR SETUP',
        title: 'Picking up where you left off.',
        body: 'Reading what is already saved to your account.',
      };
    default:
      return {
        eyebrow: 'THE LAST SETUP STEP',
        title: 'Let’s put your plan together.',
        body: 'Your goal, your starting point and your weekly schedule become your first workouts.',
      };
  }
}
