// Sport-hub: toont de link "Alle sporten live" op het bord van het hoofdtoernooi
// zodra er meer dan één actieve sport is. Met één sport blijft alles zoals het was.
(async () => {
  const el = document.getElementById('hub-link');
  if (!el) return;
  try {
    const r = await fetch('/api/competitions');
    if (!r.ok) return;
    const j = await r.json();
    el.hidden = !(j && j.multi);
  } catch { /* offline: link blijft verborgen */ }
})();
