const axios = require(‘axios’);
const fs = require(‘fs’);
const path = require(‘path’);
const { execSync } = require(‘child_process’);

const CONFIG = {
HELIUS_API_KEY: ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_API: ‘https://api.helius.xyz/v0’,
SHYFT_API_KEY: ‘32-wu72_AVhpOAHd’,
SHYFT_API: ‘https://api.shyft.to/sol/v1’,
DEXSCREENER_API: ‘https://api.dexscreener.com’,
MIN_WINRATE: 55,
MAX_RUG_RATE: 20,
MIN_TRADES: 1,
MIN_BALANCE_USD: 1000,
SOL_PRICE_USD: 150,
KNOWN_WALLETS: [
{ address: ‘65paNEG8m7mCVoASVF2KbRdU21aKXdASSB9G3NjCSQuE’, alias: ‘jijo’ },
{ address: ‘4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk’, alias: ‘PULL’ },
],
MAX_NEW_WALLETS: 20,
RAPPORT_DIR: path.join(__dirname, ‘rapports’),
LATEST_JSON: path.join(__dirname, ‘latest_wallets.json’),
HISTORIQUE_DIR: path.join(__dirname, ‘historique’),
DELAY: 800,
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

// Balance SOL via Helius
async function getWalletBalance(walletAddress) {
try {
var res = await axios.post(‘https://mainnet.helius-rpc.com/?api-key=’ + CONFIG.HELIUS_API_KEY, {
jsonrpc: ‘2.0’, id: 1, method: ‘getBalance’, params: [walletAddress]
}, { timeout: 10000 });
var lamports = res.data.result ? res.data.result.value : 0;
return (lamports / 1e9) * CONFIG.SOL_PRICE_USD;
} catch (err) { return 0; }
}

// Transactions via Shyft
async function getWalletTransactionsShyft(walletAddress, limit) {
limit = limit || 100;
for (var i = 0; i < CONFIG.MAX_RETRIES; i++) {
try {
var res = await axios.get(CONFIG.SHYFT_API + ‘/transaction/history’, {
params: {
network: ‘mainnet-beta’,
account: walletAddress,
tx_num: limit,
enable_raw: false,
type: ‘SWAP’,
},
headers: { ‘x-api-key’: CONFIG.SHYFT_API_KEY },
timeout: 20000,
});
if (res.data && res.data.success && res.data.result) {
return res.data.result;
}
return [];
} catch (err) {
log(’  Shyft tentative ’ + (i + 1) + ‘/’ + CONFIG.MAX_RETRIES + ’ echouee’);
if (i < CONFIG.MAX_RETRIES - 1) await sleep(CONFIG.DELAY * (i + 2));
}
}
return [];
}

// Analyse les transactions Shyft
function analyzeShyftTransactions(transactions, walletAddress) {
var tokenPositions = {};
var now = Date.now() / 1000;
var weekAgo = now - (7 * 24 * 3600);
var monthAgo = now - (30 * 24 * 3600);
var lastActive = 0;
var recentTrades7d = 0;
var recentTrades30d = 0;
var dailyCounts = {};
var totalVolumeSol = 0;

for (var t = 0; t < transactions.length; t++) {
var tx = transactions[t];
if (!tx || !tx.timestamp) continue;

```
var txTime = new Date(tx.timestamp).getTime() / 1000;
if (txTime > lastActive) lastActive = txTime;
if (txTime > weekAgo) recentTrades7d++;
if (txTime > monthAgo) recentTrades30d++;

var day = tx.timestamp.substring(0, 10);
dailyCounts[day] = (dailyCounts[day] || 0) + 1;

var changes = tx.token_balance_changes || [];
for (var c = 0; c < changes.length; c++) {
  var change = changes[c];
  if (!change.mint || change.mint === 'So11111111111111111111111111111111111111112') continue;
  if (!tokenPositions[change.mint]) {
    tokenPositions[change.mint] = { bought: 0, sold: 0 };
  }
  if (change.owner === walletAddress && change.change_amount > 0) {
    tokenPositions[change.mint].bought += change.change_amount;
  }
  if (change.owner === walletAddress && change.change_amount < 0) {
    tokenPositions[change.mint].sold += Math.abs(change.change_amount);
  }
}
```

}

var maxPerDay = 0;
var days = Object.keys(dailyCounts);
for (var d = 0; d < days.length; d++) {
if (dailyCounts[days[d]] > maxPerDay) maxPerDay = dailyCounts[days[d]];
}

var wins = 0, losses = 0, rugCount = 0;
var mints = Object.keys(tokenPositions);

for (var m = 0; m < mints.length; m++) {
var pos = tokenPositions[mints[m]];
if (pos.bought > 0 && pos.sold === 0) {
rugCount++;
continue;
}
if (pos.bought > 0 && pos.sold > 0) {
var ratio = pos.sold / pos.bought;
if (ratio >= 1.3) wins++;
else if (ratio < 0.7) losses++;
}
}

var totalTokens = mints.length;
var totalTrades = wins + losses;
var winrate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
var rugRate = totalTokens > 0 ? (rugCount / totalTokens) * 100 : 0;

return {
totalTrades: totalTrades,
totalTokens: totalTokens,
wins: wins,
losses: losses,
rugCount: rugCount,
winrate: winrate.toFixed(1),
rugRate: rugRate.toFixed(1),
recentTrades7d: recentTrades7d,
recentTrades30d: recentTrades30d,
lastActive: lastActive,
lastActiveDate: lastActive > 0 ? new Date(lastActive * 1000).toISOString().substring(0, 10) : ‘N/A’,
isActiveThisWeek: lastActive > weekAgo,
maxTradesPerDay: maxPerDay,
};
}

function calculateScore(stats, balance) {
var winrate = parseFloat(stats.winrate);
var rugRate = parseFloat(stats.rugRate);
var trades = stats.totalTrades;
var recent = stats.recentTrades7d;
var score = 0;
score += Math.min((winrate / 100) * 40, 40);
score += Math.max((1 - rugRate / 100) * 25, 0);
score += Math.min((trades / 30) * 20, 20);
score += Math.min((recent / 20) * 10, 10);
score += Math.min((balance / 10000) * 5, 5);
return score.toFixed(1);
}

function filterWallet(stats, balance) {
if (balance < CONFIG.MIN_BALANCE_USD) return false;
if (parseFloat(stats.winrate) < CONFIG.MIN_WINRATE) return false;
if (parseFloat(stats.rugRate) >= CONFIG.MAX_RUG_RATE) return false;
if (stats.isActiveThisWeek === false) return false;
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

var transactions = await getWalletTransactionsShyft(address, 100);
if (!transactions || transactions.length === 0) {
log(’  ’ + address.substring(0, 8) + ’ | Aucune transaction’);
return null;
}

var stats = analyzeShyftTransactions(transactions, address);
var score = calculateScore(stats, balance);
var passes = filterWallet(stats, balance);

log(’  ’ + address.substring(0, 8) + (alias ? ’ (’ + alias + ‘)’ : ‘’) +
’ | $’ + balance.toFixed(0) +
’ | WR: ’ + stats.winrate + ‘%’ +
’ | Rug: ’ + stats.rugRate + ‘%’ +
’ | Trades: ’ + stats.totalTrades +
’ | Score: ’ + score +
’ | ’ + (passes ? ‘RETENU’ : ‘filtre’));

if (passes) {
return {
address: address,
alias: alias,
balance_usd: balance.toFixed(0),
totalTrades: stats.totalTrades,
wins: stats.wins,
losses: stats.losses,
rugCount: stats.rugCount,
winrate: stats.winrate,
rugRate: stats.rugRate,
recentTrades7d: stats.recentTrades7d,
recentTrades30d: stats.recentTrades30d,
maxTradesPerDay: stats.maxTradesPerDay,
lastActiveDate: stats.lastActiveDate,
score: score,
source: ‘Shyft’,
};
}
return null;
}

// Tokens trending DexScreener
async function getTrendingTokens() {
log(‘Recherche tokens trending sur DexScreener…’);
try {
var res = await axios.get(‘https://api.dexscreener.com/token-boosts/top/v1’, { timeout: 15000 });
var tokens = [];
if (res.data && Array.isArray(res.data)) {
for (var t = 0; t < res.data.length; t++) {
if (res.data[t].chainId === ‘solana’) tokens.push(res.data[t].tokenAddress);
}
}
log(‘DexScreener: ’ + tokens.length + ’ tokens trending’);
return tokens.slice(0, 10);
} catch (err) {
log(’DexScreener echoue: ’ + err.message);
return [];
}
}

// Top traders d’un token via DexScreener
async function getTopTradersFromToken(tokenAddress) {
try {
var res = await axios.get(‘https://api.dexscreener.com/latest/dex/tokens/’ + tokenAddress, {
timeout: 15000,
});
if (!res.data || !res.data.pairs || res.data.pairs.length === 0) return [];
var pair = res.data.pairs[0];
var pairAddress = pair.pairAddress;
var res2 = await axios.get(‘https://api.dexscreener.com/latest/dex/pairs/solana/’ + pairAddress + ‘/top-traders’, {
timeout: 15000,
});
if (!res2.data || !res2.data.traders) return [];
var traders = res2.data.traders;
var wallets = [];
for (var t = 0; t < traders.length; t++) {
if (traders[t].wallet) wallets.push(traders[t].wallet);
}
log(’  -> ’ + wallets.length + ’ top traders trouves sur DexScreener’);
return wallets;
} catch (err) {
return [];
}
}

// Wallets actifs sur un token via Helius
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
log(’========== Demarrage cycle Wallet Tracker (Shyft) ==========’);
ensureDirs();
var allResults = [];
var processedAddresses = {};

try {
// ETAPE 1 : Wallets connus
log(’— Etape 1 : Wallets connus —’);
for (var k = 0; k < CONFIG.KNOWN_WALLETS.length; k++) {
var known = CONFIG.KNOWN_WALLETS[k];
processedAddresses[known.address] = true;
var result = await processWallet(known.address, known.alias);
if (result) allResults.push(result);
await sleep(CONFIG.DELAY);
}

```
// ETAPE 2 : Decouverte nouveaux wallets
log('--- Etape 2 : Decouverte nouveaux wallets ---');
var trendingTokens = await getTrendingTokens();
var newWallets = {};

for (var tok = 0; tok < trendingTokens.length; tok++) {
  log('Token ' + (tok + 1) + '/' + trendingTokens.length + ' : ' + trendingTokens[tok].substring(0, 8) + '...');
  var topTraders = await getTopTradersFromToken(trendingTokens[tok]);
  for (var tt = 0; tt < topTraders.length; tt++) {
    if (!processedAddresses[topTraders[tt]]) newWallets[topTraders[tt]] = true;
  }
  var wallets = await getWalletsFromToken(trendingTokens[tok]);
  for (var w = 0; w < wallets.length; w++) {
    if (!processedAddresses[wallets[w]]) newWallets[wallets[w]] = true;
  }
  await sleep(CONFIG.DELAY);
}

var newWalletList = Object.keys(newWallets).slice(0, CONFIG.MAX_NEW_WALLETS);
log('Analyse de ' + newWalletList.length + ' nouveaux wallets via Shyft...');

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
r += ’  RAPPORT WALLET TRACKER (Shyft) - ’ + now + ‘\n’;
r += ‘============================================================\n\n’;
r += ‘RESUME\n’;
r += ‘–––––––––––––––––––––––\n’;
r += ’  Wallets retenus  : ’ + wallets.length + ‘\n’;
r += ’  Source           : Shyft API + Helius + DexScreener\n’;
r += ’  Filtres          : WR >= ’ + CONFIG.MIN_WINRATE + ’%, Rug < ’ + CONFIG.MAX_RUG_RATE + ‘%, Balance >= $’ + CONFIG.MIN_BALANCE_USD + ‘\n\n’;

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
r += ’   Winrate       : ’ + w.winrate + ‘%\n’;
r += ’   Rug Rate      : ’ + w.rugRate + ‘%\n’;
r += ’   Trades        : ’ + w.totalTrades + ’ (’ + w.wins + ‘W / ’ + w.losses + ‘L)\n’;
r += ’   Max/jour      : ’ + w.maxTradesPerDay + ’ trades\n’;
r += ’   Actif 7j      : ’ + w.recentTrades7d + ’ trades\n’;
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
log(“Wallet Tracker (Shyft) demarre - cycle toutes les 2h”);
run();
setInterval(function() { run(); }, TWO_HOURS);