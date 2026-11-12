from collections import defaultdict, deque
from time import monotonic

from fastapi import HTTPException


class RateLimiter:
    def __init__(self):
        self.buckets: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, count: int, seconds: int = 60):
        now = monotonic()
        if len(self.buckets) > 10000:
            self.buckets = defaultdict(
                deque, {k: v for k, v in self.buckets.items() if v and now - v[-1] < 60}
            )
        bucket = self.buckets[key]
        while bucket and bucket[0] < now - seconds:
            bucket.popleft()
        if len(bucket) >= count:
            raise HTTPException(429, "Too many requests", headers={"Retry-After": str(seconds)})
        bucket.append(now)


limiter = RateLimiter()
