const { User, Role } = require('../models');
const jwt = require('jsonwebtoken');

// Εγγραφή χρήστη: ξεκινάει ως participant και περιμένει έγκριση από τον admin
exports.register = async (req, res) => {
    const { username, password, first_name, last_name, email, phone, address, afm } = req.body;

    if (!username || !password || !first_name || !last_name || !email) {
        return res.status(400).json({ message: 'username, password, first_name, last_name and email are required' });
    }

    try {
        if (await User.findOne({ where: { username } })) {
            return res.status(400).json({ message: 'Username already exists' });
        }
        if (await User.findOne({ where: { email } })) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        // Το password γίνεται hash στο beforeCreate hook του μοντέλου
        const user = await User.create({
            username, password_hash: password, first_name, last_name, email, phone, address, afm,
        });
        const participant = await Role.findOne({ where: { name: 'participant' } });
        await user.addRole(participant);

        res.status(201).json({ message: 'User registered successfully. Awaiting admin approval.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ where: { username }, include: Role });

        // Πρώτα ο κωδικός, ώστε το "not approved" να μη δείχνει ότι υπάρχει ο λογαριασμός
        if (!user || !password || !(await user.validatePassword(password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        if (!user.approved) {
            return res.status(403).json({ message: 'Account not approved by admin' });
        }

        const roles = user.Roles.map(r => r.name);
        const token = jwt.sign({ id: user.id, username: user.username, roles }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({ token, user: { id: user.id, username: user.username, email: user.email, roles } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
