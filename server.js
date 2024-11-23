const express = require('express');
const bodyParser = require('body-parser');
const client = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const SECRET_KEY = process.env.SECRET_KEY;

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log("Requête reçue :", req.body); // Affiche les données envoyées par le client (email et mot de passe)

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  try {
    // Rechercher l'utilisateur dans la base de données
    const query = 'SELECT * FROM utilisateur WHERE email = $1';
    const result = await client.query(query, [email]);

    console.log("Résultat de la requête DB :", result.rows); // Affiche les données récupérées depuis la base

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const user = result.rows[0];

    // Vérifier que le mot de passe de l'utilisateur est défini
    if (!user.mot_de_passe) { // Ici on vérifie `mot_de_passe` au lieu de `password`
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }

    // Comparer le mot de passe fourni avec celui dans la base
    const passwordMatch = await bcrypt.compare(password, user.mot_de_passe); // On compare `password` avec `mot_de_passe`
    
    console.log("Mot de passe fourni :", password); // Affiche le mot de passe envoyé par l'utilisateur
    console.log("Mot de passe dans la base de données :", user.mot_de_passe); // Affiche le mot de passe hashé dans la base

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    // Générer un token JWT si la connexion est réussie
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });

    console.log("Token généré :", token); // Affiche le token JWT généré

    res.json({ message: 'Connexion réussie.', token });
  } catch (err) {
    console.error('Erreur lors de l\'authentification', err);
    res.status(500).send('Erreur du serveur');
  }
});

app.get('/utilisateur', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM utilisateur');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur lors de la récupération des utilisateurs', err);
    res.status(500).send('Erreur du serveur');
  }
});

// Lancer le serveur sur le port 3000 avec node server.js
const port = 3000;
app.listen(port, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${port}`);
});
