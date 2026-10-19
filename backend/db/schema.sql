CREATE DATABASE event_db;
USE event_db;

-- =============================================
-- Βάση: event_db
-- Πίνακες για την εφαρμογή διαχείρισης εκδηλώσεων
-- =============================================

-- 1. Πίνακας χρηστών
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    afm VARCHAR(20),
    approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Πίνακας ρόλων
CREATE TABLE IF NOT EXISTS roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name ENUM('admin', 'organizer', 'participant') NOT NULL UNIQUE
);

-- 3. Σχέση χρήστη-ρόλου (πολλοί-προς-πολλούς)
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 4. Πίνακας εκδηλώσεων
CREATE TABLE IF NOT EXISTS events (
    id INT PRIMARY KEY AUTO_INCREMENT,
    event_id VARCHAR(40) UNIQUE NOT NULL,  -- π.χ. EV-<uuid>
    title VARCHAR(200) NOT NULL,
    event_type VARCHAR(50),
    venue VARCHAR(100),
    address VARCHAR(200),
    city VARCHAR(50),
    country VARCHAR(50),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    organizer_id INT NOT NULL,
    status ENUM('DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
    -- Έλεγχος: η ημερομηνία έναρξης προηγείται της λήξης
    CHECK (start_datetime < end_datetime)
);

-- 5. Πίνακας κατηγοριών (Categories)
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- 6. Σχέση εκδήλωσης-κατηγορίας (πολλές-προς-πολλές)
CREATE TABLE IF NOT EXISTS event_categories (
    event_id INT NOT NULL,
    category_id INT NOT NULL,
    PRIMARY KEY (event_id, category_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- 7. Πίνακας τύπων εισιτηρίων
CREATE TABLE IF NOT EXISTS ticket_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    event_id INT NOT NULL,
    ticket_type_id VARCHAR(20) NOT NULL,   -- π.χ. T1
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    quantity INT NOT NULL CHECK (quantity >= 0),
    available INT NOT NULL CHECK (available >= 0),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE KEY (event_id, ticket_type_id)
);

-- 8. Πίνακας κρατήσεων
CREATE TABLE IF NOT EXISTS bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id VARCHAR(40) UNIQUE NOT NULL,   -- π.χ. B-<uuid>
    event_id INT NOT NULL,
    attendee_id INT NOT NULL,
    ticket_type_id INT NOT NULL,
    number_of_tickets INT NOT NULL CHECK (number_of_tickets > 0),
    total_cost DECIMAL(10,2) NOT NULL CHECK (total_cost >= 0),
    booking_status ENUM('PENDING', 'CONFIRMED', 'CANCELLED') DEFAULT 'CONFIRMED',
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (attendee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
);

-- 9. Πίνακας μηνυμάτων (messaging)
CREATE TABLE IF NOT EXISTS messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    event_id INT NULL,    -- μπορεί να σχετίζεται με εκδήλωση (π.χ. μαζική ειδοποίηση)
    subject VARCHAR(200),
    body TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    is_deleted_by_sender BOOLEAN DEFAULT FALSE,
    is_deleted_by_receiver BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

-- 10. Πίνακας προβολών εκδηλώσεων (για το σύστημα συστάσεων)
CREATE TABLE IF NOT EXISTS event_views (
    user_id INT NOT NULL,
    event_id INT NOT NULL,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, event_id, viewed_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- =============================================
-- Δημιουργία αρχικών εγγραφών (seed data)
-- =============================================

-- Εισαγωγή ρόλων
INSERT IGNORE INTO roles (id, name) VALUES (1, 'admin'), (2, 'organizer'), (3, 'participant');

-- Δημιουργία διαχειριστή (admin) με placeholder hash: ΔΕΝ μπορεί να κάνει login ακόμα.
-- Για να ορίσετε πραγματικό κωδικό τρέξτε από τον φάκελο backend:
--   npm run create-admin -- admin <κωδικός>
-- Το script αποθηκεύει σωστό bcrypt hash.
INSERT IGNORE INTO users (id, username, password_hash, first_name, last_name, email, approved)
VALUES (1, 'admin', 'admin123_placeholder_hash', 'Admin', 'User', 'admin@example.com', TRUE);

-- Ανάθεση ρόλου admin
INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (1, 1);

-- Εισαγωγή μερικών κατηγοριών για παράδειγμα
INSERT IGNORE INTO categories (name) VALUES 
('Music'), ('Theatre'), ('Seminar'), ('Sport'), ('Conference'), ('Live Performance');

-- Ο έλεγχος sum(quantity) <= capacity γίνεται στο backend.
