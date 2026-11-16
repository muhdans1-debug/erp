export const getAdminPin = () => {
  return (
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('askar_admin_pin')) ||
    (typeof localStorage !== 'undefined' && (localStorage.getItem('askar_admin_pin') || localStorage.getItem('askar_manager_pin') || localStorage.getItem('MANAGER_PIN'))) ||
    '9999'
  );
};

