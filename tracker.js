/**

- WALLET TRACKER BOT v2 - Helius Edition
- Analyse les top wallets directement on-chain via Helius
  */

const axios = require(‘axios’);
const fs = require(‘fs’);
const path = require(‘path’);

const CONFIG = {
HELIUS_API_KEY: ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_RPC: ‘https://mainnet.helius-rpc.com/?api-key=9fdd885d-7eb9-4708-8962-c0bda789b1f8’,
HELIUS_API: ‘https://api.helius.xyz/v0’,
MIN_WINRATE: 57,
MAX_RUG_RATE: 20,
MIN_TRADES: 10,
ACTIVE_DAYS: 7,
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ensureDirs() {
[CONFIG.RAPPORT_DIR, CONFIG.HISTORIQUE_DIR].forEach(dir => {
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
console.log(`[${timestamp()}] ${msg}`);
}

async function getWalletTransactions(walletAddress, limit = 200) {
for (let i = 0; i < CONFIG.MAX_RETRIES; i++) {
try {
const res = await axios.get(`${CONFIG.HELIUS_API}/addresses/${walletAddress}/transactions`, {
params: { limit, type: ‘SWAP’, ‘api-key’: CONFIG.HELIUS_API_KEY },
timeout: 20000,
});
return res.data || [];
} catch (err) {
log(`⚠️ Transactions tentative ${i + 1}/${CONFIG.MAX_RETRIES} échouée pour ${walletAddress.substring(0,8)}`);
if (i < CONFIG.MAX_RETRIES - 1) await sleep(CONFIG.DELAY * (i + 2));
}
}
return [];
}

function analyzeWalletTrades(transactions, walletAddress) {
const tokenPositions = {};
const now = Date.now() / 1000;
const weekAgo = now - (7 * 24 * 3600);
const monthAgo = now - (30 * 24 * 3600);
let lastActive = 0;
let recentTrades7d = 0;
let recentTrades30d = 0;

for (const tx of transactions) {
if (!tx || !tx.timestamp) continue;
if (tx.timestamp > lastActive) lastActive = tx.timestamp;
if (tx.timestamp > weekAgo) recentTrades7d++;
if (tx.timestamp > monthAgo) recentTrades30d++;

```
const swaps = tx.tokenTransfers || [];
for (const transfer of swaps) {
  const mint = transfer.mint;
  if (!mint || mint === 'So11111111111111111111111111111111111111112') continue;
  if (!tokenPositions[mint]) tokenPositions[mint] = { bought: 0, sold: 0 };
  if (transfer.toUserAccount === walletAddress) tokenPositions[mint].bought += parseFloat(transfer.tokenAmount || 0);
  if (transfer.fromUserAccount === walletAddress) tokenPositions[mint].sold += parseFloat(transfer.tokenAmount || 0);
}
```

}

let wins = 0, losses = 0, rugCount = 0;

for (const [mint, pos] of Object.entries(tokenPositions)) {
if (pos.bought > 0 && pos.sold === 0) { rugCount++; continue; }
if (pos.bought > 0 && pos.sold > 0) {
const ratio = pos.sold / pos.bought;
if (ratio >= 1.5) wins++;
else if (ratio < 0.5) losses++;
}
}

const totalTokens = Object.keys(tokenPositions).length;
const totalTrades = wins + losses;
const winrate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
const rugRate = totalTokens > 0 ? (rugCount / totalTokens) * 100 : 0;

return {
address: walletAddress,
totalTrades,
totalTokens,
wins,
losses,
rugCount,
winrate: winrate.toFixed(1),
rugRate: rugRate.toFixed(1),
recentTrades7d,
recentTrades30d,
lastActive,
lastActiveDate: lastActive > 0 ? new Date(lastActive * 1000).toISOString().substring(0, 10) : ‘N/A’,
isActiveThisWeek: lastActive > weekAgo,
};
}

function calculateScore(stats) {
const winrate = parseFloat(stats.winrate);
const rugRate = parseFloat(stats.rugRate);
const trades = stats.totalTrades;
const recent = stats.recentTrades7d;
return (
Math.min((winrate / 100) * 40, 40) +
Math.max((1 - rugRate / 100) * 25, 0) +
Math.min((trades / 50) * 20, 20) +
Math.min((recent / 10) * 15, 15)
).toFixed(1);
}

function filterWallet(stats) {
return (
parseFloat(stats.winrate) >= CONFIG.MIN_WINRATE &&
parseFloat(stats.rugRate) < CONFIG.MAX_RUG_RATE &&
stats.isActiveThisWeek &&
stats.totalTrades >= CONFIG.MIN_TRADES
);
}

async function analyzeWallets() {
const results = [];
log(`🔍 Analyse de ${CONFIG.SEED_WALLETS.length} wallets via Helius...`);

for (let i = 0; i < CONFIG.SEED_WALLETS.length; i++) {
const wallet = CONFIG.SEED_WALLETS[i];
log(`📡 [${i + 1}/${CONFIG.SEED_WALLETS.length}] ${wallet.substring(0, 8)}...`);

```
const transactions = await getWalletTransactions(wallet);
if (!transactions || transactions.length === 0) {
  log(`   ⚠️ Aucune transaction`);
  await sleep(CONFIG.DELAY);
  continue;
}

log(`   ✅ ${transactions.length} transactions`);
const stats = analyzeWalletTrades(transactions, wallet);
const score = calculateScore(stats);
const passes = filterWallet(stats);

log(`   📊 Winrate: ${stats.winrate}% | Rug: ${stats.rugRate}% | Trades: ${stats.totalTrades} | Score: ${score} | ${passes ? '✅ RETENU' : '❌ filtré'}`);

if (passes) results.push({ ...stats, score });
await sleep(CONFIG.DELAY);
```

}

return results.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
}

function generateReport(wallets) {
const now = timestamp();
let r = ‘’;
r += ‘═’.repeat(60) + ‘\n’;
r += `  RAPPORT WALLET TRACKER v2 — ${now}\n`;
r += ‘═’.repeat(60) + ‘\n\n’;
r += `📊 RÉSUMÉ\n`;
r += `─────────────────────────────────────────────\n`;
r += `  Wallets analysés : ${CONFIG.SEED_WALLETS.length}\n`;
r += `  Wallets retenus  : ${wallets.length}\n`;
r += `  Critères         : Winrate ≥ ${CONFIG.MIN_WINRATE}%, Rug < ${CONFIG.MAX_RUG_RATE}%, Actif 7j, ≥ ${CONFIG.MIN_TRADES} trades\n\n`;

if (wallets.length === 0) {
r += `⚠️  Aucun wallet ne passe les filtres ce cycle.\n\n`;
} else {
r += `🏆 TOP WALLETS\n`;
r += `─────────────────────────────────────────────\n\n`;
wallets.forEach((w, i) => {
const medal = i === 0 ? ‘🥇’ : i === 1 ? ‘🥈’ : i === 2 ? ‘🥉’ : `${i + 1}.`;
r += `${medal} ${w.address.substring(0, 8)}...${w.address.slice(-4)}\n`;
r += `   Score         : ${w.score}/100\n`;
r += `   Winrate       : ${w.winrate}%\n`;
r += `   Rug Rate      : ${w.rugRate}%\n`;
r += `   Trades        : ${w.totalTrades} (${w.wins}W / ${w.losses}L)\n`;
r += `   Actif 7j      : ${w.recentTrades7d} trades\n`;
r += `   Actif 30j     : ${w.recentTrades30d} trades\n`;
r += `   Dernier trade : ${w.lastActiveDate}\n`;
r += `   Adresse full  : ${w.address}\n\n`;
});

```
r += `\n⭐ RECOMMANDÉS POUR LE BOT DE TRADING\n`;
r += `─────────────────────────────────────────────\n`;
wallets.slice(0, 3).forEach((w, i) => {
  r += `  ${i + 1}. ${w.address}  (score: ${w.score})\n`;
});
```

}

r += ‘\n’ + ‘═’.repeat(60) + ‘\n’;
r += `  Prochain rapport dans ~6 heures\n`;
r += ‘═’.repeat(60) + ‘\n’;
return r;
}

function saveResults(wallets, report) {
const tag = dateTag();
const reportPath = path.join(CONFIG.RAPPORT_DIR, `rapport_${tag}.txt`);
fs.writeFileSync(reportPath, report, ‘utf8’);
const jsonPath = path.join(CONFIG.HISTORIQUE_DIR, `wallets_${tag}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(wallets, null, 2), ‘utf8’);
fs.writeFileSync(CONFIG.LATEST_JSON, JSON.stringify({ updated_at: timestamp(), count: wallets.length, wallets }, null, 2), ‘utf8’);
log(`💾 Rapport : ${reportPath}`);
log(`💾 JSON    : ${jsonPath}`);
}

async function run() {
log(‘🚀 Démarrage Wallet Tracker v2 (Helius)…’);
ensureDirs();
try {
const wallets = await analyzeWallets();
log(`\n✅ ${wallets.length} wallets retenus`);
const report = generateReport(wallets);
console.log(’\n’ + report);
saveResults(wallets, report);
log(‘✅ Cycle terminé.’);
} catch (err) {
log(`❌ Erreur : ${err.message}`);
console.error(err);
}
}

const SIX_HOURS = 6 * 60 * 60 * 1000;
log(‘⏰ Wallet Tracker v2 démarré — cycle toutes les 6h’);
run();
setInterval(() => { log(‘⏰ Nouveau cycle…’); run(); }, SIX_HOURS);