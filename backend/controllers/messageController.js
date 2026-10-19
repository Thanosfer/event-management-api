const { Message, User, Event, Booking } = require('../models');

// Αποστολή μηνύματος σε άλλον χρήστη (προαιρετικά σχετικό με ένα event)
exports.sendMessage = async (req, res) => {
    const { receiver_id, event_id, subject, body } = req.body;

    if (!receiver_id || !body || !String(body).trim()) {
        return res.status(400).json({ message: 'receiver_id and body are required' });
    }

    try {
        const receiver = await User.findByPk(receiver_id);
        if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

        const message = await Message.create({
            sender_id: req.user.id,
            receiver_id,
            event_id: event_id || null,
            subject,
            body,
        });
        res.status(201).json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Εισερχόμενα (όσα δεν έχει σβήσει ο παραλήπτης)
exports.getInbox = async (req, res) => {
    try {
        const messages = await Message.findAll({
            where: { receiver_id: req.user.id, is_deleted_by_receiver: false },
            include: [
                { model: User, as: 'sender', attributes: ['id', 'username', 'first_name', 'last_name'] },
                { model: Event, attributes: ['id', 'title'] },
            ],
            order: [['sent_at', 'DESC']],
        });
        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Απεσταλμένα (όσα δεν έχει σβήσει ο αποστολέας)
exports.getSent = async (req, res) => {
    try {
        const messages = await Message.findAll({
            where: { sender_id: req.user.id, is_deleted_by_sender: false },
            include: [
                { model: User, as: 'receiver', attributes: ['id', 'username', 'first_name', 'last_name'] },
                { model: Event, attributes: ['id', 'title'] },
            ],
            order: [['sent_at', 'DESC']],
        });
        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Soft delete: το μήνυμα κρύβεται μόνο για όποιον το σβήνει
exports.deleteMessage = async (req, res) => {
    try {
        const message = await Message.findByPk(req.params.id);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        if (message.sender_id === req.user.id) {
            await message.update({ is_deleted_by_sender: true });
        } else if (message.receiver_id === req.user.id) {
            await message.update({ is_deleted_by_receiver: true });
        } else {
            return res.status(403).json({ message: 'Not authorized' });
        }
        res.json({ message: 'Message deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const message = await Message.findOne({ where: { id: req.params.id, receiver_id: req.user.id } });
        if (!message) return res.status(404).json({ message: 'Message not found' });

        await message.update({ is_read: true });
        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Ο organizer στέλνει μήνυμα σε όλους όσους έχουν κράτηση στο event του
exports.notifyEventAttendees = async (req, res) => {
    const { eventId } = req.params;
    const { subject, body } = req.body;

    if (!body || !String(body).trim()) {
        return res.status(400).json({ message: 'body is required' });
    }

    try {
        const event = await Event.findByPk(eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if (event.organizer_id !== req.user.id) {
            return res.status(403).json({ message: 'Not the organizer of this event' });
        }

        const bookings = await Booking.findAll({
            where: { event_id: eventId, booking_status: 'CONFIRMED' },
            attributes: ['attendee_id'],
            group: ['attendee_id'],
        });

        await Message.bulkCreate(bookings.map(b => ({
            sender_id: req.user.id,
            receiver_id: b.attendee_id,
            event_id: eventId,
            subject,
            body,
        })));
        res.json({ message: `Notifications sent to ${bookings.length} attendees` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
