const { randomUUID } = require('crypto');
const { Booking, TicketType, Event, sequelize } = require('../models');

// Λάθος του χρήστη (επιστρέφεται με το δικό του status), σε αντίθεση με τα λάθη του server (500)
class ClientError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function sendError(res, error) {
    if (error instanceof ClientError) return res.status(error.status).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server error' });
}

exports.createBooking = async (req, res) => {
    const { ticket_type_id, number_of_tickets } = req.body;
    const userId = req.user.id;

    if (!Number.isInteger(number_of_tickets) || number_of_tickets <= 0) {
        return res.status(400).json({ message: 'number_of_tickets must be a positive integer' });
    }

    try {
        const booking = await sequelize.transaction(async (t) => {
            // Βρες τον τύπο εισιτηρίου (κλειδωμένο, για ταυτόχρονες κρατήσεις) και το event
            const ticketType = await TicketType.findByPk(ticket_type_id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!ticketType) throw new ClientError(404, 'Ticket type not found');

            const event = await Event.findByPk(ticketType.event_id, { transaction: t });
            if (!event || event.status !== 'PUBLISHED') throw new ClientError(400, 'Event not available');

            // Έλεγχος διαθεσιμότητας
            if (ticketType.available < number_of_tickets) throw new ClientError(400, 'Not enough tickets');

            const totalCost = ticketType.price * number_of_tickets;

            // Μείωση διαθέσιμων
            ticketType.available -= number_of_tickets;
            await ticketType.save({ transaction: t });

            return Booking.create({
                booking_id: `B-${randomUUID()}`,
                event_id: event.id,
                attendee_id: userId,
                ticket_type_id: ticketType.id,
                number_of_tickets,
                total_cost: totalCost,
                booking_status: 'CONFIRMED',
            }, { transaction: t });
        });
        res.status(201).json(booking);
    } catch (error) {
        sendError(res, error);
    }
};

// Λήψη κρατήσεων χρήστη
exports.getMyBookings = async (req, res) => {
    try {
        const bookings = await Booking.findAll({
            where: { attendee_id: req.user.id },
            include: [{ model: Event }, { model: TicketType }],
            order: [['booking_time', 'DESC']],
        });
        res.json(bookings);
    } catch (error) {
        sendError(res, error);
    }
};

// Ακύρωση κράτησης από τον συμμετέχοντα: τα εισιτήρια επιστρέφουν στα διαθέσιμα
exports.cancelBooking = async (req, res) => {
    try {
        const booking = await sequelize.transaction(async (t) => {
            const booking = await Booking.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!booking || booking.attendee_id !== req.user.id) throw new ClientError(404, 'Booking not found');
            if (booking.booking_status === 'CANCELLED') throw new ClientError(400, 'Booking is already cancelled');

            const event = await Event.findByPk(booking.event_id, { transaction: t });
            if (event.status !== 'PUBLISHED') throw new ClientError(400, `Cannot cancel a booking of a ${event.status} event`);

            const ticketType = await TicketType.findByPk(booking.ticket_type_id, { transaction: t, lock: t.LOCK.UPDATE });
            ticketType.available += booking.number_of_tickets;
            await ticketType.save({ transaction: t });

            return booking.update({ booking_status: 'CANCELLED' }, { transaction: t });
        });
        res.json(booking);
    } catch (error) {
        sendError(res, error);
    }
};
