const express = require('express');
const bodyParser = require('body-parser');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const client = require('./db'); // Connexion à la base de données
require('dotenv').config();

const app = express();
app.use(bodyParser.json()); // Middleware pour parser le JSON

const SECRET_KEY = process.env.SECRET_KEY;

// Route principale (GET /)
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// Middleware pour vérifier les tokens JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant ou invalide.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded; // Stocker les infos utilisateur dans req
    next();
  } catch (err) {
    res.status(403).json({ error: 'Token invalide ou expiré.' });
  }
}

// Route : Authentification utilisateur (POST /login)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  try {
    const query = 'SELECT * FROM utilisateur WHERE email = $1';
    const result = await client.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcryptjs.compare(password, user.mot_de_passe);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });

    res.json({ message: 'Connexion réussie.', token });
  } catch (err) {
    console.error('Erreur lors de l\'authentification :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

// Route : Récupérer les informations de l'utilisateur connecté (GET /utilisateur)
app.get('/utilisateur', authenticateToken, async (req, res) => {
  try {
    const query = 'SELECT * FROM utilisateur WHERE id = $1';
    const result = await client.query(query, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur lors de la récupération des informations utilisateur :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

const { app: messagerieApp, setupWebSocket } = require('./messagerie');
app.use('/messagerie', messagerieApp);

const userRoutes = require('./user');
app.use('/utilisateur', userRoutes); // Ajouter le préfixe /utilisateur


app.get('/carte', (req, res) => {
  res.sendFile(path.join(__dirname, 'carte.html'));
});

// Route pour les erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

// Exporter l'application pour Vercel
module.exports = app;
