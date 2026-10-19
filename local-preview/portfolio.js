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
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  const name = fields.get('name').trim();
  const email = fields.get('email').trim();
  const message = fields.get('message').trim();
  const subject = 'Portfolio message from ' + name;
  const body = `Name: ${name}\r\nEmail: ${email}\r\n\r\n${message}`;
  window.location.href = `mailto:davisgermain621@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  contactSection.querySelector('.form-status').textContent = 'Your email app should open with your message ready. Press Send there to contact me. If nothing opens, email davisgermain621@gmail.com directly.';
});
showPage();
