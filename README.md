# mathfacts

A simple Math Facts API built with Fastify and Bun. Serves mathematical facts and accepts community submissions for admin review.

**Public URL:** https://nulldev.org/mathfacts/

---

## Endpoints

### Public

#### `GET /api/facts`
Returns all facts in the database.

**Response** `200`
```json
[
  { "id": 1, "content": "A prime number has exactly two divisors: 1 and itself." },
  ...
]
```

---

#### `GET /api/facts/random`
Returns a single random fact.

**Query Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `exclude` | string (optional) | Comma-separated fact IDs to exclude — e.g. `?exclude=1,2,3` |

**Response** `200`
```json
{ "id": 4, "content": "The number pi is irrational." }
```

**Response** `404` — when no facts are available (or all are excluded)
```json
{ "error": "No facts available" }
```

---

#### `POST /api/facts/submit`
Submit a new fact for admin review.

**Body** `application/json`
```json
{ "fact": "Zero is the only number that is neither positive nor negative." }
```

| Field | Type | Rules |
|-------|------|-------|
| `fact` | string | Required, max 500 characters |

**Response** `201`
```json
{ "message": "Fact submitted for review. Thank you!" }
```

**Response** `400`
```json
{ "error": "'fact' field is required" }
// or
{ "error": "Fact must be 500 characters or fewer" }
```

---

### Admin

All admin endpoints require a Bearer token in the `Authorization` header.

```
Authorization: Bearer <admin_pass>
```

The `admin_pass` is set in `config/config.custom.ts`.

**Response** `401` (any admin endpoint, when unauthorized)
```json
{ "error": "Unauthorized" }
```

---

#### `GET /api/admin/submissions`
List all submissions sorted by submission date (newest first).

**Response** `200`
```json
[
  {
    "id": 1,
    "content": "Every even integer greater than 2 is the sum of two primes.",
    "status": "pending",
    "submitted_at": "2026-03-16T12:00:00Z",
    "reviewed_at": null
  },
  ...
]
```

`status` is one of: `pending`, `approved`, `rejected`

---

#### `POST /api/admin/submissions/:id/approve`
Approve a pending submission. Adds the fact to the live facts list.

**Response** `200`
```json
{ "message": "Fact approved and added to the list" }
```

**Response** `404`
```json
{ "error": "Submission not found" }
```

**Response** `400`
```json
{ "error": "Submission already reviewed" }
```

---

#### `POST /api/admin/submissions/:id/reject`
Reject a pending submission.

**Response** `200`
```json
{ "message": "Submission rejected" }
```

**Response** `404`
```json
{ "error": "Submission not found" }
```

**Response** `400`
```json
{ "error": "Submission already reviewed" }
```

---

## Setup

```bash
bun install
cp config/config.template.ts config/config.custom.ts
# edit config/config.custom.ts to set port and admin_pass
bun run src/index.ts
```
