const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TicketType = sequelize.define('TicketType', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    event_id: { type: DataTypes.INTEGER, allowNull: false },
    ticket_type_id: { type: DataTypes.STRING(20), allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    price: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    available: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'ticket_types', timestamps: false });

module.exports = TicketType;