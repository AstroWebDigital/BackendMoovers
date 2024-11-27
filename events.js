const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const client = require('./db'); // Connexion à la base de données
require('dotenv').config();

const app = express();
app.use(bodyParser.json()); // Middleware pour parser le JSON

const SECRET_KEY = process.env.SECRET_KEY;

// Route pour récupérer les événements
app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query(`
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

    res.json(result.rows); // Retourne les événements sous forme de JSON
  } catch (error) {
    console.error('Erreur lors de la récupération des événements :', error);
    res.status(500).json({ error: 'Une erreur est survenue lors de la récupération des événements.' });
  }
});

// Export pour Vercel
module.exports = app;
