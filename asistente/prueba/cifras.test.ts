// Copia de cifras() de src/index.ts, para probar el verificador aislado.
function cifras(texto: string): string[] {
  const salida: string[] = []
  for (const m of texto.matchAll(/\d[\d\s\u00a0\u202f.,]*\d|\d/g)) {
    const limpio = m[0].replace(/[\s\u00a0\u202f]/g, '')
    const entero = limpio.replace(/[.,](?=\d{3}(\D|$))/g, '').split(/[.,]/)[0]
    if (entero) salida.push(String(Number(entero)))
  }
  return salida
}
const casos: [string, string[]][] = [
  ['Recibió ₡449 896 en setiembre de 2026.', ['449896', '2026']],
  ['Su remuneración bruta fue ₡4 000 714,75.', ['4000714']],
  ['Tuvo 4.237 votaciones y 5 aprobadas.', ['4237', '5']],
  ['Hay 6 diputados en total.', ['6']],
  ['Figura en 112 de 112 actas (art. 137).', ['112', '112', '137']],
  ['El 12 de octubre de 2026', ['12', '2026']],
]
let mal = 0
for (const [t, esperado] of casos) {
  const r = cifras(t)
  const ok = JSON.stringify(r) === JSON.stringify(esperado)
  if (!ok) mal++
  console.log(ok ? 'OK ' : 'MAL', t, '->', r.join(','))
}
process.exit(mal ? 1 : 0)
