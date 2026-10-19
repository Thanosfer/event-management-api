const { getRecommendations } = require('../utils/recommender');
const { Event, Booking, sequelize } = require('../models');

// 5 προτάσεις από το μοντέλο. Αν δεν υπάρχουν (νέος χρήστης ή δεν έχει εκπαιδευτεί μοντέλο),
// επιστρέφουμε τα πιο δημοφιλή events
exports.getRecommendations = async (req, res) => {
    try {
        const recommendations = await getRecommendations(req.user.id, 5);
        if (recommendations.length) return res.json(recommendations);
        res.json(await getPopularEvents(5));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Δημοσιευμένα events ταξινομημένα κατά πλήθος κρατήσεων
function getPopularEvents(limit) {
    return Event.findAll({
        where: { status: 'PUBLISHED' },
        include: [{ model: Booking, attributes: [], where: { booking_status: 'CONFIRMED' }, required: false }],
        attributes: ['id', 'event_id', 'title', 'start_datetime', 'city',
                     [sequelize.fn('COUNT', sequelize.col('Bookings.id')), 'bookingCount']],
        group: ['Event.id'],
        order: [[sequelize.literal('bookingCount'), 'DESC'], ['start_datetime', 'ASC']],
        limit,
        subQuery: false,
    });
}
