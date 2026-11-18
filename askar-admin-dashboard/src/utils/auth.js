// askar-admin-dashboard/src/utils/auth.js

/**
 * Retrieves the currently active admin/manager PIN from session storage.
 * Strictly avoids persisting manager credentials into permanent localStorage disk.
 */
export const getAdminPin = () => {
  if (typeof sessionStorage !== 'undefined') {
    const pin = sessionStorage.getItem('askar_admin_pin');
    if (pin) return pin.trim();
  }
  return '';
};

/**
 * Sets the authenticated admin PIN in session storage for the active session.
 * Actively purges any legacy plaintext PIN keys from localStorage.
 */
export const setAdminPin = (pin) => {
  const clean = String(pin || '').trim();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('askar_admin_pin', clean);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('askar_admin_pin');
    localStorage.removeItem('askar_manager_pin');
    localStorage.removeItem('MANAGER_PIN');
  }
};

/**
 * Clears the admin session.
 */
export const clearAdminPin = () => {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('askar_admin_pin');
    sessionStorage.removeItem('askar_admin_login_at');
    sessionStorage.removeItem('askar_admin_last_activity');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('askar_admin_pin');
    localStorage.removeItem('askar_manager_pin');
    localStorage.removeItem('MANAGER_PIN');
  }
};
