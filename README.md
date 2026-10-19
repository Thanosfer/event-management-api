# Event Management API

A REST API for managing events, built as a university project. Organizers create events with ticket types, participants book tickets, and an admin approves new accounts and exports the data. There is also a simple recommender that suggests events to each user.

**Tech:** Node.js, Express, MySQL, Sequelize, JWT, bcrypt

## Features

- Registration with admin approval, JWT login and three roles: admin, organizer, participant
- Events go from `DRAFT` to `PUBLISHED` (needs at least one ticket type) and can be `CANCELLED`
- Several ticket types per event. Their total quantity can't exceed the event's capacity
- Bookings run in a transaction with a row lock, so two users can't book the same last ticket
- Cancelling an event cancels its bookings and sends a message to every attendee
- Search published events by title, city, category and dates, with pagination
- Messages between users, and organizer notifications to all attendees of an event
- Admin export of all events in XML and JSON
- Recommendations with matrix factorization, trained on bookings and event views. New users get the most popular events

## Setup

You need Node.js 18+ and MySQL 8.

```bash
cd backend
npm install
cp .env.example .env                       # set DB_PASSWORD and JWT_SECRET
mysql -u root -p < db/schema.sql           # creates the database, roles and categories
npm run create-admin -- admin <password>   # creates the admin account
npm run dev                                # http://localhost:5001
```

Other scripts:

- `npm run train-recommender`: trains the recommender on the current data
- `npm run test:e2e`: runs the end-to-end tests against the running server (needs an admin with password `admin123`, or set `E2E_ADMIN_PASSWORD`)

## API

Protected endpoints need the header `Authorization: Bearer <token>`. You get the token from `POST /api/auth/login`.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | Register (waits for admin approval) |
| POST | `/api/auth/login` | public | Log in, returns a token |
| GET | `/api/events` | public | Published events. Query: `title, city, category, startDate, endDate, page, limit` |
| GET | `/api/events/:id` | public | One event with its ticket types and categories |
| POST | `/api/events` | organizer | Create an event (optionally with `ticketTypes` and `categories`) |
| PUT | `/api/events/:id` | owner | Update an event |
| POST | `/api/events/:id/ticket-types` | owner | Add a ticket type |
| PUT | `/api/events/:id/publish` | owner | Publish a draft event |
| PUT | `/api/events/:id/cancel` | owner | Cancel the event and notify attendees |
| DELETE | `/api/events/:id` | owner | Delete a draft event |
| POST | `/api/events/:id/view` | logged in | Record a view (used by the recommender) |
| POST | `/api/bookings` | participant | Book tickets: `{ ticket_type_id, number_of_tickets }` |
| GET | `/api/bookings/my` | participant | My bookings |
| PUT | `/api/bookings/:id/cancel` | participant | Cancel a booking |
| POST | `/api/messages` | logged in | Send a message: `{ receiver_id, body, subject?, event_id? }` |
| GET | `/api/messages/inbox`, `/sent` | logged in | Received / sent messages |
| PUT | `/api/messages/:id/read` | logged in | Mark as read |
| DELETE | `/api/messages/:id` | logged in | Delete a message (only for me) |
| POST | `/api/messages/event/:eventId/notify` | owner | Message everyone who booked the event |
| GET | `/api/admin/users/pending` | admin | Users waiting for approval |
| PUT | `/api/admin/users/:id/approve` | admin | Approve a user |
| PUT | `/api/admin/users/:id/role` | admin | Give a role: `{ role: "organizer" }` |
| GET | `/api/admin/export/xml`, `/json` | admin | Export all events |
| GET | `/api/recommendations` | logged in | 5 recommended events |

## Project structure

```
backend/
├── config/        database connection
├── controllers/   request handlers
├── db/            SQL schema
├── middleware/    JWT and role checks
├── models/        Sequelize models
├── routes/        Express routes
├── scripts/       create admin, train recommender, e2e tests
├── utils/         recommender
└── server.js
```
