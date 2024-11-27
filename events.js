const express = require('express');
const client = require('./db'); // Import de la connexion à la base de données
const router = express.Router(); // Utilisation du router Express

// Route pour récupérer les événements
router.get('/events', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT 
        id, 
        titre, 
        description, 
        date, 
        heure, 
        latitude, 
        longitude 
      FROM evenement
    `);

    // Retourne les événements sous forme de JSON
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des événements :', error);
    res.status(500).json({ error: 'Une erreur est survenue lors de la récupération des événements.' });
  }
});

// Exporter le router pour utilisation dans `server.js`
module.exports = router;
