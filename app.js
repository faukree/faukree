
const PLAYER_ID = '924159299';
const MMR_PER_GAME = 25;
const DATA_URL = './data/stats.json';

const $ = id => document.getElementById(id);

let chart;

const fmtDate = t =>
    new Date(t * 1000).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });

const chartDate = t =>
    new Date(t * 1000).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit'
    });

const duration = s =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function num(n) {
    return n == null ? '—' : Number(n).toLocaleString('ru-RU');
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

async function load() {
    try {
        const response = await fetch(DATA_URL + '?v=' + Date.now());

        if (!response.ok) {
            throw Error('stats unavailable');
        }

        const data = await response.json();
        render(data);
    } catch (error) {
        $('matchesBody').innerHTML =
            '<tr><td colspan="9">Не удалось загрузить данные. Проверь GitHub Actions и файл data/stats.json.</td></tr>';

        $('heroGrid').innerHTML =
            '<p>Не удалось загрузить статистику героев.</p>';

        $('recentHeroGrid').innerHTML =
            '<p>Не удалось загрузить статистику за 30 дней.</p>';

        console.error(error);
    }
}

function buildRatingHistory(matches, currentMmr) {
    const chronologicalMatches = matches.slice().reverse();

    const totalChange = matches.reduce(
        (sum, match) => {
            if (match.win === true) return sum + MMR_PER_GAME;
            if (match.win === false) return sum - MMR_PER_GAME;
            return sum;
        },
        0
    );

    let rating = currentMmr - totalChange;

    const history = [{
        x: 'Начало',
        y: rating,
        result: null
    }];

    chronologicalMatches.forEach(match => {
        if (match.win === true) {
            rating += MMR_PER_GAME;
        } else if (match.win === false) {
            rating -= MMR_PER_GAME;
        }

        history.push({
            x: chartDate(match.start_time),
            y: rating,
            result: match.win === true
                ? 'win'
                : match.win === false
                    ? 'loss'
                    : null
        });
    });

    return history;
}

function render(data) {
    const matches = (data.matches || []).slice(0, 20);

    const currentMmr = Number(
        data.mmr ?? data.profile?.mmr ?? 5068
    );

    const wins = matches.filter(match => match.win === true).length;
    const losses = matches.filter(match => match.win === false).length;
    const decidedMatches = wins + losses;

    const netChange = matches.reduce(
        (sum, match) => {
            if (match.win === true) return sum + MMR_PER_GAME;
            if (match.win === false) return sum - MMR_PER_GAME;
            return sum;
        },
        0
    );

    $('nickname').textContent =
        data.profile?.personaname || 'Faukree';

    $('startMmr').textContent = currentMmr.toLocaleString('ru-RU');
    $('mmr').textContent = currentMmr.toLocaleString('ru-RU');

    $('mmrDelta').textContent =
        `${netChange >= 0 ? '+' : ''}${netChange}`;

    $('mmrDelta').className =
        netChange >= 0 ? 'positive' : 'lost';

    $('wins').textContent = wins;
    $('losses').textContent = losses;

    $('winrate').textContent = decidedMatches
        ? Math.round(wins / decidedMatches * 100) + '%'
        : '—';

    $('record').textContent = `${wins}W — ${losses}L`;

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

        const mmrText = match.win === true
            ? '+25'
            : match.win === false
                ? '−25'
                : '—';

        return `
            <tr>
                <td>
                    <div class="hero">
                        <img src="${esc(match.hero_icon || '')}" alt="">
                        <span>${esc(match.hero_name || 'Неизвестно')}</span>
                    </div>
                </td>
                <td class="${resultClass}">
                    ${resultText}
                </td>
                <td>${num(match.kills)}/${num(match.deaths)}/${num(match.assists)}</td>
                <td>${num(match.hero_damage)}</td>
                <td>${num(
                    match.xp_per_min != null
                        ? match.xp_per_min * Math.round(match.duration / 60)
                        : match.total_xp
                )}</td>
                <td>${num(
                    match.gold_per_min != null
                        ? match.gold_per_min * Math.round(match.duration / 60)
                        : match.gold
                )}</td>
                <td>${duration(match.duration || 0)}</td>
                <td>${fmtDate(match.start_time)}</td>
                <td class="${resultClass}">
                    ${mmrText}
                </td>
            </tr>
        `;
    }).join('') || `
        <tr>
            <td colspan="9">Пока нет матчей в выгрузке.</td>
        </tr>
    `;

    // График MMR.
    const history = buildRatingHistory(matches, currentMmr);

    if (chart) {
        chart.destroy();
    }

    const chartElement = $('chart');

    chart = new Chart(chartElement, {
        type: 'line',

        data: {
            labels: history.map(point => point.x),

            datasets: [{
                label: 'MMR',
                data: history.map(point => point.y),

                borderWidth: 3,
                tension: 0.25,
                fill: false,

                segment: {
                    borderColor: context => {
                        const from = context.p0.parsed.y;
                        const to = context.p1.parsed.y;

                        return to >= from
                            ? '#39c98a'
                            : '#ef5350';
                    }
                },

                pointRadius: history.map((point, index) =>
                    index === 0 || index === history.length - 1 ? 5 : 3
                ),

                pointHoverRadius: 6,

                pointBackgroundColor: history.map(point => {
                    if (point.result === 'win') return '#39c98a';
                    if (point.result === 'loss') return '#ef5350';

                    return '#e5b85c';
                }),

                pointBorderColor: '#171c24',
                pointBorderWidth: 2
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                intersect: false,
                mode: 'index'
            },

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        title: items => {
                            const index = items[0].dataIndex;

                            if (index === 0) {
                                return 'Начало истории';
                            }

                            const match = history[index];

                            if (!match.result) {
                                return match.x;
                            }

                            const result = match.result === 'win'
                                ? 'Победа'
                                : 'Поражение';

                            return `${match.x} · ${result}`;
                        },

                        label: item =>
                            `Рейтинг: ${item.parsed.y} MMR`
                    }
                }
            },

            scales: {
                x: {
                    ticks: {
                        color: '#7f8a9a',
                        maxTicksLimit: 8,
                        maxRotation: 0
                    },

                    grid: {
                        display: false
                    }
                },

                y: {
                    ticks: {
                        color: '#7f8a9a',
                        callback: value => `${value} MMR`
                    },

                    grid: {
                        color: '#202733'
                    }
                }
            }
        }
    });

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

    $('heroGrid').innerHTML = heroes.map(hero => `
        <div class="herocard">
            <img src="${esc(hero.icon || '')}" alt="">

            <div>
                <b>${esc(hero.name)}</b>

                <small>
                    ${num(hero.games)} игр · ${num(hero.winrate)}% WR · KDA ${esc(hero.kda ?? '—')}
                </small>
            </div>
        </div>
    `).join('') || `
        <p>Статистика героев появится после обработки матчей.</p>
    `;

    // Герои за последние 30 календарных дней.
    const recentHeroes = (data.recent_heroes_30d || [])
        .slice()
        .sort((a, b) => {
            if (b.games !== a.games) {
                return b.games - a.games;
            }

            return b.winrate - a.winrate;
        });

    $('recentHeroGrid').innerHTML = recentHeroes.map(hero => `
        <div class="recent-hero-row">
            <img src="${esc(hero.icon || '')}" alt="">

            <div class="recent-hero-name">
                <b>${esc(hero.name)}</b>
                <small>${num(hero.games)} игр</small>
            </div>

            <div class="recent-hero-results">
                <span class="won">${num(hero.wins)}W</span>
                <span class="lost">${num(hero.losses)}L</span>
            </div>

            <div class="recent-hero-winrate">
                ${num(hero.winrate)}%
            </div>
        </div>
    `).join('') || `
        <p>За последние 30 дней Ranked-матчей пока нет.</p>
    `;

    $('updated').textContent =
        'Обновлено: ' +
        (data.updated_at
            ? new Date(data.updated_at).toLocaleString('ru-RU')
            : '—');
}

load();

setInterval(load, 600000);
