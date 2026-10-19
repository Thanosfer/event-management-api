// Δημιουργεί (ή ενημερώνει) τον admin με σωστό bcrypt hash.
// Χρήση: npm run create-admin -- <username> <password>
const bcrypt = require('bcrypt');
const { User, Role, sequelize } = require('../models');

(async () => {
    const [username, password] = process.argv.slice(2);
    if (!username || !password) {
        console.log('Usage: npm run create-admin -- <username> <password>');
        process.exit(1);
    }

    try {
        const adminRole = await Role.findOne({ where: { name: 'admin' } });
        if (!adminRole) throw new Error('Role admin not found. Run db/schema.sql first.');

        let user = await User.findOne({ where: { username } });
        if (user) {
            // Το hook κάνει hash μόνο στο create, οπότε εδώ το κάνουμε μόνοι μας
            const hash = await bcrypt.hash(password, 10);
            await user.update({ password_hash: hash, approved: true });
            console.log(`Updated password for ${username}`);
        } else {
            user = await User.create({
                username,
                password_hash: password, // γίνεται hash από το beforeCreate hook
                first_name: 'Admin',
                last_name: 'User',
                email: `${username}@example.com`,
                approved: true,
            });
            console.log(`Created user ${username}`);
        }

        await user.addRole(adminRole);
        console.log(`${username} is now an approved admin`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
})();
