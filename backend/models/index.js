const sequelize = require('../config/database');

// Εισαγωγή όλων των μοντέλων (χωρίς σχέσεις)
const User = require('./User');
const Role = require('./Role');
const Event = require('./Event');
const TicketType = require('./TicketType');
const Booking = require('./Booking');
const Category = require('./Category');
const Message = require('./Message');
const EventView = require('./EventView');

// Ορισμός σχέσεων ΜΕΤΑ που όλα τα μοντέλα είναι διαθέσιμα

// User - Role (many-to-many)
User.belongsToMany(Role, { through: 'user_roles', foreignKey: 'user_id', otherKey: 'role_id', timestamps: false });
Role.belongsToMany(User, { through: 'user_roles', foreignKey: 'role_id', otherKey: 'user_id', timestamps: false });

// Event - Organizer (User)
Event.belongsTo(User, { as: 'organizer', foreignKey: 'organizer_id' });
User.hasMany(Event, { foreignKey: 'organizer_id' });

// Event - TicketType (one-to-many)
Event.hasMany(TicketType, { foreignKey: 'event_id' });
TicketType.belongsTo(Event, { foreignKey: 'event_id' });

// Event - Booking (one-to-many)
Event.hasMany(Booking, { foreignKey: 'event_id' });
Booking.belongsTo(Event, { foreignKey: 'event_id' });

// User - Booking (attendee)
User.hasMany(Booking, { as: 'bookings', foreignKey: 'attendee_id' });
Booking.belongsTo(User, { as: 'attendee', foreignKey: 'attendee_id' });

// TicketType - Booking
TicketType.hasMany(Booking, { foreignKey: 'ticket_type_id' });
Booking.belongsTo(TicketType, { foreignKey: 'ticket_type_id' });

// Event - Category (many-to-many)
Event.belongsToMany(Category, { through: 'event_categories', foreignKey: 'event_id', otherKey: 'category_id', timestamps: false });
Category.belongsToMany(Event, { through: 'event_categories', foreignKey: 'category_id', otherKey: 'event_id', timestamps: false });

// Message relations
Message.belongsTo(User, { as: 'sender', foreignKey: 'sender_id' });
Message.belongsTo(User, { as: 'receiver', foreignKey: 'receiver_id' });
Message.belongsTo(Event, { foreignKey: 'event_id' });
User.hasMany(Message, { as: 'sentMessages', foreignKey: 'sender_id' });
User.hasMany(Message, { as: 'receivedMessages', foreignKey: 'receiver_id' });

// EventView relations
EventView.belongsTo(User, { foreignKey: 'user_id' });
EventView.belongsTo(Event, { foreignKey: 'event_id' });

module.exports = {
    sequelize,
    User,
    Role,
    Event,
    TicketType,
    Booking,
    Category,
    Message,
    EventView,
};