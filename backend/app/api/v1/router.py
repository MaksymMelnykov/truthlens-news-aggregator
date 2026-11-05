from fastapi import APIRouter
from app.api.v1.endpoints import health, news, verify, analytics, auth, bookmarks, history, sources, factchecks

api_router = APIRouter()

api_router.include_router(health.router, prefix="", tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(news.router, prefix="/news", tags=["News"])
api_router.include_router(factchecks.router, prefix="/factchecks", tags=["Fact Checks"])
api_router.include_router(bookmarks.router, prefix="/bookmarks", tags=["Bookmarks"])
api_router.include_router(history.router, prefix="/history", tags=["History"])
api_router.include_router(verify.router, prefix="/verify", tags=["Verify"])
api_router.include_router(sources.router, prefix="/sources", tags=["Sources & Admin"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
