'use strict';

// Stores title + href for each article so they can be reconstructed in review lists
const articleStore = {};

document.addEventListener('DOMContentLoaded', () => {
    initStore();
    initTopics();
    updateCounts();
    bindEvents();
    initSourceFilter();
});

function initStore() {
    document.querySelectorAll('.article-card').forEach(card => {
        articleStore[card.dataset.id] = {
            title: card.querySelector('.card-title a').textContent.trim(),
            href:  card.querySelector('.card-title a').getAttribute('href'),
            score: card.dataset.score,
            state: 'neutral',
            source: card.dataset.source,
        };
    });
    document.querySelectorAll('.review-item').forEach(item => {
        articleStore[item.dataset.id] = {
            title: item.dataset.title,
            href:  item.dataset.href,
            score: item.dataset.score,
            state: item.dataset.topNewsState || 'neutral',
            source: item.dataset.source,
        };
    });
}

function bindEvents() {
    // Collapsible accepted / rejected sections
    document.querySelectorAll('.panel-header.collapsible').forEach(header => {
        header.addEventListener('click', () => {
            const list    = document.getElementById(header.dataset.target);
            const chevron = header.querySelector('.chevron');
            list.classList.toggle('hidden');
            chevron.classList.toggle('up');
        });
    });

    // Accept / Reject on main article list
function handleCardClick(e) {
    const card = e.target.closest('.article-card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.accept-btn')){
        moveCard(id, card, 'accepted');
        persistStatus(id, 'confirmed');
    }
    if (e.target.closest('.reject-btn')){
        moveCard(id, card, 'rejected');
        persistStatus(id, 'denied');
    }
    }

    document.querySelector('.main-content').addEventListener('click', handleCardClick);

    // Pin / block / reject inside the accepted list
    document.getElementById('accepted-list').addEventListener('click', e => {
        const item = e.target.closest('.review-item');
        if (!item) return;
        const id = item.dataset.id;

        if (e.target.closest('.pin-btn')) {
            const next = articleStore[id].state === 'pinned' ? 'neutral' : 'pinned';
            applyTopNewsState(item, next);
            return;
        }
        if (e.target.closest('.reject-btn')) {
            swapItem(item, 'rejected');
            persistStatus(id, 'denied');
        }
    });

    // Accept button inside rejected list → move to accepted
    document.getElementById('rejected-list').addEventListener('click', e => {
        const item = e.target.closest('.review-item');
        if (item && e.target.closest('.accept-btn')){
            swapItem(item, 'accepted');
            persistStatus(item.dataset.id, 'confirmed');

        }
    });

    // Accept / Reject inside the extra list
    document.getElementById('extra-list').addEventListener('click', e => {
        const item = e.target.closest('.review-item');
        if (!item) return;
        if (e.target.closest('.accept-btn')) {
            swapItem(item, 'accepted');
            persistStatus(item.dataset.id, 'confirmed');
        } else if (e.target.closest('.reject-btn')) {
            swapItem(item, 'rejected');
            persistStatus(item.dataset.id, 'denied');
        }
    });

    // Start Search — wired to pipeline in a later step
    document.getElementById('btn-start').addEventListener('click', () => {
        const btn = document.getElementById('btn-start');
        const reset = document.getElementById('btn-reset');
        btn.disabled = true;
        if (reset) reset.disabled = true;
        btn.textContent = 'Running...';

        fetch('/run', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    console.log('Pipeline counts:', data.counts);
                    window.location.reload();
                } else {
                    console.error('Pipeline failed:', data.error);
                    btn.disabled = false;
                    if (reset) reset.disabled = false;
                    btn.textContent = 'Start Search';
                }
            })
            .catch(err => {
                console.error('Network error:', err);
                btn.disabled = false;
                if (reset) reset.disabled = false;
                btn.textContent = 'Start Search';
            });
    });

    // Reset Search — pure undo of the last run (within 2h): deletes its articles
    // and un-marks them as seen so the next Start Search can find them again
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        if (!confirm('Undo the last search? Its articles will be deleted and treated as never seen, and the dashboard cards that search cleared will be restored.')) return;
        const startBtn = document.getElementById('btn-start');
        resetBtn.disabled = true;
        startBtn.disabled = true;
        resetBtn.textContent = 'Resetting...';

        fetch('/reset', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    console.log('Reset counts:', data.counts);
                    window.location.reload();
                } else {
                    alert('Reset failed: ' + (data.error || 'unknown error'));
                    resetBtn.disabled = false;
                    startBtn.disabled = false;
                    resetBtn.textContent = 'Reset Search';
                }
            })
            .catch(err => {
                console.error('Network error:', err);
                alert('Reset failed: network error.');
                resetBtn.disabled = false;
                startBtn.disabled = false;
                resetBtn.textContent = 'Reset Search';
            });
    });

    // Send Newsletter — opens the editable preview screen instead of sending directly
    document.getElementById('btn-send').addEventListener('click', () => {
        const count = document.querySelectorAll('#accepted-list .review-item').length;
        if (!count) return;
        window.location.href = '/send/preview';
    });
}

// ===== ACCEPT / REJECT LOGIC =====

function moveCard(id, card, destination) {
    if (destination === 'rejected' && articleStore[id]) articleStore[id].state = 'neutral';
    card.remove();
    addReviewItem(destination === 'accepted' ? 'accepted-list' : 'rejected-list', id, destination);
    updateCounts();
}

function swapItem(item, destination) {
    const id = item.dataset.id;
    if (destination === 'rejected' && articleStore[id]) articleStore[id].state = 'neutral';
    removeReviewItem(item);
    addReviewItem(destination === 'accepted' ? 'accepted-list' : 'rejected-list', id, destination);
    updateCounts();
}

function addReviewItem(listId, id, state) {
    const list = document.getElementById(listId);
    const emptyMsg = list.querySelector('.empty-msg');
    if (emptyMsg) emptyMsg.remove();

    const stored = articleStore[id] || {};
    const { title = '', href = '#', score } = stored;
    const badge = `<span class="tag tag-score">${fmtScore(score)}</span>`;

    let controls;
    if (state === 'accepted') {
        const tns = stored.state || 'neutral';
        controls =
            `<button class="action-btn pin-btn${tns === 'pinned' ? ' active' : ''}" title="Pin to Top News">★</button>` +
            `<button class="action-btn reject-btn" title="Move to Rejected">✗</button>`;
    } else {
        controls = `<button class="action-btn accept-btn" title="Move to Accepted">✓</button>`;
    }

    const li = document.createElement('li');
    li.className = 'review-item';
    li.dataset.id = id;
    if (stored.source) li.dataset.source = stored.source;
    if (state === 'accepted') li.dataset.topNewsState = stored.state || 'neutral';
    li.innerHTML = `${badge}<a href="${href}" target="_blank" rel="noopener">${escapeHtml(title)}</a>${controls}`;
    list.appendChild(li);
}

function removeReviewItem(item) {
    const list = item.parentElement;
    item.remove();
    if (!list.querySelector('.review-item')) {
        const messages = {
            'accepted-list': 'No articles accepted yet.',
            'rejected-list': 'No articles rejected yet.',
            'extra-list': 'No extra articles from the last search',
        };
        list.innerHTML = `<li class="empty-msg">${messages[list.id] || ''}</li>`;
    }
}

// ===== COUNTS & STATE =====

function updateCounts() {
    const acceptedCount = document.querySelectorAll('#accepted-list .review-item').length;
    const rejectedCount = document.querySelectorAll('#rejected-list .review-item').length;
    const extraCount    = document.querySelectorAll('#extra-list .review-item').length;

    document.getElementById('count-accepted').textContent = acceptedCount;
    document.getElementById('count-rejected').textContent = rejectedCount;
    document.getElementById('count-extra').textContent = extraCount;

    document.getElementById('btn-send').disabled = acceptedCount === 0;

    refreshArticleSections();
    applySourceFilter();
}

function clearLists() {
    document.getElementById('accepted-list').innerHTML = '<li class="empty-msg">No articles accepted yet.</li>';
    document.getElementById('rejected-list').innerHTML = '<li class="empty-msg">No articles rejected yet.</li>';
    updateCounts();
}

function persistStatus(id, status) {
    return fetch(`/articles/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    }).then(res => {
        if (!res.ok) console.error('Failed to persist status', id, status);
    });
}

// ===== UTILS =====

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ===== TOP NEWS PRIORITIZATION =====

function fmtScore(score) {
    const n = parseFloat(score);
    return Number.isFinite(n) ? Math.trunc(n) : '';
}

function applyTopNewsState(item, state) {
    const id = item.dataset.id;
    const pin = item.querySelector('.pin-btn');
    if (pin) pin.classList.toggle('active', state === 'pinned');
    if (articleStore[id]) articleStore[id].state = state;
    item.dataset.topNewsState = state;
    persistTopNewsState(id, state);
}

function persistTopNewsState(id, state) {
    return fetch(`/articles/${id}/top-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ top_news_state: state }),
    }).then(res => {
        if (!res.ok) console.error('Failed to persist top-news state', id, state);
    });
}

// ===== SOURCE FILTER =====

let selectedSource = null;

function initSourceFilter() {
    document.getElementById('sources-toggle').addEventListener('click', toggleSourcesSidebar);
    document.getElementById('source-list').addEventListener('click', e => {
        const row = e.target.closest('.source-row');
        if (!row) return;
        selectedSource = (row.dataset.source === selectedSource) ? null : row.dataset.source;
        document.querySelectorAll('#source-list .source-row').forEach(r => {
            r.classList.toggle('selected', r.dataset.source === selectedSource);
        });
        applySourceFilter();
    });
}

function applySourceFilter() {
    // Show/hide individual article cards and review-list items
    document.querySelectorAll('.article-card, .review-item').forEach(el => {
        const hide = selectedSource !== null && el.dataset.source !== selectedSource;
        el.classList.toggle('source-hidden', hide);
    });

    // While a filter is active, hide any panel with nothing visible in it
    document.querySelectorAll('.main-content .panel').forEach(panel => {
        if (selectedSource === null) {
            panel.classList.remove('source-hidden');
            return;
        }
        const visible = panel.querySelectorAll(
            '.article-card:not(.source-hidden), .review-item:not(.source-hidden)'
        ).length;
        panel.classList.toggle('source-hidden', visible === 0);
    });
}

// ===== TOPIC MANAGEMENT =====

function initTopics() {
    document.getElementById('btn-add-topic').addEventListener('click', openAddTopicModal);
    document.getElementById('topic-modal-cancel').addEventListener('click', closeAddTopicModal);
    document.getElementById('topic-modal-add').addEventListener('click', submitNewTopic);

    // Delegated delete: ✕ inside any topic chip
    document.getElementById('topic-chips').addEventListener('click', e => {
        const btn = e.target.closest('.chip-delete');
        if (!btn) return;
        const chip = btn.closest('.topic-chip');
        if (chip) handleChipDelete(chip);
    });
}

function openAddTopicModal() {
    const nameInput = document.getElementById('topic-name-input');
    nameInput.value = '';
    document.getElementById('topic-desc-input').value = '';
    const err = document.getElementById('topic-modal-error');
    err.textContent = '';
    err.hidden = true;
    document.getElementById('topic-modal').hidden = false;
    nameInput.focus();
}

function closeAddTopicModal() {
    document.getElementById('topic-modal').hidden = true;
}

function submitNewTopic() {
    const name = document.getElementById('topic-name-input').value;
    const description = document.getElementById('topic-desc-input').value;
    const err = document.getElementById('topic-modal-error');

    fetch('/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
    })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
            if (ok && data.ok) {
                addTopicChip(data.id, data.name);
                closeAddTopicModal();
            } else {
                err.textContent = (data && data.error) || 'Could not create topic.';
                err.hidden = false;
            }
        })
        .catch(() => {
            err.textContent = 'Network error. Please try again.';
            err.hidden = false;
        });
}

function addTopicChip(id, name) {
    const chips = document.getElementById('topic-chips');
    const chip = document.createElement('span');
    chip.className = 'chip topic-chip';
    chip.dataset.topicId = id;
    chip.dataset.topicName = name;
    chip.innerHTML =
        `<span class="topic-chip-name">${escapeHtml(name)}</span>` +
        `<button class="chip-delete" title="Delete topic" aria-label="Delete topic">✕</button>`;
    chips.appendChild(chip);
}

function handleChipDelete(chip) {
    const id = chip.dataset.topicId;
    const name = chip.dataset.topicName;
    if (!confirm(`Delete topic "${name}"?`)) return;

    fetch(`/topics/${id}`, { method: 'DELETE' })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
            if (ok && data.ok) {
                chip.remove();
                // Remove the matching bucket panel if one is currently showing
                document.querySelectorAll('section[data-topic-name]').forEach(section => {
                    if (section.dataset.topicName === name) section.remove();
                });
            } else {
                alert((data && data.error) || 'Could not delete topic.');
            }
        })
        .catch(() => alert('Network error. Please try again.'));
}

// ===== BUCKET / MANUAL COUNTS =====

function refreshArticleSections() {
    // Topic + Other buckets
    document.querySelectorAll('.bucket-list').forEach(list => {
        const count = list.querySelectorAll('.article-card').length;
        const panel = list.closest('.panel');
        const badge = panel ? panel.querySelector('.bucket-count') : null;
        if (badge) badge.textContent = count;
        const emptyMsg = list.querySelector('.empty-msg');
        if (emptyMsg) emptyMsg.hidden = count > 0;
    });

    // Manual Review (paywalled)
    const manualList = document.getElementById('manual-list');
    if (manualList) {
        const manualCount = manualList.querySelectorAll('.article-card').length;
        const manualBadge = document.getElementById('count-manual');
        if (manualBadge) manualBadge.textContent = manualCount;
        const manualPanel = document.getElementById('panel-manual');
        const manualEmpty = manualPanel ? manualPanel.querySelector('.empty-msg') : null;
        if (manualEmpty) manualEmpty.hidden = manualCount > 0;
    }
}

function toggleSourcesSidebar() {
    const sidebar = document.getElementById('sources-sidebar');
    const toggle = document.getElementById('sources-toggle');
    const collapsed = sidebar.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '‹' : '›';
    toggle.title = collapsed ? 'Expand' : 'Collapse';
}

