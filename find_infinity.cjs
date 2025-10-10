// find_infinity.cjs
const fs = require('fs');
const path = require('path');

const arg = process.argv[2];
let mapPath = arg && fs.existsSync(arg) ? arg : null;

if (!mapPath) {
  const dir = path.resolve(process.cwd(), 'dist/umd');
  if (!fs.existsSync(dir)) {
    console.error('No existe dist/umd — construye primero');
    process.exit(1);
  }
  const maps = fs.readdirSync(dir).filter(f => f.endsWith('.map'));
  if (maps.length === 0) {
    console.error('No se encontraron .map en dist/umd');
    process.exit(1);
  }
  mapPath = path.join(dir, maps[0]);
  console.log('Auto-detected map:', mapPath);
} else {
  mapPath = path.resolve(process.cwd(), mapPath);
  if (!fs.existsSync(mapPath)) {
    console.error('No existe', mapPath);
    process.exit(1);
  }
}

const raw = fs.readFileSync(mapPath, 'utf8');
console.log('Leyendo', mapPath, 'len=', raw.length);

const occurrences = [];
let idx = raw.indexOf('Infinity');
while (idx !== -1) {
  occurrences.push(idx);
  idx = raw.indexOf('Infinity', idx + 1);
}

console.log('Ocurrencias encontradas:', occurrences.length);
if (occurrences.length === 0) {
  console.log('No se encontró "Infinity" en el map (raro).');
  process.exit(0);
}

for (let i = 0; i < occurrences.length; i++) {
  const pos = occurrences[i];
  const start = Math.max(0, pos - 120);
  const end = Math.min(raw.length, pos + 120);
  console.log(`\n--- occurrence ${i+1} at index ${pos} (context length ${end-start}) ---\n`);
  console.log(raw.slice(start, end));
}

// Try to parse JSON and report sizes
try {
  const parsed = JSON.parse(raw);
  console.log('\nJSON parsed OK — keys:', Object.keys(parsed).join(', '));
  console.log('sources length =', (parsed.sources || []).length);
  console.log('sourcesContent length =', (parsed.sourcesContent || []).length);
  if (parsed.mappings) {
    console.log('mappings length:', parsed.mappings.length);
  }
} catch (err) {
  console.error('\nError parsing map JSON:', err.message);
}

