(() => {
  const app = document.getElementById('display-app');
  const welcome = document.getElementById('welcome-screen');

  function setAuthenticated(authenticated, animate = false) {
    document.body.classList.toggle('skip-auth-transition', authenticated && !animate);
    document.body.classList.toggle('is-authenticated', authenticated);
    app.inert = !authenticated;
    app.setAttribute('aria-hidden', String(!authenticated));
    welcome.setAttribute('aria-hidden', String(authenticated));
  }

  const initiallyAuthenticated =
    new URLSearchParams(window.location.search).get('authenticated') === 'true';
  if (initiallyAuthenticated) setAuthenticated(true);

  window.vinkupDisplay?.onAuthenticationChange(setAuthenticated);
})();
