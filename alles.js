// Wegwijzer van de kijkversie: "Begin opnieuw" wist alleen wat dit voorbeeld in deze browser bewaart.
document.getElementById('opnieuw').addEventListener('click', function () {
  try { ['kijk_stad', 'kijk_admin', 'kijk_crew', 'kijk_mijn_gezet', 'jvo_mijn', 'jvo_mijn_kaarten', 'jvo_stad', 'jvo_admin_token', 'jvo_admin_name', 'jvo_crew_token', 'jvo_crew_name'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  this.textContent = 'Gewist';
});
