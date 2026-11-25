// Access to spreads. Each spread in spreads.js is marked access: "free" or "paid".
// Free spreads always open. A paid spread opens when the viewer holds an entitlement for it:
// its own id, or "all" for full access.
//
// Payments are not connected yet, so nobody holds entitlements and every paid spread shows the
// "full access" screen. When payments exist, the site's backend confirms a purchase and calls
// ACCESS.setEntitlements([...]) after load; requestAccess() is where the checkout starts.
// Do not trust anything stored in the browser for this: the check must come from the backend.

window.ACCESS = (function () {
  let entitlements = [];
  const listeners = [];

  function canOpen(spread) {
    return !spread || spread.access !== "paid" || entitlements.includes("all") || entitlements.includes(spread.id);
  }

  function setEntitlements(list) {
    entitlements = Array.isArray(list) ? list.slice() : [];
    listeners.forEach(fn => fn());
  }

  function onChange(fn) { listeners.push(fn); }

  // Starts buying access to a spread. Resolves true once access is granted, false otherwise.
  function requestAccess(spread) {
    return Promise.resolve(false);
  }

  return { canOpen, setEntitlements, onChange, requestAccess, paymentsReady: false };
})();
