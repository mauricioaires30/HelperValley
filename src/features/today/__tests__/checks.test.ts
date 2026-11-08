import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onLocalCheck, useChecks } from '../checks';

const date = { year: 1, season: 'spring', day: 3 };
const state = () => useChecks.getState();

describe('Today checks', () => {
  beforeEach(() => {
    useChecks.setState({ day: null, checked: {} });
    state().syncDay('farm', date);
  });

  it('toggles a mark and tells the room', () => {
    const heard = vi.fn();
    onLocalCheck(heard);
    state().toggle('farm:hay');
    expect(state().checked['farm:hay']).toBe(true);
    expect(heard).toHaveBeenCalledWith({ type: 'check', day: 'farm:1-spring-3', key: 'farm:hay', on: true });
    state().toggle('farm:hay');
    expect(state().checked['farm:hay']).toBeUndefined();
  });

  it('starts clean on a new game day and keeps marks on the same one', () => {
    state().toggle('farm:hay');
    state().syncDay('farm', date);
    expect(state().checked['farm:hay']).toBe(true);
    state().syncDay('farm', { ...date, day: 4 });
    expect(state().checked).toEqual({});
  });

  it('ignores marks about another day', () => {
    expect(state().apply('farm:1-spring-2', 'farm:hay', true)).toBe(false);
    expect(state().checked).toEqual({});
    expect(state().apply('farm:1-spring-3', 'player:7:q-1', true)).toBe(true);
    expect(state().checked['player:7:q-1']).toBe(true);
  });

  it("adopts the host's list over local marks", () => {
    state().toggle('farm:mine');
    state().adopt('farm:1-spring-3', { 'farm:hay': true });
    expect(state().checked).toEqual({ 'farm:hay': true });
  });
});
