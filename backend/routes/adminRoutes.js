const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { exportEventsToXML, exportEventsToJSON, getPendingUsers, approveUser, assignRole } = require('../controllers/adminController');
const router = express.Router();

router.use(protect, authorize('admin'));

router.get('/users/pending', getPendingUsers);
router.put('/users/:id/approve', approveUser);
router.put('/users/:id/role', assignRole);

router.get('/export/xml', exportEventsToXML);
router.get('/export/json', exportEventsToJSON);

module.exports = router;