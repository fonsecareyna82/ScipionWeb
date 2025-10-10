// check_mappings.cjs
const fs = require('fs');
const path = require('path');

const mapDir = path.resolve(process.cwd(), 'dist/umd');
if (!fs.existsSync(mapDir)) {
  console.error('No existe dist/umd — construye primero');
  process.exit(1);
}
const mapFiles = fs.readdirSync(mapDir).filter(f => f.endsWith('.map'));
if (!mapFiles.length) {
  console.error('No se encontraron .map en dist/umd');
  process.exit(1);
}
const mapPath = path.join(mapDir, mapFiles[0]);
console.log('Leyendo', mapPath);
const raw = fs.readFileSync(mapPath, 'utf8');

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error('No se pudo parsear JSON del map:', err.message);
  process.exit(2);
}

console.log('mappings length:', (parsed.mappings || '').length);
const idx = (parsed.mappings || '').indexOf('Infinity');
console.log('¿"Infinity" dentro de mappings? ', idx !== -1 ? `Sí @ ${idx}` : 'No');

if (idx !== -1) {
  const start = Math.max(0, idx - 120);
  const end = Math.min(raw.length, idx + 120);
  console.log('Contexto de mappings alrededor de la ocurrencia:\n');
  console.log(raw.slice(start, end));
}

console.log('sources:', (parsed.sources || []).length, 'sourcesContent:', (parsed.sourcesContent || []).length);
process.exit(0);
