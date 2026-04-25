const https = require(‘https’);
const wallet = ‘215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP’;
const key = ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’;
let all = [];
let before = ‘’;
let page = 0;
const now = Date.now() / 1000;
const thirtyDaysAgo = now - (30 * 24 * 3600);

function fetchPage() {
var url = ‘https://api.helius.xyz/v0/addresses/’ + wallet + ‘/transactions?limit=100&type=SWAP&api-key=’ + key;
if (before) url += ‘&before=’ + before;
https.get(url, { headers: { ‘User-Agent’: ‘node’ } }, function(res) {
var d = ‘’;
res.on(‘data’, function(x) { d += x; });
res.on(‘end’, function() {
var txs = JSON.parse(d);
if (txs.length === 0) { analyze(); return; }

```
  var stop = false;
  txs.forEach(function(tx) {
    if (tx.timestamp && tx.timestamp < thirtyDaysAgo) {
      stop = true;
    } else {
      all.push(tx);
    }
  });

  page++;
  console.log('Page ' + page + ': ' + txs.length + ' tx | Dans 30j: ' + all.length + ' | Dernier: ' + new Date(txs[txs.length-1].timestamp * 1000).toISOString().substring(0,10));

  if (stop || txs.length < 100 || all.length >= 1000) {
    analyze();
    return;
  }
  before = txs[txs.length - 1].signature;
  setTimeout(fetchPage, 300);
});
```

});
}

function analyze() {
console.log(’\nTransactions dans les 30 derniers jours: ’ + all.length);

var tokenTrades = {};
all.forEach(function(tx) {
var solChange = 0;
(tx.nativeTransfers || []).forEach(function(nt) {
if (nt.fromUserAccount === wallet) solChange -= nt.amount / 1e9;
if (nt.toUserAccount === wallet) solChange += nt.amount / 1e9;
});

```
var mintReceived = null;
var mintSent = null;
(tx.tokenTransfers || []).forEach(function(tf) {
  if (!tf.mint || tf.mint === 'So11111111111111111111111111111111111111112') return;
  if (tf.toUserAccount === wallet) mintReceived = tf.mint;
  if (tf.fromUserAccount === wallet) mintSent = tf.mint;
});

var mint = mintReceived || mintSent;
if (!mint) return;
if (!tokenTrades[mint]) tokenTrades[mint] = { solIn: 0, solOut: 0, buys: 0, sells: 0 };

if (mintReceived && !mintSent) {
  tokenTrades[mint].solIn += Math.abs(solChange);
  tokenTrades[mint].buys++;
} else if (mintSent && !mintReceived) {
  tokenTrades[mint].solOut += Math.abs(solChange);
  tokenTrades[mint].sells++;
}
```

});

var wins = 0, losses = 0, rugs = 0, totalPnl = 0;
var mints = Object.keys(tokenTrades);
mints.forEach(function(m) {
var tr = tokenTrades[m];
if (tr.solIn === 0) return;
if (tr.sells === 0) { rugs++; return; }
var roi = tr.solOut / tr.solIn;
totalPnl += (tr.solOut - tr.solIn);
if (roi >= 1.2) wins++;
else if (roi < 0.8) losses++;
});

var total = wins + losses;
console.log(’\n=== HELIUS - 30 derniers jours ===’);
console.log(’Tokens trades  : ’ + mints.length);
console.log(‘Trades fermes  : ’ + total + ’ (’ + wins + ’W / ’ + losses + ‘L)’);
console.log(‘Rugs           : ’ + rugs);
console.log(‘Winrate        : ’ + (total > 0 ? (wins/total*100).toFixed(1) : ‘0’) + ‘%’);
console.log(’Rug rate       : ’ + (mints.length > 0 ? (rugs/mints.length*100).toFixed(1) : ‘0’) + ‘%’);
console.log(‘PnL SOL        : ’ + totalPnl.toFixed(2) + ’ SOL’);
console.log(‘PnL USD        : $’ + (totalPnl * 150).toFixed(0));
console.log(’\n=== UWUU.AI dit ===’);
console.log(‘PnL monthly    : $136,296’);
console.log(‘ROI monthly    : 172.03%’);
console.log(’Trades monthly : ’ + (all.length));
}

fetchPage();
