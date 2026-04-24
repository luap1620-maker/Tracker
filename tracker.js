const axios = require(‘axios’);
const fs = require(‘fs’);
const path = require(‘path’);

const CONFIG = {
HELIUS_API_KEY: ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_API: ‘https://api.helius.xyz/v0’,
MIN_WINRATE: 57,
MAX_RUG_RATE: 20,
MIN_TRADES: 10,
SEED_WALLETS: [
‘acout8Z7tJFD55YqbZJuKwi2aVVrJgWbRBhMmbUC6oF’,
‘GCnpLG65NDNM5ALsXrNNTBNQMvBFAFrjSmfmxpYKs4Q’,
‘ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ’,
‘DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj’,
‘HxFLKUAmAMLz1jtT3hbvCMELwH5H9tpM2QugP8sKyfhW’,
‘5tzFkiKscXHK5ZXCGbOfB98ooDd7AFtML9qDKEk7FHQL’,
‘BrZGQkKPWVnJiw6fhqxH5cMjz8AHhFiLsRZUJFLGMhB5’,
‘CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq’,
],
RAPPORT_DIR: path.join(__dirname, ‘rapports’),
LATEST_JSON: path.join(__dirname, ‘latest_wallets.json’),
HISTORIQUE_DIR: path.join(__dirname, ‘historique’),
DELAY: 500,
MAX_RETRIES: 3,
};

const sleep = function(ms) { return new Promise(function(r) { return setTimeout(r, ms); }); };

function ensureDirs() {
[CONFIG.RAPPORT_DIR, CONFIG.HISTORIQUE_DIR].forEach(function(dir) {
if (fs.existsSync(dir) === false) {
fs.mkdirSync(dir, { recursive: true });
}
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

async function getWalletTransactions(walletAddress) {
for (var i = 0; i < CONFIG.MAX_RETRIES; i++) {
try {
var res = await axios.get(CONFIG.HELIUS_API + ‘/addresses/’ + walletAddress + ‘/transactions’, {
params: { limit: 200, type: ‘SWAP’, ‘api-key’: CONFIG.HELIUS_API_KEY },
timeout: 20000,
});
return res.data || [];
} catch (err) {
log(’Tentative ’ + (i + 1) + ‘/’ + CONFIG.MAX_RETRIES + ’ echouee pour ’ + walletAddress.substring(0, 8));
if (i < CONFIG.MAX_RETRIES - 1) {
await sleep(CONFIG.DELAY * (i + 2));
}
}
}
return [];
}

function analyzeWalletTrades(transactions, walletAddress) {
var tokenPositions = {};
var now = Date.now() / 1000;
var weekAgo = now - (7 * 24 * 3600);
var monthAgo = now - (30 * 24 * 3600);
var lastActive = 0;
var recentTrades7d = 0;
var recentTrades30d = 0;

for (var t = 0; t < transactions.length; t++) {
var tx = transactions[t];
if (!tx || !tx.timestamp) continue;
if (tx.timestamp > lastActive) lastActive = tx.timestamp;
if (tx.timestamp > weekAgo) recentTrades7d++;
if (tx.timestamp > monthAgo) recentTrades30d++;

```
var swaps = tx.tokenTransfers || [];
for (var s = 0; s < swaps.length; s++) {
  var transfer = swaps[s];
  var mint = transfer.mint;
  if (!mint || mint === 'So11111111111111111111111111111111111111112') continue;
  if (!tokenPositions[mint]) {
    tokenPositions[mint] = { bought: 0, sold: 0 };
  }
  if (transfer.toUserAccount === walletAddress) {
    tokenPositions[mint].bought += parseFloat(transfer.tokenAmount || 0);
  }
  if (transfer.fromUserAccount === walletAddress) {
    tokenPositions[mint].sold += parseFloat(transfer.tokenAmount || 0);
  }
}
```

}

var wins = 0;
var losses = 0;
var rugCount = 0;
var mints = Object.keys(tokenPositions);

for (var m = 0; m < mints.length; m++) {
var pos = tokenPositions[mints[m]];
if (pos.bought > 0 && pos.sold === 0) {
rugCount++;
continue;
}
if (pos.bought > 0 && pos.sold > 0) {
var ratio = pos.sold / pos.bought;
if (ratio >= 1.5) wins++;
else if (ratio < 0.5) losses++;
}
}

var totalTokens = mints.length;
var totalTrades = wins + losses;
var winrate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
var rugRate = totalTokens > 0 ? (rugCount / totalTokens) * 100 : 0;

return {
address: walletAddress,
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
};
}

function calculateScore(stats) {
var winrate = parseFloat(stats.winrate);
var rugRate = parseFloat(stats.rugRate);
var trades = stats.totalTrades;
var recent = stats.recentTrades7d;
var score = 0;
score += Math.min((winrate / 100) * 40, 40);
score += Math.max((1 - rugRate / 100) * 25, 0);
score += Math.min((trades / 50) * 20, 20);
score += Math.min((recent / 10) * 15, 15);
return score.toFixed(1);
}

function filterWallet(stats) {
if (parseFloat(stats.winrate) < CONFIG.MIN_WINRATE) return false;
if (parseFloat(stats.rugRate) >= CONFIG.MAX_RUG_RATE) return false;
if (stats.isActiveThisWeek === false) return false;
if (stats.totalTrades < CONFIG.MIN_TRADES) return false;
return true;
}

async function analyzeWallets() {
var results = [];
log(‘Analyse de ’ + CONFIG.SEED_WALLETS.length + ’ wallets via Helius…’);

for (var i = 0; i < CONFIG.SEED_WALLETS.length; i++) {
var wallet = CONFIG.SEED_WALLETS[i];
log(’[’ + (i + 1) + ‘/’ + CONFIG.SEED_WALLETS.length + ’] ’ + wallet.substring(0, 8) + ‘…’);

```
var transactions = await getWalletTransactions(wallet);

if (!transactions || transactions.length === 0) {
  log('Aucune transaction trouvee');
  await sleep(CONFIG.DELAY);
  continue;
}

log(transactions.length + ' transactions recuperees');
var stats = analyzeWalletTrades(transactions, wallet);
var score = calculateScore(stats);
var passes = filterWallet(stats);

log('Winrate: ' + stats.winrate + '% | Rug: ' + stats.rugRate + '% | Trades: ' + stats.totalTrades + ' | Score: ' + score + ' | ' + (passes ? 'RETENU' : 'filtre'));

if (passes) {
  stats.score = score;
  results.push(stats);
}

await sleep(CONFIG.DELAY);
```

}

results.sort(function(a, b) {
return parseFloat(b.score) - parseFloat(a.score);
});

return results;
}

function generateReport(wallets) {
var now = timestamp();
var r = ‘’;
r += ‘============================================================\n’;
r += ’  RAPPORT WALLET TRACKER v2 - ’ + now + ‘\n’;
r += ‘============================================================\n\n’;
r += ‘RESUME\n’;
r += ‘–––––––––––––––––––––––\n’;
r += ’  Wallets analyses : ’ + CONFIG.SEED_WALLETS.length + ‘\n’;
r += ’  Wallets retenus  : ’ + wallets.length + ‘\n\n’;

if (wallets.length === 0) {
r += ‘Aucun wallet ne passe les filtres ce cycle.\n\n’;
} else {
r += ‘TOP WALLETS\n’;
r += ‘–––––––––––––––––––––––\n\n’;
for (var i = 0; i < wallets.length; i++) {
var w = wallets[i];
r += (i + 1) + ‘. ’ + w.address.substring(0, 8) + ‘…’ + w.address.slice(-4) + ‘\n’;
r += ’   Score         : ’ + w.score + ‘/100\n’;
r += ’   Winrate       : ’ + w.winrate + ‘%\n’;
r += ’   Rug Rate      : ’ + w.rugRate + ‘%\n’;
r += ’   Trades        : ’ + w.totalTrades + ’ (’ + w.wins + ‘W / ’ + w.losses + ‘L)\n’;
r += ’   Actif 7j      : ’ + w.recentTrades7d + ’ trades\n’;
r += ’   Actif 30j     : ’ + w.recentTrades30d + ’ trades\n’;
r += ’   Dernier trade : ’ + w.lastActiveDate + ‘\n’;
r += ’   Adresse full  : ’ + w.address + ‘\n\n’;
}
r += ‘RECOMMANDES POUR LE BOT DE TRADING\n’;
r += ‘–––––––––––––––––––––––\n’;
var top = wallets.slice(0, 3);
for (var j = 0; j < top.length; j++) {
r += ’  ’ + (j + 1) + ’. ’ + top[j].address + ’  (score: ’ + top[j].score + ‘)\n’;
}
}

r += ‘\n============================================================\n’;
r += ’  Prochain rapport dans 6 heures\n’;
r += ‘============================================================\n’;
return r;
}

function saveResults(wallets, report) {
var tag = dateTag();
var reportPath = path.join(CONFIG.RAPPORT_DIR, ‘rapport_’ + tag + ‘.txt’);
fs.writeFileSync(reportPath, report, ‘utf8’);
var jsonPath = path.join(CONFIG.HISTORIQUE_DIR, ‘wallets_’ + tag + ‘.json’);
fs.writeFileSync(jsonPath, JSON.stringify(wallets, null, 2), ‘utf8’);
fs.writeFileSync(CONFIG.LATEST_JSON, JSON.stringify({ updated_at: timestamp(), count: wallets.length, wallets: wallets }, null, 2), ‘utf8’);
log(’Rapport sauvegarde : ’ + reportPath);
log(’JSON sauvegarde    : ’ + jsonPath);
}

async function run() {
log(‘Demarrage Wallet Tracker v2 Helius…’);
ensureDirs();
try {
var wallets = await analyzeWallets();
log(wallets.length + ’ wallets retenus’);
var report = generateReport(wallets);
console.log(report);
saveResults(wallets, report);
log(‘Cycle termine.’);
} catch (err) {
log(’Erreur : ’ + err.message);
console.error(err);
}
}

var SIX_HOURS = 6 * 60 * 60 * 1000;
log(‘Wallet Tracker v2 demarre - cycle toutes les 6h’);
run();
setInterval(function() { log(‘Nouveau cycle…’); run(); }, SIX_HOURS);