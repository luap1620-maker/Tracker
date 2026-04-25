const axios = require(‘axios’);

const HELIUS_KEY = ‘9fdd885d-7eb9-4708-8962-c0bda789b1f8’;
const HELIUS_API = ‘https://api.helius.xyz/v0’;
const HELIUS_RPC = ‘https://mainnet.helius-rpc.com/?api-key=9fdd885d-7eb9-4708-8962-c0bda789b1f8’;
const SOL_PRICE = 150;

const WALLETS = [
‘215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP’,
‘3LUfv2u5yzsDtUzPdsSJ7ygPBuqwfycMkjpNreRR2Yww’,
‘3H9LVHarjBoZ2YPEsgFbVD1zuERCGwfp4AeyHoHsFSEC’,
‘9jyqFiLnruggwNn4EQwBNFXwpbLM9hrA4hV59ytyAVVz’,
‘922VvmmYDHV9KMTJJ71Y5Yd3Vn7cfJuFasLNSsZPygrG’,
‘87rRdssFiTJKY4MGARa4G5vQ31hmR7MxSmhzeaJ5AAxJ’,
‘JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN’,
‘2RyUYqX1VFoGdDSKm3brWV5c2bY4thXx1Wctz22uYS1p’,
‘DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj’,
‘G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC’,
‘78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2’,
‘Ew6qBU7N34gRNgpgUwhJ3PgrtbPYpLYWLBEG5yuQTceD’,
‘DxwDRWxQXDaVZquH3YvCVBQ75nUf16FttQ4q88okn5mc’,
‘7mHqL9GzGnbsYLoHLDzB7FiHAZbND2CZCJYFvU9PU1d3’,
‘9tY7u1HgEt2RDcxym3RJ9sfvT3aZStiiUwXd44X9RUr8’,
‘Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt’,
‘4NtyFqqRzvHWsTmJZoT26H9xtL7asWGTxpcpCxiKax9a’,
‘DwCp9GZw3ueoXPykHSPUkRZEwcTVbJH2i9Sf1cXYicWf’,
‘2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f’,
‘7xwDKXNG9dxMsBSCmiAThp7PyDaUXbm23irLr7iPeh7w’,
‘CEUA7zVoDRqRYoeHTP58UHU6TR8yvtVbeLrX1dppqoXJ’,
‘Hw5UKBU5k3YudnGwaykj5E8cYUidNMPuEewRRar5Xoc7’,
‘3rwzJNVRrprfTQD3xFgxRK279tVAhNBtGtQk4WdP6Lu2’,
‘CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o’,
‘D1H83ueSw5Nxy5okxH7VBfV4jRnqAK5Mm1tm3JAj3m5t’,
‘5sNnKuWKUtZkdC1eFNyqz3XHpNoCRQ1D1DfHcNHMV7gn’,
‘2net6etAtTe3Rbq2gKECmQwnzcKVXRaLcHy2Zy1iCiWz’,
‘9Vk7pkBZ9KFJmzaPzNYjGedyz8qoKMQtnYyYi2AehNMT’,
‘4s2WzRLa35FB58bZY1i4CN3WoywJeuYrGYHnTKFsT23z’,
‘4yo9CUuTBbds9NFhZd4MzPiZZkUvveXdTnAH8qMsE8ku’,
‘5B52w1ZW9tuwUduueP5J7HXz5AcGfruGoX6YoAudvyxG’,
‘6mWEJG9LoRdto8TwTdZxmnJpkXpTsEerizcGiCNZvzXd’,
‘DuGezKLZp8UL2aQMHthoUibEC7WSbpNiKFJLTtK1QHjx’,
‘7pDhG6NqfzQzw5KvtGXJbVRUh4iTBgYAn68BSKjdMNC1’,
‘B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC’,
‘RaSSH7hMwLKtMT96xZyY4JwHRCCNYvvNeBh6AaFMqdA’,
‘6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC’,
‘ApRnQN2HkbCn7W2WWiT2FEKvuKJp9LugRyAE1a9Hdz1’,
‘BNahnx13rLru9zxuWNGBD7vVv1pGQXB11Q7qeTyupdWf’,
‘xyzfhxfy8NhfeNG3Um3WaUvFXzNuHkrhrZMD8dsStB6’,
‘Av3xWHJ5EsoLZag6pr7LKbrGgLRTaykXomDD5kBhL9YQ’,
‘EVCwZrtPFudcjw69RZ9Qogt8dW2HjBp6EiMgv1ujdYuJ’,
‘4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk’,
‘EDXHdSFdadFbYFFjxPXBqMe1kCEDFqpPu552uvp48HR8’,
‘99i9uVA7Q56bY22ajKKUfTZTgTeP5yCtVGsrG9J4pDYQ’,
‘67Nwfi9hgwqhxGoovT2JGLU67uxfomLwQAWncjXXzU6U’,
‘4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9’,
‘J1XAE4onKYG1kTghgaytnyFgR3otQs1xEnJRRWM3djSQ’,
‘98T65wcMEjoNLDTJszBHGZEX75QRe8QaANXokv4yw3Mp’,
‘99xnE2zEFi8YhmKDaikc1EvH6ELTQJppnqUwMzmpLXrs’,
];

const sleep = function(ms) { return new Promise(function(r) { return setTimeout(r, ms); }); };

async function getBalance(address) {
try {
var res = await axios.post(HELIUS_RPC, {
jsonrpc: ‘2.0’, id: 1, method: ‘getBalance’, params: [address]
}, { timeout: 10000 });
var lamports = res.data.result ? res.data.result.value : 0;
return (lamports / 1e9) * SOL_PRICE;
} catch (err) { return 0; }
}

async function getTransactions(address) {
var allTxs = [];
var before = null;
for (var page = 0; page < 10; page++) {
var params = { limit: 100, type: ‘SWAP’, ‘api-key’: HELIUS_KEY };
if (before) params.before = before;
try {
var res = await axios.get(HELIUS_API + ‘/addresses/’ + address + ‘/transactions’, {
params: params, timeout: 20000,
});
var txs = res.data || [];
if (txs.length === 0) break;
allTxs = allTxs.concat(txs);
if (txs.length < 100) break;
before = txs[txs.length - 1].signature;
await sleep(200);
} catch (err) { break; }
}
return allTxs;
}

function analyze(txs, address) {
var tokenTrades = {};
var now = Date.now() / 1000;
var weekAgo = now - (7 * 24 * 3600);
var lastActive = 0;
var firstActive = 0;
var recent7d = 0;
var dailyCounts = {};

for (var t = 0; t < txs.length; t++) {
var tx = txs[t];
if (!tx || !tx.timestamp) continue;
if (tx.timestamp > lastActive) lastActive = tx.timestamp;
if (firstActive === 0 || tx.timestamp < firstActive) firstActive = tx.timestamp;
if (tx.timestamp > weekAgo) recent7d++;
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

var total = wins + losses;
return {
wins: wins, losses: losses, rugs: rugs,
winrate: total > 0 ? (wins / total * 100).toFixed(1) : ‘0.0’,
rugRate: mints.length > 0 ? (rugs / mints.length * 100).toFixed(1) : ‘0.0’,
pnlSol: totalPnl.toFixed(2),
totalTrades: total,
recent7d: recent7d,
maxPerDay: maxPerDay,
daysActive: firstActive > 0 ? Math.floor((lastActive - firstActive) / 86400) : 0,
lastActiveDate: lastActive > 0 ? new Date(lastActive * 1000).toISOString().substring(0, 10) : ‘N/A’,
isActive: lastActive > weekAgo,
totalTx: txs.length,
};
}

async function main() {
console.log(’=== Analyse 10 wallets uwuu.ai ===\n’);
for (var i = 0; i < WALLETS.length; i++) {
var address = WALLETS[i];
var balance = await getBalance(address);
var txs = await getTransactions(address);
var stats = analyze(txs, address);
console.log((i+1) + ‘. ’ + address.substring(0, 8) + ‘…’);
console.log(’   $’ + balance.toFixed(0) + ’ | ’ + txs.length + ’tx | WR: ’ + stats.winrate + ’% | PnL: ’ + stats.pnlSol + ’ SOL | Rug: ’ + stats.rugRate + ’% | Trades: ’ + stats.totalTrades + ’ | MaxJour: ’ + stats.maxPerDay + ’ | Anciennete: ’ + stats.daysActive + ’j | Actif: ’ + (stats.isActive ? ‘oui’ : ‘non’));
await sleep(400);
}
}

main();
