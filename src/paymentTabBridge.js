/**
 * Chrome blocks window.open(cartUrl) after async work. Open about:blank synchronously on user click,
 * then assign w.location.href to the cart URL after PDF saves (still same "opener" chain).
 * Do not use noopener on the initial open — we need the Window reference.
 */
let pendingPaymentWindow = null;

export function openBlankPaymentTabFromUserGesture() {
  try {
    const w = window.open("about:blank", "_blank");
    pendingPaymentWindow = w && !w.closed ? w : null;
    return !!pendingPaymentWindow;
  } catch {
    pendingPaymentWindow = null;
    return false;
  }
}

/** @returns {boolean} true if the pending tab was navigated to cartUrl */
export function navigatePendingPaymentTabTo(cartUrl) {
  const w = pendingPaymentWindow;
  pendingPaymentWindow = null;
  if (!cartUrl || !w || w.closed) return false;
  try {
    w.location.href = cartUrl;
    return true;
  } catch {
    return false;
  }
}

export function cancelPendingPaymentTab() {
  if (pendingPaymentWindow && !pendingPaymentWindow.closed) {
    try {
      pendingPaymentWindow.close();
    } catch {
      /* ignore */
    }
  }
  pendingPaymentWindow = null;
}
