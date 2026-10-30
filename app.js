
const PLAYER_ID = '924159299';
const INITIAL_MMR = 5068;
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
    }
}

function buildRatingHistory(matches) {
    /*
     * OpenDota возвращает матчи от новых к старым.
     *
     * INITIAL_MMR — рейтинг после самого свежего матча.
     * Сначала восстанавливаем рейтинг до самого старого матча,
     * затем проходим историю от старого матча к новому.
     */

    const chronologicalMatches = matches.slice().reverse();

    const totalChange = matches.reduce(
        (sum, match) => sum + (match.win ? MMR_PER_GAME : -MMR_PER_GAME),
        0
    );

    let rating = INITIAL_MMR - totalChange;

    const history = [{
        x: 'Начало',
        y: rating,
        result: null
    }];

    chronologicalMatches.forEach(match => {
        rating += match.win ? MMR_PER_GAME : -MMR_PER_GAME;

        history.push({
            x: chartDate(match.start_time),
            y: rating,
            result: match.win ? 'win' : 'loss'
        });
    });

    return history;
}

function render(data) {
    const matches = (data.matches || []).slice(0, 20);

    const wins = matches.filter(match => match.win).length;
    const losses = matches.length - wins;

    const netChange = matches.reduce(
        (sum, match) => sum + (match.win ? MMR_PER_GAME : -MMR_PER_GAME),
        0
    );

    $('nickname').textContent =
        data.profile?.personaname || 'Faukree';

    // Always display the user's actual current MMR.
    $('startMmr').textContent = INITIAL_MMR;
    $('mmr').textContent = INITIAL_MMR.toLocaleString('ru-RU');

    // This shows the change over recent matches, not an estimated MMR.
    $('mmrDelta').textContent =
        `${netChange >= 0 ? '+' : ''}${netChange} за ${matches.length} игр`;

    $('mmrDelta').className =
        netChange >= 0 ? 'positive' : 'lost';

    $('wins').textContent = wins;
    $('losses').textContent = losses;

    $('winrate').textContent = matches.length
        ? Math.round(wins / matches.length * 100) + '%'
        : '—';

    $('record').textContent = `${wins}W — ${losses}L`;

    // Recent matches table.
    $('matchesBody').innerHTML = matches.map(match => `
        <tr>
            <td>
                <div class="hero">
                    <img src="${match.hero_icon || ''}" alt="">
                    <span>${esc(match.hero_name || 'Неизвестно')}</span>
                </div>
            </td>
            <td class="${match.win ? 'won' : 'lost'}">
                ${match.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
            </td>
            <td>${match.kills}/${match.deaths}/${match.assists}</td>
            <td>${num(match.hero_damage)}</td>
            <td>${num(
                match.xp_per_min
                    ? match.xp_per_min * Math.round(match.duration / 60)
                    : match.total_xp
            )}</td>
            <td>${num(
                match.gold_per_min
                    ? match.gold_per_min * Math.round(match.duration / 60)
                    : match.gold
            )}</td>
            <td>${duration(match.duration || 0)}</td>
            <td>${fmtDate(match.start_time)}</td>
            <td class="${match.win ? 'won' : 'lost'}">
                ${match.win ? '+25' : '−25'}
            </td>
        </tr>
    `).join('') || `
        <tr>
            <td colspan="9">Пока нет матчей в выгрузке.</td>
        </tr>
    `;

    // Rating history chart.
    const history = buildRatingHistory(matches);

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

                // Green segments for wins, red segments for losses.
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

    // Top heroes.
    // Prefer the adjusted score generated by update_data.py.
    // The fallback is for older stats.json files.
    const heroes = (data.top_heroes || [])
        .slice()
        .sort((a, b) => {
            const scoreA = a.score ?? a.winrate;
            const scoreB = b.score ?? b.winrate;

            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }

            return b.games - a.games;
        })
        .slice(0, 15);

    $('heroGrid').innerHTML = heroes.map(hero => `
        <div class="herocard">
            <img src="${hero.icon || ''}" alt="">

            <div>
                <b>${esc(hero.name)}</b>

                <small>
                    ${hero.games} игр · ${hero.winrate}% WR · KDA ${hero.kda}
                </small>
            </div>
        </div>
    `).join('') || `
        <p>Статистика героев появится после обработки матчей.</p>
    `;

    $('updated').textContent =
        'Обновлено: ' +
        (data.updated_at
            ? new Date(data.updated_at).toLocaleString('ru-RU')
            : '—');
}

load();

// Refresh data every 10 minutes.
setInterval(load, 600000);
