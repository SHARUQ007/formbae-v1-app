// Runs inside the publisher WebView. Only reports reaching the content end;
// it neither copies article text nor changes the publisher's page.
export const ARTICLE_END_SCRIPT = `
(function () {
  if (window.__formbaeReadingEnd) return;
  window.__formbaeReadingEnd = true;
  var sent = false;
  function check() {
    if (sent || !document.body) return;
    var article = document.querySelector('article .entry-content, article [itemprop="articleBody"]') || document.querySelector('article') || document.querySelector('main');
    var bottom = article ? article.getBoundingClientRect().bottom + window.scrollY : Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    if (bottom > 100 && window.scrollY + window.innerHeight >= bottom - 64) {
      sent = true;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'reading-end', url: window.location.href }));
    }
  }
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('load', function () { setTimeout(check, 800); });
  setTimeout(check, 800);
})(); true;
`;
