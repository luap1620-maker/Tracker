const axios = require(‘axios’);
const fs = require(‘fs’);
const path = require(‘path’);

const CONFIG = {
HELIUS_API_KEY: ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_API: ‘https://api.helius.xyz/v0’,
DEXSCREENER_API: ‘https://api.dexscreener.com/latest/dex’,
MIN_WINRATE: 57,
MAX_RUG_RATE: 20,
MIN_TRADES: 3,
KNOWN_WALLETS: [
{ address: ‘65paNEG8m7mCVoASVF2KbRdU21aKXdASSB9G3NjCSQuE’, alias: ‘jijo’ },
{ address: ‘4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk’, alias: ‘PULL’ },
],
MAX_NEW_WALLETS: 20,
RAPPORT_DIR: path.join(__dirname, ‘rapports’),
LATEST_JSON: path.join(__dirname, ‘latest_wallets.json’),
HISTORIQUE_DIR: path.join(__dirname, ‘historique’),
DELAY: 600,
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

// Etape 1 : Recupere les tokens trending sur Solana via DexScreener
async function getTrendingTokens() {
log(‘Recherche tokens trending sur DexScreener…’);
for (var i = 0; i < CONFIG.MAX_RETRIES; i++) {
try {
var res = await axios.get(‘https://api.dexscreener.com/token-boosts/top/v1’, {
timeout: 15000,
});
var tokens = [];
if (res.data && Array.isArray(res.data)) {
for (var t = 0; t < res.data.length; t++) {
if (res.data[t].chainId === ‘solana’) {
tokens.push(res.data[t].tokenAddress);
}
}
}
log(‘DexScreener: ’ + tokens.length + ’ tokens trending Solana trouves’);
return tokens.slice(0, 10);
} catch (err) {
log(’DexScreener tentative ’ + (i + 1) + ’ echouee: ’ + err.message);
if (i < CONFIG.MAX_RETRIES - 1) await sleep(CONFIG.DELAY * (i + 2));
}
}
return [];
}

// Etape 2 : Pour chaque token, recupere les wallets qui ont trade dessus
async function getWalletsFromToken(tokenAddress) {
for (var i = 0; i < CONFIG.MAX_RETRIES; i++) {
try {
var res = await axios.get(CONFIG.HELIUS_API + ‘/addresses/’ + tokenAddress + ‘/transactions’, {
params: { limit: 50, type: ‘SWAP’, ‘api-key’: CONFIG.HELIUS_API_KEY },
timeout: 15000,
});
var wallets = {};
var txs = res.data || [];
for (var t = 0; t < txs.length; t++) {
var feePayer = txs[t].feePayer;
if (feePayer) wallets[feePayer] = true;
}
return Object.keys(wallets);
} catch (err) {
if (i < CONFIG.MAX_RETRIES - 1) await sleep(CONFIG.DELAY);
}
}
return [];
}

// Etape 3 : Recupere les transactions SWAP d’un wallet
async function getWalletTransactions(walletAddress) {
for (var i = 0; i < CONFIG.MAX_RETRIES; i++) {
try {
var res = await axios.get(CONFIG.HELIUS_API + ‘/addresses/’ + walletAddress + ‘/transactions’, {
params: { limit: 100, type: ‘SWAP’, ‘api-key’: CONFIG.HELIUS_API_KEY },
timeout: 20000,
});
return res.data || [];
} catch (err) {
if (i < CONFIG.MAX_RETRIES - 1) await sleep(CONFIG.DELAY * (i + 2));
}
}
return [];
}

// Etape 4 : Analyse les transactions et calcule les stats
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
score += Math.min((recent / 20) * 15, 15);
return score.toFixed(1);
}

function filterWallet(stats) {
if (parseFloat(stats.winrate) < CONFIG.MIN_WINRATE) return false;
if (parseFloat(stats.rugRate) >= CONFIG.MAX_RUG_RATE) return false;
if (stats.isActiveThisWeek === false) return false;
if (stats.totalTrades < CONFIG.MIN_TRADES) return false;
return true;
}

async function processWallet(address, alias) {
alias = alias || ‘’;
var transactions = await getWalletTransactions(address);
if (!transactions || transactions.length === 0) return null;

var stats = analyzeWalletTrades(transactions, address);
stats.alias = alias;
stats.score = calculateScore(stats);

var passes = filterWallet(stats);
log(’  ’ + address.substring(0, 8) + ’ | WR: ’ + stats.winrate + ’% | Rug: ’ + stats.rugRate + ’% | Trades: ’ + stats.totalTrades + ’ | ’ + (passes ? ‘RETENU’ : ‘filtre’));

if (passes) return stats;
return null;
}

async function run() {
log(’========== Demarrage cycle Wallet Tracker ==========’);
ensureDirs();
var allResults = [];
var processedAddresses = {};

try {
// ETAPE 1 : Wallets connus (jijo, PULL)
log(’— Etape 1 : Analyse wallets connus —’);
for (var k = 0; k < CONFIG.KNOWN_WALLETS.length; k++) {
var known = CONFIG.KNOWN_WALLETS[k];
processedAddresses[known.address] = true;
log(‘Analyse de ’ + known.alias + ’ (’ + known.address.substring(0, 8) + ‘…)’);
var result = await processWallet(known.address, known.alias);
if (result) allResults.push(result);
await sleep(CONFIG.DELAY);
}

```
// ETAPE 2 : Decouverte via tokens trending DexScreener
log('--- Etape 2 : Decouverte via tokens trending ---');
var trendingTokens = await getTrendingTokens();

if (trendingTokens.length > 0) {
  var newWallets = {};

  for (var tok = 0; tok < trendingTokens.length; tok++) {
    log('Token trending ' + (tok + 1) + '/' + trendingTokens.length + ' : ' + trendingTokens[tok].substring(0, 8) + '...');
    var wallets = await getWalletsFromToken(trendingTokens[tok]);
    log('  -> ' + wallets.length + ' wallets trouves sur ce token');
    for (var w = 0; w < wallets.length; w++) {
      if (!processedAddresses[wallets[w]]) {
        newWallets[wallets[w]] = true;
      }
    }
    await sleep(CONFIG.DELAY);
  }

  var newWalletList = Object.keys(newWallets).slice(0, CONFIG.MAX_NEW_WALLETS);
  log('Analyse de ' + newWalletList.length + ' nouveaux wallets decouverts...');

  for (var n = 0; n < newWalletList.length; n++) {
    processedAddresses[newWalletList[n]] = true;
    var res = await processWallet(newWalletList[n], '');
    if (res) allResults.push(res);
    await sleep(CONFIG.DELAY);
  }

} else {
  log('DexScreener indisponible - wallets connus uniquement');
}

// Tri par score
allResults.sort(function(a, b) {
  return parseFloat(b.score) - parseFloat(a.score);
});

log('=== ' + allResults.length + ' wallets retenus ===');

var report = generateReport(allResults);
console.log('\n' + report);
saveResults(allResults, report);
log('Cycle termine. Prochain dans 6h.');
```

} catch (err) {
log(’Erreur inattendue : ’ + err.message);
console.error(err);
}
}

function generateReport(wallets) {
var now = timestamp();
var r = ‘’;
r += ‘============================================================\n’;
r += ’  RAPPORT WALLET TRACKER - ’ + now + ‘\n’;
r += ‘============================================================\n\n’;
r += ‘RESUME\n’;
r += ‘–––––––––––––––––––––––\n’;
r += ’  Wallets retenus  : ’ + wallets.length + ‘\n’;
r += ’  Criteres         : Winrate >= ’ + CONFIG.MIN_WINRATE + ’%, Rug < ’ + CONFIG.MAX_RUG_RATE + ‘%, Actif 7j\n\n’;

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
r += ’   Winrate       : ’ + w.winrate + ‘%\n’;
r += ’   Rug Rate      : ’ + w.rugRate + ‘%\n’;
r += ’   Trades        : ’ + w.totalTrades + ’ (’ + w.wins + ‘W / ’ + w.losses + ‘L)\n’;
r += ’   Actif 7j      : ’ + w.recentTrades7d + ’ trades\n’;
r += ’   Actif 30j     : ’ + w.recentTrades30d + ’ trades\n’;
r += ’   Dernier trade : ’ + w.lastActiveDate + ‘\n’;
r += ’   Adresse full  : ’ + w.address + ‘\n\n’;
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
fs.writeFileSync(CONFIG.LATEST_JSON, JSON.stringify({
updated_at: timestamp(),
count: wallets.length,
wallets: wallets,
}, null, 2), ‘utf8’);
log(’Rapport : ’ + reportPath);
}

var SIX_HOURS = 6 * 60 * 60 * 1000;
log(‘Wallet Tracker demarre - cycle toutes les 6h’);
run();
setInterval(function() { run(); }, SIX_HOURS);