const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
    sendMessage,
    getInbox,
    getSent,
    deleteMessage,
    notifyEventAttendees,
    markAsRead,
} = require('../controllers/messageController');

const router = express.Router();

// Όλες απαιτούν authentication
router.use(protect);

router.post('/', sendMessage);
router.get('/inbox', getInbox);
router.get('/sent', getSent);
router.delete('/:id', deleteMessage);
router.put('/:id/read', markAsRead);
router.post('/event/:eventId/notify', notifyEventAttendees);

module.exports = router;