const https = require(‘https’);
const wallet = ‘2octNbV8QTtaFMJtbWhtkqMQt3deBe4D8mYcNworhv3t’;
const key = ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’;
let all = [];
let before = ‘’;
let page = 0;

function fetchPage() {
var url = ‘https://api.helius.xyz/v0/addresses/’ + wallet + ‘/transactions?limit=100&api-key=’ + key;
if (before) url += ‘&before=’ + before;
https.get(url, { headers: { ‘User-Agent’: ‘node’ } }, function(res) {
var d = ‘’;
res.on(‘data’, function(x) { d += x; });
res.on(‘end’, function() {
var txs = JSON.parse(d);
if (txs.length === 0) {
showResults();
return;
}
all = all.concat(txs);
page++;
console.log(’Page ’ + page + ’: ’ + txs.length + ’ tx | Total: ’ + all.length);
if (txs.length < 100 || all.length >= 500) {
showResults();
return;
}
before = txs[txs.length - 1].signature;
setTimeout(fetchPage, 300);
});
});
}

function showResults() {
var types = {};
all.forEach(function(tx) {
var t = tx.type || ‘?’;
types[t] = (types[t] || 0) + 1;
});
console.log(‘Total tx:’, all.length);
console.log(‘Types:’, JSON.stringify(types));
console.log(‘SWAP:’, types.SWAP || 0);
console.log(‘UNKNOWN:’, types.UNKNOWN || 0);
}

fetchPage();
