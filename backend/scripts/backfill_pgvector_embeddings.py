"""
Скрипт ініціалізації стовпців `pgvector` (`embedding vector(256)`), побудови HNSW-індексів
та пакетного заповнення семантичних ембедингів для всіх статей і фактчеків у хмарній БД Neon.tech (Тиждень 4, День 1).
"""

import asyncio
import sys
import time
from pathlib import Path
from typing import List

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select, text
from app.db.session import async_session_maker, engine
from app.models.article import Article
from app.models.claim import FactCheckClaim
from app.services.embedding_service import embedding_service


async def backfill_all_embeddings(force_retrain: bool = True) -> None:
    t0 = time.perf_counter()
    print("=== Ініціалізація pgvector та генерація семантичних ембедингів (256-dim) у Neon.tech ===")

    async with engine.begin() as conn:
        ok = await embedding_service.ensure_pgvector_columns(conn)
        print(f"[1/4] Стовпці vector(256) та HNSW-індекси у PostgreSQL: {'OK' if ok else 'SQLite fallback'}")

    async with async_session_maker() as db:
        articles = (await db.execute(select(Article).order_by(Article.id.asc()))).scalars().all()
        claims = (await db.execute(select(FactCheckClaim).order_by(FactCheckClaim.id.asc()))).scalars().all()
        print(f"[2/4] Зчитано з хмарної БД: {len(articles)} статей та {len(claims)} фактчеків.")

        if force_retrain and (articles or claims):
            corpus: List[str] = []
            for a in articles:
                corpus.append(embedding_service.preprocess_text(a.title, a.summary or a.full_text or ""))
            for c in claims:
                corpus.append(embedding_service.preprocess_text(c.claim, c.explanation or ""))
            embedding_service.fit_on_corpus_and_save(corpus)
            print(f"[3/4] 256-вимірний мультиязичний семантичний енкодер навчено на {len(corpus)} документах.")

        # Пакетне обчислення векторів для всіх статей
        article_pairs = [(a.title, a.summary or a.full_text or "") for a in articles]
        article_vecs = embedding_service.encode_batch(article_pairs)

        claim_pairs = [(c.claim, c.explanation or "") for c in claims]
        claim_vecs = embedding_service.encode_batch(claim_pairs)

    # Пакетний запис у хмарну БД Neon.tech
    print("[4/4] Запис векторів у стовпці embedding vector(256) у Neon.tech...")
    batch_size = 250
    async with engine.begin() as conn:
        if "postgresql" in conn.dialect.name.lower():
            for i in range(0, len(articles), batch_size):
                batch_arts = articles[i : i + batch_size]
                batch_vecs = article_vecs[i : i + batch_size]
                params = [
                    {"aid": a.id, "vec": embedding_service.to_pgvector_str(v)}
                    for a, v in zip(batch_arts, batch_vecs)
                ]
                await conn.execute(
                    text("UPDATE articles SET embedding = CAST(:vec AS vector) WHERE id = :aid"),
                    params,
                )
                print(f"  - Статті: оновлено {min(i + batch_size, len(articles))}/{len(articles)} векторів")

            for i in range(0, len(claims), batch_size):
                batch_clms = claims[i : i + batch_size]
                batch_vecs = claim_vecs[i : i + batch_size]
                params = [
                    {"cid": c.id, "vec": embedding_service.to_pgvector_str(v)}
                    for c, v in zip(batch_clms, batch_vecs)
                ]
                await conn.execute(
                    text("UPDATE fact_check_claims SET embedding = CAST(:vec AS vector) WHERE id = :cid"),
                    params,
                )
            print(f"  - Фактчеки: оновлено {len(claims)}/{len(claims)} векторів")

    await engine.dispose()
    elapsed = round(time.perf_counter() - t0, 2)
    print(f"=== Усі семантичні вектори pgvector успішно збережено за {elapsed} сек.! ===")


if __name__ == "__main__":
    asyncio.run(backfill_all_embeddings())

