const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcrypt');

const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    first_name: { type: DataTypes.STRING(50), allowNull: false },
    last_name: { type: DataTypes.STRING(50), allowNull: false },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    phone: DataTypes.STRING(20),
    address: DataTypes.TEXT,
    afm: DataTypes.STRING(20),
    approved: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    tableName: 'users',
    timestamps: false,
    hooks: {
        // Αποθηκεύουμε μόνο το hash του κωδικού
        beforeCreate: async (user) => {
            user.password_hash = await bcrypt.hash(user.password_hash, 10);
        },
    },
});

User.prototype.validatePassword = function (password) {
    return bcrypt.compare(password, this.password_hash);
};

module.exports = User;
