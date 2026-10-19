const { Event, TicketType, Booking, Category, User, Role } = require('../models');
const xmlbuilder = require('xmlbuilder');

// Λίστα χρηστών που περιμένουν έγκριση
exports.getPendingUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            where: { approved: false },
            attributes: { exclude: ['password_hash'] },
            include: { model: Role, attributes: ['name'], through: { attributes: [] } },
        });
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Έγκριση χρήστη (μετά μπορεί να κάνει login)
exports.approveUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        await user.update({ approved: true });
        res.json({ message: `User ${user.username} approved` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Ανάθεση ρόλου σε χρήστη, π.χ. body: { "role": "organizer" }
exports.assignRole = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const role = await Role.findOne({ where: { name: req.body.role } });
        if (!role) return res.status(400).json({ message: 'Role must be admin, organizer or participant' });

        await user.addRole(role);
        res.json({ message: `Role ${role.name} assigned to ${user.username}. The user must log in again.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Όλα τα events με ό,τι χρειάζεται για την εξαγωγή
function getAllEvents() {
    return Event.findAll({
        include: [
            { model: TicketType },
            { model: Booking, include: ['attendee', TicketType] },
            { model: Category },
            { model: User, as: 'organizer' },
        ],
    });
}

// Εξαγωγή σε XML σύμφωνα με το DTD της εργασίας
exports.exportEventsToXML = async (req, res) => {
    try {
        const events = await getAllEvents();
        const root = xmlbuilder.create('Events', { version: '1.0', encoding: 'UTF-8' });

        for (const ev of events) {
            const e = root.ele('Event', { EventID: ev.event_id });
            e.ele('Title', ev.title);
            ev.Categories.forEach(c => e.ele('Category', c.name));
            e.ele('EventType', ev.event_type);
            e.ele('Venue', ev.venue);
            e.ele('Address', ev.address);
            e.ele('City', ev.city);
            e.ele('Country', ev.country);
            if (ev.latitude && ev.longitude) {
                e.ele('GeoLocation', { Latitude: ev.latitude, Longitude: ev.longitude });
            }
            e.ele('StartDateTime', ev.start_datetime.toISOString());
            e.ele('EndDateTime', ev.end_datetime.toISOString());
            e.ele('Capacity', ev.capacity);

            const tickets = e.ele('TicketTypes');
            for (const tt of ev.TicketTypes) {
                const t = tickets.ele('TicketType', { TicketTypeID: tt.ticket_type_id });
                t.ele('Name', tt.name);
                t.ele('Price', tt.price);
                t.ele('Quantity', tt.quantity);
                t.ele('Available', tt.available);
            }

            const bookings = e.ele('Bookings');
            for (const b of ev.Bookings) {
                const bk = bookings.ele('Booking', { BookingID: b.booking_id });
                bk.ele('Attendee', { UserID: b.attendee.username });
                bk.ele('Time', b.booking_time.toISOString());
                bk.ele('TicketTypeRef', b.TicketType.ticket_type_id);
                bk.ele('NumberOfTickets', b.number_of_tickets);
                bk.ele('TotalCost', b.total_cost);
                bk.ele('BookingStatus', b.booking_status);
            }

            e.ele('Organizer', { UserID: ev.organizer.username });
            e.ele('Status', ev.status);
            e.ele('Description', ev.description || '');
            e.ele('Media'); // δεν αποθηκεύουμε φωτογραφίες, αλλά το στοιχείο υπάρχει στο DTD
        }

        res.type('application/xml').send(root.end({ pretty: true }));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Εξαγωγή σε JSON με την ίδια δομή με το XML
exports.exportEventsToJSON = async (req, res) => {
    try {
        const events = await getAllEvents();
        res.json(events.map(ev => ({
            Event: {
                EventID: ev.event_id,
                Title: ev.title,
                Category: ev.Categories.map(c => c.name),
                EventType: ev.event_type,
                Venue: ev.venue,
                Address: ev.address,
                City: ev.city,
                Country: ev.country,
                GeoLocation: ev.latitude ? { Latitude: ev.latitude, Longitude: ev.longitude } : null,
                StartDateTime: ev.start_datetime,
                EndDateTime: ev.end_datetime,
                Capacity: ev.capacity,
                TicketTypes: ev.TicketTypes.map(tt => ({
                    TicketType: {
                        TicketTypeID: tt.ticket_type_id,
                        Name: tt.name,
                        Price: tt.price,
                        Quantity: tt.quantity,
                        Available: tt.available,
                    },
                })),
                Bookings: ev.Bookings.map(b => ({
                    Booking: {
                        BookingID: b.booking_id,
                        Attendee: { UserID: b.attendee.username },
                        Time: b.booking_time,
                        TicketTypeRef: b.TicketType.ticket_type_id,
                        NumberOfTickets: b.number_of_tickets,
                        TotalCost: b.total_cost,
                        BookingStatus: b.booking_status,
                    },
                })),
                Organizer: { UserID: ev.organizer.username },
                Status: ev.status,
                Description: ev.description,
            },
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
