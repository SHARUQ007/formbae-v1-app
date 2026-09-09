import { AccessibilityInfo, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { ExerciseVideo } from './ExerciseVideo';
import { GymLoadingIllustration } from './GymLoadingIllustration';
import { GymLoadingMessage } from './GymLoadingMessage';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

it('rotates readable messages with reduced motion and clears its timer on dismissal', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const intervals = jest.spyOn(globalThis, 'setInterval');
  const clear = jest.spyOn(globalThis, 'clearInterval');
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<GymLoadingMessage />); });
  const first = tree.root.findByType(Text).props.children;
  const firstArt = tree.root.findByType(GymLoadingIllustration).props.kind;
  expect(first).not.toMatch(/…|\.\.\./);
  act(() => jest.advanceTimersByTime(3599));
  expect(tree.root.findByType(Text).props.children).toBe(first);
  act(() => jest.advanceTimersByTime(1));
  expect(tree.root.findByType(Text).props.children).not.toBe(first);
  expect(tree.root.findByType(GymLoadingIllustration).props.kind).not.toBe(firstArt);
  expect(tree.root.findByType(Text).props.children).not.toMatch(/…|\.\.\./);
  const messageTimer = intervals.mock.results[intervals.mock.calls.findIndex(call => call[1] === 3600)].value;
  act(() => tree.unmount());
  expect(clear).toHaveBeenCalledWith(messageTimer);
});

it('uses the shared messages for video loading while retaining the error state', async () => {
  let video!: TestRenderer.ReactTestRenderer;
  let loader!: TestRenderer.ReactTestRenderer;
  let error!: TestRenderer.ReactTestRenderer;
  await act(async () => { video = TestRenderer.create(<ExerciseVideo url="dQw4w9WgXcQ" />); });
  const player = video.root.findByType(WebView);
  await act(async () => { loader = TestRenderer.create(player.props.renderLoading()); });
  expect(loader.root.findAllByType(GymLoadingMessage)).toHaveLength(1);
  expect(loader.root.findAllByType(GymLoadingIllustration)).toHaveLength(1);
  expect(JSON.stringify(loader.toJSON())).toContain('Loading exercise video');
  act(() => { error = TestRenderer.create(player.props.renderError()); });
  expect(JSON.stringify(error.toJSON())).toContain('Video could not load here');
  expect(error.root.findAllByType(GymLoadingMessage)).toHaveLength(0);
  act(() => { video.unmount(); loader.unmount(); error.unmount(); });
});
