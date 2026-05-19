const fs = require('fs');
const txt = fs.readFileSync('shri_mala_db.json', 'utf8');
const fixed = txt.trim().replace(/\}\s*\{/, '},{');
const arr = JSON.parse('[' + fixed + ']');
const merged = Object.assign({}, arr[0], arr[1]);
if (arr[0].products && arr[0].products.length) merged.products = arr[0].products;
fs.writeFileSync('shri_mala_db.json', JSON.stringify(merged, null, 2));
console.log('Done! Products:', merged.products.length);