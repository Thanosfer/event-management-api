const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Booking = sequelize.define('Booking', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    booking_id: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    event_id: { type: DataTypes.INTEGER, allowNull: false },
    attendee_id: { type: DataTypes.INTEGER, allowNull: false },
    ticket_type_id: { type: DataTypes.INTEGER, allowNull: false },
    number_of_tickets: { type: DataTypes.INTEGER, allowNull: false },
    total_cost: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    booking_status: { type: DataTypes.ENUM('PENDING','CONFIRMED','CANCELLED'), defaultValue: 'CONFIRMED' },
    booking_time: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'bookings', timestamps: false });

module.exports = Booking;