const { Event, TicketType, Category, Booking, EventView, User, Message, sequelize } = require('../models');
const { Op } = require('sequelize');
const { randomUUID } = require('crypto');

// Ένας τύπος εισιτηρίου πρέπει να έχει όνομα, τιμή >= 0 και ποσότητα θετικό ακέραιο
const isValidTicketType = (tt) =>
    tt && typeof tt.name === 'string' && tt.name.trim() !== '' &&
    Number(tt.price) >= 0 && Number.isInteger(tt.quantity) && tt.quantity > 0;

// Επιστρέφει μήνυμα λάθους αν οι ημερομηνίες λείπουν, είναι άκυρες ή η έναρξη δεν προηγείται της λήξης
function validateDates(start, end) {
    const s = new Date(start), e = new Date(end);
    if (!start || !end || isNaN(s) || isNaN(e)) return 'Valid start_datetime and end_datetime are required';
    if (s >= e) return 'start_datetime must be before end_datetime';
    return null;
}

// Δημιουργία Event (μόνο organizer)
exports.createEvent = async (req, res) => {
    const { title, event_type, venue, address, city, country, latitude, longitude,
            start_datetime, end_datetime, capacity, description, ticketTypes = [], categories } = req.body;

    // Τα ticketTypes είναι προαιρετικά (χωρίς αυτά το event δεν μπορεί να γίνει publish)
    if (!Array.isArray(ticketTypes) || !ticketTypes.every(isValidTicketType)) {
        return res.status(400).json({ message: 'ticketTypes must be an array of { name, price, quantity }' });
    }

    const datesError = validateDates(start_datetime, end_datetime);
    if (!title || datesError || !(Number.isInteger(capacity) && capacity > 0)) {
        return res.status(400).json({
            message: datesError || 'title, start_datetime, end_datetime and a positive integer capacity are required'
        });
    }

    // sum(quantity) <= capacity
    const totalTickets = ticketTypes.reduce((sum, tt) => sum + tt.quantity, 0);
    if (totalTickets > capacity) {
        return res.status(400).json({ message: 'Total ticket quantity exceeds capacity' });
    }

    try {
        // Σε transaction, ώστε αν αποτύχει κάτι να μη μείνει μισό event στη βάση
        const newEvent = await sequelize.transaction(async (t) => {
            const event = await Event.create({
                event_id: `EV-${randomUUID()}`,
                title,
                event_type,
                venue,
                address,
                city,
                country,
                latitude,
                longitude,
                start_datetime,
                end_datetime,
                capacity,
                organizer_id: req.user.id,
                status: 'DRAFT',
                description,
            }, { transaction: t });

            // Δημιουργία Ticket Types με κωδικούς T1, T2, ... ανά event
            for (const [i, tt] of ticketTypes.entries()) {
                await TicketType.create({
                    event_id: event.id,
                    ticket_type_id: `T${i + 1}`,
                    name: tt.name,
                    price: tt.price,
                    quantity: tt.quantity,
                    available: tt.quantity,
                }, { transaction: t });
            }

            if (categories && categories.length) {
                const categoryInstances = await Category.findAll({ where: { name: categories }, transaction: t });
                await event.addCategories(categoryInstances, { transaction: t });
            }
            return event;
        });

        res.status(201).json(newEvent);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Λήψη όλων των events (με φίλτρα, σελιδοποίηση) – για όλους
exports.getEvents = async (req, res) => {
    const { category, title, startDate, endDate, city } = req.query;
    // Τα query params έρχονται ως strings: τα κάνουμε θετικούς ακεραίους (το limit έως 100)
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;
    const where = { status: 'PUBLISHED' };
    if (title) where.title = { [Op.like]: `%${title}%` };
    if (city) where.city = city;
    if (startDate) where.start_datetime = { [Op.gte]: new Date(startDate) };
    if (endDate) where.end_datetime = { [Op.lte]: new Date(endDate) };
    try {
        // Για το φίλτρο κατηγορίας βρίσκουμε πρώτα τα ids, ώστε κάθε event να έρχεται με όλες τις κατηγορίες του
        if (category) {
            const inCategory = await Event.findAll({
                attributes: ['id'],
                include: [{ model: Category, where: { name: category }, attributes: [] }],
            });
            where.id = inCategory.map(e => e.id);
        }

        const events = await Event.findAndCountAll({
            where,
            include: [{ model: TicketType }, { model: Category }],
            distinct: true, // αλλιώς το count μετράει τις γραμμές του join
            limit,
            offset,
            order: [['start_datetime', 'ASC']]
        });
        res.json({ events: events.rows, total: events.count, page, totalPages: Math.ceil(events.count / limit) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Καταγραφή προβολής (χρησιμοποιείται από το recommender)
exports.recordEventView = async (req, res) => {
    try {
        const event = await Event.findByPk(req.params.id);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        await EventView.create({ user_id: req.user.id, event_id: event.id });
        res.status(201).json({ message: 'View recorded' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Βοηθητική: βρίσκει το event και ελέγχει ότι ανήκει στον organizer που κάνει το αίτημα
async function findOwnEvent(req, res) {
    const event = await Event.findByPk(req.params.id);
    if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return null;
    }
    if (event.organizer_id !== req.user.id) {
        res.status(403).json({ message: 'You can only manage your own events' });
        return null;
    }
    return event;
}

// Λήψη ενός event με τα εισιτήρια και τις κατηγορίες του
exports.getEventById = async (req, res) => {
    try {
        const event = await Event.findByPk(req.params.id, {
            include: [
                { model: TicketType },
                { model: Category },
                { model: User, as: 'organizer', attributes: ['id', 'username'] }
            ]
        });
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Ενημέρωση event (μόνο ο organizer του, όχι αν είναι ακυρωμένο/ολοκληρωμένο)
exports.updateEvent = async (req, res) => {
    try {
        const event = await findOwnEvent(req, res);
        if (!event) return;
        if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
            return res.status(400).json({ message: `Cannot update a ${event.status} event` });
        }

        // Αλλάζουμε μόνο αυτά τα πεδία (όχι status, organizer_id κλπ.)
        const allowed = ['title', 'event_type', 'venue', 'address', 'city', 'country', 'latitude',
                         'longitude', 'start_datetime', 'end_datetime', 'capacity', 'description'];
        const updates = {};
        for (const field of allowed) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }

        if (updates.start_datetime !== undefined || updates.end_datetime !== undefined) {
            const datesError = validateDates(updates.start_datetime ?? event.start_datetime,
                                             updates.end_datetime ?? event.end_datetime);
            if (datesError) return res.status(400).json({ message: datesError });
        }
        if (updates.capacity !== undefined) {
            if (!(Number.isInteger(updates.capacity) && updates.capacity > 0)) {
                return res.status(400).json({ message: 'capacity must be a positive integer' });
            }
            const totalTickets = await TicketType.sum('quantity', { where: { event_id: event.id } }) || 0;
            if (updates.capacity < totalTickets) {
                return res.status(400).json({ message: `Capacity cannot be less than total ticket quantity (${totalTickets})` });
            }
        }

        await event.update(updates);
        res.json(event);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Δημοσίευση event: DRAFT -> PUBLISHED, μόνο αν έχει τουλάχιστον έναν τύπο εισιτηρίου
exports.publishEvent = async (req, res) => {
    try {
        const event = await findOwnEvent(req, res);
        if (!event) return;
        if (event.status !== 'DRAFT') {
            return res.status(400).json({ message: 'Only DRAFT events can be published' });
        }

        const ticketCount = await TicketType.count({ where: { event_id: event.id } });
        if (ticketCount === 0) {
            return res.status(400).json({ message: 'Add at least one ticket type before publishing' });
        }

        await event.update({ status: 'PUBLISHED' });
        res.json(event);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Προσθήκη τύπου εισιτηρίου σε υπάρχον event (DRAFT ή PUBLISHED), χωρίς να ξεπεραστεί το capacity
exports.addTicketType = async (req, res) => {
    if (!isValidTicketType(req.body)) {
        return res.status(400).json({ message: 'Ticket type must have name, price >= 0 and a positive integer quantity' });
    }
    const { name, price, quantity } = req.body;
    try {
        const event = await findOwnEvent(req, res);
        if (!event) return;
        if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
            return res.status(400).json({ message: `Cannot add tickets to a ${event.status} event` });
        }

        const existing = await TicketType.findAll({ where: { event_id: event.id } });
        const totalTickets = existing.reduce((sum, tt) => sum + tt.quantity, 0);
        if (totalTickets + quantity > event.capacity) {
            return res.status(400).json({ message: `Total ticket quantity would exceed capacity (${event.capacity})` });
        }

        const ticketType = await TicketType.create({
            event_id: event.id,
            ticket_type_id: `T${existing.length + 1}`,
            name,
            price,
            quantity,
            available: quantity,
        });
        res.status(201).json(ticketType);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Διαγραφή event: επιτρέπεται μόνο όσο είναι DRAFT (δεν έχει κρατήσεις)
exports.deleteEvent = async (req, res) => {
    try {
        const event = await findOwnEvent(req, res);
        if (!event) return;
        if (event.status !== 'DRAFT') {
            return res.status(400).json({ message: 'Only DRAFT events can be deleted. Cancel it instead.' });
        }
        await event.destroy();
        res.json({ message: 'Event deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Ακύρωση event: το event και όλες οι κρατήσεις του γίνονται CANCELLED μαζί (transaction)
exports.cancelEvent = async (req, res) => {
    try {
        const event = await findOwnEvent(req, res);
        if (!event) return;
        if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
            return res.status(400).json({ message: `Event is already ${event.status}` });
        }

        const { cancelledBookings, notifiedAttendees } = await sequelize.transaction(async (t) => {
            const activeBookings = { event_id: event.id, booking_status: { [Op.ne]: 'CANCELLED' } };
            // Βρίσκουμε τους συμμετέχοντες πριν ακυρωθούν οι κρατήσεις
            const attendees = await Booking.findAll({
                where: activeBookings, attributes: ['attendee_id'], group: ['attendee_id'], transaction: t,
            });

            await event.update({ status: 'CANCELLED' }, { transaction: t });
            const [count] = await Booking.update(
                { booking_status: 'CANCELLED' },
                { where: activeBookings, transaction: t }
            );

            // Μήνυμα σε κάθε συμμετέχοντα (ο organizer μπορεί να δώσει δικό του κείμενο στο reason)
            const body = req.body?.reason ||
                `The event "${event.title}" has been cancelled by the organizer. Your booking has been cancelled.`;
            await Message.bulkCreate(attendees.map(b => ({
                sender_id: req.user.id,
                receiver_id: b.attendee_id,
                event_id: event.id,
                subject: `Event cancelled: ${event.title}`.slice(0, 200),
                body,
            })), { transaction: t });

            return { cancelledBookings: count, notifiedAttendees: attendees.length };
        });

        res.json({ message: 'Event cancelled', cancelledBookings, notifiedAttendees });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};