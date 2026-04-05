/**
 * Chrome: open about:blank on user click, then set w.location after PDF saves (avoids popup block).
 * Safari / iOS WebKit: assigning a URL to that popup after async often stays on about:blank — open cart URL on the click instead.
 */
let pendingPaymentWindow = null;
let checkoutOpenedDirectOnGesture = false;

/** iOS WebKit + desktop Safari: direct window.open(cartUrl) on tap; blank-tab+assign is unreliable. */
function needsDirectCartOpenOnUserClick() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua)) {
    return true;
  }
  return false;
}

/**
 * Call synchronously from click/tap before navigating to the studio.
 * @param {string} cartUrl
 * @returns {boolean} whether a tab was opened (direct cart or blank placeholder)
 */
export function openPaymentTabOnUserClick(cartUrl) {
  if (!cartUrl) return false;
  if (needsDirectCartOpenOnUserClick()) {
    try {
      const w = window.open(cartUrl, "_blank");
      if (w && !w.closed) {
        checkoutOpenedDirectOnGesture = true;
        return true;
      }
    } catch {
      /* ignore */
    }
    checkoutOpenedDirectOnGesture = false;
    return false;
  }
  try {
    const w = window.open("about:blank", "_blank");
    pendingPaymentWindow = w && !w.closed ? w : null;
    return !!pendingPaymentWindow;
  } catch {
    pendingPaymentWindow = null;
    return false;
  }
}

function navigatePendingBlankTabTo(cartUrl) {
  const w = pendingPaymentWindow;
  pendingPaymentWindow = null;
  if (!cartUrl || !w || w.closed) return false;
  try {
    w.location.href = cartUrl;
    return true;
  } catch {
    try {
      w.location.replace(cartUrl);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * After PDF saved: navigate blank tab, or acknowledge direct-open path.
 * @returns {boolean} true if checkout tab is already correct or was updated
 */
export function finishPaymentTabNavigation(cartUrl) {
  if (checkoutOpenedDirectOnGesture) {
    checkoutOpenedDirectOnGesture = false;
    return true;
  }
  return navigatePendingBlankTabTo(cartUrl);
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

export function abortPaymentFlowAfterPdfFailure() {
  cancelPendingPaymentTab();
  checkoutOpenedDirectOnGesture = false;
}
