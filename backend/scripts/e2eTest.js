// End-to-end δοκιμές του API. Χρειάζεται τον server ανοιχτό και admin με κωδικό admin123 (ή E2E_ADMIN_PASSWORD):
//   npm run test:e2e
// Φτιάχνει χρήστες e2e_* και τους σβήνει στο τέλος (cascade σβήνει events/κρατήσεις/μηνύματα).
const path = require('path');
const { execSync } = require('child_process');
const BACKEND = path.join(__dirname, '..');
const { User, sequelize } = require('../models');
const { Op } = require('sequelize');

const BASE = `http://localhost:${process.env.PORT || 5001}/api`;
let passed = 0, failed = 0;
const failures = [];

async function api(method, url, token, body) {
    const res = await fetch(BASE + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
}

function check(name, cond, info) {
    if (cond) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ✗ ${name}  -> ${JSON.stringify(info).slice(0, 300)}`); }
}

async function cleanup() {
    await User.destroy({ where: { username: { [Op.like]: 'e2e\\_%' } } });
}

async function login(username, password = 'pass123') {
    const r = await api('POST', '/auth/login', null, { username, password });
    return r.data.token;
}

const ev = (title, extra = {}) => ({
    title, event_type: 'Concert', venue: 'Hall', city: 'Athens', country: 'Greece',
    start_datetime: '2026-12-01 20:00', end_datetime: '2026-12-01 23:00', capacity: 100, ...extra,
});

(async () => {
    await cleanup();
    const admin = await login('admin', process.env.E2E_ADMIN_PASSWORD || 'admin123');
    if (!admin) throw new Error('Admin login failed: run npm run create-admin -- admin admin123');

    console.log('Auth / admin');
    const users = {};
    for (const u of ['e2e_org', 'e2e_p1', 'e2e_p2']) {
        const r = await api('POST', '/auth/register', null,
            { username: u, password: 'pass123', first_name: 'E', last_name: u, email: `${u}@test.com` });
        check(`register ${u}`, r.status === 201, r);
    }
    let r = await api('POST', '/auth/register', null, { username: 'e2e_bad' });
    check('register χωρίς υποχρεωτικά πεδία -> 400', r.status === 400, r);
    r = await api('POST', '/auth/login', null, { username: 'e2e_p1', password: 'pass123' });
    check('login πριν την έγκριση -> 403', r.status === 403, r);
    r = await api('POST', '/auth/login', null, { username: 'e2e_p1', password: 'wrong' });
    check('login με λάθος κωδικό -> 401', r.status === 401, r);

    r = await api('GET', '/admin/users/pending', admin);
    for (const u of r.data.filter(u => u.username.startsWith('e2e_'))) users[u.username] = u.id;
    check('pending users περιέχει τους 3 νέους', Object.keys(users).length === 3, r.data);
    for (const id of Object.values(users)) await api('PUT', `/admin/users/${id}/approve`, admin);
    r = await api('PUT', `/admin/users/${users.e2e_org}/role`, admin, { role: 'organizer' });
    check('ανάθεση ρόλου organizer', r.status === 200, r);
    r = await api('PUT', `/admin/users/${users.e2e_org}/role`, admin, { role: 'superuser' });
    check('ανάθεση άγνωστου ρόλου -> 400', r.status === 400, r);

    const org = await login('e2e_org'), p1 = await login('e2e_p1'), p2 = await login('e2e_p2');
    r = await api('GET', '/admin/users/pending', p1);
    check('μη-admin σε admin route -> 403', r.status === 403, r);

    console.log('Events');
    r = await api('POST', '/events', org, ev('E2E Concert', {
        categories: ['Music'],
        ticketTypes: [{ name: 'Regular', price: 10, quantity: 50 }, { name: 'Reduced', price: 5, quantity: 20 },
                      { name: 'VIP', price: 30, quantity: 10 }],
    }));
    check('δημιουργία event με 3 τύπους εισιτηρίων (2 με ίδιο πρόθεμα ονόματος)', r.status === 201, r);
    const A = r.data.id;
    const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    check('event_id της μορφής EV-<uuid>', new RegExp(`^EV-${UUID}$`).test(r.data.event_id), r.data.event_id);
    r = await api('POST', '/events', org, ev('E2E Too Many', { ticketTypes: [{ name: 'R', price: 1, quantity: 101 }] }));
    check('εισιτήρια > capacity -> 400', r.status === 400, r);
    r = await api('POST', '/events', p1, ev('E2E Nope'));
    check('participant δεν φτιάχνει event -> 403', r.status === 403, r);

    r = await api('POST', '/events', org, ev('E2E Seminar'));
    const B = r.data.id;
    r = await api('POST', `/bookings`, p1, { ticket_type_id: 999999, number_of_tickets: 1 });
    check('κράτηση σε ανύπαρκτο τύπο εισιτηρίου -> 400/404', [400, 404].includes(r.status), r);
    r = await api('POST', `/events/${B}/ticket-types`, org, { name: 'Standard', price: 15, quantity: 40 });
    check('προσθήκη τύπου εισιτηρίου σε υπάρχον event', r.status === 201, r);
    const bTicket = r.data.id;
    r = await api('POST', `/events/${B}/ticket-types`, org, { name: 'Huge', price: 15, quantity: 61 });
    check('προσθήκη τύπου που ξεπερνά capacity -> 400', r.status === 400, r);
    r = await api('POST', `/events/${B}/ticket-types`, p1, { name: 'X', price: 1, quantity: 1 });
    check('participant δεν προσθέτει τύπο εισιτηρίου -> 403', r.status === 403, r);
    r = await api('POST', '/bookings', p1, { ticket_type_id: bTicket, number_of_tickets: 1 });
    check('κράτηση σε DRAFT event -> 400', r.status === 400, r);

    r = await api('PUT', `/events/${A}`, org, { capacity: 50 });
    check('μείωση capacity κάτω από τα εισιτήρια -> 400', r.status === 400, r);
    r = await api('PUT', `/events/${A}`, org, { title: 'E2E Concert Updated' });
    check('ενημέρωση τίτλου', r.status === 200 && r.data.title === 'E2E Concert Updated', r);

    for (const id of [A, B]) await api('PUT', `/events/${id}/publish`, org);
    r = await api('GET', '/events');
    check('λίστα events (χωρίς φίλτρα)', r.status === 200 && Array.isArray(r.data.events), r);
    r = await api('GET', '/events?limit=1&page=2');
    check('σελιδοποίηση limit=1&page=2', r.status === 200 && r.data.events?.length === 1, r);
    r = await api('GET', '/events?category=Music&title=E2E');
    check('φίλτρο κατηγορίας Music', r.status === 200 && r.data.events?.length === 1 && r.data.events[0].id === A, r);
    r = await api('GET', `/events/${A}`);
    check('λεπτομέρειες event', r.status === 200 && r.data.TicketTypes.length === 3, r);
    const regular = r.data.TicketTypes.find(t => t.name === 'Regular');
    const vip = r.data.TicketTypes.find(t => t.name === 'VIP');

    console.log('Bookings');
    for (const n of [0, -2, 'abc', undefined, 1.5]) {
        r = await api('POST', '/bookings', p1, { ticket_type_id: regular.id, number_of_tickets: n });
        check(`κράτηση με number_of_tickets=${n} -> 400`, r.status === 400, r);
    }
    r = await api('POST', '/bookings', p1, { ticket_type_id: regular.id, number_of_tickets: 51 });
    check('κράτηση περισσότερων από τα διαθέσιμα -> 400', r.status === 400, r);
    r = await api('POST', '/bookings', p1, { ticket_type_id: regular.id, number_of_tickets: 3 });
    check('κράτηση 3 Regular', r.status === 201 && Number(r.data.total_cost) === 30, r);
    check('booking_id της μορφής B-<uuid>', new RegExp(`^B-${UUID}$`).test(r.data.booking_id), r.data.booking_id);
    const b1 = r.data.id;
    r = await api('GET', `/events/${A}`);
    check('διαθέσιμα Regular 50 -> 47', r.data.TicketTypes.find(t => t.id === regular.id).available === 47, r.data.TicketTypes);
    r = await api('GET', '/bookings/my', p1);
    check('οι κρατήσεις μου', r.status === 200 && r.data.length === 1 && r.data[0].Event && r.data[0].TicketType, r);
    r = await api('PUT', `/bookings/${b1}/cancel`, p2);
    check('ακύρωση ξένης κράτησης -> 403/404', [403, 404].includes(r.status), r);
    r = await api('PUT', `/bookings/${b1}/cancel`, p1);
    check('ακύρωση δικής μου κράτησης', r.status === 200, r);
    r = await api('GET', `/events/${A}`);
    check('διαθέσιμα Regular επιστρέφουν στο 50', r.data.TicketTypes.find(t => t.id === regular.id).available === 50, r.data.TicketTypes);
    r = await api('PUT', `/bookings/${b1}/cancel`, p1);
    check('διπλή ακύρωση -> 400', r.status === 400, r);
    r = await api('POST', '/bookings', p1, { ticket_type_id: vip.id, number_of_tickets: 2 });
    check('κράτηση 2 VIP', r.status === 201, r);
    r = await api('POST', '/bookings', p2, { ticket_type_id: regular.id, number_of_tickets: 1 });
    check('p2 κράτηση 1 Regular', r.status === 201, r);
    r = await api('POST', '/bookings', p2, { ticket_type_id: bTicket, number_of_tickets: 1 });

    console.log('Views');
    r = await api('POST', `/events/${A}/view`, p1);
    check('καταγραφή προβολής', r.status === 201, r);
    r = await api('POST', `/events/999999/view`, p1);
    check('προβολή ανύπαρκτου event -> 404', r.status === 404, r);

    console.log('Messages');
    r = await api('POST', '/messages', p1, { receiver_id: users.e2e_org, event_id: A, subject: 'Ερώτηση', body: 'Υπάρχει parking;' });
    check('αποστολή μηνύματος', r.status === 201, r);
    const m1 = r.data.id;
    r = await api('POST', '/messages', p1, { receiver_id: users.e2e_org });
    check('μήνυμα χωρίς body -> 400', r.status === 400, r);
    r = await api('POST', '/messages', p1, { receiver_id: 999999, body: 'x' });
    check('μήνυμα σε ανύπαρκτο χρήστη -> 404', r.status === 404, r);
    r = await api('GET', '/messages/inbox', org);
    check('inbox organizer', r.status === 200 && r.data.length === 1 && r.data[0].sender?.username === 'e2e_p1', r);
    r = await api('PUT', `/messages/${m1}/read`, p2);
    check('ξένος δεν το σημειώνει ως αναγνωσμένο -> 404', r.status === 404, r);
    r = await api('PUT', `/messages/${m1}/read`, org);
    check('σήμανση ως αναγνωσμένο', r.status === 200, r);
    r = await api('DELETE', `/messages/${m1}`, p2);
    check('ξένος δεν το σβήνει -> 403', r.status === 403, r);
    r = await api('DELETE', `/messages/${m1}`, org);
    r = await api('GET', '/messages/inbox', org);
    check('μετά τη διαγραφή το inbox είναι άδειο', r.data.length === 0, r);
    r = await api('GET', '/messages/sent', p1);
    check('ο αποστολέας το βλέπει ακόμα στα sent', r.data.length === 1, r);
    r = await api('POST', `/messages/event/${A}/notify`, p1, { subject: 'x', body: 'x' });
    check('ειδοποίηση από μη-διοργανωτή -> 403', r.status === 403, r);
    r = await api('POST', `/messages/event/${A}/notify`, org, { subject: 'Αλλαγή ώρας', body: 'Ξεκινάμε 21:00' });
    check('ειδοποίηση συμμετεχόντων (2 άτομα)', r.status === 200 && /2 attendees/.test(r.data.message), r);
    r = await api('GET', '/messages/inbox', p2);
    check('ο p2 έλαβε την ειδοποίηση', r.data.length === 1, r);

    console.log('Admin export');
    r = await api('GET', '/admin/export/xml', admin);
    check('εξαγωγή XML με κρατήσεις', r.status === 200 && String(r.data).includes('<TicketTypeRef>'), r);
    r = await api('GET', '/admin/export/json', admin);
    check('εξαγωγή JSON με κρατήσεις', r.status === 200 && Array.isArray(r.data), r);

    console.log('Recommendations');
    r = await api('GET', '/recommendations', p2);
    check('προτάσεις χωρίς ιστορικό (δημοφιλή)', r.status === 200 && Array.isArray(r.data) && r.data.length > 0, r);
    execSync('npm run -s train-recommender', { cwd: BACKEND, stdio: 'ignore' });
    await api('POST', `/events/${B}/view`, p2);
    r = await api('GET', '/recommendations', p1);
    check('προτάσεις μετά την εκπαίδευση', r.status === 200 && Array.isArray(r.data), r);

    console.log('Cancel / delete');
    r = await api('DELETE', `/events/${A}`, org);
    check('διαγραφή PUBLISHED event -> 400', r.status === 400, r);
    r = await api('PUT', `/events/${A}/cancel`, org, { reason: 'Η συναυλία ακυρώνεται λόγω καιρού.' });
    check('ακύρωση event (2 κρατήσεις, 2 ειδοποιήσεις)', r.status === 200 && r.data.cancelledBookings === 2 && r.data.notifiedAttendees === 2, r);
    r = await api('GET', '/messages/inbox', p1);
    check('ο p1 έλαβε μήνυμα ακύρωσης με το κείμενο του organizer',
        r.data.some(m => m.subject.startsWith('Event cancelled') && m.body.includes('καιρού')), r.data);
    r = await api('GET', '/messages/inbox', p2);
    check('ο p2 έχει την παλιά ειδοποίηση και το μήνυμα ακύρωσης', r.data.length === 2, r.data);
    r = await api('GET', '/bookings/my', p1);
    check('η κράτηση του p1 έγινε CANCELLED', r.data.filter(b => b.event_id === A).every(b => b.booking_status === 'CANCELLED'), r.data);
    r = await api('POST', '/bookings', p1, { ticket_type_id: regular.id, number_of_tickets: 1 });
    check('κράτηση σε ακυρωμένο event -> 400', r.status === 400, r);

    console.log(`\n${passed} πέρασαν, ${failed} απέτυχαν`);
    if (failed) console.log('Αποτυχίες:\n - ' + failures.join('\n - '));
})().catch(e => { console.error('CRASH:', e); process.exitCode = 1; })
  .finally(async () => {
      await cleanup();
      try { require('fs').unlinkSync(path.join(BACKEND, 'recommender_model.json')); } catch {}
      await sequelize.close();
  });
