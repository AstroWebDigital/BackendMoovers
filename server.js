// server.js
const express = require('express');
const bodyParser = require('body-parser');
const client = require('./db');

const app = express();
app.use(bodyParser.json());


app.get('/utilisateur', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM utilisateur');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur lors de la récupération des utilisateurs', err);
    res.status(500).send('Erreur du serveur');
  }
});

// Lancer le serveur sur le port 3000
const port = 3000;
app.listen(port, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${port}`);
});
