/* Re-evaluate a stale phone layout viewport after an external sign-in return.
   Never reload the page or disable user zoom. */
(function () {
  var canonical = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
  var timers = [];
  function recover() {
    var phoneWidth = window.screen.width;
    var phone = navigator.maxTouchPoints > 0 && /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
    if (!phone || phoneWidth <= 0 || phoneWidth > 600 || window.innerWidth < 900) return;
    // Pinch zoom is a user action, not an OAuth viewport error.
    if (window.visualViewport && window.visualViewport.scale > 1.05) return;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    // A changed value forces browsers to reconsider a restored desktop viewport.
    meta.setAttribute('content', 'width=' + phoneWidth + ', initial-scale=1.0, viewport-fit=cover');
    requestAnimationFrame(function () { meta.setAttribute('content', canonical); });
  }
  function schedule() {
    timers.forEach(clearTimeout);
    recover();
    timers = [150, 700].map(function (delay) { return setTimeout(recover, delay); });
  }
  schedule();
  window.addEventListener('pageshow', schedule);
  window.addEventListener('orientationchange', schedule);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') schedule();
  });
})();
