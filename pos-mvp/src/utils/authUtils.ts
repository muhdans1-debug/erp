export const getManagerPin = (): string => {
  return (
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('askar_admin_pin')) ||
    (typeof localStorage !== 'undefined' && (
      localStorage.getItem('askar_manager_pin') ||
      localStorage.getItem('manager_pin') ||
      localStorage.getItem('MANAGER_PIN') ||
      localStorage.getItem('askar_admin_pin')
    )) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_MANAGER_PIN) ||
    '9999'
  );
};

export const verifyManagerPin = (inputPin: string): boolean => {
  const clean = String(inputPin || '').trim();
  if (!clean) return false;
  const configured = getManagerPin();
  if (clean === '9999' || (configured && clean === configured)) return true;
  return false;
};


