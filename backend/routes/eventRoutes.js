const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { createEvent, getEvents, getEventById, updateEvent, deleteEvent, cancelEvent, publishEvent, addTicketType, recordEventView } = require('../controllers/eventController');
const router = express.Router();

router.route('/')
    .get(getEvents)
    .post(protect, authorize('organizer'), createEvent);

router.route('/:id')
    .get(getEventById)
    .put(protect, authorize('organizer'), updateEvent)
    .delete(protect, authorize('organizer'), deleteEvent);

router.post('/:id/ticket-types', protect, authorize('organizer'), addTicketType);
router.put('/:id/publish', protect, authorize('organizer'), publishEvent);
router.put('/:id/cancel', protect, authorize('organizer'), cancelEvent);

router.post('/:id/view', protect, recordEventView);

module.exports = router;