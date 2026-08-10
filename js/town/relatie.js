// Afgesplitst van town.js: vertaling van een relatiegetal naar een woord.
function relatieWoord(v) {
  if (v <= -60) return 'op leven en dood';
  if (v <= -25) return 'vijandig';
  if (v < 15) return 'koel';
  if (v < 50) return 'vriendelijk';
  return 'bondgenoot';
}

export { relatieWoord };
