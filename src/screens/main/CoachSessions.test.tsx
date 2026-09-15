import React from 'react';
import { Alert, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CoachSessionsScreen } from './CoachSessionsScreen';
import { SlotCalendar } from '../../components/SlotCalendar';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  bookCoachSession,
  cancelCoachSession,
  fetchCoachSlots,
  fetchMySessions,
} from '../../services/coachSessionService';
import { ApiError } from '../../services/apiClient';

jest.mock('../../services/coachSessionService', () => {
  const actual = jest.requireActual('../../services/coachSessionService');
  return {
    ...actual,
    fetchCoachSlots: jest.fn(),
    fetchMySessions: jest.fn(),
    bookCoachSession: jest.fn(),
    cancelCoachSession: jest.fn(),
  };
});

const HOUR = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const slot = (bookingId: string, offsetMs: number) => ({
  bookingId,
  trainerId: 't1',
  trainerName: 'Ava',
  slotStart: iso(offsetMs),
  slotEnd: iso(offsetMs + HOUR),
  status: 'available',
});

let renderer: ReactTestRenderer;
const navigation = { goBack: jest.fn(), navigate: jest.fn() };

const render = async () => {
  await act(async () => {
    renderer = create(
      <CoachSessionsScreen
        navigation={navigation as never}
        route={{ name: 'CoachSessions', key: 'cs', params: { trainerId: 't1', trainerName: 'Ava' } } as never}
      />,
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetchMySessions as jest.Mock).mockResolvedValue([]);
  (fetchCoachSlots as jest.Mock).mockResolvedValue([slot('b1', 48 * HOUR), slot('b2', 72 * HOUR)]);
  (bookCoachSession as jest.Mock).mockResolvedValue({ ...slot('b1', 48 * HOUR), joinable: false });
  (cancelCoachSession as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const cta = () => renderer.root.findAllByType(PrimaryButton)[0];
/** The rendered words. toJSON carries fibers that JSON.stringify cannot walk. */
const copy = () => renderer.root.findAllByType(Text).flatMap((node) =>
  React.Children.toArray(node.props.children).filter((child): child is string => typeof child === 'string')).join(' ');
const calendar = () => renderer.root.findByType(SlotCalendar);
/** Host nodes only: findAllByProps also returns every wrapper carrying the same prop. */
const byLabel = (label: string) =>
  renderer.root.findAllByProps({ accessibilityLabel: label }).filter((node) => typeof node.type === 'string');

it('will not book until a time is chosen', async () => {
  await render();
  expect(cta().props.title).toBe('Pick a time');
  expect(cta().props.disabled).toBe(true);
});

it('books the slot the trainee picked', async () => {
  await render();
  await act(async () => { calendar().props.onSelect('b2'); });
  expect(cta().props.title).toBe('Confirm booking');
  await act(async () => { await cta().props.onPress(); });
  expect(bookCoachSession).toHaveBeenCalledWith('b2');
});

it('reloads rather than re-offering a slot somebody else just took', async () => {
  // The server claims conditionally so two trainees never land in one session. From here
  // that arrives as SLOT_TAKEN on a list that looked free a moment ago, and leaving the
  // button pointed at it would just fail again.
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (bookCoachSession as jest.Mock).mockRejectedValueOnce(
    new ApiError('Conflict', 409, { detail: { code: 'SLOT_TAKEN' } }),
  );
  await render();
  await act(async () => { calendar().props.onSelect('b1'); });
  (fetchCoachSlots as jest.Mock).mockResolvedValue([slot('b2', 72 * HOUR)]);
  await act(async () => { await cta().props.onPress(); });
  expect(alert).toHaveBeenCalled();
  expect(calendar().props.slots.map((entry: { bookingId: string }) => entry.bookingId)).toEqual(['b2']);
  alert.mockRestore();
});

it('shows a booked session and offers to join it only when it has started', async () => {
  (fetchMySessions as jest.Mock).mockResolvedValue([
    { ...slot('b9', 5 * 60 * 1000), status: 'booked', joinable: true, meetingUrl: 'https://meet.example/b9' },
  ]);
  await render();
  expect(byLabel('Join session')).toHaveLength(1);
});

it('does not offer a join button while the session is still days away', async () => {
  // The server withholds the link until then, so a button here would have nothing to open.
  (fetchMySessions as jest.Mock).mockResolvedValue([
    { ...slot('b9', 72 * HOUR), status: 'booked', joinable: false },
  ]);
  await render();
  expect(byLabel('Join session')).toHaveLength(0);
  expect(byLabel('Cancel session')).toHaveLength(1);
});

it('closes changes twenty-four hours out, the same as the web page', async () => {
  (fetchMySessions as jest.Mock).mockResolvedValue([
    { ...slot('b9', 6 * HOUR), status: 'booked', joinable: false },
  ]);
  await render();
  expect(byLabel('Cancel session')).toHaveLength(0);
  expect(copy()).toContain('Changes close 24h before');
});

it('says so plainly when the coach has opened no times', async () => {
  (fetchCoachSlots as jest.Mock).mockResolvedValue([]);
  await render();
  expect(copy()).toContain('hasn’t opened any times yet');
  expect(renderer.root.findAllByType(PrimaryButton)).toHaveLength(0);
});
