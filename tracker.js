const axios = require(‘axios’);
const fs = require(‘fs’);
const path = require(‘path’);

const CONFIG = {
HELIUS_API_KEY: ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_API: ‘https://api.helius.xyz/v0’,
BIRDEYE_API: ‘https://public-api.birdeye.so’,
MIN_WINRATE: 57,
MAX_RUG_RATE: 20,
MIN_TRADES: 10,
KNOWN_WALLETS: [
{ address: ‘65paNEG8m7mCVoASVF2KbRdU21aKXdASSB9G3NjCSQuE’, alias: ‘jijo’ },
{ address: ‘4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk’, alias: ‘PULL’ },
],
RAPPORT_DIR: path.join(__dirname, ‘rapports’),
LATEST_JSON: path.join(__dirname, ‘latest_wallets.json’),
HISTORIQUE_DIR: path.join(__dirname, ‘historique’),
DELAY: 800,
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

// Recupere les top traders depuis Birdeye
async function getTopTradersFromBirdeye() {
log(‘Recherche top traders sur Birdeye…’);
for (var i = 0; i < CONFIG.MAX_RETRIES; i++) {
try {
var res = await axios.get(CONFIG.BIRDEYE_API + ‘/trader/gainers-losers’, {
params: {
type: ‘today’,
sort_by: ‘PnL’,
sort_type: ‘desc’,
offset: 0,
limit: 50,
},
headers: {
‘X-Chain’: ‘solana’,
‘x-api-key’: ‘public’,
},
timeout: 20000,
});
if (res.data && res.data.data && res.data.data.items) {
log(‘Birdeye: ’ + res.data.data.items.length + ’ traders recuperes’);
return res.data.data.items;
}
return [];
} catch (err) {
log(’Birdeye tentative ’ + (i + 1) + ‘/’ + CONFIG.MAX_RETRIES + ’ echouee: ’ + err.message);
if (i < CONFIG.MAX_RETRIES - 1) await sleep(CONFIG.DELAY * (i + 2));
}
}
return [];
}

// Recupere les transactions d’un wallet via Helius
async function getWalletTransactions(walletAddress) {
for (var i = 0; i < CONFIG.MAX_RETRIES; i++) {
try {
var res = await axios.get(CONFIG.HELIUS_API + ‘/addresses/’ + walletAddress + ‘/transactions’, {
params: { limit: 100, type: ‘SWAP’, ‘api-key’: CONFIG.HELIUS_API_KEY },
timeout: 20000,
});
return res.data || [];
} catch (err) {
log(’Helius tentative ’ + (i + 1) + ‘/’ + CONFIG.MAX_RETRIES + ’ echouee pour ’ + walletAddress.substring(0, 8));
if (i < CONFIG.MAX_RETRIES - 1) await sleep(CONFIG.DELAY * (i + 2));
}
}
return [];
}

// Analyse les transactions d’un wallet et calcule ses stats
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

// Analyse un wallet et retourne ses stats si il passe les filtres
async function processWallet(address, alias) {
alias = alias || ‘’;
log(’Analyse de ’ + address.substring(0, 8) + ‘… (’ + (alias || ‘inconnu’) + ‘)’);

var transactions = await getWalletTransactions(address);

if (!transactions || transactions.length === 0) {
log(’  -> Aucune transaction SWAP trouvee’);
return null;
}

log(’  -> ’ + transactions.length + ’ transactions recuperees’);
var stats = analyzeWalletTrades(transactions, address);
stats.alias = alias;
var score = calculateScore(stats);
stats.score = score;
var passes = filterWallet(stats);

log(’  -> Winrate: ’ + stats.winrate + ’% | Rug: ’ + stats.rugRate + ’% | Trades: ’ + stats.totalTrades + ’ | Score: ’ + score + ’ | ’ + (passes ? ‘RETENU’ : ‘filtre’));

if (passes) return stats;
return null;
}

async function run() {
log(‘Demarrage Wallet Tracker v2…’);
ensureDirs();

var allResults = [];
var processedAddresses = {};

try {
// ETAPE 1 : Analyser les wallets connus (jijo, PULL)
log(’— Etape 1 : Wallets connus —’);
for (var k = 0; k < CONFIG.KNOWN_WALLETS.length; k++) {
var known = CONFIG.KNOWN_WALLETS[k];
processedAddresses[known.address] = true;
var result = await processWallet(known.address, known.alias);
if (result) allResults.push(result);
await sleep(CONFIG.DELAY);
}

```
// ETAPE 2 : Decouvrir de nouveaux wallets via Birdeye
log('--- Etape 2 : Decouverte via Birdeye ---');
var birdeyeTraders = await getTopTradersFromBirdeye();

if (birdeyeTraders.length > 0) {
  var count = 0;
  for (var b = 0; b < birdeyeTraders.length && count < 20; b++) {
    var trader = birdeyeTraders[b];
    var addr = trader.address || trader.wallet;
    if (!addr || processedAddresses[addr]) continue;
    processedAddresses[addr] = true;
    count++;
    var res = await processWallet(addr, '');
    if (res) allResults.push(res);
    await sleep(CONFIG.DELAY);
  }
} else {
  log('Birdeye indisponible - analyse des wallets connus uniquement');
}

// Tri par score
allResults.sort(function(a, b) {
  return parseFloat(b.score) - parseFloat(a.score);
});

log(allResults.length + ' wallets retenus au total');

// Rapport
var report = generateReport(allResults);
console.log('\n' + report);
saveResults(allResults, report);
log('Cycle termine.');
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
r += ’  RAPPORT WALLET TRACKER v2 - ’ + now + ‘\n’;
r += ‘============================================================\n\n’;
r += ‘RESUME\n’;
r += ‘–––––––––––––––––––––––\n’;
r += ’  Wallets retenus  : ’ + wallets.length + ‘\n’;
r += ’  Criteres         : Winrate >= ’ + CONFIG.MIN_WINRATE + ’%, Rug < ’ + CONFIG.MAX_RUG_RATE + ‘%, Actif 7j, >= ’ + CONFIG.MIN_TRADES + ’ trades\n\n’;

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
var top = wallets.slice(0, 3);
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
log(’Rapport sauvegarde : ’ + reportPath);
}

var SIX_HOURS = 6 * 60 * 60 * 1000;
log(‘Wallet Tracker v2 demarre - cycle toutes les 6h’);
run();
setInterval(function() { log(‘Nouveau cycle…’); run(); }, SIX_HOURS);