function showPage({ moveFocus = false } = {}) {
  const target = location.hash.slice(1);
  const destination = document.getElementById(target);
  const name = target === 'main'
    ? document.querySelector('.page:not([hidden])').id
    : target === 'projects' || destination?.closest('#projects') ? 'projects' : 'about';
  for (const page of document.querySelectorAll('.page')) page.hidden = page.id !== name;
  for (const link of document.querySelectorAll('[data-page]')) {
    if (link.dataset.page === (target === 'contact' ? 'contact' : name)) link.setAttribute('aria-current', target === 'contact' ? 'location' : 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${name === 'projects' ? 'Projects' : 'About Me'} — Davis Germain`;
  const focusTarget = destination || document.getElementById('about-title');
  if (moveFocus) {
    // Follow page and section links with keyboard focus as well as scrolling.
    if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  }
  if (destination && !['about', 'projects'].includes(target)) destination.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => showPage({ moveFocus: true }));
showPage();
