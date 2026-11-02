/**
 * Dukungan layar sentuh (Master Prompt §5.3): ketuk = buka, tekan lama = pilih.
 */
export function isTouchDevice() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Handler pointer untuk tekan lama. Hanya bereaksi pada pointer sentuh; mouse tetap
 * memakai klik kanan. Klik yang menyusul tekan lama ditelan agar item tidak terbuka.
 */
export function longPressHandlers(onLongPress, { delay = 450 } = {}) {
  let timer = null;
  let fired = false;
  let startX = 0;
  let startY = 0;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    onPointerDown: (e) => {
      if (e.pointerType !== 'touch') return;
      fired = false;
      startX = e.clientX;
      startY = e.clientY;
      cancel();
      timer = setTimeout(() => {
        fired = true;
        if (navigator.vibrate) navigator.vibrate(10);
        onLongPress(e);
      }, delay);
    },
    onPointerMove: (e) => {
      if (timer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture: (e) => {
      if (fired) {
        e.stopPropagation();
        e.preventDefault();
        fired = false;
      }
    }
  };
}
