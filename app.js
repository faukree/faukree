
const DATA_URL = './data/stats.json';
const MEDAL_URL = 'https://cdn.stratz.com/images/dota2/seasonal_rank/';

const $ = id => document.getElementById(id);

const RANKS = [
    { name: 'Рекрут', tier: 1, thresholds: [0, 154, 308, 462, 616] },
    { name: 'Страж', tier: 2, thresholds: [770, 924, 1078, 1232, 1386] },
    { name: 'Рыцарь', tier: 3, thresholds: [1540, 1694, 1848, 2002, 2156] },
    { name: 'Герой', tier: 4, thresholds: [2310, 2464, 2618, 2772, 2926] },
    { name: 'Легенда', tier: 5, thresholds: [3080, 3234, 3388, 3542, 3696] },
    { name: 'Властелин', tier: 6, thresholds: [3850, 4004, 4158, 4312, 4466] },
    { name: 'Божество', tier: 7, thresholds: [4620, 4820, 5020, 5220, 5420] }
];

function getMedal(mmr) {
    if (!Number.isFinite(mmr) || mmr < 0) return null;

    if (mmr >= 5640) {
        return {
            name: 'Титан',
            tier: 8,
            stars: 0,
            title: 'Immortal'
        };
    }

    let currentRank = RANKS[0];

    for (const rank of RANKS) {
        if (mmr >= rank.thresholds[0]) currentRank = rank;
    }

    let stars = 1;

    for (let i = 0; i < currentRank.thresholds.length; i++) {
        if (mmr >= currentRank.thresholds[i]) stars = i + 1;
    }

    return {
        name: currentRank.name,
        tier: currentRank.tier,
        stars,
        title: `${currentRank.name} ${stars}`
    };
}

function renderMedal(mmr) {
    const image = $('medalImage');
    const name = $('medalName');
    const starsText = $('medalStars');

    if (!image || !name || !starsText) return;

    const medal = getMedal(mmr);

    if (!medal) {
        image.style.display = 'none';
        name.textContent = 'Ранг неизвестен';
        starsText.textContent = 'Нет данных MMR';
        return;
    }

    image.style.display = 'block';
    image.src = `${MEDAL_URL}medal_${medal.tier}.png`;
    image.alt = medal.title;
    image.title = medal.title;

    image.onerror = () => {
        image.style.display = 'none';
    };

    name.textContent = medal.name;
    starsText.textContent = medal.tier === 8
        ? 'Immortal'
        : `${medal.stars} ★`;
}

const fmtDate = timestamp => {
    if (!timestamp) return '—';

    return new Date(timestamp * 1000).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const duration = seconds => {
    const value = Number(seconds || 0);
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

function num(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('ru-RU');
}

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function formatMmrChange(value) {
    const number = Number(value ?? 0);
    if (number > 0) return `+${number}`;
    if (number < 0) return `−${Math.abs(number)}`;
    return '0';
}

function renderPerformance(performance = {}) {
    const mmr7d = $('mmr7d');
    const mmr30d = $('mmr30d');

    if (mmr7d) {
        const value = Number(performance.mmr_change_7d ?? 0);
        mmr7d.textContent = formatMmrChange(value);
        mmr7d.className = value > 0 ? 'positive' : value < 0 ? 'lost' : '';
    }

    if (mmr30d) {
        const value = Number(performance.mmr_change_30d ?? 0);
        mmr30d.textContent = formatMmrChange(value);
        mmr30d.className = value > 0 ? 'positive' : value < 0 ? 'lost' : '';
    }
}

function renderItems(items = []) {
    const validItems = items.filter(item => item && (item.icon || item.name));

    if (!validItems.length) return '<span class="match-no-items">—</span>';

    return `
        <div class="match-items">
            ${validItems.map(item => {
                const name = esc(item.name || 'Предмет');
                const icon = esc(item.icon || '');

                if (!icon) return `<span class="item-name" title="${name}">${name}</span>`;

                return `
                    <img src="${icon}" alt="${name}" title="${name}"
                         loading="lazy" onerror="this.style.display='none'">
                `;
            }).join('')}
        </div>
    `;
}

function renderRating(rating) {
    if (rating == null || !Number.isFinite(Number(rating))) return '—';

    const value = Number(rating);
    const ratingClass = value >= 7 ? 'rating-high' : value >= 5 ? 'rating-mid' : 'rating-low';

    return `
        <span class="match-rating ${ratingClass}">
            ${value.toLocaleString('ru-RU', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            })}/10
        </span>
    `;
}

function renderReviewNotes(matches = []) {
    const reviewBlock = $('reviewNotes');
    if (!reviewBlock) return;

    const notes = [];

    matches.forEach(match => {
        (match.review_notes || []).forEach(note => {
            if (note && !notes.includes(note)) notes.push(note);
        });
    });

    reviewBlock.innerHTML = notes.length
        ? `<ul class="review-notes-list">${notes.slice(0, 5).map(note => `<li>${esc(note)}</li>`).join('')}</ul>`
        : '<p>Пока нет заметок по матчам.</p>';
}

function renderMatches(matches = []) {
    const matchesBody = $('matchesBody');
    if (!matchesBody) return;

    if (!matches.length) {
        matchesBody.innerHTML = '<tr><td colspan="11">Пока нет матчей в выгрузке.</td></tr>';
        return;
    }

    matchesBody.innerHTML = matches.map(match => {
        const resultClass = match.win === true ? 'won' : match.win === false ? 'lost' : '';
        const resultText = match.win === true ? 'ПОБЕДА' : match.win === false ? 'ПОРАЖЕНИЕ' : '—';

        return `
            <tr>
                <td>
                    <div class="hero">
                        <img src="${esc(match.hero_icon || '')}" alt="" loading="lazy">
                        <span>${esc(match.hero_name || 'Неизвестно')}</span>
                    </div>
                </td>
                <td class="${resultClass}">${resultText}</td>
                <td>${num(match.kills)}/${num(match.deaths)}/${num(match.assists)}</td>
                <td>${renderItems(match.items || [])}</td>
                <td>${num(match.hero_damage)}</td>
                <td>${num(match.xp_per_min)}</td>
                <td>${num(match.gold_per_min)}</td>
                <td>${renderRating(match.rating)}</td>
                <td>${match.mmr_after == null ? '—' : num(match.mmr_after)}</td>
                <td>${duration(match.duration)}</td>
                <td>${fmtDate(match.start_time)}</td>
            </tr>
        `;
    }).join('');
}

function renderTopHeroes(data) {
    const heroGrid = $('heroGrid');
    if (!heroGrid) return;

    const heroes = (data.top_heroes || [])
        .slice()
        .sort((a, b) => Number(b.winrate) - Number(a.winrate) || Number(b.games) - Number(a.games))
        .slice(0, 15);

    heroGrid.innerHTML = heroes.map(hero => `
        <div class="herocard">
            <img src="${esc(hero.icon || '')}" alt="${esc(hero.name || '')}" loading="lazy">
            <div>
                <b>${esc(hero.name || 'Неизвестно')}</b>
                <small>
                    ${num(hero.games)} игр · ${num(hero.winrate)}% побед ·
                    KDA ${esc(hero.kda ?? '—')}
                </small>
            </div>
        </div>
    `).join('') || '<p>Статистика героев появится после обработки матчей.</p>';
}

function renderRecentHeroes(data) {
    const recentHeroGrid = $('recentHeroGrid');
    if (!recentHeroGrid) return;

    const heroes = (data.recent_heroes_30d || [])
        .slice()
        .sort((a, b) => Number(b.wins) - Number(a.wins) ||
            Number(b.winrate) - Number(a.winrate) ||
            Number(a.games) - Number(b.games));

    recentHeroGrid.innerHTML = heroes.map(hero => {
        const results = (hero.recent_results || []).slice(-5).map(result => `
            <span class="recent-result-dot ${result.win ? 'won' : 'lost'}"
                  title="${result.win ? 'Победа' : 'Поражение'}"></span>
        `).join('');

        return `
            <div class="recent-hero-row">
                <img src="${esc(hero.icon || '')}" alt="${esc(hero.name || '')}" loading="lazy">
                <div class="recent-hero-name">
                    <b>${esc(hero.name || 'Неизвестно')}</b>
                    <small>${num(hero.games)} игр</small>
                </div>
                <div class="recent-hero-results">
                    <span class="won">W ${num(hero.wins)}</span>
                    <span class="lost">L ${num(hero.losses)}</span>
                    <div class="recent-result-dots">${results}</div>
                </div>
                <div class="recent-hero-winrate">${num(hero.winrate)}%</div>
            </div>
        `;
    }).join('') || '<p>За последние 30 дней рейтинговых матчей пока нет.</p>';
}

function render(data) {
    const matches = (data.matches || []).slice(0, 20);
    const rawMmr = data.mmr ?? data.profile?.mmr;
    const currentMmr = rawMmr == null || rawMmr === '' ? null : Number(rawMmr);
    const validMmr = currentMmr != null && Number.isFinite(currentMmr);

    const wins = matches.filter(match => match.win === true).length;
    const losses = matches.filter(match => match.win === false).length;
    const decidedMatches = wins + losses;

    if ($('nickname')) $('nickname').textContent = data.profile?.personaname || 'Faukree';
    if ($('mmr')) $('mmr').textContent = validMmr ? num(currentMmr) : '—';

    renderMedal(validMmr ? currentMmr : null);

    if ($('mmrDelta')) {
        $('mmrDelta').textContent = '';
        $('mmrDelta').className = '';
    }

    if ($('wins')) {
        $('wins').innerHTML = `<span class="wins-letter">W</span><span class="wins-number">${num(wins)}</span>`;
    }

    if ($('losses')) {
        $('losses').innerHTML = `<span class="losses-letter">L</span><span class="losses-number">${num(losses)}</span>`;
    }

    if ($('winrate')) {
        $('winrate').textContent = decidedMatches ? `${Math.round(wins / decidedMatches * 100)}%` : '—';
    }

    if ($('record')) $('record').textContent = `W ${wins} — L ${losses}`;

    renderPerformance(data.performance || {});
    renderMatches(matches);
    renderReviewNotes(matches);
    renderTopHeroes(data);
    renderRecentHeroes(data);

    if ($('updated')) {
        $('updated').textContent = 'Обновлено: ' +
            (data.updated_at ? new Date(data.updated_at).toLocaleString('ru-RU') : '—');
    }
}

async function load() {
    try {
        const response = await fetch(`${DATA_URL}?v=${Date.now()}`);

        if (!response.ok) {
            throw new Error(`Не удалось загрузить stats.json: ${response.status}`);
        }

        const data = await response.json();
        render(data);
    } catch (error) {
        const matchesBody = $('matchesBody');
        const heroGrid = $('heroGrid');
        const recentHeroGrid = $('recentHeroGrid');
        const reviewNotes = $('reviewNotes');

        if (matchesBody) {
            matchesBody.innerHTML = `
                <tr><td colspan="11">
                    Не удалось загрузить данные.
                    Проверь GitHub Pages и файл data/stats.json.
                </td></tr>
            `;
        }

        if (heroGrid) heroGrid.innerHTML = '<p>Не удалось загрузить статистику героев.</p>';
        if (recentHeroGrid) recentHeroGrid.innerHTML = '<p>Не удалось загрузить статистику за 30 дней.</p>';
        if (reviewNotes) reviewNotes.innerHTML = '<p>Не удалось загрузить заметки.</p>';

        console.error(error);
    }
}

load();
setInterval(load, 600000);
