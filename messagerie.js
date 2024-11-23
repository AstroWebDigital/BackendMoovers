const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const client = require('./db'); // Connexion à la base de données
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const SALT_ROUNDS = 10; // Pour bcrypt
const SECRET_KEY = process.env.SECRET_KEY; // Assurez-vous que cette clé est définie dans votre fichier .env

// API pour envoyer un message
app.post('/messagerie/envoyer', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]; // Récupérer le token depuis l'en-tête Authorization
  const { destinataire_id, message } = req.body; // Récupérer les données du corps de la requête

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    // Décoder le token JWT pour récupérer l'ID de l'expéditeur
    const decoded = jwt.verify(token, SECRET_KEY);
    const expediteur_id = decoded.id; // ID de l'utilisateur connecté

    // Validation des champs requis
    if (!destinataire_id || !message) {
      return res.status(400).json({ error: 'destinataire_id et message sont requis.' });
    }

    // Vérifier si les utilisateurs sont amis
    const checkAmisQuery = `
      SELECT * FROM Amis
      WHERE (utilisateur_id = $1 AND ami_id = $2 AND statut = 'ACCEPTE')
         OR (utilisateur_id = $2 AND ami_id = $1 AND statut = 'ACCEPTE')
    `;
    const amisResult = await client.query(checkAmisQuery, [expediteur_id, destinataire_id]);

    if (amisResult.rows.length === 0) {
      return res.status(403).json({ error: 'Vous ne pouvez envoyer des messages qu’à vos amis.' });
    }

    // Insérer le message dans la table Messagerie
    const insertMessageQuery = `
      INSERT INTO Messagerie (expediteur_id, destinataire_id, message, date_envoye, statut)
      VALUES ($1, $2, $3, NOW(), 'ENVOYE')
      RETURNING *;
    `;
    const messageResult = await client.query(insertMessageQuery, [
      expediteur_id,
      destinataire_id,
      message,
    ]);

    res.status(201).json({
      message: 'Message envoyé avec succès.',
      details: messageResult.rows[0],
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide. Accès non autorisé.' });
    }
    console.error('Erreur lors de l\'envoi du message :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
