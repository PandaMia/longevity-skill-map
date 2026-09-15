/* WheelEvent has no standard mouse/trackpad device identifier. */
(function (root) {
  function createRouter({ now = () => performance.now(), getPixelRatio = () => root.devicePixelRatio || 1, gestureGap = 250 } = {}) {
    let device = null, lastEvent = -Infinity;
    const near = (a, b) => Math.abs(a - b) < .01;
    function classify(event) {
      const time = now(), continuous = time - lastEvent < gestureGap;
      const x = Math.abs(event.deltaX || 0), y = Math.abs(event.deltaY || 0);
      const legacy = Math.abs(event.wheelDeltaY || 0);
      const isNotch = value => Math.round(value / 120) >= 1 && near(value / 120, Math.round(value / 120));
      // Browser zoom/high-DPI input can also scale the legacy 120-unit notch.
      const notch = isNotch(legacy) || isNotch(legacy * getPixelRatio());
      // Chromium/WebKit often expose precise scrolling as wheelDeltaY=-3*deltaY.
      // This deprecated value is only a hint; many browsers omit it entirely.
      const precise = legacy > 0 && y > 0 && near(legacy, y * 3);
      if (event.deltaMode) device = 'mouse';
      else if (notch && !precise) device = 'mouse';
      else if (x > 0 || (precise && !notch)) device = 'trackpad';
      else if (!continuous || !device) {
        device = y < 40 ? 'trackpad' : 'mouse';
      }
      // Retain the decision across acceleration and momentum rather than
      // turning a fast trackpad scroll into zoom when its deltas grow.
      lastEvent = time;
      return device;
    }
    return {
      route(event, preference = 'auto') {
        if (!event.deltaX && !event.deltaY) return 'none';
        if (event.ctrlKey) return event.deltaY ? 'pinch' : 'none';
        if (event.shiftKey) return 'pan';
        const source = preference === 'mouse' || preference === 'trackpad' ? preference : classify(event);
        return source === 'trackpad' ? 'pan' : event.deltaY ? 'zoom' : 'none';
      },
      reset() { device = null; lastEvent = -Infinity; }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createRouter };
  else root.GraphWheel = { createRouter };
})(typeof window !== 'undefined' ? window : globalThis);
