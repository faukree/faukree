
import json
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

PLAYER_ID = "924159299"
BASE = "https://api.opendota.com/api"
OUT = Path("data/stats.json")

START_MMR = 5043
MMR_PER_MATCH = 25
RANKED_LOBBY = 7
MATCH_HISTORY_LIMIT = 100
DISPLAY_MATCHES = 20
MAX_SAVED_MATCH_IDS = 5000
RECENT_DAYS = 30
RECENT_RESULTS_LIMIT = 5

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Faukree-Dota-Tracker/1.0"})


def get(path, params=None):
    response = SESSION.get(BASE + path, params=params, timeout=35)
    response.raise_for_status()
    return response.json()


def hero_icon(hero):
    name = hero.get("name", "").replace("npc_dota_hero_", "")
    return (
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/"
        f"dota_react/heroes/{name}.png"
    )


def item_icon(item):
    name = item.get("name", "").replace("item_", "")
    if not name:
        return ""

    return (
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/"
        f"dota_react/items/{name}.png"
    )


def hero_score(games, wins):
    if games <= 0:
        return 50.0

    winrate = wins / games * 100
    confidence = games / (games + 20)

    return 50 + (winrate - 50) * confidence


def match_won(match):
    radiant_win = match.get("radiant_win")
    player_slot = match.get("player_slot")

    if radiant_win is None or player_slot is None:
        return None

    return bool(radiant_win) == (int(player_slot) < 128)


def calculate_performance(matches):
    """Рассчитывает изменения MMR и текущую серию по Ranked-матчам."""

    now = datetime.now(timezone.utc)
    cutoff_7d = int((now - timedelta(days=7)).timestamp())
    cutoff_30d = int((now - timedelta(days=30)).timestamp())

    mmr_change_7d = 0
    mmr_change_30d = 0

    ordered_matches = sorted(
        matches,
        key=lambda match: int(match.get("start_time", 0)),
        reverse=True,
    )

    streak_type = None
    streak_count = 0

    for match in ordered_matches:
        start_time = int(match.get("start_time", 0))
        result = match_won(match)

        if result is None:
            continue

        change = MMR_PER_MATCH if result else -MMR_PER_MATCH

        if start_time >= cutoff_7d:
            mmr_change_7d += change

        if start_time >= cutoff_30d:
            mmr_change_30d += change

        if streak_type is None:
            streak_type = "win" if result else "loss"
            streak_count = 1
        elif (streak_type == "win" and result) or (
            streak_type == "loss" and not result
        ):
            streak_count += 1
        else:
            break

    return {
        "mmr_change_7d": mmr_change_7d,
        "mmr_change_30d": mmr_change_30d,
        "streak_type": streak_type,
        "streak_count": streak_count,
    }


def calculate_match_rating(match):
    """
    Примерная оценка личной статистики от 1 до 10.
    Это не официальный рейтинг OpenDota или Valve.
    """

    kills = int(match.get("kills") or 0)
    deaths = int(match.get("deaths") or 0)
    assists = int(match.get("assists") or 0)
    gpm = float(match.get("gold_per_min") or 0)
    xpm = float(match.get("xp_per_min") or 0)
    hero_damage = float(match.get("hero_damage") or 0)
    duration_minutes = max(float(match.get("duration") or 0) / 60, 1)

    damage_per_min = hero_damage / duration_minutes
    kda = (kills + assists) / max(deaths, 1)

    # Базовая оценка — 5.5.
    # Показатели постепенно изменяют её, без чрезмерного веса одного фактора.
    score = 5.5

    score += min(kda - 1.5, 3) * 0.55
    score += min(gpm - 400, 300) / 300 * 0.8
    score += min(xpm - 400, 300) / 300 * 0.6
    score += min(damage_per_min - 300, 700) / 700 * 0.7

    score -= max(deaths - 5, 0) * 0.25

    if match.get("win") is True:
        score += 0.5
    elif match.get("win") is False:
        score -= 0.3

    score = max(1, min(10, score))

    return round(score, 1)


def make_review_notes(match):
    """Формирует осторожные подсказки на основе статистики матча."""

    notes = []

    deaths = int(match.get("deaths") or 0)
    kills = int(match.get("kills") or 0)
    assists = int(match.get("assists") or 0)
    gpm = float(match.get("gold_per_min") or 0)
    xpm = float(match.get("xp_per_min") or 0)
    duration_minutes = max(float(match.get("duration") or 0) / 60, 1)

    hero_damage = float(match.get("hero_damage") or 0)
    damage_per_min = hero_damage / duration_minutes

    if deaths >= 10:
        notes.append(
            "Много смертей. Стоит проверить позиционирование "
            "и опасные перемещения по карте."
        )
    elif deaths >= 7:
        notes.append(
            "Смертей довольно много. Можно обратить внимание "
            "на моменты перед проигранными драками."
        )

    if kills + assists <= 5 and duration_minutes >= 25:
        notes.append(
            "Низкое участие в убийствах. Возможно, стоит чаще "
            "подключаться к командным действиям."
        )

    if gpm and gpm < 350:
        notes.append(
            "Низкий GPM. Проверь фарм, свободные линии "
            "и сбор ресурсов между драками."
        )

    if xpm and xpm < 350:
        notes.append(
            "Низкий XPM. Возможно, часть времени теряется "
            "без получения опыта."
        )

    if damage_per_min and damage_per_min < 250:
        notes.append(
            "Невысокий урон по героям в минуту. Это может зависеть "
            "от роли и хода матча."
        )

    if not notes:
        notes.append(
            "Явных сигналов по базовым показателям нет. "
            "Для более точного разбора нужны данные о карте, "
            "предметах и ключевых моментах."
        )

    return notes[:3]


def get_final_items(player, item_constants):
    """Возвращает предметы из основных слотов инвентаря в конце матча."""

    items = []

    for slot in range(6):
        item_id = int(player.get(f"item_{slot}") or 0)

        if item_id <= 0:
            continue

        item = item_constants.get(item_id, {})

        items.append(
            {
                "id": item_id,
                "name": item.get("localized_name", "Предмет"),
                "icon": item_icon(item),
            }
        )

    return items


def main():
    old_data = {}

    if OUT.exists():
        try:
            old_data = json.loads(OUT.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            old_data = {}

    profile_data = get(f"/players/{PLAYER_ID}")

    # Только Ranked-матчи.
    matches = get(
        f"/players/{PLAYER_ID}/matches",
        {
            "limit": MATCH_HISTORY_LIMIT,
            "lobby_type": RANKED_LOBBY,
        },
    )

    heroes = get("/constants/heroes")
    hero_by_id = {int(key): value for key, value in heroes.items()}

    # Справочник предметов для названий и иконок.
    try:
        item_data = get("/constants/items")
        item_by_id = {
            int(item.get("id", 0)): item
            for item in item_data.values()
            if item.get("id") is not None
        }
    except Exception as exc:
        print(f"Could not fetch item constants: {exc}")
        item_by_id = {}

    saved_ids = old_data.get("processed_match_ids")

    if saved_ids is None:
        # Однократная инициализация:
        # старые матчи отмечаются обработанными и не меняют MMR повторно.
        mmr = int(old_data.get("mmr", START_MMR))

        processed_ids = {
            str(match["match_id"])
            for match in matches
            if match.get("match_id") is not None
        }

        print(
            f"Initial MMR set to {mmr}. "
            "Existing Ranked matches marked as processed."
        )

    else:
        mmr = int(old_data.get("mmr", START_MMR))
        processed_ids = {str(match_id) for match_id in saved_ids}

        new_matches = [
            match
            for match in matches
            if match.get("match_id") is not None
            and str(match["match_id"]) not in processed_ids
        ]

        new_matches.sort(key=lambda match: match.get("start_time", 0))

        for match in new_matches:
            result = match_won(match)

            if result is None:
                print(
                    f"Could not determine result for match "
                    f"{match.get('match_id')}. Will retry later."
                )
                continue

            if result:
                mmr += MMR_PER_MATCH
                print(f"Ranked win: +{MMR_PER_MATCH} MMR")
            else:
                mmr -= MMR_PER_MATCH
                print(f"Ranked loss: -{MMR_PER_MATCH} MMR")

            processed_ids.add(str(match["match_id"]))

    processed_ids = set(
        sorted(processed_ids, key=int)[-MAX_SAVED_MATCH_IDS:]
    )

    # Подробности последних 20 Ranked-матчей.
    enriched = []

    for match in matches[:DISPLAY_MATCHES]:
        match_id = match["match_id"]

        try:
            detail = get(f"/matches/{match_id}")
            players = detail.get("players", [])

            me = next(
                (
                    player
                    for player in players
                    if str(player.get("account_id")) == PLAYER_ID
                ),
                None,
            )

            if me is None:
                me = next(
                    (
                        player
                        for player in players
                        if player.get("player_slot")
                        == match.get("player_slot")
                    ),
                    {},
                )

            hero_id = me.get("hero_id", match.get("hero_id"))
            hero = hero_by_id.get(int(hero_id or 0), {})

            radiant_win = detail.get("radiant_win")
            slot = me.get("player_slot", match.get("player_slot"))

            if radiant_win is not None and slot is not None:
                win = bool(radiant_win) == (int(slot) < 128)
            else:
                win = match_won(match)

            match_duration = int(
                detail.get("duration", match.get("duration", 0)) or 0
            )
            duration_minutes = max(match_duration / 60, 1)

            hero_damage = me.get("hero_damage")
            xp_per_min = me.get("xp_per_min")
            gold_per_min = me.get("gold_per_min")

            enriched_match = {
                "match_id": match_id,
                "hero_id": hero_id,
                "hero_name": hero.get("localized_name", "Unknown"),
                "hero_icon": hero_icon(hero),
                "win": win,
                "kills": me.get("kills", match.get("kills", 0)),
                "deaths": me.get("deaths", match.get("deaths", 0)),
                "assists": me.get("assists", match.get("assists", 0)),
                "hero_damage": hero_damage,
                "damage_per_min": (
                    round(float(hero_damage) / duration_minutes)
                    if hero_damage is not None
                    else None
                ),
                "total_xp": me.get("total_xp"),
                "xp_per_min": xp_per_min,
                "gold": me.get("gold"),
                "gold_per_min": gold_per_min,
                "duration": match_duration,
                "start_time": detail.get(
                    "start_time",
                    match.get("start_time", int(time.time())),
                ),
                "items": get_final_items(me, item_by_id),
            }

            enriched_match["rating"] = calculate_match_rating(
                enriched_match
            )
            enriched_match["review_notes"] = make_review_notes(
                enriched_match
            )

            enriched.append(enriched_match)

        except Exception as exc:
            print(f"Match {match_id} detail fetch failed: {exc}")

            hero_id = match.get("hero_id")
            hero = hero_by_id.get(int(hero_id or 0), {})

            enriched_match = {
                "match_id": match_id,
                "hero_id": hero_id,
                "hero_name": hero.get("localized_name", "Unknown"),
                "hero_icon": hero_icon(hero),
                "win": match_won(match),
                "kills": match.get("kills", 0),
                "deaths": match.get("deaths", 0),
                "assists": match.get("assists", 0),
                "hero_damage": None,
                "damage_per_min": None,
                "total_xp": None,
                "xp_per_min": None,
                "gold": None,
                "gold_per_min": None,
                "duration": match.get("duration", 0),
                "start_time": match.get(
                    "start_time",
                    int(time.time()),
                ),
                "items": [],
            }

            enriched_match["rating"] = calculate_match_rating(
                enriched_match
            )
            enriched_match["review_notes"] = make_review_notes(
                enriched_match
            )

            enriched.append(enriched_match)

        time.sleep(0.25)

    # Рассчитываем MMR после каждого матча.
    # Начинаем с текущего MMR и идём от самого нового матча к старым.
    rating_after = mmr

    for match in enriched:
        match["mmr_after"] = rating_after

        if match.get("win") is True:
            rating_after -= MMR_PER_MATCH
        elif match.get("win") is False:
            rating_after += MMR_PER_MATCH

    # Статистика героев за последние 30 дней.
    cutoff = int(
        (datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS))
        .timestamp()
    )

    recent_heroes = {}

    for match in matches:
        start_time = int(match.get("start_time", 0))

        if start_time < cutoff:
            continue

        hero_id = int(match.get("hero_id", 0))
        hero = hero_by_id.get(hero_id, {})

        if not hero_id or not hero:
            continue

        result = match_won(match)

        if result is None:
            continue

        if hero_id not in recent_heroes:
            recent_heroes[hero_id] = {
                "hero_id": hero_id,
                "name": hero.get("localized_name", "Unknown"),
                "icon": hero_icon(hero),
                "games": 0,
                "wins": 0,
                "losses": 0,
                "winrate": 0,
                "recent_results": [],
            }

        item = recent_heroes[hero_id]
        item["games"] += 1

        if result:
            item["wins"] += 1
        else:
            item["losses"] += 1

        item["recent_results"].append(
            {
                "win": result,
                "start_time": start_time,
            }
        )

    for item in recent_heroes.values():
        item["winrate"] = round(
            item["wins"] / item["games"] * 100,
            1,
        )

        item["recent_results"] = sorted(
            item["recent_results"],
            key=lambda result: result["start_time"],
        )[-RECENT_RESULTS_LIMIT:]

    recent_heroes_30d = sorted(
        recent_heroes.values(),
        key=lambda hero: (
            hero["wins"],
            hero["winrate"],
            -hero["games"],
        ),
        reverse=True,
    )

    # Статистика героев за всё время: только Ranked.
    hero_stats = get(
        f"/players/{PLAYER_ID}/heroes",
        {"lobby_type": RANKED_LOBBY},
    )

    totals = {}

    for row in hero_stats:
        hero_id = int(row.get("hero_id", 0))
        hero = hero_by_id.get(hero_id, {})

        games = int(row.get("games", 0))
        wins = int(row.get("win", 0))

        if games < 20:
            continue

        winrate = round(wins / games * 100, 1)
        score = hero_score(games, wins)

        totals[hero_id] = {
            "name": hero.get("localized_name", "Unknown"),
            "icon": hero_icon(hero),
            "games": games,
            "wins": wins,
            "winrate": winrate,
            "score": round(score, 2),
            "kda": "—",
        }

    # KDA по доступным последним 20 Ranked-матчам.
    for hero_id, item in totals.items():
        group = [
            match
            for match in enriched
            if int(match.get("hero_id") or 0) == hero_id
        ]

        if group:
            kills = sum(match["kills"] for match in group)
            deaths = sum(match["deaths"] for match in group)
            assists = sum(match["assists"] for match in group)

            item["kda"] = round(
                (kills + assists) / max(deaths, 1),
                2,
            )

    top_heroes = sorted(
        totals.values(),
        key=lambda hero: (
            hero["winrate"],
            hero["score"],
            hero["games"],
        ),
        reverse=True,
    )[:15]

    performance = calculate_performance(matches)

    profile = profile_data.get("profile", {})
    profile["mmr"] = mmr

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "mmr": mmr,
        "performance": performance,
        "matches": enriched,
        "top_heroes": top_heroes,
        "recent_heroes_30d": recent_heroes_30d,
        "processed_match_ids": sorted(processed_ids, key=int),
    }

    OUT.parent.mkdir(exist_ok=True)

    OUT.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"Ranked stats updated successfully. Estimated MMR: {mmr}"
    )
    print(
        f"MMR change in 7 days: {performance['mmr_change_7d']}"
    )
    print(
        f"MMR change in 30 days: {performance['mmr_change_30d']}"
    )
    print(
        f"Current streak: {performance['streak_count']} "
        f"{performance['streak_type'] or '—'}"
    )
    print(
        f"Heroes played in the last {RECENT_DAYS} days: "
        f"{len(recent_heroes_30d)}"
    )


if __name__ == "__main__":
    main()
