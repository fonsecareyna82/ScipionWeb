// check_map.js
const fs = require('fs');
const path = require('path');

function exitWith(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

const arg = process.argv[2];
let mapPath = arg && fs.existsSync(arg) ? arg : null;

if (!mapPath) {
  // Try to auto-detect any .map under dist/umd
  const dir = path.resolve(process.cwd(), 'dist/umd');
  if (!fs.existsSync(dir)) exitWith(`No existe el directorio esperado: ${dir}`);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.map'));
  if (files.length === 0) exitWith(`No se encontraron archivos .map en ${dir}`);
  // Prefer the obvious widget file names if present
  const prefer = ['widget.umd.js.map', 'widget.umd.peer.js.map', 'widget.umd.umd.cjs.map', 'widget.umd.cjs.map'];
  const preferred = files.find(f => prefer.includes(f));
  mapPath = preferred ? path.join(dir, preferred) : path.join(dir, files[0]);
  console.log(`Auto-detectado: ${mapPath}`);
} else {
  mapPath = path.resolve(process.cwd(), mapPath);
  if (!fs.existsSync(mapPath)) exitWith(`El fichero ${mapPath} no existe.`);
}

const raw = fs.readFileSync(mapPath, 'utf8');

console.log('Leyendo map:', mapPath);

try {
  const parsed = JSON.parse(raw);
  console.log(' ➜ JSON parseado OK. Fuentes (sources) =', (parsed.sources || []).length);
  if (raw.indexOf('Infinity') !== -1) {
    console.warn(' ⚠️ Se encontró la cadena "Infinity" dentro del map (posible corrupción).');
  } else {
    console.log(' ✔ No se encontró "Infinity" en el contenido del map.');
  }
  // opcional: imprimir un resumen
  console.log(' keys in map:', Object.keys(parsed).slice(0, 10).join(', '));
} catch (err) {
  console.error('❌ Error parseando el .map:', err.message);
  console.log('--- Primeros 1200 caracteres del .map para inspección ---\n');
  console.log(raw.slice(0, 1200));
  process.exit(2);
}
