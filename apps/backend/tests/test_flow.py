import io
from datetime import UTC, datetime
from uuid import uuid4

from PIL import Image


def join_exam(client, teacher):
    exam = client.post(
        "/api/exams",
        headers=teacher,
        json={"title": "Python Grade 10", "allowed_url": "https://contest.yandex.ru/contest/12345/"},
    ).json()
    joined = client.post(
        "/api/student/join", json={"student_name": "Aruzhan", "join_code": exam["join_code"]}
    ).json()
    return exam, joined, {"Authorization": f"Bearer {joined['token']}"}


def event_payload(session, kind="TAB_CHANGED"):
    severities = {"PAGE_HIDDEN": "medium", "NEW_TAB": "medium", "RETURN_TO_EXAM": "info"}
    return {
        "id": str(uuid4()),
        "student_session_id": session,
        "event_type": kind,
        "severity": severities.get(kind, "high"),
        "timestamp": datetime.now(UTC).isoformat(),
        "current_url": "https://google.com/search?q=private#secret",
        "metadata": {"source": "tabs.onActivated"},
    }


def test_complete_event_screenshot_finish_flow(client, teacher):
    exam, joined, auth = join_exam(client, teacher)
    sid = joined["session"]["id"]
    assert joined["exam"]["title"] == "Контест"
    assert joined["exam"]["allowed_urls"] == ["https://fizmat.win/waiting"]
    assert "12345" not in str(joined["exam"])
    assert client.post(f"/api/student/sessions/{sid}/stop", headers=auth).status_code == 403
    assert client.post("/api/events", headers=auth, json=event_payload(sid)).status_code == 409
    client.post(f"/api/exams/{exam['id']}/start", headers=teacher)
    assert (
        client.get(f"/api/student/sessions/{sid}", headers=auth)
        .json()["exam"]["allowed_url"]
        .endswith("/12345/")
    )
    with (
        client.websocket_connect(f"/ws/admin/{exam['id']}") as admin,
        client.websocket_connect(f"/ws/student/{sid}") as ext,
        client.websocket_connect(f"/ws/student/{sid}") as desktop,
    ):
        admin.send_json({"type": "auth", "token": "test-teacher-token-12345"})
        assert admin.receive_json()["type"] == "snapshot"
        for ws, role in ((ext, "extension"), (desktop, "desktop")):
            ws.send_json({"type": "auth", "token": joined["token"], "role": role})
            assert ws.receive_json()["type"] == "heartbeat_ack"
        assert client.post(f"/api/student/sessions/{sid}/start", headers=auth).json()["session"]["active"]
        ext.receive_json()
        desktop.receive_json()
        payload = event_payload(sid)
        response = client.post("/api/events", headers=auth, json=payload)
        assert response.status_code == 201, response.text
        event = response.json()
        assert event["current_url"] == "https://google.com/search"
        assert event["metadata"]["capture_status"] == "pending"
        # Idempotent retries never charge risk twice.
        assert client.post("/api/events", headers=auth, json=payload).json()["id"] == event["id"]
        for _ in range(10):
            update = admin.receive_json()
            if update["type"] == "event_created":
                break
        assert update["student"]["risk_score"] == 20
        assert client.get(f"/api/events/{event['id']}/capture", headers=auth).status_code == 200
        picture = io.BytesIO()
        Image.new("RGB", (600, 400), "navy").save(picture, "JPEG")
        upload = client.post(
            f"/api/events/{event['id']}/screenshot",
            headers=auth,
            files={"file": ("capture.jpg", picture.getvalue(), "image/jpeg")},
        )
        assert upload.status_code == 200, upload.text
        filename = upload.json()["screenshot_path"]
        assert filename.endswith(".jpg")
        assert admin.receive_json()["type"] == "screenshot_updated"
        assert client.get(f"/api/screenshots/{filename}").status_code == 401
        assert (
            client.get(f"/api/screenshots/{filename}", headers=teacher).headers["content-type"]
            == "image/jpeg"
        )
        client.post(f"/api/exams/{exam['id']}/finish", headers=teacher)
        assert ext.receive_json()["session"]["active"] is False
        assert desktop.receive_json()["exam"]["active"] is False
        assert client.post("/api/events", headers=auth, json=event_payload(sid)).status_code == 409
        assert (
            client.post(
                f"/api/events/{event['id']}/screenshot",
                headers=auth,
                files={"file": ("capture.jpg", picture.getvalue(), "image/jpeg")},
            ).status_code
            == 409
        )
    assert client.post(f"/api/exams/{exam['id']}/start", headers=teacher).status_code == 409
    assert client.post(f"/api/exams/{exam['id']}/pause", headers=teacher).status_code == 409


def test_auth_and_validation(client, teacher):
    assert client.get("/api/exams").status_code == 401
    assert (
        client.post(
            "/api/exams",
            headers=teacher,
            json={"title": "Exam", "allowed_url": "http://example.org/"},
        ).status_code
        == 422
    )
    exam, joined, auth = join_exam(client, teacher)
    sid = joined["session"]["id"]
    payload = event_payload(sid)
    payload["metadata"] = {"clipboard": "not permitted"}
    assert client.post("/api/events", headers=auth, json=payload).status_code == 422
    other = client.post(
        "/api/student/join", json={"student_name": "Dias", "join_code": exam["join_code"]}
    ).json()
    assert client.get(f"/api/student/sessions/{other['session']['id']}", headers=auth).status_code == 401
    assert client.post(f"/api/student/sessions/{sid}/start", headers=auth).status_code == 409


def test_admin_creates_teacher_and_rooms_are_scoped(client):
    import asyncio

    from app.database import SessionLocal
    from app.models import User
    from app.services.passwords import hash_password

    async def seed_admin():
        async with SessionLocal() as db:
            db.add(
                User(
                    email="owner@example.edu",
                    name="School administrator",
                    role="admin",
                    password_hash=hash_password("admin-password-123"),
                )
            )
            await db.commit()

    asyncio.run(seed_admin())
    login = client.post(
        "/api/auth/login",
        json={"email": "owner@example.edu", "password": "admin-password-123"},
    )
    assert login.status_code == 200
    admin = {"Authorization": f"Bearer {login.json()['token']}"}
    teacher_response = client.post(
        "/api/admin/teachers",
        headers=admin,
        json={"name": "Teacher One", "email": "teacher@example.edu", "password": "teacher-password-123"},
    )
    assert teacher_response.status_code == 201
    teacher_id = teacher_response.json()["id"]
    teacher_login = client.post(
        "/api/auth/login",
        json={"email": "teacher@example.edu", "password": "teacher-password-123"},
    ).json()
    teacher = {"Authorization": f"Bearer {teacher_login['token']}"}
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "Teacher One", "password": "teacher-password-123"},
        ).status_code
        == 200
    )
    short_password = client.post(
        "/api/auth/password",
        headers=teacher,
        json={"current_password": "teacher-password-123", "new_password": "abc123"},
    )
    assert short_password.status_code == 200
    teacher_login = client.post("/api/auth/login", json={"email": "Teacher One", "password": "abc123"}).json()
    teacher = {"Authorization": f"Bearer {teacher_login['token']}"}
    room = client.post(
        "/api/exams",
        headers=teacher,
        json={"title": "Teacher room", "allowed_url": "https://contest.yandex.ru/contest/42/"},
    )
    assert room.status_code == 201
    assert len(room.json()["join_code"]) == 4 and room.json()["join_code"].isdigit()
    assert len(client.get("/api/exams", headers=teacher).json()) == 1
    assert len(client.get("/api/exams", headers=admin).json()) == 1
    changed = client.post(
        "/api/auth/password",
        headers=teacher,
        json={"current_password": "abc123", "new_password": "teacher-password-456"},
    )
    assert changed.status_code == 200
    assert client.get("/api/auth/me", headers=teacher).status_code == 200
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "teacher@example.edu", "password": "teacher-password-123"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "teacher@example.edu", "password": "teacher-password-456"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/admin/teachers/{teacher_id}/status", headers=admin, json={"active": False}
        ).status_code
        == 200
    )
    assert client.get("/api/auth/me", headers=teacher).status_code == 401


def test_timeout_risk_cap_and_no_monitoring_after_finish(client, teacher):
    import asyncio
    from datetime import timedelta

    from app.database import SessionLocal
    from app.models import StudentSession
    from app.services.sessions import check_timeouts

    exam, joined, auth = join_exam(client, teacher)
    sid = joined["session"]["id"]
    client.post(f"/api/exams/{exam['id']}/start", headers=teacher)

    async def expire():
        async with SessionLocal() as db:
            student = await db.get(StudentSession, sid)
            student.connected = True
            student.active = True
            student.risk_score = 85
            student.last_seen = datetime.now(UTC) - timedelta(seconds=20)
            await db.commit()
            await check_timeouts(db)
            await check_timeouts(db)

    asyncio.run(expire())
    students = client.get(f"/api/exams/{exam['id']}/students", headers=teacher).json()
    assert students[0]["risk_score"] == 100
    assert students[0]["connected"] is False
    events = client.get(f"/api/students/{sid}/events", headers=teacher).json()
    assert len(events) == 1 and events[0]["event_type"] == "STUDENT_DISCONNECTED"
    assert client.get(f"/api/events/{events[0]['id']}/capture", headers=auth).status_code == 409


def test_three_allowed_urls_pause_resume_and_delete(client, teacher):
    urls = [
        "https://contest.yandex.ru/contest/101/",
        "https://contest.yandex.ru/contest/202/",
        "https://contest.yandex.ru/contest/303/",
    ]
    created = client.post(
        "/api/exams",
        headers=teacher,
        json={"title": "Three pages", "allowed_urls": urls},
    )
    assert created.status_code == 201, created.text
    exam = created.json()
    assert exam["allowed_urls"] == urls
    assert exam["allowed_url"] == urls[0]
    joined = client.post(
        "/api/student/join", json={"student_name": "Aruzhan", "join_code": exam["join_code"]}
    )
    assert joined.status_code == 201
    started = client.post(f"/api/exams/{exam['id']}/start", headers=teacher).json()
    assert started["active"] is True and started["paused"] is False
    paused = client.post(f"/api/exams/{exam['id']}/pause", headers=teacher).json()
    assert paused["active"] is False and paused["paused"] is True
    assert (
        client.post(
            "/api/student/join",
            json={"student_name": "Late student", "join_code": exam["join_code"]},
        ).status_code
        == 409
    )
    resumed = client.post(f"/api/exams/{exam['id']}/start", headers=teacher).json()
    assert resumed["active"] is True and resumed["paused"] is False
    assert client.delete(f"/api/exams/{exam['id']}", headers=teacher).status_code == 409
    client.post(f"/api/exams/{exam['id']}/pause", headers=teacher)
    assert client.delete(f"/api/exams/{exam['id']}", headers=teacher).status_code == 204
    assert client.get(f"/api/exams/{exam['id']}", headers=teacher).status_code == 404


def test_any_https_contest_and_required_urls(client, teacher):
    urls = ["https://FIZMAT.win:443/contest/42/?private=removed#fragment", "https://example.org/reference/"]
    created = client.post("/api/exams", headers=teacher, json={"title": "Contest", "allowed_urls": urls})
    assert created.status_code == 201, created.text
    assert created.json()["allowed_urls"] == ["https://fizmat.win/contest/42/", "https://example.org/reference/"]
    for data in [
        {"title": "Missing links"},
        {"title": "Empty links", "allowed_urls": []},
        {"title": "No host", "allowed_urls": ["https:///path"]},
        {"title": "Credentials", "allowed_urls": ["https://alice:secret@example.org/"]},
        {"title": "Wrong port", "allowed_urls": ["https://example.org:8443/"]},
        {"title": "Too long", "allowed_urls": ["https://example.org/" + "a" * 2048]},
    ]:
        assert client.post("/api/exams", headers=teacher, json=data).status_code == 422
    joined = client.post("/api/student/join", json={"student_name": "Student", "join_code": created.json()["join_code"]}).json()
    assert joined["exam"]["allowed_urls"] == ["https://fizmat.win/waiting"]
    assert "contest/42" not in str(joined["exam"])


def test_delete_notifies_connected_students_before_removing_room(client, teacher):
    exam, joined, auth = join_exam(client, teacher)
    sid = joined["session"]["id"]
    with (
        client.websocket_connect(f"/ws/student/{sid}") as desktop,
        client.websocket_connect(f"/ws/student/{sid}") as extension,
    ):
        for ws, role in ((desktop, "desktop"), (extension, "extension")):
            ws.send_json({"type": "auth", "token": joined["token"], "role": role})
            assert ws.receive_json()["type"] == "heartbeat_ack"
        assert client.delete(f"/api/exams/{exam['id']}", headers=teacher).status_code == 204
        for ws in (desktop, extension):
            terminal = ws.receive_json()
            assert terminal["type"] == "session_state"
            assert terminal["exam"]["finished_at"] is not None
            assert terminal["exam"]["active"] is False
            assert terminal["session"]["active"] is False
            assert terminal["session"]["ready"] is False
    assert client.get(f"/api/exams/{exam['id']}", headers=teacher).status_code == 404
