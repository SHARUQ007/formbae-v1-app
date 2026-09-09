import { ARTICLE_END_SCRIPT } from './articleEndScript';

it('reports the content end once without waiting for the publisher footer', () => {
  let scroll!: () => void;
  const postMessage = jest.fn();
  const window = { __formbaeReadingEnd: false, scrollY: 0, innerHeight: 700,
    location: { href: 'https://www.nhs.uk/article/' }, ReactNativeWebView: { postMessage },
    addEventListener: (event: string, callback: () => void) => { if (event === 'scroll') scroll = callback; } };
  const document = { body: { scrollHeight: 5000 }, documentElement: { scrollHeight: 5000 },
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 2000 - window.scrollY }) }) };
  require('vm').runInNewContext(ARTICLE_END_SCRIPT, { window, document, setTimeout: (callback: () => void) => callback() });
  expect(postMessage).not.toHaveBeenCalled();
  window.scrollY = 1300;
  scroll();
  expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({ type: 'reading-end', url: window.location.href });
  scroll();
  expect(postMessage).toHaveBeenCalledTimes(1);
});

it('handles a short page with no article element or scroll gesture', () => {
  const postMessage = jest.fn();
  const window = { scrollY: 0, innerHeight: 700, location: { href: 'https://www.nhs.uk/short/' }, ReactNativeWebView: { postMessage }, addEventListener: jest.fn() };
  const document = { body: { scrollHeight: 500 }, documentElement: { scrollHeight: 500 }, querySelector: () => null };
  require('vm').runInNewContext(ARTICLE_END_SCRIPT, { window, document, setTimeout: (callback: () => void) => callback() });
  expect(postMessage).toHaveBeenCalledTimes(1);
});
