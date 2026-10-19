const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Event = sequelize.define('Event', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    event_id: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    event_type: DataTypes.STRING(50),
    venue: DataTypes.STRING(100),
    address: DataTypes.STRING(200),
    city: DataTypes.STRING(50),
    country: DataTypes.STRING(50),
    latitude: DataTypes.DECIMAL(10,8),
    longitude: DataTypes.DECIMAL(11,8),
    start_datetime: { type: DataTypes.DATE, allowNull: false },
    end_datetime: { type: DataTypes.DATE, allowNull: false },
    capacity: { type: DataTypes.INTEGER, allowNull: false },
    organizer_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('DRAFT','PUBLISHED','COMPLETED','CANCELLED'), defaultValue: 'DRAFT' },
    description: DataTypes.TEXT,
}, { tableName: 'events', timestamps: false });

module.exports = Event;