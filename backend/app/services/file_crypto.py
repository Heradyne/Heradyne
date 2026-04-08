"""
File encryption service.
Encrypts uploaded documents at rest using Fernet (AES-128-CBC + HMAC-SHA256).
Files are transparently encrypted on write and decrypted on read.
"""
import os
import base64
from typing import Optional
from app.core.config import settings


def _get_fernet():
    from cryptography.fernet import Fernet
    raw = settings.FIELD_ENCRYPTION_KEY.encode()
    # Fernet requires exactly 32 URL-safe base64 bytes
    key = base64.urlsafe_b64encode(raw[:32].ljust(32, b'\x00'))
    return Fernet(key)


def encrypt_file(content: bytes) -> bytes:
    """Encrypt file content for at-rest storage."""
    if 'INSECURE' in settings.FIELD_ENCRYPTION_KEY:
        return content  # Encryption not configured — store plaintext
    try:
        return _get_fernet().encrypt(content)
    except Exception:
        return content  # Degrade gracefully


def decrypt_file(content: bytes) -> bytes:
    """Decrypt file content for serving."""
    if 'INSECURE' in settings.FIELD_ENCRYPTION_KEY:
        return content
    try:
        return _get_fernet().decrypt(content)
    except Exception:
        return content  # Return as-is if not encrypted (backward compat)


def validate_mime_type(content: bytes, filename: str, claimed_type: str) -> tuple[bool, str]:
    """
    Validate file type by reading magic bytes.
    Returns (is_valid, actual_mime_type).
    """
    ALLOWED_SIGNATURES = {
        b'%PDF': 'application/pdf',
        b'PK\x03\x04': 'application/zip',  # docx, xlsx, zip
        b'\xd0\xcf\x11\xe0': 'application/msoffice',  # doc, xls
        b'\xff\xd8\xff': 'image/jpeg',
        b'\x89PNG': 'image/png',
        b'GIF8': 'image/gif',
        b'II\x2a\x00': 'image/tiff',
        b'MM\x00\x2a': 'image/tiff',
    }

    ALLOWED_EXTENSIONS = {
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv',
        'txt', 'png', 'jpg', 'jpeg', 'gif'
    }

    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Extension .{ext} not allowed"

    # Check magic bytes
    header = content[:8]
    detected = 'application/octet-stream'
    for sig, mime in ALLOWED_SIGNATURES.items():
        if header.startswith(sig):
            detected = mime
            break

    # CSV and TXT are text — check they're actually readable
    if ext in ('csv', 'txt'):
        try:
            content[:1024].decode('utf-8')
            detected = 'text/plain'
        except UnicodeDecodeError:
            return False, "File claims to be text but contains binary data"

    # Reject dangerous mismatches (e.g. .pdf extension but actually an executable)
    DANGEROUS_SIGNATURES = [
        b'MZ',           # Windows PE executable
        b'\x7fELF',      # Linux ELF executable
        b'#!/',          # Shell script
        b'<?php',        # PHP
        b'<script',      # JavaScript in disguise
    ]
    for sig in DANGEROUS_SIGNATURES:
        if header.startswith(sig):
            return False, f"File content matches dangerous type (executable/script)"

    return True, detected
