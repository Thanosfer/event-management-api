const { Booking, EventView } = require('../models');

// Μετατρέπει κρατήσεις και προβολές σε βαθμολογίες για το recommender:
// κράτηση = 2, προβολή χωρίς κράτηση = 1
async function getAllRatings() {
    const bookings = await Booking.findAll({
        where: { booking_status: 'CONFIRMED' },
        attributes: ['attendee_id', 'event_id'],
    });
    const views = await EventView.findAll({ attributes: ['user_id', 'event_id'] });

    const ratings = new Map(); // "user|event" -> rating
    for (const v of views) ratings.set(`${v.user_id}|${v.event_id}`, { user_id: v.user_id, event_id: v.event_id, rating: 1 });
    for (const b of bookings) ratings.set(`${b.attendee_id}|${b.event_id}`, { user_id: b.attendee_id, event_id: b.event_id, rating: 2 });

    return [...ratings.values()];
}

module.exports = { getAllRatings };
