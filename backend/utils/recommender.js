const fs = require('fs').promises;
const path = require('path');
const { Op } = require('sequelize');
const { Event, Booking, EventView } = require('../models');
const { getAllRatings } = require('./prepareRatings');

const MODEL_PATH = path.join(__dirname, '..', 'recommender_model.json');

// Matrix factorization με biases, εκπαίδευση με SGD
class BiasedMF {
    constructor(numFactors = 10, learningRate = 0.01, regularization = 0.05, epochs = 100) {
        this.K = numFactors;
        this.alpha = learningRate;
        this.lambda = regularization;
        this.epochs = epochs;
        this.userFactors = new Map();     // user_id -> array μήκους K
        this.itemFactors = new Map();     // event_id -> array μήκους K
        this.userBias = new Map();
        this.itemBias = new Map();
        this.globalMean = 0;
    }

    train(ratings) {
        this.globalMean = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

        // Αρχικοποίηση με μικρές τυχαίες τιμές
        const randomVector = () => Array.from({ length: this.K }, () => (Math.random() - 0.5) * 0.1);
        for (const r of ratings) {
            if (!this.userFactors.has(r.user_id)) {
                this.userBias.set(r.user_id, 0);
                this.userFactors.set(r.user_id, randomVector());
            }
            if (!this.itemFactors.has(r.event_id)) {
                this.itemBias.set(r.event_id, 0);
                this.itemFactors.set(r.event_id, randomVector());
            }
        }

        for (let epoch = 0; epoch < this.epochs; epoch++) {
            let totalError = 0;
            for (const { user_id: u, event_id: i, rating } of ratings) {
                const err = rating - this.predict(u, i);
                totalError += err * err;

                const bu = this.userBias.get(u);
                const bi = this.itemBias.get(i);
                this.userBias.set(u, bu + this.alpha * (err - this.lambda * bu));
                this.itemBias.set(i, bi + this.alpha * (err - this.lambda * bi));

                const pu = this.userFactors.get(u);
                const qi = this.itemFactors.get(i);
                for (let k = 0; k < this.K; k++) {
                    const pu_k = pu[k];
                    pu[k] += this.alpha * (err * qi[k] - this.lambda * pu_k);
                    qi[k] += this.alpha * (err * pu_k - this.lambda * qi[k]);
                }
            }
            if (epoch % 10 === 0) console.log(`Epoch ${epoch}, MSE = ${totalError / ratings.length}`);
        }
    }

    predict(userId, eventId) {
        if (!this.userFactors.has(userId) || !this.itemFactors.has(eventId)) return this.globalMean;
        const pu = this.userFactors.get(userId);
        const qi = this.itemFactors.get(eventId);
        let pred = this.globalMean + this.userBias.get(userId) + this.itemBias.get(eventId);
        for (let k = 0; k < this.K; k++) pred += pu[k] * qi[k];
        return pred;
    }

    async saveModel(filePath) {
        const model = {
            K: this.K,
            globalMean: this.globalMean,
            userBias: Object.fromEntries(this.userBias),
            itemBias: Object.fromEntries(this.itemBias),
            userFactors: Object.fromEntries(this.userFactors),
            itemFactors: Object.fromEntries(this.itemFactors),
        };
        await fs.writeFile(filePath, JSON.stringify(model));
    }

    async loadModel(filePath) {
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        // Τα κλειδιά του JSON είναι strings, τα κάνουμε πάλι αριθμούς
        const toMap = obj => new Map(Object.entries(obj).map(([k, v]) => [parseInt(k), v]));
        this.K = data.K;
        this.globalMean = data.globalMean;
        this.userBias = toMap(data.userBias);
        this.itemBias = toMap(data.itemBias);
        this.userFactors = toMap(data.userFactors);
        this.itemFactors = toMap(data.itemFactors);
    }
}

// Έχουμε μόνο θετικά δεδομένα (προβολές, κρατήσεις). Για να μάθει το μοντέλο και τι δεν αρέσει
// στον χρήστη, προσθέτουμε για κάθε χρήστη τυχαία events που δεν έχει δει, με βαθμολογία 0.
function addNegativeSamples(ratings, eventIds, ratio = 5) {
    const seen = new Map();
    for (const r of ratings) {
        if (!seen.has(r.user_id)) seen.set(r.user_id, new Set());
        seen.get(r.user_id).add(r.event_id);
    }

    const negatives = [];
    for (const [userId, userSeen] of seen) {
        const candidates = eventIds.filter(id => !userSeen.has(id));
        const count = Math.min(candidates.length, userSeen.size * ratio);
        for (let n = 0; n < count; n++) {
            const idx = Math.floor(Math.random() * candidates.length);
            negatives.push({ user_id: userId, event_id: candidates.splice(idx, 1)[0], rating: 0 });
        }
    }

    // Ανακάτεμα, ώστε το SGD να μη βλέπει πρώτα όλα τα θετικά και μετά όλα τα αρνητικά
    return [...ratings, ...negatives].sort(() => Math.random() - 0.5);
}

async function trainAndSaveModel() {
    const ratings = await getAllRatings();
    if (ratings.length === 0) {
        console.log('No ratings found, skipping training.');
        return;
    }
    const events = await Event.findAll({ where: { status: { [Op.ne]: 'DRAFT' } }, attributes: ['id'] });
    const trainingData = addNegativeSamples(ratings, events.map(e => e.id));

    const mf = new BiasedMF();
    mf.train(trainingData);
    await mf.saveModel(MODEL_PATH);
    console.log(`Model saved to ${MODEL_PATH}`);
}

// Προτείνει events που ο χρήστης δεν έχει ήδη δει ή κλείσει
async function getRecommendations(userId, topN = 5) {
    const mf = new BiasedMF();
    try {
        await mf.loadModel(MODEL_PATH);
    } catch (err) {
        return []; // δεν έχει εκπαιδευτεί ακόμα μοντέλο
    }
    if (!mf.userFactors.has(userId)) return []; // ο χρήστης δεν είχε ιστορικό στην εκπαίδευση

    const events = await Event.findAll({ where: { status: 'PUBLISHED' }, attributes: ['id', 'event_id', 'title'] });
    const bookings = await Booking.findAll({ where: { attendee_id: userId }, attributes: ['event_id'] });
    const views = await EventView.findAll({ where: { user_id: userId }, attributes: ['event_id'] });
    const seen = new Set([...bookings, ...views].map(x => x.event_id));

    return events
        .filter(e => !seen.has(e.id))
        .map(e => ({ event: e, score: mf.predict(userId, e.id) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map(p => p.event);
}

module.exports = { trainAndSaveModel, getRecommendations };
