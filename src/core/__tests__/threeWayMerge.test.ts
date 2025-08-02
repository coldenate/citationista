import { mergeChildContent, threeWayMerge } from '../threeWayMerge';

describe('mergeChildContent', () => {
  test('merges remote and local without duplicates relative to base', () => {
    const local = ['Local Note', 'Common'];
    const remote = ['Common', 'Remote Note'];
    const base = ['Common'];
    const result = mergeChildContent(local, remote, base);
    expect(result).toEqual(['Common', 'Remote Note', 'Local Note']);
  });

  test('handles undefined base', () => {
    const local = ['A'];
    const remote = ['A'];
    const result = mergeChildContent(local, remote, undefined);
    expect(result).toEqual(['A']);
  });
});

describe('threeWayMerge', () => {
  test('merges notes without duplicates', () => {
    const local = { notes: ['Local', 'Shared'] };
    const remote = { notes: ['Shared', 'Remote'] };
    const base = { notes: ['Shared'] };
    const result = threeWayMerge(local, remote, base);
    expect(result.notes).toEqual(['Shared', 'Remote', 'Local']);
  });
});
