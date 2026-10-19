const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Δεν έχει δική του στήλη id: το primary key είναι (user_id, event_id, viewed_at)
const EventView = sequelize.define('EventView', {
    user_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    event_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    viewed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, primaryKey: true },
}, { tableName: 'event_views', timestamps: false });

module.exports = EventView;
