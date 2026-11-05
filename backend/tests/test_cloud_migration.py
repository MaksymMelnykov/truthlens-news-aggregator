import pytest
from pathlib import Path
import tempfile

from app.db.session import normalize_async_db_url
from scripts.migrate_to_cloud_db import migrate_to_target_db, BACKUP_FILE_PATH


def test_normalize_neon_and_supabase_urls():
    # 1. Перевірка рядка підключення Neon.tech (зі схемами postgresql:// та параметрами sslmode/channel_binding)
    neon_raw = (
        "postgresql://neondb_owner:npg_Secret123@"
        "ep-cool-morning-a2b3c4-pooler.eu-central-1.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require"
    )
    clean_url, connect_args = normalize_async_db_url(neon_raw)
    assert clean_url.startswith("postgresql+asyncpg://neondb_owner:npg_Secret123@")
    assert "sslmode" not in clean_url
    assert "channel_binding" not in clean_url
    assert connect_args.get("ssl") == "require"
    assert connect_args.get("statement_cache_size") == 0

    # 2. Перевірка рядка підключення Supabase Transaction Pooler (порт 6543)
    supa_raw = "postgres://postgres.proj123:SecretPass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
    clean_supa, supa_args = normalize_async_db_url(supa_raw)
    assert clean_supa.startswith("postgresql+asyncpg://")
    assert supa_args.get("ssl") == "require"
    assert supa_args.get("statement_cache_size") == 0


@pytest.mark.asyncio
async def test_batch_migration_pipeline():
    assert BACKUP_FILE_PATH.exists(), "Локальний бекап має бути створений"
    with tempfile.TemporaryDirectory() as tmpdir:
        test_db_file = Path(tmpdir) / "migrated_test.db"
        target_url = f"sqlite+aiosqlite:///{test_db_file}"

        sample_backup = {
            "users": [
                {
                    "id": 1,
                    "email": "test@example.com",
                    "hashed_password": "hash",
                    "full_name": "Test User",
                    "role": "user",
                    "is_active": True,
                    "google_id": None,
                    "preferences": {},
                    "created_at": "2026-11-04T10:00:00+00:00",
                }
            ],
            "sources": [
                {
                    "id": 1,
                    "name": "Укрінформ",
                    "domain": "ukrinform.ua",
                    "homepage_url": "https://www.ukrinform.ua",
                    "language": "ua",
                    "country": "UA",
                    "reliability_rating": 95.0,
                    "is_whitelisted": True,
                    "is_blacklisted": False,
                    "created_at": "2026-11-04T10:00:00+00:00",
                }
            ],
            "articles": [],
            "analysis_reports": [],
            "bookmarks": [],
            "verification_history": [],
            "fact_check_claims": [],
        }

        await migrate_to_target_db(target_url, sample_backup, update_env=False)
        assert test_db_file.exists()

