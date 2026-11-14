// Sport-hub, op het bord van het hoofdtoernooi (/toernooi):
//   • meer dan één actieve sport → de link "Alle sporten live" tonen;
//   • het hoofdtoernooi staat UIT maar er zijn andere sporten → dit bord zou leeg
//     blijven, dus door naar /sporten. De zoekvraag gaat mee, zodat een link uit
//     een mail (?volg=<id>&push=1) daar het juiste team klaarzet. Met ?hoofd=1
//     blijf je hier (voor de organisatie).
// Met één sport (het hoofdtoernooi) verandert er niets.
(async () => {
  const el = document.getElementById('hub-link');
  try {
    const r = await fetch('/api/competitions');
    if (!r.ok) return;
    const j = await r.json();
    const list = j && Array.isArray(j.competitions) ? j.competitions : [];
    if (list.length && !list.some(c => c.id === 1)) {
      let stay = false;
      try { stay = new URLSearchParams(location.search).get('hoofd') === '1'; } catch {}
      if (!stay) { location.replace('/sporten' + location.search); return; }
    }
    if (el) el.hidden = !(j && j.multi);
  } catch { /* offline: link blijft verborgen */ }
})();
