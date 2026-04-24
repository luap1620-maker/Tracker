/**
 * WALLET TRACKER BOT v1
 * Scrape gmgn.ai toutes les 6h
 * Filtre les meilleurs wallets (winrate ≥ 60%, actif cette semaine, rug rate < 20%)
 * Génère un rapport lisible + JSON
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const CONFIG = {
  MIN_WINRATE: 60,
  WINRATE_TOLERANCE: 3,
  MAX_RUG_RATE: 20,
  ACTIVE_DAYS: 7,
  PERIODS: ['7d', '30d'],
  RAPPORT_DIR: path.join(__dirname, 'rapports'),
  LATEST_JSON: path.join(__dirname, 'latest_wallets.json'),
  HISTORIQUE_DIR: path.join(__dirname, 'historique'),
  DELAY_BETWEEN_REQUESTS: 3000,
  MAX_RETRIES: 3,
};

const GMGN_URLS = {
  top_traders_7d:  'https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?orderby=pnl&direction=desc&limit=100',
  top_traders_30d: 'https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/30d?orderby=pnl&direction=desc&limit=100',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Referer': 'https://gmgn.ai/',
  'Origin': 'https://gmgn.ai',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ensureDirs() {
  [CONFIG.RAPPORT_DIR, CONFIG.HISTORIQUE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function dateTag() {
  return new Date().toISOString().substring(0, 16).replace(':', 'h').replace('T', '_');
}

function log(msg) {
  const line = `[${timestamp()}] ${msg}`;
  console.log(line);
}

async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      return response.data;
    } catch (err) {
      const status = err.response?.status || 'NETWORK';
      log(`⚠️  Tentative ${i + 1}/${retries} échouée (${status})`);
      if (i < retries - 1) await sleep(CONFIG.DELAY_BETWEEN_REQUESTS * (i + 1));
    }
  }
  return null;
}

async function fetchWithPlaywright(url) {
  try {
    const { chromium } = require('playwright');
    log('🌐 Fallback Playwright activé...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: HEADERS['User-Agent'], locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto('https://gmgn.ai', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    const response = await page.evaluate(async (targetUrl) => {
      const res = await fetch(targetUrl, { credentials: 'include' });
      return await res.json();
    }, url);
    await browser.close();
    return response;
  } catch (err) {
    log(`❌ Playwright aussi échoué : ${err.message}`);
    return null;
  }
}

async function fetchTopTraders(period) {
  const url = GMGN_URLS[`top_traders_${period}`];
  log(`📡 Fetch gmgn.ai top traders ${period}...`);
  let data = await fetchWithRetry(url);
  if (!data || !data.data) {
    log(`🔄 API échouée pour ${period}, tentative Playwright...`);
    await sleep(CONFIG.DELAY_BETWEEN_REQUESTS);
    data = await fetchWithPlaywright(url);
  }
  if (!data || !data.data) {
    log(`❌ Impossible de récupérer les données ${period}`);
    return [];
  }
  const wallets = data.data?.rank || data.data || [];
  log(`✅ ${wallets.length} wallets récupérés pour ${period}`);
  return wallets;
}

function calculateScore(winrate, rugRate, pnl, trades) {
  const scoreWinrate = Math.min((winrate / 100) * 40, 40);
  const scoreRug = Math.max((1 - rugRate / 100) * 30, 0);
  const scorePnl = Math.min((pnl / 500) * 20, 20);
  const scoreTrades = Math.min((trades / 100) * 10, 10);
  return (scoreWinrate + scoreRug + scorePnl + scoreTrades).toFixed(1);
}

function filterWallets(wallets, period) {
  const minWinrate = CONFIG.MIN_WINRATE - CONFIG.WINRATE_TOLERANCE;
  const now = Date.now() / 1000;
  const activeThreshold = now - (CONFIG.ACTIVE_DAYS * 24 * 3600);

  return wallets.filter(w => {
    const winrate = parseFloat(w.winrate || w.win_rate || 0) * 100;
    const rugRate = parseFloat(w.rug_rate || w.rug_ratio || 0) * 100;
    const lastActive = parseInt(w.last_active_timestamp || w.last_trade_at || 0);
    const totalTrades = parseInt(w.total_trades || w.txs_30d || 0);
    return winrate >= minWinrate && rugRate < CONFIG.MAX_RUG_RATE && lastActive > activeThreshold && totalTrades >= 5;
  }).map(w => {
    const winrate = parseFloat(w.winrate || w.win_rate || 0) * 100;
    const rugRate = parseFloat(w.rug_rate || w.rug_ratio || 0) * 100;
    const pnl = parseFloat(w.pnl || w.realized_profit || 0);
    const totalTrades = parseInt(w.total_trades || w.txs_30d || 0);
    const lastActive = parseInt(w.last_active_timestamp || w.last_trade_at || 0);
    return {
      address: w.address || w.wallet || '',
      alias: w.ens || w.tag || '',
      period,
      winrate: winrate.toFixed(1),
      rug_rate: rugRate.toFixed(1),
      pnl_sol: pnl.toFixed(2),
      total_trades: totalTrades,
      last_active: new Date(lastActive * 1000).toISOString().substring(0, 10),
      score: calculateScore(winrate, rugRate, pnl, totalTrades),
    };
  }).sort((a, b) => b.score - a.score);
}

function compareAndMerge(wallets7d, wallets30d) {
  const map7d = new Map(wallets7d.map(w => [w.address, w]));
  const map30d = new Map(wallets30d.map(w => [w.address, w]));
  const allAddresses = new Set([...map7d.keys(), ...map30d.keys()]);
  const merged = [];
  for (const addr of allAddresses) {
    const w7 = map7d.get(addr);
    const w30 = map30d.get(addr);
    merged.push({
      address: addr,
      alias: w7?.alias || w30?.alias || '',
      present_7d: !!w7,
      present_30d: !!w30,
      winrate_7d: w7?.winrate || 'N/A',
      winrate_30d: w30?.winrate || 'N/A',
      rug_rate: w7?.rug_rate || w30?.rug_rate || 'N/A',
      pnl_sol_7d: w7?.pnl_sol || 'N/A',
      pnl_sol_30d: w30?.pnl_sol || 'N/A',
      total_trades: w7?.total_trades || w30?.total_trades || 0,
      last_active: w7?.last_active || w30?.last_active || 'N/A',
      score_7d: parseFloat(w7?.score || 0),
      score_30d: parseFloat(w30?.score || 0),
      consistency_bonus: (w7 && w30) ? 10 : 0,
      final_score: (
        parseFloat(w7?.score || 0) * 0.6 +
        parseFloat(w30?.score || 0) * 0.4 +
        ((w7 && w30) ? 10 : 0)
      ).toFixed(1),
    });
  }
  return merged.sort((a, b) => parseFloat(b.final_score) - parseFloat(a.final_score));
}

function generateReport(mergedWallets, wallets7d, wallets30d) {
  const top = mergedWallets.slice(0, 20);
  const now = timestamp();
  let report = '';
  report += '═'.repeat(60) + '\n';
  report += `  RAPPORT WALLET TRACKER — ${now}\n`;
  report += '═'.repeat(60) + '\n\n';
  report += `📊 RÉSUMÉ\n`;
  report += `─────────────────────────────────────────────\n`;
  report += `  Wallets analysés (7j)  : ${wallets7d.length}\n`;
  report += `  Wallets analysés (30j) : ${wallets30d.length}\n`;
  report += `  Wallets fusionnés      : ${mergedWallets.length}\n`;
  report += `  Présents dans les 2    : ${mergedWallets.filter(w => w.present_7d && w.present_30d).length}\n`;
  report += `  Critères              : Winrate ≥ 57%, Rug < 20%, Actif 7j\n\n`;
  report += `🏆 TOP 20 WALLETS\n`;
  report += `─────────────────────────────────────────────\n\n`;
  top.forEach((w, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const consistency = (w.present_7d && w.present_30d) ? ' ✅ COHÉRENT' : '';
    const alias = w.alias ? ` (${w.alias})` : '';
    report += `${medal} ${w.address.substring(0, 8)}...${alias}\n`;
    report += `   Score Final    : ${w.final_score}/100${consistency}\n`;
    report += `   Winrate 7j     : ${w.winrate_7d}%\n`;
    report += `   Winrate 30j    : ${w.winrate_30d}%\n`;
    report += `   PnL 7j         : ${w.pnl_sol_7d} SOL\n`;
    report += `   PnL 30j        : ${w.pnl_sol_30d} SOL\n`;
    report += `   Rug Rate       : ${w.rug_rate}%\n`;
    report += `   Trades         : ${w.total_trades}\n`;
    report += `   Dernier trade  : ${w.last_active}\n`;
    report += `   Adresse full   : ${w.address}\n\n`;
  });
  const recommended = mergedWallets
    .filter(w => w.present_7d && w.present_30d && parseFloat(w.final_score) >= 60)
    .slice(0, 5);
  if (recommended.length > 0) {
    report += `\n⭐ RECOMMANDÉS POUR LE BOT DE TRADING\n`;
    report += `─────────────────────────────────────────────\n`;
    recommended.forEach((w, i) => {
      report += `  ${i + 1}. ${w.address}  (score: ${w.final_score})\n`;
    });
  }
  report += '\n' + '═'.repeat(60) + '\n';
  report += `  Prochain rapport dans ~6 heures\n`;
  report += '═'.repeat(60) + '\n';
  return report;
}

function saveResults(mergedWallets, report) {
  const tag = dateTag();
  const reportPath = path.join(CONFIG.RAPPORT_DIR, `rapport_${tag}.txt`);
  fs.writeFileSync(reportPath, report, 'utf8');
  const jsonPath = path.join(CONFIG.HISTORIQUE_DIR, `wallets_${tag}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(mergedWallets, null, 2), 'utf8');
  fs.writeFileSync(CONFIG.LATEST_JSON, JSON.stringify({
    updated_at: timestamp(),
    count: mergedWallets.length,
    wallets: mergedWallets,
  }, null, 2), 'utf8');
  log(`💾 Rapport sauvegardé : ${reportPath}`);
  log(`💾 JSON sauvegardé    : ${jsonPath}`);
  log(`💾 Latest mis à jour  : ${CONFIG.LATEST_JSON}`);
}

async function run() {
  log('🚀 Démarrage du Wallet Tracker...');
  ensureDirs();
  try {
    const rawWallets7d = await fetchTopTraders('7d');
    await sleep(CONFIG.DELAY_BETWEEN_REQUESTS);
    const rawWallets30d = await fetchTopTraders('30d');
    if (rawWallets7d.length === 0 && rawWallets30d.length === 0) {
      log('❌ Aucune donnée récupérée. Arrêt du cycle.');
      return;
    }
    log('🔍 Filtrage des wallets...');
    const filtered7d = filterWallets(rawWallets7d, '7d');
    const filtered30d = filterWallets(rawWallets30d, '30d');
    log(`✅ ${filtered7d.length} retenus (7j) / ${filtered30d.length} retenus (30j)`);
    log('📊 Fusion et scoring...');
    const merged = compareAndMerge(filtered7d, filtered30d);
    const report = generateReport(merged, filtered7d, filtered30d);
    console.log('\n' + report);
    saveResults(merged, report);
    log('✅ Cycle terminé avec succès.');
  } catch (err) {
    log(`❌ Erreur inattendue : ${err.message}`);
    console.error(err);
  }
}

const SIX_HOURS = 6 * 60 * 60 * 1000;
log('⏰ Wallet Tracker démarré — cycle toutes les 6h');
run();
setInterval(() => {
  log('⏰ Nouveau cycle de 6h...');
  run();
}, SIX_HOURS);
