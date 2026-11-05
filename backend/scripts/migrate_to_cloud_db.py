"""
Скрипт повного резервного копіювання та швидкої пакетної міграції бази даних TruthLens
у хмарну PostgreSQL (Neon.tech / Supabase).

Що робить скрипт:
1. Підключається до поточної локальної БД (або читає з резервної копії `backend/data/local_db_backup.json`)
   та зберігає повний бекап усіх 7 таблиць (`users`, `sources`, `articles`, `analysis_reports`,
   `bookmarks`, `verification_history`, `fact_check_claims`).
2. Підключається до нової хмарної БД (`CLOUD_DATABASE_URL` або аргумент `--target-url`).
3. Активує розширення `pgvector` (`CREATE EXTENSION IF NOT EXISTS vector;`) у хмарній БД.
4. Створює всі таблиці та індекси через SQLAlchemy (`Base.metadata.create_all`).
5. Пакетно (batch insert по 200 записів за запит) переносить усі дані зі збереженням первинних та зовнішніх ключів
   (`id`, `user_id`, `article_id`, `source_id`), закладок користувачів, історії перевірок, джерел, статей та бази фактчеків.
6. Оновлює лічильники автоінкременту PostgreSQL (`SERIAL` sequences), щоб нові записи безпомилково
   додавалися після міграції.
7. За наявності прапорця `--update-env` автоматично прописує нову хмарну БД у `backend/.env`.
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.session import Base, normalize_async_db_url
import app.models  # noqa: F401 — реєстрація всіх моделей у Base.metadata

BACKUP_FILE_PATH = BACKEND_DIR / "data" / "local_db_backup.json"
ENV_FILE_PATH = BACKEND_DIR / ".env"

# Порядок таблиць з урахуванням зовнішніх ключів (Foreign Keys)
TABLES_ORDER = [
    "users",
    "sources",
    "articles",
    "analysis_reports",
    "bookmarks",
    "verification_history",
    "fact_check_claims",
]

BATCH_SIZE = 200


def _serialize_value(val: Any) -> Any:
    if isinstance(val, datetime):
        return val.isoformat()
    return val


async def export_local_db_to_backup(source_url: str, backup_path: Path = BACKUP_FILE_PATH) -> Dict[str, List[Dict[str, Any]]]:
    """Вивантажує всі таблиці з поточної БД у JSON-файл резервної копії."""
    norm_url, connect_args = normalize_async_db_url(source_url)
    engine = create_async_engine(norm_url, echo=False, connect_args=connect_args)

    backup_data: Dict[str, List[Dict[str, Any]]] = {}
    print("\n[1/4] Підключення до вихідної БД та створення резервної копії...")

    try:
        async with engine.connect() as conn:
            for table_name in TABLES_ORDER:
                result = await conn.execute(text(f"SELECT * FROM {table_name} ORDER BY id ASC"))
                rows = result.mappings().all()
                serialized_rows = [
                    {k: _serialize_value(v) for k, v in dict(row).items()}
                    for row in rows
                ]
                backup_data[table_name] = serialized_rows
                print(f"  - Таблиця '{table_name}': зчитано {len(serialized_rows)} записів")
    finally:
        await engine.dispose()

    backup_path.parent.mkdir(parents=True, exist_ok=True)
    with open(backup_path, mode="w", encoding="utf-8") as f:
        json.dump(
            {
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "tables": backup_data,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    size_kb = round(backup_path.stat().st_size / 1024, 1)
    print(f"  [OK] Локальний бекап збережено у: {backup_path} ({size_kb} КБ)")
    return backup_data


def _parse_row_for_table(table_name: str, row: Dict[str, Any]) -> Dict[str, Any]:
    """Конвертує ISO-рядки дат та JSON-поля назад у формати, сумісні з asyncpg."""
    table_obj = Base.metadata.tables[table_name]
    parsed: Dict[str, Any] = {}
    for col in table_obj.columns:
        col_name = col.name
        if col_name not in row:
            continue
        val = row[col_name]
        if val is None:
            parsed[col_name] = None
            continue

        col_type_name = col.type.__class__.__name__.upper()
        if "DATETIME" in col_type_name or "TIMESTAMP" in col_type_name:
            if isinstance(val, str):
                parsed[col_name] = datetime.fromisoformat(val.replace("Z", "+00:00"))
            else:
                parsed[col_name] = val
        else:
            parsed[col_name] = val
    return parsed


def update_env_database_url(target_url: str, env_path: Path = ENV_FILE_PATH) -> None:
    """Оновлює DATABASE_URL у файлі backend/.env, зберігаючи попередній локальний URL у коментарі."""
    norm_url, _ = normalize_async_db_url(target_url)
    # Якщо передано ?sslmode=require, зберігаємо оригінальний рядок зі схемою postgresql+asyncpg://
    display_url = target_url.strip()
    if display_url.startswith("postgres://"):
        display_url = "postgresql+asyncpg://" + display_url[len("postgres://") :]
    elif display_url.startswith("postgresql://"):
        display_url = "postgresql+asyncpg://" + display_url[len("postgresql://") :]

    if not env_path.exists():
        env_path.write_text(f"DATABASE_URL={display_url}\n", encoding="utf-8")
        print(f"  [OK] Створено {env_path} із новим DATABASE_URL.")
        return

    content = env_path.read_text(encoding="utf-8")
    if re.search(r"^DATABASE_URL=", content, flags=re.MULTILINE):
        def _repl(match: re.Match) -> str:
            old_line = match.group(0)
            return f"# Previous local DB: {old_line}\nDATABASE_URL={display_url}"

        new_content = re.sub(r"^DATABASE_URL=.*$", _repl, content, count=1, flags=re.MULTILINE)
    else:
        new_content = content.rstrip() + f"\n\nDATABASE_URL={display_url}\n"

    env_path.write_text(new_content, encoding="utf-8")
    print(f"  [OK] Файл {env_path} автоматично оновлено новим хмарним DATABASE_URL!")


async def migrate_to_target_db(
    target_url: str,
    backup_data: Dict[str, List[Dict[str, Any]]],
    update_env: bool = False,
) -> None:
    """Створює схему, вмикає pgvector і пакетно переносить усі дані у цільову хмарну БД."""
    norm_url, connect_args = normalize_async_db_url(target_url)
    target_engine = create_async_engine(
        norm_url,
        echo=False,
        connect_args=connect_args,
        pool_pre_ping=True,
    )

    print("\n[2/4] Підключення до цільової хмарної БД та ініціалізація розширення pgvector...")
    try:
        async with target_engine.begin() as conn:
            if "postgresql" in norm_url:
                try:
                    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                    print("  [OK] Розширення 'pgvector' успішно активовано у хмарній БД!")
                except Exception as ext_err:
                    print(f"  [!] Примітка при активації pgvector: {ext_err}")

            await conn.run_sync(Base.metadata.create_all)
            print("  [OK] Усі 7 таблиць та індекси створено у хмарній БД.")

        print("\n[3/4] Пакетне перенесення записів у хмарну БД...")
        async with target_engine.begin() as conn:
            for table_name in TABLES_ORDER:
                rows = backup_data.get(table_name, [])
                if not rows:
                    print(f"  - Таблиця '{table_name}': 0 записів (пропущено)")
                    continue

                table_obj = Base.metadata.tables[table_name]
                existing_ids_res = await conn.execute(text(f"SELECT id FROM {table_name}"))
                existing_ids = {r[0] for r in existing_ids_res.fetchall()}

                to_insert = [
                    _parse_row_for_table(table_name, raw_row)
                    for raw_row in rows
                    if raw_row.get("id") not in existing_ids
                ]

                for i in range(0, len(to_insert), BATCH_SIZE):
                    batch = to_insert[i : i + BATCH_SIZE]
                    await conn.execute(table_obj.insert(), batch)

                # Синхронізація лічильника SERIAL (sequence), щоб наступні INSERT не конфліктували по id
                if "postgresql" in norm_url:
                    await conn.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                            f"COALESCE((SELECT MAX(id) FROM {table_name}), 1), "
                            f"(SELECT COUNT(*) > 0 FROM {table_name}))"
                        )
                    )

                total_in_cloud = (await conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))).scalar()
                print(
                    f"  - Таблиця '{table_name}': перенесено {len(to_insert)} нових записів "
                    f"(усього в цільовій БД: {total_in_cloud})"
                )

        print("\n[4/4] Перевірка стану цільової БД після міграції...")
        async with target_engine.connect() as conn:
            if "postgresql" in norm_url:
                db_size = (
                    await conn.execute(text("SELECT pg_size_pretty(pg_database_size(current_database()))"))
                ).scalar()
                exts = [
                    r[0]
                    for r in (await conn.execute(text("SELECT extname FROM pg_extension"))).fetchall()
                ]
                print(f"  - Зайнятий обсяг у хмарній БД: {db_size} (із 512 MB безкоштовного ліміту)")
                print(f"  - Активні розширення PostgreSQL: {exts}")

        if update_env:
            update_env_database_url(target_url)

        print("\n=== МІГРАЦІЮ У ХМАРНУ БАЗУ ДАНИХ УСПІШНО ЗАВЕРШЕНО! ===")
    finally:
        await target_engine.dispose()


async def async_main() -> None:
    parser = argparse.ArgumentParser(description="Міграція локальної БД TruthLens у хмарну PostgreSQL (Neon/Supabase)")
    parser.add_argument(
        "--source-url",
        type=str,
        default=os.environ.get("LOCAL_DATABASE_URL", settings.DATABASE_URL),
        help="URL вихідної (локальної) БД",
    )
    parser.add_argument(
        "--target-url",
        type=str,
        default=os.environ.get("CLOUD_DATABASE_URL", ""),
        help="URL цільової хмарної БД (Neon.tech або Supabase)",
    )
    parser.add_argument(
        "--backup-only",
        action="store_true",
        help="Лише зберегти резервну копію поточної БД у backend/data/local_db_backup.json",
    )
    parser.add_argument(
        "--from-backup-file",
        action="store_true",
        help="Відновити дані у хмарну БД із вже збереженого файлу backend/data/local_db_backup.json",
    )
    parser.add_argument(
        "--update-env",
        action="store_true",
        help="Автоматично прописати новий target-url у файл backend/.env після успішного перенесення",
    )
    args = parser.parse_args()

    if args.from_backup_file and BACKUP_FILE_PATH.exists():
        print(f"Зчитування даних із резервної копії {BACKUP_FILE_PATH}...")
        with open(BACKUP_FILE_PATH, mode="r", encoding="utf-8") as f:
            payload = json.load(f)
            backup_data = payload["tables"]
    else:
        backup_data = await export_local_db_to_backup(args.source_url, BACKUP_FILE_PATH)

    if args.backup_only:
        return

    if not args.target_url:
        print(
            "\n[!] Для перенесення у хмарну БД вкажіть --target-url \"postgresql://...\" "
            "або змінну середовища CLOUD_DATABASE_URL."
        )
        return

    await migrate_to_target_db(args.target_url, backup_data, update_env=args.update_env)


if __name__ == "__main__":
    asyncio.run(async_main())
