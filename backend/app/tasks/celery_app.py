from app.tasks import celery_app

# This file exists to make the Celery app importable as app.tasks.celery_app
__all__ = ["celery_app"]
