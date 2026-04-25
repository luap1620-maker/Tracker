const axios = require(‘axios’);
const fs = require(‘fs’);
const path = require(‘path’);

const CONFIG = {
HELIUS_API_KEY: ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_API: ‘https://api.helius.xyz/v0’,
HELIUS_RPC: ‘https://mainnet.helius-rpc.com/?api-key=9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
DEXSCREENER_API: ‘https://api.dexscreener.com’,
MIN_WINRATE: 55,
MAX_RUG_RATE: 25,
MIN_TRADES: 3,
MIN_BALANCE_USD: 1000,
SOL_PRICE: 150,
KNOWN_WALLETS: [
{ address: ‘65paNEG8m7mCVoASVF2KbRdU21aKXdASSB9G3NjCSQuE’, alias: ‘jijo’ },
{ address: ‘4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk’, alias: ‘PULL’ },
],
MAX_NEW_WALLETS: 20,
RAPPORT_DIR: path.join(__dirname, ‘rapports’),
LATEST_JSON: path.join(__dirname, ‘latest_wallets.json’),
HISTORIQUE_DIR: path.join(__dirname, ‘historique’),
DELAY: 400,
MAX_RETRIES: 3,
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

// Balance SOL via Helius RPC
async function getWalletBalance(walletAddress) {
try {
var res = await axios.post(CONFIG.HELIUS_RPC, {
jsonrpc: ‘2.0’, id: 1, method: ‘getBalance’, params: [walletAddress]
}, { timeout: 10000 });
var lamports = res.data.result ? res.data.result.value : 0;
return (lamports / 1e9) * CONFIG.SOL_PRICE;
} catch (err) { return 0; }
}

// Recupere les transactions par page (before = derniere signature)
async function getTransactionsPage(walletAddress, before) {
var params = { limit: 100, type: ‘SWAP’, ‘api-key’: CONFIG.HELIUS_API_KEY };
if (before) params.before = before;
try {
var res = await axios.get(CONFIG.HELIUS_API + ‘/addresses/’ + walletAddress + ‘/transactions’, {
params: params,
timeout: 20000,
});
return res.data || [];
} catch (err) { return []; }
}

// Recupere jusqu’a 1000 transactions en paginant
async function getAllTransactions(walletAddress) {
var allTxs = [];
var before = null;
var pages = 0;
var maxPages = 10; // 10 x 100 = 1000 transactions max

while (pages < maxPages) {
var txs = await getTransactionsPage(walletAddress, before);
if (!txs || txs.length === 0) break;
allTxs = allTxs.concat(txs);
if (txs.length < 100) break;
before = txs[txs.length - 1].signature;
pages++;
await sleep(200);
}

return allTxs;
}

// Analyse les transactions avec logique SOL in/out par token
function analyzeTransactions(transactions, walletAddress) {
var tokenTrades = {};
var now = Date.now() / 1000;
var weekAgo = now - (7 * 24 * 3600);
var monthAgo = now - (30 * 24 * 3600);
var lastActive = 0;
var recent7d = 0;
var recent30d = 0;
var dailyCounts = {};

for (var t = 0; t < transactions.length; t++) {
var tx = transactions[t];
if (!tx || !tx.timestamp) continue;

```
if (tx.timestamp > lastActive) lastActive = tx.timestamp;
if (tx.timestamp > weekAgo) recent7d++;
if (tx.timestamp > monthAgo) recent30d++;

var day = new Date(tx.timestamp * 1000).toISOString().substring(0, 10);
dailyCounts[day] = (dailyCounts[day] || 0) + 1;

// Analyse SOL in/out par token
var solChange = 0;
var nativeTransfers = tx.nativeTransfers || [];
for (var n = 0; n < nativeTransfers.length; n++) {
  var nt = nativeTransfers[n];
  if (nt.fromUserAccount === walletAddress) solChange -= nt.amount / 1e9;
  if (nt.toUserAccount === walletAddress) solChange += nt.amount / 1e9;
}

// Identifier le token echange
var tokenTransfers = tx.tokenTransfers || [];
var mintReceived = null;
var mintSent = null;

for (var s = 0; s < tokenTransfers.length; s++) {
  var tf = tokenTransfers[s];
  if (!tf.mint || tf.mint === 'So11111111111111111111111111111111111111112') continue;
  if (tf.toUserAccount === walletAddress) mintReceived = tf.mint;
  if (tf.fromUserAccount === walletAddress) mintSent = tf.mint;
}

var mint = mintReceived || mintSent;
if (!mint) continue;

if (!tokenTrades[mint]) {
  tokenTrades[mint] = { solIn: 0, solOut: 0, buys: 0, sells: 0, lastTrade: 0 };
}

if (tx.timestamp > tokenTrades[mint].lastTrade) tokenTrades[mint].lastTrade = tx.timestamp;

if (mintReceived && !mintSent) {
  // Achat : on depense SOL pour recevoir token
  tokenTrades[mint].solIn += Math.abs(solChange);
  tokenTrades[mint].buys++;
} else if (mintSent && !mintReceived) {
  // Vente : on recoit SOL en vendant token
  tokenTrades[mint].solOut += Math.abs(solChange);
  tokenTrades[mint].sells++;
}
```

}

// Calculer winrate base sur ROI par token
var wins = 0, losses = 0, rugs = 0;
var totalPnlSol = 0;
var mints = Object.keys(tokenTrades);

for (var m = 0; m < mints.length; m++) {
var trade = tokenTrades[mints[m]];
if (trade.solIn === 0) continue;

```
if (trade.sells === 0) {
  rugs++;
  continue;
}

var roi = trade.solOut / trade.solIn;
totalPnlSol += (trade.solOut - trade.solIn);

if (roi >= 1.2) wins++;
else if (roi < 0.8) losses++;
```

}

var maxPerDay = 0;
var days = Object.keys(dailyCounts);
for (var d = 0; d < days.length; d++) {
if (dailyCounts[days[d]] > maxPerDay) maxPerDay = dailyCounts[days[d]];
}

var totalTrades = wins + losses;
var winrate = totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) : ‘0.0’;
var rugRate = mints.length > 0 ? (rugs / mints.length * 100).toFixed(1) : ‘0.0’;

return {
totalTrades: totalTrades,
totalTokens: mints.length,
wins: wins,
losses: losses,
rugs: rugs,
winrate: winrate,
rugRate: rugRate,
pnlSol: totalPnlSol.toFixed(2),
recent7d: recent7d,
recent30d: recent30d,
lastActive: lastActive,
lastActiveDate: lastActive > 0 ? new Date(lastActive * 1000).toISOString().substring(0, 10) : ‘N/A’,
isActive: lastActive > weekAgo,
maxPerDay: maxPerDay,
totalTx: transactions.length,
};
}

function calculateScore(stats, balance) {
var winrate = parseFloat(stats.winrate);
var rugRate = parseFloat(stats.rugRate);
var trades = stats.totalTrades;
var recent = stats.recent7d;
var pnl = parseFloat(stats.pnlSol);
var score = 0;
score += Math.min((winrate / 100) * 35, 35);
score += Math.max((1 - rugRate / 100) * 20, 0);
score += Math.min((trades / 50) * 20, 20);
score += Math.min((recent / 30) * 10, 10);
score += Math.min((pnl / 100) * 10, 10);
score += Math.min((balance / 10000) * 5, 5);
return score.toFixed(1);
}

function filterWallet(stats, balance) {
if (balance < CONFIG.MIN_BALANCE_USD) return false;
if (parseFloat(stats.winrate) < CONFIG.MIN_WINRATE) return false;
if (parseFloat(stats.rugRate) >= CONFIG.MAX_RUG_RATE) return false;
if (stats.isActive === false) return false;
if (stats.totalTrades < CONFIG.MIN_TRADES) return false;
return true;
}

async function processWallet(address, alias) {
alias = alias || ‘’;

var balance = await getWalletBalance(address);
if (balance < CONFIG.MIN_BALANCE_USD) {
log(’  ’ + address.substring(0, 8) + ’ | $’ + balance.toFixed(0) + ’ | filtre balance’);
return null;
}

var transactions = await getAllTransactions(address);
if (!transactions || transactions.length === 0) {
log(’  ’ + address.substring(0, 8) + ’ | Aucune transaction’);
return null;
}

var stats = analyzeTransactions(transactions, address);
var score = calculateScore(stats, balance);
var passes = filterWallet(stats, balance);

log(’  ’ + address.substring(0, 8) + (alias ? ’ (’ + alias + ‘)’ : ‘’) +
’ | $’ + balance.toFixed(0) +
’ | ’ + transactions.length + ‘tx’ +
’ | WR: ’ + stats.winrate + ‘%’ +
’ | PnL: ’ + stats.pnlSol + ’ SOL’ +
’ | Rug: ’ + stats.rugRate + ‘%’ +
’ | Trades: ’ + stats.totalTrades +
’ | ’ + (passes ? ‘RETENU’ : ‘filtre’));

if (passes) {
return {
address: address,
alias: alias,
balance_usd: balance.toFixed(0),
totalTrades: stats.totalTrades,
totalTokens: stats.totalTokens,
wins: stats.wins,
losses: stats.losses,
rugs: stats.rugs,
winrate: stats.winrate,
rugRate: stats.rugRate,
pnlSol: stats.pnlSol,
recent7d: stats.recent7d,
recent30d: stats.recent30d,
maxPerDay: stats.maxPerDay,
totalTx: stats.totalTx,
lastActiveDate: stats.lastActiveDate,
score: score,
};
}
return null;
}

// Tokens trending DexScreener
async function getTrendingTokens() {
log(‘Recherche tokens trending…’);
try {
var res = await axios.get(‘https://api.dexscreener.com/token-profiles/latest/v1’, { timeout: 15000 });
var tokens = [];
if (res.data && Array.isArray(res.data)) {
for (var t = 0; t < res.data.length; t++) {
if (res.data[t].chainId === ‘solana’) tokens.push(res.data[t].tokenAddress);
}
}
log(‘DexScreener: ’ + tokens.length + ’ tokens Solana’);
return tokens.slice(0, 8);
} catch (err) {
log(‘DexScreener echoue’);
return [];
}
}

// Wallets actifs sur un token
async function getWalletsFromToken(tokenAddress) {
try {
var res = await axios.get(CONFIG.HELIUS_API + ‘/addresses/’ + tokenAddress + ‘/transactions’, {
params: { limit: 50, type: ‘SWAP’, ‘api-key’: CONFIG.HELIUS_API_KEY },
timeout: 15000,
});
var wallets = {};
var txs = res.data || [];
for (var t = 0; t < txs.length; t++) {
if (txs[t].feePayer) wallets[txs[t].feePayer] = true;
}
return Object.keys(wallets);
} catch (err) { return []; }
}

async function run() {
log(’========== Demarrage Wallet Tracker (Helius 1000tx) ==========’);
ensureDirs();
var allResults = [];
var processedAddresses = {};

try {
// Etape 1 : Wallets connus
log(’— Etape 1 : Wallets connus —’);
for (var k = 0; k < CONFIG.KNOWN_WALLETS.length; k++) {
var known = CONFIG.KNOWN_WALLETS[k];
processedAddresses[known.address] = true;
var result = await processWallet(known.address, known.alias);
if (result) allResults.push(result);
await sleep(CONFIG.DELAY);
}

```
// Etape 2 : Decouverte nouveaux wallets
log('--- Etape 2 : Decouverte nouveaux wallets ---');
var trendingTokens = await getTrendingTokens();
var newWallets = {};

for (var tok = 0; tok < trendingTokens.length; tok++) {
  log('Token ' + (tok + 1) + '/' + trendingTokens.length + ' : ' + trendingTokens[tok].substring(0, 8) + '...');
  var wallets = await getWalletsFromToken(trendingTokens[tok]);
  log('  -> ' + wallets.length + ' wallets');
  for (var w = 0; w < wallets.length; w++) {
    if (!processedAddresses[wallets[w]]) newWallets[wallets[w]] = true;
  }
  await sleep(CONFIG.DELAY);
}

var newWalletList = Object.keys(newWallets).slice(0, CONFIG.MAX_NEW_WALLETS);
log('Analyse de ' + newWalletList.length + ' nouveaux wallets...');

for (var n = 0; n < newWalletList.length; n++) {
  processedAddresses[newWalletList[n]] = true;
  var res = await processWallet(newWalletList[n], '');
  if (res) allResults.push(res);
  await sleep(CONFIG.DELAY);
}

allResults.sort(function(a, b) { return parseFloat(b.score) - parseFloat(a.score); });
log('=== ' + allResults.length + ' wallets retenus ===');

var report = generateReport(allResults);
console.log('\n' + report);
saveResults(allResults, report);
log('Cycle termine. Prochain dans 2h.');
```

} catch (err) {
log(’Erreur : ’ + err.message);
console.error(err);
}
}

function generateReport(wallets) {
var now = timestamp();
var r = ‘’;
r += ‘============================================================\n’;
r += ’  RAPPORT WALLET TRACKER (Helius 1000tx) - ’ + now + ‘\n’;
r += ‘============================================================\n\n’;
r += ‘RESUME\n’;
r += ‘–––––––––––––––––––––––\n’;
r += ’  Wallets retenus  : ’ + wallets.length + ‘\n’;
r += ’  Source           : Helius (1000tx) + DexScreener\n’;
r += ’  Filtres          : WR >= ’ + CONFIG.MIN_WINRATE + ’%, Rug < ’ + CONFIG.MAX_RUG_RATE + ‘%, Balance >= $’ + CONFIG.MIN_BALANCE_USD + ‘, >= ’ + CONFIG.MIN_TRADES + ’ trades\n\n’;

if (wallets.length === 0) {
r += ‘Aucun wallet ne passe les filtres ce cycle.\n\n’;
} else {
r += ‘TOP WALLETS\n’;
r += ‘–––––––––––––––––––––––\n\n’;
for (var i = 0; i < wallets.length; i++) {
var w = wallets[i];
var label = w.alias ? w.alias : w.address.substring(0, 8) + ‘…’ + w.address.slice(-4);
r += (i + 1) + ‘. ’ + label + ‘\n’;
r += ’   Score         : ’ + w.score + ‘/100\n’;
r += ’   Balance       : $’ + w.balance_usd + ‘\n’;
r += ’   Winrate       : ’ + w.winrate + ‘% (’ + w.wins + ‘W / ’ + w.losses + ‘L)\n’;
r += ’   PnL           : ’ + w.pnlSol + ’ SOL\n’;
r += ’   Rug Rate      : ’ + w.rugRate + ‘% (’ + w.rugs + ’ rugs)\n’;
r += ’   Trades        : ’ + w.totalTrades + ’ sur ’ + w.totalTokens + ’ tokens\n’;
r += ’   Transactions  : ’ + w.totalTx + ’ analysees\n’;
r += ’   Max/jour      : ’ + w.maxPerDay + ’ trades\n’;
r += ’   Actif 7j      : ’ + w.recent7d + ’ tx\n’;
r += ’   Dernier trade : ’ + w.lastActiveDate + ‘\n’;
r += ’   Adresse       : ’ + w.address + ‘\n\n’;
}

```
r += 'RECOMMANDES POUR LE BOT DE TRADING\n';
r += '----------------------------------------------\n';
var top = wallets.slice(0, 5);
for (var j = 0; j < top.length; j++) {
  r += '  ' + (j + 1) + '. ' + top[j].address + '  (score: ' + top[j].score + ')\n';
}
```

}

r += ‘\n============================================================\n’;
r += ’  Prochain rapport dans 2 heures\n’;
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

var TWO_HOURS = 2 * 60 * 60 * 1000;
log(‘Wallet Tracker (Helius 1000tx) demarre - cycle toutes les 2h’);
run();
setInterval(function() { run(); }, TWO_HOURS);