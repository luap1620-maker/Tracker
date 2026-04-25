const axios = require(‘axios’);
const fs = require(‘fs’);
const path = require(‘path’);

const CONFIG = {
HELIUS_API_KEY: ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_API: ‘https://api.helius.xyz/v0’,
HELIUS_RPC: ‘https://mainnet.helius-rpc.com/?api-key=9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
SOL_PRICE: 150,
MIN_WINRATE: 55,
MAX_RUG_RATE: 25,
MIN_TRADES: 3,
MIN_BALANCE_USD: 500,

// Ajoute ici tes wallets a analyser
WALLETS: [
{ address: ‘65paNEG8m7mCVoASVF2KbRdU21aKXdASSB9G3NjCSQuE’, alias: ‘jijo’ },
{ address: ‘4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk’, alias: ‘PULL’ },
],

RAPPORT_DIR: path.join(__dirname, ‘rapports’),
LATEST_JSON: path.join(__dirname, ‘latest_wallets.json’),
HISTORIQUE_DIR: path.join(__dirname, ‘historique’),
DELAY: 400,
};

const sleep = function(ms) { return new Promise(function(r) { return setTimeout(r, ms); }); };

function ensureDirs() {
[CONFIG.RAPPORT_DIR, CONFIG.HISTORIQUE_DIR].forEach(function(dir) {
if (fs.existsSync(dir) === false) fs.mkdirSync(dir, { recursive: true });
});
}

function timestamp() {
return new Date().toISOString().replace(‘T’, ’ ’).substring(0, 19);
}

function dateTag() {
return new Date().toISOString().substring(0, 16).replace(’:’, ‘h’).replace(‘T’, ‘_’);
}

function log(msg) {
console.log(’[’ + timestamp() + ’] ’ + msg);
}

async function getWalletBalance(address) {
try {
var res = await axios.post(CONFIG.HELIUS_RPC, {
jsonrpc: ‘2.0’, id: 1, method: ‘getBalance’, params: [address]
}, { timeout: 10000 });
var lamports = res.data.result ? res.data.result.value : 0;
return (lamports / 1e9) * CONFIG.SOL_PRICE;
} catch (err) { return 0; }
}

async function getTransactionsPage(address, before) {
var params = { limit: 100, type: ‘SWAP’, ‘api-key’: CONFIG.HELIUS_API_KEY };
if (before) params.before = before;
try {
var res = await axios.get(CONFIG.HELIUS_API + ‘/addresses/’ + address + ‘/transactions’, {
params: params, timeout: 20000,
});
return res.data || [];
} catch (err) { return []; }
}

async function getAllTransactions(address) {
var allTxs = [];
var before = null;
for (var page = 0; page < 10; page++) {
var txs = await getTransactionsPage(address, before);
if (!txs || txs.length === 0) break;
allTxs = allTxs.concat(txs);
if (txs.length < 100) break;
before = txs[txs.length - 1].signature;
await sleep(200);
}
return allTxs;
}

function analyze(txs, address) {
var tokenTrades = {};
var now = Date.now() / 1000;
var weekAgo = now - (7 * 24 * 3600);
var monthAgo = now - (30 * 24 * 3600);
var lastActive = 0;
var recent7d = 0;
var recent30d = 0;
var dailyCounts = {};

for (var t = 0; t < txs.length; t++) {
var tx = txs[t];
if (!tx || !tx.timestamp) continue;
if (tx.timestamp > lastActive) lastActive = tx.timestamp;
if (tx.timestamp > weekAgo) recent7d++;
if (tx.timestamp > monthAgo) recent30d++;
var day = new Date(tx.timestamp * 1000).toISOString().substring(0, 10);
dailyCounts[day] = (dailyCounts[day] || 0) + 1;

```
var solChange = 0;
var nativeTransfers = tx.nativeTransfers || [];
for (var n = 0; n < nativeTransfers.length; n++) {
  var nt = nativeTransfers[n];
  if (nt.fromUserAccount === address) solChange -= nt.amount / 1e9;
  if (nt.toUserAccount === address) solChange += nt.amount / 1e9;
}

var tokenTransfers = tx.tokenTransfers || [];
var mintReceived = null;
var mintSent = null;
for (var s = 0; s < tokenTransfers.length; s++) {
  var tf = tokenTransfers[s];
  if (!tf.mint || tf.mint === 'So11111111111111111111111111111111111111112') continue;
  if (tf.toUserAccount === address) mintReceived = tf.mint;
  if (tf.fromUserAccount === address) mintSent = tf.mint;
}

var mint = mintReceived || mintSent;
if (!mint) continue;

if (!tokenTrades[mint]) tokenTrades[mint] = { solIn: 0, solOut: 0, buys: 0, sells: 0 };

if (mintReceived && !mintSent) {
  tokenTrades[mint].solIn += Math.abs(solChange);
  tokenTrades[mint].buys++;
} else if (mintSent && !mintReceived) {
  tokenTrades[mint].solOut += Math.abs(solChange);
  tokenTrades[mint].sells++;
}
```

}

var wins = 0, losses = 0, rugs = 0, totalPnl = 0;
var mints = Object.keys(tokenTrades);
for (var m = 0; m < mints.length; m++) {
var tr = tokenTrades[mints[m]];
if (tr.solIn === 0) continue;
if (tr.sells === 0) { rugs++; continue; }
var roi = tr.solOut / tr.solIn;
totalPnl += (tr.solOut - tr.solIn);
if (roi >= 1.2) wins++;
else if (roi < 0.8) losses++;
}

var maxPerDay = 0;
var days = Object.keys(dailyCounts);
for (var d = 0; d < days.length; d++) {
if (dailyCounts[days[d]] > maxPerDay) maxPerDay = dailyCounts[days[d]];
}

var totalTrades = wins + losses;
return {
totalTrades: totalTrades,
totalTokens: mints.length,
wins: wins,
losses: losses,
rugs: rugs,
winrate: totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) : ‘0.0’,
rugRate: mints.length > 0 ? (rugs / mints.length * 100).toFixed(1) : ‘0.0’,
pnlSol: totalPnl.toFixed(2),
recent7d: recent7d,
recent30d: recent30d,
lastActive: lastActive,
lastActiveDate: lastActive > 0 ? new Date(lastActive * 1000).toISOString().substring(0, 10) : ‘N/A’,
isActive: lastActive > weekAgo,
maxPerDay: maxPerDay,
totalTx: txs.length,
};
}

function score(stats, balance) {
var s = 0;
s += Math.min((parseFloat(stats.winrate) / 100) * 35, 35);
s += Math.max((1 - parseFloat(stats.rugRate) / 100) * 20, 0);
s += Math.min((stats.totalTrades / 50) * 20, 20);
s += Math.min((stats.recent7d / 30) * 10, 10);
s += Math.min((parseFloat(stats.pnlSol) / 100) * 10, 10);
s += Math.min((balance / 10000) * 5, 5);
return s.toFixed(1);
}

function passes(stats, balance) {
if (balance < CONFIG.MIN_BALANCE_USD) return false;
if (parseFloat(stats.winrate) < CONFIG.MIN_WINRATE) return false;
if (parseFloat(stats.rugRate) >= CONFIG.MAX_RUG_RATE) return false;
if (!stats.isActive) return false;
if (stats.totalTrades < CONFIG.MIN_TRADES) return false;
return true;
}

async function run() {
log(’========== Demarrage Wallet Tracker ==========’);
ensureDirs();
var results = [];

for (var i = 0; i < CONFIG.WALLETS.length; i++) {
var w = CONFIG.WALLETS[i];
log(’[’ + (i+1) + ‘/’ + CONFIG.WALLETS.length + ’] ’ + (w.alias || w.address.substring(0,8)));

```
var balance = await getWalletBalance(w.address);
var txs = await getAllTransactions(w.address);
var stats = analyze(txs, w.address);
var sc = score(stats, balance);
var pass = passes(stats, balance);

log('  $' + balance.toFixed(0) + ' | ' + txs.length + 'tx | WR: ' + stats.winrate + '% | PnL: ' + stats.pnlSol + ' SOL | Rug: ' + stats.rugRate + '% | Trades: ' + stats.totalTrades + ' | ' + (pass ? 'RETENU' : 'filtre'));

if (pass) {
  results.push({
    address: w.address,
    alias: w.alias || '',
    balance_usd: balance.toFixed(0),
    winrate: stats.winrate,
    pnlSol: stats.pnlSol,
    rugRate: stats.rugRate,
    totalTrades: stats.totalTrades,
    wins: stats.wins,
    losses: stats.losses,
    rugs: stats.rugs,
    totalTokens: stats.totalTokens,
    recent7d: stats.recent7d,
    recent30d: stats.recent30d,
    maxPerDay: stats.maxPerDay,
    totalTx: stats.totalTx,
    lastActiveDate: stats.lastActiveDate,
    score: sc,
  });
}
await sleep(CONFIG.DELAY);
```

}

results.sort(function(a, b) { return parseFloat(b.score) - parseFloat(a.score); });
log(’=== ’ + results.length + ’ wallets retenus sur ’ + CONFIG.WALLETS.length + ’ analyses ===’);

var report = generateReport(results);
console.log(’\n’ + report);
saveResults(results, report);
log(‘Cycle termine.’);
}

function generateReport(wallets) {
var now = timestamp();
var r = ‘’;
r += ‘============================================================\n’;
r += ’  RAPPORT WALLET TRACKER - ’ + now + ‘\n’;
r += ‘============================================================\n\n’;
r += ‘RESUME\n’;
r += ‘–––––––––––––––––––––––\n’;
r += ’  Wallets analyses : ’ + CONFIG.WALLETS.length + ‘\n’;
r += ’  Wallets retenus  : ’ + wallets.length + ‘\n’;
r += ’  Filtres          : WR >= ’ + CONFIG.MIN_WINRATE + ’%, Rug < ’ + CONFIG.MAX_RUG_RATE + ‘%, Balance >= $’ + CONFIG.MIN_BALANCE_USD + ‘, >= ’ + CONFIG.MIN_TRADES + ’ trades\n\n’;

if (wallets.length === 0) {
r += ‘Aucun wallet ne passe les filtres.\n\n’;
} else {
r += ‘TOP WALLETS\n’;
r += ‘–––––––––––––––––––––––\n\n’;
for (var i = 0; i < wallets.length; i++) {
var w = wallets[i];
var label = w.alias ? w.alias : w.address.substring(0, 8) + ‘…’ + w.address.slice(-4);
r += (i+1) + ‘. ’ + label + ‘\n’;
r += ’   Score         : ’ + w.score + ‘/100\n’;
r += ’   Balance       : $’ + w.balance_usd + ‘\n’;
r += ’   Winrate       : ’ + w.winrate + ‘% (’ + w.wins + ‘W / ’ + w.losses + ‘L)\n’;
r += ’   PnL           : ’ + w.pnlSol + ’ SOL\n’;
r += ’   Rug Rate      : ’ + w.rugRate + ‘% (’ + w.rugs + ’ rugs / ’ + w.totalTokens + ’ tokens)\n’;
r += ’   Trades        : ’ + w.totalTrades + ’ fermes\n’;
r += ’   Transactions  : ’ + w.totalTx + ’ analysees\n’;
r += ’   Max/jour      : ’ + w.maxPerDay + ‘\n’;
r += ’   Actif 7j      : ’ + w.recent7d + ’ tx\n’;
r += ’   Actif 30j     : ’ + w.recent30d + ’ tx\n’;
r += ’   Dernier trade : ’ + w.lastActiveDate + ‘\n’;
r += ’   Adresse       : ’ + w.address + ‘\n\n’;
}

```
r += 'RECOMMANDES POUR LE BOT DE TRADING\n';
r += '----------------------------------------------\n';
for (var j = 0; j < Math.min(wallets.length, 5); j++) {
  r += '  ' + (j+1) + '. ' + wallets[j].address + '  (score: ' + wallets[j].score + ')\n';
}
```

}

r += ‘\n============================================================\n’;
r += ’  Prochain rapport dans 1 heure\n’;
r += ‘============================================================\n’;
return r;
}

function saveResults(wallets, report) {
var tag = dateTag();
var reportPath = path.join(CONFIG.RAPPORT_DIR, ‘rapport_’ + tag + ‘.txt’);
fs.writeFileSync(reportPath, report, ‘utf8’);
var jsonPath = path.join(CONFIG.HISTORIQUE_DIR, ‘wallets_’ + tag + ‘.json’);
fs.writeFileSync(jsonPath, JSON.stringify(wallets, null, 2), ‘utf8’);
fs.writeFileSync(CONFIG.LATEST_JSON, JSON.stringify({
updated_at: timestamp(), count: wallets.length, wallets: wallets
}, null, 2), ‘utf8’);
log(’Rapport : ’ + reportPath);
}

var ONE_HOUR = 60 * 60 * 1000;
log(‘Wallet Tracker demarre - cycle toutes les 1h’);
run();
setInterval(function() { run(); }, ONE_HOUR);