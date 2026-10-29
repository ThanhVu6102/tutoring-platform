# MongoDB workflow integration

Branch `fix/integrate-mongodb-workflow` is based on `origin/main`, not the older `develop` branch. Existing main features are retained: class join codes and requests, policy acceptance, warning/appeal workflows, suspensions/bans, profile editing and uploads.

## Accounts

- Roles remain `admin`, `teacher`, `student` for frontend compatibility.
- Student registrations become active; teacher registrations wait for admin approval without receiving a token.
- Registration still requires `acceptedPolicies: true` and records policy acceptance/version.
- `PUT /api/users/:id/approve` and `/reject` atomically review pending teachers and record reviewer metadata.
- Middleware checks current database role, lifecycle status, soft deletion, manual blocking, permanent bans and suspensions. Legacy accounts without a status field remain active unless another restriction applies.
- Audit logging is best-effort; account review metadata is stored atomically on the user document.

## Sessions and attendance

All endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/classes/:id/sessions` | Create a session for the class teacher/admin |
| GET | `/api/classes/:id/sessions?page=1&limit=20` | Paginated list, limit at most 100 |
| GET | `/api/sessions/:id` | Session details, excluding attendance roster |
| PUT | `/api/sessions/:id/status` | Change session status |
| GET | `/api/sessions/:id/attendances` | Teacher/admin roster or student's own attendance |
| POST | `/api/sessions/:id/check-in` | Teacher/admin records attendance |

Create body:

```json
{
  "title": "Chapter 1 review",
  "startsAt": "2026-11-01T19:00:00+07:00",
  "endsAt": "2026-11-01T20:30:00+07:00",
  "location": "Room 201"
}
```

- Dates must have a timezone; end time must be after start time.
- Session creation requires MongoDB Atlas or a replica set. It locks the teacher and class inside a transaction before checking teacher schedule overlap. Standalone MongoDB returns `503`, without an unsafe nontransactional fallback.
- Attendance is embedded in the session and initialized as `absent` for students enrolled when the session is created. Later enrollments do not automatically alter older rosters.
- Attendance body: `{ "student_id": "24-character ObjectId", "status": "present", "note": "" }`.
- Attendance statuses: `present`, `absent`, `late`, `excused`; only ongoing/completed sessions can be updated. Student must still belong to the class and exist in its session snapshot.
- Session transitions: scheduled to ongoing/completed/cancelled; ongoing to completed/cancelled. Terminal states cannot be reopened.
- No student self-check-in, QR, rescheduling, student timetable clash detection or room clash detection yet.
- Locked/archived classes reject student access and attendance/status writes. Managers can read history. Creating sessions in inactive classes is not allowed.
- Deleting a class now archives it instead of removing its history. Existing main admin reopening and policy lock/appeal flows remain available.
- Creation/status changes emit best-effort audit logs. Creator, status actor and attendance recorder are stored directly on the session.

## Validation

Run `npm test` in `backend`. Tests use mocked database operations and HTTP routers; real MongoDB transactions/concurrency still need integration testing on a replica set.

Not yet implemented: separate tutor/student profiles, parent links, tuition/payments, tutor reviews, activation emails, refresh tokens or frontend session/attendance screens. Default admin credentials and JWT fallback still need production hardening.
