// Small status message for the admin pages (client-side).
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, isError = false) {
  const el = document.querySelector<HTMLElement>('[data-toast]');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, 3500);
}
