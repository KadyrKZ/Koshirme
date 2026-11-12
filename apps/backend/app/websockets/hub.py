import asyncio
from collections import defaultdict

from fastapi import WebSocket


class Peer:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.lock = asyncio.Lock()

    async def send(self, data: dict):
        async with self.lock:
            await asyncio.wait_for(self.ws.send_json(data), timeout=3)


class Hub:
    def __init__(self):
        self.admins: dict[str, set[Peer]] = defaultdict(set)
        self.students: dict[str, dict[str, Peer]] = defaultdict(dict)

    async def admin_broadcast(self, exam_id: str, data: dict):
        peers = list(self.admins.get(exam_id, set()))
        results = await asyncio.gather(*(peer.send(data) for peer in peers), return_exceptions=True)
        for peer, result in zip(peers, results, strict=True):
            if isinstance(result, BaseException):
                self.admins[exam_id].discard(peer)

    async def student_broadcast(self, session_id: str, data: dict):
        peers = list(self.students.get(session_id, {}).values())
        await asyncio.gather(*(peer.send(data) for peer in peers), return_exceptions=True)


hub = Hub()
