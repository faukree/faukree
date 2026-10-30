
const PLAYER_ID = '924159299';
const DATA_URL = './data/stats.json';

const $ = id => document.getElementById(id);

const fmtDate = t =>
    new Date(t * 1000).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });

const duration = s =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function num(n) {
    return n == null
        ? '—'
        : Number(n).toLocaleString('ru-RU');
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

function formatMmrChange(value) {
    const n = Number(value ?? 0);

    if (n > 0) return `+${n}`;
    if (n < 0) return `−${Math.abs(n)}`;

    return '0';
}

function renderPerformance(performance = {}) {
    const mmr7d = $('mmr7d');
    const mmr30d = $('mmr30d');
    const streak = $('streak');

    if (mmr7d) {
        const value = Number(performance.mmr_change_7d ?? 0);
        mmr7d.textContent = formatMmrChange(value);
        mmr7d.className = value > 0
            ? 'positive'
            : value < 0
                ? 'lost'
                : '';
    }

    if (mmr30d) {
        const value = Number(performance.mmr_change_30d ?? 0);
        mmr30d.textContent = formatMmrChange(value);
        mmr30d.className = value > 0
            ? 'positive'
            : value < 0
                ? 'lost'
                : '';
    }

    if (streak) {
        const count = Number(performance.streak_count ?? 0);
        const type = performance.streak_type;

        if (count > 0 && type === 'win') {
            const word = count === 1
                ? 'победа'
                : count < 5
                    ? 'победы'
                    : 'побед';

            streak.textContent = `${count} ${word} подряд`;
            streak.className = 'positive';
        } else if (count > 0 && type === 'loss') {
            const word = count === 1
                ? 'поражение'
                : count < 5
                    ? 'поражения'
                    : 'поражений';

            streak.textContent = `${count} ${word} подряд`;
            streak.className = 'lost';
        } else {
            streak.textContent = '—';
            streak.className = '';
        }
    }
}

function renderItems(items = []) {
    if (!items.length) {
        return '<span class="match-no-items">—</span>';
    }

    return `
        <div class="match-items">
            ${items.map(item => `
                <img
                    src="${esc(item.icon || '')}"
                    alt="${esc(item.name || 'Предмет')}"
                    title="${esc(item.name || 'Предмет')}"
                    loading="lazy"
                >
            `).join('')}
        </div>
    `;
}

function renderRating(rating) {
    if (rating == null || !Number.isFinite(Number(rating))) {
        return '—';
    }

    const value = Number(rating);
    const ratingClass = value >= 7
        ? 'rating-high'
        : value >= 5
            ? 'rating-mid'
            : 'rating-low';

    return `
        <span class="match-rating ${ratingClass}">
            ${value.toLocaleString('ru-RU', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            }}/10
        </span>
    `;
}

function renderReviewNotes(matches) {
    const reviewBlock = $('reviewNotes');

    if (!reviewBlock) {
        return;
    }

    const notes = [];

    matches.forEach(match => {
        (match.review_notes || []).forEach(note => {
            if (note && !notes.includes(note)) {
                notes.push(note);
            }
        });
    });

    reviewBlock.innerHTML = notes.length
        ? `
            <ul class="review-notes-list">
                ${notes.slice(0, 5).map(note => `
                    <li>${esc(note)}</li>
                `).join('')}
            </ul>
        `
        : '<p>Пока нет заметок по матчам.</p>';
}

async function load() {
    try {
        const response = await fetch(
            DATA_URL + '?v=' + Date.now()
        );

        if (!response.ok) {
            throw Error('stats unavailable');
        }

        const data = await response.json();
        render(data);
    } catch (error) {
        const matchesBody = $('matchesBody');
        const heroGrid = $('heroGrid');
        const recentHeroGrid = $('recentHeroGrid');

        if (matchesBody) {
            matchesBody.innerHTML = `
                <tr>
                    <td colspan="11">
                        Не удалось загрузить данные.
                        Проверь GitHub Actions и файл data/stats.json.
                    </td>
                </tr>
            `;
        }

        if (heroGrid) {
            heroGrid.innerHTML =
                '<p>Не удалось загрузить статистику героев.</p>';
        }

        if (recentHeroGrid) {
            recentHeroGrid.innerHTML =
                '<p>Не удалось загрузить статистику за 30 дней.</p>';
        }

        console.error(error);
    }
}

function render(data) {
    const matches = (data.matches || []).slice(0, 20);

    const currentMmr = Number(
        data.mmr ?? data.profile?.mmr ?? 5043
    );

    const wins = matches.filter(
        match => match.win === true
    ).length;

    const losses = matches.filter(
        match => match.win === false
    ).length;

    const decidedMatches = wins + losses;

    const netChange = matches.reduce((sum, match) => {
        if (match.win === true) return sum + 25;
        if (match.win === false) return sum - 25;
        return sum;
    }, 0);

    if ($('nickname')) {
        $('nickname').textContent =
            data.profile?.personaname || 'Faukree';
    }

    if ($('startMmr')) {
        $('startMmr').textContent =
            currentMmr.toLocaleString('ru-RU');
    }

    if ($('mmr')) {
        $('mmr').textContent =
            currentMmr.toLocaleString('ru-RU');
    }

    if ($('mmrDelta')) {
        $('mmrDelta').textContent =
            `${netChange >= 0 ? '+' : ''}${netChange}`;

        $('mmrDelta').className =
            netChange >= 0 ? 'positive' : 'lost';
    }

    if ($('wins')) $('wins').textContent = wins;
    if ($('losses')) $('losses').textContent = losses;

    if ($('winrate')) {
        $('winrate').textContent = decidedMatches
            ? Math.round(wins / decidedMatches * 100) + '%'
            : '—';
    }

    if ($('record')) {
        $('record').textContent = `${wins}W — ${losses}L`;
    }

    renderPerformance(data.performance);

    // Последние матчи: предметы, показатели в минуту,
    // оценка игры и MMR после матча.
    if ($('matchesBody')) {
        $('matchesBody').innerHTML = matches.map(match => {
            const resultClass = match.win === true
                ? 'won'
                : match.win === false
                    ? 'lost'
                    : '';

            const resultText = match.win === true
                ? 'ПОБЕДА'
                : match.win === false
                    ? 'ПОРАЖЕНИЕ'
                    : '—';

            const mmrAfter = match.mmr_after;

            return `
                <tr>
                    <td>
                        <div class="hero">
                            <img
                                src="${esc(match.hero_icon || '')}"
                                alt=""
                                loading="lazy"
                            >
                            <span>
                                ${esc(match.hero_name || 'Неизвестно')}
                            </span>
                        </div>
                    </td>

                    <td class="${resultClass}">
                        ${resultText}
                    </td>

                    <td>
                        ${num(match.kills)}/${num(match.deaths)}/${num(match.assists)}
                    </td>

                    <td>
                        ${renderItems(match.items || [])}
                    </td>

                    <td>
                        ${num(match.damage_per_min)}
                    </td>

                    <td>
                        ${num(match.xp_per_min)}
                    </td>

                    <td>
                        ${num(match.gold_per_min)}
                    </td>

                    <td>
                        ${renderRating(match.rating)}
                    </td>

                    <td>
                        ${mmrAfter == null ? '—' : num(mmrAfter)}
                    </td>

                    <td>
                        ${duration(match.duration || 0)}
                    </td>

                    <td>
                        ${fmtDate(match.start_time)}
                    </td>
                </tr>
            `;
        }).join('') || `
            <tr>
                <td colspan="11">
                    Пока нет матчей в выгрузке.
                </td>
            </tr>
        `;
    }

    // Заметки по возможным улучшениям.
    renderReviewNotes(matches);

    // Топ-15 героев по винрейту.
    const heroes = (data.top_heroes || [])
        .slice()
        .sort((a, b) => {
            if (b.winrate !== a.winrate) {
                return b.winrate - a.winrate;
            }

            return b.games - a.games;
        })
        .slice(0, 15);

    if ($('heroGrid')) {
        $('heroGrid').innerHTML = heroes.map(hero => `
            <div class="herocard">
                <img src="${esc(hero.icon || '')}" alt="">

                <div>
                    <b>${esc(hero.name)}</b>

                    <small>
                        ${num(hero.games)} игр ·
                        ${num(hero.winrate)}% WR ·
                        KDA ${esc(hero.kda ?? '—')}
                    </small>
                </div>
            </div>
        `).join('') || `
            <p>
                Статистика героев появится после обработки матчей.
            </p>
        `;
    }

    // Герои за последние 30 календарных дней.
    const recentHeroes = (data.recent_heroes_30d || [])
        .slice()
        .sort((a, b) => {
            if (b.wins !== a.wins) {
                return b.wins - a.wins;
            }

            if (b.winrate !== a.winrate) {
                return b.winrate - a.winrate;
            }

            return a.games - b.games;
        });

    if ($('recentHeroGrid')) {
        $('recentHeroGrid').innerHTML = recentHeroes.map(hero => {
            const results = (hero.recent_results || [])
                .slice(-5)
                .map(result => `
                    <span
                        class="recent-result-dot ${result.win ? 'won' : 'lost'}"
                        title="${result.win ? 'Победа' : 'Поражение'}"
                    ></span>
                `)
                .join('');

            return `
                <div class="recent-hero-row">
                    <img src="${esc(hero.icon || '')}" alt="">

                    <div class="recent-hero-name">
                        <b>${esc(hero.name)}</b>
                        <small>${num(hero.games)} игр</small>
                    </div>

                    <div class="recent-hero-results">
                        <span class="won">${num(hero.wins)}W</span>
                        <span class="lost">${num(hero.losses)}L</span>

                        <div class="recent-result-dots">
                            ${results}
                        </div>
                    </div>

                    <div class="recent-hero-winrate">
                        ${num(hero.winrate)}%
                    </div>
                </div>
            `;
        }).join('') || `
            <p>
                За последние 30 дней Ranked-матчей пока нет.
            </p>
        `;
    }

    if ($('updated')) {
        $('updated').textContent =
            'Обновлено: ' +
            (data.updated_at
                ? new Date(data.updated_at).toLocaleString('ru-RU')
                : '—');
    }
}

load();

setInterval(load, 600000);
