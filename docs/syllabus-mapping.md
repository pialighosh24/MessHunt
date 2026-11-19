# Mess Hunt – Syllabus Mapping (Phase 2 Baseline)

This document maps relevant BCA syllabus concepts to planned/implemented features in **Mess Hunt** (official app name). It will be refined as features are implemented.

## JavaScript
| Concept | Planned/implemented usage |
|---|---|
| Variables & data types | Configuration, form values, API payloads, UI state |
| Functions | Utilities, handlers, validators, service/helpers |
| Arrays & objects | Listings, reviews, facilities, filters, request/response data |
| Array methods | Search/filter/sort/map/reduce over accommodations, reviews, favourites |
| ES6+, arrow functions, destructuring, spread/rest | Component/service code, immutable updates, clean parameter handling |
| Promises, async/await | API calls, database operations, upload/auth flows |
| Error handling | Try/catch, centralized backend errors, frontend error states/messages |
| Modules | Structured frontend/backend modules (routes, controllers, services, components) |

## React and React Native
| Concept | Planned/implemented usage |
|---|---|
| Components, props, state | Reusable cards/forms/layouts, screen/page state |
| Hooks (`useState`, `useEffect`) | Data fetching, form state, UI interactions |
| Context API | Auth/session state and shared app context where appropriate |
| Component reuse | Shared UI elements (cards, inputs, badges, layout primitives) |
| Form handling | Registration/login, listing create/edit, review submission, filters |
| Navigation | React Navigation (mobile), React Router (web owner/admin) |
| API integration | Service layer calling Express REST APIs |

## Node.js and Express
| Concept | Planned/implemented usage |
|---|---|
| Server creation | Express app/bootstrap and HTTP server |
| Routing & middleware | Modular route files, auth/RBAC, validation, upload, error middleware |
| Request/response | REST handlers with proper status codes and payloads |
| REST APIs | Auth, student, owner, admin endpoint groups |
| Authentication & authorization | JWT-based auth and role-based access control |
| Error handling | Centralized error middleware and consistent responses |
| Asynchronous programming | Async controllers/services with Mongoose |

## MongoDB
| Concept | Planned/implemented usage |
|---|---|
| Database design | Students, Owners, Admins, Accommodations, Reviews collections |
| Collections & documents | Persistent domain data and relationships |
| Mongoose | Schemas/models, hooks/helpers as needed |
| CRUD | Listings, profiles, reviews, favourites, moderation actions |
| Validation | Schema/request validation for required fields and constraints |
| References | ObjectId refs (owner/accommodation/student relationships) |
| Queries & filters | Approved-only listing queries, search/filter, dashboard stats/aggregations |
| Persistent storage | All real/demo operational data stored in MongoDB (no hardcoded data replacement) |

## Software Engineering
| Concept | Planned/implemented usage |
|---|---|
| Requirement analysis | Spec-driven feature set and scope control |
| Architecture | Separated backend/mobile/web with layered backend structure |
| Database & API design | Schema plan, endpoint contracts, role/visibility rules |
| Security | Password hashing, JWT, RBAC, env vars, validation, safe uploads |
| Testing | API/manual workflow testing, Expo Go device verification, persistence checks |
| Documentation | README, API docs, setup/demo guide, syllabus mapping |
| Version control | Git/GitHub-ready project structure and `.gitignore` practices |

## Notes
- Features are implemented only where relevant to project goals.
- Out-of-scope items (payments, booking, chat, AI/ML, live tracking, etc.) are excluded unless explicitly approved.
