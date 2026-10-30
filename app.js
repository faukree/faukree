
const PLAYER_ID = '924159299';
const DATA_URL = './data/stats.json';
const MMR_PER_MATCH = 25;

// Пути к изображениям медалей.
// Изображения добавим в папку assets/medals.
const MEDAL_PATH = './assets/medals/';

const $ = id => document.getElementById(id);

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
    if (value == null || !Number.isFinite(Number(value))) {
        return '—';
    }

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

// Определяем медаль по оценочному MMR.
function getMedal(mmr) {
    const value = Number(mmr);

    if (!Number.isFinite(value) || value < 0) {
        return null;
    }

    const ranks = [
        {
            name: 'Рекрут',
            file: 'recruit',
            thresholds: [0, 154, 308, 462, 616]
        },
        {
            name: 'Страж',
            file: 'guardian',
            thresholds: [770, 924, 1078, 1232, 1386]
        },
        {
            name: 'Рыцарь',
            file: 'crusader',
            thresholds: [1540, 1694, 1848, 2002, 2156]
        },
        {
            name: 'Герой',
            file: 'archon',
            thresholds: [2310, 2464, 2618, 2772, 2926]
        },
        {
            name: 'Легенда',
            file: 'legend',
            thresholds: [3080, 3234, 3388, 3542, 3696]
        },
        {
            name: 'Властелин',
            file: 'ancient',
            thresholds: [3850, 4004, 4158, 4312, 4466]
        },
        {
            name: 'Божество',
            file: 'divine',
            thresholds: [4620, 4820, 5020, 5220, 5420]
        }
    ];

    if (value >= 5640) {
        return {
            name: 'Титан',
            file: 'immortal',
            stars: 0,
            title: 'Титан',
            image: `${MEDAL_PATH}immortal.png`
        };
    }

    let currentRank = null;

    for (const rank of ranks) {
        if (value >= rank.thresholds[0]) {
            currentRank = rank;
        }
    }

    if (!currentRank) {
        return null;
    }

    let stars = 1;

    currentRank.thresholds.forEach((threshold, index) => {
        if (value >= threshold) {
            stars = index + 1;
        }
    });

    return {
        name: currentRank.name,
        file: currentRank.file,
        stars,
        title: `${currentRank.name} ${stars}`,
        image: `${MEDAL_PATH}${currentRank.file}_${stars}.png`
    };
}

// Показываем соответствующую медаль на сайте.
function renderMedal(mmr) {
    const medalImage = $('medalImage');
    const medalName = $('medalName');
    const medalStars = $('medalStars');

    if (!medalImage || !medalName || !medalStars) {
        return;
    }

    const medal = getMedal(mmr);

    if (!medal) {
        medalImage.style.display = 'none';
        medalName.textContent = 'Ранг неизвестен';
        medalStars.textContent = '';
        return;
    }

    medalImage.src = medal.image;
    medalImage.alt = medal.title;
    medalImage.title = medal.title;
    medalImage.style.display = 'block';

    medalImage.onerror = () => {
        medalImage.style.display = 'none';
    };

    medalName.textContent = medal.name;

    medalStars.textContent = medal.stars
        ? `${'★'.repeat(medal.stars)}`
        : 'Бессмертный';
}

function renderPerformance(performance = {}) {
    const mmr7d = $('mmr7d');
    const mmr30d = $('mmr30d');

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
}

function renderItems(items = []) {
    const validItems = items.filter(item => item && (item.icon || item.name));

    if (!validItems.length) {
        return '<span class="match-no-items">—</span>';
    }

    return `
        <div class="match-items">
            ${validItems.map(item => {
                const name = esc(item.name || 'Предмет');
                const icon = esc(item.icon || '');

                if (!icon) {
                    return `<span class="item-name" title="${name}">${name}</span>`;
                }

                return `
                    <img
                        src="${icon}"
                        alt="${name}"
                        title="${name}"
                        loading="lazy"
                        onerror="this.style.display='none'"
                    >
                `;
            }).join('')}
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

function renderMatches(matches = []) {
    const matchesBody = $('matchesBody');

    if (!matchesBody) return;

    if (!matches.length) {
        matchesBody.innerHTML = `
            <tr>
                <td colspan="11">Пока нет матчей в выгрузке.</td>
            </tr>
        `;
        return;
    }

    matchesBody.innerHTML = matches.map(match => {
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

        return `
            <tr>
                <td>
                    <div class="hero">
                        <img
                            src="${esc(match.hero_icon || '')}"
                            alt=""
                            loading="lazy"
                        >
                        <span>${esc(match.hero_name || 'Неизвестно')}</span>
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

                <td>${num(match.hero_damage)}</td>
                <td>${num(match.xp_per_min)}</td>
                <td>${num(match.gold_per_min)}</td>

                <td>
                    ${renderRating(match.rating)}
                </td>

                <td>
                    ${match.mmr_after == null ? '—' : num(match.mmr_after)}
                </td>

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
        .sort((a, b) => {
            if (Number(b.winrate) !== Number(a.winrate)) {
                return Number(b.winrate) - Number(a.winrate);
            }

            return Number(b.games) - Number(a.games);
        })
        .slice(0, 15);

    heroGrid.innerHTML = heroes.map(hero => `
        <div class="herocard">
            <img
                src="${esc(hero.icon || '')}"
                alt="${esc(hero.name || '')}"
                loading="lazy"
            >

            <div>
                <b>${esc(hero.name || 'Неизвестно')}</b>

                <small>
                    ${num(hero.games)} игр ·
                    ${num(hero.winrate)}% побед ·
                    KDA ${esc(hero.kda ?? '—')}
                </small>
            </div>
        </div>
    `).join('') || `
        <p>Статистика героев появится после обработки матчей.</p>
    `;
}

function renderRecentHeroes(data) {
    const recentHeroGrid = $('recentHeroGrid');

    if (!recentHeroGrid) return;

    const heroes = (data.recent_heroes_30d || [])
        .slice()
        .sort((a, b) => {
            if (Number(b.wins) !== Number(a.wins)) {
                return Number(b.wins) - Number(a.wins);
            }

            if (Number(b.winrate) !== Number(a.winrate)) {
                return Number(b.winrate) - Number(a.winrate);
            }

            return Number(a.games) - Number(b.games);
        });

    recentHeroGrid.innerHTML = heroes.map(hero => {
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
                <img
                    src="${esc(hero.icon || '')}"
                    alt="${esc(hero.name || '')}"
                    loading="lazy"
                >

                <div class="recent-hero-name">
                    <b>${esc(hero.name || 'Неизвестно')}</b>
                    <small>${num(hero.games)} игр</small>
                </div>

                <div class="recent-hero-results">
                    <span class="won">W ${num(hero.wins)}</span>
                    <span class="lost">L ${num(hero.losses)}</span>

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
        <p>За последние 30 дней рейтинговых матчей пока нет.</p>
    `;
}

function render(data) {
    const matches = (data.matches || []).slice(0, 20);

    const rawMmr = data.mmr ?? data.profile?.mmr;
    const currentMmr = rawMmr == null ? null : Number(rawMmr);

    const validMmr = currentMmr != null && Number.isFinite(currentMmr);

    const wins = matches.filter(match => match.win === true).length;
    const losses = matches.filter(match => match.win === false).length;
    const decidedMatches = wins + losses;

    if ($('nickname')) {
        $('nickname').textContent =
            data.profile?.personaname || 'Faukree';
    }

    if ($('mmr')) {
        $('mmr').textContent = validMmr
            ? num(currentMmr)
            : '—';
    }

    renderMedal(validMmr ? currentMmr : null);

    if ($('mmrDelta')) {
        $('mmrDelta').textContent = '';
        $('mmrDelta').className = '';
    }

    if ($('wins')) {
        $('wins').innerHTML = `
            <span class="wins-letter">W</span>
            <span class="wins-number">${num(wins)}</span>
        `;
    }

    if ($('losses')) {
        $('losses').innerHTML = `
            <span class="losses-letter">L</span>
            <span class="losses-number">${num(losses)}</span>
        `;
    }

    if ($('winrate')) {
        $('winrate').textContent = decidedMatches
            ? `${Math.round(wins / decidedMatches * 100)}%`
            : '—';
    }

    if ($('record')) {
        $('record').textContent = `W ${wins} — L ${losses}`;
    }

    renderPerformance(data.performance || {});
    renderMatches(matches);
    renderReviewNotes(matches);
    renderTopHeroes(data);
    renderRecentHeroes(data);

    if ($('updated')) {
        $('updated').textContent =
            'Обновлено: ' +
            (data.updated_at
                ? new Date(data.updated_at).toLocaleString('ru-RU')
                : '—');
    }
}

async function load() {
    try {
        const response = await fetch(
            `${DATA_URL}?v=${Date.now()}`
        );

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
                <tr>
                    <td colspan="11">
                        Не удалось загрузить данные.
                        Проверь GitHub Pages и файл data/stats.json.
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

        if (reviewNotes) {
            reviewNotes.innerHTML =
                '<p>Не удалось загрузить заметки.</p>';
        }

        console.error(error);
    }
}

load();

setInterval(load, 600000);
