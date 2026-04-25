const axios = require(‘axios’);
const fs = require(‘fs’);
const path = require(‘path’);
const http = require(‘http’);
const { chromium } = require(‘playwright’);

const CONFIG = {
HELIUS_API_KEY: ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_API: ‘https://api.helius.xyz/v0’,
HELIUS_RPC: ‘https://mainnet.helius-rpc.com/?api-key=9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
UWUU_API: ‘https://uwuu.ai/api/kols’,
UWUU_TRADER: ‘https://uwuu.ai/trader/’,
SOL_PRICE: 150,
MIN_WINRATE: 50,
MAX_RUG_RATE: 35,
MIN_TRADES: 3,
MIN_BALANCE_USD: 500,
MIN_DAYS_ACTIVE: 30,
TOP_WALLETS: 100,
HTTP_PORT: 3001,
RAPPORT_DIR: path.join(__dirname, ‘rapports’),
LATEST_JSON: path.join(__dirname, ‘latest_wallets.json’),
LATEST_RAPPORT: path.join(__dirname, ‘rapports’, ‘latest.txt’),
HISTORIQUE_DIR: path.join(__dirname, ‘historique’),
DELAY: 1000,
};

const sleep = function(ms) { return new Promise(function(r) { return setTimeout(r, ms); }); };

function ensureDirs() {
[CONFIG.RAPPORT_DIR, CONFIG.HISTORIQUE_DIR].forEach(function(dir) {
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

// Serveur HTTP
function startHttpServer() {
var server = http.createServer(function(req, res) {
var filePath = CONFIG.LATEST_RAPPORT;
if (req.url === ‘/json’) filePath = CONFIG.LATEST_JSON;
if (fs.existsSync(filePath)) {
res.writeHead(200, { ‘Content-Type’: ‘text/plain; charset=utf-8’ });
res.end(fs.readFileSync(filePath, ‘utf8’));
} else {
res.writeHead(404);
res.end(‘Aucun rapport disponible’);
}
});
server.listen(CONFIG.HTTP_PORT, function() {
log(‘Rapport accessible sur http://178.104.159.93:’ + CONFIG.HTTP_PORT);
});
}

// Positions ouvertes via Helius
async function getOpenPositions(address) {
try {
var res = await axios.get(CONFIG.HELIUS_API + ‘/addresses/’ + address + ‘/balances’, {
params: { ‘api-key’: CONFIG.HELIUS_API_KEY },
timeout: 10000,
});
var tokens = (res.data.tokens || []).filter(function(t) { return t.amount > 0; });
return tokens.length;
} catch (err) { return 0; }
}

// Balance via Helius
async function getWalletBalance(address) {
try {
var res = await axios.post(CONFIG.HELIUS_RPC, {
jsonrpc: ‘2.0’, id: 1, method: ‘getBalance’, params: [address]
}, { timeout: 10000 });
var lamports = res.data.result ? res.data.result.value : 0;
return (lamports / 1e9) * CONFIG.SOL_PRICE;
} catch (err) { return 0; }
}

// Transactions Helius (3 mois)
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
var threeMonthsAgo = Date.now() / 1000 - (30 * 24 * 3600);
var stop = false;
while (!stop) {
var txs = await getTransactionsPage(address, before);
if (!txs || txs.length === 0) break;
for (var i = 0; i < txs.length; i++) {
if (txs[i].timestamp && txs[i].timestamp < threeMonthsAgo) { stop = true; break; }
allTxs.push(txs[i]);
}
if (txs.length < 100) break;
before = txs[txs.length - 1].signature;
await sleep(200);
}
return allTxs;
}

function analyzeHelius(txs, address) {
var tokenTrades = {};
var now = Date.now() / 1000;
var twoWeeksAgo = now - (14 * 24 * 3600);
var firstActive = 0;
var lastActive = 0;
var recent7d = 0;
var dailyCounts = {};

txs.forEach(function(tx) {
if (!tx || !tx.timestamp) return;
if (tx.timestamp > lastActive) lastActive = tx.timestamp;
if (firstActive === 0 || tx.timestamp < firstActive) firstActive = tx.timestamp;
if (tx.timestamp > twoWeeksAgo) recent7d++;
var day = new Date(tx.timestamp * 1000).toISOString().substring(0, 10);
dailyCounts[day] = (dailyCounts[day] || 0) + 1;

```
var solChange = 0;
(tx.nativeTransfers || []).forEach(function(nt) {
  if (nt.fromUserAccount === address) solChange -= nt.amount / 1e9;
  if (nt.toUserAccount === address) solChange += nt.amount / 1e9;
});

var mintReceived = null;
var mintSent = null;
(tx.tokenTransfers || []).forEach(function(tf) {
  if (!tf.mint || tf.mint === 'So11111111111111111111111111111111111111112') return;
  if (tf.toUserAccount === address) mintReceived = tf.mint;
  if (tf.fromUserAccount === address) mintSent = tf.mint;
});

var mint = mintReceived || mintSent;
if (!mint) return;
if (!tokenTrades[mint]) tokenTrades[mint] = { solIn: 0, solOut: 0 };
if (mintReceived && !mintSent) tokenTrades[mint].solIn += Math.abs(solChange);
else if (mintSent && !mintReceived) tokenTrades[mint].solOut += Math.abs(solChange);
```

});

var wins = 0, losses = 0, rugs = 0, totalPnl = 0;
var mints = Object.keys(tokenTrades);
mints.forEach(function(m) {
var tr = tokenTrades[m];
if (tr.solIn === 0) return;
if (tr.solOut === 0) { rugs++; return; }
var roi = tr.solOut / tr.solIn;
totalPnl += (tr.solOut - tr.solIn);
if (roi >= 1.2) wins++;
else if (roi < 0.8) losses++;
});

var maxPerDay = 0;
Object.keys(dailyCounts).forEach(function(d) {
if (dailyCounts[d] > maxPerDay) maxPerDay = dailyCounts[d];
});

var total = wins + losses;
return {
wins: wins, losses: losses, rugs: rugs,
winrate: total > 0 ? (wins / total * 100).toFixed(1) : ‘0.0’,
rugRate: mints.length > 0 ? (rugs / mints.length * 100).toFixed(1) : ‘0.0’,
pnlSol: totalPnl.toFixed(2),
pnlUsd: (totalPnl * CONFIG.SOL_PRICE).toFixed(0),
totalTrades: total,
totalTokens: mints.length,
recent7d: recent7d,
maxPerDay: maxPerDay,
daysActive: firstActive > 0 ? Math.floor((lastActive - firstActive) / 86400) : 0,
lastActiveDate: lastActive > 0 ? new Date(lastActive * 1000).toISOString().substring(0, 10) : ‘N/A’,
isActive: lastActive > twoWeeksAgo,
totalTx: txs.length,
};
}

// Scrape profil uwuu.ai avec Playwright
async function scrapeUwuuProfile(page, address) {
try {
await page.goto(CONFIG.UWUU_TRADER + address, { timeout: 30000 });
await page.waitForTimeout(6000);
var text = await page.innerText(‘body’);

```
var extract = function(pattern) {
  var m = text.match(pattern);
  return m ? m[1].trim() : 'N/A';
};

var result = {
  winrate30d: extract(/WIN RATE\s*([\d.]+%)/),
  pnl30d: extract(/30D PNL\s*\$([\d,.-]+)/),
  roi30d: extract(/30D ROI\s*([+-]?[\d.]+%)/),
  trades30d: extract(/TRADES\s*(\d+)/),
  tokensTraded: extract(/TOKENS TRADED\s*(\d+)/),
  avgHolding: extract(/AVG HOLDING\s*([\w]+)/),
  totalBought: extract(/TOTAL BOUGHT\s*\$([\d,.-]+)/),
  totalSold: extract(/TOTAL SOLD\s*\$([\d,.-]+)/),
  bestTrade: extract(/BEST TRADE[\s\S]*?\$([\d,.-]+)/),
  worstTrade: extract(/WORST TRADE[\s\S]*?(-?\$[\d,.-]+)/),
};

log('  uwuu scrape: WR ' + result.winrate30d + ' | PnL $' + result.pnl30d + ' | Trades ' + result.trades30d);
return result;
```

} catch (err) {
log(’  Playwright erreur: ’ + err.message);
return null;
}
}

// Top wallets uwuu.ai
async function getUwuuWallets() {
try {
var weekly = await axios.get(CONFIG.UWUU_API + ‘?timeframe=weekly’, { timeout: 15000 });
var monthly = await axios.get(CONFIG.UWUU_API + ‘?timeframe=monthly’, { timeout: 15000 });
var all = await axios.get(CONFIG.UWUU_API + ‘?timeframe=all’, { timeout: 15000 });
var seen = {};
var result = [];
(weekly.data.kols || []).concat(monthly.data.kols || []).concat(all.data.kols || []).forEach(function(k) {
if (!seen[k.wallet]) { seen[k.wallet] = true; result.push(k); }
});
log(‘uwuu.ai: ’ + result.length + ’ wallets uniques (weekly + monthly + all)’);
return result.slice(0, CONFIG.TOP_WALLETS);
} catch (err) {
log(’uwuu.ai echoue: ’ + err.message);
return [];
}
}

function calcScore(helius, uwuu, kol, balance) {
var s = 0;

// Winrate uwuu 30j (20pts)
var uwuuWr = uwuu ? parseFloat((uwuu.winrate30d || ‘0’).replace(’%’, ‘’)) : 0;
s += Math.min((uwuuWr / 100) * 20, 20);

// Winrate Helius (15pts)
var heliusWr = parseFloat(helius.winrate);
s += Math.min((heliusWr / 100) * 15, 15);

// Coherence entre les deux sources (15pts) - penalise si trop de divergence
var wrDiff = Math.abs(uwuuWr - heliusWr);
var coherence = Math.max(0, 1 - wrDiff / 100);
s += coherence * 15;

// ROI monthly uwuu (15pts)
var roiMonthly = kol.roi_monthly || 0;
s += Math.min((roiMonthly / 200) * 15, 15);

// PnL Helius positif (10pts) - bonus si PnL realise positif
var pnlSol = parseFloat(helius.pnlSol);
if (pnlSol > 0) s += Math.min((pnlSol / 50) * 10, 10);

// Rug rate Helius (15pts)
s += Math.max((1 - parseFloat(helius.rugRate) / 100) * 15, 0);

// Activite recente (5pts)
s += Math.min((helius.recent7d / 30) * 5, 5);

// Balance (5pts)
s += Math.min((balance / 10000) * 5, 5);

return s.toFixed(1);
}

function passes(helius, uwuuProfile, kol, balance) {
if (balance < CONFIG.MIN_BALANCE_USD) return false;
if (!helius.isActive) return false;

// Winrate uwuu 30j >= 50%
var wr = uwuuProfile ? parseFloat((uwuuProfile.winrate30d || ‘0’).replace(’%’, ‘’)) : 0;
if (wr < CONFIG.MIN_WINRATE) return false;

// PnL monthly positif
if ((kol.pnl_monthly || 0) <= 0) return false;

// Rug rate Helius < 25%
if (parseFloat(helius.rugRate) >= CONFIG.MAX_RUG_RATE) return false;

// Trades all time > 50 (wallet experimente)
if ((kol.trades || 0) < 50) return false;

return true;
}

async function run() {
log(’========== Demarrage Wallet Tracker ==========’);
ensureDirs();
var results = [];

var uwuuWallets = await getUwuuWallets();
if (uwuuWallets.length === 0) { log(‘Aucun wallet - arret’); return; }

log(‘Lancement Playwright…’);
var browser = await chromium.launch({ headless: true });
var page = await browser.newPage();

try {
for (var i = 0; i < uwuuWallets.length; i++) {
var kol = uwuuWallets[i];
var address = kol.wallet;
var alias = kol.name || address.substring(0, 8);

```
  log('[' + (i+1) + '/' + uwuuWallets.length + '] ' + alias + ' (' + address.substring(0, 8) + ')');

  // Lancer Helius et Playwright en parallele
  var results2 = await Promise.all([
    Promise.all([getWalletBalance(address), getAllTransactions(address), getOpenPositions(address)]),
    scrapeUwuuProfile(page, address)
  ]);

  var balance = results2[0][0];
  var txs = results2[0][1];
  var openPositions = results2[0][2];
  var helius = analyzeHelius(txs, address);
  var uwuuProfile = results2[1];

  log('  Helius : WR ' + helius.winrate + '% | PnL ' + helius.pnlSol + ' SOL ($' + helius.pnlUsd + ') | Rug ' + helius.rugRate + '% | ' + helius.totalTrades + ' trades | ' + helius.daysActive + 'j | ' + openPositions + ' positions ouvertes');
  if (uwuuProfile) {
    log('  uwuu   : WR ' + uwuuProfile.winrate30d + ' | PnL ' + uwuuProfile.pnl30d + ' | ROI ' + uwuuProfile.roi30d + ' | ' + uwuuProfile.trades30d + ' trades');
  }

  var sc = calcScore(helius, uwuuProfile, kol, balance);
  var pass = passes(helius, uwuuProfile, kol, balance);
  log('  Score: ' + sc + ' | ' + (pass ? 'RETENU' : 'filtre'));

  if (pass) {
    results.push({
      address: address,
      alias: alias,
      balance_usd: balance.toFixed(0),
      score: sc,
      helius: {
        winrate: helius.winrate,
        pnlSol: helius.pnlSol,
        pnlUsd: helius.pnlUsd,
        rugRate: helius.rugRate,
        totalTrades: helius.totalTrades,
        wins: helius.wins,
        losses: helius.losses,
        rugs: helius.rugs,
        totalTokens: helius.totalTokens,
        openPositions: openPositions,
        recent7d: helius.recent7d,
        maxPerDay: helius.maxPerDay,
        daysActive: helius.daysActive,
        lastActiveDate: helius.lastActiveDate,
        totalTx: helius.totalTx,
      },
      uwuu_api: {
        pnl_weekly: kol.pnl_weekly,
        roi_weekly: kol.roi_weekly,
        trades_weekly: kol.trades_weekly,
        pnl_monthly: kol.pnl_monthly,
        roi_monthly: kol.roi_monthly,
        trades_monthly: kol.trades_monthly,
        pnl_all: kol.pnl,
        roi_all: kol.roi,
        trades_all: kol.trades,
      },
      uwuu_profile: uwuuProfile || {},
    });
  }
  await sleep(CONFIG.DELAY);
}
```

} catch (err) {
log(’Erreur cycle : ’ + err.message);
}

await browser.close();

results.sort(function(a, b) { return parseFloat(b.score) - parseFloat(a.score); });
log(’=== ’ + results.length + ’ wallets retenus sur ’ + uwuuWallets.length + ’ analyses ===’);

var report = generateReport(results, uwuuWallets.length);
console.log(’\n’ + report);
saveResults(results, report);
log(‘Cycle termine. Prochain dans 1h.’);
}

function generateReport(wallets, total) {
var now = timestamp();
var r = ‘’;
r += ‘============================================================\n’;
r += ’  RAPPORT WALLET TRACKER - ’ + now + ‘\n’;
r += ‘============================================================\n\n’;
r += ‘RESUME\n’;
r += ‘–––––––––––––––––––––––\n’;
r += ’  Wallets analyses  : ’ + total + ‘\n’;
r += ’  Wallets retenus   : ’ + wallets.length + ‘\n’;
r += ’  Filtres           : WR >= ’ + CONFIG.MIN_WINRATE + ’%, Rug < ’ + CONFIG.MAX_RUG_RATE + ‘%, $’ + CONFIG.MIN_BALANCE_USD + ’, ’ + CONFIG.MIN_TRADES + ’ trades, ’ + CONFIG.MIN_DAYS_ACTIVE + ‘j\n\n’;

if (wallets.length === 0) {
r += ‘Aucun wallet ne passe les filtres.\n\n’;
} else {
r += ‘TOP WALLETS\n’;
r += ‘–––––––––––––––––––––––\n\n’;
for (var i = 0; i < wallets.length; i++) {
var w = wallets[i];
var h = w.helius;
var ua = w.uwuu_api;
var up = w.uwuu_profile;
r += (i+1) + ‘. ’ + w.alias + ‘\n’;
r += ’   Score            : ’ + w.score + ‘/100\n’;
r += ’   Balance          : $’ + w.balance_usd + ‘\n’;
r += ’   — HELIUS (PnL realise - 30 jours) —\n’;
r += ’   Winrate          : ’ + h.winrate + ‘% (’ + h.wins + ‘W / ’ + h.losses + ‘L)\n’;
r += ’   PnL              : ’ + h.pnlSol + ’ SOL ($’ + h.pnlUsd + ‘)\n’;
r += ’   Rug Rate         : ’ + h.rugRate + ‘% (’ + h.rugs + ’ rugs / ’ + h.totalTokens + ’ tokens)\n’;
r += ’   Positions ouv.   : ’ + h.openPositions + ’ tokens detenus\n’;
r += ’   Trades fermes    : ’ + h.totalTrades + ‘\n’;
r += ’   Tx analysees     : ’ + h.totalTx + ‘\n’;
r += ’   Anciennete       : ’ + h.daysActive + ’ jours\n’;
r += ’   Actif 7j         : ’ + h.recent7d + ’ tx\n’;
r += ’   Max/jour         : ’ + h.maxPerDay + ‘\n’;
r += ’   Dernier trade    : ’ + h.lastActiveDate + ‘\n’;
r += ’   — UWUU.AI —\n’;
r += ’   Winrate 30j      : ’ + (up.winrate30d || ‘N/A’) + ‘\n’;
r += ’   PnL 30j          : $’ + (up.pnl30d || ‘N/A’) + ’ | ROI ’ + (up.roi30d || ‘N/A’) + ‘\n’;
r += ’   Trades           : ’ + ua.trades_weekly + ’ (7j) / ’ + ua.trades_monthly + ’ (30j) / ’ + ua.trades_all + ’ (all)\n’;
r += ’   PnL weekly       : $’ + ua.pnl_weekly + ’ | ROI ’ + ua.roi_weekly + ‘%\n’;
r += ’   PnL monthly      : $’ + ua.pnl_monthly + ’ | ROI ’ + ua.roi_monthly + ‘%\n’;
r += ’   PnL all time     : $’ + ua.pnl_all + ’ | ROI ’ + ua.roi_all + ‘%\n’;
r += ’   Tokens trades    : ’ + (up.tokensTraded || ‘N/A’) + ‘\n’;
r += ’   Avg Holding      : ’ + (up.avgHolding || ‘N/A’) + ‘\n’;
r += ’   Total Bought     : $’ + (up.totalBought || ‘N/A’) + ‘\n’;
r += ’   Total Sold       : $’ + (up.totalSold || ‘N/A’) + ‘\n’;
r += ’   Best Trade       : $’ + (up.bestTrade || ‘N/A’) + ‘\n’;
r += ’   Worst Trade      : ’ + (up.worstTrade || ‘N/A’) + ‘\n’;
r += ’   Adresse          : ’ + w.address + ‘\n\n’;
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
r += ’  Rapport : http://178.104.159.93:’ + CONFIG.HTTP_PORT + ‘\n’;
r += ‘============================================================\n’;
return r;
}

function saveResults(wallets, report) {
var tag = dateTag();
var reportPath = path.join(CONFIG.RAPPORT_DIR, ‘rapport_’ + tag + ‘.txt’);
fs.writeFileSync(reportPath, report, ‘utf8’);
fs.writeFileSync(CONFIG.LATEST_RAPPORT, report, ‘utf8’);
var jsonPath = path.join(CONFIG.HISTORIQUE_DIR, ‘wallets_’ + tag + ‘.json’);
fs.writeFileSync(jsonPath, JSON.stringify(wallets, null, 2), ‘utf8’);
fs.writeFileSync(CONFIG.LATEST_JSON, JSON.stringify({
updated_at: timestamp(), count: wallets.length, wallets: wallets
}, null, 2), ‘utf8’);
log(’Rapport : ’ + reportPath);
}

var ONE_HOUR = 60 * 60 * 1000;
startHttpServer();
log(‘Wallet Tracker demarre - cycle toutes les 1h’);
run();
setInterval(function() { run(); }, ONE_HOUR);