'use strict';
const names = ['Googlin', 'Pear', 'BenefitCo', 'Fire Rage Inc.'];
const key = 'alien-stock-browser-demo-v1';
const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(cents / 100);
const fresh = () => ({cash: 1000000, shares: names.map(() => 0), prices: names.map(() => [10000]), trades: []});
let state = fresh();
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved && Number.isSafeInteger(saved.cash) && saved.cash >= 0 &&
      Array.isArray(saved.shares) && saved.shares.length === 4 && saved.shares.every(n => Number.isSafeInteger(n) && n >= 0) &&
      Array.isArray(saved.prices) && saved.prices.length === 4 && saved.prices.every(a => Array.isArray(a) && a.length > 0 && a.length <= 60 && a.every(n => Number.isSafeInteger(n) && n > 0 && n <= 100000000)) &&
      Array.isArray(saved.trades) && saved.trades.length <= 20 && saved.trades.every(t => typeof t === 'string')) state = saved;
} catch { /* Storage may be unavailable; trading still works for this visit. */ }
function save() {
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch { $('storage').textContent = 'Browser storage is unavailable. Progress will last only for this visit. This demo has no shared accounts or messaging.'; }
}
names.forEach((name, i) => { const option = document.createElement('option'); option.value = i; option.textContent = name; $('company').append(option); });
function render() {
  const i = Number($('company').value), series = state.prices[i], price = series.at(-1);
  const value = state.shares.reduce((sum, shares, j) => sum + shares * state.prices[j].at(-1), 0);
  $('cash').textContent = money(state.cash); $('holdings').textContent = money(value); $('worth').textContent = money(state.cash + value);
  $('price').textContent = money(price);
  const change = (price / series[0] - 1) * 100;
  $('change').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}% over displayed history`;
  $('position').textContent = `You own ${state.shares[i]} shares of ${names[i]} (${money(state.shares[i] * price)}).`;
  const low = Math.min(...series), high = Math.max(...series), span = Math.max(high - low, 100);
  const points = series.length === 1 ? [price, price] : series;
  $('line').setAttribute('d', points.map((p, j) => `${j ? 'L' : 'M'}${10 + j / (points.length - 1) * 580},${200 - (p - low) / span * 180}`).join(' '));
  $('chart-title').textContent = `${names[i]} simulated price history, low ${money(low)}, high ${money(high)}`;
  $('range').textContent = `Displayed low: ${money(low)} · high: ${money(high)} · up to 60 price updates`;
  const quantity = Number($('quantity').value);
  $('estimate').textContent = Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1000000 ? `Current trade value: ${money(quantity * price)}` : 'Enter a whole number from 1 to 1,000,000.';
  $('history').replaceChildren();
  state.trades.forEach(text => { const li = document.createElement('li'); li.textContent = text; $('history').append(li); });
  $('empty').hidden = state.trades.length > 0;
}
$('company').addEventListener('change', () => { $('status').textContent = ''; render(); });
$('quantity').addEventListener('input', render);
$('trade').addEventListener('submit', event => {
  event.preventDefault();
  const i = Number($('company').value), quantity = Number($('quantity').value), side = event.submitter?.value || 'buy';
  if (!$('trade').reportValidity() || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) return;
  const total = quantity * state.prices[i].at(-1);
  if (side === 'buy' && total > state.cash) { $('status').textContent = 'Not enough cash for this purchase.'; return; }
  if (side === 'sell' && quantity > state.shares[i]) { $('status').textContent = 'You do not own enough shares to sell that amount.'; return; }
  state.cash += side === 'buy' ? -total : total;
  state.shares[i] += side === 'buy' ? quantity : -quantity;
  const text = `${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} ${names[i]} shares for ${money(total)}.`;
  state.trades.unshift(text); state.trades = state.trades.slice(0, 20);
  save(); render(); $('status').textContent = text;
});
$('reset').addEventListener('click', () => { if (confirm('Reset your cash, holdings, price history, and trades?')) { state = fresh(); save(); render(); $('status').textContent = 'Demo reset. You have $10,000 in virtual cash.'; } });
setInterval(() => {
  state.prices.forEach(series => { series.push(Math.max(100, Math.min(100000000, Math.round(series.at(-1) * (1 + (Math.random() - 0.5) * 0.04))))); if (series.length > 60) series.shift(); });
  save(); render();
}, 10000);
render();
