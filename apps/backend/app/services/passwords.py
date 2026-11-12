import hashlib
import secrets


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=3,
                            maxmem=64 * 1024 * 1024).hex()
    return f"scrypt$32768$8$3${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, _ = encoded.split("$")
        if (algorithm, n, r, p) != ("scrypt", "32768", "8", "3"):
            return False
        return secrets.compare_digest(hash_password(password, salt), encoded)
    except (ValueError, TypeError):
        return False
