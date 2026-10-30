(function () {
  var canonical =
    'width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content';
  var timers = [];
  function recover() {
    var phoneWidth = window.screen.width;
    var phone =
      navigator.maxTouchPoints > 0 && /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
    if (!phone || phoneWidth <= 0 || phoneWidth > 600 || window.innerWidth < 900) return;

    if (window.visualViewport && window.visualViewport.scale > 1.05) return;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    meta.setAttribute(
      'content',
      'width=' +
        phoneWidth +
        ', initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content',
    );

    window.dispatchEvent(new Event('resize'));
  }
  function schedule() {
    timers.forEach(clearTimeout);
    recover();
    timers = [150, 700, 1500, 3000].map(function (delay) {
      return setTimeout(recover, delay);
    });
  }
  schedule();
  window.addEventListener('pageshow', schedule);
  window.addEventListener('orientationchange', function () {
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute('content', canonical);
    schedule();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') schedule();
  });
})();
