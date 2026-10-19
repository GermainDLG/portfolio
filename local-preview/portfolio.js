const contact = document.querySelector('#contact-template').content.cloneNode(true);
document.querySelector('.contact-slot').append(contact);
const contactSection = document.querySelector('#contact');
function showPage() {
  const target = location.hash.slice(1);
  const name = target === 'projects' ? 'projects' : 'about';
  for (const page of document.querySelectorAll('.page')) page.hidden = page.id !== name;
  for (const link of document.querySelectorAll('[data-page]')) {
    if (link.dataset.page === (target === 'contact' ? 'contact' : name)) link.setAttribute('aria-current', target === 'contact' ? 'location' : 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${name === 'projects' ? 'Projects' : 'About Me'} — Davis Germain`;
  if (target === 'contact') contactSection.scrollIntoView({ block: 'start' });
  else if (target !== 'main') window.scrollTo(0, 0);
}
window.addEventListener('hashchange', showPage);
contactSection.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  contactSection.querySelector('.form-status').textContent = 'Thanks for stopping by! This form is a preview, so your message hasn’t been sent.';
});
showPage();
