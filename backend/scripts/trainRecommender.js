// Εκπαιδεύει το recommender με τα τρέχοντα δεδομένα της βάσης: npm run train-recommender
const { trainAndSaveModel } = require('../utils/recommender');
const { sequelize } = require('../models');

trainAndSaveModel().finally(() => sequelize.close());
