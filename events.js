const express = require('express');
const client = require('./db'); // Import de la connexion à la base de données
const router = express.Router(); // Utilisation de Router pour définir les routes

// Route pour récupérer les événements
router.get('/', async (req, res) => {
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

    // Transformation des résultats en un format JSON spécifique
    const markers = result.rows.map(event => ({
      id: event.id,
      position: {
        lat: event.latitude,
        lng: event.longitude
      },
      popup: {
        title: event.titre,
        description: event.description,
        date: event.date,
        time: event.heure
      }
    }));

    // Retourne les marqueurs sous forme de JSON
    res.json(markers);
  } catch (error) {
    console.error('Erreur lors de la récupération des événements :', error);
    res.status(500).json({ error: 'Une erreur est survenue lors de la récupération des événements.' });
  }
});

// Export du router pour utilisation dans `server.js`
module.exports = router;
