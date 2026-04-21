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

#### `GET /api/facts/:id`
Returns a single fact by its numeric ID.

**Response** `200`
```json
{ "id": 42, "content": "A monad is just a monoid in the category of endofunctors." }
```

**Response** `404`
```json
{ "error": "Fact not found" }
```

**Response** `400`
```json
{ "error": "Invalid ID" }
```

---

#### `GET /api/facts/search`
Fuzzy text search across all facts. Scores by full-phrase match and individual word overlap.

**Query Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `text` | string (required) | Search phrase, e.g. `monoidal category` |

**Response** `200`
```json
{
  "bestMatch": { "id": 7, "content": "A monoid in a monoidal category is the categorical generalisation of a monoid." },
  "matches": [
    { "id": 3, "content": "..." }
  ]
}
```

**Response** `400` — missing `text` param
```json
{ "error": "'text' query parameter is required" }
```

**Response** `404` — no results
```json
{ "error": "No matching facts found" }
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

#### `POST /api/facts/:id/revise`
Submit a revision to an existing fact for admin review.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | integer | The ID of the fact to revise |

**Body** `application/json`
```json
{ "content": "A monad is a monoid in the category of endofunctors." }
```

| Field | Type | Rules |
|-------|------|-------|
| `content` | string | Required, max 500 characters |

**Response** `201`
```json
{ "message": "Revision submitted for review. Thank you!" }
```

**Response** `400`
```json
{ "error": "'content' field is required" }
// or
{ "error": "Content must be 500 characters or fewer" }
```

**Response** `404`
```json
{ "error": "Fact not found" }
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

#### `GET /api/admin/revisions`
List all revisions sorted by submission date (newest first).

**Response** `200`
```json
[
  {
    "id": 1,
    "fact_id": 42,
    "content": "Revised text for the fact.",
    "status": "pending",
    "submitted_at": "2026-04-20T12:00:00Z",
    "reviewed_at": null
  },
  ...
]
```

`status` is one of: `pending`, `approved`, `rejected`

---

#### `POST /api/admin/revisions/:id/approve`
Approve a pending revision. Updates the original fact's text.

**Response** `200`
```json
{ "message": "Revision approved and fact updated" }
```

**Response** `404`
```json
{ "error": "Revision not found" }
```

**Response** `400`
```json
{ "error": "Revision already reviewed" }
```

---

#### `POST /api/admin/revisions/:id/approve-revision`
Approve a revision with edits. Updates the original fact with the provided text instead.

**Body** `application/json`
```json
{ "content": "Edited revision text" }
```

**Response** `200`
```json
{ "message": "Revision approved with edits and fact updated" }
```

---

#### `POST /api/admin/revisions/:id/reject`
Reject a pending revision.

**Response** `200`
```json
{ "message": "Revision rejected" }
```

**Response** `404`
```json
{ "error": "Revision not found" }
```

**Response** `400`
```json
{ "error": "Revision already reviewed" }
```

---

## Setup

```bash
bun install
cp config/config.template.ts config/config.custom.ts
# edit config/config.custom.ts to set port and admin_pass
bun run src/index.ts
```
