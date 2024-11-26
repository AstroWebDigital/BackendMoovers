const express = require('express');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const client = require('./db'); // Connexion à la base de données
require('dotenv').config();

const app = express();
app.use(express.json()); // Middleware pour parser le JSON

const SECRET_KEY = process.env.SECRET_KEY; // Assurez-vous que cette clé est définie dans votre fichier .env

// Gestion des connexions WebSocket
const webSocketClients = new Map(); // Map pour stocker les connexions actives

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    console.log('Nouvelle connexion WebSocket.');

    // Identifier l'utilisateur via un token JWT passé dans l'URL
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');
    if (!token) {
      ws.close();
      console.log('Connexion WebSocket fermée : token non fourni.');
      return;
    }

    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      const userId = decoded.id;

      // Ajouter la connexion au gestionnaire
      webSocketClients.set(userId, ws);

      console.log(`Utilisateur connecté au WebSocket : ${userId}`);

      // Gérer les messages reçus via WebSocket
      ws.on('message', (message) => {
        console.log(`Message WebSocket reçu de ${userId} : ${message}`);
      });

      // Supprimer la connexion lors de la déconnexion
      ws.on('close', () => {
        webSocketClients.delete(userId);
        console.log(`Connexion WebSocket fermée pour l'utilisateur : ${userId}`);
      });
    } catch (err) {
      console.error('Erreur lors du décodage du token JWT :', err);
      ws.close();
    }
  });

  return wss;
}

// Diffuser un message en temps réel via WebSocket
function broadcastToUser(userId, message) {
  const ws = webSocketClients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// API pour envoyer un message
app.post('/envoyer', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { destinataire_id, message } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const expediteur_id = decoded.id;

    if (!destinataire_id || !message) {
      return res.status(400).json({ error: 'destinataire_id et message sont requis.' });
    }

    // Vérifier si les utilisateurs sont amis
    const checkAmisQuery = `
      SELECT * FROM Amis
      WHERE (utilisateur_id = $1 AND ami_id = $2 AND statut = 'ACCEPTE')
         OR (utilisateur_id = $2 AND ami_id = $1 AND statut = 'ACCEPTE');
    `;
    const amisResult = await client.query(checkAmisQuery, [expediteur_id, destinataire_id]);

    if (amisResult.rows.length === 0) {
      return res.status(403).json({ error: 'Vous ne pouvez envoyer des messages qu’à vos amis.' });
    }

    // Insérer le message dans la base de données
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

    // Diffuser le message au destinataire via WebSocket
    broadcastToUser(destinataire_id, messageResult.rows[0]);

    res.status(201).json({
      message: 'Message envoyé avec succès.',
      details: messageResult.rows[0],
    });
  } catch (err) {
    console.error('Erreur lors de l\'envoi du message :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

// API pour récupérer l’historique des messages
app.post('/historique', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { utilisateur_id } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const expediteur_id = decoded.id;

    if (!utilisateur_id) {
      return res.status(400).json({ error: 'utilisateur_id est requis.' });
    }

    // Vérifier si les utilisateurs sont amis
    const checkAmisQuery = `
      SELECT * FROM Amis
      WHERE (utilisateur_id = $1 AND ami_id = $2 AND statut = 'ACCEPTE')
         OR (utilisateur_id = $2 AND ami_id = $1 AND statut = 'ACCEPTE');
    `;
    const amisResult = await client.query(checkAmisQuery, [expediteur_id, utilisateur_id]);

    if (amisResult.rows.length === 0) {
      return res.status(403).json({ error: 'Vous ne pouvez consulter des messages qu’avec vos amis.' });
    }

    // Récupérer l'historique des messages
    const messagesQuery = `
      SELECT * FROM Messagerie
      WHERE (expediteur_id = $1 AND destinataire_id = $2)
         OR (expediteur_id = $2 AND destinataire_id = $1)
      ORDER BY date_envoye ASC;
    `;
    const messagesResult = await client.query(messagesQuery, [expediteur_id, utilisateur_id]);

    res.status(200).json({
      message: 'Historique des messages récupéré avec succès.',
      historique: messagesResult.rows,
    });
  } catch (err) {
    console.error('Erreur lors de la récupération des messages :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

app.post('/dernier-messages', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const utilisateur_id = decoded.id; // ID de l'utilisateur connecté

    // Récupérer le dernier message de chaque conversation
    const derniersMessagesQuery = `
      SELECT m1.*
      FROM Messagerie m1
      INNER JOIN (
        SELECT 
          GREATEST(expediteur_id, destinataire_id) AS pair_user_1,
          LEAST(expediteur_id, destinataire_id) AS pair_user_2,
          MAX(date_envoye) AS last_message_date
        FROM Messagerie
        WHERE expediteur_id = $1 OR destinataire_id = $1
        GROUP BY pair_user_1, pair_user_2
      ) m2 ON (
        GREATEST(m1.expediteur_id, m1.destinataire_id) = m2.pair_user_1 AND
        LEAST(m1.expediteur_id, m1.destinataire_id) = m2.pair_user_2 AND
        m1.date_envoye = m2.last_message_date
      )
      ORDER BY m1.date_envoye DESC;
    `;
    const derniersMessagesResult = await client.query(derniersMessagesQuery, [utilisateur_id]);

    res.status(200).json({
      message: 'Derniers messages récupérés avec succès.',
      derniersMessages: derniersMessagesResult.rows,
    });
  } catch (err) {
    console.error('Erreur lors de la récupération des derniers messages :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});


// Exporter le module WebSocket et l'application Express
module.exports = { app, setupWebSocket };
