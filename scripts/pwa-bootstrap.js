(() => {
  const root = document.getElementById('pwa-bootstrap')
  if (!isSecureContext || !('serviceWorker' in navigator)) { root.remove(); return }
  const base = new URL('./', document.currentScript.src)
  const load = (enable = false) => {
    const script = document.createElement('script')
    script.src = new URL('pwa-client.js', base).href
    script.onload = () => { root.remove(); if (enable) document.querySelector('.inftab-pwa-control button').click() }
    script.onerror = () => { root.querySelector('button').disabled = false }
    root.querySelector('button').disabled = true
    document.head.append(script)
  }
  root.querySelector('button').onclick = () => load(true)
  try { if (navigator.serviceWorker.controller || localStorage.getItem('inftab.pwa.enabled.v1') === '1') load() } catch {}
})()
