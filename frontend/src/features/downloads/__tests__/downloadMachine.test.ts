import {
  canTransition,
  fractionForJob,
  isActive,
  overallProgress,
  statusForJob,
} from '../downloadMachine';

describe('download state machine', () => {
  it('allows the happy path in order', () => {
    const path = [
      'validating',
      'preparing',
      'downloading',
      'processing',
      'saving',
      'completed',
    ] as const;
    for (let i = 1; i < path.length; i += 1) {
      expect(canTransition(path[i - 1], path[i])).toBe(true);
    }
  });

  it('allows failing from any active state and retrying from failed', () => {
    for (const s of ['validating', 'preparing', 'downloading', 'processing', 'saving'] as const) {
      expect(canTransition(s, 'failed')).toBe(true);
    }
    expect(canTransition('failed', 'preparing')).toBe(true);
  });

  it('rejects going backwards or leaving completed', () => {
    expect(canTransition('saving', 'downloading')).toBe(false);
    expect(canTransition('completed', 'failed')).toBe(false);
    expect(canTransition('processing', 'preparing')).toBe(false);
  });

  it('knows which statuses are active', () => {
    expect(isActive('processing')).toBe(true);
    expect(isActive('completed')).toBe(false);
    expect(isActive('failed')).toBe(false);
  });

  it.each([
    [{ status: 'queued', stage: 'queued' }, 'preparing'],
    [{ status: 'processing', stage: 'downloading' }, 'downloading'],
    [{ status: 'processing', stage: 'converting' }, 'processing'],
    [{ status: 'complete', stage: 'ready' }, 'saving'],
    [{ status: 'failed', stage: 'failed' }, 'failed'],
  ] as const)('maps server job %p to %p', (job, expected) => {
    expect(statusForJob(job)).toBe(expected);
  });

  it('maps progress into monotonically increasing bands', () => {
    const steps = [
      overallProgress('validating'),
      overallProgress('preparing'),
      overallProgress(
        'downloading',
        fractionForJob({ status: 'processing', stage: 'downloading', progress: 42 }),
      ),
      overallProgress(
        'processing',
        fractionForJob({ status: 'processing', stage: 'converting', progress: 90 }),
      ),
      overallProgress('saving', 0.5),
      overallProgress('completed'),
    ];
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    expect(steps.at(-1)).toBe(100);
    expect(overallProgress('downloading', 2)).toBe(60);
  });
});
