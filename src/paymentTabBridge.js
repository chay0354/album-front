/**
 * Open the cart in a new tab on the user's click (Preview / Done). Long PDF work runs afterward;
 * assigning URL to about:blank after await fails in Chrome (user activation expires) and in Safari/WebKit.
 */
let checkoutOpenedOnPaymentClick = false;

/**
 * Call synchronously from click/tap before navigating to the studio.
 * @param {string} cartUrl
 * @returns {boolean} whether a new tab was opened
 */
export function openPaymentTabOnUserClick(cartUrl) {
  if (!cartUrl) return false;
  try {
    const w = window.open(cartUrl, "_blank");
    if (w && !w.closed) {
      checkoutOpenedOnPaymentClick = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  checkoutOpenedOnPaymentClick = false;
  return false;
}

/**
 * After PDF saved: clear bookkeeping. Checkout tab was already opened on click.
 * @returns {boolean} true if the cart tab had been opened from the click
 */
export function finishPaymentTabNavigation() {
  const ok = checkoutOpenedOnPaymentClick;
  checkoutOpenedOnPaymentClick = false;
  return ok;
}

export function abortPaymentFlowAfterPdfFailure() {
  checkoutOpenedOnPaymentClick = false;
}
