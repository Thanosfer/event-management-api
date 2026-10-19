const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { createBooking, getMyBookings, cancelBooking } = require('../controllers/bookingController');
const router = express.Router();

router.use(protect); // όλες οι κρατήσεις require auth
router.post('/', authorize('participant'), createBooking);
router.get('/my', authorize('participant'), getMyBookings);
router.put('/:id/cancel', authorize('participant'), cancelBooking);

module.exports = router;